# Guardian Book — project guide

Read this first, every session. It is loaded into every session, so it stays short. Detail
lives in `docs/`.

## Roles
- **Mozey (founder):** owns accounts, secrets, merges, and every approval that touches
  users, money or data.
- **Planning session (CTO):**
  - specs, rulings and briefs;
  - reviews every PR against its brief;
  - writes `docs/decisions.md`, `docs/TASKS.md` and `START-HERE.md`.
- **You (implementer):**
  - do exactly one brief from `prompts/` per session;
  - open a PR; never merge;
  - if anything is ambiguous, add a question under the task in `docs/TASKS.md` and stop.
    Don't guess.

## Where to look
1. `START-HERE.md` (current state).
2. `docs/decisions.md` (it outranks everything).
3. Your brief in `prompts/`.
4. **Only** the spec sections the brief cites (`docs/specs/`, `docs/vision/`).

## What we're building now
Guardian Book is a lifelong learning intelligence; describe it from
`docs/vision/DESCRIPTION.md`, never as "a marking app" (the homework check is one input,
never the headline). This build is the **Meta Global AI Developer Hackathon** entry
(Indie), scope v2 (D34): **one learner, three people, one Brain.**
- **The users are a circle:** a learner, their guardian and their teacher, linked. In this
  build every account holder is an adult (D19, Meta's API terms); the demo learner is an
  adult matric learner. No minors' data.
- **The loop:** the learner brings anything (homework photo or text, a school notice, a
  question) → Muse Spark reads it against a human-approved guideline or extracts the
  notice → checks the model cannot skip → the Brain (append-only evidence) updates → one
  Help Plan rendered three ways (learner, guardian, teacher) → the teacher confirms what
  was uncertain and approves the note home.
- **Scope:** `docs/specs/02-product-p0.md` (v2). Data and API additions: spec 03 §8. Screens
  and flows: spec 05. Frontend, responsive and PWA rules: spec 06. The one-page plan:
  `docs/BUILD-PLAN.md`.

## Binding rules (enforced by structure and tests, not just words)
1. **The teacher is the marker of record.** Model proposals are stored once and never
   overwritten; reviews are separate records.
2. **Fail closed.** A model output is untrusted until the verifier (`apps/api/src/verify`)
   passes it. Invalid, uncertain or slow → "uncertain → teacher", never an invented mark,
   never an unchecked plan or note. Guardians never see attempts, answers or images.
3. **Access control** lives in the `access` module, per object. Every learner or teacher
   resource gets "change the ID" tests.
4. **Adults only in this build:** age attestation at sign-up. No minors' data. No
   personal data in prompts (no names, emails or guardian data). Standard model tier only
   (D24); any model ID ending `-contributor` is refused in code.
5. **New work only (D27):**
   - every line of product code is written here, during the event;
   - never read or copy from the legacy repo or private folders;
   - DBE paper content never enters this repo (D20).
6. **Publishable repo (D16):** no secrets, personal data or company documents, ever.
7. **Scope sheds before dates.** **Done = works on Mozey's phone** after deploy, in a fresh
   tab.

## Stack (decided, D21; details in `docs/specs/01-stack.md`)
- pnpm workspace: `apps/api` (Express 5 + Drizzle + Postgres), `apps/web` (Vite + React +
  Tailwind PWA), `packages/shared` (Zod contracts, pure logic).
- Node 24, pnpm 12.15, TypeScript 6.0.3 strict.
- Better Auth (email + password).
- The Meta Model API is called through `apps/api/src/gateway` only.
- One Railway service.

## Commands
Real once B01 lands; keep this list exact.
- Install: `pnpm install --frozen-lockfile`
- Typecheck: `pnpm typecheck` · Lint: `pnpm lint` · Unit: `pnpm test`
- Integration (needs `docker compose up -d`): `pnpm test:integration`
- Build / run: `pnpm build` · `pnpm start`

## Engineering rules
- TypeScript strict. No `any` without a comment saying why. Zod at every boundary.
- Secrets live in `.env` locally and in Railway variables. **Local `.env` never points at a
  hosted database.** Keep `.env.example` current.
- Every module boots with zero env and shows a clear "not configured" state, never a crash.
  CI builds without secrets.
- New dependencies only if the brief allows them or the PR justifies them. No high or
  critical audit findings.
- Commits are small, with an imperative subject. **No co-author trailers and no
  tool/assistant attribution** anywhere.

## Design
Sentinel, latest (D11): `docs/vision/DESIGN.md` §v2 + v3 addendum. Use tokens only. Pink
means action, never "wrong" (A1). Colour never carries correctness alone (A7).

## Shared state
`docs/TASKS.md` is shared. Re-read it before editing; make targeted edits only.

## Known traps (one line each, with the fix)
- Zero-env: no env assertion at module scope; unconfigured = null = empty state.
  Local-green is not CI-green.
- Pin the package manager (`packageManager` field + the same pnpm in CI), or lockfiles
  drift.
- TypeScript doesn't auto-include global `@types/*`: declare `"types"` in tsconfig, or
  test globals vanish.
- PWA: use a prompt-to-update service worker, and check every deploy in a fresh tab
  (stale bundles).
