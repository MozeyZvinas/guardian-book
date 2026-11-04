# B09 · First impression: the landing page, install as an app, "Try it", small fixes

**Status:** APPROVED (planning session, 4 Nov 2026)
**Risk tier:** Medium (public front door, caching)
**Model:** Fable 5.1 on the Claude subscription (`claude --model claude-fable-5-1`)
**Requirements:** P0-13 in `docs/specs/02-product-p0.md`; D35 (headlines by surface), D36
(robots), D38.
**Depends on:** B01–B08 merged (they are).
**Runs in parallel with:** B11, B12, B13. **Own only:** `apps/web/src/routes/public/*`
(except `Evidence.tsx`), `apps/web/public/*`, `apps/web/index.html`, `apps/web/src/sw/*`,
`apps/web/src/routes/learner/bring/*`, the seed additions below, `.github/workflows/ci.yml`
(the e2e job only). **Do not touch** the attempt, fix, item, guardian or teacher screens
(B11, B12, B13 own them).

## Read first (only these)
- `CLAUDE.md`, `START-HERE.md`, `docs/BUILD-PLAN.md`, `docs/decisions.md` (D35, D36, D37, D38)
- `docs/specs/05-screens-and-flows.md`: §4.1 (public screens), §9 (landing hero by surface)
- `docs/specs/06-frontend-pwa-mobile.md`: PWA, performance budget
- `docs/vision/DESIGN.md` headings only, then the Sentinel tokens in `apps/web/src/design/`

## Do
1. **Landing (`/`)**, for a judge, a parent or a teacher arriving cold, 360 px first:
   - Hero: **"Every learner deserves the support to succeed."** Sub-line: *A student success
     and guidance platform for high schools: for learners, their parents and their teachers.*
   - Three short panels, one per person, each one sentence and one real screenshot from
     `docs/screenshots/` (learner feedback, parent This week, teacher class picture).
   - "How it works" in four steps (Bring anything → the exact step and a hint → fix it and
     check it alone → one plan for three people). Never the words "marking app" or "maths
     app"; "AI-powered" may appear once, in the footer line for schools.
   - Buttons: **Try it as a learner** (→ `/try`), **Sign in**, **See the proof** (→ `/evidence`).
   - Footer: "Built during the Meta Global AI Developer Hackathon, 26 Oct – 4 Nov 2026 ·
     Muse Spark by Meta · Every account holder is 18 or older · Fictional school and people in
     the demo", and the product sign-off **"Every learner understood. Every next step
     clearer."**
2. **"Try it" (`/try`)**: lets a judge run the core loop alone without our demo accounts.
   - Seed (additive to B02's seed, idempotent): a class **"Try it (fictional)"** at Sentinel
     High, taught by a seeded teacher with no usable login, with every approved item's
     guideline approved for that class. Its code comes from config `PUBLIC_TRY_CLASS_CODE`
     (set it in the seed from `SEED_PASSWORD` like the others and print it).
   - `/try` explains in four lines, then **Sign up as a learner** with `?try=1`. A learner who
     signs up through `/try` joins that class automatically (server-side; never trust the
     client) and lands on Bring with a suggested question.
   - The global daily spend cap already protects us; also cap each try-it learner at 6 model
     calls a day (config `TRY_USER_DAILY_CALLS`, default 6).
3. **Install as an app (PWA):** `manifest.webmanifest` (name, short name, theme from tokens,
   192/512 and maskable icons from the Sentinel mark in `docs/vision/design/sentinel/`),
   iOS meta tags, and a small service worker: network-first for pages, cache-first only for
   hashed `/assets/*`, **never** caches `/api/*`, an offline page for navigations, a version
   string that changes every build, `skipWaiting` + `clients.claim`. An "Install" hint on
   Today for Android (beforeinstallprompt) and an "Add to Home Screen" tip for iOS Safari.
4. **Bring:** the "Which question is this?" picker shows the question itself through
   `MathText` (and the marks), never the slug; questions approved for the learner's class
   first.
5. **robots.txt** (D36): allow `/`, `/try`, `/evidence`; disallow `/api/`, `/today`, `/brain`,
   `/me`, `/bring`, `/attempts/`, `/items/`, `/calendar`, `/guardian`, `/teacher`.
   `<meta name="description">` and Open Graph tags (title, description, a 1200×630 card made
   from the hero) so a shared link looks right on WhatsApp and X.
6. **CI:** add an `e2e` job running `pnpm test:e2e` (Playwright, Postgres service). Not a
   required check yet; it must pass.
7. **Tests and shots:** e2e for `/` and `/try` → sign up → lands on Bring with the try class;
   the SW never serves `/api/*` from cache (unit test of the fetch handler); screenshots of
   `/` and `/try` at 360 and 1440 in light and dark.

## Don't
- No new runtime dependencies (no vite-plugin-pwa; write the SW by hand).
- No changes to auth rules: `/try` sign-up still requires "I am 18 or older".
- No real school, person or logo.

## Acceptance
| GIVEN / WHEN | THEN |
|---|---|
| A cold visitor on a phone opens guardianbook.app | The hero, three panels, Try it, Sign in, Proof, no horizontal scroll |
| A judge taps Try it, signs up (18+) | They are in "Try it (fictional)" and can check work on an approved question |
| A new deploy ships | The next page load gets the new version (SW versioned, network-first) |
| CI | The six required jobs and `e2e` are green |

## Git
Worktree `.claude/worktrees/b09`, branch `b09-polish-pwa-try`. Before opening the PR,
`git fetch origin && git merge origin/main` and re-run the checks. Small commits; push; PR
with the completion report; stop when CI has finished. Do not merge.
