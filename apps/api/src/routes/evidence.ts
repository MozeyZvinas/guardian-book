import { readFile } from 'node:fs/promises'
import { Router } from 'express'
import { evidenceFileSchema, type EvidenceFile } from '@guardian-book/shared'
import type { Logger } from '../logger.js'

/**
 * The proof page's data (P0-12): `GET /api/evidence` reads the committed results file and
 * nothing else. No database, no session, no number typed here. The file is read on every
 * request (it changes only with a deploy), so changing the file changes the page.
 *
 * Absent file → `{ evidence: null }` and the page shows "No evaluation run committed yet".
 * A file that fails the schema is treated the same way and logged: a broken file publishes
 * nothing rather than something wrong (fail closed).
 */

export interface EvidenceDeps {
  filePath: string
  logger: Logger
}

export async function readEvidenceFile(filePath: string, logger: Logger): Promise<EvidenceFile | null> {
  let raw: string
  try {
    raw = (await readFile(filePath)).toString()
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') logger.warn('evidence: results file unreadable', { filePath })
    return null
  }
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    logger.warn('evidence: results file is not JSON', { filePath })
    return null
  }
  const parsed = evidenceFileSchema.safeParse(json)
  if (!parsed.success) {
    logger.warn('evidence: results file failed the schema', { filePath, issues: parsed.error.issues.length })
    return null
  }
  return parsed.data
}

export function evidenceRouter({ filePath, logger }: EvidenceDeps): Router {
  const router = Router()

  router.get('/api/evidence', async (_req, res, next) => {
    try {
      const evidence = await readEvidenceFile(filePath, logger)
      res.setHeader('Cache-Control', 'no-store')
      res.json({ evidence })
    } catch (err) {
      next(err)
    }
  })

  return router
}
