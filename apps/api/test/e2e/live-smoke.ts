import pg from 'pg'
import sharp from 'sharp'
import { integrationDatabaseUrl } from '../integration/harness.js'

/**
 * Live smoke for B04 (brief §7): against a running e2e server started with `E2E_LIVE=1`
 * (real Meta gateway from `.env`, memory storage, fresh seeded database), one typed and
 * one photographed answer on a seeded item, through the public API exactly as the web
 * app uses it. Prints request IDs, cost and latency per model run. Never prints the key.
 *
 *   E2E_LIVE=1 pnpm --filter @guardian-book/api exec tsx test/e2e/serve.ts   (terminal 1)
 *   pnpm --filter @guardian-book/api exec tsx test/e2e/live-smoke.ts         (terminal 2)
 */

const base = process.env['E2E_BASE_URL'] ?? `http://127.0.0.1:${process.env['E2E_PORT'] ?? 8097}`
const PASSWORD = 'integration-only-password'

/** Synthetic "handwriting": the working rendered as an image, so the photo path runs end to end. */
async function renderWorking(lines: string[]): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <rect width="100%" height="100%" fill="#fbf8f1"/>
    ${lines.map((line, i) => `<text x="80" y="${160 + i * 130}" font-family="Bradley Hand, Comic Sans MS, cursive" font-size="64" fill="#1e2a5a">${line.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`).join('\n')}
  </svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer()
}

async function call(path: string, init: RequestInit & { cookie?: string } = {}): Promise<{ status: number; body: unknown; headers: Headers }> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    redirect: 'manual',
    headers: { accept: 'application/json', origin: base, ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers ?? {}) },
  })
  const text = await res.text()
  let body: unknown = text
  try {
    body = JSON.parse(text)
  } catch {
    // not JSON
  }
  return { status: res.status, body, headers: res.headers }
}

async function signIn(email: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`)
  return res.headers.getSetCookie().map((line) => line.split(';')[0] ?? '').join('; ')
}

async function waitForAttempt(cookie: string, attemptId: string): Promise<Record<string, unknown>> {
  const started = Date.now()
  for (;;) {
    const view = await call(`/api/attempts/${attemptId}`, { cookie })
    const data = view.body as { attempt: { status: string } }
    if (data.attempt.status !== 'assessing' && data.attempt.status !== 'submitted') return data as Record<string, unknown>
    if (Date.now() - started > 150_000) throw new Error('assessment did not finish in 150 s')
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }
}

async function main(): Promise<void> {
  const health = (await call('/healthz')).body as { configured: { meta: boolean } }
  if (!health.configured.meta) throw new Error('the e2e server has no META_API_KEY: start it with E2E_LIVE=1')
  const cookie = await signIn('lerato@demo.guardianbook.test')
  const items = (await call('/api/items', { cookie })).body as { items: Array<{ id: string; slug: string }> }
  const item = items.items.find((i) => i.slug === 'alg-12-factorise-trinomial') ?? items.items[0]
  if (!item) throw new Error('no seeded item')
  const working = ['x² − 5x + 6 = 0', '(x − 2)(x − 3) = 0', 'x − 2 = 0  or  x − 3 = 0', 'x = 2  or  x = 3']
  const wrong = ['x² − 5x + 6 = 0', '(x + 2)(x + 3) = 0', 'x = −2 or x = −3']

  const key = `smoke-${Date.now()}`
  const typed = await call('/api/attempts', { cookie, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ itemId: item.id, answerText: wrong.join('\n'), idempotencyKey: `${key}-typed` }) })
  const typedId = (typed.body as { attemptId: string }).attemptId
  const typedAssess = await call(`/api/attempts/${typedId}/assess`, { cookie, method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  console.log(JSON.stringify({ step: 'typed', create: typed.status, assess: typedAssess.status, body: typedAssess.body }))

  const form = new FormData()
  form.set('kind', 'work')
  form.set('itemId', item.id)
  form.set('idempotencyKey', `${key}-photo`)
  form.set('file', new Blob([new Uint8Array(await renderWorking(working))], { type: 'image/jpeg' }), 'working.jpg')
  const photo = await call('/api/inputs', { cookie, method: 'POST', body: form })
  const photoAttemptId = (photo.body as { input: { attemptId: string } }).input.attemptId
  const photoAssess = await call(`/api/attempts/${photoAttemptId}/assess`, { cookie, method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
  console.log(JSON.stringify({ step: 'photo', create: photo.status, assess: photoAssess.status, body: photoAssess.body }))

  const [typedView, photoView] = await Promise.all([waitForAttempt(cookie, typedId), waitForAttempt(cookie, photoAttemptId)])
  for (const [label, view] of [
    ['typed', typedView],
    ['photo', photoView],
  ] as const) {
    const v = view as { attempt: { status: string }; assessment: { total: number | null; modelId: string; latencyMs: number; ambiguityReasons: string[]; steps: Array<{ stepNo: number; awarded: number; available: number; confidence: string; hint: string | null }> } | null }
    console.log(
      JSON.stringify({
        label,
        status: v.attempt.status,
        total: v.assessment?.total ?? null,
        model: v.assessment?.modelId,
        latencyMs: v.assessment?.latencyMs,
        reasons: v.assessment?.ambiguityReasons,
        steps: v.assessment?.steps.map((s) => `${s.stepNo}:${s.awarded}/${s.available}:${s.confidence}${s.hint ? ':hint' : ''}`),
      }),
    )
  }

  const client = new pg.Client({ connectionString: integrationDatabaseUrl() })
  await client.connect()
  const runs = await client.query(
    `select subject_id, purpose, attempt_no, status, model_id, request_id, input_tokens, output_tokens, cost_usd, latency_ms,
            (select array_agg(c->>'code') from jsonb_array_elements(checks) c where (c->>'passed')::boolean = false) as failed
       from model_runs order by created_at`,
  )
  for (const row of runs.rows) console.log(JSON.stringify({ run: row }))
  const usage = await client.query(`select day, calls, cost_usd from model_usage_daily`)
  console.log(JSON.stringify({ usage: usage.rows }))
  await client.end()
}

main().catch((err: unknown) => {
  console.error('live smoke failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
