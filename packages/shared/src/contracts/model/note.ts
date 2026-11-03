import { z } from 'zod'
import { evidenceIdSchema, shortText } from './common.js'

/**
 * A drafted note home (P0-10): the model drafts, the teacher edits and approves, and
 * only then does it reach a guardian. The draft is plain language about one learner,
 * cites evidence, and infers nothing about mood, health or personality.
 */

export const MAX_NOTE_CHARS = 600

export const noteDraftSchema = z.strictObject({
  /** ≤ 600 chars (spec 03 §8.1 `notes.draft_text`). */
  text: shortText(MAX_NOTE_CHARS),
  evidence_event_ids: z.array(evidenceIdSchema).min(1).max(20),
})
export type NoteDraft = z.infer<typeof noteDraftSchema>
