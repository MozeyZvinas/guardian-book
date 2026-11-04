import type { DbOrTx } from '../db/client.js'
import { auditEvents } from '../db/schema.js'

/** Audit actions this build writes. A closed list so the log stays searchable. */
export type AuditAction =
  | 'auth.sign_up'
  | 'auth.sign_up_refused'
  | 'circle.class_created'
  | 'circle.class_joined'
  | 'circle.guardian_code_issued'
  | 'circle.guardian_linked'
  | 'circle.guardian_revoked'
  | 'profile.cards_set'
  | 'profile.cards_edited'
  | 'profile.cards_refused'
  | 'content.loaded'
  | 'seed.run'
  | 'access.admin_read'
  // B04
  | 'input.created'
  | 'input.kind_changed'
  | 'attempt.created'
  | 'attempt.assess_started'
  | 'attempt.assessed'
  | 'attempt.assess_refused'
  | 'calendar.decided'
  // B06
  | 'attempt.fix_created'
  | 'plan.issued'
  | 'plan.template_issued'
  | 'plan.not_issued'
  | 'guardian.support_given'
  | 'resources.loaded'

export interface AuditInput {
  actorId: string | null
  action: AuditAction
  subjectType: string
  subjectId?: string | null
  outcome: 'ok' | 'refused' | 'error'
  requestId?: string | null
}

/**
 * Writes one audit row (spec 03 §2 `audit_events`). Never carries answer text, emails or
 * names: IDs, an action and an outcome only. Takes the transaction so the audit row commits
 * with the change it records.
 */
export async function recordAudit(db: DbOrTx, input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    actorId: input.actorId,
    action: input.action,
    subjectType: input.subjectType,
    subjectId: input.subjectId ?? null,
    outcome: input.outcome,
    requestId: input.requestId ?? null,
  })
}
