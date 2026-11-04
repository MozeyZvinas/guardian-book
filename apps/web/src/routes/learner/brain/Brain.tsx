import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { BrainResponse, BrainSkill } from '@guardian-book/shared'
import { getBrain } from '../../../api/learner'
import { RequireRole } from '../../../app/RequireRole'
import { EmptyState } from '../../../components/EmptyState'
import { Button, FormError } from '../../../components/Form'
import { LearnerShell } from '../../../components/LearnerShell'
import { Skeleton } from '../../../components/Skeleton'
import { MARK_LABELS, MARK_LEGEND, Mark, SkillChip, SkillStateBadge } from '../../../components/SkillChip'
import { TimelineRow } from '../../../components/TimelineRow'
import { shortDate } from '../../../lib/dates'
import { plainEvidence } from './evidence'

/**
 * L6 · Brain (spec 05 §4.2, §9; B16 §3): what you can do, and how sure we are. A legend
 * for the three marks, chips per skill, the evidence behind a chip in plain words, and
 * the growth timeline, newest first.
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
        <p className="text-fg-muted">This is what you can do, and how sure we are.</p>
      </div>

      <section aria-labelledby="legend-heading" className="flex flex-col gap-2 rounded-card bg-surface p-4">
        <h2 id="legend-heading" className="text-sm font-semibold">
          The three marks
        </h2>
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          {MARK_LEGEND.map((mark) => (
            <div key={mark.label} className="contents">
              <dt className="font-medium">{mark.label}</dt>
              <dd className="m-0 text-fg-muted">= {mark.means}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-fg-muted">Only checked work and your teacher’s confirmations move these. One good day never does.</p>
      </section>

      <section aria-labelledby="skills-heading" className="flex flex-col gap-3">
        <h2 id="skills-heading" className="text-lg font-semibold">
          Skills
        </h2>
        {skills.length === 0 ? (
          <EmptyState title="Bring your first piece of work and your Brain starts here." action={<Link to="/bring">Bring something</Link>}>
            Every skill you show gets a chip; tap one to see the evidence behind it.
          </EmptyState>
        ) : (
          <ul aria-label="Skills" className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2">
            {skills.map((skill) => (
              <li key={skill.tag}>
                <SkillChip skill={skill} selected={skill.tag === selectedTag} onSelect={() => setSelectedTag(skill.tag === selectedTag ? null : skill.tag)} />
              </li>
            ))}
          </ul>
        )}
        {withEvidence.length === 0 && skills.length > 0 ? (
          <p className="text-sm text-fg-muted">Every skill is new: nothing checked yet. Bring something and the first one moves.</p>
        ) : skills.length > 0 ? (
          <p className="text-sm text-fg-muted">Tap a skill to see the evidence behind it.</p>
        ) : null}
      </section>

      {selected ? <Evidence skill={selected} brain={brain} /> : null}

      <section aria-labelledby="timeline-heading" className="flex flex-col gap-3">
        <h2 id="timeline-heading" className="text-lg font-semibold">
          Growth timeline
        </h2>
        {brain.timeline.length === 0 ? (
          <p className="text-sm text-fg-muted">Your first day. Work you bring, fixes, your teacher’s confirmations and help at home will appear here.</p>
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
  const words = plainEvidence(events, new Date())
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
      {words.length > 0 ? (
        <p className="text-sm" data-testid="evidence-words">
          {words.map((line, index) => (
            <span key={index}>
              {index > 0 ? <span className="text-fg-muted"> · </span> : null}
              {line}
            </span>
          ))}
        </p>
      ) : null}
      <p className="text-sm text-fg-muted tnum">
        {skill.evidenceCount} {skill.evidenceCount === 1 ? 'piece' : 'pieces'} of evidence
        {skill.lastCheckedAt ? ` · last checked ${shortDate(skill.lastCheckedAt)}` : ''}
        {skill.sure.total > 0 ? ` · when you said “I’m sure”, you were right ${skill.sure.correct} of ${skill.sure.total} times` : ''}
      </p>
      <p className="text-sm">
        {skill.state === 'secure'
          ? 'Secure: with help, on your own, and still right later. All three.'
          : skill.state === 'practising'
            ? skill.independent.correct > 0
              ? 'Practising: right on your own. A check two days later will show if it stuck.'
              : 'Practising: right with hints so far. Checking it alone comes next.'
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
