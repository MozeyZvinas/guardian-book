import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { skillLabel, type LibraryPaper, type LibrarySearchResponse, type MeResponse } from '@guardian-book/shared'
import { libraryPapers, librarySearch } from '../../api/library'
import { EmptyState } from '../../components/EmptyState'
import { Field, FormError, TextInput } from '../../components/Form'
import { MathText } from '../../components/MathText'
import { Skeleton } from '../../components/Skeleton'
import { Attribution, LibraryFrame } from './LibraryFrame'

/**
 * The library (brief B17 phase B §1; D40): Subject → Grade → Year → Session → Paper, as
 * chips that stay in reach while the list scrolls on a phone; search by topic across every
 * loaded question. Every question shows its attribution line. Behind sign-in only.
 */
export function Library() {
  return (
    <LibraryFrame title="Past papers" eyebrow="Real exam questions, with their memos">
      {(me) => <LibraryScreen me={me} />}
    </LibraryFrame>
  )
}

type Load = { status: 'loading' } | { status: 'ready'; papers: LibraryPaper[] } | { status: 'error'; error: unknown }

const chip = (active: boolean) =>
  ['inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium', active ? 'bg-fg text-ground' : 'bg-surface text-fg ring-1 ring-fg-muted/40'].join(' ')

function LibraryScreen({ me }: { me: MeResponse }) {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''

  useEffect(() => {
    let cancelled = false
    libraryPapers()
      .then((result) => {
        if (!cancelled) setLoad({ status: 'ready', papers: result.papers })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', error })
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (load.status === 'loading') return <Skeleton lines={5} label="Loading the library" />
  if (load.status === 'error') return <FormError error={load.error} />

  const { papers } = load
  if (papers.length === 0) {
    return (
      <EmptyState title="No past papers loaded yet">
        When real exam questions are loaded, they appear here by subject, grade, year, session and paper, each with its memo and its source.
      </EmptyState>
    )
  }
  return (
    <>
      <SearchBox query={query} onChange={(next) => setParams(next ? { q: next } : {}, { replace: true })} />
      {query ? <SearchResults key={query} query={query} role={me.profile.role} /> : <Browse papers={papers} />}
    </>
  )
}

function SearchBox({ query, onChange }: { query: string; onChange: (query: string) => void }) {
  const [draft, setDraft] = useState(query)
  return (
    <form
      role="search"
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        onChange(draft.trim())
      }}
    >
      <Field label="Search by topic" htmlFor="library-search" hint="For example factorising, sequences, tangent.">
        <div className="flex gap-2">
          <TextInput id="library-search" type="search" value={draft} maxLength={80} onChange={(event) => setDraft(event.target.value)} enterKeyHint="search" autoComplete="off" />
          <button type="submit" className="inline-flex min-h-11 shrink-0 items-center rounded-card border border-fg-muted/50 bg-surface px-4 font-medium text-fg">
            Search
          </button>
        </div>
      </Field>
      {query ? (
        <p className="m-0 text-sm text-fg-muted">
          Showing questions on “{query}”.{' '}
          <button
            type="button"
            className="min-h-11 text-action underline"
            onClick={() => {
              setDraft('')
              onChange('')
            }}
          >
            Browse by paper instead
          </button>
        </p>
      ) : null}
    </form>
  )
}

/** Four rows of chips, each narrowing the next; the paper list follows. Sticky on a phone so the chips stay in reach. */
function Browse({ papers }: { papers: LibraryPaper[] }) {
  const subjects = useMemo(() => unique(papers.map((p) => p.subjectSlug)), [papers])
  const [subject, setSubject] = useState(subjects[0] ?? '')
  const bySubject = papers.filter((p) => p.subjectSlug === subject)
  const grades = unique(bySubject.map((p) => p.grade)).sort((a, b) => b - a)
  const [gradePick, setGrade] = useState<number | null>(null)
  const grade = gradePick !== null && grades.includes(gradePick) ? gradePick : (grades[0] ?? null)
  const byGrade = bySubject.filter((p) => p.grade === grade)
  const years = unique(byGrade.map((p) => p.year)).sort((a, b) => b - a)
  const [yearPick, setYear] = useState<number | null>(null)
  const year = yearPick !== null && years.includes(yearPick) ? yearPick : (years[0] ?? null)
  const byYear = byGrade.filter((p) => p.year === year)
  const sessions = unique(byYear.map((p) => p.session))
  const [sessionPick, setSession] = useState<string | null>(null)
  const session = sessionPick !== null && sessions.includes(sessionPick as LibraryPaper['session']) ? sessionPick : (sessions[0] ?? null)
  const shown = byYear.filter((p) => p.session === session)

  return (
    <>
      <div className="sticky top-0 z-[1] -mx-4 flex flex-col gap-2 bg-ground px-4 py-2 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:px-0">
        <ChipRow label="Subject" options={subjects.map((s) => ({ value: s, label: bySubjectName(papers, s) }))} value={subject} onChange={setSubject} />
        <ChipRow label="Grade" options={grades.map((g) => ({ value: String(g), label: `Grade ${g}` }))} value={String(grade)} onChange={(v) => setGrade(Number(v))} />
        <ChipRow label="Year" options={years.map((y) => ({ value: String(y), label: String(y) }))} value={String(year)} onChange={(v) => setYear(Number(v))} />
        <ChipRow label="Session" options={sessions.map((s) => ({ value: s, label: byYear.find((p) => p.session === s)?.sessionLabel ?? s }))} value={session ?? ''} onChange={setSession} />
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label="Papers">
        {shown.map((paper) => (
          <li key={paper.path}>
            <Link to={`/library/${paper.path}`} className="flex min-h-14 items-center justify-between gap-3 rounded-card bg-surface px-4 py-3 text-fg no-underline">
              <span className="flex flex-col">
                <span className="font-medium">Paper {paper.paper}</span>
                <span className="text-sm text-fg-muted">{paper.title}</span>
              </span>
              <span className="text-sm text-fg-muted tnum">
                {paper.questions} {paper.questions === 1 ? 'question' : 'questions'} · {paper.marks} marks
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}

function ChipRow<T extends string>({ label, options, value, onChange }: { label: string; options: { value: T; label: string }[]; value: string; onChange: (value: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={label}>
      <span className="w-16 shrink-0 text-xs font-medium text-fg-muted">{label}</span>
      {options.map((option) => (
        <button key={option.value} type="button" role="radio" aria-checked={option.value === value} className={chip(option.value === value)} onClick={() => onChange(option.value)}>
          {option.value === value ? '● ' : ''}
          {option.label}
        </button>
      ))}
    </div>
  )
}

function SearchResults({ query, role }: { query: string; role: MeResponse['profile']['role'] }) {
  // Keyed by `query` from the parent, so each search starts from a fresh loading state.
  const [result, setResult] = useState<LibrarySearchResponse | null>(null)
  const [error, setError] = useState<unknown>(null)
  useEffect(() => {
    let cancelled = false
    librarySearch(query)
      .then((next) => {
        if (!cancelled) setResult(next)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [query])
  if (error) return <FormError error={error} />
  if (!result) return <Skeleton lines={3} label="Searching" />
  if (result.results.length === 0) return <p className="text-fg-muted">Nothing on “{query}” yet. Try another word for the topic.</p>
  const audience = role === 'teacher' ? 'teacher' : 'learner'
  return (
    <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Search results">
      {result.results.map((question) => (
        <li key={question.id} className="flex flex-col gap-2 rounded-card bg-surface p-4">
          <p className="m-0 text-sm text-fg-muted">
            <Link to={`/library/${question.paper.path}`}>{question.paper.title}</Link> · Q{question.question} · {question.maxMarks} marks · {question.skillTags.map((tag) => skillLabel(tag, audience)).join(', ')}
          </p>
          <MathText as="p" text={question.promptMd} className="m-0 font-serif whitespace-pre-wrap" />
          <Attribution text={question.attribution} />
          <p className="m-0 text-sm">
            <Link to={`/library/${question.paper.path}#q-${question.id}`}>Open in the paper</Link>
          </p>
        </li>
      ))}
    </ul>
  )
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}

function bySubjectName(papers: LibraryPaper[], slug: string): string {
  return papers.find((p) => p.subjectSlug === slug)?.subject ?? slug
}
