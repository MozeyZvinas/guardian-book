import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { BrainResponse, BrainSkill } from '@guardian-book/shared'
import { getBrain } from '../../../api/learner'
import { RequireRole } from '../../../app/RequireRole'
import { EmptyState } from '../../../components/EmptyState'
import { Button, FormError } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { Skeleton } from '../../../components/Skeleton'
import { MARK_LABELS, Mark, SkillChip, SkillStateBadge } from '../../../components/SkillChip'
import { TimelineRow } from '../../../components/TimelineRow'
import { shortDate } from '../../../lib/dates'

/**
 * L6 · Brain (spec 05 §4.2, §9): what Guardian Book believes about you, and the evidence.
 * Chips per skill with three marks; tap one to see the events behind it; the growth
 * timeline, newest first.
 */
export function Brain() {
  return <RequireRole roles={['learner']}>{() => <BrainScreen />}</RequireRole>
}

type Load = { status: 'loading' } | { status: 'ready'; brain: BrainResponse } | { status: 'error'; error: unknown }

const ORDER = { secure: 0, practising: 1, new: 2 } as const

function BrainScreen() {
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getBrain()
      .then((brain) => {
        if (!cancelled) setLoad({ status: 'ready', brain })
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoad({ status: 'error', error })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  const skills = useMemo(() => {
    if (load.status !== 'ready') return []
    return [...load.brain.skills].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.label.localeCompare(b.label))
  }, [load])

  if (load.status === 'loading') {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Your Brain</h1>
        <Skeleton lines={5} label="Loading your Brain" />
      </LearnerShell>
    )
  }
  if (load.status === 'error') {
    return (
      <LearnerShell>
        <h1 className="text-display font-semibold text-balance">Your Brain</h1>
        <FormError error={load.error} />
        <div>
          <Button
            type="button"
            variant="quiet"
            onClick={() => {
              setLoad({ status: 'loading' })
              setAttempt((n) => n + 1)
            }}
          >
            Try again
          </Button>
        </div>
      </LearnerShell>
    )
  }

  const { brain } = load
  const selected = skills.find((skill) => skill.tag === selectedTag) ?? null
  const withEvidence = skills.filter((skill) => skill.evidenceCount > 0)
  const highlighted = new Set(selected?.evidenceEventIds ?? [])

  return (
    <LearnerShell>
      <div className="flex flex-col gap-2">
        <h1 className="text-display font-semibold text-balance">Your Brain</h1>
        <p className="text-fg-muted">What Guardian Book believes about you, and the evidence.</p>
        <p className="text-sm">
          <strong>Secure</strong> means you did it on your own, and again later.
        </p>
        <p className="text-sm text-fg-muted">Only checked work and your teacher’s confirmations move these. One good day never does.</p>
        {Object.keys(brain.whatComesUp).length > 0 ? (
          <p className="text-sm text-fg-muted">
            <span aria-hidden="true">◷ </span>
            What comes up: how often a skill appears in the <Link to="/library">past papers</Link>, and the marks it carries.
          </p>
        ) : null}
      </div>

      <section aria-labelledby="skills-heading" className="flex flex-col gap-3">
        <h2 id="skills-heading" className="text-lg font-semibold">
          Skills
        </h2>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
          <span>Marks:</span>
          <span>{MARK_LABELS.assisted}</span>
          <span>{MARK_LABELS.independent}</span>
          <span>{MARK_LABELS.retained}</span>
        </p>
        {skills.length === 0 ? (
          <EmptyState title="Nothing here yet" action={<Link to="/bring">Bring something</Link>}>
            Your first checked piece of work starts the map.
          </EmptyState>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {skills.map((skill) => (
              <li key={skill.tag}>
                <SkillChip skill={skill} selected={skill.tag === selectedTag} onSelect={() => setSelectedTag(skill.tag === selectedTag ? null : skill.tag)} comesUp={brain.whatComesUp[skill.tag]?.sentence ?? null} />
              </li>
            ))}
          </ul>
        )}
        {withEvidence.length === 0 && skills.length > 0 ? (
          <p className="text-sm text-fg-muted">Every skill is new: nothing checked yet. Bring something and the first one moves.</p>
        ) : null}
      </section>

      {selected ? <Evidence skill={selected} brain={brain} /> : null}

      <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
        <h2 id="timeline-heading" className="text-lg font-semibold">
          Growth timeline
        </h2>
        {brain.timeline.length === 0 ? (
          <p className="text-sm text-fg-muted">Your first day. Attempts, fixes, your teacher’s confirmations and help at home will appear here.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {brain.timeline.map((event) => (
              <TimelineRow key={event.id} event={event} highlighted={highlighted.has(event.id)} />
            ))}
          </ul>
        )}
      </section>
    </LearnerShell>
  )
}

function Evidence({ skill, brain }: { skill: BrainSkill; brain: BrainResponse }) {
  const events = brain.timeline.filter((event) => skill.evidenceEventIds.includes(event.id))
  return (
    <section aria-labelledby="evidence-heading" className="flex flex-col gap-3 rounded-card bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 id="evidence-heading" className="text-lg font-semibold">
          {skill.label}
        </h2>
        <SkillStateBadge state={skill.state} />
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <Mark label={MARK_LABELS.assisted} mark={skill.assisted} />
        <Mark label={MARK_LABELS.independent} mark={skill.independent} />
        <Mark label={MARK_LABELS.retained} mark={skill.retained} />
      </p>
      <p className="text-sm text-fg-muted tnum">
        {skill.evidenceCount} {skill.evidenceCount === 1 ? 'piece' : 'pieces'} of evidence
        {skill.lastCheckedAt ? ` · last checked ${shortDate(skill.lastCheckedAt)}` : ''}
        {skill.sure.total > 0 ? ` · when you said “I’m sure”, you were right ${skill.sure.correct} of ${skill.sure.total} times` : ''}
      </p>
      <p className="text-sm">
        {skill.state === 'secure'
          ? 'Secure: you did it on your own and again later, on different days.'
          : skill.state === 'practising'
            ? skill.independent.correct > 0
              ? 'Practising: you did it on your own. A check later will show if it stuck.'
              : 'Practising: so far with help or hints. Checking it alone comes next.'
            : 'New: nothing checked on this yet.'}
      </p>
      {events.length > 0 ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {events.map((event) => (
            <TimelineRow key={event.id} event={event} />
          ))}
        </ul>
      ) : null}
    </section>
  )
}
