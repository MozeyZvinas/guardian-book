import { useEffect, useState, type FormEvent } from 'react'
import type { MeResponse, SchoolSummary } from '@guardian-book/shared'
import { createClass, schools as fetchSchools } from '../../api/circle'
import { RequireRole } from '../../app/RequireRole'
import { Button, Card, Field, FormError, Select, TextInput } from '../../components/Form'
import { Page } from '../../components/Page'
import { SignOutButton } from '../../components/SignOutButton'
import { StatusChip } from '../../components/StatusChip'
import { useMe } from '../../state/me'

/** T1 · Classes (spec 05 §4.4): my classes with learner counts; create a class → a code to share. */
export function TeacherClasses() {
  return <RequireRole roles={['teacher']}>{(me) => <ClassesScreen me={me} />}</RequireRole>
}

function ClassesScreen({ me }: { me: MeResponse }) {
  const { refresh } = useMe()
  const needsSchool = me.profile.schoolId === null
  const [schoolList, setSchoolList] = useState<SchoolSummary[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<{ name: string; code: string } | null>(null)

  useEffect(() => {
    if (!needsSchool) return
    fetchSchools()
      .then((result) => setSchoolList(result.schools))
      .catch((err: unknown) => setError(err))
  }, [needsSchool])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const name = String(data.get('name') ?? '').trim()
    const schoolId = needsSchool ? String(data.get('schoolId') ?? '') : undefined
    setBusy(true)
    setError(null)
    try {
      const result = await createClass(schoolId ? { name, schoolId } : { name })
      setCreated({ name: result.class.name, code: result.code })
      form.reset()
      await refresh()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <h1 className="text-display font-semibold text-balance">My classes</h1>
      {me.school ? <p className="text-fg-muted">{me.school.name}</p> : null}

      {me.classes.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {me.classes.map((cls) => (
            <li key={cls.id} className="flex items-center justify-between rounded-card bg-surface px-4 py-3">
              <span className="font-medium">{cls.name}</span>
              <span className="text-sm text-fg-muted tnum">
                {cls.learnerCount} {cls.learnerCount === 1 ? 'learner' : 'learners'}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-fg-muted">No classes yet. Create one and share its code.</p>
      )}
      <p className="text-sm text-fg-muted">
        The class picture and the confirm queue arrive with the next builds. <StatusChip status="PLANNED" />
      </p>

      {created ? (
        <Card title={`${created.name} is ready`}>
          <p className="text-sm text-fg-muted">Share this code with your class. It is shown once; only its hash is stored.</p>
          <p className="text-3xl font-semibold tracking-[0.2em] tnum">{created.code}</p>
        </Card>
      ) : null}

      <Card title="Create a class">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {needsSchool ? (
            <Field label="School" htmlFor="schoolId" hint="Your first class sets your school. Only fictional schools exist in this build.">
              <Select id="schoolId" name="schoolId" required defaultValue="">
                <option value="" disabled>
                  {schoolList ? 'Choose a school' : 'Loading schools…'}
                </option>
                {(schoolList ?? []).map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label="Class name" htmlFor="name" hint="For example 12A.">
            <TextInput id="name" name="name" autoComplete="off" maxLength={40} required />
          </Field>
          <FormError error={error} />
          <div>
            <Button type="submit" disabled={busy || (needsSchool && !schoolList)}>
              {busy ? 'Creating…' : 'Create class'}
            </Button>
          </div>
        </form>
      </Card>
      <div>
        <SignOutButton />
      </div>
    </Page>
  )
}
