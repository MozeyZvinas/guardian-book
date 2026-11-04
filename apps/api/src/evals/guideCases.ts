import { z } from 'zod'

/**
 * A guide case (brief B17 phase C): one question for B15's "help me with a question",
 * with the final answer the memo gives. Lives in `EVAL_DIR/guide/`, outside the repo for
 * the held-out NSC set; never DBE text in the repo.
 */
export const guideCaseSchema = z.strictObject({
  id: z.string().min(1).max(80),
  item: z.strictObject({ slug: z.string().min(1), prompt_md: z.string().min(1) }),
  /** Relative to EVAL_DIR; a PNG crop the question needs, or null. */
  diagram_path: z.string().min(1).nullable(),
  expected_final_answer: z.string().min(1),
})
export type GuideCase = z.infer<typeof guideCaseSchema>
