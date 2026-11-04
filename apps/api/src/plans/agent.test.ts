import { describe, expect, it } from 'vitest'
import { planAgentTurnSchema, skillLabels, type PlanAgentTurn, type PlanOutput } from '@guardian-book/shared'
import { loadConfig } from '../config.js'
import { createGateway } from '../gateway/gateway.js'
import { immediateSleep, okResponse } from '../gateway/testing.js'
import type { ChatRequest, TransportResult } from '../gateway/transport.js'
import { verifiedCall } from '../gateway/verifiedCall.js'
import { silentLogger } from '../logger.js'
import { runChecks, type PlanContext } from '../verify/index.js'
import { runPlanAgent, type AgentIO, type AgentStepResult } from './agent.js'
import { buildPlanAgentUser, type PlanTask } from './prompt.v1.js'
import { templatePlan } from './template.js'

/**
 * The bounded agent (brief B06 §7): accepted; an unknown tool is discarded; a 9th step
 * means the template; a resource off the list and jargon in the guardian view are re-asked
 * by the verifier, not stored. The model is scripted; the verifier and the gateway are real.
 */

const task: PlanTask = { gapSkillTag: 'factorise-trinomial', labels: skillLabels('factorise-trinomial'), today: '2026-11-04', weekStart: '2026-11-02' }

const cite = (text: string, ids = ['E1']) => ({ text, evidence_ids: ids })
const goodPlan = (overrides: Partial<PlanOutput> = {}): PlanOutput => ({
  gap_skill_tag: 'factorise-trinomial',
  learner_view: { tonight_step: cite('Redo step 2 and check the signs.'), hint: 'Which two numbers multiply to the constant?', why_it_matters: cite('Factorising is in every paper.') },
  guardian_view: { gap: cite('One step slipped: splitting an expression into brackets.'), one_action: cite('Ask them to teach you step 2. Ten minutes is enough.'), something_to_celebrate: cite('They brought their work.') },
  teacher_view: { who_shares_this_gap: cite('One learner in this evidence.', ['E1', 'E2']), suggested_intervention: cite('A ten-minute starter on factorising.') },
  evidence_event_ids: ['E1', 'E2'],
  resource_ids: ['R1'],
  ...overrides,
})
const turn = (tool: string, plan: PlanOutput | null = null): PlanAgentTurn => ({ tool, reason: 'because', plan })

/** A scripted model behind the real gateway and the real verified call; a live queue so tests push as they go. */
function harness() {
  const requests: ChatRequest[] = []
  const queue: TransportResult[] = []
  const gateway = createGateway({
    config: loadConfig({ META_API_KEY: 'unit-only-key' }).meta,
    logger: silentLogger,
    sleep: immediateSleep,
    transport: async (request) => {
      requests.push(request)
      const next = queue.shift()
      if (!next) throw new Error('no scripted answer left')
      return next
    },
  })
  const evidence: string[] = []
  const resources: string[] = []
  const calls: string[] = []
  const io: AgentIO = {
    tools: {
      getEvidence: async () => {
        calls.push('getEvidence')
        evidence.push('E1', 'E2')
        return { text: 'Recent evidence:\n- E1 · 2026-11-04 · assessed · lost: factorise-trinomial\n- E2 · 2026-11-03 · assessed', summary: '2 events' }
      },
      getResources: async () => {
        calls.push('getResources')
        resources.push('R1')
        return { text: 'Vetted resources:\n- R1 · Factorising, step by step · free · CC BY 3.0', summary: '1 resource' }
      },
      getCalendar: async () => ({ text: '- (none)', summary: '0 dates' }),
      getProfileCards: async () => ({ text: 'Profile cards: (none yet)', summary: 'no cards' }),
    },
    known: () => ({ evidence: [...evidence], resources: [...resources], memoValues: ['$(x - 2)(x - 3) = 0$'] }),
    step: async ({ user, context }): Promise<AgentStepResult> => {
      const result = await verifiedCall({ gateway, purpose: 'plan', promptVersion: 'help-plan-agent-v1', system: 'system', user, context, maxTokens: 500 })
      const last = result.runs[result.runs.length - 1]
      const parsed = planAgentTurnSchema.safeParse(last?.output)
      return { status: result.status, turn: result.status === 'accepted' ? result.output : parsed.success ? parsed.data : null, failedCodes: (last?.checks ?? []).filter((c) => !c.passed).map((c) => c.code), modelRunId: null }
    },
  }
  return { io, queue, requests, calls }
}

const userTextOf = (request: ChatRequest): string => (typeof request.messages[1].content === 'string' ? request.messages[1].content : '')

describe('the Help Plan agent', () => {
  it('reads evidence and resources, then writes a plan the verifier accepts; the trace holds every step', async () => {
    const h = harness()
    h.queue.push(okResponse(turn('getEvidence')), okResponse(turn('getResources')), okResponse(turn('writePlan', goodPlan())))
    const outcome = await runPlanAgent(task, h.io, 8)
    expect(outcome.kind).toBe('plan')
    expect(outcome.trace.map((s) => [s.tool, s.status])).toEqual([
      ['getEvidence', 'done'],
      ['getResources', 'done'],
      ['writePlan', 'plan'],
    ])
    expect(h.calls).toEqual(['getEvidence', 'getResources'])
    // The transcript the model saw on its third turn carried both tool results, and no UUID.
    const third = userTextOf(h.requests[2]!)
    expect(third).toContain('## Step 1 · getEvidence · done')
    expect(third).toContain('- R1 ·')
    expect(third).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/)
  })

  it('discards an unknown tool (TOOL_UNKNOWN, no re-ask) and carries on', async () => {
    const h = harness()
    h.queue.push(okResponse(turn('webSearch')), okResponse(turn('getEvidence')), okResponse(turn('writePlan', goodPlan({ resource_ids: [] }))))
    const outcome = await runPlanAgent(task, h.io, 8)
    expect(outcome.kind).toBe('plan')
    expect(outcome.trace[0]).toMatchObject({ step: 1, tool: 'webSearch', status: 'discarded' })
    expect(h.requests).toHaveLength(3) // one call per step: an unknown tool is not re-asked
    expect(userTextOf(h.requests[1]!)).toContain('"webSearch" is not a tool here')
  })

  it('a 9th step never happens: eight tool calls and the template stands in', async () => {
    const h = harness()
    for (let i = 0; i < 8; i += 1) h.queue.push(okResponse(turn('getCalendar')))
    const outcome = await runPlanAgent(task, h.io, 8)
    expect(outcome).toMatchObject({ kind: 'template', reason: 'steps_exceeded' })
    expect(outcome.trace).toHaveLength(8)
    expect(h.requests).toHaveLength(8)
  })

  it('a resource off the vetted list is re-asked (RESOURCE_UNVETTED), then accepted', async () => {
    const h = harness()
    h.queue.push(okResponse(turn('getEvidence')), okResponse(turn('getResources')), okResponse(turn('writePlan', goodPlan({ resource_ids: ['R9'] }))), okResponse(turn('writePlan', goodPlan())))
    const outcome = await runPlanAgent(task, h.io, 8)
    expect(outcome.kind).toBe('plan')
    expect(h.requests).toHaveLength(4)
    expect(userTextOf(h.requests[3]!)).toContain('RESOURCE_UNVETTED')
    if (outcome.kind === 'plan') expect(outcome.plan.resource_ids).toEqual(['R1'])
  })

  it('jargon in the guardian view is re-asked (PLAIN_LANGUAGE_FAIL); an uncited statement too', async () => {
    const h = harness()
    const jargon = goodPlan({ guardian_view: { ...goodPlan().guardian_view, gap: cite('A misconception about the rubric remains.') } })
    h.queue.push(okResponse(turn('getEvidence')), okResponse(turn('writePlan', jargon)), okResponse(turn('writePlan', goodPlan({ resource_ids: [], evidence_event_ids: ['E1'], learner_view: { ...goodPlan().learner_view, tonight_step: cite('Redo step 2.', []) } }))), okResponse(turn('writePlan', goodPlan({ resource_ids: [] }))))
    const outcome = await runPlanAgent(task, h.io, 8)
    expect(outcome.kind).toBe('plan')
    expect(userTextOf(h.requests[2]!)).toContain('PLAIN_LANGUAGE_FAIL')
    expect(userTextOf(h.requests[3]!)).toContain('cites no evidence')
  })

  it('a plan that fails the checks three times is not stored: the template stands in', async () => {
    const h = harness()
    const leak = goodPlan({ resource_ids: [], learner_view: { ...goodPlan().learner_view, hint: 'The factors are (x - 2)(x - 3) = 0.' } })
    h.queue.push(okResponse(turn('getEvidence')), okResponse(turn('writePlan', leak)), okResponse(turn('writePlan', leak)), okResponse(turn('writePlan', leak)))
    const outcome = await runPlanAgent(task, h.io, 8)
    expect(outcome).toMatchObject({ kind: 'template', reason: 'exhausted' })
    expect(userTextOf(h.requests[2]!)).toContain('HINT_LEAKS_ANSWER')
  })
})

describe('the template plan and the prompt', () => {
  it('passes every plan rule with the evidence it is given', () => {
    const plan = templatePlan({ gapSkillTag: 'algebra.factorising', labels: skillLabels('algebra.factorising'), evidenceIds: ['ev-1'] })
    const context: PlanContext = { knownEvidenceIds: ['ev-1'], vettedResourceIds: [], allowedTools: ['writePlan'], maxSteps: 8, trace: [], memoValues: ['$x = 2$ and $x = 3$'] }
    const checks = runChecks('plan', { tool: 'writePlan', reason: 'template', plan }, context)
    expect(checks.failed.map((c) => c.code)).toEqual([])
  })

  it('the user message refuses personal data and carries no IDs', () => {
    const text = buildPlanAgentUser(task, [{ step: 1, tool: 'getEvidence', status: 'done', text: '- E1 · assessed' }], 8)
    expect(text).toContain('Gap skill tag: factorise-trinomial')
    expect(text).toContain('Steps used: 1 of 8')
    expect(() => buildPlanAgentUser(task, [{ step: 1, tool: 'getProfileCards', status: 'done', text: 'call me on 082 123 4567 89' }], 8)).toThrow(/phone/)
  })
})
