import { expect, test, type Page } from '@playwright/test'

/**
 * An empty library is not a way in (B17 follow-up), at 390×844. While `/api/library` lists
 * no papers, Today has no "Past papers" line, Brain has no "What comes up" sentence and the
 * teacher's nav has no "Past papers" item; `/library` itself keeps its empty state. The e2e
 * server always loads its five fictional library questions, so the empty state answers
 * `/api/library` with no papers in the browser; the loaded state uses the real server.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret
const LEARNER = 'lerato@demo.guardianbook.test'
const TEACHER = 'ms-dlamini@demo.guardianbook.test'

async function signIn(page: Page, email: string, home: RegExp) {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(home)
}

/** Answer `/api/library` with no papers; `count` is how many times the page has asked. */
async function emptyLibrary(page: Page): Promise<{ count: () => number }> {
  let asked = 0
  await page.route('**/api/library', async (route) => {
    asked += 1
    await route.fulfill({ json: { papers: [] } })
  })
  return { count: () => asked }
}

/** Run `action`, then wait until the page has asked the library again (so a hidden way in is a real answer, not a race). */
async function andAsked(library: { count: () => number }, action: () => Promise<unknown>) {
  const before = library.count()
  await action()
  await expect.poll(library.count).toBeGreaterThan(before)
}

const brainSentence = (page: Page) => page.getByText(/What comes up: how often a skill appears in the/)
const teacherNav = (page: Page) => page.getByRole('navigation', { name: 'Teacher' })

test('no papers: Today, Brain and the teacher nav hide the way in; /library keeps its empty state', async ({ page }) => {
  const library = await emptyLibrary(page)

  await andAsked(library, () => signIn(page, LEARNER, /\/today$/))
  await expect(page.getByRole('link', { name: 'Bring anything' }).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Past papers' })).toHaveCount(0)

  await andAsked(library, () => page.goto('/brain'))
  await expect(page.getByRole('heading', { name: 'The three marks' })).toBeVisible()
  await expect(brainSentence(page)).toHaveCount(0)

  await andAsked(library, () => page.goto('/library'))
  await expect(page.getByText('No past papers loaded yet')).toBeVisible()

  await page.context().clearCookies()
  await andAsked(library, () => signIn(page, TEACHER, /\/teacher$/))
  await expect(teacherNav(page).getByRole('link', { name: 'Guidelines' })).toBeVisible()
  await expect(teacherNav(page).getByRole('link', { name: 'Past papers' })).toHaveCount(0)
})

test('papers loaded: Today, Brain and the teacher nav show the way in', async ({ page }) => {
  await signIn(page, LEARNER, /\/today$/)
  await expect(page.getByRole('link', { name: 'Past papers' })).toBeVisible()

  await page.goto('/brain')
  await expect(brainSentence(page)).toBeVisible()
  await expect(brainSentence(page).getByRole('link', { name: 'past papers' })).toHaveAttribute('href', '/library')

  await page.context().clearCookies()
  await signIn(page, TEACHER, /\/teacher$/)
  await expect(teacherNav(page).getByRole('link', { name: 'Past papers' })).toBeVisible()
})
