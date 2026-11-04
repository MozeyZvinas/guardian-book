import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import type { GuidelineItemView, MeResponse } from '@guardian-book/shared'
import { ApiRequestError } from '../../../api/client'
import { guidelines as fetchGuidelines, reviewAttempt } from '../../../api/teacher'
import { RequireRole } from '../../../app/RequireRole'
import { Button, Card, Field, FormError, Select } from '../../../components/Form'
import { MathText } from '../../../components/MathText'
import { describeSize, prepareUpload } from '../../../lib/imagePrep'
import { ClassEyebrow, NotMine, TeacherShell, useLoad } from '../shell/TeacherShell'
import { classDetail, uploadScript } from './api'

/**
 * B11 · Mark a script (`/teacher/classes/:id/script`; spec 02 P1-g): the school workflow on
 * the existing path. Pick the learner, pick the question (shown as maths), photograph or
 * upload the script, wait while the model reads it, then go to Review. The result lands in
 * the queue like any other attempt; nothing reaches the learner or the parent until release.
 */
export function TeacherScript() {
  return <RequireRole roles={['teacher']}>{(me) => <ScriptScreen me={me} />}</RequireRole>
}

const POLL_MS = 2_000

function ScriptScreen({ me }: { me: MeResponse }) {
  const { id: classId = '' } = useParams()
  const cls = me.classes.find((c) => c.id === classId)
  const roster = useLoad(() => classDetail(classId), classId)
  const guidelinesLoad = useLoad(() => fetchGuidelines(classId), classId)
  const navigate = useNavigate()
  const [learnerId, setLearnerId] = useState('')
  const [itemId, setItemId] = useState('')
  const [file, setFile] = useState<{ blob: Blob; filename: string } | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [attemptId, setAttemptId] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const idempotencyKey = useRef(crypto.randomUUID())

  // Wait for the check: poll the review view every 2 s, then go to Review.
  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null
    async function poll() {
      try {
        const view = await reviewAttempt(attemptId ?? '')
        if (cancelled) return
        setStatus(view.attempt.status)
        if (view.attempt.status === 'assessing' || view.attempt.status === 'submitted') {
          timer = setTimeout(() => void poll(), POLL_MS)
          return
        }
        void navigate(`/teacher/attempts/${attemptId}`)
      } catch (err) {
        if (!cancelled) setError(err)
      }
    }
    void poll()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [attemptId, navigate])

  if (!cls) {
    return (
      <TeacherShell me={me} title="Mark a script">
        <NotMine />
      </TeacherShell>
    )
  }

  const items: GuidelineItemView[] = guidelinesLoad.data?.items ?? []
  const approved = items.filter((item) => item.approval !== null)
  const chosen = approved.find((item) => item.id === itemId) ?? null

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    event.target.value = ''
    if (!picked) return
    setProblem(null)
    if (!/^image\/(jpeg|png|webp)$/.test(picked.type)) {
      setProblem('Use a JPEG, PNG or WebP photo of the script.')
      return
    }
    const prepared = await prepareUpload(picked)
    if (prepared.blob.size > 8 * 1024 * 1024) {
      setProblem(`That photo is ${describeSize(prepared.blob.size)}; the limit is 8 MB.`)
      return
    }
    setFile(prepared)
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!learnerId || !itemId || !file) {
      setProblem(!learnerId ? 'Pick the learner.' : !itemId ? 'Pick the question.' : 'Add a photo of the script.')
      return
    }
    setBusy(true)
    setError(null)
    setProblem(null)
    try {
      const result = await uploadScript(classId, { learnerId, itemId, idempotencyKey: idempotencyKey.current }, file.blob, file.filename)
      setAttemptId(result.attemptId)
      setStatus('assessing')
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'guideline_not_approved') setProblem('Approve this question’s marking guideline for the class first (Guidelines).')
      else setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <TeacherShell me={me} classId={classId} title="Mark a script" eyebrow={<ClassEyebrow classId={classId} name={cls.name} />}>
      <p className="m-0 text-fg-muted">A learner’s test answer, photographed or uploaded by you. It is read against the guideline you approved, lands in your queue, and reaches the learner only when you release it.</p>
      {roster.error ? <FormError error={roster.error} /> : null}
      {guidelinesLoad.error ? <FormError error={guidelinesLoad.error} /> : null}

      {attemptId ? (
        <Card title="Reading the script">
          <p role="status" aria-live="polite" className="m-0 flex items-center gap-2 text-fg-muted">
            <span aria-hidden="true" className="inline-block h-2 w-2 animate-pulse rounded-full bg-progress" />
            {status === 'assessing' || status === 'submitted' || status === null ? 'The model is reading the working against the guideline…' : 'Done. Opening the review…'}
          </p>
          <p className="m-0 text-sm text-fg-muted">
            <Link to={`/teacher/attempts/${attemptId}`}>Go to the review</Link> · <Link to={`/teacher/classes/${classId}/queue`}>Queue</Link>
          </p>
        </Card>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
          <Card title="1 · The learner">
            <Field label="Learner" htmlFor="script-learner" hint={roster.data && roster.data.members.length === 0 ? 'No learners have joined this class yet.' : undefined}>
              <Select id="script-learner" value={learnerId} onChange={(e) => setLearnerId(e.target.value)} required disabled={!roster.data}>
                <option value="">{roster.data ? 'Pick the learner' : 'Loading…'}</option>
                {(roster.data?.members ?? []).map((member) => (
                  <option key={member.learnerId} value={member.learnerId}>
                    {member.nickname}
                  </option>
                ))}
              </Select>
            </Field>
          </Card>

          <Card title="2 · The question">
            <Field
              label="Question"
              htmlFor="script-item"
              hint={guidelinesLoad.data && approved.length === 0 ? `No guideline is approved for ${cls.name} yet. Approve one under Guidelines first.` : `Only questions whose guideline you approved for ${cls.name} are listed.`}
            >
              <Select id="script-item" value={itemId} onChange={(e) => setItemId(e.target.value)} required disabled={!guidelinesLoad.data}>
                <option value="">{guidelinesLoad.data ? 'Pick the question' : 'Loading…'}</option>
                {approved.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.topic} · {item.slug} · {item.maxMarks} marks
                  </option>
                ))}
              </Select>
            </Field>
            {chosen ? (
              <div className="rounded-card bg-ground p-3">
                <p className="m-0 text-sm text-fg-muted tnum">
                  {chosen.topic} · {chosen.maxMarks} marks · revision {chosen.revision}
                </p>
                <MathText as="p" text={chosen.promptMd} className="m-0 font-serif whitespace-pre-wrap" />
              </div>
            ) : null}
            {guidelinesLoad.data && approved.length === 0 ? (
              <p className="m-0 text-sm">
                <Link to={`/teacher/classes/${classId}/guidelines`}>Guidelines for {cls.name}</Link>
              </p>
            ) : null}
          </Card>

          <Card title="3 · The script">
            <Field label="Photo of the script" htmlFor="script-image" hint={file ? `Ready: ${file.filename} (${describeSize(file.blob.size)})` : 'Photograph it, or upload a JPEG, PNG or WebP, up to 8 MB.'}>
              <input id="script-image" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onFile} className="block w-full text-sm" />
            </Field>
            {problem ? (
              <p role="alert" className="m-0 text-sm font-medium">
                <span aria-hidden="true">! </span>
                {problem}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? 'Uploading…' : 'Read and mark'}
              </Button>
              <span className="text-sm text-fg-muted">Independent work (a test): no hints are given, and the learner sees nothing until you release it.</span>
            </div>
          </Card>
        </form>
      )}
      <FormError error={error} />
    </TeacherShell>
  )
}

