import { expect, test, type Page } from '@playwright/test'

/**
 * Every B04 screen at 360 and 390 px: no horizontal scroll (spec 06 §4), and a capture
 * for the PR. The teacher's notice flow runs for real against the mocked model: typed
 * notice → events with source lines → confirm → "Published to n learners and m parents".
 */

const PASSWORD = 'integration-only-password'

async function signIn(page: Page, email: string, home: RegExp) {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(home)
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('Bring and Calendar fit a 360 px phone', async ({ page }) => {
  await signIn(page, 'thabo@demo.guardianbook.test', /\/today$/)
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto('/bring')
  await expect(page.getByRole('heading', { name: 'Bring anything' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b04-bring-360.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: /Type/ }).click()
  await noOverflow(page)
  await page.goto('/calendar')
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b04-calendar-360.png', fullPage: true, animations: 'disabled' })
})

test('a teacher reads a typed notice, confirms the uncertain date, and it is published', async ({ page }) => {
  await signIn(page, 'ms-dlamini@demo.guardianbook.test', /\/teacher$/)
  await page.getByRole('link', { name: 'Class notice' }).first().click()
  await expect(page.getByRole('heading', { name: 'Class notice' })).toBeVisible()
  await page.getByLabel('Or paste the text').fill(['Grade 12 November timetable', 'Maths Paper 1 on 2026-11-20', 'Maths Paper 2 on 2026-11-24?'].join('\n'))
  await page.getByRole('button', { name: 'Read the notice' }).click()

  await expect(page.getByText('Dates found', { exact: false })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Maths Paper 1', { exact: true })).toBeVisible()
  await expect(page.getByText('“Maths Paper 2 on 2026-11-24?”')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm' }).first().click()
  await expect(page.getByText(/Published to 6 learners and 1 parent/)).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b04-teacher-notice-390.png', fullPage: true, animations: 'disabled' })

  // The learner in 12A now sees both on their calendar, with the source line.
  await signIn(page, 'naledi@demo.guardianbook.test', /\/today$/)
  await page.goto('/calendar')
  await expect(page.getByText('Maths Paper 2', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirm' })).toHaveCount(0) // class events: the teacher decides
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b04-calendar-390.png', fullPage: true, animations: 'disabled' })
})
