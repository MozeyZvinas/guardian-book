import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import type { MeResponse } from '@guardian-book/shared'
import { SignOutButton } from '../../../components/SignOutButton'
import { Wordmark } from '../../../components/Wordmark'

/**
 * The teacher's frame (spec 05 §2 tab bars, §6 ≥1024 sidebar, §9 navigation): Classes ·
 * Queue · Notes · Guidelines. Desktop-first, works on a phone: the tabs wrap under the
 * wordmark below 1024 px and become a left sidebar from 1024 px; content is capped at
 * 1200 px. Class-scoped tabs follow the class on screen, else the teacher's first class.
 */
export function TeacherShell({ me, classId, eyebrow, title, children, wide = false }: { me: MeResponse; classId?: string | undefined; eyebrow?: ReactNode; title: string; children: ReactNode; wide?: boolean }) {
  const current = classId ?? me.classes[0]?.id
  const tabs = [
    { to: '/teacher', label: 'Classes', end: true },
    { to: current ? `/teacher/classes/${current}/queue` : '/teacher', label: 'Queue', end: false },
    { to: current ? `/teacher/classes/${current}/notes` : '/teacher', label: 'Notes', end: false },
    { to: current ? `/teacher/classes/${current}/guidelines` : '/teacher', label: 'Guidelines', end: false },
    // B17: approve a past paper for the class and set practice from the library.
    { to: current ? `/teacher/classes/${current}/library` : '/library', label: 'Past papers', end: false },
  ]
  return (
    <div className="flex min-h-dvh flex-col bg-ground text-fg">
      <div className={['mx-auto flex w-full flex-1 flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-10', wide ? 'max-w-[1200px]' : 'max-w-[1200px]'].join(' ')}>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <Wordmark />
          <nav aria-label="Teacher" className="flex flex-wrap gap-x-4 gap-y-1 text-sm lg:flex-col lg:gap-1">
            {tabs.map((tab) => (
              <NavLink
                key={tab.label}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) => ['rounded-card py-1 lg:px-3 lg:py-2', isActive ? 'font-medium text-fg no-underline lg:bg-surface' : ''].join(' ')}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
          <p className="m-0 hidden text-xs text-fg-muted lg:block">
            {me.profile.nickname}
            {me.school ? ` · ${me.school.name}` : ''}
          </p>
          <div className="hidden lg:block">
            <SignOutButton />
          </div>
        </aside>
        <main className="flex min-w-0 flex-1 flex-col gap-6">
          <div className="flex flex-col gap-1">
            {eyebrow ? <p className="m-0 text-sm text-fg-muted">{eyebrow}</p> : null}
            <h1 className="text-display font-semibold text-balance">{title}</h1>
          </div>
          {children}
          <div className="lg:hidden">
            <SignOutButton />
          </div>
        </main>
      </div>
    </div>
  )
}

/** The class line above a title: the class name, linking back to its picture. */
export function ClassEyebrow({ classId, name }: { classId: string; name: string }) {
  return (
    <>
      <Link to={`/teacher/classes/${classId}`}>{name}</Link> · class picture
    </>
  )
}

/** Load once per key, with a `reload` for after a change (spec 05 §7: loading, error, retry). */
export function useLoad<T>(load: () => Promise<T>, key: string): { data: T | null; error: unknown; reload: () => void; loading: boolean } {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [version, setVersion] = useState(0)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    load()
      .then((next) => {
        if (cancelled) return
        setData(next)
        setError(null)
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // `key` and `version` drive the load; `load` is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version])
  return { data, error, loading, reload: () => setVersion((n) => n + 1) }
}

export function NotMine() {
  return (
    <p className="text-fg-muted">
      That class is not yours. <Link to="/teacher">My classes</Link>
    </p>
  )
}

/** Dates in the teacher space, South African style. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function formatDate(iso: string): string {
  return new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' })
}

/** YYYY-MM-DD, `days` from today, in the browser's own day. */
export function datePlus(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
