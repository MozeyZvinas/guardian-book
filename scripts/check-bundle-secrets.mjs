#!/usr/bin/env node
/**
 * Scans a built web bundle for secrets before an image is built (spec 04 §4).
 *
 *   node scripts/check-bundle-secrets.mjs [dir=apps/web/dist]
 *
 * Fails (exit 1) on: the literals META_API_KEY or BETTER_AUTH_SECRET, or an `sk-`-style
 * token of 20+ characters with high Shannon entropy. Exit 2 when the directory is missing.
 * Matches are reported masked; the script never prints a whole token.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const dir = path.resolve(process.argv[2] ?? 'apps/web/dist')
const LITERALS = ['META_API_KEY', 'BETTER_AUTH_SECRET']
const TOKEN = /\bsk-[A-Za-z0-9_-]{20,}\b/g
const MIN_ENTROPY = 3.5
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.json', '.map', '.txt', '.svg', '.webmanifest', '.xml'])

function shannonEntropy(text) {
  const counts = new Map()
  for (const ch of text) counts.set(ch, (counts.get(ch) ?? 0) + 1)
  let entropy = 0
  for (const count of counts.values()) {
    const p = count / text.length
    entropy -= p * Math.log2(p)
  }
  return entropy
}

function* walk(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) yield full
  }
}

function mask(token) {
  return `${token.slice(0, 6)}…(${token.length} chars)`
}

try {
  if (!statSync(dir).isDirectory()) throw new Error('not a directory')
} catch {
  console.error(`check-bundle-secrets: ${dir} is missing. Build the web app first (pnpm build).`)
  process.exit(2)
}

const findings = []
let scanned = 0
for (const file of walk(dir)) {
  scanned += 1
  const text = readFileSync(file, 'utf8')
  const rel = path.relative(process.cwd(), file)
  for (const literal of LITERALS) {
    if (text.includes(literal)) findings.push(`${rel}: contains the literal ${literal}`)
  }
  for (const match of text.matchAll(TOKEN)) {
    const token = match[0]
    if (shannonEntropy(token.slice(3)) >= MIN_ENTROPY) {
      findings.push(`${rel}: high-entropy sk- token ${mask(token)}`)
    }
  }
}

if (findings.length > 0) {
  console.error(`check-bundle-secrets: ${findings.length} finding(s) in ${scanned} file(s):`)
  for (const finding of findings) console.error(`  - ${finding}`)
  process.exit(1)
}

console.log(`check-bundle-secrets: clean (${scanned} text file(s) scanned under ${path.relative(process.cwd(), dir)})`)
