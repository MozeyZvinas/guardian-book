import { z } from 'zod'

/**
 * Provenance and training permission (spec 03 §9.1; D35; P0-11b).
 *
 * Every stored artifact says where it came from and whether it may ever be used for
 * training. The default is `not_permitted`, and nothing in this build sets `permitted`.
 */
export const PROVENANCES = [
  'original_human',
  'school_provided',
  'teacher_verified',
  'student_provided',
  'model_generated',
  'licensed_content',
  'synthetic_self_generated',
] as const

export const provenanceSchema = z.enum(PROVENANCES)
export type Provenance = z.infer<typeof provenanceSchema>

export const TRAINING_PERMISSIONS = ['not_permitted', 'evaluation_only', 'permitted'] as const
export const trainingPermissionSchema = z.enum(TRAINING_PERMISSIONS)
export type TrainingPermission = z.infer<typeof trainingPermissionSchema>

export const DEFAULT_TRAINING_PERMISSION: TrainingPermission = 'not_permitted'

/** Required detail when provenance is `model_generated`. */
export const modelProvenanceDetailSchema = z.object({
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  version: z.string().min(1).max(100),
  model_run_id: z.string().uuid(),
})
export type ModelProvenanceDetail = z.infer<typeof modelProvenanceDetailSchema>

/**
 * The kinds of thing this build stores, and the provenance each one carries by default.
 * Model outputs are `model_generated` and must carry the detail object; the teacher's own
 * words are `teacher_verified`; a learner's own work is `student_provided`.
 */
export const PROVENANCE_KINDS = [
  'seed_person',
  'seed_item',
  'loaded_item',
  'sign_up',
  'learner_work',
  'learner_input',
  'model_output',
  'teacher_review',
  'teacher_note',
  'licensed_resource',
] as const
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number]

const PROVENANCE_FOR: Record<ProvenanceKind, Provenance> = {
  seed_person: 'synthetic_self_generated',
  seed_item: 'original_human',
  loaded_item: 'original_human',
  sign_up: 'student_provided',
  learner_work: 'student_provided',
  learner_input: 'student_provided',
  model_output: 'model_generated',
  teacher_review: 'teacher_verified',
  teacher_note: 'teacher_verified',
  licensed_resource: 'licensed_content',
}

/** The provenance an artifact of `kind` carries. Pure; the only mapping in the codebase. */
export function provenanceFor(kind: ProvenanceKind): Provenance {
  return PROVENANCE_FOR[kind]
}

/** The three columns every provenance-bearing insert sets. */
export const provenanceColumnsSchema = z.object({
  provenance: provenanceSchema,
  provenanceDetail: modelProvenanceDetailSchema.nullable().default(null),
  trainingPermission: trainingPermissionSchema.default(DEFAULT_TRAINING_PERMISSION),
})
export type ProvenanceColumns = z.infer<typeof provenanceColumnsSchema>

/**
 * Builds the provenance columns for an insert. `model_generated` requires the detail
 * object; any other provenance refuses one. Training permission is never `permitted`.
 */
export function provenanceColumns(
  kind: ProvenanceKind,
  detail?: ModelProvenanceDetail,
): { provenance: Provenance; provenanceDetail: ModelProvenanceDetail | null; trainingPermission: TrainingPermission } {
  const provenance = provenanceFor(kind)
  if (provenance === 'model_generated' && !detail) {
    throw new Error('model_generated provenance needs {provider, model, version, model_run_id}')
  }
  if (provenance !== 'model_generated' && detail) {
    throw new Error(`provenance ${provenance} does not take a model detail`)
  }
  return {
    provenance,
    provenanceDetail: detail ? modelProvenanceDetailSchema.parse(detail) : null,
    trainingPermission: DEFAULT_TRAINING_PERMISSION,
  }
}
