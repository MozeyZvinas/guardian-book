import { eq } from 'drizzle-orm'
import { Router } from 'express'
import {
  patchCardsBodySchema,
  profileCardsSchema,
  setProfileBodySchema,
  type LearnerCardsResponse,
  type ProfileCards,
  type ProfileResponse,
  type SetProfileResponse,
} from '@guardian-book/shared'
import { can } from '../../access/index.js'
import { recordAudit } from '../../audit/record.js'
import { requireActor, requireRole, type Actor } from '../../auth/session.js'
import type { Db } from '../../db/client.js'
import { profiles } from '../../db/schema.js'
import { appendEvent } from '../../evidence/append.js'
import { PromptSafetyError } from '../../gateway/promptSafety.js'
import type { Gateway } from '../../gateway/gateway.js'
import { verifiedCall } from '../../gateway/verifiedCall.js'
import { HttpError, notFound, parse, requestIdOf, uuidParam } from '../../lib/http.js'
import type { Logger } from '../../logger.js'
import { runChecks } from '../../verify/index.js'
import {
  EMPTY_CARDS,
  PROFILE_CARDS_MAX_TOKENS,
  PROFILE_CARDS_PROMPT_VERSION,
  PROFILE_CARDS_TIMEOUT_MS,
  buildProfileCardsSystem,
  buildProfileCardsUser,
  prototypeCards,
  sourceText,
} from './profileCards.v1.js'
import { recordRuns } from './recordRuns.js'

/**
 * Tell me about you (P0-02; spec 03 §8.1, §8.3; spec 05 §4.2 L0, L8).
 *
 * - `POST /api/me/profile`: one `profile_cards` model call through `verifiedCall`; the
 *   verifier's INFERENCE_FORBIDDEN rule must pass (re-ask up to 3 calls, then the cards are
 *   empty and labelled). No model → cards from the raw text, labelled PROTOTYPE.
 * - `PATCH /api/me/profile/cards`: edits, never a model call.
 * - `GET /api/me/profile`: the learner's own cards. The raw text is stored once and never
 *   served to anyone.
 * - `GET /api/learners/:id/cards`: the fields each role may read (spec 03 §8.2).
 */
export function profileRouter(db: Db, gateway: Gateway, logger: Logger): Router {
  const router = Router()

  router.get('/api/me/profile', requireRole('learner'), async (_req, res, next) => {
    try {
      const actor = requireActor(res)
      const profile = await loadProfile(db, actor.userId)
      const body: ProfileResponse = {
        cards: profile.cards,
        origin: profile.cards === null ? 'none' : profile.cardsModelRunId ? 'model' : 'student',
      }
      res.setHeader('Cache-Control', 'no-store')
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  router.post('/api/me/profile', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const answers = parse(setProfileBodySchema, req.body)
      const requestId = requestIdOf(req)

      let user: string
      try {
        user = buildProfileCardsUser(answers)
      } catch (err) {
        if (err instanceof PromptSafetyError) {
          throw new HttpError(400, 'personal_data', 'Leave out email addresses and phone numbers; they never go to the model.')
        }
        throw err
      }

      let payload: SetProfileResponse

      if (!gateway.configured) {
        // Spec 05 §4.2 L0: model not configured → cards from the raw text, labelled PROTOTYPE.
        // The same checks apply: a card that names mood or personality is refused.
        const candidate = prototypeCards(answers)
        const checks = runChecks('profile_cards', candidate, {})
        payload = checks.passed ? { cards: candidate, source: 'prototype', modelRunId: null } : { cards: EMPTY_CARDS, source: 'uncertain', modelRunId: null }
      } else {
        const result = await verifiedCall({
          gateway,
          purpose: 'profile_cards',
          promptVersion: PROFILE_CARDS_PROMPT_VERSION,
          system: buildProfileCardsSystem(),
          user,
          context: {},
          maxTokens: PROFILE_CARDS_MAX_TOKENS,
          timeoutMs: PROFILE_CARDS_TIMEOUT_MS,
        })
        const runIds = await recordRuns(
          db,
          { purpose: 'profile_cards', subjectType: 'profile', subjectId: actor.userId, promptVersion: PROFILE_CARDS_PROMPT_VERSION, fallbackModel: gateway.model },
          result.runs,
        )
        const lastRunId = runIds.at(-1) ?? null
        logger.info('profile cards', { requestId, status: result.status, calls: result.runs.length, costUsd: result.totalCostUsd, latencyMs: result.totalLatencyMs })
        if (result.status === 'accepted' && result.output) {
          payload = { cards: result.output, source: 'model', modelRunId: lastRunId }
        } else {
          // Fail closed: nothing invented. The learner fills the cards in by hand.
          payload = { cards: EMPTY_CARDS, source: result.status === 'exhausted' ? 'uncertain' : 'failed', modelRunId: lastRunId }
        }
      }

      await db.transaction(async (tx) => {
        await tx
          .update(profiles)
          .set({
            cards: payload.cards,
            cardsSourceText: sourceText(answers),
            cardsModelRunId: payload.source === 'model' ? payload.modelRunId : null,
          })
          .where(eq(profiles.userId, actor.userId))
        await appendEvent(tx, {
          learnerId: actor.userId,
          kind: 'profile_set',
          basis: 'none',
          payload: { source: payload.source, ...(payload.modelRunId ? { model_run: payload.modelRunId } : {}) },
        })
        await recordAudit(tx, {
          actorId: actor.userId,
          action: payload.source === 'model' || payload.source === 'prototype' ? 'profile.cards_set' : 'profile.cards_refused',
          subjectType: 'profile',
          subjectId: actor.userId,
          outcome: payload.source === 'model' || payload.source === 'prototype' ? 'ok' : 'refused',
          requestId,
        })
      })

      res.setHeader('Cache-Control', 'no-store')
      res.status(201).json(payload)
    } catch (err) {
      next(err)
    }
  })

  router.patch('/api/me/profile/cards', requireRole('learner'), async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const edits = parse(patchCardsBodySchema, req.body)
      const profile = await loadProfile(db, actor.userId)
      const merged: ProfileCards = { ...(profile.cards ?? EMPTY_CARDS), ...edits }
      // The cards stay about the work (spec 05 §8): the same rule the model must pass.
      const checks = runChecks('profile_cards', merged, {})
      if (!checks.passed) {
        const detail = checks.failed.map((check) => check.detail).join('; ')
        throw new HttpError(400, 'inference_forbidden', `Keep the cards about your work, not about you: ${detail}`)
      }
      await db.transaction(async (tx) => {
        await tx.update(profiles).set({ cards: merged }).where(eq(profiles.userId, actor.userId))
        await recordAudit(tx, {
          actorId: actor.userId,
          action: 'profile.cards_edited',
          subjectType: 'profile',
          subjectId: actor.userId,
          outcome: 'ok',
          requestId: requestIdOf(req),
        })
      })
      const body: ProfileResponse = { cards: merged, origin: profile.cardsModelRunId ? 'model' : 'student' }
      res.setHeader('Cache-Control', 'no-store')
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  /** The cards of a learner as this role may see them (spec 03 §8.2). Unknown or unlinked → 404. */
  router.get('/api/learners/:id/cards', async (req, res, next) => {
    try {
      const actor = requireActor(res)
      const learnerId = uuidParam(req, 'id')
      if (!(await can(db, actor, 'learner.read', { type: 'learner', id: learnerId }))) throw notFound()
      const [row] = await db
        .select({ userId: profiles.userId, role: profiles.role, nickname: profiles.nickname, cards: profiles.cards })
        .from(profiles)
        .where(eq(profiles.userId, learnerId))
        .limit(1)
      if (!row || row.role !== 'learner') throw notFound()
      const cards = parseCards(row.cards)
      const body: LearnerCardsResponse = {
        learner: { id: row.userId, nickname: row.nickname },
        cards: cards ? fieldsFor(actor, learnerId, cards) : null,
      }
      if (actor.role === 'admin') {
        await recordAudit(db, { actorId: actor.userId, action: 'access.admin_read', subjectType: 'profile_cards', subjectId: learnerId, outcome: 'ok', requestId: requestIdOf(req) })
      }
      res.setHeader('Cache-Control', 'no-store')
      res.json(body)
    } catch (err) {
      next(err)
    }
  })

  return router
}

/** Spec 03 §8.2: own → all; guardian → dream and subjects; teacher → subjects and hardest subject. */
export function fieldsFor(actor: Actor, learnerId: string, cards: ProfileCards): Partial<ProfileCards> {
  if (actor.role === 'learner' && actor.userId === learnerId) return cards
  if (actor.role === 'admin') return cards
  if (actor.role === 'guardian') return { dream: cards.dream, subjects: cards.subjects }
  if (actor.role === 'teacher') return { subjects: cards.subjects, hardest_subject: cards.hardest_subject }
  return {}
}

function parseCards(value: unknown): ProfileCards | null {
  const parsed = profileCardsSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

async function loadProfile(db: Db, userId: string): Promise<{ cards: ProfileCards | null; cardsModelRunId: string | null }> {
  const [row] = await db.select({ cards: profiles.cards, cardsModelRunId: profiles.cardsModelRunId }).from(profiles).where(eq(profiles.userId, userId)).limit(1)
  if (!row) throw notFound()
  return { cards: parseCards(row.cards), cardsModelRunId: row.cardsModelRunId }
}
