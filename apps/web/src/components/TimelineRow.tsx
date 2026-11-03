import type { LearningEventKind, TimelineEvent } from '@guardian-book/shared'
import { shortDateTime } from '../lib/dates'

/** TimelineRow (spec 05 §5): one event in the learner's words, with when, and whether it moved a skill. */

const KIND_WORDS: Record<LearningEventKind, string> = {
  attempt_submitted: 'You brought work',
  assessed: 'Your work was checked',
  retried: 'You tried again',
  review_confirmed: 'Your teacher confirmed the result',
  review_released: 'Your teacher released the result',
  fixed_independently: 'Fixed on your own',
  support_given: 'Your parent helped',
  notice_confirmed: 'A notice was confirmed',
  plan_issued: 'A new step was planned',
  note_sent: 'A note went home',
  profile_set: 'You told us about you',
  independent_check_completed: 'You checked it alone',
  retention_check_completed: 'You checked it again later',
  guideline_approved: 'Your teacher approved a marking guideline',
  feedback_teacher_added: 'Your teacher added feedback',
  intervention_assigned: 'Your teacher planned a check-in',
  intervention_closed: 'A check-in was closed',
}

export function eventWords(kind: LearningEventKind): string {
  return KIND_WORDS[kind]
}

export function TimelineRow({ event, highlighted }: { event: TimelineEvent; highlighted?: boolean }) {
  const basisWord = event.basis === 'teacher_confirmed' ? 'teacher-confirmed' : event.basis === 'model_high' ? 'checked, high confidence' : null
  return (
    <li className={['flex gap-3 rounded-card px-3 py-2', highlighted ? 'bg-surface' : ''].join(' ')}>
      <span aria-hidden="true" className={['mt-1 text-sm', event.counted ? 'text-progress' : 'text-fg-muted'].join(' ')}>
        {event.counted ? '●' : '○'}
      </span>
      <span className="flex flex-1 flex-col">
        <span className="font-medium">
          {eventWords(event.kind)}
          {event.skillLabel ? <span className="font-normal text-fg-muted"> · {event.skillLabel}</span> : null}
        </span>
        <span className="text-sm text-fg-muted">
          <time dateTime={event.occurredAt}>{shortDateTime(event.occurredAt)}</time>
          {basisWord ? ` · ${basisWord}` : ''}
          {event.counted ? ' · counted' : ''}
        </span>
      </span>
    </li>
  )
}
