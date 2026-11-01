import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pkg = require('../package.json') as { version: string }

/** Package version, plus the short commit when the platform provides it. */
export function appVersion(env: NodeJS.ProcessEnv = process.env): string {
  const sha = env['RAILWAY_GIT_COMMIT_SHA'] ?? env['GIT_SHA']
  return sha ? `${pkg.version}+${sha.slice(0, 7)}` : pkg.version
}
