import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { Wordmark } from '../../components/Wordmark'
import { SentinelMark } from './SentinelMark'

/**
 * P1 · Landing (spec 05 §4.1, §9; brief B09 §1; D35 headline by surface). For a judge, a
 * parent or a teacher arriving cold, 360 px first: the hero, one panel per person with a
 * real screenshot, how the loop works in four steps, Try it · Sign in · See the proof,
 * and the product sign-off. Pink is the one action and the one emphasised word (A1);
 * the "How it works" sheet is the Sentinel black sheet (white in night mode).
 */

const PEOPLE: { who: string; sentence: string; shot: string; alt: string; phone: boolean }[] = [
  {
    who: 'Learner',
    sentence: 'The exact step that slipped, read against their teacher’s marking guideline, and one hint. Never the answer.',
    shot: '/shots/learner-feedback.webp',
    alt: 'A learner’s feedback screen: the question, their typed working, four marked steps and one hint for the step that slipped.',
    phone: true,
  },
  {
    who: 'Parent',
    sentence: 'This week in plain words and one thing to do tonight. Never the work, the marks or the photos.',
    shot: '/shots/parent-week.webp',
    alt: 'A parent’s This week screen: something to celebrate, effort by day, the one gap in plain words and tonight’s one thing.',
    phone: true,
  },
  {
    who: 'Teacher',
    sentence: 'Who shares the gap, a queue to confirm, and the note home she approves before it goes anywhere.',
    shot: '/shots/teacher-picture.webp',
    alt: 'A teacher’s class picture: shared gaps with an Assign button, who needs her, and open interventions by follow-up date.',
    phone: false,
  },
]

const STEPS: { title: string; body: ReactNode }[] = [
  {
    title: 'Bring anything',
    body: (
      <>
        A homework photo, typed working, a school notice or a question. <span className="font-serif">Solve for x: x² − 5x + 6 = 0.</span>
      </>
    ),
  },
  {
    title: 'The exact step and a hint',
    body: 'Muse Spark reads it against a marking guideline the teacher approved. Checks the model cannot skip gate every output; anything uncertain goes to the teacher, never an invented mark.',
  },
  {
    title: 'Fix it and check it alone',
    body: 'Redo the one step with a hint, then a matched question with no hints at all, and a check-in two days later.',
  },
  {
    title: 'One plan for three people',
    body: 'Tonight’s step for the learner, one thing for the parent, who shares the gap for the teacher, who confirms what was uncertain and approves the note home.',
  },
]

function TryItButton({ className = '' }: { className?: string }) {
  return (
    <Link
      to="/try"
      className={`inline-flex min-h-12 items-center justify-center rounded-card bg-action px-5 text-lg font-medium text-ground no-underline ${className}`}
    >
      Try it as a learner
    </Link>
  )
}

function QuietLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="inline-flex min-h-12 items-center justify-center rounded-card border border-fg-muted/50 bg-surface px-5 font-medium text-fg no-underline">
      {children}
    </Link>
  )
}

export function Landing() {
  return (
    <div className="flex min-h-dvh flex-col bg-ground text-fg">
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-4 pt-6 sm:px-6">
        <Wordmark />
        <Link to="/signin" className="inline-flex min-h-11 items-center px-2 font-medium">
          Sign in
        </Link>
      </header>

      <main className="flex flex-1 flex-col">
        {/* The hero: the website headline (D35), one emphasised word, the one pink action. */}
        <section aria-labelledby="hero-heading" className="mx-auto w-full max-w-[1100px] px-4 pt-10 pb-14 sm:px-6 sm:pt-16 motion-safe:animate-[fade-in_480ms_ease-out_both]">
          <div className="flex max-w-[760px] flex-col gap-6">
            <SentinelMark className="h-16 w-20 sm:h-20 sm:w-24" />
            <h1 id="hero-heading" className="m-0 text-[clamp(2.25rem,1.4rem+4.6vw,4.25rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
              Every learner deserves the <span className="text-action">support</span> to succeed.
            </h1>
            <p className="m-0 max-w-[600px] text-lg text-fg-muted">
              A student success and guidance platform for high schools: for learners, their parents and their teachers.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <TryItButton />
              <QuietLink to="/evidence">See the proof</QuietLink>
            </div>
            <p className="m-0 text-sm text-fg-muted">Runs in your browser on any phone. Fictional school, fictional people, your own real working.</p>
          </div>
        </section>

        {/* One panel per person, each with a real screenshot from the build. */}
        <section aria-labelledby="people-heading" className="mx-auto w-full max-w-[1100px] px-4 pb-16 sm:px-6">
          <h2 id="people-heading" className="m-0 mb-6 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            One learner. Three people. One plan.
          </h2>
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-3">
            {PEOPLE.map((person) => (
              <li key={person.who} className="flex flex-col gap-4 rounded-card bg-surface p-4">
                <p className="m-0 text-sm font-medium tracking-wide text-fg-muted uppercase">{person.who}</p>
                <div className={`overflow-hidden rounded-[14px] border border-fg-muted/30 bg-ground ${person.phone ? 'mx-auto w-full max-w-[280px]' : ''}`}>
                  <img src={person.shot} alt={person.alt} loading="lazy" decoding="async" width={person.phone ? 390 : 1200} height={person.phone ? 844 : 834} className="block h-72 w-full object-cover object-top sm:h-80" />
                </div>
                <p className="m-0">{person.sentence}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* The black sheet: how the loop works, in order (big numerals, DESIGN.md §v2). */}
        <section aria-labelledby="how-heading" className="bg-black text-night-text dark:bg-white dark:text-ink">
          <div className="mx-auto w-full max-w-[1100px] px-4 py-14 sm:px-6 sm:py-20">
            <h2 id="how-heading" className="m-0 mb-10 text-2xl font-semibold tracking-tight sm:text-3xl">
              How it works
            </h2>
            <ol className="m-0 grid list-none grid-cols-1 gap-10 p-0 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <li key={step.title} className="flex flex-col gap-3">
                  <span aria-hidden="true" className="text-6xl leading-none font-semibold tracking-tight text-pink-light tnum dark:text-pink">
                    {index + 1}
                  </span>
                  <h3 className="m-0 text-xl font-semibold">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="m-0 text-base opacity-85">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The sign-off (the product headline, D35) and the three doors again. */}
        <section aria-labelledby="signoff-heading" className="mx-auto w-full max-w-[1100px] px-4 py-14 sm:px-6 sm:py-20">
          <div className="flex max-w-[760px] flex-col gap-6">
            <h2 id="signoff-heading" className="m-0 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Every learner understood. Every next step clearer.
            </h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <TryItButton />
              <QuietLink to="/signin">Sign in</QuietLink>
              <QuietLink to="/evidence">See the proof</QuietLink>
            </div>
            <p className="m-0 text-sm text-fg-muted">
              Parents and teachers: <Link to="/signup">create an account</Link> and link up with a class code or a learner’s code.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-fg-muted/30">
        <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 px-4 py-8 text-sm text-fg-muted sm:px-6">
          <p className="m-0">
            Built during the Meta Global AI Developer Hackathon, 26 Oct – 4 Nov 2026 · Muse Spark by Meta · Every account holder is 18 or older ·
            Fictional school and people in the demo
          </p>
          <p className="m-0">For schools: an AI-powered student success and guidance platform, with the teacher as the marker of record at every step.</p>
          <p className="m-0">
            <Link to="/evidence">Evaluation results</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
