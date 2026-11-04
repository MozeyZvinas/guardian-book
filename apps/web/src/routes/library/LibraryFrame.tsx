import type { ReactNode } from 'react'
import type { MeResponse } from '@guardian-book/shared'
import { RequireRole } from '../../app/RequireRole'
import { LearnerShell } from '../../components/LearnerShell'
import { TeacherShell } from '../teacher/shell/TeacherShell'

/**
 * The library lives in both spaces (brief B17 phase B §1): a learner sees it inside the
 * learner shell (tab bar, 600 px column); a teacher inside the teacher shell. Guardians
 * are sent to their own home: the API answers them 404 too.
 */
export function LibraryFrame({ title, eyebrow, children }: { title: string; eyebrow?: ReactNode; children: (me: MeResponse) => ReactNode }) {
  return (
    <RequireRole roles={['learner', 'teacher']}>
      {(me) =>
        me.profile.role === 'teacher' ? (
          <TeacherShell me={me} title={title} eyebrow={eyebrow}>
            {children(me)}
          </TeacherShell>
        ) : (
          <LearnerShell>
            <div className="flex flex-col gap-1">
              {eyebrow ? <p className="m-0 text-sm text-fg-muted">{eyebrow}</p> : null}
              <h1 className="text-display font-semibold text-balance">{title}</h1>
            </div>
            {children(me)}
          </LearnerShell>
        )
      }
    </RequireRole>
  )
}

/** The attribution line (D40): shown under every question, wherever it is shown; never hidden. */
export function Attribution({ text, className = '' }: { text: string; className?: string }) {
  return (
    <p className={['m-0 text-xs text-fg-muted', className].join(' ')} data-attribution>
      <span aria-hidden="true">© </span>
      {text}
    </p>
  )
}
