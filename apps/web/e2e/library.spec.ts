import { expect, test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test'

/**
 * B17 phase B at 390×844 (brief B17 "Tests"): Library → 2023 → November → P1 → a question →
 * Check my work, against the five fictional library questions the e2e server loads (never
 * DBE text). The teacher approves the paper for 12A and sets it as class practice through
 * the API first, as in production; then the learner's Today shows the practice, the paper
 * shows attribution on every question and a progress mark after the check, the Brain says
 * what comes up, search finds the topic, and the parent reads a plain line. Nothing in any
 * library response names the bucket.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret
const PAPER = { subject: 'Mathematics', grade: 12, year: 2023, session: 'november', paper: 1 }

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

function dateIn(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

test('the library is behind sign-in, noindex, and robots keeps crawlers out of it', async ({ page }) => {
  for (const path of ['/api/library', '/api/library/mathematics/12/2023/november/p1', '/api/library/search?q=factor']) {
    const res = await page.request.get(path)
    expect(res.status(), path).toBe(401)
    expect(res.headers()['x-robots-tag'], path).toBe('noindex, nofollow, noarchive')
  }
  expect((await page.request.get('/library')).headers()['x-robots-tag']).toBe('noindex, nofollow, noarchive')
  expect((await page.request.get('/')).headers()['x-robots-tag']).toBeUndefined()
  expect(await (await page.request.get('/robots.txt')).text()).toContain('Disallow: /library')
})

test('Library → 2023 → November → P1 → a question → Check my work; practice on Today; what comes up; the parent’s line', async ({ page, playwright, baseURL }) => {
  const base = baseURL ?? 'http://127.0.0.1:8097'

  // Ms Dlamini approves the whole paper for 12A and sets it as class practice, due in a week.
  const teacher = await apiAs(playwright, base, 'ms-dlamini@demo.guardianbook.test')
  const me = await (await teacher.get('/api/me')).json()
  const classId: string = me.classes.find((c: { name: string }) => c.name === '12A').id
  const approved = await (await teacher.post(`/api/teacher/classes/${classId}/library/approve`, { data: PAPER })).json()
  expect(approved.questions).toBe(3)
  const practice = await teacher.post(`/api/teacher/classes/${classId}/practice`, { data: { kind: 'paper', paper: PAPER, dueOn: dateIn(7) } })
  expect(practice.status()).toBe(201)

  // The learner: Today carries the practice and the way in.
  await signIn(page, 'lerato@demo.guardianbook.test', /\/today$/)
  await expect(page.getByRole('heading', { name: 'Class practice' })).toBeVisible()
  await expect(page.getByLabel('Class practice')).toContainText('NSC Mathematics P1, November 2023')
  await expect(page.getByLabel('Class practice')).toContainText('0 of 3 done')
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b17-today-practice-390.png', fullPage: true, animations: 'disabled' })

  await page.getByRole('link', { name: 'Past papers' }).click()
  await expect(page).toHaveURL(/\/library$/)
  await expect(page.getByRole('heading', { name: 'Past papers' })).toBeVisible()
  // The chips: the newest year and session come first; the paper list follows.
  await expect(page.getByRole('radiogroup', { name: 'Subject' }).getByRole('radio', { name: /Mathematics/ })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('radiogroup', { name: 'Year' }).getByRole('radio', { name: /2023/ })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('radiogroup', { name: 'Year' }).getByRole('radio', { name: /2022/ }).click()
  await expect(page.getByLabel('Papers')).toContainText('NSC Mathematics P1, November 2022')
  await page.getByRole('radiogroup', { name: 'Year' }).getByRole('radio', { name: /2023/ }).click()
  await page.getByRole('radiogroup', { name: 'Session' }).getByRole('radio', { name: /November/ }).click()
  await expect(page.getByLabel('Papers')).toContainText('NSC Mathematics P1, November 2023')
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b17-library-390.png', fullPage: true, animations: 'disabled' })

  await page.getByLabel('Papers').getByRole('link', { name: /Paper 1/ }).click()
  await expect(page).toHaveURL(/\/library\/mathematics\/12\/2023\/november\/p1$/)
  await expect(page.getByRole('heading', { name: 'NSC Mathematics P1, November 2023' })).toBeVisible()
  const questions = page.getByLabel('Questions').getByRole('listitem')
  await expect(questions).toHaveCount(3)
  // Attribution on every question (D40), typeset maths, the diagram through the API, no memo before an attempt.
  await expect(page.locator('[data-attribution]')).toHaveCount(3)
  for (const line of await page.locator('[data-attribution]').allTextContents()) expect(line).toContain('Department of Basic Education')
  await expect(page.locator('.katex').first()).toBeVisible()
  const diagram = page.getByRole('img', { name: 'Diagram for question 2.1' })
  await diagram.scrollIntoViewIfNeeded()
  await expect.poll(() => diagram.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBeGreaterThan(0)
  expect(await diagram.getAttribute('src')).toMatch(/^\/api\/library\/items\/[0-9a-f-]{36}\/diagram$/)
  await expect(page.getByText('Memo', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /Download the paper from the Department of Basic Education/ })).toHaveAttribute('href', /^https:\/\/www\.education\.gov\.za\//)
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b17-paper-390.png', fullPage: true, animations: 'disabled' })

  // Check my work on question 1.1: the existing homework check, memo steps as the guideline.
  await questions.first().getByRole('link', { name: 'Check my work' }).click()
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\?paper=/)
  await expect(page.getByRole('heading', { name: 'Check my work' })).toBeVisible()
  await expect(page.locator('[data-attribution]')).toContainText('Q1.1')
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working, line by line').fill('(x − 3)(x − 4) = 0\nx = 3 or x = 4')
  await page.getByRole('button', { name: 'Use this' }).click()
  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Your work' })).toBeVisible()
  await expect(page.locator('[data-attribution]')).toContainText('Q1.1')
  await expect(page.getByRole('heading', { name: /Where it slipped: step 3/ })).toBeVisible({ timeout: 20_000 })
  await noOverflow(page)

  // Back in the paper: a progress mark on the question done, and its memo now shows.
  await page.goto('/library/mathematics/12/2023/november/p1')
  await expect(page.locator('[data-progress="checked"]')).toHaveCount(1)
  await expect(questions.first()).toContainText('Checked')
  await expect(questions.first().getByText('Memo (after your attempt)')).toBeVisible()
  await expect(questions.nth(1).getByText('Memo', { exact: false })).toHaveCount(0)
  await page.goto('/today')
  await expect(page.getByLabel('Class practice')).toContainText('1 of 3 done')

  // Search by topic finds both factorising questions, each with its source.
  await page.goto('/library?q=factorising')
  await expect(page.getByLabel('Search results').getByRole('listitem')).toHaveCount(2)
  await expect(page.locator('[data-attribution]')).toHaveCount(2)
  await noOverflow(page)

  // The Brain: what comes up, per skill.
  await page.goto('/brain')
  await expect(page.locator('[data-comes-up]').first()).toContainText('In every Paper 1 since 2022')
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b17-brain-comes-up-390.png', fullPage: true, animations: 'disabled' })

  // No library response names the bucket or a key under it.
  const learner = await apiAs(playwright, base, 'lerato@demo.guardianbook.test')
  for (const path of ['/api/library', '/api/library/mathematics/12/2023/november/p1', '/api/library/search?q=factorising', '/api/library/comes-up', '/api/me/today']) {
    const text = await (await learner.get(path)).text()
    expect(text, path).not.toContain('e2e-bucket')
    expect(text, path).not.toContain('library-fixture/')
  }

  // The parent: practice under "What's coming", and the week's past-paper line in plain words.
  await signIn(page, 'mma-lerato@demo.guardianbook.test', /\/guardian/)
  await page.getByRole('link', { name: 'This week' }).first().click()
  await expect(page.getByRole('heading', { name: 'This week with Lerato' })).toBeVisible()
  await expect(page.getByLabel('Class practice')).toContainText('Practice from the past papers: NSC Mathematics P1, November 2023')
  await expect(page.locator('[data-past-papers]')).toContainText('Lerato did 1 past exam question on factorising')
  await expect(page.locator('body')).not.toContainText('x − 3')
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b17-guardian-week-390.png', fullPage: true, animations: 'disabled' })
})
