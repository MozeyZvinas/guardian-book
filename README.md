# Guardian Book

**Every learner understood. Every next step clearer.**

Guardian Book is a student success and guidance platform for high schools, built for the
three people around every learner: the learner, their parent or guardian, and their
teacher. A learner brings their work; Meta's **Muse Spark** finds the exact step they're stuck
on and gives a hint, never the answer; the learner fixes it and proves it alone; and one plan
reaches all three people, each in their own words. The teacher stays in charge of every mark
and every note home.

**Live:** [guardianbook.app](https://guardianbook.app) · **Proof:**
[guardianbook.app/evidence](https://guardianbook.app/evidence) · Built for the Meta Global AI
Developer Hackathon, 26 Oct – 4 Nov 2026, by one founder.

## The learner support loop

1. **The teacher approves the marking.** Each question's step-by-step guideline (M, A, CA
   marks) is approved per class; AI-drafted guidelines are labelled until a teacher checks
   them. Nothing is marked against an unapproved guideline.
2. **Bring anything.** A photo of handwritten working, a typed answer, or a school notice.
   Muse Spark (vision + structured output) reads the learner's own working against the
   approved guideline and returns each step with evidence and confidence. A notice becomes
   dated events, confirmed before anyone sees them.
3. **Checks the model can't skip.** One verifier with stable reason codes (unknown step, marks
   over the maximum, missing evidence, a hint that leaks the answer, a date out of range, an
   unvetted resource, jargon in the parent view, an inferred personality label, low
   confidence). Failures re-ask, at most three calls in total; then a teacher decides. It
   fails closed.
4. **Fix it, then check it alone.** The learner redoes the lost step, then answers a new
   question with no hints. The Brain keeps three kinds of evidence apart (with help, on your
   own, later) and schedules a follow-up check; "secure" needs both an independent and a
   later success.
5. **One plan, three views.** A bounded tool-calling agent on Muse Spark (at most 8 steps,
   trace stored, safe template fallback) writes tonight's step for the learner, one
   ten-minute action in plain words for the parent, and the shared gap for the teacher.
6. **The teacher closes the loop.** Review with the checks list; agree, correct or add in her
   own words; release; assign a follow-up from the class picture; approve every AI-drafted
   note home. Parents see "Teacher-reviewed".

## Meta's models in this build

Muse Spark 1.3 through the Meta Model API (OpenAI-compatible SDK), **Standard tier only**:
Contributor model IDs are refused in code (D24). Every call goes through one gateway with
daily spend and per-learner call caps, and writes a `model_runs` row (tokens, cost, latency,
checks). Uses: reading handwriting and notices (vision, structured output), the Help Plan
agent (tool calls), profile cards and notes home (drafting). Prompts carry the question, the
guideline and the work, never names or emails. Learners' work never trains a model.

## Proof, with denominators

Read live from `evals/results/latest.json` on [the proof page](https://guardianbook.app/evidence):
8 of 8 synthetic typed answers marked to the exact total (95% interval 68–100%); 4 of 4
"just give me the answer" requests got no answer; 33 of 33 change-the-ID privacy tests pass.
The dataset is a development set scored by us, **not teacher-checked and not held out**;
photo cases, notices and Help Plans have no published suite yet.

## Privacy and safety

- Every account holder in this build is an adult (Meta's API terms); sign-up requires "I am
  18 or older". The demo school and people are fictional.
- One `access` module decides every permission, with a school boundary on every check, and a
  table-driven harness tests "change the ID" for every role. Parents never see a learner's
  answers or photos.
- `learning_events`, `assessments` and `model_runs` are append-only (a database trigger
  refuses UPDATE and DELETE). Every artifact carries provenance; training permission is
  `not_permitted` everywhere.

## Where things live

| Path | What it is |
| --- | --- |
| `START-HERE.md` | Current reality, live tracker, open decisions: read first |
| `CLAUDE.md` | Project guide: what we're building, binding rules, engineering rules |
| `docs/decisions.md` | Decision log: what's decided, what's open |
| `docs/TASKS.md` | The build task list (shared state) |
| `docs/vision/` | The product vision (read-only reference) |
| `docs/plan/` | Planning documents: the document set, reviews, the build plan |
| `docs/specs/` | Build specs, written against the actual stack |
| `docs/runbooks/` | Deploy and operations runbooks |
| `prompts/` | Numbered briefs for Claude Code, run in order |
| `apps/api/` | Express 5 API: `/healthz`, config check, logging, serves the web build |
| `apps/web/` | Vite + React + Tailwind web app with the Sentinel tokens |
| `packages/shared/` | Zod contracts and pure logic shared by API and web |
| `scripts/` | Build-time checks (bundle secrets, closed colour palette) |

## Run locally

Prerequisites: Node 24 (see `.nvmrc`) and Docker. pnpm 12.15 comes through Corepack from the
`packageManager` field (`corepack enable` once if `pnpm` is not on your PATH).

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test
docker compose up -d            # Postgres 16 on 127.0.0.1:5433 (dev-only password)
pnpm test:integration
pnpm build && pnpm start        # http://localhost:8080
```

The server boots with no environment at all: `/healthz` reports which groups are
configured and `/` serves the home screen. To configure a group, copy `.env.example` to
`.env` and fill in that group; a local `.env` never points at a hosted database.

### Database, accounts and the demo circle

With `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` set (see `.env.example`):

```bash
pnpm db:migrate                       # additive Drizzle migrations (also run at API boot)
SEED_PASSWORD=choose-one pnpm db:seed # the fictional demo circle; idempotent; prints the class codes
pnpm content:load /path/outside/repo  # reviewed items (JSON) → approved; all-or-nothing
pnpm db:generate                      # after editing apps/api/src/db/schema.ts
```

Every account holder is an adult: sign-up requires the box "I am 18 or older" (D19) and
the API refuses a body without `ageAttested: true`. Demo people sign in as
`<key>@demo.guardianbook.test` (for example `lerato`, `mma-lerato`, `ms-dlamini`) with the
seed password. The database refuses UPDATE and DELETE on `learning_events`, `assessments`
and `model_runs`; every artifact row carries provenance and a training permission that
defaults to `not_permitted`.

Production image:

```bash
docker build -t guardian-book .
docker run --rm -p 8080:8080 guardian-book
```

## Built during the Meta hackathon (from 28 Oct 2026)

Every line of product code in `apps/`, `packages/` and `scripts/` was written in this repo
during the event (D27), one brief at a time (`prompts/`), each merged through a pull request
with six required CI checks:

- **B01** · Workspace, API skeleton, Sentinel tokens, Dockerfile, CI, deploy runbook.
- **B02** · Schema, append-only triggers, provenance, schools as tenants, Better Auth with age
  attestation, the `access` module and permission harness, the circle, the content loader,
  the demo seed.
- **B03** · The Meta model gateway (retries, cost log, prompt safety), the verifier and its
  retry runner, the eval runner.
- **B04** · Bring anything, the homework check (background assessment, guideline approval
  enforced, spend caps), photo storage with EXIF stripped, notice to calendar.
- **B05** · The Brain (pure reducer with property tests), profile cards, Today, KaTeX maths.
- **B06** · Fix it, check it alone, the follow-up check, the Help Plan agent, the parent's
  space.
- **B07** · The teacher space: guidelines, review with feedback controls, release, the class
  picture, interventions, notes home.
- **B08** · The eval summary and the proof page.

## Pre-existing inputs

`docs/vision/` holds the design and vision documents (identity, pedagogy, research,
screens) written before the event and imported as read-only reference (D15). They are
documentation, not product code. The Sentinel brand sheet in `docs/vision/design/sentinel/`
is the source of the design tokens in `apps/web/src/design/tokens.css`.

---
© Mozey. All rights reserved.
