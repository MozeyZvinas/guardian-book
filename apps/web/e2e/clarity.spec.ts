import { expect, test, type Page } from '@playwright/test'

/**
 * B16 at 390×844 (brief §8): Tell me about you by taps alone (no typing), the cards it
 * makes, Today with one clear next action and plain statuses, and the Brain with its
 * explainer, legend and plain-words evidence. Captures go to docs/screenshots for the PR.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret

async function signIn(page: Page, email: string) {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/today$/)
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Learner' })

test('Today says the one next action and the recent work in plain words', async ({ page }) => {
  await signIn(page, 'thabo@demo.guardianbook.test')
  await expect(page.getByRole('heading', { name: 'Hi Thabo' })).toBeVisible()
  await expect(page.getByText('Your one next step, then your recent work.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bring something' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Bring anything' })).toHaveCount(1) // one pink action
  await expect(page.getByRole('heading', { name: 'Your recent work' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Five quick taps' })).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b16-today-390.png', fullPage: true, animations: 'disabled' })
})

test('Tell me about you is quick taps, and the cards come back in the learner’s words', async ({ page }) => {
  await signIn(page, 'thabo@demo.guardianbook.test')
  await page.goto('/me/setup')
  await expect(page.getByRole('heading', { name: 'Tell me about you' })).toBeVisible()
  await expect(page.getByText('Quick taps, no essays', { exact: false })).toBeVisible()

  // Taps only: no textarea on the screen, every answer is a dropdown or a chip.
  await expect(page.locator('textarea')).toHaveCount(0)
  await page.getByLabel('Grade').selectOption('12')
  for (const subject of ['Mathematics', 'Physical Sciences', 'Life Orientation']) {
    await page.getByRole('button', { name: subject, exact: true }).click()
    await expect(page.getByRole('button', { name: subject, exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByLabel('The subject I find hardest').selectOption('Mathematics')
  await page.getByRole('button', { name: 'be an engineer' }).click()
  await expect(page.getByLabel('One day I want to…')).toHaveValue('be an engineer')
  await page.getByRole('radio', { name: 'someone shows me an example' }).click()
  await expect(page.getByRole('radio', { name: 'someone shows me an example' })).toHaveAttribute('aria-checked', 'true')
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b16-setup-390.png', fullPage: true, animations: 'disabled' })

  await page.getByRole('button', { name: 'Make my cards' }).click()
  await expect(page.getByRole('heading', { name: 'This is what Guardian Book knows about you.' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByLabel('What you want to be or do one day')).toHaveValue('One day I want to be an engineer.')
  await expect(page.getByLabel('Your subjects')).toHaveValue('Mathematics, Physical Sciences, Life Orientation')
  await expect(page.getByLabel('Hardest right now')).toHaveValue('Mathematics')
  await expect(page.getByLabel('How you like to learn')).toHaveValue(/Grade 12.*someone shows me an example/)
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b16-cards-390.png', fullPage: true, animations: 'disabled' })

  await page.getByRole('button', { name: 'Save and go to Today' }).click()
  await expect(page).toHaveURL(/\/today$/)
  await expect(page.getByRole('link', { name: 'Five quick taps' })).toHaveCount(0) // the cards exist now
})

test('the Brain explains itself: one line, a legend, and evidence in plain words', async ({ page }) => {
  // Thabo has brought nothing: the explainer, the legend, every seeded skill still "New".
  await signIn(page, 'thabo@demo.guardianbook.test')
  await tabs(page).getByRole('link', { name: 'Brain', exact: true }).click()
  await expect(page).toHaveURL(/\/brain$/)
  await expect(page.getByText('This is what you can do, and how sure we are.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The three marks' })).toBeVisible()
  for (const word of ['With help', 'On your own', 'Later', 'Secure']) await expect(page.getByRole('term').filter({ hasText: word })).toBeVisible()
  const empty = page.getByText('Bring your first piece of work and your Brain starts here.')
  const allNew = page.getByText('Every skill is new: nothing checked yet.', { exact: false })
  await expect(empty.or(allNew)).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b16-brain-390.png', fullPage: true, animations: 'disabled' })

  // Lerato has checked work from the earlier specs: a chip opens its evidence in plain words.
  await signIn(page, 'lerato@demo.guardianbook.test')
  await page.goto('/brain')
  const chips = page.getByRole('list', { name: 'Skills' }).getByRole('button')
  await expect(chips.first()).toBeVisible()
  await chips.first().click()
  await expect(chips.first()).toHaveAttribute('aria-pressed', 'true')
  const evidence = page.getByRole('region', { name: /./ }).filter({ has: page.getByText(/^(Secure|Practising|New): /) })
  await expect(evidence.first()).toBeVisible()
  // With checked work from the earlier specs the evidence reads by day, in plain words.
  if ((await page.getByTestId('evidence-words').count()) > 0) {
    await expect(page.getByTestId('evidence-words')).toContainText(/(Today|Yesterday): /)
  }
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b16-brain-evidence-390.png', fullPage: true, animations: 'disabled' })
})
