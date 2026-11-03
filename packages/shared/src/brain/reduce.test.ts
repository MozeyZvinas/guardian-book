import { describe, expect, it } from 'vitest'
import type { EventBasis, LearningEventKind } from '../contracts/events.js'
import { evidencePayload, outcomesOf, type BrainEvent, type EvidenceMode } from './evidence.js'
import { countedOutcomes, dayOf, reduceEvents, reduceWithKnownSkills, sortEvents } from './reduce.js'

/** A tiny deterministic PRNG (mulberry32) so the property tests replay exactly. */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = out[i]
    const b = out[j]
    if (a !== undefined && b !== undefined) {
      out[i] = b
      out[j] = a
    }
  }
  return out
}

let counter = 0
const id = () => `00000000-0000-7000-8000-${String(++counter).padStart(12, '0')}`
const DAY = 24 * 60 * 60 * 1000
const t0 = Date.parse('2026-11-01T08:00:00Z')

interface Spec {
  kind?: LearningEventKind
  skill?: string | null
  correct?: boolean
  mode?: EvidenceMode
  basis?: EventBasis
  attemptId?: string | null
  at?: number
  sure?: boolean
  skillsCorrect?: string[]
  skillsLost?: string[]
}

function event(spec: Spec): BrainEvent {
  const fields = {
    ...(spec.correct !== undefined ? { correct: spec.correct } : {}),
    ...(spec.mode !== undefined ? { mode: spec.mode } : {}),
    ...(spec.sure !== undefined ? { sure: spec.sure } : {}),
    ...(spec.skillsCorrect !== undefined ? { skills_correct: spec.skillsCorrect } : {}),
    ...(spec.skillsLost !== undefined ? { skills_lost: spec.skillsLost } : {}),
  }
  return {
    id: id(),
    kind: spec.kind ?? 'assessed',
    attemptId: spec.attemptId === undefined ? id() : spec.attemptId,
    itemId: null,
    skillTag: spec.skill === undefined ? 'algebra.factorising' : spec.skill,
    basis: spec.basis ?? 'model_high',
    payload: evidencePayload(fields),
    occurredAt: new Date(t0 + (spec.at ?? 0)),
  }
}

const F = 'algebra.factorising'

describe('outcomesOf', () => {
  it('ignores basis none, non-evidence kinds and payloads without skill information', () => {
    expect(outcomesOf(event({ basis: 'none', correct: true }))).toEqual([])
    expect(outcomesOf(event({ kind: 'attempt_submitted', correct: true }))).toEqual([])
    expect(outcomesOf(event({ kind: 'support_given', basis: 'none', correct: true }))).toEqual([])
    expect(outcomesOf(event({}))).toEqual([]) // skill set, no `correct`
    expect(outcomesOf(event({ skill: null }))).toEqual([]) // no skill, no arrays
  })

  it('reads one-skill events and attempt-level arrays; a tag in both arrays counts as lost', () => {
    expect(outcomesOf(event({ correct: true, sure: true }))).toEqual([{ skillTag: F, correct: true, mode: 'assisted', sure: true }])
    const multi = outcomesOf(event({ skill: null, skillsCorrect: ['a', 'b', 'b'], skillsLost: ['b', 'c'] }))
    expect(multi).toEqual([
      { skillTag: 'a', correct: true, mode: 'assisted', sure: null },
      { skillTag: 'b', correct: false, mode: 'assisted', sure: null },
      { skillTag: 'c', correct: false, mode: 'assisted', sure: null },
    ])
  })

  it('defaults the mode by kind and lets the payload override it', () => {
    expect(outcomesOf(event({ kind: 'independent_check_completed', correct: true }))[0]?.mode).toBe('independent')
    expect(outcomesOf(event({ kind: 'retention_check_completed', correct: true }))[0]?.mode).toBe('retention')
    expect(outcomesOf(event({ kind: 'fixed_independently', correct: true }))[0]?.mode).toBe('assisted')
    expect(outcomesOf(event({ kind: 'assessed', correct: true, mode: 'independent' }))[0]?.mode).toBe('independent')
  })
})

describe('reduceEvents: the acceptance rows', () => {
  it('assisted correct ×3 on one skill → practising, never secure', () => {
    const events = [0, 1, 2].map((d) => event({ correct: true, at: d * DAY }))
    const [skill] = reduceEvents(events)
    expect(skill).toMatchObject({ skillTag: F, state: 'practising', assistedCorrect: 3, assistedTotal: 3, independentTotal: 0, retainedTotal: 0, evidenceCount: 3 })
    expect(skill?.evidenceEventIds).toEqual(events.map((e) => e.id))
    expect(skill?.lastCheckedAt).toEqual(new Date(t0 + 2 * DAY))
  })

  it('plus an independent correct on day 1 and a retained correct on day 3 → secure, all three marks', () => {
    const events = [
      ...[0, 1, 2].map((d) => event({ correct: true, at: d * DAY })),
      event({ kind: 'independent_check_completed', correct: true, at: 1 * DAY + 3600_000 }),
      event({ kind: 'retention_check_completed', correct: true, at: 3 * DAY }),
    ]
    const [skill] = reduceEvents(events)
    expect(skill).toMatchObject({
      state: 'secure',
      assistedCorrect: 3,
      assistedTotal: 3,
      independentCorrect: 1,
      independentTotal: 1,
      retainedCorrect: 1,
      retainedTotal: 1,
      evidenceCount: 5,
    })
  })

  it('independent and retained on the same day is not secure', () => {
    const events = [
      event({ kind: 'independent_check_completed', correct: true, at: 0 }),
      event({ kind: 'retention_check_completed', correct: true, at: 3600_000 }),
    ]
    expect(reduceEvents(events)[0]?.state).toBe('practising')
  })

  it('a wrong retained check never completes the secure rule', () => {
    const events = [
      event({ kind: 'independent_check_completed', correct: true, at: 0 }),
      event({ kind: 'retention_check_completed', correct: false, at: 2 * DAY }),
    ]
    expect(reduceEvents(events)[0]).toMatchObject({ state: 'practising', retainedCorrect: 0, retainedTotal: 1 })
  })

  it('counts the day where the learner is: 23:30 UTC and 00:30 UTC the next day are one SAST day apart from a third', () => {
    // 23:30 UTC on 1 Nov is 01:30 SAST on 2 Nov; 00:30 UTC on 2 Nov is 02:30 SAST on 2 Nov: the same SAST day.
    const sameSastDay = [
      event({ kind: 'independent_check_completed', correct: true, at: Date.parse('2026-11-01T23:30:00Z') - t0 }),
      event({ kind: 'retention_check_completed', correct: true, at: Date.parse('2026-11-02T00:30:00Z') - t0 }),
    ]
    expect(reduceEvents(sameSastDay)[0]?.state).toBe('practising')
    expect(reduceEvents(sameSastDay, { timeZone: 'UTC' })[0]?.state).toBe('secure')
    expect(dayOf(new Date('2026-11-01T23:30:00Z'))).toBe('2026-11-02')
  })
})

describe('reduceEvents: overrides and bookkeeping', () => {
  it('only basis ≠ none moves state', () => {
    expect(reduceEvents([event({ basis: 'none', correct: true })])).toEqual([])
    expect(reduceEvents([event({ kind: 'plan_issued', basis: 'none' })])).toEqual([])
  })

  it('a teacher-confirmed event overrides model-based evidence for the same attempt, whatever the order', () => {
    const attemptId = id()
    const model = event({ attemptId, correct: true, at: 0 })
    const teacher = event({ attemptId, kind: 'review_confirmed', basis: 'teacher_confirmed', correct: false, at: DAY })
    const expectLost = (events: BrainEvent[]) => {
      const [skill] = reduceEvents(events)
      expect(skill).toMatchObject({ assistedCorrect: 0, assistedTotal: 1, evidenceCount: 1, evidenceEventIds: [teacher.id] })
    }
    expectLost([model, teacher])
    expectLost([teacher, model])
    // A later model event never overrides the teacher's word on that attempt.
    expectLost([model, teacher, event({ attemptId, correct: true, at: 2 * DAY })])
  })

  it('within one basis the latest statement about a skill on an attempt wins; other attempts are independent', () => {
    const attemptId = id()
    const events = [event({ attemptId, correct: false, at: 0 }), event({ attemptId, correct: true, at: 1000, kind: 'retried' })]
    expect(reduceEvents(events)[0]).toMatchObject({ assistedCorrect: 1, assistedTotal: 1 })
    expect(reduceEvents([...events, event({ correct: false, at: 2000 })])[0]).toMatchObject({ assistedCorrect: 1, assistedTotal: 2 })
  })

  it('events without an attempt count on their own', () => {
    const events = [event({ attemptId: null, correct: true }), event({ attemptId: null, correct: true, at: 1 })]
    expect(reduceEvents(events)[0]).toMatchObject({ assistedCorrect: 2, assistedTotal: 2 })
  })

  it('keeps the learner’s "I’m sure" calls as confidence calibration', () => {
    const events = [event({ correct: true, sure: true, at: 0 }), event({ correct: false, sure: true, at: 1 }), event({ correct: true, at: 2 })]
    expect(reduceEvents(events)[0]).toMatchObject({ confidenceSureCorrect: 1, confidenceSureTotal: 2 })
  })

  it('reduceWithKnownSkills adds `new` chips for tags with no evidence', () => {
    const skills = reduceWithKnownSkills([event({ correct: true })], ['seq.convergence', F])
    expect(skills.map((s) => [s.skillTag, s.state])).toEqual([
      [F, 'practising'],
      ['seq.convergence', 'new'],
    ])
    expect(skills[1]).toMatchObject({ evidenceCount: 0, lastCheckedAt: null, evidenceEventIds: [] })
  })

  it('sortEvents orders by time then id and does not mutate', () => {
    const a = event({ at: 5 })
    const b = event({ at: 1 })
    const input = [a, b]
    expect(sortEvents(input).map((e) => e.id)).toEqual([b.id, a.id])
    expect(input[0]).toBe(a)
  })
})

/** Random event sets over a few skills, attempts, modes, bases and days. */
function randomEvents(random: () => number, size: number): BrainEvent[] {
  const skills = ['a.one', 'a.two', 'b.three']
  const attempts = Array.from({ length: 4 }, () => id())
  const kinds: LearningEventKind[] = ['assessed', 'retried', 'review_confirmed', 'fixed_independently', 'independent_check_completed', 'retention_check_completed', 'support_given']
  const events: BrainEvent[] = []
  for (let i = 0; i < size; i += 1) {
    const kind = kinds[Math.floor(random() * kinds.length)] ?? 'assessed'
    const basis: EventBasis = kind === 'support_given' ? 'none' : kind === 'review_confirmed' ? 'teacher_confirmed' : random() < 0.15 ? 'none' : 'model_high'
    const perAttempt = random() < 0.3
    const spec: Spec = {
      kind,
      basis,
      attemptId: random() < 0.2 ? null : (attempts[Math.floor(random() * attempts.length)] ?? null),
      at: Math.floor(random() * 6 * DAY),
      ...(random() < 0.5 ? { sure: random() < 0.5 } : {}),
    }
    if (perAttempt) {
      spec.skill = null
      spec.skillsCorrect = skills.filter(() => random() < 0.5)
      spec.skillsLost = skills.filter(() => random() < 0.3)
    } else {
      spec.skill = skills[Math.floor(random() * skills.length)] ?? 'a.one'
      spec.correct = random() < 0.6
    }
    events.push(event(spec))
  }
  return events
}

describe('reduceEvents: properties', () => {
  it('replay is deterministic: the same events give identical state, twice', () => {
    const random = prng(7)
    for (let round = 0; round < 40; round += 1) {
      const events = randomEvents(random, 1 + Math.floor(random() * 30))
      expect(reduceEvents(events)).toEqual(reduceEvents(events))
    }
  })

  it('is order-independent: any shuffle of the events gives the same state', () => {
    const random = prng(11)
    for (let round = 0; round < 60; round += 1) {
      const events = randomEvents(random, 1 + Math.floor(random() * 30))
      const expected = reduceEvents(events)
      for (let shuffles = 0; shuffles < 3; shuffles += 1) {
        expect(reduceEvents(shuffle(events, random))).toEqual(expected)
      }
    }
  })

  it('assisted-only evidence never yields secure, however much of it there is', () => {
    const random = prng(23)
    for (let round = 0; round < 60; round += 1) {
      const events = randomEvents(random, 1 + Math.floor(random() * 40)).map((e) => ({
        ...e,
        kind: (e.kind === 'independent_check_completed' || e.kind === 'retention_check_completed' ? 'assessed' : e.kind) as LearningEventKind,
        payload: { ...e.payload, mode: 'assisted' },
      }))
      for (const skill of reduceEvents(events)) {
        expect(skill.state).not.toBe('secure')
        expect(skill.independentTotal + skill.retainedTotal).toBe(0)
        expect(skill.evidenceCount).toBe(skill.assistedTotal)
      }
    }
  })

  it('counts agree with the counted outcomes and never exceed totals', () => {
    const random = prng(31)
    for (let round = 0; round < 40; round += 1) {
      const events = randomEvents(random, 1 + Math.floor(random() * 30))
      const counted = countedOutcomes(events)
      for (const skill of reduceEvents(events)) {
        const mine = counted.filter((o) => o.skillTag === skill.skillTag)
        expect(skill.evidenceCount).toBe(mine.length)
        expect(skill.assistedTotal + skill.independentTotal + skill.retainedTotal).toBe(mine.length)
        expect(skill.assistedCorrect).toBeLessThanOrEqual(skill.assistedTotal)
        expect(skill.independentCorrect).toBeLessThanOrEqual(skill.independentTotal)
        expect(skill.retainedCorrect).toBeLessThanOrEqual(skill.retainedTotal)
        expect(skill.confidenceSureCorrect).toBeLessThanOrEqual(skill.confidenceSureTotal)
        expect(skill.state === 'secure').toBe(skill.independentCorrect > 0 && skill.retainedCorrect > 0 && skill.state === 'secure')
      }
    }
  })
})
