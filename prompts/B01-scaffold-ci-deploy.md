# B01 · Scaffold, CI and deploy skeleton

**Status:** APPROVED (planning session, 27 Oct 2026)
**Risk tier:** High (CI, deploy, secrets)
**Model / spend cap:** Fable 5.1 · $15 (`fable --budget 15`)
**Requirements:** P0-09 (part) in `docs/specs/02-product-p0.md`
**Depends on:**
- founder F2: repo pushed and public, ruleset on `main`;
- F4: Railway project linked. Not needed to *write* the code, only to see the deploy.

## Read first (only these)
- `CLAUDE.md`
- `START-HERE.md`
- `docs/decisions.md`: D16, D19–D27, D34
- `docs/specs/01-stack.md`: all of it (versions, layout, security plan)
- `docs/specs/03-architecture-data.md`: §1 (modules) and §7 (configuration)
- `docs/specs/04-quality-security-eval.md`: §1–3 (tiers, test layers, CI) and §7
  (delivery)
- `docs/vision/DESIGN.md`: the "v2 — Identity: Sentinel" section and amendments A1–A7.
  Token values only; no screens yet.

- `docs/specs/06-frontend-pwa-mobile.md`: §2 (structure), §3 (tokens in code), §4 (breakpoints)
- `docs/specs/05-screens-and-flows.md`: §4.1 P1 (the landing screen)

## Current truth (checked 27 Oct)
- The repo contains only docs (`docs/`, `prompts/`, `CLAUDE.md`, `README.md`,
  `START-HERE.md`, `.claude/settings.json`, `.gitignore`).
- There is no `package.json`, no code and no CI.

## Do

1. **Workspace.**
   - pnpm 12.15 workspace: `apps/api`, `apps/web`, `packages/shared`.
   - Root `package.json` has `"packageManager": "pnpm@12.15.0"`.
   - Add `.nvmrc` with `24` and `engines.node >=24 <25`.
   - TypeScript **6.0.3** strict in all packages, with a shared `tsconfig.base.json`.
   - ESLint flat config.
   - Root scripts: `typecheck`, `lint`, `test`, `test:integration`, `build`, `start`.
2. **`packages/shared`.** A tiny first module: `status.ts` exporting the assessment status
   enum (`proposed | uncertain | failed`) as a Zod schema, with a Vitest unit test. This
   proves the test pipeline.
3. **`apps/api`** (Express 5.3).
   - **Config check.** `src/config.ts` reads the variables listed in spec 03 §7 into named
     groups (`db`, `auth`, `meta`, `bucket`, `sentry`).
     - Group status is `configured: true/false`.
     - **Never log values.**
     - It must not throw when nothing is set: zero-env boot.
   - **`GET /healthz`.** Returns `{ ok: true, version, configured: {db, auth, meta, bucket} }`.
     When `DATABASE_URL` is set, also include `db: "up" | "down"` from a `select 1` with a
     2-second timeout.
   - **Static files.** Serves `apps/web/dist` with an SPA fallback for non-`/api` paths.
   - **Security headers.** Set by hand, without a new dependency: CSP `default-src 'self'`
     (allow `data:` images), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`
     (camera allowed for self).
   - **Logging.** Structured JSON logs with a request ID (`x-request-id`, generated if
     missing), route, status and latency. A redaction helper drops `answerText`, `email`,
     `password` and `image` keys, covered by a unit test.
   - **Integration test** (Vitest + supertest) against a fresh Postgres:
     - `/healthz` returns 200 and reports `db: "up"`.
     - The harness refuses any non-loopback database host: a test asserts that.
4. **`apps/web`** (Vite 8.3 + React 19.3 + Tailwind 4.3).
   - **Sentinel tokens** go in one CSS file as CSS variables and the Tailwind theme:
     - colour: white, card, ink, ember pink (`#D8234B`, action only), teal (`#00747A`),
       black, night text (`#E9E9EC`), muted text, light pink, light teal;
     - radius 12;
     - type: Outfit for the interface, Source Serif 4 for question text. Self-host the
       fonts in `apps/web/public/fonts` (open licence; record the licence in
       `apps/web/public/fonts/LICENSES.md`); system fallback if not done.
     - No other colours anywhere (A3). Flat buttons (A2).
   - **Home screen.** A single screen at 360px:
     - the Guardian Book wordmark in text (no logo asset yet);
     - one line: "Every learner understood. Every next step clearer." (the headline, D34);
     - a status-legend chip row (LIVE / SYNTHETIC / PROTOTYPE / PLANNED);
     - a footer link to `/evidence` (a placeholder page saying "Evaluation results appear
       here after the first run").
   - **No PWA plugin yet** (that is B10).
5. **Containers.**
   - **`Dockerfile`:** multi-stage on `node:24-slim`; corepack enables pnpm; build web and
     api; the runtime image runs as a non-root user; `EXPOSE 8080`; the start command
     serves the API and the static web.
   - **`docker-compose.yml`:** Postgres 16 for local development and integration tests,
     with a loopback port and a dev-only password, never reused.
6. **`.env.example`** lists every variable from spec 03 §7, with comments and **no values**.
7. **CI** (`.github/workflows/ci.yml`), per spec 04 §3:
   - **Jobs:** `gitleaks`, `typecheck`, `lint`, `unit`, `integration` (Postgres 16 service
     container), `build-image` (docker build; no push). **Set each job's `name:` to exactly
     these six strings**: the `main` ruleset requires status checks with these names.
   - **Hardening:** `permissions: contents: read`; every third-party action pinned to a
     **full commit SHA**. Resolve SHAs with `git ls-remote https://github.com/<owner>/<action> refs/tags/<tag>`
     and put the tag in a trailing comment.
   - **Install:** pnpm 12.15 and Node 24 with a frozen lockfile.
   - **`build-image` also runs `scripts/check-bundle-secrets.mjs`.** The script scans
     `apps/web/dist` for `META_API_KEY`, `BETTER_AUTH_SECRET` and high-entropy `sk-`-style
     tokens, and exits non-zero on a match.
8. **`README.md`:** keep the current content and add these sections:
   - "Run locally" (the real commands);
   - "Built during the Meta hackathon (from 28 Oct 2026)", listing this brief;
   - "Pre-existing inputs": design and vision documents in `docs/vision/` (written before
     the event; documentation, not product code).
9. **Railway notes:** add `docs/runbooks/deploy.md` with:
   - the variables to set;
   - the health-check path `/healthz`;
   - "wait for CI";
   - the Postgres backup schedule to turn on (the founder does this in the Railway
     dashboard).

   **No Railway CLI actions.**

## Don't
- No database schema, no auth, no model calls, no uploads, no PWA, no Sentry: later
  briefs.
- No dependencies beyond those in spec 01, plus: `supertest`, `@types/*`, ESLint and its
  TypeScript plugin, `tsx` if needed. Justify any other in the PR.
- Never read or copy from `../guardian-book-legacy` or `../guardian-book-private` (also
  enforced by settings).
- No secrets anywhere. `.env` stays git-ignored. Never point a local `.env` at a hosted
  database.

## Acceptance (and tests)

| GIVEN / WHEN | THEN |
|---|---|
| A fresh clone, then `pnpm install --frozen-lockfile` | Succeeds |
| `pnpm typecheck && pnpm lint && pnpm test` | All pass |
| `docker compose up -d` and then `pnpm test:integration` | Passes; `/healthz` reports `db: "up"` |
| `pnpm build && pnpm start` with **no env** | The server boots; `/healthz` shows `configured.*: false`; `/` serves the home screen |
| `docker build .` | Succeeds |
| A container run with `-p 8080:8080` | Serves `/` and `/healthz` |
| The pull request is opened | All six CI jobs run and pass |
| The home screen at 360px | No horizontal scroll; only token colours (screenshot attached to the PR) |
| Logging redaction | The unit test proves redaction |
| Secret scan | The bundle-secret check passes on a clean build |

## Commands you must run and report (real output summaries)
`pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:integration`,
`pnpm build`, the zero-env `pnpm start` + `curl localhost:8080/healthz`, `docker build .`,
the CI run link.

## Git
1. Branch `b01-scaffold`.
2. Small commits.
3. `git push -u origin b01-scaffold`.
4. `gh pr create --base main` with the completion report as the PR body.

**Do not merge. Stop when the PR is open and CI has finished.**

## Completion report (PR body)
- Brief ID.
- Requirements met / not met.
- Files changed.
- Commands run and their results; commands not run, and why.
- Security notes.
- Known gaps.
- Approvals needed.
- The next smallest step.
