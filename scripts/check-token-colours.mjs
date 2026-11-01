#!/usr/bin/env node
/**
 * Closed palette (DESIGN.md A3; spec 06 §3): colour literals may appear only in
 * apps/web/src/design/tokens.css. Any hex, rgb(), hsl(), oklch() or named-colour-free
 * literal anywhere else under apps/web fails lint. Derive tints with color-mix() from tokens.
 *
 *   node scripts/check-token-colours.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve('apps/web')
const roots = [path.join(root, 'src'), path.join(root, 'index.html')]
const allowed = new Set([path.join(root, 'src', 'design', 'tokens.css')])
const SCAN_EXTENSIONS = new Set(['.css', '.ts', '.tsx', '.html'])

const HEX = /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g
const FUNCTIONAL = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/g

function* walk(target) {
  let entries
  try {
    entries = readdirSync(target, { withFileTypes: true })
  } catch {
    // A file, not a directory.
    yield target
    return
  }
  for (const entry of entries) {
    const full = path.join(target, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (SCAN_EXTENSIONS.has(path.extname(entry.name))) yield full
  }
}

const findings = []
for (const start of roots) {
  for (const file of walk(start)) {
    if (allowed.has(file)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      // Hex digits only (regex); a line that is plainly an anchor (href="#main") is skipped.
      const hexHits = /href=["']#/.test(line) ? [] : [...line.matchAll(HEX)]
      const fnHits = [...line.matchAll(FUNCTIONAL)]
      for (const hit of [...hexHits, ...fnHits]) {
        findings.push(`${path.relative(process.cwd(), file)}:${index + 1}: ${hit[0]}`)
      }
    })
  }
}

if (findings.length > 0) {
  console.error('check-token-colours: colour literals outside apps/web/src/design/tokens.css:')
  for (const finding of findings) console.error(`  - ${finding}`)
  console.error('Use a Sentinel token (bg-ground, text-fg, text-action, ...) or color-mix() of tokens.')
  process.exit(1)
}
console.log('check-token-colours: clean (colour literals only in tokens.css)')
