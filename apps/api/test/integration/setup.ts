import { checkDatabase } from '../../src/db/health.js'
import { integrationDatabaseUrl } from './harness.js'

// Fails fast, before any test, if DATABASE_URL is not loopback.
const url = integrationDatabaseUrl()

// Postgres needs a moment after `docker compose up -d`; wait up to 20 s for it.
const deadline = Date.now() + 20_000
let status = await checkDatabase(url, 2000)
while (status !== 'up' && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 500))
  status = await checkDatabase(url, 2000)
}
if (status !== 'up') {
  throw new Error(
    'No Postgres answered on the loopback database URL. Run `docker compose up -d` (local) or check the service container (CI).',
  )
}
