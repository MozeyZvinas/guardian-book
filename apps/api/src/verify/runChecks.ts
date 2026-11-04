import { MODEL_OUTPUT_SCHEMAS, type ModelOutputOf, type ModelPurpose } from '@guardian-book/shared'
import { WORK_CHECK_RULES } from './checks/work.js'
import { STEP_HINT_RULES, TRANSCRIBE_RULES } from './checks/hint.js'
import { NOTICE_RULES } from './checks/notice.js'
import { CLASSIFY_RULES, NOTE_RULES, PLAN_RULES, PROFILE_CARDS_RULES } from './checks/plan.js'
import { TRANSLATE_RULES } from './checks/translate.js'
import type { CheckContexts, CheckResult, CheckRule } from './types.js'

/**
 * `runChecks(purpose, output, context)`: SCHEMA_INVALID first (nothing else can run on a
 * malformed object), then every rule for the purpose. All rules run even after a failure,
 * so the teacher sees the full pass/fail list and a re-ask names every problem at once.
 */

export interface RunChecksResult<T = unknown> {
  passed: boolean
  checks: CheckResult[]
  failed: CheckResult[]
  /** True when a failed rule is not retryable: abstain and hand over, do not re-ask. */
  abstain: boolean
  /** The schema-parsed output when SCHEMA_INVALID passed, else null. Still untrusted unless `passed`. */
  data: T | null
}

type RuleSets = { [P in ModelPurpose]: CheckRule<ModelOutputOf<P>, CheckContexts[P]>[] }

export const RULE_SETS: RuleSets = {
  classify: CLASSIFY_RULES,
  profile_cards: PROFILE_CARDS_RULES,
  assess: WORK_CHECK_RULES,
  notice: NOTICE_RULES,
  plan: PLAN_RULES,
  note: NOTE_RULES,
  translate: TRANSLATE_RULES,
  transcribe: TRANSCRIBE_RULES,
  step_hint: STEP_HINT_RULES,
}

export function runChecks<P extends ModelPurpose>(purpose: P, output: unknown, context: CheckContexts[P]): RunChecksResult<ModelOutputOf<P>> {
  const schema = MODEL_OUTPUT_SCHEMAS[purpose]
  const parsed = schema.safeParse(output)
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 8).map((issue) => `${issue.path.map(String).join('.') || '$'}: ${issue.message}`)
    const check: CheckResult = { code: 'SCHEMA_INVALID', passed: false, detail: `the output does not match the schema: ${issues.join('; ')}` }
    return { passed: false, checks: [check], failed: [check], abstain: false, data: null }
  }
  const data = parsed.data as ModelOutputOf<P>
  const checks: CheckResult[] = [{ code: 'SCHEMA_INVALID', passed: true, detail: 'matches the schema' }]
  let abstain = false
  const rules = RULE_SETS[purpose] as CheckRule<ModelOutputOf<P>, CheckContexts[P]>[]
  for (const rule of rules) {
    const outcome = rule.run(data, context)
    checks.push({ code: rule.code, ...outcome })
    if (!outcome.passed && !rule.retryable) abstain = true
  }
  const failed = checks.filter((check) => !check.passed)
  return { passed: failed.length === 0, checks, failed, abstain, data }
}

/** Whether a set of check results allows a re-ask: something failed, and nothing non-retryable did. */
export function isRetryable<P extends ModelPurpose>(purpose: P, failed: CheckResult[]): boolean {
  if (failed.length === 0) return false
  const rules = RULE_SETS[purpose] as CheckRule<unknown, unknown>[]
  const retryableCodes = new Set(rules.filter((rule) => rule.retryable).map((rule) => rule.code))
  retryableCodes.add('SCHEMA_INVALID')
  return failed.every((check) => retryableCodes.has(check.code))
}
