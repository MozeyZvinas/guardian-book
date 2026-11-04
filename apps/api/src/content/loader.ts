import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import { itemFileSchema, type ItemFile } from '@guardian-book/shared'
import { recordAudit } from '../audit/record.js'
import type { Db } from '../db/client.js'
import { guidelineSteps, items } from '../db/schema.js'

/**
 * The content loader (spec 03 §4 "Load content: admin, CLI only"; brief B02 §6).
 *
 * Reads every `*.json` file in a directory, validates each against `itemFileSchema`
 * (marks sum, step types M/A/CA, provenance and reviewer present, `source: original` or,
 * since B17 (D40), `dbe_nsc` with its `source_ref` and `attribution`), and only if EVERY
 * file is valid loads them in one transaction as `approved` items.
 * A single invalid file means nothing is written. Re-running with unchanged files changes
 * nothing; a changed item bumps its revision and replaces its steps.
 */

export interface LoadReport {
  dir: string
  files: number
  inserted: string[]
  updated: string[]
  unchanged: string[]
}

export class ContentValidationError extends Error {
  constructor(readonly problems: { file: string; message: string }[]) {
    super(`content: ${problems.length} invalid file(s)`)
    this.name = 'ContentValidationError'
  }
}

export function readContentDir(dir: string): { file: string; item: ItemFile }[] {
  const absolute = path.resolve(dir)
  if (!statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) {
    throw new ContentValidationError([{ file: absolute, message: 'not a directory' }])
  }
  const files = readdirSync(absolute)
    .filter((name) => name.endsWith('.json'))
    .sort()
  const problems: { file: string; message: string }[] = []
  const parsed: { file: string; item: ItemFile }[] = []
  const slugs = new Set<string>()
  for (const name of files) {
    const file = path.join(absolute, name)
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(file, 'utf8'))
    } catch (err) {
      problems.push({ file, message: `not valid JSON: ${err instanceof Error ? err.message : String(err)}` })
      continue
    }
    const result = itemFileSchema.safeParse(raw)
    if (!result.success) {
      for (const issue of result.error.issues) {
        problems.push({ file, message: `${issue.path.map(String).join('.') || '(root)'}: ${issue.message}` })
      }
      continue
    }
    if (slugs.has(result.data.slug)) {
      problems.push({ file, message: `duplicate slug "${result.data.slug}"` })
      continue
    }
    slugs.add(result.data.slug)
    parsed.push({ file, item: result.data })
  }
  if (problems.length > 0) throw new ContentValidationError(problems)
  return parsed
}

type ExistingItem = typeof items.$inferSelect
type ExistingStep = typeof guidelineSteps.$inferSelect

function sameContent(existing: ExistingItem, steps: ExistingStep[], next: ItemFile): boolean {
  const before = JSON.stringify({
    topic: existing.topic,
    skillTags: existing.skillTags,
    promptMd: existing.promptMd,
    diagramKey: existing.diagramKey,
    maxMarks: existing.maxMarks,
    author: existing.author,
    reviewer: existing.reviewer,
    reviewedAt: existing.reviewedAt?.toISOString() ?? null,
    provenance: existing.provenance,
    source: existing.source,
    sourceRef: existing.sourceRef,
    attribution: existing.attribution,
    heldOut: existing.heldOut,
    steps: [...steps]
      .sort((a, b) => a.stepNo - b.stepNo)
      .map((s) => [s.stepNo, s.stepType, s.criterion, s.marks, s.skillTag, s.notes]),
  })
  const after = JSON.stringify({
    topic: next.topic,
    skillTags: next.skill_tags,
    promptMd: next.prompt_md,
    diagramKey: next.diagram_key,
    maxMarks: next.max_marks,
    author: next.author,
    reviewer: next.reviewer,
    reviewedAt: next.reviewed_at ? new Date(next.reviewed_at).toISOString() : null,
    provenance: next.provenance,
    source: next.source,
    sourceRef: next.source_ref,
    attribution: next.attribution,
    heldOut: next.held_out,
    steps: next.guideline_steps.map((s) => [s.step_no, s.step_type, s.criterion, s.marks, s.skill_tag, s.notes]),
  })
  return before === after
}

export async function loadContent(
  db: Db,
  dir: string,
  options: { actorId?: string | null; requestId?: string | null } = {},
): Promise<LoadReport> {
  const parsed = readContentDir(dir)
  const report: LoadReport = { dir: path.resolve(dir), files: parsed.length, inserted: [], updated: [], unchanged: [] }

  await db.transaction(async (tx) => {
    for (const { item } of parsed) {
      const [existing] = await tx.select().from(items).where(eq(items.slug, item.slug)).limit(1)
      const base = {
        topic: item.topic,
        skillTags: item.skill_tags,
        promptMd: item.prompt_md,
        diagramKey: item.diagram_key,
        maxMarks: item.max_marks,
        status: 'approved' as const,
        author: item.author,
        reviewer: item.reviewer,
        reviewedAt: item.reviewed_at ? new Date(item.reviewed_at) : null,
        source: item.source,
        sourceRef: item.source_ref,
        attribution: item.attribution,
        heldOut: item.held_out,
        provenance: item.provenance,
        provenanceDetail: null,
        trainingPermission: 'not_permitted' as const,
      }
      let itemId: string
      if (existing) {
        const steps = await tx.select().from(guidelineSteps).where(eq(guidelineSteps.itemId, existing.id))
        if (sameContent(existing, steps, item) && existing.status === 'approved') {
          report.unchanged.push(item.slug)
          continue
        }
        await tx
          .update(items)
          .set({ ...base, revision: existing.revision + 1 })
          .where(eq(items.id, existing.id))
        await tx.delete(guidelineSteps).where(eq(guidelineSteps.itemId, existing.id))
        itemId = existing.id
        report.updated.push(item.slug)
      } else {
        const [row] = await tx
          .insert(items)
          .values({ slug: item.slug, ...base, revision: 1 })
          .returning({ id: items.id })
        if (!row) throw new Error('item insert returned no row')
        itemId = row.id
        report.inserted.push(item.slug)
      }
      await tx.insert(guidelineSteps).values(
        item.guideline_steps.map((step) => ({
          itemId,
          stepNo: step.step_no,
          stepType: step.step_type,
          criterion: step.criterion,
          marks: step.marks,
          skillTag: step.skill_tag,
          notes: step.notes,
          provenance: item.provenance,
          provenanceDetail: null,
          trainingPermission: 'not_permitted' as const,
        })),
      )
      await recordAudit(tx, {
        actorId: options.actorId ?? null,
        action: 'content.loaded',
        subjectType: 'item',
        subjectId: itemId,
        outcome: 'ok',
        requestId: options.requestId ?? null,
      })
    }
  })

  return report
}
