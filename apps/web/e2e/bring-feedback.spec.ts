import { expect, test } from '@playwright/test'

/**
 * Bring → feedback on a phone (brief B04 §6; spec 02 P0-13): Lerato signs in, types her
 * working, picks the question, the check runs in the background (mocked model), and the
 * feedback page shows her work, the step map, where it slipped and a hint. No horizontal
 * scroll at 390 px.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret

test('a learner brings typed working and gets step-level feedback', async ({ page }) => {
  await page.goto('/signin')
  await page.getByLabel('Email').fill('lerato@demo.guardianbook.test')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/today$/)

  await page.goto('/bring')
  await expect(page.getByRole('heading', { name: 'Bring anything' })).toBeVisible()
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working, line by line').fill('x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0\nx − 2 = 0 or x − 3 = 0')
  await page.getByRole('button', { name: 'Use this' }).click()

  await expect(page.getByText('Which question is this?')).toBeVisible()
  await page.getByLabel('Which question is this?').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Check my work' }).click()

  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Your work' })).toBeVisible()
  // The learner's own working is the hero, exactly as typed.
  await expect(page.getByText('(x − 2)(x − 3) = 0').first()).toBeVisible()
  // The step map resolves: four steps, the last one lost, a hint, no answer in it.
  await expect(page.getByLabel('Step map').getByRole('listitem')).toHaveCount(4)
  await expect(page.getByText('3 of 4 marks proposed', { exact: false })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('heading', { name: /Where it slipped: step 4/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Hint for step 4' })).toBeVisible()
  await expect(page.getByText('Confidence:')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fix it' })).toBeDisabled()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'docs/screenshots/b04-feedback-390.png', fullPage: true, animations: 'disabled' })
})
