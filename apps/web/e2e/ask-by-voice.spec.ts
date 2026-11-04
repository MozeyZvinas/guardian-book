import { expect, test, type Page } from '@playwright/test'

/**
 * Ask about a step, by voice or typing (brief B13 §5), at 390×844 with the mocked model
 * and a mocked recorder: Chromium's fake microphone (a generated tone) feeds the real
 * Web Audio capture and WAV encoder; the e2e server's scripted transcriber turns any clip
 * into the same question; the scripted model answers with a hint that gives nothing away.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret

test.use({
  permissions: ['microphone'],
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
})

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

test('Lerato asks about the step that slipped: by voice, then by typing; the hint never gives the factors', async ({ page }) => {
  await signIn(page, 'lerato@demo.guardianbook.test')
  await expect(page).toHaveURL(/\/today$/)

  // Bring typed work (B04) and lose the last step.
  await page.goto('/bring')
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working, line by line').fill('x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0')
  await page.getByRole('button', { name: 'Use this' }).click()
  await page.getByLabel('Which question is this?').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Check my work' }).click()
  await expect(page.getByRole('heading', { name: /Where it slipped: step 4/ })).toBeVisible({ timeout: 20_000 })

  // L4 Fix it: the Ask panel sits under the step.
  await page.getByRole('link', { name: 'Fix it' }).click()
  await expect(page.getByRole('heading', { name: 'Ask about step 4' })).toBeVisible()
  const question = page.getByLabel('Your question about step 4')
  await expect(question).toHaveValue('')

  // Hold to talk: the words appear in the box, the audio goes nowhere.
  const mic = page.getByRole('button', { name: 'Hold to talk' })
  const box = await mic.boundingBox()
  if (!box) throw new Error('no mic button')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(page.getByRole('button', { name: /Listening/ })).toBeVisible()
  await page.waitForTimeout(1_500)
  await page.mouse.up()
  await expect(question).toHaveValue('Why is it minus six?', { timeout: 15_000 })
  await noOverflow(page)

  // Send: one hint, in the hint-card style, and a quiet Ask again.
  await page.getByRole('button', { name: 'Ask', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Hint for step 4' })).toBeVisible({ timeout: 20_000 })
  const hint = page.getByRole('heading', { name: 'Hint for step 4' }).locator('..')
  await expect(hint).toContainText('Check each sign')
  await expect(hint).not.toContainText('(x − 2)')
  await expect(hint).not.toContainText('x = 2')
  await expect(page.getByRole('button', { name: 'Ask again' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b13-ask-390.png', fullPage: true, animations: 'disabled' })

  // Typing works the same way; the transcript is editable text, nothing else is shown.
  await question.fill('What goes in the brackets?')
  await page.getByRole('button', { name: 'Ask again' }).click()
  await expect(page.getByRole('heading', { name: 'Hint for step 4' })).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('audio')).toHaveCount(0)
})

test('check it alone: asking is paused until the learner submits', async ({ page }) => {
  await signIn(page, 'lerato@demo.guardianbook.test')
  await page.goto('/today')
  // Reach L5 in independent mode from the fix screen of the attempt above.
  await page.goto('/bring')
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working, line by line').fill('x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0')
  await page.getByRole('button', { name: 'Use this' }).click()
  await page.getByLabel('Which question is this?').selectOption({ index: 1 })
  await page.getByRole('button', { name: 'Check my work' }).click()
  await expect(page.getByRole('heading', { name: /Where it slipped: step 4/ })).toBeVisible({ timeout: 20_000 })
  await page.getByRole('link', { name: 'Fix it' }).click()
  await page.getByRole('button', { name: /Type/ }).click()
  await page.getByLabel('Your working for this step').fill('x − 2 = 0 or x − 3 = 0\nx = 2 or x = 3')
  await page.getByRole('button', { name: 'Use this' }).click()
  await expect(page.getByText('Fixed on your own')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Check it alone' }).click()
  await expect(page.getByRole('heading', { name: 'Check it alone' })).toBeVisible()
  await expect(page.getByText('Paused while you check it alone.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Hold to talk' })).toHaveCount(0)
  await noOverflow(page)
})
