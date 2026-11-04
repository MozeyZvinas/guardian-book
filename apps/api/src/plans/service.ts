import { and, asc, count, desc, eq, gte, inArray, lt, or, sql } from 'drizzle-orm'
import {
  DEFAULT_TRAINING_PERMISSION,
  dayOf,
  daysBetween,
  planAgentTurnSchema,
  planGuardianViewSchema,
  planLearnerViewSchema,
  provenanceColumns,
  skillLabel,
  skillLabels,
  uuidv7,
  type CheckAloneResponse,
  type CheckMode,
  type GuardianWeekResponse,
  type LearnerPlanView,
  type PlanOutput,
  type SupportGivenResponse,
  type TeacherMessage,
} from '@guardian-book/shared'
import { recordAudit } from '../audit/record.js'
import type { Actor } from '../auth/session.js'
import type { Db, DbOrTx } from '../db/client.js'
import {
  assessments,
  attempts,
  calendarEvents,
  classMembers,
  guidelineApprovals,
  guidelineSteps,
  helpPlans,
  interventions,
  items,
  learningEvents,
  notes,
  profiles,
  resources,
  reviewFeedback,
  reviews,
} from '../db/schema.js'
import { appendEvent } from '../evidence/append.js'
import type { PracticeDeps } from '../inputs/deps.js'
import { HttpError, notFound } from '../lib/http.js'
import { runModel } from '../modelRuns/index.js'
import { runPlanAgent, type AgentIO, type AgentStepResult, type TraceStep } from './agent.js'
import { PLAN_AGENT_DEADLINE_MS, PLAN_AGENT_MAX_TOKENS, PLAN_AGENT_PROMPT_VERSION, PLAN_AGENT_STEP_TIMEOUT_MS, buildPlanAgentSystem, type PlanTask } from './prompt.v1.js'
import { templatePlan } from './template.js'
import { buildPlanToolkit } from './tools.js'

/**
 * The Help Plan (P0-08; spec 03 §8.1 `help_plans`, §8.3, §8.4; brief B06 §4) and the
 * guardian's week (P0-09; spec 05 §4.3 G1, §9).
 *
 * Issued the same day a gap is detected (an `assessed` event with a lost step) and weekly
 * (a stale plan is refreshed on the next read). One `issued` plan per learner; a new one
 * supersedes. Every agent step is one `runModel` call (caps, `model_runs` rows); the
 * verifier gates every turn. When the agent cannot finish, the safe template plan stands
 * in, stored as `synthetic_self_generated`, never as model text.
 */

export const planJobKey = (learnerId: string): string => `plan:${learnerId}`

export const noPlanYet = () => new HttpError(409, 'no_plan', 'There is no plan for this week yet.')

const DAY_MS = 24 * 60 * 60 * 1000

/** The Monday of the week holding `day` (YYYY-MM-DD). */
export function weekStartOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  const back = (date.getUTCDay() + 6) % 7
  return new Date(date.getTime() - back * DAY_MS).toISOString().slice(0, 10)
}

export type PlanTrigger = 'gap' | 'weekly'
export type IssueOutcome = 'issued' | 'template' | 'not_configured' | 'no_evidence'

type PlanRow = typeof helpPlans.$inferSelect

/** The latest `assessed` event that lost this skill, newest first. */
export async function latestGapEvent(db: DbOrTx, learnerId: string, gapSkillTag: string): Promise<{ id: string; attemptId: string | null } | null> {
  const [row] = await db
    .select({ id: learningEvents.id, attemptId: learningEvents.attemptId })
    .from(learningEvents)
    .where(and(eq(learningEvents.learnerId, learnerId), eq(learningEvents.kind, 'assessed'), sql`${learningEvents.payload}->'skills_lost' ? ${gapSkillTag}`))
    .orderBy(desc(learningEvents.occurredAt), desc(learningEvents.id))
    .limit(1)
  return row ?? null
}

/** The most recent lost skill in the learner's evidence, for a weekly refresh with no plan to copy from. */
async function latestLostSkill(db: DbOrTx, learnerId: string): Promise<string | null> {
  const [row] = await db
    .select({ skillTag: learningEvents.skillTag })
    .from(learningEvents)
    .where(and(eq(learningEvents.learnerId, learnerId), eq(learningEvents.kind, 'assessed'), sql`jsonb_array_length(coalesce(${learningEvents.payload}->'skills_lost', '[]'::jsonb)) > 0`))
    .orderBy(desc(learningEvents.occurredAt))
    .limit(1)
  return row?.skillTag ?? null
}

async function latestIssued(db: DbOrTx, learnerId: string): Promise<PlanRow | null> {
  const [row] = await db
    .select()
    .from(helpPlans)
    .where(and(eq(helpPlans.learnerId, learnerId), eq(helpPlans.status, 'issued')))
    .orderBy(desc(helpPlans.createdAt))
    .limit(1)
  return row ?? null
}

/** Any plan row (issued, superseded, template) written for this learner today, SAST. */
async function planWrittenToday(db: DbOrTx, learnerId: string, today: string): Promise<boolean> {
  const [row] = await db.select({ createdAt: helpPlans.createdAt }).from(helpPlans).where(eq(helpPlans.learnerId, learnerId)).orderBy(desc(helpPlans.createdAt)).limit(1)
  return Boolean(row && dayOf(row.createdAt) === today)
}

interface StorePlanInput {
  id: string
  learnerId: string
  weekStart: string
  plan: PlanOutput
  /** Alias → ID maps, or identity for a template plan written with real IDs. */
  evidenceId: (ref: string) => string | undefined
  resourceId: (ref: string) => string | undefined
  trace: TraceStep[]
  modelRunId: string | null
  source: 'model' | 'template'
  modelId: string
  trigger: PlanTrigger
  templateReason?: string
}

function mapRefs<T extends { evidence_ids: string[] }>(statement: T, lookup: (ref: string) => string | undefined): T {
  return { ...statement, evidence_ids: [...new Set(statement.evidence_ids.map(lookup).filter((id): id is string => Boolean(id)))] }
}

async function storePlan(db: Db, input: StorePlanInput): Promise<void> {
  const { plan } = input
  const learnerView = { tonight_step: mapRefs(plan.learner_view.tonight_step, input.evidenceId), hint: plan.learner_view.hint, why_it_matters: mapRefs(plan.learner_view.why_it_matters, input.evidenceId) }
  const guardianView = {
    gap: mapRefs(plan.guardian_view.gap, input.evidenceId),
    one_action: mapRefs(plan.guardian_view.one_action, input.evidenceId),
    something_to_celebrate: mapRefs(plan.guardian_view.something_to_celebrate, input.evidenceId),
  }
  const teacherView = { who_shares_this_gap: mapRefs(plan.teacher_view.who_shares_this_gap, input.evidenceId), suggested_intervention: mapRefs(plan.teacher_view.suggested_intervention, input.evidenceId) }
  const evidenceEventIds = [...new Set(plan.evidence_event_ids.map(input.evidenceId).filter((id): id is string => Boolean(id)))]
  const resourceIds = [...new Set(plan.resource_ids.map(input.resourceId).filter((id): id is string => Boolean(id)))]
  if (evidenceEventIds.length === 0) throw new Error('a plan must cite at least one evidence event')

  const provenance =
    input.source === 'model' && input.modelRunId
      ? provenanceColumns('model_output', { provider: 'meta', model: input.modelId, version: PLAN_AGENT_PROMPT_VERSION, model_run_id: input.modelRunId })
      : // The template is written by the server from evidence it holds: no model text, no human author.
        { provenance: 'synthetic_self_generated' as const, provenanceDetail: null, trainingPermission: DEFAULT_TRAINING_PERMISSION }

  await db.transaction(async (tx) => {
    await tx.update(helpPlans).set({ status: 'superseded' }).where(and(eq(helpPlans.learnerId, input.learnerId), eq(helpPlans.status, 'issued')))
    await tx.insert(helpPlans).values({
      id: input.id,
      learnerId: input.learnerId,
      weekStart: input.weekStart,
      gapSkillTag: plan.gap_skill_tag,
      learnerView,
      guardianView,
      teacherView,
      evidenceEventIds,
      resourceIds,
      agentTrace: input.templateReason ? [...input.trace, { step: input.trace.length + 1, tool: 'template', status: 'plan', reason: input.templateReason, summary: 'safe template plan', modelRunId: input.modelRunId }] : input.trace,
      modelRunId: input.modelRunId,
      status: 'issued',
      ...provenance,
    })
    await appendEvent(tx, {
      learnerId: input.learnerId,
      kind: 'plan_issued',
      skillTag: plan.gap_skill_tag,
      basis: 'none',
      payload: { plan_id: input.id, source: input.source, trigger: input.trigger, steps: input.trace.length },
    })
    await recordAudit(tx, {
      actorId: null,
      action: input.source === 'model' ? 'plan.issued' : 'plan.template_issued',
      subjectType: 'help_plan',
      subjectId: input.id,
      outcome: 'ok',
    })
  })
}

/** Runs the agent for one learner and one gap, and stores what came out. Never throws past the job registry. */
export async function issuePlan(deps: PracticeDeps, input: { learnerId: string; gapSkillTag: string; trigger: PlanTrigger }): Promise<IssueOutcome> {
  const { db, logger } = deps
  const gateway = deps.loop.agentGateway
  const now = deps.now()
  const today = dayOf(now)
  const weekStart = weekStartOf(today)
  const planId = uuidv7()
  const labels = skillLabels(input.gapSkillTag)

  if (!gateway.configured) {
    await recordAudit(db, { actorId: null, action: 'plan.not_issued', subjectType: 'learner', subjectId: input.learnerId, outcome: 'refused' })
    return 'not_configured'
  }

  const toolkit = buildPlanToolkit(db, input.learnerId, input.gapSkillTag, now)
  const deadline = AbortSignal.timeout(PLAN_AGENT_DEADLINE_MS)
  const task: PlanTask = { gapSkillTag: input.gapSkillTag, labels, today, weekStart }
  const io: AgentIO = {
    tools: toolkit.tools,
    known: toolkit.known,
    step: async ({ user, context }): Promise<AgentStepResult> => {
      try {
        const { result, lastRunId } = await runModel(
          { db, gateway, logger, limits: deps.limits, now: deps.now },
          {
            userId: input.learnerId,
            purpose: 'plan',
            subjectType: 'help_plan',
            subjectId: planId,
            promptVersion: PLAN_AGENT_PROMPT_VERSION,
            system: buildPlanAgentSystem(),
            user,
            context,
            maxTokens: PLAN_AGENT_MAX_TOKENS,
            timeoutMs: PLAN_AGENT_STEP_TIMEOUT_MS,
            signal: deadline,
          },
        )
        const last = result.runs[result.runs.length - 1]
        const parsed = planAgentTurnSchema.safeParse(last?.output)
        return {
          status: result.status,
          turn: result.status === 'accepted' ? result.output : parsed.success ? parsed.data : null,
          failedCodes: (last?.checks ?? []).filter((check) => !check.passed).map((check) => check.code),
          modelRunId: lastRunId,
        }
      } catch (err) {
        logger.warn('plan agent: step refused or failed', { learnerId: input.learnerId, err: err instanceof Error ? err.message : String(err) })
        return { status: 'failed', turn: null, failedCodes: [], modelRunId: null }
      }
    },
  }

  const outcome = await runPlanAgent(task, io, deps.loop.planMaxSteps)
  logger.info('plan agent', { learnerId: input.learnerId, kind: outcome.kind, steps: outcome.trace.length, trigger: input.trigger, ...(outcome.kind === 'template' ? { reason: outcome.reason } : {}) })

  if (outcome.kind === 'plan' && outcome.modelRunId) {
    await storePlan(db, {
      id: planId,
      learnerId: input.learnerId,
      weekStart,
      plan: outcome.plan,
      evidenceId: (ref) => toolkit.evidenceByAlias.get(ref),
      resourceId: (ref) => toolkit.resourceByAlias.get(ref),
      trace: outcome.trace,
      modelRunId: outcome.modelRunId,
      source: 'model',
      modelId: gateway.model,
      trigger: input.trigger,
    })
    return 'issued'
  }

  // The template cites the evidence the gap came from; without any evidence there is no plan.
  const gapEvent = await latestGapEvent(db, input.learnerId, input.gapSkillTag)
  if (!gapEvent) {
    await recordAudit(db, { actorId: null, action: 'plan.not_issued', subjectType: 'learner', subjectId: input.learnerId, outcome: 'refused' })
    return 'no_evidence'
  }
  await storePlan(db, {
    id: planId,
    learnerId: input.learnerId,
    weekStart,
    plan: templatePlan({ gapSkillTag: input.gapSkillTag, labels, evidenceIds: [gapEvent.id] }),
    evidenceId: (ref) => ref,
    resourceId: (ref) => ref,
    trace: outcome.trace,
    modelRunId: outcome.modelRunId,
    source: 'template',
    modelId: gateway.model,
    trigger: input.trigger,
    templateReason: outcome.kind === 'template' ? outcome.reason : 'no_model_run',
  })
  return 'template'
}

/** Same-day trigger (brief B06 §4): once per learner, per gap, per day; runs in the background. */
export async function schedulePlanForGap(deps: PracticeDeps, learnerId: string, gapSkillTag: string): Promise<boolean> {
  const today = dayOf(deps.now())
  const [existing] = await deps.db
    .select({ createdAt: helpPlans.createdAt })
    .from(helpPlans)
    .where(and(eq(helpPlans.learnerId, learnerId), eq(helpPlans.gapSkillTag, gapSkillTag), eq(helpPlans.status, 'issued')))
    .orderBy(desc(helpPlans.createdAt))
    .limit(1)
  if (existing && dayOf(existing.createdAt) === today) return false
  return deps.jobs.start(planJobKey(learnerId), async () => {
    await issuePlan(deps, { learnerId, gapSkillTag, trigger: 'gap' })
  })
}

/** Weekly trigger: a plan from an earlier week is refreshed in the background on the next read. */
export async function refreshWeeklyIfStale(deps: PracticeDeps, learnerId: string): Promise<void> {
  if (!deps.loop.agentGateway.configured || deps.jobs.isRunning(planJobKey(learnerId))) return
  const today = dayOf(deps.now())
  if (await planWrittenToday(deps.db, learnerId, today)) return
  const current = await latestIssued(deps.db, learnerId)
  const gap = current ? current.gapSkillTag : await latestLostSkill(deps.db, learnerId)
  if (!gap) return
  if (current && current.weekStart >= weekStartOf(today)) return
  deps.jobs.start(planJobKey(learnerId), async () => {
    await issuePlan(deps, { learnerId, gapSkillTag: gap, trigger: current ? 'weekly' : 'gap' })
  })
}

// ── reading ───────────────────────────────────────────────────────────────────────────────

const sourceOf = (row: PlanRow): 'model' | 'template' => (row.provenance === 'model_generated' ? 'model' : 'template')

/** The learner's own view of the current plan (spec 03 §8.2: own `learner_view`). */
export async function learnerPlan(db: DbOrTx, learnerId: string): Promise<LearnerPlanView | null> {
  const row = await latestIssued(db, learnerId)
  if (!row) return null
  const view = planLearnerViewSchema.safeParse(row.learnerView)
  if (!view.success) return null
  const gapEvent = await latestGapEvent(db, learnerId, row.gapSkillTag)
  return {
    id: row.id,
    weekStart: row.weekStart,
    gapSkillTag: row.gapSkillTag,
    gapLabel: skillLabel(row.gapSkillTag, 'learner'),
    source: sourceOf(row),
    tonightStep: view.data.tonight_step.text,
    hint: view.data.hint,
    whyItMatters: view.data.why_it_matters.text,
    attemptId: gapEvent?.attemptId ?? null,
    evidenceCount: row.evidenceEventIds.length,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * Check it alone (P0-05): the approved item, in a class the learner belongs to, with the
 * most guideline steps tagged with the skill, excluding items already attempted.
 */
export async function matchItemForCheck(db: DbOrTx, learnerId: string, skillTag: string, mode: CheckMode, fromAttemptId: string | null): Promise<CheckAloneResponse> {
  const label = skillLabel(skillTag, 'learner')
  const candidates = await db
    .select({ item: items, matching: count(guidelineSteps.id) })
    .from(items)
    .innerJoin(guidelineApprovals, and(eq(guidelineApprovals.itemId, items.id), eq(guidelineApprovals.itemRevision, items.revision)))
    .innerJoin(classMembers, and(eq(classMembers.classId, guidelineApprovals.classId), eq(classMembers.learnerId, learnerId)))
    .leftJoin(guidelineSteps, and(eq(guidelineSteps.itemId, items.id), eq(guidelineSteps.skillTag, skillTag)))
    .where(eq(items.status, 'approved'))
    .groupBy(items.id)
  const attempted = new Set((await db.select({ itemId: attempts.itemId }).from(attempts).where(eq(attempts.learnerId, learnerId))).map((r) => r.itemId))
  const best = candidates
    .filter((c) => Number(c.matching) > 0 && !attempted.has(c.item.id))
    .sort((a, b) => Number(b.matching) - Number(a.matching) || (a.item.slug < b.item.slug ? -1 : 1))[0]

  let why = mode === 'retention' ? `Two days ago you did ${label} on your own. One question, no hints, to see if it stuck.` : `One more like it, on your own: ${label}. No hints until you submit.`
  if (fromAttemptId) {
    const [row] = await db.select({ steps: assessments.steps, topic: items.topic }).from(assessments).innerJoin(attempts, eq(attempts.id, assessments.attemptId)).innerJoin(items, eq(items.id, attempts.itemId)).where(eq(assessments.attemptId, fromAttemptId)).limit(1)
    const lost = (Array.isArray(row?.steps) ? (row?.steps as Array<{ step_no: number; awarded: number; available: number }>) : []).find((s) => s.awarded < s.available)
    if (row && lost) why = `Why this: you lost step ${lost.step_no} on "${row.topic}" last time. ${why}`
  }

  return {
    item: best
      ? { id: best.item.id, slug: best.item.slug, topic: best.item.topic, promptMd: best.item.promptMd, maxMarks: best.item.maxMarks, revision: best.item.revision, skillTags: best.item.skillTags, matchingSteps: Number(best.matching) }
      : null,
    skillTag,
    skillLabel: label,
    mode,
    why,
    fromAttemptId,
  }
}

// ── the guardian's week (P0-09) ───────────────────────────────────────────────────────────

/** Spec 03 §9.1: "Teacher-reviewed" for an approved or revised AI draft; the teacher's name for her own words. */
export function teacherLabel(origin: 'ai_suggested' | 'teacher_approved' | 'teacher_added' | 'teacher_revised', teacherNickname: string): string {
  return origin === 'teacher_added' ? teacherNickname : 'Teacher-reviewed'
}

async function supportGivenAt(db: DbOrTx, learnerId: string, planId: string): Promise<Date | null> {
  const [row] = await db
    .select({ occurredAt: learningEvents.occurredAt })
    .from(learningEvents)
    .where(and(eq(learningEvents.learnerId, learnerId), eq(learningEvents.kind, 'support_given'), sql`${learningEvents.payload}->>'plan_id' = ${planId}`))
    .orderBy(asc(learningEvents.occurredAt))
    .limit(1)
  return row?.occurredAt ?? null
}

/** Everything a guardian may read about this week: never an attempt, an answer or an image. */
export async function guardianWeek(deps: PracticeDeps, actor: Actor, learnerId: string): Promise<GuardianWeekResponse> {
  const { db } = deps
  const now = deps.now()
  const today = dayOf(now)
  const weekStart = weekStartOf(today)
  const [learner] = await db.select({ id: profiles.userId, nickname: profiles.nickname, role: profiles.role }).from(profiles).where(eq(profiles.userId, learnerId)).limit(1)
  if (!learner || learner.role !== 'learner') throw notFound()

  // Effort: the days this week with checked work, pieces of work, topics (never the work itself).
  const weekStartAt = new Date(`${weekStart}T00:00:00+02:00`)
  const weekEndAt = new Date(weekStartAt.getTime() + 7 * DAY_MS)
  const work = await db
    .select({ createdAt: attempts.createdAt, topic: items.topic })
    .from(attempts)
    .innerJoin(items, eq(items.id, attempts.itemId))
    .where(and(eq(attempts.learnerId, learnerId), gte(attempts.createdAt, weekStartAt), lt(attempts.createdAt, weekEndAt)))
  const dots = Array.from({ length: 7 }, () => false)
  for (const piece of work) {
    const index = daysBetween(weekStart, dayOf(piece.createdAt))
    if (index >= 0 && index < 7) dots[index] = true
  }
  const topics = [...new Set(work.map((piece) => piece.topic))]

  // What's coming: the next confirmed event, the learner's own or their class's.
  const classIds = (await db.select({ classId: classMembers.classId }).from(classMembers).where(eq(classMembers.learnerId, learnerId))).map((r) => r.classId)
  const [next] = await db
    .select({ title: calendarEvents.title, onDate: calendarEvents.onDate })
    .from(calendarEvents)
    .where(
      and(
        eq(calendarEvents.status, 'confirmed'),
        gte(calendarEvents.onDate, today),
        or(
          and(eq(calendarEvents.scopeType, 'learner'), eq(calendarEvents.scopeId, learnerId)),
          classIds.length > 0 ? and(eq(calendarEvents.scopeType, 'class'), inArray(calendarEvents.scopeId, classIds)) : sql`false`,
        ),
      ),
    )
    .orderBy(asc(calendarEvents.onDate), asc(calendarEvents.id))
    .limit(1)

  const row = await latestIssued(db, learnerId)
  const view = row ? planGuardianViewSchema.safeParse(row.guardianView) : null
  const plan: GuardianWeekResponse['plan'] =
    row && view?.success
      ? {
          id: row.id,
          gapSkillTag: row.gapSkillTag,
          gapLabel: skillLabel(row.gapSkillTag, 'guardian'),
          gap: view.data.gap.text,
          action: view.data.one_action.text,
          celebrate: view.data.something_to_celebrate.text,
          source: sourceOf(row),
          issuedAt: row.createdAt.toISOString(),
          doneAt: (await supportGivenAt(db, learnerId, row.id))?.toISOString() ?? null,
        }
      : null

  // Free help first: the plan's resources, else vetted ones for the gap; free before paid.
  let links: Array<typeof resources.$inferSelect> = []
  if (row && row.resourceIds.length > 0) {
    links = await db.select().from(resources).where(and(inArray(resources.id, row.resourceIds), eq(resources.approved, true)))
  } else if (row) {
    links = await db.select().from(resources).where(and(eq(resources.approved, true), sql`${resources.skillTags} && ARRAY[${row.gapSkillTag}]::text[]`)).limit(2)
  }
  links.sort((a, b) => Number(b.free) - Number(a.free) || a.title.localeCompare(b.title))

  // Teacher messages the guardian may read: sent notes to them, released guardian-audience feedback, open check-ins.
  const messages: TeacherMessage[] = []
  const teacherNames = new Map<string, string>()
  const nameOf = async (id: string): Promise<string> => {
    const known = teacherNames.get(id)
    if (known) return known
    const [t] = await db.select({ nickname: profiles.nickname }).from(profiles).where(eq(profiles.userId, id)).limit(1)
    const name = t?.nickname ?? 'Your teacher'
    teacherNames.set(id, name)
    return name
  }
  const sentNotes = await db
    .select({ id: notes.id, teacherId: notes.teacherId, origin: notes.origin, draftText: notes.draftText, finalText: notes.finalText, sentAt: notes.sentAt, createdAt: notes.createdAt })
    .from(notes)
    .where(and(eq(notes.learnerId, learnerId), eq(notes.guardianId, actor.userId), eq(notes.status, 'sent'), eq(notes.audience, 'guardian')))
    .orderBy(desc(notes.sentAt))
    .limit(5)
  for (const note of sentNotes) {
    messages.push({ id: note.id, kind: 'note', label: teacherLabel(note.origin, await nameOf(note.teacherId)), text: note.finalText ?? note.draftText, at: (note.sentAt ?? note.createdAt).toISOString() })
  }
  const feedback = await db
    .select({ id: reviewFeedback.id, text: reviewFeedback.text, origin: reviewFeedback.origin, createdBy: reviewFeedback.createdBy, createdAt: reviewFeedback.createdAt })
    .from(reviewFeedback)
    .innerJoin(reviews, eq(reviews.id, reviewFeedback.reviewId))
    .innerJoin(assessments, eq(assessments.id, reviews.assessmentId))
    .innerJoin(attempts, eq(attempts.id, assessments.attemptId))
    .where(and(eq(attempts.learnerId, learnerId), eq(reviewFeedback.audience, 'guardian'), eq(reviews.state, 'released'), gte(reviewFeedback.createdAt, weekStartAt)))
    .orderBy(desc(reviewFeedback.createdAt))
    .limit(5)
  for (const item of feedback) {
    if (!item.text) continue
    messages.push({ id: item.id, kind: 'feedback', label: teacherLabel(item.origin, await nameOf(item.createdBy)), text: item.text, at: item.createdAt.toISOString() })
  }
  const open = await db
    .select({ id: interventions.id, skillTag: interventions.skillTag, ownerId: interventions.ownerId, followUpOn: interventions.followUpOn, createdAt: interventions.createdAt })
    .from(interventions)
    .where(and(eq(interventions.learnerId, learnerId), inArray(interventions.status, ['open', 'checking'])))
    .orderBy(asc(interventions.followUpOn))
    .limit(3)
  for (const row of open) {
    // The teacher's own action line stays in the teacher space; the guardian reads the plain sentence (spec 05 §9 G1).
    const teacher = await nameOf(row.ownerId)
    const when = new Date(`${row.followUpOn}T12:00:00Z`).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Johannesburg' })
    messages.push({ id: row.id, kind: 'intervention', label: teacher, text: `${teacher} is working on ${skillLabel(row.skillTag, 'guardian').toLowerCase()} with ${learner.nickname} this week. Check-in on ${when}.`, at: row.createdAt.toISOString() })
  }

  const pieces = work.length
  const celebrate = plan?.celebrate ?? (pieces > 0 ? `${learner.nickname} brought ${pieces} piece${pieces === 1 ? '' : 's'} of work this week and had it checked.` : null)

  return {
    learner: { id: learner.id, nickname: learner.nickname },
    weekStart,
    today,
    effort: { dots, days: dots.filter(Boolean).length, pieces, topics },
    coming: next ? { title: next.title, onDate: next.onDate, daysAway: daysBetween(today, next.onDate) } : null,
    celebrate,
    plan,
    resources: links.map((r) => ({ id: r.id, title: r.title, url: r.url, free: r.free, licence: r.licence, attribution: r.attribution })),
    teacherMessages: messages,
  }
}

/** "We did it" (P0-09): one `support_given` event per plan, basis `none`; a second tap returns the first. */
export async function supportGiven(deps: PracticeDeps, actor: Actor, learnerId: string, requestId?: string): Promise<SupportGivenResponse> {
  const { db } = deps
  const plan = await latestIssued(db, learnerId)
  if (!plan) throw noPlanYet()
  const existing = await supportGivenAt(db, learnerId, plan.id)
  if (existing) return { planId: plan.id, doneAt: existing.toISOString(), alreadyDone: true }
  const doneAt = await db.transaction(async (tx) => {
    const event = await appendEvent(tx, { learnerId, kind: 'support_given', skillTag: plan.gapSkillTag, basis: 'none', payload: { plan_id: plan.id, by: actor.userId } })
    await recordAudit(tx, { actorId: actor.userId, action: 'guardian.support_given', subjectType: 'help_plan', subjectId: plan.id, outcome: 'ok', requestId: requestId ?? null })
    return event.occurredAt
  })
  return { planId: plan.id, doneAt: doneAt.toISOString(), alreadyDone: false }
}
