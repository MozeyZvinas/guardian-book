import { expect, test, type APIRequestContext, type Page, type PlaywrightWorkerArgs } from '@playwright/test'

/**
 * The teacher space at 1440×900 (brief B07 §6): approve a guideline → review → correct a
 * step → add a note → release → assign an intervention → approve and send a note. Mr
 * Naidoo and 11B, whose guideline the seed leaves unapproved; Bongani's work and Mma
 * Lerato's link to him are set up through the API (the mocked model answers every call).
 */

const PASSWORD = 'integration-only-password' // the e2e server's seed password; never a real secret

async function signIn(page: Page, email: string, home: RegExp) {
  await page.goto('/signin')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(home)
}

async function apiAs(playwright: PlaywrightWorkerArgs['playwright'], baseURL: string, email: string): Promise<APIRequestContext> {
  const api = await playwright.request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } })
  const res = await api.post('/api/auth/sign-in/email', { data: { email, password: PASSWORD } })
  expect(res.ok()).toBe(true)
  return api
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('a teacher approves the guideline, reviews, corrects, adds a note, releases, assigns an intervention, approves and sends a note', async ({ page, playwright, baseURL }) => {
  const base = baseURL ?? 'http://127.0.0.1:8097'

  // Mma Lerato links to Bongani too, so a note home has a parent to go to.
  const bongani = await apiAs(playwright, base, 'bongani@demo.guardianbook.test')
  const code = await (await bongani.post('/api/me/guardian-code')).json()
  const guardian = await apiAs(playwright, base, 'mma-lerato@demo.guardianbook.test')
  expect((await guardian.post('/api/guardian/link', { data: { code: code.code } })).ok()).toBe(true)

  // T7: approve the guideline for 11B.
  await signIn(page, 'mr-naidoo@demo.guardianbook.test', /\/teacher$/)
  await page.getByRole('link', { name: '11B', exact: true }).click()
  await expect(page.getByRole('heading', { name: '11B · class picture' })).toBeVisible()
  await page.getByRole('link', { name: 'Guidelines' }).first().click()
  await expect(page.getByRole('heading', { name: 'Marking guidelines' })).toBeVisible()
  const approve = page.getByRole('button', { name: 'Approve for 11B' })
  await expect(approve).toHaveCount(7) // two B02 items plus B06's check-alone match (D37), plus B17's four library questions not held out
  await approve.first().click()
  await expect(page.getByText(/Approved for 11B/).first()).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b07-guidelines-1440.png', fullPage: true, animations: 'disabled' })

  // Bongani brings typed working on the approved item (the first by slug); the mocked model loses the last step.
  const items = await (await bongani.get('/api/items')).json()
  const created = await (await bongani.post('/api/attempts', { data: { itemId: items.items[0].id, answerText: 'x² − 5x + 6 = 0\n(x − 2)(x − 3) = 0', idempotencyKey: 'e2e-b07' } })).json()
  await bongani.post(`/api/attempts/${created.attemptId}/assess`)
  await expect
    .poll(async () => ((await (await bongani.get(`/api/attempts/${created.attemptId}`)).json()) as { attempt: { status: string } }).attempt.status, { timeout: 20_000 })
    .toBe('proposed')

  // T3 → T3a: the queue, then the review in two panes.
  await page.getByRole('link', { name: 'Queue' }).first().click()
  await expect(page.getByRole('heading', { name: 'Confirm queue' })).toBeVisible()
  await page.getByRole('link', { name: /Bongani/ }).click()
  await expect(page.getByRole('heading', { name: 'Bongani’s work' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'The model’s proposal' })).toBeVisible()
  await expect(page.getByLabel('Checks the model cannot skip').getByRole('listitem').first()).toBeVisible()
  await expect(page.getByText('Proposed 3/4')).toBeVisible()

  // Correct a step: the teacher takes step 2 away. Confirm, add her own note for the learner, release.
  await page.getByLabel('Marks for step 2').selectOption('0')
  await expect(page.getByText('Your total 2/4', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Confirm', exact: true }).click()
  await expect(page.getByText(/Confirmed .* version 1/)).toBeVisible()
  await page.getByRole('radio', { name: 'Add' }).click()
  await page.getByLabel('Your own note').fill('Check the signs in the brackets before you move on.')
  await page.getByRole('radio', { name: 'Learner' }).check()
  await page.getByRole('button', { name: 'Save (add)' }).click()
  await expect(page.getByText('You added')).toBeVisible()
  await expect(page.getByText('Check the signs in the brackets before you move on.')).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b07-review-1440.png', fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'Release', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Released' })).toBeDisabled()

  // The learner now sees the released review and the teacher's words; the proposal row is unchanged.
  const mine = await (await bongani.get(`/api/attempts/${created.attemptId}/review`)).json()
  expect(mine.review.state).toBe('released')
  expect(mine.review.total).toBe(2)
  expect(mine.feedback.map((f: { label: string }) => f.label)).toEqual(['From Mr Naidoo'])

  // T2: the gap the teacher confirmed shows on the picture; assign an intervention from it.
  await page.getByRole('link', { name: '11B', exact: true }).first().click()
  await expect(page.getByRole('heading', { name: '11B · class picture' })).toBeVisible()
  await expect(page.getByText(/1 of 1 lost the mark at step 2 of factorise trinomial/)).toBeVisible()
  await page.getByRole('button', { name: 'Assign' }).first().click()
  await page.getByLabel('One line: what you will do').fill('Redo one factorising question with me at break.')
  await page.getByRole('button', { name: /Assign to 1 learner/ }).click()
  await expect(page.getByText(/Assigned to 1 learner/)).toBeVisible()
  await expect(page.getByLabel('Interventions').getByText('Redo one factorising question with me at break.')).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b07-picture-1440.png', fullPage: true, animations: 'disabled' })

  // T4: draft, approve unedited, send; the guardian sees "Teacher-reviewed".
  await page.getByRole('link', { name: /Notes home/ }).click()
  await expect(page.getByRole('heading', { name: 'Notes home' })).toBeVisible()
  await page.getByRole('button', { name: 'Draft notes for this week' }).click()
  await expect(page.getByText('1 draft written', { exact: false })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText('AI suggested')).toBeVisible()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await expect(page.getByText('You approved')).toBeVisible()
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText(/sent \d/)).toBeVisible()
  await noOverflow(page)
  await page.screenshot({ path: 'docs/screenshots/b07-notes-1440.png', fullPage: true, animations: 'disabled' })

  const seen = await (await guardian.get('/api/guardian/notes')).json()
  expect(seen.notes).toHaveLength(1)
  expect(seen.notes[0].label).toBe('Teacher-reviewed')
  expect(seen.notes[0].teacher.nickname).toBe('Mr Naidoo')
})
