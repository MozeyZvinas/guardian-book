import { expect, test, type Page } from '@playwright/test'

/**
 * The parent's home language on a phone (brief B12 §6; D38): the learner's work issues a
 * plan; the parent picks isiZulu in Settings; This week shows the translated action under
 * "Translated by AI from the teacher-reviewed English", Show English reveals the English
 * beside it, and Share to WhatsApp carries the nickname and the message only. Mocked
 * model: the pseudo-translation reverses every word's letters. 390×844; no horizontal scroll.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret
const AI_LABEL = 'Translated by AI from the teacher-reviewed English'

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

test('the parent picks isiZulu; This week shows the AI label, Show English works, Share to WhatsApp carries only the message', async ({ page }) => {
  // The learner brings typed work and loses the last step: a Help Plan is issued in the background (B06).
  await signIn(page, 'lerato@demo.guardianbook.test')
  await expect(page).toHaveURL(/\/today$/)
  await page.goto('/bring')
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working, line by line').fill('x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0')
  await page.getByRole('button', { name: 'Use this' }).click()
  await page.getByLabel('Which question is this?').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Check my work' }).click()
  await expect(page.getByRole('heading', { name: /Where it slipped: step 4/ })).toBeVisible({ timeout: 20_000 })

  // G4: the parent picks isiZulu.
  await signIn(page, 'mma-lerato@demo.guardianbook.test')
  await expect(page).toHaveURL(/\/guardian\/learners\/[0-9a-f-]{36}$/)
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Your language' })).toBeVisible()
  await page.getByLabel('Read This week and Notes in').selectOption('zu')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved · isiZulu')).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b12-guardian-settings-390.png', fullPage: true, animations: 'disabled' })

  // G1: the action in isiZulu under the AI label; the English one tap away; the Teacher-reviewed labels unchanged.
  await page.getByRole('link', { name: 'This week' }).click()
  await expect(page.getByRole('heading', { name: 'This week with Lerato' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Tonight, one thing' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(AI_LABEL).first()).toBeVisible({ timeout: 30_000 })
  const tonight = page.locator('section', { has: page.getByRole('heading', { name: 'Tonight, one thing' }) })
  await expect(tonight.getByText('Ask them to teach you step 2')).toHaveCount(0)
  await expect(tonight.locator('[lang="zu"]')).toBeVisible()
  await tonight.getByRole('button', { name: 'Show English' }).click()
  await expect(tonight.getByText('Ask them to teach you step 2')).toBeVisible()
  await expect(tonight.getByRole('button', { name: 'Hide English' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b12-guardian-week-zu-390.png', fullPage: true, animations: 'disabled' })

  // Share to WhatsApp: wa.me with the nickname and the isiZulu action, no link, no work.
  const share = tonight.getByRole('link', { name: 'Share to WhatsApp' })
  const href = await share.getAttribute('href')
  expect(href?.startsWith('https://wa.me/?text=')).toBe(true)
  const text = new URL(href ?? '').searchParams.get('text') ?? ''
  expect(text.startsWith('Lerato: ')).toBe(true)
  expect(text).toBe(`Lerato: ${await tonight.locator('[lang="zu"]').innerText()}`)
  expect(text).not.toMatch(/https?:|guardian|x² − 5x|\(x − 2\)/)
  expect(text).not.toContain('Ask them to teach you') // the message is in the parent's language
  await expect(share).toHaveAttribute('target', '_blank')
  await expect(tonight.getByRole('button', { name: 'Copy' })).toBeVisible()

  // Nothing of the work itself reaches this screen.
  await expect(page.getByText('(x − 2)(x − 3)')).toHaveCount(0)
})
