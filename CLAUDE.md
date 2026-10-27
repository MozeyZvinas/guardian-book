# Guardian Book — project guide

Read this first, every session. Keep it short: it is loaded into every session,
so detail lives in `docs/`, not here.

## Roles
- **Mozey (founder)** — owns accounts, secrets and every user-facing, money- or data-touching approval.
- **CTO / planning session** — architecture, specs, rulings, task definitions, reviews. Writes `docs/decisions.md` and the task list in `docs/TASKS.md`.
- **You (implementer)** — execute `docs/TASKS.md` in order, one task per commit, update task status, follow every rule below. When something is ambiguous, add a question under the task in `docs/TASKS.md` and stop — don't guess.

## What Guardian Book is
A lifelong learning intelligence for South African learners, starting with high school
(Grades 8–12, ages 14–18) and growing with them into study, work and life. One platform
that connects the **learner**, their **guardian** (parent or accountability partner), their
**teacher** and their **school**, so there is no disconnect between them.

Never describe it as a marking app. Marking is one feature; lead with the whole platform.
Describe it from `docs/vision/DESCRIPTION.md`. **Release 1 serves learners and teachers**; the
guardian plan comes next (D10). This is the Meta hackathon entry (D9), so the repo must stay
publishable: never commit company documents, personal data or secrets (D16).

Core experience (MVP direction): practise real past exam papers paper by paper and
subject by subject, questions shown exactly as on the printed paper, answer by typing or
writing on a canvas, mark yourself against the memo, get explanations in your preferred
style (written, visual, audio) without losing rigour. Guardians see effort, gaps and how
to help. Teachers scan scripts, the system proposes marks, the teacher confirms.

## Binding rules (encoded in architecture, not policy)
1. **Teacher is the marker of record.** The system proposes; it can never finalise or override a teacher's mark.
2. **Visibility:** guardians see school-assessed work in full only after the teacher releases it. A learner's private practice stays private unless the learner shares it.
3. **No surveillance:** school/principal views get no per-teacher performance detail.
4. **Minors' data (POPIA):** guardian consent before collecting a learner's personal information; collect the minimum (nickname, grade, school/province); erasure must work end to end; strip EXIF from uploads; no real names on any public surface.
5. **Accuracy gate:** any automated marking must pass its golden-set eval (≤2% confidently wrong) before merge. A new subject's marking needs its own golden set first.
6. **Scope sheds before dates.** If a deadline is at risk, cut scope; never ship broken.
7. **Done = works on Mozey's own phone** (mid-range Android, patchy data). Mobile-first, light on data.

## Experience bar
Duolingo's design principles, TikTok-level effortlessness, study anywhere (bus, home, school).
Design references come from Mobbin. Never generic, cluttered or "template" looking.
Design system: **Sentinel, latest version.** The source is `docs/vision/DESIGN.md` §v2 + v3
addendum and `docs/vision/design/sentinel/` (decision D11). Build every screen on theme tokens
only: no hard-coded colours, fonts or radii.

## Stack
Decided: web app, mobile-first, installable PWA; backend on Railway; PostgreSQL.
Everything else is proposed in `docs/architecture.md` (created by the kickoff task) and only
becomes binding once logged in `docs/decisions.md`.

## Engineering rules
- TypeScript strict. No `any` without a comment saying why.
- Secrets live in `.env` locally and the host's secret store when deployed. Never commit them; never expose model or service keys to the browser — server side only. Keep `.env.example` current.
- Every module must run with zero env (unconfigured = clear empty/demo state, never a crash at import). CI builds without secrets.
- All model calls go through one gateway module: pinned model + prompt version, outputs validated against a schema before use, learner and scanned text treated as untrusted input.
- Access control is enforced server side and tested: every table/endpoint that touches learner data gets permission tests for each role.
- Tests and typecheck pass before every commit. Marking changes also pass the golden-set eval.
- New dependencies: well-maintained official packages only; say why in the commit body; no high/critical audit findings.
- Commits: small, imperative subject line, describe the change only. No co-author trailers, no tool or assistant attribution, no "generated with" lines — in commits, PRs, code comments or docs.

## Where to look
`START-HERE.md` (current state) → `docs/decisions.md` (outranks everything) → the brief you
were given in `prompts/` and only the spec sections it cites (`docs/specs/`, `docs/vision/`).

## Shared state
`docs/TASKS.md` is shared between the planning session and you. Re-read it before every edit,
make targeted edits only, never rewrite it wholesale.

## Legacy build
The previous build is archived as the `guardian-book-legacy` repo. Its UI and app code are not
reused. Its data may be: structured DBE past papers (`tools/ingest/data/structured/`), eval
sets (`tools/evals/`), permission-test ideas (`tools/rls-tests/`) and the POPIA erasure approach.
Verify anything you bring over before relying on it.

## Known traps
Add every trap you hit here, one line each, with the fix, so nobody trips twice.
- (none yet)
