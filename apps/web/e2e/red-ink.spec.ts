import { fileURLToPath } from 'node:url'
import { expect, test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test'

/**
 * Red ink on the learner's own photo at 390×844 (brief B11 §1–2): Lerato snaps her working,
 * the mocked model loses the last step, and her feedback screen draws the teacher's pen on
 * the photo: ticks on the earned steps, an ellipse, a cross and a margin comment on the lost
 * one, the total circled, labelled "Checked by Guardian Book". Ms Dlamini corrects that step
 * and releases: the learner's ink shows four ticks, labelled "Teacher-reviewed".
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

test('a learner’s photo gets red ink; after the teacher corrects and releases it reads Teacher-reviewed', async ({ page, playwright, baseURL }) => {
  const base = baseURL ?? 'http://127.0.0.1:8097'
  await signIn(page, 'lerato@demo.guardianbook.test', /\/today$/)

  // L2: snap the photo (the hidden file input behind "Snap"), pick the question, check.
  await page.goto('/bring')
  await expect(page.getByRole('heading', { name: 'Bring anything' })).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles(FIXTURE)
  await expect(page.getByLabel('Which question is this?')).toBeVisible({ timeout: 20_000 })
  await page.getByLabel('Which question is this?').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Check my work' }).click()
  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]{36}$/)
  const attemptId = /\/attempts\/([0-9a-f-]{36})$/.exec(page.url())?.[1] ?? ''

  // L3: the ink. The mock loses step 4 of 4: three ticks, one lost (ellipse + cross + comment), 3/4 circled.
  const figure = page.locator('[data-ink-figure]')
  await expect(figure).toBeVisible({ timeout: 20_000 })
  await expect(figure.locator('[data-ink="tick"]')).toHaveCount(3)
  await expect(figure.locator('[data-ink="lost"]')).toHaveCount(1)
  await expect(figure.locator('[data-ink="lost"]')).toHaveAttribute('data-step', '4')
  await expect(figure.locator('[data-ink="total"] text')).toHaveText('3/4')
  await expect(figure.locator('[data-ink-comment="4"]')).toContainText('Not yet')
  await expect(page.locator('[data-ink-label]')).toContainText('Checked by Guardian Book')
  // The toggle hides and shows the pen.
  await page.getByRole('button', { name: 'Hide red ink' }).click()
  await expect(figure).toHaveCount(0)
  await page.getByRole('button', { name: 'Show red ink' }).click()
  await expect(page.locator('[data-ink-figure]')).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b11-red-ink-390.png', fullPage: true, animations: 'disabled' })

  // Ms Dlamini (12A's teacher) corrects step 4 to earned, confirms and releases, through the API.
  const dlamini = await apiAs(playwright, base, 'ms-dlamini@demo.guardianbook.test')
  const review = await (await dlamini.get(`/api/teacher/attempts/${attemptId}`)).json()
  const awards = (review.steps as Array<{ stepId: string; marks: number }>).map((s) => ({ stepId: s.stepId, awarded: s.marks }))
  const confirmed = await (await dlamini.post(`/api/teacher/attempts/${attemptId}/review`, { data: { steps: awards } })).json()
  expect((await dlamini.post(`/api/teacher/attempts/${attemptId}/release`, { data: { version: confirmed.review.version } })).ok()).toBe(true)

  // L3 again: the teacher's values win: four ticks, 4/4, Teacher-reviewed.
  await page.reload()
  const inked = page.locator('[data-ink-figure]')
  await expect(inked).toBeVisible({ timeout: 20_000 })
  await expect(inked.locator('[data-ink="tick"]')).toHaveCount(4)
  await expect(inked.locator('[data-ink="lost"]')).toHaveCount(0)
  await expect(inked.locator('[data-ink="total"] text')).toHaveText('4/4')
  await expect(page.locator('[data-ink-label]')).toContainText('Teacher-reviewed')
  await expect(page.getByText('4 of 4 marks · Teacher-reviewed')).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b11-red-ink-reviewed-390.png', fullPage: true, animations: 'disabled' })
})
