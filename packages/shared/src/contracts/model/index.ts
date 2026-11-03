import type { z } from 'zod'
import { inputClassSchema } from './inputClass.js'
import { toStrictJsonSchema, type StrictJsonSchema } from './jsonSchema.js'
import { noteDraftSchema } from './note.js'
import { noticeOutputSchema } from './notice.js'
import { planOutputSchema } from './plan.js'
import { profileCardsSchema } from './profileCards.js'
import type { ModelPurpose } from './purpose.js'
import { workCheckOutputSchema } from './workCheck.js'

export * from './common.js'
export * from './inputClass.js'
export * from './jsonSchema.js'
export * from './note.js'
export * from './notice.js'
export * from './plan.js'
export * from './profileCards.js'
export * from './purpose.js'
export * from './workCheck.js'

/** The output contract for each purpose. One place, so the gateway and verifier agree. */
export const MODEL_OUTPUT_SCHEMAS = {
  classify: inputClassSchema,
  profile_cards: profileCardsSchema,
  assess: workCheckOutputSchema,
  notice: noticeOutputSchema,
  plan: planOutputSchema,
  note: noteDraftSchema,
} as const satisfies Record<ModelPurpose, z.ZodType>

export type ModelOutputSchemas = typeof MODEL_OUTPUT_SCHEMAS
export type ModelOutputOf<P extends ModelPurpose> = z.infer<ModelOutputSchemas[P]>

/** The strict JSON schema for a purpose, validated against Meta's subset at first use. */
export function modelJsonSchema(purpose: ModelPurpose): StrictJsonSchema {
  return toStrictJsonSchema(purpose, MODEL_OUTPUT_SCHEMAS[purpose])
}
