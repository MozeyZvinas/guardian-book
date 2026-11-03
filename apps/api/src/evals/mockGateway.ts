import type { WorkCheckOutput } from '@guardian-book/shared'
import type { MetaConfig } from '../config.js'
import { createGateway, type Gateway } from '../gateway/gateway.js'
import type { Logger } from '../logger.js'
import type { ChatRequest, Transport } from '../gateway/transport.js'
import type { EvalCase } from './cases.js'

/**
 * A gateway whose "model" answers every case with the teacher's expected marks, so the
 * whole eval pipeline (prompt → call → checks → results file) runs with no key and no
 * spend. It reads the case ID out of the prompt, so the same transport serves every case.
 */

export function expectedOutputFor(evalCase: EvalCase): WorkCheckOutput {
  const working = evalCase.answer.kind === 'typed' ? evalCase.answer.text : '(photo transcription)'
  const steps = [...evalCase.guideline]
    .sort((a, b) => a.step_no - b.step_no)
    .map((step) => {
      const awarded = evalCase.expected.awarded[step.step_id] ?? 0
      const earned = awarded >= step.marks
      return {
        step_id: step.step_id,
        awarded,
        available: step.marks,
        confidence: 'high' as const,
        evidence: earned ? working.slice(0, 40) : 'nothing in the working for this step',
        feedback: earned ? 'Correct.' : 'Not yet; look at this step again.',
        misconception_tag: earned ? null : 'unspecified',
        hint: earned ? null : 'Check what this step asks for and compare it with your line.',
        box: null,
      }
    })
  return {
    steps,
    total: evalCase.expected.total,
    transcription: working,
    transcription_confidence: 'high',
    uncertainty_codes: [],
  }
}

function caseIdFromRequest(request: ChatRequest, cases: EvalCase[]): EvalCase | null {
  const user = request.messages[1].content
  const text = typeof user === 'string' ? user : user.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
  return cases.find((evalCase) => text.includes(`Question (${evalCase.item.slug};`) && text.includes(answerKey(evalCase))) ?? null
}

/** Enough of the answer to tell two cases on the same item apart. */
function answerKey(evalCase: EvalCase): string {
  return evalCase.answer.kind === 'typed' ? evalCase.answer.text.slice(0, 80) : evalCase.answer.image_path
}

export function mockTransportFor(cases: EvalCase[]): Transport {
  return async (request) => {
    const evalCase = caseIdFromRequest(request, cases)
    const content = evalCase ? JSON.stringify(expectedOutputFor(evalCase)) : '{"not":"a case"}'
    const tokens = Math.ceil(JSON.stringify(request.messages).length / 4)
    return {
      ok: true,
      status: 200,
      requestId: `mock_${evalCase?.id ?? 'unknown'}`,
      body: {
        id: 'mock',
        model: request.model,
        choices: [{ finish_reason: 'stop', message: { content } }],
        usage: { prompt_tokens: tokens, completion_tokens: Math.ceil(content.length / 4), prompt_tokens_details: { cached_tokens: 0 } },
      },
    }
  }
}

export function createMockGateway(config: MetaConfig, logger: Logger, cases: EvalCase[]): Gateway {
  return createGateway({
    config: { ...config, apiKey: config.apiKey ?? 'mock-key-not-real', configured: true },
    logger,
    transport: mockTransportFor(cases),
    sleep: async () => {},
  })
}
