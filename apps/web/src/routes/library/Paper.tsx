import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { skillLabel, type LibraryPaperResponse, type LibraryQuestion, type MeResponse } from '@guardian-book/shared'
import { diagramUrl, libraryPaper } from '../../api/library'
import { FormError } from '../../components/Form'
import { MathText } from '../../components/MathText'
import { Skeleton } from '../../components/Skeleton'
import { Attribution, LibraryFrame } from './LibraryFrame'

/**
 * One paper (brief B17 phase B §1): its questions rendered with MathText and diagrams,
 * marks and the attribution line on every one; a progress mark on the questions you have
 * done; Check my work (the homework check, memo steps as the guideline); the memo after
 * your own attempt, or for a teacher. "Download" goes to DBE's own page, never a PDF here.
 */
export function Paper() {
  const { subject = '', grade = '', year = '', session = '', paper = '' } = useParams()
  const path = [subject, grade, year, session, paper].join('/')
  return (
    <LibraryFrame title="Paper" eyebrow={<Link to="/library">Past papers</Link>}>
      {(me) => <PaperScreen key={path} me={me} path={path} />}
    </LibraryFrame>
  )
}

/**
 * B15's "Help me with this" guide (`/guide/:id`) is not on main yet; the link stays hidden
 * until it is. Set this to the route when B15 merges.
 */
const GUIDE_ROUTE: string | null = null

type Load = { status: 'loading' } | { status: 'ready'; data: LibraryPaperResponse } | { status: 'error'; error: unknown }

function PaperScreen({ me, path }: { me: MeResponse; path: string }) {
  // Keyed by `path` from the parent, so a new paper starts from a fresh loading state.
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    libraryPaper(path)
      .then((data) => {
        if (!cancelled) setLoad({ status: 'ready', data })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', error })
      })
    return () => {
      cancelled = true
    }
  }, [path])

  if (load.status === 'loading') return <Skeleton lines={6} label="Loading the paper" />
  if (load.status === 'error') return <FormError error={load.error} />
  const { paper, questions, download } = load.data
  const teacher = me.profile.role === 'teacher'
  const done = questions.filter((q) => q.progress !== 'none').length
  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-lg font-semibold">{paper.title}</h2>
        <p className="m-0 text-sm text-fg-muted tnum">
          Grade {paper.grade} · {paper.questions} {paper.questions === 1 ? 'question' : 'questions'} · {paper.marks} marks
          {!teacher ? ` · ${done} of ${paper.questions} done` : ''}
        </p>
        <p className="m-0 text-sm">
          <a href={download.url} target="_blank" rel="noopener noreferrer">
            {download.label}
          </a>
        </p>
      </div>
      <ol className="m-0 flex list-none flex-col gap-4 p-0" aria-label="Questions">
        {questions.map((question) => (
          <QuestionCard key={question.id} question={question} teacher={teacher} paperPath={paper.path} />
        ))}
      </ol>
    </>
  )
}

const PROGRESS: Record<LibraryQuestion['progress'], { glyph: string; text: string } | null> = {
  none: null,
  checking: { glyph: '◌', text: 'Being read' },
  checked: { glyph: '●', text: 'Checked' },
  uncertain: { glyph: '◐', text: 'Your teacher is checking' },
  reviewed: { glyph: '✓', text: 'Teacher-reviewed' },
}

const STEP_TYPE: Record<'M' | 'A' | 'CA', string> = { M: 'Method', A: 'Accuracy', CA: 'Consistent accuracy' }

function QuestionCard({ question, teacher, paperPath }: { question: LibraryQuestion; teacher: boolean; paperPath: string }) {
  const progress = PROGRESS[question.progress]
  const audience = teacher ? 'teacher' : 'learner'
  const canCheck = !teacher && question.approvedForYou === true
  return (
    <li id={`q-${question.id}`} className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="m-0 text-base font-semibold tnum">Question {question.question}</h3>
        <span className="text-sm text-fg-muted tnum">{question.maxMarks} marks</span>
      </div>
      <p className="m-0 text-xs text-fg-muted">{question.skillTags.map((tag) => skillLabel(tag, audience)).join(' · ')}</p>
      <MathText as="p" text={question.promptMd} className="m-0 font-serif whitespace-pre-wrap" />
      {question.hasDiagram ? <img src={diagramUrl(question.id)} alt={`Diagram for question ${question.question}`} className="max-w-full rounded-card bg-ground" loading="lazy" /> : null}
      <Attribution text={question.attribution} />
      {progress ? (
        <p className="m-0 text-sm" data-progress={question.progress}>
          <span aria-hidden="true" className={question.progress === 'checked' || question.progress === 'reviewed' ? 'text-progress' : 'text-fg-muted'}>
            {progress.glyph}{' '}
          </span>
          {progress.text}
          {question.attemptId ? (
            <>
              {' · '}
              <Link to={`/attempts/${question.attemptId}`}>Your work</Link>
            </>
          ) : null}
        </p>
      ) : null}
      {!teacher ? (
        <div className="flex flex-wrap items-center gap-3">
          {canCheck ? (
            <Link to={`/items/${question.id}?paper=${encodeURIComponent(paperPath)}`} className="inline-flex min-h-11 items-center justify-center rounded-card border border-fg-muted/50 bg-ground px-5 font-medium text-fg no-underline">
              Check my work
            </Link>
          ) : (
            <span className="text-sm text-fg-muted">Not approved for your class yet. Ask your teacher.</span>
          )}
          {GUIDE_ROUTE ? (
            <Link to={`${GUIDE_ROUTE}?item=${question.id}`} className="inline-flex min-h-11 items-center">
              Help me with this
            </Link>
          ) : null}
        </div>
      ) : null}
      {question.memoSteps ? (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer font-medium">Memo{teacher ? '' : ' (after your attempt)'}</summary>
          <table className="mt-2 w-full border-collapse">
            <caption className="sr-only">Marking steps for question {question.question}</caption>
            <thead>
              <tr className="text-left text-fg-muted">
                <th scope="col" className="py-1 pr-3 font-medium">
                  Step
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Marks
                </th>
                <th scope="col" className="py-1 font-medium">
                  Criterion
                </th>
              </tr>
            </thead>
            <tbody>
              {question.memoSteps.map((step) => (
                <tr key={step.id} className="border-t border-fg-muted/20 align-top">
                  <td className="py-2 pr-3 tnum">
                    {step.stepNo}{' '}
                    <abbr title={STEP_TYPE[step.stepType]} className="no-underline">
                      {step.stepType}
                    </abbr>
                  </td>
                  <td className="py-2 pr-3 tnum">{step.marks}</td>
                  <td className="py-2">
                    <MathText text={step.criterion} className="font-serif" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </li>
  )
}
