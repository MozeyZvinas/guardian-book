import { isPlanAgentTool, PLAN_AGENT_TOOLS, type PlanAgentTool, type PlanAgentTurn, type PlanOutput } from '@guardian-book/shared'
import { PromptSafetyError } from '../gateway/promptSafety.js'
import type { PlanContext } from '../verify/index.js'
import { buildPlanAgentUser, type PlanTask, type TranscriptEntry } from './prompt.v1.js'

/**
 * The bounded tool-using workflow (brief B06 §4; spec 02 P0-08). Pure orchestration: the
 * model call (`step`) and the tools are injected, so the loop is unit-tested with no
 * database and no provider. Every step is one verified model call; the trace is kept and
 * stored with the plan (≤ `maxSteps` entries).
 *
 * - A turn that names an allowed tool runs it and appends the result to the transcript.
 * - A turn the verifier refused with TOOL_UNKNOWN is discarded (the step still counts).
 * - A `writePlan` turn the verifier accepted ends the loop with the plan.
 * - `maxSteps` reached, the verifier exhausted on a plan, a failed call, an unsafe prompt:
 *   the loop ends with `template`, and the caller stores the safe template plan instead.
 */

export interface ToolResult {
  /** What the model reads next. Aliases only (E1, R1), never IDs. */
  text: string
  /** One line for the stored trace. */
  summary: string
}

export interface AgentStepResult {
  status: 'accepted' | 'exhausted' | 'failed'
  /** The turn the model wrote (schema-valid), whether or not the checks passed. */
  turn: PlanAgentTurn | null
  failedCodes: string[]
  modelRunId: string | null
}

export interface AgentIO {
  step(input: { user: string; context: PlanContext }): Promise<AgentStepResult>
  tools: Partial<Record<Exclude<PlanAgentTool, 'writePlan'>, () => Promise<ToolResult>>>
  /** The aliases handed out so far (grow as tools run): what the plan may cite. */
  known(): { evidence: string[]; resources: string[]; memoValues: string[] }
}

export interface TraceStep {
  step: number
  tool: string
  status: 'done' | 'discarded' | 'plan'
  reason: string | null
  summary: string | null
  modelRunId: string | null
}

export type TemplateReason = 'steps_exceeded' | 'exhausted' | 'failed' | 'unsafe'

export type AgentOutcome =
  | { kind: 'plan'; plan: PlanOutput; trace: TraceStep[]; modelRunId: string | null }
  | { kind: 'template'; reason: TemplateReason; trace: TraceStep[]; modelRunId: string | null }

export async function runPlanAgent(task: PlanTask, io: AgentIO, maxSteps: number): Promise<AgentOutcome> {
  const trace: TraceStep[] = []
  const transcript: TranscriptEntry[] = []
  let lastRunId: string | null = null

  for (let stepNo = 1; stepNo <= maxSteps; stepNo += 1) {
    let user: string
    try {
      user = buildPlanAgentUser(task, transcript, maxSteps)
    } catch (err) {
      if (err instanceof PromptSafetyError) return { kind: 'template', reason: 'unsafe', trace, modelRunId: lastRunId }
      throw err
    }
    const known = io.known()
    const context: PlanContext = {
      knownEvidenceIds: known.evidence,
      vettedResourceIds: known.resources,
      allowedTools: [...PLAN_AGENT_TOOLS],
      maxSteps,
      // A discarded request was never run: the verifier sees the steps that happened.
      trace: trace.filter((entry) => entry.status !== 'discarded').map((entry) => ({ tool: entry.tool })),
      memoValues: known.memoValues,
    }
    const result = await io.step({ user, context })
    lastRunId = result.modelRunId ?? lastRunId

    if (result.status === 'failed') return { kind: 'template', reason: 'failed', trace, modelRunId: lastRunId }
    if (result.status === 'exhausted') {
      // Unknown tool: discarded, and the step is spent. Anything else exhausted the re-ask
      // budget (or the step limit): the plan is not trusted; the template stands in.
      if (result.failedCodes.includes('TOOL_UNKNOWN') && result.turn) {
        const tool = result.turn.tool
        trace.push({ step: stepNo, tool, status: 'discarded', reason: result.turn.reason, summary: 'not an allowed tool', modelRunId: result.modelRunId })
        transcript.push({ step: stepNo, tool, status: 'discarded', text: `"${tool}" is not a tool here. Allowed tools: ${PLAN_AGENT_TOOLS.join(', ')}.` })
        continue
      }
      return { kind: 'template', reason: 'exhausted', trace, modelRunId: lastRunId }
    }

    const turn = result.turn
    if (!turn) return { kind: 'template', reason: 'failed', trace, modelRunId: lastRunId }

    if (turn.tool === 'writePlan' && turn.plan) {
      trace.push({ step: stepNo, tool: 'writePlan', status: 'plan', reason: turn.reason, summary: 'plan written and verified', modelRunId: result.modelRunId })
      return { kind: 'plan', plan: turn.plan, trace, modelRunId: result.modelRunId }
    }

    // The verifier accepted the turn, so the tool is allowed and is not writePlan.
    const toolName = turn.tool
    const tool = isPlanAgentTool(toolName) && toolName !== 'writePlan' ? io.tools[toolName] : undefined
    if (!tool) {
      trace.push({ step: stepNo, tool: toolName, status: 'discarded', reason: turn.reason, summary: 'tool not available', modelRunId: result.modelRunId })
      transcript.push({ step: stepNo, tool: toolName, status: 'discarded', text: `"${toolName}" is not available. Allowed tools: ${PLAN_AGENT_TOOLS.join(', ')}.` })
      continue
    }
    const output = await tool()
    trace.push({ step: stepNo, tool: toolName, status: 'done', reason: turn.reason, summary: output.summary, modelRunId: result.modelRunId })
    transcript.push({ step: stepNo, tool: toolName, status: 'done', text: output.text })
  }

  return { kind: 'template', reason: 'steps_exceeded', trace, modelRunId: lastRunId }
}
