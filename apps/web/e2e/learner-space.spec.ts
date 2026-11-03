import { expect, test, type Page } from '@playwright/test'

/**
 * B05's learner space at 390×844 (brief B05 §7; spec 06 §4): a learner lands on Today
 * after sign-in; Today, Brain, Me and the setup prompts fit the phone with no horizontal
 * scroll; the tab bar (Today · Bring · Brain · Me) is on every learner screen, including
 * B04's Bring. Captures go to docs/screenshots for the PR.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Learner' })

test('a learner lands on Today; Today, Brain, Me, setup and Bring fit a 390 px phone with the tab bar', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email').fill('lerato@demo.guardianbook.test')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('heading', { name: 'Hi Lerato' })).toBeVisible()
  await expect(tabs(page).getByRole('link')).toHaveCount(4)
  await expect(page.getByRole('link', { name: 'Bring anything' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b05-today-390.png', fullPage: true, animations: 'disabled' })

  await tabs(page).getByRole('link', { name: 'Brain', exact: true }).click()
  await expect(page).toHaveURL(/\/brain$/)
  await expect(page.getByRole('heading', { name: 'Your Brain' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b05-brain-390.png', fullPage: true, animations: 'disabled' })

  await tabs(page).getByRole('link', { name: 'Me', exact: true }).click()
  await expect(page).toHaveURL(/\/me$/)
  await expect(page.getByRole('heading', { name: 'Hi Lerato' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b05-me-390.png', fullPage: true, animations: 'disabled' })

  await page.goto('/me/setup')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b05-setup-390.png', fullPage: true, animations: 'disabled' })

  // B04's screens carry the same tab bar now, and Today is one tap away.
  await page.goto('/bring')
  await expect(page.getByRole('heading', { name: 'Bring anything' })).toBeVisible()
  await tabs(page).getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page).toHaveURL(/\/today$/)
  await noOverflow(page)
})
