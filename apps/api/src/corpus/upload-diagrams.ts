import { logger } from '../logger.js'
import { createStorage } from '../storage/index.js'
import { listCrops, uploadCrops } from './diagrams.js'
import { assertOutsideRepo, corpusConfig, corpusDirs } from './env.js'

/**
 * `pnpm corpus:diagrams`: puts every diagram crop under `<CORPUS_DIR>/diagrams/` into the
 * app's private bucket (`BUCKET_*`) under its key, the item's `diagram_key`. Run with the
 * production bucket's variables after `pnpm content:load` on that database. Exits 2 when
 * the bucket is not configured; nothing is ever made public.
 */
const config = corpusConfig()
const dirs = corpusDirs()
assertOutsideRepo(dirs.root)
const storage = createStorage(config.bucket, logger)
if (!storage) {
  console.error(`corpus:diagrams: BUCKET_* is not set; ${listCrops(dirs.diagrams).length} crop(s) wait in ${dirs.diagrams}`)
  process.exit(2)
}
console.log(`corpus:diagrams: ${await uploadCrops(storage, dirs.diagrams)} crop(s) uploaded`)
