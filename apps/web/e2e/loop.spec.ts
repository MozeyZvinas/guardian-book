import { expect, test, type Page } from '@playwright/test'

/**
 * The loop on a phone (brief B06 §7; spec 02 P0-05, P0-09): feedback → fix it → check it
 * alone → the guardian's "We did it", at 390×844 with the mocked model. No horizontal
 * scroll on any screen; captures go to docs/screenshots.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

async function signIn(page: Page, email: string) {
  await page.context().clearCookies()
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

test('feedback → fix it → check it alone → the guardian taps We did it', async ({ page }) => {
  await signIn(page, 'lerato@demo.guardianbook.test')
  await expect(page).toHaveURL(/\/today$/)

  // Bring typed work (B04), lose the last step.
  await page.goto('/bring')
  await page.getByRole('button', { name: /Check my work/ }).click() // B15: the three plain choices
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working, line by line').fill('x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0')
  await page.getByRole('button', { name: 'Use this' }).click()
  await page.getByRole('group', { name: 'Which question is this?' }).getByRole('radio').first().check()
  await page.getByRole('button', { name: 'Check my work' }).click()
  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: /Where it slipped: step 4/ })).toBeVisible({ timeout: 20_000 })

  // L4 Fix it: redo the step, pass, the crest fans, Check it alone appears.
  await page.getByRole('link', { name: 'Fix it' }).click()
  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]{36}\/fix$/)
  await expect(page.getByRole('heading', { name: /Step 4: where it slipped/ })).toBeVisible()
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working for this step').fill('x − 2 = 0 or x − 3 = 0\nx = 2 or x = 3')
  await page.getByRole('button', { name: 'Use this' }).click()
  await expect(page.getByText('Fixed on your own')).toBeVisible({ timeout: 20_000 })
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b06-fix-390.png', fullPage: true, animations: 'disabled' })

  // L5 Check it alone: the Independent chip, no hints until you submit.
  await page.getByRole('button', { name: 'Check it alone' }).click()
  await expect(page).toHaveURL(/\/items\/[0-9a-f-]{36}\?/)
  await expect(page.getByRole('heading', { name: 'Check it alone' })).toBeVisible()
  await expect(page.getByText('Independent', { exact: true })).toBeVisible()
  await expect(page.getByText('No hints until you submit.').first()).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b06-check-alone-390.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working, line by line').fill('x² + x − 12 = 0\n(x + 4)(x − 3) = 0\nx = −4 or x = 3')
  await page.getByRole('button', { name: 'Use this' }).click()
  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]{36}$/)
  await expect(page.getByText('You did it on your own.')).toBeVisible({ timeout: 20_000 })

  // G1: the guardian signs in, lands on the week, reads the gap and the action, taps We did it.
  await signIn(page, 'mma-lerato@demo.guardianbook.test')
  await expect(page).toHaveURL(/\/guardian\/learners\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'This week with Lerato' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The one gap, in plain words' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('Ask them to teach you step 2')).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Guardian' }).getByRole('link')).toHaveCount(4)
  // Nothing of the work itself reaches this screen.
  await expect(page.getByText('(x − 2)(x − 3)')).toHaveCount(0)
  await page.getByRole('button', { name: 'We did it' }).click()
  await expect(page.getByText(/Done · /)).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b06-guardian-week-390.png', fullPage: true, animations: 'disabled' })
})
