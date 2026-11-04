import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { assertOutsideRepo, corpusConfig, corpusDirs } from './env.js'
import { createCorpusBucket } from './r2.js'

/**
 * `pnpm corpus:list`: lists the DBE bucket and writes the key list to
 * `<CORPUS_DIR>/catalogue-keys.json` (outside the repo). Prints counts per top-level
 * prefix and nothing else. Exits 2 when the bucket is not configured.
 */
const config = corpusConfig()
const bucket = createCorpusBucket(config.corpus)
if (!bucket) {
  console.error('corpus:list: DBE_R2_* is not set; nothing to list.')
  process.exit(2)
}
const dirs = corpusDirs()
assertOutsideRepo(dirs.root)
const objects = await bucket.list()
const file = path.join(dirs.root, 'catalogue-keys.json')
writeFileSync(file, `${JSON.stringify(objects, null, 1)}\n`)
const prefixes = new Map<string, number>()
for (const { key } of objects) {
  const top = key.split('/').slice(0, 2).join('/')
  prefixes.set(top, (prefixes.get(top) ?? 0) + 1)
}
console.log(`corpus:list: ${objects.length} object(s); keys written to ${file}`)
for (const [prefix, count] of [...prefixes.entries()].sort()) console.log(`  ${String(count).padStart(5)}  ${prefix}`)
