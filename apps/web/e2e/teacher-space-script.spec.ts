import { fileURLToPath } from 'node:url'
import { expect, test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test'

/**
 * A teacher uploads a learner's script at 1440×900 (brief B11 §3): Ms Dlamini opens Mark a
 * script for 12A, picks Lerato and an approved question, uploads the photo, waits, lands on
 * the review with the red ink drawn from the proposal; her correction of a step redraws the
 * ink live before she confirms; after release it reads Teacher-reviewed. Until then Lerato
 * cannot open the attempt.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret
const FIXTURE = fileURLToPath(new URL('./fixtures/script.png', import.meta.url))

async function signIn(page: Page, email: string, home: RegExp) {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(home)
}

async function apiAs(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string, email: string): Promise<APIRequestContext> {
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  expect(res.ok()).toBe(true)
  return api
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('Ms Dlamini uploads Lerato’s script, reviews it with red ink, corrects a step live, releases', async ({ page, playwright, baseURL }) => {
  const base = baseURL ?? 'http://127.0.0.1:8097'
  const lerato = await apiAs(playwright, base, 'lerato@demo.guardianbook.test')

  await signIn(page, 'ms-dlamini@demo.guardianbook.test', /\/teacher$/)
  await page.getByRole('link', { name: '12A', exact: true }).click()
  await expect(page.getByRole('heading', { name: '12A · class picture' })).toBeVisible()
  await page.getByRole('link', { name: 'Mark a script' }).click()
  await expect(page.getByRole('heading', { name: 'Mark a script' })).toBeVisible()

  await page.getByLabel('Learner').selectOption({ label: 'Lerato' })
  await page.getByLabel('Question').selectOption({ index: 1 })
  await expect(page.locator('.katex').first()).toBeVisible() // the question itself, as maths
  await page.getByLabel('Photo of the script').setInputFiles(FIXTURE)
  await expect(page.getByText(/Ready: /)).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b11-mark-script-1440.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Read and mark' }).click()
  await expect(page.getByText('Reading the script')).toBeVisible()

  // The review opens by itself once the read is done.
  await expect(page).toHaveURL(/\/teacher\/attempts\/[0-9a-f-]{36}$/, { timeout: 30_000 })
  const attemptId = /\/teacher\/attempts\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? ''
  await expect(page.getByRole('heading', { name: 'Lerato’s work' })).toBeVisible()
  await expect(page.getByText(/photo · independent/)).toBeVisible()
  await expect(page.getByText('Proposed 3/4')).toBeVisible()

  // Nothing reaches the learner before release.
  expect((await lerato.get(`/api/attempts/${attemptId}`)).status()).toBe(404)
  expect((await lerato.get(`/api/attempts/${attemptId}/image`)).status()).toBe(404)

  // The same ink the learner would see: three ticks, step 4 lost, 3/4, Checked by Guardian Book.
  const figure = page.locator('[data-ink-figure]')
  await expect(figure).toBeVisible({ timeout: 20_000 })
  await expect(figure.locator('[data-ink="tick"]')).toHaveCount(3)
  await expect(figure.locator('[data-ink="lost"]')).toHaveCount(1)
  await expect(figure.locator('[data-ink="total"] text')).toHaveText('3/4')
  await expect(page.locator('[data-ink-label]')).toContainText('Checked by Guardian Book')

  // Her correction redraws the ink live, before she confirms: step 4 to full marks → four ticks, 4/4.
  await page.getByLabel('Marks for step 4').selectOption('1')
  await expect(figure.locator('[data-ink="tick"]')).toHaveCount(4)
  await expect(figure.locator('[data-ink="lost"]')).toHaveCount(0)
  await expect(figure.locator('[data-ink="total"] text')).toHaveText('4/4')
  // And back: taking step 2 away draws the ellipse and cross on step 2 without the model's comment (she overrode it).
  await page.getByLabel('Marks for step 2').selectOption('0')
  await expect(figure.locator('[data-ink="lost"]')).toHaveAttribute('data-step', '2')
  await expect(figure.locator('[data-ink-comment]')).toHaveCount(0)
  await expect(figure.locator('[data-ink="total"] text')).toHaveText('3/4')
  await page.getByLabel('Marks for step 2').selectOption('1')
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b11-review-ink-1440.png', fullPage: true, animations: 'disabled' })

  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByText(/Confirmed .* version 1/)).toBeVisible()
  expect((await lerato.get(`/api/attempts/${attemptId}`)).status()).toBe(404) // confirmed is not released
  await page.getByRole('button', { name: 'Release', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Released' })).toBeDisabled()
  await expect(page.locator('[data-ink-label]')).toContainText('Teacher-reviewed')

  // Now the learner sees it, with the teacher's total.
  expect((await lerato.get(`/api/attempts/${attemptId}`)).status()).toBe(200)
  const mine = await (await lerato.get(`/api/attempts/${attemptId}/review`)).json()
  expect(mine.review).toMatchObject({ state: 'released', total: 4 })
})
