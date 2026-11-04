import type { GuideOutput, InputClass, NoteDraft, NoticeOutput, PlanAgentTurn, ProfileCards, StepHint, TranslationOutput, WorkCheckOutput } from '@guardian-book/shared'
import { loadConfig } from '../../src/config.js'
import { createGateway, type Gateway } from '../../src/gateway/gateway.js'
import { immediateSleep, okResponse } from '../../src/gateway/testing.js'
import { createTranscriber, type TranscribeRequest, type Transcriber, type TranscribeTransportResult } from '../../src/gateway/transcribe.js'
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

/** Cards straight from the four answer blocks (B16: setup sends composed, structured answers). */
export function profileCardsFromPrompt(request: ChatRequest): ProfileCards {
  const answers = [...userText(request).matchAll(/<<<ANSWER\n([\s\S]*?)\nANSWER>>>/g)].map((m) => (m[1] ?? '').trim()).map((text) => (text === '(blank)' ? '' : text))
  const [dream = '', subjects = '', hardest = '', how = ''] = answers
  return {
    dream: dream || null,
    subjects: subjects.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12),
    hardest_subject: hardest || null,
    how_i_learn: how || null,
  }
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
 * The Help Plan agent, scripted (B06): reads the evidence, then the resources, then writes
 * a plan that cites every evidence alias it was shown (E1, E2, ...) and the first vetted
 * resource (R1), in plain words the verifier accepts.
 */
export function planAgentFromPrompt(request: ChatRequest): PlanAgentTurn {
  const text = userText(request)
  if (!/^## Step \d+ · getEvidence · done/m.test(text)) return { tool: 'getEvidence', reason: 'Read the evidence first.', plan: null }
  if (!/^## Step \d+ · getResources · done/m.test(text)) return { tool: 'getResources', reason: 'Free help first.', plan: null }
  const evidence = [...new Set([...text.matchAll(/^- (E\d+) · /gm)].map((m) => m[1] ?? ''))]
  const resources = [...text.matchAll(/^- (R\d+) · /gm)].map((m) => m[1] ?? '').slice(0, 1)
  const tag = /^Gap skill tag: (\S+)$/m.exec(text)?.[1] ?? 'unknown'
  const learner = /^Skill in the learner's words: (.+)$/m.exec(text)?.[1] ?? tag
  const guardian = /^Skill in the parent's words: (.+)$/m.exec(text)?.[1] ?? tag
  const cite = (t: string, ids = evidence.slice(0, 1)) => ({ text: t, evidence_ids: ids })
  return {
    tool: 'writePlan',
    reason: 'Enough evidence to write.',
    plan: {
      gap_skill_tag: tag,
      learner_view: {
        tonight_step: cite(`Redo the step you lost on ${learner.toLowerCase()}. One line at a time.`),
        hint: 'Check the sign of each term before you move on.',
        why_it_matters: cite(`${learner} is in every algebra paper.`),
      },
      guardian_view: {
        gap: cite(`One step slipped this week: ${guardian.toLowerCase()}.`),
        one_action: cite('Ask them to teach you step 2 tonight. Ten minutes is enough. You do not need to know the maths.'),
        something_to_celebrate: cite('They brought their work and got it checked.'),
      },
      teacher_view: {
        who_shares_this_gap: cite('This evidence covers one learner only.', evidence),
        suggested_intervention: cite('A ten-minute starter on factorising, then a follow-up check in two days.'),
      },
      evidence_event_ids: evidence,
      resource_ids: resources,
    },
  }
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

/** A hint that answers without giving the step away (B13): the verifier accepts it on every seed item. */
export function safeStepHint(): StepHint {
  return { hint: 'Look at the signs: the two numbers in the brackets must multiply to the last term and add to the middle one. Check each sign.' }
}

/**
 * Help me with a question, scripted (B15): the typed question is read back as sent (the
 * server has already turned `\( … \)` into `$…$`); a photo reads back as the first seed
 * item's question, so the bank match and "Check my own working" show. The steps and the
 * answer are the seed quadratic's: the mock does not do mathematics, it exercises the path.
 */
export const PHOTO_QUESTION = 'Solve for $x$:\n\n$$x^2 - 5x + 6 = 0$$'

export function guideFromPrompt(request: ChatRequest): GuideOutput {
  const typed = /<<<QUESTION\n([\s\S]*?)\nQUESTION>>>/.exec(userText(request))?.[1]
  return {
    question_md: hasImage(request) ? PHOTO_QUESTION : (typed ?? ''),
    subject: 'Mathematics',
    topic: 'Quadratic equations',
    steps: [
      { goal: 'Get everything on one side, equal to zero.', hint: 'Check that the right-hand side is already $0$.', worked: 'The equation is already in the form $x^2 - 5x + 6 = 0$.' },
      { goal: 'Factorise the left-hand side into two brackets.', hint: 'Find two numbers that multiply to $6$ and add to $-5$.', worked: 'Both numbers are negative: $-2$ and $-3$, so $(x - 2)(x - 3) = 0$.' },
      { goal: 'Set each bracket equal to zero and solve.', hint: 'A product is zero when one of its factors is zero.', worked: '$x - 2 = 0$ gives $x = 2$; $x - 3 = 0$ gives $x = 3$.' },
    ],
    final_answer: '$x = 2$ or $x = 3$',
    confidence: 'high',
  }
}

/**
 * A pseudo-translation (B12): the letters of every word outside a placeholder reversed,
 * so the verifier's rules hold (placeholders kept once, same length, no digit or link
 * added, hardly any English word left) without a real language model.
 */
export function pseudoTranslation(request: ChatRequest): TranslationOutput {
  const source = /<<<TEXT\n([\s\S]*?)\nTEXT>>>/.exec(userText(request))?.[1] ?? ''
  const text = source
    .split(/(\{\{[A-Z]+\d*\}\})/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/[\p{L}']+/gu, (word) => [...word].reverse().join(''))))
    .join('')
  return { text }
}

export function defaultAnswer(request: ChatRequest): TransportResult {
  switch (purposeOf(request)) {
    case 'translate':
      return okResponse(pseudoTranslation(request), { requestId: `req_translate_${Date.now()}` })
    case 'step_hint':
      return okResponse(safeStepHint(), { requestId: `req_hint_${Date.now()}` })
    case 'guide':
      return okResponse(guideFromPrompt(request), { requestId: `req_guide_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` })
    case 'note':
      return okResponse(noteFromPrompt(request), { requestId: `req_note_${Date.now()}` })
    case 'classify':
      return okResponse(classification(/<<<NOTICE|notice|timetable/i.test(userText(request)) ? 'notice' : 'work'), { requestId: `req_classify_${Date.now()}` })
    case 'assess': {
      // The first seed item loses its last step (B04's tests rely on it); a fix (one target step)
      // and the follow-up item (`alg-12-factorise-trinomial-2`, the check-alone match) pass in full.
      const single = guidelineOf(request).length === 1
      const followUpItem = /Question \(alg-12-factorise-trinomial-2;/.test(userText(request))
      return okResponse(goodWorkCheck(request, { loseLast: !single && !followUpItem }), { requestId: `req_assess_${Date.now()}` })
    }
    case 'plan':
      return okResponse(planAgentFromPrompt(request), { requestId: `req_plan_${Date.now()}` })
    case 'notice':
      return okResponse(noticeFromText(request), { requestId: `req_notice_${Date.now()}` })
    case 'profile_cards':
      return okResponse(profileCardsFromPrompt(request), { requestId: `req_profile_${Date.now()}` })
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

/**
 * Muse Voice Transcribe, scripted (B13): every clip transcribes to `transcript`; the
 * duration is read off the WAV length (16 kHz mono 16-bit: 32 bytes per millisecond), so
 * cost and latency are recorded as they would be. A test can queue overrides.
 */
export interface ScriptedTranscriber {
  transcriber: Transcriber
  requests: TranscribeRequest[]
  queue: TranscribeTransportResult[]
}

export function scriptedTranscriber(transcript = 'Why is it minus six?'): ScriptedTranscriber {
  const requests: TranscribeRequest[] = []
  const queue: TranscribeTransportResult[] = []
  const config = loadConfig({ META_API_KEY: 'integration-only-key' })
  const transcriber = createTranscriber({
    config: config.meta,
    logger: silentLogger,
    sleep: immediateSleep,
    transport: async (request) => {
      requests.push(request)
      const next = queue.shift()
      if (next) return next
      const audioDurationMs = Math.max(0, Math.round((request.audio.length - 44) / 32))
      return { ok: true, status: 200, requestId: `voice_${Date.now()}`, body: { sessionId: request.sessionId, transcript, audioDurationMs, turns: [] } }
    },
  })
  return { transcriber, requests, queue }
}
