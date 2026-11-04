import type { InputClass, NoteDraft, NoticeOutput, WorkCheckOutput } from '@guardian-book/shared'
import { loadConfig } from '../../src/config.js'
import { createGateway, type Gateway } from '../../src/gateway/gateway.js'
import { immediateSleep, okResponse } from '../../src/gateway/testing.js'
import type { ChatRequest, TransportResult } from '../../src/gateway/transport.js'
import { silentLogger } from '../../src/logger.js'

/**
 * A scripted model for the B04 integration tests. By default it answers every purpose
 * with a sound output read off the prompt (so the verifier accepts it); a test can queue
 * overrides (a bad hint, a timeout, an HTTP error) that are consumed in order.
 */

export type Override = TransportResult | ((request: ChatRequest) => TransportResult)

export interface ScriptedModel {
  gateway: Gateway
  requests: ChatRequest[]
  queue: Override[]
  reset(): void
}

export function userText(request: ChatRequest): string {
  const content = request.messages[1].content
  return typeof content === 'string' ? content : content.map((part) => (part.type === 'text' ? part.text : '')).join('\n')
}

export function hasImage(request: ChatRequest): boolean {
  const content = request.messages[1].content
  return typeof content !== 'string' && content.some((part) => part.type === 'image_url')
}

export function purposeOf(request: ChatRequest): string {
  return request.response_format.json_schema.name
}

/** The guideline lines the work-check prompt prints: "S1 · step 1 · M (method mark) · 1 mark". */
export function guidelineOf(request: ChatRequest): Array<{ id: string; marks: number }> {
  const text = userText(request)
  return [...text.matchAll(/^(S\d+) · step \d+ · (?:M|A|CA) \([^)]*\) · (\d+) marks?$/gm)].map((m) => ({ id: m[1] ?? '', marks: Number(m[2]) }))
}

export function answerOf(request: ChatRequest): string {
  const match = /<<<ANSWER\n([\s\S]*?)\nANSWER>>>/.exec(userText(request))
  return match?.[1] ?? '(photo transcription of the working: x^2 - 5x + 6 = 0)'
}

/** Full marks on every step, evidence quoted from the answer, no hints (nothing was lost). */
export function goodWorkCheck(request: ChatRequest, options: { loseLast?: boolean; hint?: string } = {}): WorkCheckOutput {
  const guideline = guidelineOf(request)
  const answer = answerOf(request)
  const quote = answer.split('\n')[0]?.slice(0, 24) ?? answer.slice(0, 24)
  const steps = guideline.map((step, index) => {
    const lost = Boolean(options.loseLast) && index === guideline.length - 1
    return {
      step_id: step.id,
      awarded: lost ? 0 : step.marks,
      available: step.marks,
      confidence: 'high' as const,
      evidence: lost ? 'the last line stops before the solutions are stated' : quote,
      feedback: lost ? 'Not yet: the solutions are not stated.' : 'Correct.',
      misconception_tag: lost ? 'incomplete_working' : null,
      hint: lost ? (options.hint ?? 'Each factor can be zero: finish the last line for both.') : null,
      box: hasImage(request) ? [100, 100 + index * 150, 900, 220 + index * 150] : null,
    }
  })
  return {
    steps,
    total: steps.reduce((acc, step) => acc + step.awarded, 0),
    transcription: answer,
    transcription_confidence: 'high',
    uncertainty_codes: [],
  }
}

export function classification(kind: InputClass['kind'], confidence: InputClass['confidence'] = 'high'): InputClass {
  return { kind, confidence, reason: 'Looks like it.' }
}

/** Reads "<title> on <date>" lines out of a typed notice; a line ending in "?" is low confidence. */
export function noticeFromText(request: ChatRequest): NoticeOutput {
  const match = /<<<NOTICE\n([\s\S]*?)\nNOTICE>>>/.exec(userText(request))
  const lines = (match?.[1] ?? '').split('\n').filter((line) => line.trim().length > 0)
  const events = lines.flatMap((line) => {
    const m = /^(.+?) on (\d{4}-\d{2}-\d{2})(\??)$/.exec(line.trim())
    if (!m) return []
    return [{ title: m[1] ?? '', subject: 'Mathematics', paper: null, on_date: m[2] ?? '', source_line: line.trim(), confidence: m[3] ? ('low' as const) : ('high' as const) }]
  })
  return { events, not_a_notice: events.length === 0 }
}

/**
 * A plain-language note that cites every evidence ID the prompt listed (B07). Short
 * sentences, no jargon, nothing about the person: the verifier's NOTE_RULES accept it.
 */
export function noteFromPrompt(request: ChatRequest): NoteDraft {
  const text = userText(request)
  const block = /<<<EVIDENCE\n([\s\S]*?)\nEVIDENCE>>>/.exec(text)
  const ids = (block?.[1] ?? '')
    .split('\n')
    .map((line) => line.split(' · ')[0]?.trim() ?? '')
    .filter((id) => id.length > 0)
  const slipped = /^- (.+?): /m.exec(text)?.[1] ?? 'one step'
  return {
    text: `This week your child worked on algebra. One step slipped: ${slipped.toLowerCase()}. Ask them to show you that step tonight. Two minutes is enough.`,
    evidence_event_ids: ids,
  }
}

export function defaultAnswer(request: ChatRequest): TransportResult {
  switch (purposeOf(request)) {
    case 'note':
      return okResponse(noteFromPrompt(request), { requestId: `req_note_${Date.now()}` })
    case 'classify':
      return okResponse(classification(/<<<NOTICE|notice|timetable/i.test(userText(request)) ? 'notice' : 'work'), { requestId: `req_classify_${Date.now()}` })
    case 'assess':
      return okResponse(goodWorkCheck(request, { loseLast: true }), { requestId: `req_assess_${Date.now()}` })
    case 'notice':
      return okResponse(noticeFromText(request), { requestId: `req_notice_${Date.now()}` })
    default:
      return okResponse({})
  }
}

export function scriptedModel(): ScriptedModel {
  const requests: ChatRequest[] = []
  const queue: Override[] = []
  const config = loadConfig({ META_API_KEY: 'integration-only-key', META_MODEL: 'muse-spark-1.3' })
  const gateway = createGateway({
    config: config.meta,
    logger: silentLogger,
    sleep: immediateSleep,
    transport: async (request) => {
      requests.push(request)
      const next = queue.shift()
      if (next === undefined) return defaultAnswer(request)
      return typeof next === 'function' ? next(request) : next
    },
  })
  return {
    gateway,
    requests,
    queue,
    reset() {
      requests.length = 0
      queue.length = 0
    },
  }
}
