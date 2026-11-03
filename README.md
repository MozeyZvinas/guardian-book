# Guardian Book

Guardian Book is a lifelong learning intelligence that grows with each learner. It knows
how they learn and what they dream of, keeps them a step ahead, and connects them to the
people who help them, from school to career. It starts in high school (Grades 8–12) in
South Africa.

**Status:** building, for the Meta Global AI Developer Hackathon (scope v2, D34). Start with
[`START-HERE.md`](START-HERE.md).

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
during the event (D27), one brief at a time:

- **B01** (1 Nov 2026) · Workspace, API skeleton (`/healthz`, config check, structured
  logs with redaction, security headers, static serving), Sentinel tokens and the landing
  screen, Dockerfile and compose, CI with six checks, deploy runbook.
- **B02** (3 Nov 2026) · The schema (every table in spec 03, Postgres enums, UUID v7,
  append-only triggers, provenance columns, schools as tenants), Better Auth with a
  one-transaction sign-up and age attestation, the `access` module and its permission
  harness, the circle (class codes, guardian codes, links, revoke), items and the content
  loader, the seeded demo circle, and the sign-up, sign-in, learner, guardian and teacher
  screens.

## Pre-existing inputs

`docs/vision/` holds the design and vision documents (identity, pedagogy, research,
screens) written before the event and imported as read-only reference (D15). They are
documentation, not product code. The Sentinel brand sheet in `docs/vision/design/sentinel/`
is the source of the design tokens in `apps/web/src/design/tokens.css`.

---
© Mozey. All rights reserved.
