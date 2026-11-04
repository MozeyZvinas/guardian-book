import { createHash } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { DEFAULT_TRAINING_PERMISSION, MAX_TRANSLATION_CHARS, provenanceColumns, type Language, type TranslationView } from '@guardian-book/shared'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import type { Db, DbOrTx } from '../db/client.js'
import { profiles, translations } from '../db/schema.js'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { HttpError } from '../lib/http.js'
import { runModel } from '../modelRuns/index.js'
import { protectText, restoreText, type ProtectNames } from './placeholders.js'
import { TRANSLATE_MAX_TOKENS, TRANSLATE_PROMPT_VERSION, TRANSLATE_TIMEOUT_MS, buildTranslateSystem, buildTranslateUser } from './prompt.v1.js'

/**
 * Translations (brief B12 §3; D38). A parent-facing text is translated once per language
 * through `runModel` (caps and `model_runs` rows apply; the guardian's own calls) and
 * cached in `translations`, keyed on the hash of the source text. On read, the cached
 * translation is served; when none exists yet, a background job writes it and the English
 * is served with "Translation on its way". After three failed verified calls the English
 * stands for good (`unavailable`, recorded `exhausted` on the runs).
 *
 * Only text already safe for the parent in English comes through here: the guardian view
 * of the issued plan, sent notes, guardian-audience feedback and the intervention sentence.
 */

export type TranslateDeps = Pick<PracticeDeps, 'db' | 'gateway' | 'logger' | 'limits' | 'now' | 'jobs'>

export const SOURCE_KINDS = ['plan_gap', 'plan_action', 'plan_celebrate', 'note', 'review_feedback', 'intervention'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export interface TranslationSource {
  kind: SourceKind
  /** The row the text came from (a UUID; becomes `model_runs.subject_id`). */
  id: string
  /** The English, exactly as the guardian screen shows it. */
  text: string
  /** The names to replace with placeholders before the prompt (D24). */
  names: ProtectNames
}

export type TranslateOutcome = 'ready' | 'unavailable' | 'failed' | 'cached'

/** The cache key: the kind and the trimmed text, so two guardians share one translation. */
export function sourceHash(kind: SourceKind, text: string): string {
  return createHash('sha256').update(`${kind}\n${text.trim()}`).digest('hex')
}

export const translateJobKey = (hash: string, language: Language): string => `translate:${language}:${hash}`

// ── the guardian's language ───────────────────────────────────────────────────────────────

export async function preferredLanguage(db: DbOrTx, userId: string): Promise<Language> {
  const [row] = await db.select({ language: profiles.preferredLanguage }).from(profiles).where(eq(profiles.userId, userId)).limit(1)
  return row?.language ?? 'en'
}

export async function setPreferredLanguage(db: Db, actor: Actor, language: Language, requestId?: string): Promise<Language> {
  return db.transaction(async (tx) => {
    const [updated] = await tx.update(profiles).set({ preferredLanguage: language }).where(eq(profiles.userId, actor.userId)).returning({ language: profiles.preferredLanguage })
    if (!updated) throw new HttpError(404, 'not_found', 'Not found.')
    await recordAudit(tx, { actorId: actor.userId, action: 'guardian.language_set', subjectType: 'profile', subjectId: actor.userId, outcome: 'ok', requestId: requestId ?? null })
    return updated.language
  })
}

// ── the cache ─────────────────────────────────────────────────────────────────────────────

interface CachedRow {
  text: string | null
  status: 'ready' | 'unavailable'
}

async function cached(db: DbOrTx, hash: string, language: Language): Promise<CachedRow | null> {
  const [row] = await db
    .select({ text: translations.text, status: translations.status })
    .from(translations)
    .where(and(eq(translations.sourceHash, hash), eq(translations.language, language)))
    .limit(1)
  return row ?? null
}

const view = (language: Language, row: CachedRow): TranslationView =>
  row.status === 'ready' && row.text !== null ? { language, status: 'ready', text: row.text } : { language, status: 'unavailable', text: null }

/**
 * The translation state of one source for one guardian: the cached translation, or
 * `pending` with a background job started (at most one per source and language at a
 * time), or `unavailable`. Null when the guardian reads in English.
 */
export async function translationFor(deps: TranslateDeps, source: TranslationSource, language: Language, guardianId: string): Promise<TranslationView | null> {
  if (language === 'en') return null
  if (source.text.trim().length === 0) return { language, status: 'unavailable', text: null }
  const hash = sourceHash(source.kind, source.text)
  const row = await cached(deps.db, hash, language)
  if (row) return view(language, row)
  if (!deps.gateway.configured) return { language, status: 'unavailable', text: null }
  deps.jobs.start(translateJobKey(hash, language), async () => {
    await translateNow(deps, source, language, guardianId)
  })
  return { language, status: 'pending', text: null }
}

interface StoreInput {
  source: TranslationSource
  language: Language
  hash: string
  text: string | null
  status: 'ready' | 'unavailable'
  modelRunId: string | null
  model: string
  provider: string
}

/** One row per source hash and language; a concurrent writer's row wins and this one is dropped. */
async function store(db: DbOrTx, input: StoreInput): Promise<string | null> {
  const provenance = input.modelRunId
    ? provenanceColumns('model_output', { provider: input.provider, model: input.model, version: TRANSLATE_PROMPT_VERSION, model_run_id: input.modelRunId })
    : // Refused before any call (the safety guard): the server decided, no model text exists.
      { provenance: 'synthetic_self_generated' as const, provenanceDetail: null, trainingPermission: DEFAULT_TRAINING_PERMISSION }
  const [row] = await db
    .insert(translations)
    .values({
      sourceKind: input.source.kind,
      sourceId: input.source.id,
      language: input.language,
      sourceHash: input.hash,
      text: input.text,
      status: input.status,
      modelRunId: input.modelRunId,
      ...provenance,
    })
    .onConflictDoNothing({ target: [translations.sourceHash, translations.language] })
    .returning({ id: translations.id })
  return row?.id ?? null
}

/** Translates one source now (the background job's body). Never throws past the job registry. */
export async function translateNow(deps: TranslateDeps, source: TranslationSource, language: Language, guardianId: string): Promise<TranslateOutcome> {
  const { db, logger } = deps
  const hash = sourceHash(source.kind, source.text)
  if (await cached(db, hash, language)) return 'cached'
  const protectedText = protectText(source.text, source.names)
  const base = { source, language, hash, model: deps.gateway.model, provider: 'meta' }

  let user: string
  try {
    user = buildTranslateUser({ language, text: protectedText.text })
  } catch (err) {
    if (!(err instanceof PromptSafetyError)) throw err
    // Fail closed: an email or phone number in the English is never sent; the English stands.
    logger.warn('translate: prompt refused by the safety guard', { kind: source.kind, sourceId: source.id, reason: err.reason })
    const id = await store(db, { ...base, text: null, status: 'unavailable', modelRunId: null })
    await recordAudit(db, { actorId: null, action: 'translation.refused', subjectType: 'translation', subjectId: id, outcome: 'refused' })
    return 'unavailable'
  }

  let outcome
  try {
    outcome = await runModel(
      { db, gateway: deps.gateway, logger, limits: deps.limits, now: deps.now },
      {
        userId: guardianId,
        purpose: 'translate',
        subjectType: source.kind,
        subjectId: source.id,
        promptVersion: TRANSLATE_PROMPT_VERSION,
        system: buildTranslateSystem(),
        user,
        context: { sourceText: protectedText.text, placeholders: protectedText.placeholders, language },
        maxTokens: TRANSLATE_MAX_TOKENS,
        timeoutMs: TRANSLATE_TIMEOUT_MS,
      },
    )
  } catch (err) {
    // A cap or a gateway failure: no row, so the next read tries again (bounded by the caps).
    if (err instanceof HttpError && err.code === 'budget_exhausted') {
      logger.warn('translate: refused by cap', { kind: source.kind, sourceId: source.id, language })
    } else {
      logger.error('translate: run failed', { kind: source.kind, sourceId: source.id, language, err })
    }
    return 'failed'
  }

  const { result, lastRunId } = outcome
  const lastRun = [...result.runs].reverse().find((run) => run.requestId) ?? result.runs[result.runs.length - 1]
  const model = lastRun?.model ?? deps.gateway.model
  const provider = result.provenance?.provider ?? 'meta'

  if (result.status === 'accepted' && result.output && lastRunId) {
    const text = restoreText(result.output.text, protectedText).trim()
    if (text.length === 0 || text.length > MAX_TRANSLATION_CHARS) {
      const id = await store(db, { ...base, model, provider, text: null, status: 'unavailable', modelRunId: lastRunId })
      await recordAudit(db, { actorId: null, action: 'translation.refused', subjectType: 'translation', subjectId: id, outcome: 'refused' })
      return 'unavailable'
    }
    const id = await store(db, { ...base, model, provider, text, status: 'ready', modelRunId: lastRunId })
    await recordAudit(db, { actorId: null, action: 'translation.created', subjectType: 'translation', subjectId: id, outcome: 'ok' })
    logger.info('translation ready', { kind: source.kind, sourceId: source.id, language, runId: lastRunId })
    return 'ready'
  }
  if (result.status === 'exhausted') {
    // Three verified calls, still failing: the English stands; the runs say `exhausted`.
    const id = await store(db, { ...base, model, provider, text: null, status: 'unavailable', modelRunId: lastRunId })
    await recordAudit(db, { actorId: null, action: 'translation.refused', subjectType: 'translation', subjectId: id, outcome: 'refused' })
    logger.warn('translate: exhausted; the English stands', { kind: source.kind, sourceId: source.id, language, runs: result.runs.length })
    return 'unavailable'
  }
  logger.warn('translate: no answer from the gateway', { kind: source.kind, sourceId: source.id, language, error: result.error?.code ?? null })
  return 'failed'
}
