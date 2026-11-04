import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'

/**
 * The privacy suite's input (B08 item 4): the permission harness
 * (`apps/api/test/access.integration.test.ts`) writes one row per "change the ID" test
 * after it runs; `pnpm eval:dev` reads the file and folds the counts into
 * `evals/results/latest.json`. Git-ignored; only the summary is committed.
 */

export const PRIVACY_HARNESS_VERSION = 1

export const privacyHarnessFileSchema = z.strictObject({
  schema_version: z.literal(PRIVACY_HARNESS_VERSION),
  ran_at: z.iso.datetime(),
  rows: z.array(
    z.strictObject({
      name: z.string().min(1),
      /** The HTTP status the test demanded: 4xx rows are denials, 2xx rows are owners served. */
      expect: z.number().int(),
      passed: z.boolean(),
    }),
  ),
})
export type PrivacyHarnessFile = z.infer<typeof privacyHarnessFileSchema>

/** `evals/results/privacy-harness.json` at the repo root (same depth from `src` and `dist`). */
export function defaultPrivacyHarnessPath(): string {
  return path.resolve(import.meta.dirname, '../../../../evals/results/privacy-harness.json')
}

export async function writePrivacyHarness(file: PrivacyHarnessFile, filePath = defaultPrivacyHarnessPath()): Promise<string> {
  const checked = privacyHarnessFileSchema.parse(file)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(checked, null, 2)}\n`)
  return filePath
}

/** The file, or null when there is none; an unreadable file is an error, not a silent skip. */
export async function readPrivacyHarness(filePath = defaultPrivacyHarnessPath()): Promise<PrivacyHarnessFile | null> {
  let raw: string
  try {
    raw = await readFile(filePath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  return privacyHarnessFileSchema.parse(JSON.parse(raw))
}
