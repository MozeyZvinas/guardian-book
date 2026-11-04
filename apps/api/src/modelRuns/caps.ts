import { and, eq, sql } from 'drizzle-orm'
import type { DbOrTx } from '../db/client.js'
import { classMembers, classes, modelUsageDaily } from '../db/schema.js'
import { hashCode } from '../lib/codes.js'
import { HttpError } from '../lib/http.js'

/**
 * Spend caps (spec 03 §5; spec 02 P0-13; brief B04 §3). Before a model call the caller
 * checks today's usage against the per-user call cap (`MODEL_USER_DAILY_CALLS`) and the
 * global budget (`MODEL_DAILY_BUDGET_USD`); after the call it adds what was spent. "Today"
 * is the South African day (SAST, UTC+2, no daylight saving).
 */

export const DEFAULT_USER_DAILY_CALLS = 60
export const DEFAULT_DAILY_BUDGET_USD = 5
const SAST_OFFSET_MS = 2 * 60 * 60 * 1000

export interface CapLimits {
  userDailyCalls: number
  dailyBudgetUsd: number
  /**
   * B09: a learner in the public "Try it" class (matched by the class code's hash) gets
   * this tighter daily call cap (`TRY_USER_DAILY_CALLS`, default 6) instead of the user cap.
   */
  tryIt?: { classCodeHash: string; userDailyCalls: number }
}

export function capLimits(
  config: { userDailyCalls: number | null; dailyBudgetUsd: number | null },
  tryIt?: { classCode: string | null; userDailyCalls: number },
): CapLimits {
  const limits: CapLimits = {
    userDailyCalls: config.userDailyCalls ?? DEFAULT_USER_DAILY_CALLS,
    dailyBudgetUsd: config.dailyBudgetUsd ?? DEFAULT_DAILY_BUDGET_USD,
  }
  if (tryIt?.classCode) limits.tryIt = { classCodeHash: hashCode(tryIt.classCode), userDailyCalls: tryIt.userDailyCalls }
  return limits
}

/** Pure: the limits that apply to one user, given whether they are in the try-it class. */
export function effectiveLimits(limits: CapLimits, inTryClass: boolean): CapLimits {
  if (!limits.tryIt || !inTryClass) return limits
  return { ...limits, userDailyCalls: Math.min(limits.userDailyCalls, limits.tryIt.userDailyCalls) }
}

/** True when the user is a member of the class whose code hashes to `classCodeHash`. */
export async function isInClassByCodeHash(db: DbOrTx, userId: string, classCodeHash: string): Promise<boolean> {
  const [row] = await db
    .select({ classId: classMembers.classId })
    .from(classMembers)
    .innerJoin(classes, eq(classes.id, classMembers.classId))
    .where(and(eq(classMembers.learnerId, userId), eq(classes.codeHash, classCodeHash)))
    .limit(1)
  return Boolean(row)
}

/** YYYY-MM-DD in Africa/Johannesburg. */
export function sastDay(now: Date): string {
  return new Date(now.getTime() + SAST_OFFSET_MS).toISOString().slice(0, 10)
}

export type CapReason = 'user_calls' | 'global_budget'

export type CapCheck = { ok: true; remainingCalls: number } | { ok: false; reason: CapReason }

export function budgetExhausted(reason: CapReason): HttpError {
  const message =
    reason === 'user_calls'
      ? 'You have used today’s checks. Your work is saved; try again tomorrow, or ask your teacher to look.'
      : 'Today’s model budget is used up for everyone. Your work is saved; your teacher can still check it.'
  return new HttpError(429, 'budget_exhausted', message)
}

export async function usageToday(db: DbOrTx, userId: string, now: Date): Promise<{ userCalls: number; globalCostUsd: number }> {
  const day = sastDay(now)
  const [mine] = await db
    .select({ calls: modelUsageDaily.calls })
    .from(modelUsageDaily)
    .where(and(eq(modelUsageDaily.userId, userId), eq(modelUsageDaily.day, day)))
    .limit(1)
  const [all] = await db
    .select({ cost: sql<string>`coalesce(sum(${modelUsageDaily.costUsd}), 0)::text` })
    .from(modelUsageDaily)
    .where(eq(modelUsageDaily.day, day))
  return { userCalls: mine?.calls ?? 0, globalCostUsd: Number(all?.cost ?? 0) }
}

/** Pure decision, so the rule has a unit test without a database. */
export function decideCaps(usage: { userCalls: number; globalCostUsd: number }, limits: CapLimits): CapCheck {
  if (usage.userCalls >= limits.userDailyCalls) return { ok: false, reason: 'user_calls' }
  if (usage.globalCostUsd >= limits.dailyBudgetUsd) return { ok: false, reason: 'global_budget' }
  return { ok: true, remainingCalls: limits.userDailyCalls - usage.userCalls }
}

export async function checkCaps(db: DbOrTx, userId: string, limits: CapLimits, now: Date): Promise<CapCheck> {
  const inTryClass = limits.tryIt ? await isInClassByCodeHash(db, userId, limits.tryIt.classCodeHash) : false
  return decideCaps(await usageToday(db, userId, now), effectiveLimits(limits, inTryClass))
}

/** Adds the calls and cost of a finished verified call to today's row (upsert). */
export async function recordUsage(db: DbOrTx, input: { userId: string; calls: number; costUsd: number; now: Date }): Promise<void> {
  if (input.calls <= 0 && input.costUsd <= 0) return
  const cost = input.costUsd.toFixed(6)
  await db
    .insert(modelUsageDaily)
    .values({ userId: input.userId, day: sastDay(input.now), calls: input.calls, costUsd: cost })
    .onConflictDoUpdate({
      target: [modelUsageDaily.userId, modelUsageDaily.day],
      set: {
        calls: sql`${modelUsageDaily.calls} + ${input.calls}`,
        costUsd: sql`${modelUsageDaily.costUsd} + ${cost}::numeric`,
      },
    })
}
