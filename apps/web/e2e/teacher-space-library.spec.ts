import { expect, test, type Page } from '@playwright/test'

/**
 * B17 phase B §2 at 1440×900: a teacher approves a whole paper's guidelines for a class in
 * one action and sets it as class practice with a due date, from the Past papers page; a
 * topic set is refused until its questions are approved, then set too. Mr Naidoo makes a
 * fresh class for it, so the other teacher specs (11B's unapproved guidelines) stay as
 * they are. Every question is still listed under Guidelines, with its attribution.
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret

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

test('a teacher approves a whole past paper for a class in one action and sets it, and a topic, as class practice', async ({ page }) => {
  await signIn(page, 'mr-naidoo@demo.guardianbook.test', /\/teacher$/)
  await page.getByLabel('Class name').fill('11C')
  await page.getByRole('button', { name: 'Create class' }).click()
  await expect(page.getByRole('heading', { name: '11C is ready' })).toBeVisible()
  await page.getByRole('link', { name: '11C', exact: true }).click()
  await expect(page.getByRole('heading', { name: '11C · class picture' })).toBeVisible()
  await page.getByRole('link', { name: 'Past papers' }).first().click()
  await expect(page.getByRole('heading', { name: 'Past papers' })).toBeVisible()

  const paper = page.getByLabel('Papers').getByRole('listitem').filter({ hasText: 'NSC Mathematics P1, November 2023' })
  await expect(paper).toContainText('3 questions · 9 marks')

  // Practice before approval is refused: nothing is checked against a guideline the teacher has not approved.
  await paper.getByRole('button', { name: 'Set as practice' }).click()
  await expect(paper.getByRole('alert')).toContainText(/Approve the 3 questions for the class first/)

  await paper.getByRole('button', { name: 'Approve all for 11C' }).click()
  await expect(paper.getByRole('status')).toContainText('Approved 3 questions for 11C')
  await paper.getByRole('button', { name: 'Set as practice' }).click()
  await expect(paper.getByRole('status')).toContainText(/Set as class practice for 11C: 3 questions by/)
  await expect(page.getByLabel('Class practice').getByRole('listitem')).toHaveCount(1)

  // A topic set: what comes up says the weight; approve its questions, then set it by a date.
  const topic = page.getByRole('radiogroup', { name: 'Skill' }).getByRole('radio', { name: /Factorising trinomials/ })
  await topic.click()
  await expect(page.getByText(/What comes up: In every Paper 1 since 2022/)).toBeVisible()
  await page.getByRole('button', { name: 'Approve its questions for 11C' }).click()
  await expect(page.getByText(/2 factorising trinomials questions approved for 11C/)).toBeVisible()
  await page.getByRole('form', { name: 'A topic as practice' }).getByRole('button', { name: 'Set as practice' }).click()
  await expect(page.getByText(/Set as class practice: Factorising trinomials, 2 questions by/)).toBeVisible()
  await expect(page.getByLabel('Class practice').getByRole('listitem')).toHaveCount(2)
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b17-teacher-library-1440.png', fullPage: true, animations: 'disabled' })

  // Each question is still listed under Guidelines, approved, with its attribution line.
  await page.getByRole('link', { name: 'Guidelines' }).first().click()
  await expect(page.getByRole('heading', { name: 'Marking guidelines' })).toBeVisible()
  await expect(page.getByText(/Approved for 11C/)).toHaveCount(4) // the paper's three plus the 2022 factorising question
  await expect(page.locator('[data-attribution]')).toHaveCount(4)
  await noOverflow(page)
})
