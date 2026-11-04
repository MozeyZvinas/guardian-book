import type { Confidence } from '@guardian-book/shared'

/**
 * Red ink, the plan (brief B11 §1): what the teacher's pen would draw on the learner's own
 * photo, decided from the STORED steps only (never from how marks are decided). Pure, so
 * both the learner's feedback screen and the teacher's review draw the same thing.
 *
 * Rules:
 * - ink only for a step whose box exists AND whose confidence is high or medium; every
 *   other step stays in the step list beside the photo;
 * - after release the teacher's award wins, and a comment is drawn only when the award is
 *   the one the model proposed (never ink from a proposal the teacher overrode);
 * - a comment is at most `MAX_COMMENT_CHARS` characters of that step's feedback, plain text.
 */

export const MAX_COMMENT_CHARS = 60
export const INK_CONFIDENCE: readonly Confidence[] = ['high', 'medium']

export interface InkSource {
  stepId: string
  stepNo: number
  available: number
  /** The model's proposal (the stored assessment step), or null when it gave none. */
  proposed: { awarded: number; confidence: Confidence; feedback: string; box: number[] | null } | null
  /** The teacher's award: the released review's value, or her live value on the review screen. */
  teacherAwarded?: number | null | undefined
}

export interface InkMark {
  stepId: string
  stepNo: number
  /** Clamped to the 0–1000 grid: [x0, y0, x1, y1]. */
  box: [number, number, number, number]
  awarded: number
  available: number
  kind: 'tick' | 'lost' | 'partial'
  comment: string | null
}

export interface InkPlan {
  marks: InkMark[]
  /** Steps left to the list beside the photo (no box, low confidence or no proposal). */
  listed: number[]
  total: { awarded: number; available: number }
}

const clamp = (n: number): number => Math.min(1000, Math.max(0, Math.round(n)))

/** The first `MAX_COMMENT_CHARS` characters of the feedback, cut at a word, with an ellipsis. */
export function shortComment(feedback: string): string | null {
  const text = feedback.replace(/\s+/g, ' ').trim()
  if (!text) return null
  if (text.length <= MAX_COMMENT_CHARS) return text
  const cut = text.slice(0, MAX_COMMENT_CHARS - 1)
  const atWord = cut.lastIndexOf(' ')
  return `${(atWord > 24 ? cut.slice(0, atWord) : cut).trimEnd()}…`
}

export function planInk(steps: readonly InkSource[]): InkPlan {
  const marks: InkMark[] = []
  const listed: number[] = []
  let awardedTotal = 0
  let availableTotal = 0
  for (const step of steps) {
    const p = step.proposed
    const teacher = step.teacherAwarded ?? null
    const awarded = teacher ?? p?.awarded ?? 0
    awardedTotal += awarded
    availableTotal += step.available
    if (!p || !p.box || p.box.length !== 4 || !INK_CONFIDENCE.includes(p.confidence)) {
      listed.push(step.stepNo)
      continue
    }
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = p.box.map(clamp)
    const box: [number, number, number, number] = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
    const kind: InkMark['kind'] = awarded >= step.available ? 'tick' : awarded > 0 ? 'partial' : 'lost'
    const overridden = teacher !== null && teacher !== p.awarded
    const comment = kind === 'tick' || overridden ? null : shortComment(p.feedback)
    marks.push({ stepId: step.stepId, stepNo: step.stepNo, box, awarded, available: step.available, kind, comment })
  }
  return { marks, listed, total: { awarded: awardedTotal, available: availableTotal } }
}
