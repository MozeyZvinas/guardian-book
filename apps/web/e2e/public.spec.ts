import { expect, test, type Page } from '@playwright/test'

/**
 * B09: the public front door and the try-it path. The landing and /try at 360 and 1440,
 * light and dark, with no horizontal scroll (captures for the PR); a judge signs up
 * through /try, lands on Bring in the try-it class with a suggested question, and runs
 * a check on it against the mocked model; robots, the manifest and the service worker
 * are served, and the worker keeps nothing from /api in any cache.
 */

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('the landing and /try fit 360 and 1440, light and dark', async ({ page }) => {
  for (const [width, height, label] of [
    [360, 800, '360'],
    [1440, 900, '1440'],
  ] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      const suffix = scheme === 'dark' ? `${label}-dark` : label
      await page.setViewportSize({ width, height })
      await page.emulateMedia({ colorScheme: scheme })

      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Every learner deserves the support to succeed.')
      await expect(page.getByRole('link', { name: 'Try it as a learner' }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'Sign in' }).first()).toBeVisible()
      await expect(page.getByRole('link', { name: 'See the proof' }).first()).toBeVisible()
      await expect(page.getByText('Every learner understood. Every next step clearer.')).toBeVisible()
      await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible()
      // The three real screenshots are served and decode.
      for (const alt of [/feedback screen/, /This week screen/, /class picture/]) {
        const img = page.getByRole('img', { name: alt })
        await img.scrollIntoViewIfNeeded()
        await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
      }
      await expect(page.locator('body')).not.toContainText(/marking app|maths app/i)
      await noOverflow(page)
      await page.screenshot({ path: `docs/screenshots/b09-landing-${suffix}.png`, fullPage: true, animations: 'disabled' })

      await page.goto('/try')
      await expect(page.getByRole('heading', { name: 'Try it as a learner' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Sign up as a learner' })).toBeVisible()
      await noOverflow(page)
      await page.screenshot({ path: `docs/screenshots/b09-try-${suffix}.png`, fullPage: true, animations: 'disabled' })
    }
  }
})

test('a judge signs up through /try, lands on Bring in the try-it class, and checks work on an approved question', async ({ page }) => {
  await page.goto('/try')
  await page.getByRole('link', { name: 'Sign up as a learner' }).click()
  await expect(page).toHaveURL(/\/signup\?try=1$/)
  await expect(page.getByRole('heading', { name: 'Try it as a learner' })).toBeVisible()
  // The 18+ attestation is still required (D19).
  await page.getByLabel('Nickname').fill('Judge')
  await page.getByLabel('Email').fill(`judge-${Date.now()}@demo.guardianbook.test`)
  await page.getByLabel('Password').fill('try-it-password-1')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toContainText(/18 or older/)
  await page.getByLabel(/18 or older/).check()
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/bring\?try=1$/)
  await expect(page.getByRole('heading', { name: 'Try this question' })).toBeVisible()
  // The question is typeset (KaTeX loads lazily), never shown as TeX source.
  await expect(page.locator('.katex').first()).toBeVisible()
  await expect(page.getByText('$$', { exact: false })).toHaveCount(0)
  const me = await (await page.request.get('/api/me')).json()
  expect(me.memberships).toEqual([{ classId: expect.any(String), name: 'Try it (fictional)' }])
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b09-bring-try-390.png', fullPage: true, animations: 'disabled' })

  // The suggested working, one step short: the picker shows the question, never the slug,
  // with the suggested question preselected; the check starts against the mocked model.
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working, line by line').fill('x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0')
  await page.getByRole('button', { name: 'Use this' }).click()
  const picker = page.getByRole('group', { name: 'Which question is this?' })
  await expect(picker).toBeVisible()
  await expect(picker).not.toContainText('alg-12')
  // Three seed items approved for the try-it class, plus B17's four library questions listed but disabled.
  await expect(picker.getByRole('radio')).toHaveCount(7)
  await expect(picker.getByRole('radio').first()).toBeChecked()
  await expect(picker.getByRole('radio').nth(1)).toBeEnabled()
  await expect(picker.getByRole('radio').nth(3)).toBeDisabled()
  await expect(picker).toContainText('4 marks')
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b09-picker-390.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Check my work' }).click()
  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: /Where it slipped: step 4/ })).toBeVisible({ timeout: 20_000 })
})

test('robots, the manifest and the service worker are served; nothing from /api ever sits in a cache', async ({ page }) => {
  const robots = await page.request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  const robotsText = await robots.text()
  for (const line of ['Allow: /try', 'Allow: /evidence', 'Disallow: /api/', 'Disallow: /library', 'Disallow: /today', 'Disallow: /guardian', 'Disallow: /teacher']) {
    expect(robotsText).toContain(line)
  }

  const manifest = await page.request.get('/manifest.webmanifest')
  expect(manifest.status()).toBe(200)
  expect(manifest.headers()['content-type']).toContain('manifest+json')
  expect(manifest.headers()['cache-control']).toBe('no-cache')
  const manifestJson = await manifest.json()
  expect(manifestJson.start_url).toBe('/today')
  expect(manifestJson.icons.some((icon: { purpose?: string }) => icon.purpose === 'maskable')).toBe(true)
  for (const icon of manifestJson.icons as { src: string }[]) expect((await page.request.get(icon.src)).status()).toBe(200)

  const sw = await page.request.get('/sw.js')
  expect(sw.status()).toBe(200)
  expect(sw.headers()['cache-control']).toBe('no-cache')
  const swText = await sw.text()
  expect(swText).toContain('gb-assets-')
  expect(swText).not.toMatch(/^import /m)
  expect((await page.request.get('/offline.html')).status()).toBe(200)

  // Register the worker on the landing, then use the API: no cache may hold an /api entry.
  await page.goto('/')
  // `ready` resolves once a worker is active for this scope; install precached the offline page first.
  const activeScope = await page.evaluate(() => navigator.serviceWorker.ready.then((registration) => registration.scope))
  expect(activeScope).toMatch(/\/$/)
  await page.evaluate(() => fetch('/api/me', { credentials: 'same-origin' }).then((r) => r.status))
  await page.evaluate(() => fetch('/api/try').then((r) => r.status))
  const cachedApi = await page.evaluate(async () => {
    const names = await caches.keys()
    const urls: string[] = []
    for (const name of names) {
      const cache = await caches.open(name)
      for (const req of await cache.keys()) urls.push(req.url)
    }
    return { names, apiUrls: urls.filter((url) => new URL(url).pathname.startsWith('/api')) }
  })
  expect(cachedApi.names.length).toBeGreaterThan(0)
  expect(cachedApi.apiUrls).toEqual([])
})
