import { and, asc, desc, eq } from 'drizzle-orm'
import { ASK_YOUR_TEACHER, MAX_INPUT_TEXT, type AskBody, type AskResponse } from '@guardian-book/shared'
import { can } from '../access/index.js'
import { recordAudit } from '../audit/record.js'
import type { StoredStep } from '../assessment/service.js'
import { hintsVisible, modelNotConfigured } from '../assessment/service.js'
import type { Actor } from '../auth/session.js'
import type { DbOrTx } from '../db/client.js'
import { assessments, attempts, guidelineSteps, items, modelRuns } from '../db/schema.js'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { scrubContacts } from '../inputs/text.js'
import { HttpError, notFound } from '../lib/http.js'
import { runModel } from '../modelRuns/index.js'
import {
  STEP_HINT_DEADLINE_MS,
  STEP_HINT_MAX_TOKENS,
  STEP_HINT_PROMPT_VERSION,
  STEP_HINT_TIMEOUT_MS,
  buildStepHintSystem,
  buildStepHintUser,
  stepHintContext,
  type StepHintPromptInput,
} from './prompt.v1.js'

/**
 * Ask about a step (brief B13 §3): `POST /api/attempts/:id/ask {question, stepNo?}`.
 * Owner only. The step must be one the work check found lost on a proposed assessment;
 * independent and retention attempts are refused until they are assessed (no hints in
 * independent mode). One `runModel` call per ask (purpose `step_hint`, at most three model
 * calls with re-asks); when nothing verified comes back the learner sees "Ask your teacher
 * about this step." and nothing else. Every call counts against the learner's daily cap.
 */

export const MAX_HINT_CALLS = 3

export const noHintsInIndependentMode = () =>
  new HttpError(409, 'no_hints_in_independent_mode', 'No hints while you check it alone. Submit it first; then you can ask.')
export const nothingToAsk = () =>
  new HttpError(409, 'nothing_to_ask', 'Check this one first. Once a step slips, you can ask about it here.')
export const stepNotLost = () => new HttpError(409, 'step_not_lost', 'That step was earned. Ask about a step that slipped.')

const asSteps = (value: unknown): StoredStep[] => (Array.isArray(value) ? (value as StoredStep[]) : [])

/** The learner's working as the accepted work check transcribed it (typed or photo), else the typed answer. */
async function workingText(db: DbOrTx, attemptId: string, answerText: string | null): Promise<string | null> {
  const [run] = await db
    .select({ output: modelRuns.output })
    .from(modelRuns)
    .where(and(eq(modelRuns.purpose, 'assess'), eq(modelRuns.subjectId, attemptId), eq(modelRuns.status, 'accepted')))
    .orderBy(desc(modelRuns.createdAt))
    .limit(1)
  const transcription = (run?.output as { transcription?: unknown } | null)?.transcription
  const text = typeof transcription === 'string' && transcription.trim().length > 0 ? transcription : answerText
  return text ? scrubContacts(text).slice(0, MAX_INPUT_TEXT) : null
}

export async function askAboutStep(deps: PracticeDeps, actor: Actor, attemptId: string, body: AskBody, requestId: string | null): Promise<AskResponse> {
  const { db } = deps
  if (!(await can(db, actor, 'attempt.ask', { type: 'attempt', id: attemptId }))) throw notFound()
  const [row] = await db
    .select({ attempt: attempts, item: items, assessment: assessments })
    .from(attempts)
    .innerJoin(items, eq(items.id, attempts.itemId))
    .leftJoin(assessments, eq(assessments.attemptId, attempts.id))
    .where(eq(attempts.id, attemptId))
    .limit(1)
  if (!row) throw notFound()
  const { attempt, item, assessment } = row

  const refuse = async (err: HttpError): Promise<never> => {
    await recordAudit(db, { actorId: actor.userId, action: 'attempt.ask_refused', subjectType: 'attempt', subjectId: attemptId, outcome: 'refused', requestId })
    throw err
  }

  // No hints in independent mode (spec 03 §9.1; brief B13 §3): the same rule that withholds the work check's hints.
  if (!hintsVisible(attempt.mode, assessment !== null)) return refuse(noHintsInIndependentMode())
  if (!assessment || assessment.status !== 'proposed') return refuse(nothingToAsk())
  const lost = asSteps(assessment.steps).filter((step) => step.awarded < step.available)
  if (lost.length === 0) return refuse(nothingToAsk())
  const stepNo = body.stepNo ?? lost[0]?.step_no ?? 0
  const target = lost.find((step) => step.step_no === stepNo)
  if (!target) return refuse(stepNotLost())

  const steps = await db.select().from(guidelineSteps).where(eq(guidelineSteps.itemId, item.id)).orderBy(asc(guidelineSteps.stepNo))
  const guideline = steps.find((step) => step.stepNo === stepNo)
  if (!guideline) return refuse(stepNotLost())
  if (!deps.gateway.configured) throw modelNotConfigured()

  const promptInput: StepHintPromptInput = {
    item: { slug: item.slug, prompt_md: item.promptMd, max_marks: item.maxMarks },
    step: {
      step_id: `S${guideline.stepNo}`,
      step_no: guideline.stepNo,
      kind: guideline.stepType,
      criterion: guideline.criterion,
      marks: guideline.marks,
      notes: guideline.notes,
      feedback: target.feedback || null,
    },
    working: await workingText(db, attemptId, attempt.answerText),
    question: scrubContacts(body.question),
  }
  let user: string
  try {
    user = buildStepHintUser(promptInput)
  } catch (err) {
    if (err instanceof PromptSafetyError) {
      deps.logger.warn('ask: prompt refused by the safety guard', { attemptId, reason: err.reason })
      return refuse(new HttpError(400, 'question_unsafe', 'Leave out contact details and ask again.'))
    }
    throw err
  }
  // Every accuracy criterion on the item is a memo value the hint must not state.
  const memoValues = steps.filter((step) => step.stepType !== 'M').map((step) => step.criterion)
  const context = stepHintContext(
    steps.map((step) => ({ step_id: `S${step.stepNo}`, kind: step.stepType, marks: step.marks, expected: null })),
    memoValues,
  )

  const { result } = await runModel(deps, {
    userId: actor.userId,
    purpose: 'step_hint',
    subjectType: 'attempt',
    subjectId: attemptId,
    promptVersion: STEP_HINT_PROMPT_VERSION,
    system: buildStepHintSystem(),
    user,
    context,
    maxTokens: STEP_HINT_MAX_TOKENS,
    timeoutMs: STEP_HINT_TIMEOUT_MS,
    maxCalls: MAX_HINT_CALLS,
    signal: AbortSignal.timeout(STEP_HINT_DEADLINE_MS),
  })
  await recordAudit(db, { actorId: actor.userId, action: 'attempt.asked', subjectType: 'attempt', subjectId: attemptId, outcome: result.status === 'failed' ? 'error' : 'ok', requestId })

  if (result.status === 'accepted' && result.output) {
    return { status: 'accepted', stepNo, hint: result.output.hint, calls: result.runs.length, message: null }
  }
  deps.logger.info('ask: no verified hint', { attemptId, status: result.status, calls: result.runs.length, error: result.error?.code ?? null })
  return { status: result.status, stepNo, hint: null, calls: result.runs.length, message: ASK_YOUR_TEACHER }
}
