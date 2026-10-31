# B02 · Database, auth, the circle, seeds, permission harness

**Status:** APPROVED (planning session, 31 Oct 2026)
**Risk tier:** High (auth, access control, migrations)
**Model / spend cap:** Fable 5.1 · $25 (`fable --budget 25`)
**Requirements:** P0-01 in `docs/specs/02-product-p0.md`; the tables in spec 03 §2 and
§8.1; permissions in §4 and §8.2; auth and profile routes in §5 and §8.3.
**Depends on:** B01 merged.
**Runs in parallel with:** B03 (gateway + verifier). **Do not touch** `apps/api/src/gateway`,
`apps/api/src/verify` or `packages/shared/src/contracts/model/*`; B03 owns them.

## Read first (only these)
- `CLAUDE.md`, `START-HERE.md`
- `docs/decisions.md`: D19, D21, D24, D34
- `docs/specs/02-product-p0.md`: §2, §3 (P0-01 only)
- `docs/specs/03-architecture-data.md`: §1, §2 (all tables), §3, §4, §5 (auth, `/api/me`,
  items), §7, §8.1, §8.2, §8.3 (profile code and link routes only)
- `docs/specs/04-quality-security-eval.md`: §2 (test layers) and §4 (security tests)

## Current truth (checked 31 Oct)
- B01 provides the workspace, Express app, config check, logging, CI and the home screen.
- No schema, no auth, no routes beyond `/healthz`.

## Do

1. **Drizzle schema and migrations** (`apps/api/src/db/schema.ts`, `apps/api/drizzle/`):
   every table in spec 03 §2 and §8.1, snake_case, UUID v7 primary keys, `created_at`
   defaults. Enums as Postgres enums. CHECKs: `model_runs.tier = 'standard'`;
   `guideline_steps` marks sum = `items.max_marks` (enforce in the loader if a CHECK is
   impractical, with a test). A migration script `pnpm db:migrate` and `pnpm db:generate`.
   Migrations are **additive only**.
2. **Append-only guard.** A Postgres trigger (or rule) that rejects UPDATE and DELETE on
   `learning_events`, `assessments` and `model_runs`, plus an integration test proving it.
3. **Better Auth** (email + password only; no other plugins). Sign-up body requires
   `ageAttested: true` and `role` in (learner, guardian, teacher). A `profiles` row is
   created in the same transaction with `age_attested_at`. Cookies `HttpOnly; Secure;
   SameSite=Lax`. Session lookup is one middleware used by every `/api` route.
4. **The `access` module** (`apps/api/src/access`): `can(user, action, resource)` is the
   only place permission decisions are made. Implement every row of spec 03 §4 and §8.2
   that B02's routes need, and the resolver helpers B03 and later briefs will call
   (`learnerOwns`, `teacherOfLearner`, `guardianLinkedTo`, `classMember`). Unknown
   action → deny.
5. **The circle:**
   - a teacher's class: `POST /api/teacher/classes` → `{name}`; a class code (8 chars,
     unambiguous alphabet) stored hashed; `POST /api/learner/join` → `{code}`;
   - a learner's guardian code: `POST /api/me/guardian-code` (rotates; hashed; expires in
     7 days); `POST /api/guardian/link` → `{code}`; `DELETE /api/me/guardians/:id` revokes;
   - `GET /api/me` returns profile, role, class memberships (learner), classes (teacher),
     linked learners' nicknames (guardian).
6. **Items and guideline steps:** the tables, an admin CLI `pnpm content:load <dir>` that
   loads JSON files from a directory **outside the repo** (`CONTENT_DIR`), validates with
   Zod (marks sum, step types M/A/CA, provenance and reviewer fields present), and marks
   items `approved`. `GET /api/items` and `GET /api/items/:id` with the guideline-steps
   rule (never before the learner's own attempt on that item; teacher: class attempts).
   Put **two** original sample items with guidelines in `apps/api/seed/items/` for
   development (write them yourself: CAPS Grade 12 Algebra, 4–6 marks each, clearly
   labelled `source: original`, `reviewer: pending`).
7. **Seeds** (`pnpm db:seed`, idempotent): the demo circle: learner "Lerato" (nickname
   only; age attested), her guardian "Mma Lerato", teacher "Ms Dlamini" with class
   "12A", five classmate learners in 12A, the guardian linked, the two sample items
   approved. Fixed UUIDs so tests can reference them. A second teacher with class "11B"
   and one learner, for cross-class tests. Passwords from env in dev (`SEED_PASSWORD`),
   never committed.
8. **Permission harness** (`apps/api/test/access.integration.test.ts`): a table-driven
   integration test that logs in as each seeded user and asserts every "change the ID"
   case in spec 03 §4 and §8.2 for the routes that exist after B02: learner A → learner
   B's `/api/me`-scoped data → 404; teacher 11B → class 12A → 404; guardian → unlinked
   learner → 404; learner → `/api/teacher/*` → 403; guardian → `/api/learner/*` → 403;
   no session → 401. The harness is written so later briefs add rows, not files.
9. **Audit events** for sign-up, link, revoke, class join, content load.
10. **Shared contracts** (`packages/shared/src/contracts/auth.ts`, `circle.ts`,
    `items.ts`): Zod schemas used by both API and web. Types exported.
11. **Web:** sign-up/sign-in screens (role chooser, the 18+ checkbox with the exact
    wording "I am 18 or older"), a learner "join class" and "invite a guardian" screen, a
    guardian "enter code" screen, and a teacher "my classes" screen. Sentinel tokens
    only; 360px first. No other screens.

## Don't
- No model calls, no uploads, no plans, no notes, no calendar: B03–B07.
- No dependencies beyond spec 01, plus Better Auth and Drizzle packages already allowed.
- Never read `../guardian-book-legacy` or `../guardian-book-private`.
- No real names anywhere. No secrets. `.env` never points at a hosted database.

## Acceptance (and tests)

| GIVEN / WHEN | THEN |
|---|---|
| Fresh database, `pnpm db:migrate && pnpm db:seed` twice | Same row counts; no duplicates |
| Sign-up without `ageAttested: true` | 400; no user, no profile |
| Sign-up with role `admin` | 400 |
| UPDATE on `learning_events` via SQL in a test | Rejected by the database |
| Each case in the permission harness | The expected status code |
| `GET /api/items/:id` as a learner with no attempt | Item without `guidelineSteps` |
| `pnpm content:load` on a directory with a marks-sum error | Exits non-zero, loads nothing |
| Web sign-up at 360px | No horizontal scroll; token colours only (screenshot) |
| CI | All jobs pass |

## Commands you must run and report
`pnpm db:migrate`, `pnpm db:seed` (twice), `pnpm test`, `pnpm test:integration`,
`pnpm typecheck`, `pnpm lint`, `pnpm build`, the CI run link.

## Git
Worktree branch `b02-data-auth-circle` (created by `fable -w b02`). Small commits.
`git push -u origin b02-data-auth-circle`. `gh pr create --base main` with the completion
report as the body. **Do not merge. Stop when the PR is open and CI has finished.**

## Completion report (PR body)
Brief ID · requirements met / not met · files changed · commands run and results ·
security notes · known gaps · approvals needed · the next smallest step.
