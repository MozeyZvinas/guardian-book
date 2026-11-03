import { createDb } from '../db/client.js'
import { ContentValidationError, loadContent } from './loader.js'

/**
 * `pnpm content:load <dir>` (admin CLI; spec 05 §4.5). The directory lives OUTSIDE the
 * repo (`CONTENT_DIR`), so reviewed content never enters git. Exits 2 on a usage error,
 * 1 when any file is invalid (nothing is loaded), 0 on success.
 */
const dir = process.argv[2] ?? process.env['CONTENT_DIR']
const url = process.env['DATABASE_URL']

if (!dir) {
  console.error('content:load: give a directory: pnpm content:load <dir> (or set CONTENT_DIR)')
  process.exit(2)
}
if (!url) {
  console.error('content:load: DATABASE_URL is not set')
  process.exit(2)
}

const handle = createDb(url, 2)
try {
  const report = await loadContent(handle.db, dir)
  console.log(
    `content:load: ${report.files} file(s) in ${report.dir}: ` +
      `${report.inserted.length} inserted, ${report.updated.length} updated, ${report.unchanged.length} unchanged`,
  )
  for (const slug of report.inserted) console.log(`  + ${slug}`)
  for (const slug of report.updated) console.log(`  ~ ${slug} (revision bumped)`)
} catch (err) {
  if (err instanceof ContentValidationError) {
    console.error('content:load: nothing loaded; fix these first:')
    for (const problem of err.problems) console.error(`  - ${problem.file}: ${problem.message}`)
    await handle.close()
    process.exit(1)
  }
  console.error('content:load failed:', err instanceof Error ? err.message : err)
  await handle.close()
  process.exit(1)
}
await handle.close()
