import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

/**
 * Help me with a question (brief B15 §6) at 390×844 with the mocked model: a photo of a
 * question → read back → step through → the answer last; a typed `\( … \)` question
 * renders as maths through the keypad box; the answer is hidden until the last step.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret
/** B11's handwriting fixture stands in for a photo of a question: the scripted model reads any photo back as the seed quadratic. */
const PHOTO = fileURLToPath(new URL('./fixtures/script.png', import.meta.url))

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
  await expect(page).toHaveURL(/\/today$/)
}

test('a photo of a question: read back, one step at a time, the answer last', async ({ page }) => {
  const cspViolations: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error' && msg.text().includes('Content Security Policy')) cspViolations.push(msg.text().slice(0, 160))
  })
  await signIn(page, 'lerato@demo.guardianbook.test')

  // L2: three plain choices; Help me with a question, then Snap.
  await page.goto('/bring')
  await expect(page.getByRole('heading', { name: 'Bring anything' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Check my work/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /School notice/ })).toBeVisible()
  await page.getByRole('button', { name: /Help me with a question/ }).click()
  await expect(page.getByText('The answer comes last. Nothing is marked.')).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b15-bring-390.png', fullPage: true, animations: 'disabled' })
  await page.locator('input[type="file"]').setInputFiles(PHOTO)

  // L9: reading, then the read-back as maths, labelled practice, never marked.
  await expect(page).toHaveURL(/\/guide\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Is this your question?' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('AI-guided practice · not marked by your teacher')).toBeVisible()
  await expect(page.locator('.katex').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Check my own working' })).toBeVisible() // the photo matched the bank item
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible()

  // Step 1 is current, 2 and 3 are locked, the answer is nowhere.
  const steps = page.getByRole('region', { name: 'Steps' })
  await expect(steps.getByRole('heading', { name: 'Step 1' })).toBeVisible()
  await expect(steps.getByText('Unlocks after step 1.')).toBeVisible()
  await expect(steps.getByText('Unlocks after step 2.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The answer' })).toHaveCount(0)
  await expect(page.getByText('$x = 2$ or $x = 3$')).toHaveCount(0)
  await expect(page.getByText('Worked')).toHaveCount(0)

  // Try it yourself has the keypad; a key writes maths and the preview renders it.
  const tryBox = page.getByLabel('Try it yourself (optional)')
  await tryBox.fill('x = ')
  await page.getByRole('toolbar', { name: 'Maths keys' }).getByRole('button', { name: 'Fraction' }).first().click()
  await expect(tryBox).toHaveValue('x = $\\frac{}{}$')
  await expect(page.getByText('Preview')).toBeVisible()
  await noOverflow(page)

  // Hint, then Show this step: the worked line appears and step 2 unlocks.
  await page.getByRole('button', { name: 'Hint' }).click()
  await expect(steps.getByText('Check that the right-hand side is already')).toBeVisible()
  await page.getByRole('button', { name: 'Show this step' }).click()
  await expect(steps.getByText('Worked').first()).toBeVisible()
  await expect(steps.getByRole('heading', { name: 'Step 2' })).toBeVisible()
  await expect(steps.getByText('Unlocks after step 1.')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'The answer' })).toHaveCount(0)
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b15-guide-390.png', fullPage: true, animations: 'disabled' })

  // "Show the answer" asks first; keep going hides it again.
  await page.getByRole('button', { name: 'Show the answer' }).click()
  await expect(page.getByText('Try the steps first?')).toBeVisible()
  await page.getByRole('button', { name: 'Keep going' }).click()
  await expect(page.getByRole('heading', { name: 'The answer' })).toHaveCount(0)

  // Through the last step: the answer appears on its own.
  await page.getByRole('button', { name: 'Show this step' }).click()
  await expect(steps.getByRole('heading', { name: 'Step 3' })).toBeVisible()
  await page.getByRole('button', { name: 'Show the last step' }).click()
  await expect(page.getByRole('heading', { name: 'The answer' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The answer' }).locator('..').locator('.katex').first()).toBeVisible()
  await expect(page.getByText('Checked by two separate reads that agreed.')).toBeVisible()
  expect(cspViolations).toEqual([])
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b15-guide-answer-390.png', fullPage: true, animations: 'disabled' })

  // Check my own working lands on Bring with the question preselected.
  await page.getByRole('link', { name: 'Check my own working' }).click()
  await expect(page).toHaveURL(/\/bring\?item=/)
  await expect(page.getByRole('heading', { name: 'Check my own working' })).toBeVisible()
  await expect(page.getByRole('button', { name: /Type/ })).toBeVisible()
})

test('a typed \\( … \\) question renders as maths; Edit re-reads once', async ({ page }) => {
  await signIn(page, 'thabo@demo.guardianbook.test')
  await page.goto('/bring')
  await page.getByRole('button', { name: /Help me with a question/ }).click()
  await page.getByRole('button', { name: /Type/ }).click()
  const box = page.getByLabel('Your question')
  await box.fill('Find two rational numbers between \\(\\frac{1}{4}\\) and \\(\\frac{7}{8}\\).')
  await page.getByRole('button', { name: 'Read my question' }).click()

  await expect(page).toHaveURL(/\/guide\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Is this your question?' })).toBeVisible({ timeout: 20_000 })
  const readBack = page.getByRole('heading', { name: 'Is this your question?' }).locator('..')
  await expect(readBack.locator('.katex').first()).toBeVisible()
  await expect(readBack).not.toContainText('\\(')
  // KaTeX keeps the TeX source in its MathML annotation for screen readers; what is painted is the typeset maths.
  await expect(readBack.locator('.katex-html').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Check my own working' })).toHaveCount(0) // not a bank question
  await noOverflow(page)

  // Edit: the keypad box, prefilled; Read it again lands on a new guide that cannot be edited again.
  await page.getByRole('button', { name: 'Edit' }).click()
  const correction = page.getByLabel('Correct the question')
  await expect(correction).toHaveValue('Find two rational numbers between $\\frac{1}{4}$ and $\\frac{7}{8}$.')
  await correction.fill('Find three rational numbers between $\\frac{1}{4}$ and $\\frac{7}{8}$.')
  const firstUrl = page.url()
  await page.getByRole('button', { name: 'Read it again' }).click()
  await expect(page).not.toHaveURL(firstUrl)
  await expect(page.getByRole('heading', { name: 'Is this your question?' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('read again from your correction')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
  await noOverflow(page)
})
