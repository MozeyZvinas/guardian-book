import { z } from 'zod'
import { shortText } from './common.js'

/**
 * Tell me about you (P0-02): the learner's free text turned into cards they can edit.
 * Spec 03 §8.1: `{dream, subjects[], hardest_subject, how_i_learn}`.
 *
 * No personality typing and no learning-style label: the verifier's INFERENCE_FORBIDDEN
 * rule rejects outputs that try. The raw text never reaches a guardian.
 */

export const MAX_PROFILE_SUBJECTS = 12

export const profileCardsSchema = z.strictObject({
  dream: shortText(200).nullable(),
  subjects: z.array(shortText(60)).max(MAX_PROFILE_SUBJECTS),
  hardest_subject: shortText(60).nullable(),
  /** What the learner said works for them, in their own terms. Never a label. */
  how_i_learn: shortText(300).nullable(),
})
export type ProfileCards = z.infer<typeof profileCardsSchema>
