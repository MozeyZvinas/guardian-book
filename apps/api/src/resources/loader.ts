import { readFileSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { provenanceColumns, resourceFileSchema, type ResourceFileEntry } from '@guardian-book/shared'
import { recordAudit } from '../audit/record.js'
import type { Db } from '../db/client.js'
import { resources } from '../db/schema.js'

/**
 * The vetted resource list (spec 03 §8.1 `resources`: "Loaded by admin CLI only. Plans may
 * cite `approved` rows only"; brief B06 §3). One JSON file, outside the repo
 * (`RESOURCE_LIST_PATH`), validated whole: one bad entry and nothing is written. Rows are
 * keyed on the URL; a re-run with the same file changes nothing. Provenance
 * `licensed_content`, training never permitted.
 */

export interface ResourceLoadReport {
  file: string
  inserted: number
  updated: number
  unchanged: number
}

export class ResourceValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(`resources: ${problems.length} problem(s)`)
    this.name = 'ResourceValidationError'
  }
}

export function readResourceFile(file: string): ResourceFileEntry[] {
  const absolute = path.resolve(file)
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(absolute, 'utf8'))
  } catch (err) {
    throw new ResourceValidationError([`${absolute}: ${err instanceof Error ? err.message : String(err)}`])
  }
  const parsed = resourceFileSchema.safeParse(raw)
  if (!parsed.success) {
    throw new ResourceValidationError(parsed.error.issues.map((issue) => `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}`))
  }
  const urls = new Set<string>()
  const duplicates = parsed.data.resources.filter((entry) => (urls.has(entry.url) ? true : (urls.add(entry.url), false))).map((entry) => `duplicate url ${entry.url}`)
  if (duplicates.length > 0) throw new ResourceValidationError(duplicates)
  return parsed.data.resources
}

function same(existing: typeof resources.$inferSelect, next: ResourceFileEntry): boolean {
  return (
    existing.title === next.title &&
    existing.licence === next.licence &&
    existing.attribution === next.attribution &&
    existing.free === next.free &&
    existing.approved === next.approved &&
    JSON.stringify(existing.skillTags) === JSON.stringify(next.skill_tags)
  )
}

export async function loadResources(db: Db, file: string, options: { actorId?: string | null } = {}): Promise<ResourceLoadReport> {
  const entries = readResourceFile(file)
  const report: ResourceLoadReport = { file: path.resolve(file), inserted: 0, updated: 0, unchanged: 0 }
  await db.transaction(async (tx) => {
    for (const entry of entries) {
      const values = { title: entry.title, url: entry.url, licence: entry.licence, attribution: entry.attribution, free: entry.free, skillTags: entry.skill_tags, approved: entry.approved, ...provenanceColumns('licensed_resource') }
      const [existing] = await tx.select().from(resources).where(eq(resources.url, entry.url)).limit(1)
      let id: string
      if (existing) {
        if (same(existing, entry)) {
          report.unchanged += 1
          continue
        }
        await tx.update(resources).set(values).where(eq(resources.id, existing.id))
        id = existing.id
        report.updated += 1
      } else {
        const [row] = await tx.insert(resources).values(values).returning({ id: resources.id })
        if (!row) throw new Error('resource insert returned no row')
        id = row.id
        report.inserted += 1
      }
      await recordAudit(tx, { actorId: options.actorId ?? null, action: 'resources.loaded', subjectType: 'resource', subjectId: id, outcome: 'ok' })
    }
  })
  return report
}
