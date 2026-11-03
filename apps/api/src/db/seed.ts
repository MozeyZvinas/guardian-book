import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPassword } from 'better-auth/crypto'
import { eq } from 'drizzle-orm'
import { uuidv7 } from '@guardian-book/shared'
import { recordAudit } from '../audit/record.js'
import { loadContent } from '../content/loader.js'
import { deriveCode, hashCode } from '../lib/codes.js'
import { createDb, type Db } from './client.js'
import { account, classMembers, classes, guardianLinks, guidelineApprovals, items, profiles, schools, user } from './schema.js'
import {
  SEED_CLASSES,
  SEED_GUARDIAN_LINKS,
  SEED_GUIDELINE_APPROVALS,
  SEED_PEOPLE,
  SEED_SCHOOLS,
  type SeedClassKey,
} from './seed-data.js'

/** `apps/api/seed/items`, from both `src/db` (tsx) and `dist/db` (node). */
export const SEED_ITEMS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../seed/items')

export interface SeedOptions {
  /** Every seeded person gets this password. From `SEED_PASSWORD` in dev; never committed. */
  password: string
}

export interface SeedResult {
  /** The class codes, derived from the password so they are stable per environment. */
  classCodes: Record<SeedClassKey, string>
  items: { inserted: number; updated: number; unchanged: number }
}

/**
 * `pnpm db:seed` (idempotent; brief B02 §7). Every insert is an upsert keyed on a fixed
 * UUID, so running it twice leaves the same row counts. People are
 * `synthetic_self_generated` (recorded in the audit row; profiles carry no provenance
 * column, spec 03 §9.1), the two sample items `original_human`.
 */
export async function seed(db: Db, options: SeedOptions): Promise<SeedResult> {
  if (!options.password || options.password.length < 8) {
    throw new Error('seed: a password of at least 8 characters is required (SEED_PASSWORD)')
  }
  const passwordHash = await hashPassword(options.password)
  const attestedAt = new Date('2026-10-28T08:00:00Z')

  const classCodes = Object.fromEntries(
    Object.keys(SEED_CLASSES).map((key) => [key, deriveCode(options.password, `class:${key}`)]),
  ) as Record<SeedClassKey, string>

  await db.transaction(async (tx) => {
    for (const school of Object.values(SEED_SCHOOLS)) {
      await tx
        .insert(schools)
        .values({ id: school.id, name: school.name, kind: 'fictional' })
        .onConflictDoUpdate({ target: schools.id, set: { name: school.name, kind: 'fictional' } })
    }

    for (const p of Object.values(SEED_PEOPLE)) {
      const schoolId = p.school ? SEED_SCHOOLS[p.school].id : null
      await tx
        .insert(user)
        .values({ id: p.id, name: p.nickname, email: p.email })
        .onConflictDoUpdate({ target: user.id, set: { name: p.nickname, email: p.email } })
      const [existingAccount] = await tx
        .select({ id: account.id })
        .from(account)
        .where(eq(account.userId, p.id))
        .limit(1)
      if (existingAccount) {
        await tx.update(account).set({ password: passwordHash, updatedAt: new Date() }).where(eq(account.id, existingAccount.id))
      } else {
        await tx.insert(account).values({
          id: uuidv7(),
          accountId: p.id,
          providerId: 'credential',
          userId: p.id,
          password: passwordHash,
        })
      }
      await tx
        .insert(profiles)
        .values({ userId: p.id, role: p.role, nickname: p.nickname, ageAttestedAt: attestedAt, schoolId })
        .onConflictDoUpdate({ target: profiles.userId, set: { role: p.role, nickname: p.nickname, schoolId } })
    }

    for (const [key, cls] of Object.entries(SEED_CLASSES) as [SeedClassKey, (typeof SEED_CLASSES)[SeedClassKey]][]) {
      const codeHash = hashCode(classCodes[key])
      await tx
        .insert(classes)
        .values({
          id: cls.id,
          name: cls.name,
          teacherId: SEED_PEOPLE[cls.teacher].id,
          schoolId: SEED_SCHOOLS[cls.school].id,
          codeHash,
        })
        .onConflictDoUpdate({
          target: classes.id,
          set: { name: cls.name, teacherId: SEED_PEOPLE[cls.teacher].id, schoolId: SEED_SCHOOLS[cls.school].id, codeHash },
        })
      for (const learner of cls.learners) {
        await tx.insert(classMembers).values({ classId: cls.id, learnerId: SEED_PEOPLE[learner].id }).onConflictDoNothing()
      }
    }

    for (const link of SEED_GUARDIAN_LINKS) {
      const learnerId = SEED_PEOPLE[link.learner].id
      const guardianId = SEED_PEOPLE[link.guardian].id
      const inviteCodeHash = hashCode(deriveCode(options.password, `guardian:${link.learner}:${link.guardian}`))
      await tx
        .insert(guardianLinks)
        .values({ learnerId, guardianId, inviteCodeHash })
        .onConflictDoUpdate({ target: [guardianLinks.learnerId, guardianLinks.guardianId], set: { revokedAt: null } })
    }

    await recordAudit(tx, {
      actorId: null,
      action: 'seed.run',
      subjectType: 'seed',
      subjectId: 'synthetic_self_generated',
      outcome: 'ok',
    })
  })

  const report = await loadContent(db, SEED_ITEMS_DIR)

  await db.transaction(async (tx) => {
    const seeded = await tx.select({ id: items.id, revision: items.revision }).from(items)
    for (const classKey of SEED_GUIDELINE_APPROVALS) {
      const cls = SEED_CLASSES[classKey]
      for (const item of seeded) {
        await tx
          .insert(guidelineApprovals)
          .values({
            classId: cls.id,
            itemId: item.id,
            itemRevision: item.revision,
            approvedBy: SEED_PEOPLE[cls.teacher].id,
          })
          .onConflictDoNothing()
      }
    }
  })

  return {
    classCodes,
    items: { inserted: report.inserted.length, updated: report.updated.length, unchanged: report.unchanged.length },
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const url = process.env['DATABASE_URL']
  const password = process.env['SEED_PASSWORD']
  if (!url) {
    console.error('db:seed: DATABASE_URL is not set')
    process.exit(2)
  }
  if (!password) {
    console.error('db:seed: SEED_PASSWORD is not set (8+ characters; every demo person gets it)')
    process.exit(2)
  }
  const handle = createDb(url, 2)
  seed(handle.db, { password })
    .then((result) => {
      console.log(`db:seed: ok. Items: ${JSON.stringify(result.items)}. Demo logins: <key>@demo.guardianbook.test`)
      for (const [key, code] of Object.entries(result.classCodes)) console.log(`  class ${key} code: ${code}`)
      return handle.close()
    })
    .catch(async (err: unknown) => {
      console.error('db:seed failed:', err instanceof Error ? err.message : err)
      await handle.close()
      process.exit(1)
    })
}
