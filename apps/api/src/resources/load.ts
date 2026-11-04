import { createDb } from '../db/client.js'
import { ResourceValidationError, loadResources } from './loader.js'

/**
 * `pnpm resources:load <file>` (admin CLI; spec 03 §8.1, §8.5). The file lives OUTSIDE the
 * repo (`RESOURCE_LIST_PATH`). Exits 2 on a usage error, 1 when the file is invalid
 * (nothing is loaded), 0 on success.
 */
const file = process.argv[2] ?? process.env['RESOURCE_LIST_PATH']
const url = process.env['DATABASE_URL']

if (!file) {
  console.error('resources:load: give a file: pnpm resources:load <file> (or set RESOURCE_LIST_PATH)')
  process.exit(2)
}
if (!url) {
  console.error('resources:load: DATABASE_URL is not set')
  process.exit(2)
}

const handle = createDb(url, 2)
try {
  const report = await loadResources(handle.db, file)
  console.log(`resources:load: ${report.file}: ${report.inserted} inserted, ${report.updated} updated, ${report.unchanged} unchanged`)
} catch (err) {
  if (err instanceof ResourceValidationError) {
    console.error('resources:load: nothing loaded; fix these first:')
    for (const problem of err.problems) console.error(`  - ${problem}`)
    await handle.close()
    process.exit(1)
  }
  console.error('resources:load failed:', err instanceof Error ? err.message : err)
  await handle.close()
  process.exit(1)
}
await handle.close()
