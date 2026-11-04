# Tasks

Shared state between the planning session and the implementer. Re-read it before every
edit, and make targeted edits only.

**Status values:** `todo` · `doing` · `review` (PR open) · `done` (merged + phone-checked)
· `blocked` · `cut`.

**Briefs live in `prompts/`.** Scope is in `docs/specs/02-product-p0.md`.

## Founder actions (before code)

| ID | Task | Due | Status |
|---|---|---|---|
| F2 | Push both repos; make `guardian-book` public; ruleset on `main` (require PR + status checks, block force-push); update `.claude/settings.json` (paste block in START-HERE) | 1 Nov | done (pushed; ruleset `protect-main` active; visibility: see F2b) |
| F2b | Make the repo public (`gh repo edit MozeyZvinas/guardian-book --visibility public --accept-visibility-change-consequences`) | 1 Nov | todo |
| F3 | Meta: spend-limit email at $150; create API key `guardian-book-app` (never paste it into chat); check whether `muse-wonder-1.0` is listed for the account | **31 Oct (overdue)** | doing (key live in Railway, `meta: true` on 3 Nov; confirm the $150 alert) |
| F4 | Railway project (EU West): app service from the repo (Dockerfile), Postgres 16, Bucket, variables, "wait for CI", daily backups | **31 Oct (overdue)** | done 3 Nov: `https://guardianbook.app/healthz` → db, auth, meta, bucket all true, `"db":"up"` (version `0.1.0+a156a18`); domains per D36; 3 Nov: B02 migrations live, demo circle seeded on Railway (fictional people; password held by the founder only) |
| F5 | 1 maths teacher (checks guidelines, scores the eval set), 2–3 parents and 1–2 learners aged 18+ (handwritten answers; try the app; filmed reactions). Two consents each: data, filming | **Ask 31 Oct; samples by 1 Nov** | todo |
| F6 | Discord: post the organiser questions (prize stacking, open-weight eligibility, agentic autonomy, the 18+ approach, the Teacher Studio policy question, Open #13) | 28 Oct, 16:00 SAST office hours | todo |
| F7 | DBE permission: save the written sign-off and record its scope (5 lines, private legal folder; downloads are gated on it). If it doesn't cover AI processing, in-app display or commercial use, send the request email | 28 Oct | todo |
| F8 | Meta Billing: confirm how to run DBE documents on paid usage, not free credits (don't toggle anything irreversible) | Before 30 Oct | todo |
| F9 | ~~Decide Open #12~~ | — | done (declined, D34) |
| F12 | Claude Code credits: run session A on the Console promotional credits (expire 14 Nov) and session B on the subscription; see START-HERE §"Two sessions" | 1 Nov | doing (A ran B01) |
| F10 | Cloudflare: sign in or sign up, enable R2, then create an R2 token and paste it into Colab Secrets (planning creates the bucket and guides the token step) | 28 Oct | done (bucket `guardian-book-dbe`, token scoped to it; catalogue saved) |
| F11 | Ask the DBE contact who signed off for bulk access: a bulk copy, or written OK for an automated download at a set pace (D32) | 28 Oct | todo |

## Planning session

| ID | Task | Due | Status |
|---|---|---|---|
| C1 | Content pack v1: 12 original CAPS Grade 12-style items, 3 topics, with M/A/CA marking guidelines and skill tags (teacher verifies); loaded from a directory outside the repo (`CONTENT_DIR`) | Draft 31 Oct; verified 1 Nov | drafted 3 Nov (12 items: algebra, sequences, calculus; 18 skill tags; 34 automated maths checks pass; factorising in 5 items for fix → check alone → retention); **teacher sign-off pending** (printable review sheet ready) |
| C4 | Vetted resource list (Siyavula CC BY sections with attribution; free first) and two fictional school notices for the demo | 1 Nov | done 3 Nov: 23 resources fetched and checked (Siyavula CC BY 3.0 or link-only; 3 for parents; Khan not verifiable), 2 notices (PDF + PNG), 2 consent forms for F5 |
| C5 | Dev eval cases (`EVAL_DIR`): 10 typed + volunteer photos; held-out set frozen 1 Nov 12:00 (D34) | 1 Nov | todo |
| C2 | Specs 01–04, B01 brief, CLAUDE.md, decisions D17–D27 | 27 Oct | done (awaiting push) |
| C3 | Briefs B02–B03 | 31 Oct | done |
| C6 | Briefs B04–B08 | 3 Nov | done |

## Build briefs (in order; scope v2, D34)

Two Fable sessions may run at once in separate worktrees (`git worktree add .claude/worktrees/<name> -b <branch> origin/main`, then `fable` inside it; see START-HERE): one on the
promotional credits, one on the subscription. Briefs marked ∥ are designed not to touch
the same files.

| Brief | Date | Requirements | Depends on | Session / cap | Status |
|---|---|---|---|---|---|
| B01 Scaffold + CI + deploy skeleton | 31 Oct | P0-13 (part) | F2 (F4 for the deploy) | A (promo) / $15 | done (PR #1 merged 1 Nov; reviewed by planning) |
| B02 ∥ Database, auth, the circle, schools, provenance, seeds, permission harness (D35 tables) | 2 Nov | P0-01, P0-11b | B01 | A (promo) / $30 | done (PR #2 merged 3 Nov) |
| B03 ∥ Model gateway, verifier, cost log, live smoke | 2 Nov | P0-11, P0-04 (model) | B01, F3 | B (subscription) / $25 | done (PR #3 merged 3 Nov) |
| B04 Bring anything: inputs, work check → attempt → assessment (guideline approval enforced, provenance written), notice reader → calendar, `model_runs` | 2–3 Nov | P0-03, P0-04, P0-06 | B02 + B03 merged | A / $30 | done (PR #5 merged 4 Nov) |
| B05 ∥ Profile cards, Today (+ check-in due), Brain page (assisted / independent / retained evidence), timeline | 3 Nov | P0-02, P0-07 | B02 + B03 merged | B / $20 | done (PR #4 merged 4 Nov) |
| B06 Help Plan agent, guardian view (Teacher-reviewed labels), "We did it", fix it → check it alone → follow-up check | 3 Nov | P0-05, P0-08, P0-09 | B04, B05 | A / $30 | done (PR #8 merged 4 Nov; Help Plan not yet run live) |
| B07 ∥ Teacher view: guidelines approval, class picture, confirm queue, review with feedback controls (agree / correct / add / audience), release, interventions (owner, follow-up, outcome, close), notes with origin labels, class notice, learner profile | 3 Nov | P0-10 | B04 | B / $30 | done (PR #7 merged 4 Nov) |
| B08 Eval runner results + proof page `/evidence` | 3 Nov | P0-12 | B03, E1 | B / $10 | done (PR #6 merged 4 Nov) |
| **Gate P0:** full run on the founder's phone | 3 Nov, 20:00 (D35) | all P0 | — | — | todo |
| B09 PWA, polish (landing hero by surface, D35), E2E in CI; the Bring question picker shows the question itself (MathText), not the slug; `robots.txt` (allow `/`, `/evidence`; disallow `/api/`, `/learner/`, `/guardian/`, `/teacher/`, invite and join links; D36); then P1 in order (incl. P1-g teacher uploads a script) (voice, see-it card, overlay, open-weight row, WhatsApp text) | 3 Nov | P0-13, P1 | Gate P0 | subscription | PR open (4 Nov): landing, /try, PWA, picker, robots, e2e job |
| B10 Release hardening, restore drill, history scan, README | 3 Nov | P0-13 | B09 | B / $8 | todo |
| B11 Red ink on the learner's photo; teacher uploads a learner's script (P1-c, P1-g) | 4 Nov | P1 | B04, B07 | subscription | review (branch `b11-red-ink`; questions below) |
| B12 Parent's home language (af, zu, xh, tn, st) + Share to WhatsApp (D38, P1-e) | 4 Nov | P1 | B06, B07 | subscription | review (PR open 4 Nov; live check done, $0.05) |
| B13 Ask about a step by voice or typing (Muse Voice Transcribe, P1-a) | 4 Nov | P1 | B04, B06 | subscription | PR #12 open (branch `b13-ask-by-voice`; CI green; live check run 4 Nov: transcription 4.2 s / $0.00005, hint accepted on the 2nd call 32.0 s / $0.0157, see the B13 note below) |
| B14 Open-weight comparison row (Muse Spark Open, P1-d) | 4 Nov | P1 | B08; founder's partner-host key | subscription | todo |
| B16 ∥ Make it clear: setup by taps, Today's one next action and plain statuses, Brain explainer and legend, pasted maths, the no-dates notice message (D39) | 4 Nov | D39 | B04, B05 | subscription | review (PR #13, branch `b16-clarity`, 4 Nov; questions below) |
| V1 Record the demo + X cut | 4 Nov, morning | — | B10 | Founder + planning | todo |
| B11 Freeze + submit by 20:00 SAST | 4 Nov | — | V1 | Founder | todo |

Corpus waves (W1 English done; practical, home languages, Afrikaans catalogued) are
**paused until 5 Nov** (planning recommendation, 29 Oct).

## Questions for the planning session
Add any question here, linked to a task ID.

- **B13 · the clip is WAV, not webm/opus or mp4/aac.** Meta's file endpoint
  (`POST /v1/asr/transcribe`, "Transcribe a recording", read 4 Nov) accepts one container
  only: "a RIFF/WAVE container holding mono integer PCM at 16 kHz or 24 kHz" (10 min, 32 MB).
  With no new runtime dependency allowed there is nothing on the server to decode
  `MediaRecorder` output, so the browser captures through the Web Audio API and writes the
  WAV itself (16 kHz mono 16-bit; 60 s is about 1.9 MB, under the 5 MB cap) and the server
  refuses anything else before a byte leaves it. Everything else in the brief stands (hold to
  talk, 60 s, 5 MB, audio never stored, `model_runs` row). Confirm, or rule otherwise.
- **B13 · live check (4 Nov 2026, 12:15 UTC; `apps/api/src/voice/live-smoke.ts`).**
  `muse-voice-transcribe-1.0` is on the account's model list (`GET /v1/models`: 9 models,
  incl. `muse-voice-transcribe-1.0`, `muse-spark-1.3`, `muse-wonder-1.0`). Clip: macOS `say`,
  1.78 s, 16 kHz mono 16-bit WAV, 61 KB. **Transcription:** `muse-voice-transcribe-1.0`,
  1 call, 4,223 ms, 1,840 ms of audio billed, **$0.00005**, session ID `af84b636-…`,
  transcript "I don't get why it's minus six.." (exact words; a trailing double full stop).
  **Hint** (eval fixture `alg-quad-01`, step 2, the wrong-sign working): `muse-spark-1.3`,
  **2 calls**: the first hint failed `HINT_LEAKS_ANSWER` (it stated a memo value) and was
  re-asked; the second was **accepted**: "Expand your brackets and compare each term's sign
  with the original equation. Ask what pair of signs in the brackets would make both the
  middle and last terms match." Latency 14.4 s + 17.5 s = **31,978 ms**; tokens
  544 in / 1,700 out then 598 in (497 cached) / 1,789 out; **$0.01571**. Total **$0.01576**.
  Note for the cap: a hint costs about what a work check does (Muse Spark reasons for
  ~1.7k output tokens before a 40-token JSON), and one in two first answers leaked here, so
  budget two calls per ask.
- **B13 · `.env.example`** could not be edited (writes to `.env*` are denied): please add
  `META_MODEL_TRANSCRIBE=` (default `muse-voice-transcribe-1.0`; Standard tier only).

- **B02 · `.env.example` could not be edited** (the session's permission settings deny
  writes to `.env*`). Please append these lines (also in the PR body):
  `DB_MIGRATE_ON_BOOT=` (default true; set false to migrate as a Railway pre-deploy step),
  `SEED_PASSWORD=` (dev only; the demo people's password; the class codes derive from it),
  `CONTENT_DIR=` (admin CLI only; a directory outside the repo).
- **B02 · schema additions to confirm** (spec 03 names nothing for these): `classes.code_hash`,
  a `guardian_invite_codes` table (the learner's unredeemed, rotating code; `guardian_links`
  still holds the redeemed hash), and `guideline_steps.step_type` (M/A/CA, from P0-04).
- **B02 · a teacher's school:** P2 has no school field, so `POST /api/teacher/classes` takes
  `schoolId` for a teacher's first class (T1 shows a select fed by a read-only
  `GET /api/schools`); after that the teacher's school applies and any other school is 404.
  Seeded teachers already have a school. Confirm, or say where the school should be chosen.
- **B02 · sign-up ownership:** `POST /api/auth/sign-up/email` is our route (one Drizzle
  transaction: user, credential account, `profiles` with `age_attested_at`, audit), and Better
  Auth's own sign-up is disabled, because its hooks cannot write a foreign-keyed `profiles`
  row inside its adapter transaction. Sessions, sign-in, sign-out and password hashing are
  Better Auth's. Confirm this reading of "Better Auth, email + password only".
- **B02 · migrations at boot** (default on; `DB_MIGRATE_ON_BOOT=false` opts out) so the first
  deploy after merge works on the phone without a Railway settings change. Spec 03 §2 says
  "a release step": confirm, or ask the founder to set the pre-deploy command.
- **B05 · `confidence_sure_*`:** read as the learner's own "I'm sure" call (`payload.sure`)
  against the outcome; nothing collects it yet. Confirm, or say what it should measure.
- **B05 · `GET /api/me/checks`** is built here (spec 03 §9.3 names no brief): open
  interventions due today or earlier, plus retention checks derived from events (2 days
  after a correct independent check, until a retention outcome is recorded). B06/B07 can
  rely on it.
- **B11 · the script's background read is its own job, not B04's `runAssessment`.** The brief
  says both "runs B04's background assessment" and "nothing reaches the learner or the parent
  until the teacher releases it"; B04's job ends in B06's `afterProposed`, which for an
  independent attempt writes `independent_check_completed` and issues a same-day Help Plan
  (the integration test showed Lerato's Today carrying "tonight" from a script she cannot
  open). `apps/api/src/teacher/scripts.ts` therefore runs the same read (same prompt,
  `runModel`, verifier, `writeAssessment`, same `assess:<id>` job key) without
  `afterProposed`; the loop's independent evidence for a script comes from `review_released`.
  Residual, not fixable from B11's folders: `writeAssessment` still appends the `assessed`
  event (basis `model_high` when every step is sure), so the learner's timeline shows "You
  brought work" and "Your work was checked" rows (words only, no marks, no link) and the
  Brain's independent evidence can move before release. Rule: keep this, or let B04's job
  take a `skipLoop` flag, or gate those events on release.
- **B11 · access gate on `school_provided` attempts:** the owner's `attempt.read`,
  `attempt.assess`, `attempt.fix` and `review.read` are refused (404) until a released
  review exists; teachers unchanged; guardians never. The input row carries the teacher in
  `inputs.learner_id` (D37's precedent), so the learner's Today and inputs list never show
  it; the audit rows (`script.uploaded`, `attempt.assess_started`) name her as the actor.
- **B11 · outside the listed folders, all additive:** the route in `apps/web/src/app/router.tsx`
  (the screen has to exist), one "Mark a script" link in the class picture's nav
  (`routes/teacher/picture/Picture.tsx`), the `ink-red` tokens in `design/tokens.css` (the
  brief asks for them), seven harness rows in `apps/api/test/access.integration.test.ts`
  (the harness asks for rows, not files), the e2e fixture `apps/web/e2e/fixtures/script.png`
  (synthetic, drawn with sharp) and two e2e specs. No handwriting font ships (no OFL file
  to hand): the pen writes in the bold system face, as the brief allows.
- **B11 · live check (4 Nov, Muse Spark 1.3, the synthetic script image, one teacher upload):**
  one call, accepted first time, 16.0 s, $0.0157, total 3/4, every step `high`. Boxes landed
  on the right line for all four steps (nearest-line match 4/4); vertical drift 39–59 grid
  units (4–6 % of the height, the ellipse sits on or just under the line); steps 1 and 2
  shared one box (the factorised line), so repeated ticks now sit side by side. The ink
  stays on the photo. A real photo of handwritten working is not in the repo: if the founder
  has one (adult, consented), repeat with `E2E_LIVE=1` and the scratch driver, and record
  the placement.
- **B05 · resolved by D37 and the 4 Nov update of PR #4:** Playwright (in the repo from
  B04), the evidence payload contract (B04's `assessed` event now writes `skills_correct` /
  `skills_lost` / `mode` through `evidencePayload()`), and `model_runs` rows (the profile
  route calls B04's `runModel`, so the daily caps apply; `recordRuns.ts` is gone).
- **B04 · two schema additions to confirm** (migration `0003`, additive): `attempts.assessing_started_at`
  (the persisted "assessing" state the brief's 202 + poll and the 5-minute boot sweep need) and
  `inputs.idempotency_key` with UNIQUE(learner, key) (spec 03 §8.3 sends `idempotencyKey` on
  `POST /api/inputs`, but §8.1 had no column for it).
- **B04 · per-call timeout:** the brief says "keep the 45 s timeout per model call"; B03 measured
  Muse Spark reasoning past 2,500 output tokens on wrong answers and set `WORK_CHECK_TIMEOUT_MS`
  to 90 s. B04 uses B03's 90 s per call inside the brief's 120 s whole-run deadline (the route
  still answers in milliseconds). Say if 45 s is the ruling.
- **B04 · PDF notices:** Meta's image understanding takes images only, so a PDF is stored
  (≤ 8 MB, private) but not read; the screens say so and ask for a photo (`unsupported_pdf`).
  Reading PDFs needs a rasteriser (not in the allowed dependencies). Fine for the demo (the PNG
  notice works), or rule otherwise.
- **B04 · a teacher's class notice** is stored in `inputs` with `learner_id` = the teacher
  (spec 03 §8.1 has no uploader column); the events carry the class scope. Confirm or name a column.
- **B04 · Playwright** (`@playwright/test`, root devDependency) is the one dependency beyond the
  S3 client and `sharp`: the brief asks for a Playwright test. `pnpm test:e2e` runs locally
  (build first); B09 adds the CI job.
- **B04 · item prompts** render as Markdown/LaTeX source (no KaTeX yet: no new dependencies).
  B09 polish, or allow `katex` now.
- **B06 · the `plan` purpose is now an agent turn:** `MODEL_OUTPUT_SCHEMAS.plan` is
  `planAgentTurnSchema` (`{tool, reason, plan | null}`) so every agent step goes through
  `runModel` and the verifier (TOOL_UNKNOWN on the requested tool, STEPS_EXCEEDED, a new
  `PLAN_MISSING` code, the content rules on `turn.plan`, plus HINT_LEAKS_ANSWER over the
  learner view against the gap item's memo values). `planOutputSchema` and the pure rule
  functions are unchanged. Confirm, or rule that tool steps bypass `runModel`.
- **B06 · intervention audience:** spec 03 §9.2 shows a guardian an intervention "if the
  teacher chose the guardian audience", but `interventions` has no audience column (B02/B07).
  G1 shows open interventions as the spec 05 §9 sentence only (teacher, skill, check-in date),
  never the teacher's action line. Say whether B07 adds an audience, or this stays.
- **B06 · effort minutes:** nothing measures time on task, so G1 shows days, pieces of work
  and topics and says minutes are not measured yet (no invented number). Confirm.
- **B06 · the weekly trigger** is lazy: a plan from an earlier week is refreshed in the
  background on the next read of `GET /api/me/plan` or the guardian week (no scheduler, no
  table). Confirm.
- **B06 · a third seed item** (`alg-12-factorise-trinomial-2`, original, same tags) so "check
  it alone" has an unattempted match in dev and in the e2e; the real pack (C1) covers Railway.
- **B06 · `.env.example`** could not be edited (write denied): please add
  `META_MODEL_AGENT=` (default META_MODEL), `PLAN_AGENT_MAX_STEPS=` (default 8),
  `RETENTION_CHECK_DAYS=` (default 2), `RESOURCE_LIST_PATH=` (admin CLI only).
- **B06 · G2 Notes** calls B07's `GET /api/guardian/notes` (D37) and shows an empty state until
  it merges; the G1 teacher messages read `notes`, `review_feedback` and `interventions` directly.
- **B06 · resolved on `main` (4 Nov):** D37 rules for the agent-turn `plan` purpose (each
  step a verified `runModel` call, counted against the daily cap), the intervention sentence
  in the parent's view, effort minutes not shown until measured, and the third seed item; the
  `.env.example` lines landed in `7c07eb6`. PR #8 brought up to date with B07 the same day:
  G2 Notes now reads B07's `GET /api/guardian/notes`.
- **B07 · brought up to date with B05 on 4 Nov (PR #7):** review events build their payload
  with B05's `evidencePayload()`; skill wording through `skillLabel(tag, 'teacher')` on
  every teacher screen (guardian wording inside the note prompt, since the parent reads the
  note); item prompts, criteria and typed answers through `MathText`; T6 shows the Brain's
  projection (three marks per skill) instead of raw counts; the integration test now checks
  an assigned intervention on `GET /api/me/checks` and a released review on `GET /api/me/brain`
  (counted once, overriding the model's). Typed answers stay as `WorkViewer` shows them ("never
  re-typeset", spec 05 §5); say if `MathText` should wrap them too.
- **B07 · `guideline_approved` event subject:** `learning_events.learner_id` is NOT NULL and
  there is no class-level event, so one event is written against the teacher's user ID
  (D37's precedent for the class notice). Alternative: one event per learner in the class.
- **B07 · learner-facing review route:** spec 03 §5 says `GET /api/attempts/:id` returns the
  released review, but that is B04's service and B06 is touching it (fix/check), so B07 adds
  `GET /api/attempts/:id/review` (owner after release: review + learner-audience feedback
  with "Teacher-reviewed" / "From Ms Dlamini"; class teacher: everything; guardian: 404).
  L3 should call it to show *Your teacher approved this result* (B06 or B09).
- **B07 · `GET /api/guardian/notes`** (spec 03 §8.3) lives in `apps/api/src/notes/` (the label
  depends on the note's origin) rather than a guardian folder; B06's G2 screen can read it.
- **B07 · note prompts cite evidence by alias** (`E1`, `E2`), never by UUID: the gateway's
  phone-number guard trips on digit runs in UUIDs, and the model only needs an opaque
  handle. `model_runs.output` therefore holds aliases; the learner's own events are the map.
- **B07 · release by attempt:** `POST /api/teacher/attempts/:id/release` exists beside the
  spec's `POST /api/teacher/reviews/:id/release`, so "release before confirm → 409
  `not_confirmed`" is testable (a review ID does not exist before confirm).
- **B08 · finished 3 Nov (second session), PR #6.** The integration suite (62 tests) wrote the
  permission harness file; the live `pnpm eval:dev` over the 12 in-repo cases (12 calls, $0.17)
  wrote `evals/results/latest.json`, committed with the conservative dataset label. Four tests
  committed by the first session had not run green (interval and money formatters, numerals in
  `SuiteSection.tsx`, the empty-state log check); fixed in `1b743a2`, described in the PR.
- **B09 · finished 4 Nov, PR open.** Landing by surface (D35), `/try` with a seeded
  "Try it (fictional)" class, install as an app (hand-written service worker, manifest,
  icons from the Sentinel mark), the Bring picker through `MathText`, `robots.txt`, Open
  Graph card, and the `e2e` CI job. Decisions to confirm:
  1. **Files outside the brief's "own only" list**, each the smallest change the brief's
     items need: `apps/api/src/config.ts` (`PUBLIC_TRY_CLASS_CODE`, `TRY_USER_DAILY_CALLS`),
     `auth/signup.ts` (the server-side join), `modelRuns/caps.ts` (the try-it cap, applied
     inside `checkCaps` by class-code hash), `routes/items.ts` + the shared `itemSummarySchema`
     (`promptMd`, `approvedForYou`), a new public `routes/try.ts` (`GET /api/try`: available +
     class name, never the code), `app.ts` wiring, `static.ts` (`sw.js` and the manifest are
     `no-cache`), the shared `signUpBodySchema` (`tryClass: true`) and `signUpResponseSchema`
     (`joinedClass`), `app/router.tsx` (`/try`), `api/auth.ts` (`tryStatus`), one import and
     one line in `routes/learner/today/Today.tsx` (the install hint), `vitest.config.ts` +
     `package.json` (a `web` unit project for the worker's fetch policy), and the e2e/integration
     harnesses (`test/e2e/serve.ts`, `test/integration/db.ts`) so the try-it class is reachable.
  2. **`.env.example` is write-denied** in this session: please add `PUBLIC_TRY_CLASS_CODE=`
     (the seed prints it: `class try code`) and `TRY_USER_DAILY_CALLS=6`. On Railway, set
     `PUBLIC_TRY_CLASS_CODE` to the production seed's try code, or `/try` says it is not on.
  3. **The try-it teacher** is a seeded person (`try-teacher@demo.guardianbook.test`, "Ms
     Demo") whose account gets a fresh random, unprinted password on every seed run, so the
     class has a teacher but nobody can sign in as it (integration test).
  4. **Seed counts changed:** 4 classes, 6 guideline approvals (3 items × 12A and try); the
     auth test's counts were updated. The permission harness is unchanged.
  5. **Picker:** unapproved items stay listed (after the approved ones) but disabled, with
     "not approved for your class yet", rather than hidden. Say if they should be hidden.
  6. **Service worker update policy:** `skipWaiting` + `clients.claim` as the brief says, no
     "A new version is ready" prompt (spec 06 §5 asked for one): the next page load gets the
     new build because pages are network-first and `index.html`/`sw.js` are never HTTP-cached.
     Activating deletes older caches, so an already-open old page that lazy-loads a chunk
     after a deploy falls back to the route error boundary's retry (the existing stale-bundle
     behaviour, unchanged).
  7. **`robots.txt`** follows the brief's list exactly (allow `/`, `/try`, `/evidence`;
     disallow `/api/`, `/today`, `/brain`, `/me`, `/bring`, `/attempts/`, `/items/`,
     `/calendar`, `/guardian`, `/teacher`); the row above's older list (`/learner/`, invite
     and join links) is superseded by the brief.
  8. **Port 8097 is shared** by every worktree's e2e server: two sessions running
     `pnpm test:e2e` at once reuse or kill each other's server (seen twice on 4 Nov). Not a
     code issue; CI runs alone.
- **B08 · resolved on `main` (4 Nov):** the eval-only `.env.example` lines (`EVAL_DATASET_LABEL`,
  `EVAL_HELD_OUT`, `EVAL_NOT_YET`, `EVAL_PRIVACY_FILE`) landed in `af71f5c`; D37 keeps the
  synthetic dev cases in-repo at `apps/api/src/evals/fixtures/cases/` (real and held-out sets
  stay outside the repo).
- **B12 · where the background translation starts.** The brief says "translate in the
  background when the text is created (plan issued, note sent, feedback released)", but
  those moments live in `plans/service.ts` (`storePlan`), `notes/service.ts` (`sendNote`)
  and `teacher/review.ts` (`releaseReview`), which B12 does not own. So the job starts on
  the first guardian read of the text (G1 or G2) and when the parent picks a language
  (everything they can already see is warmed); G1 and G2 serve the English with
  "Translation on its way" and refresh every 3 s (up to 8 times) until it lands. One line
  in each of the three files (`translateForGuardians(...)`) would make it creation-time;
  say if B12 or a later brief should add them.
- **B12 · four small edits outside the owned folders**, all additive: `loop.test.ts`
  (B06) now expects `translation: null` on a teacher message; three harness rows in
  `test/access.integration.test.ts` for `/api/guardian/language`; `practiceGateway.ts`
  answers `translate` with a pseudo-translation (every word's letters reversed);
  `notesRouter` takes `TeacherDeps & Pick<PracticeDeps, 'jobs'>` (the same object
  `createApp` already passes). `GuardianNoteView` and `GET /api/guardian/notes` gained
  `translation` and `language`; the week is served as `GuardianWeekView` (the B06 schema
  extended), so `plans/service.ts` is untouched. The guardian's language is read from
  `GET /api/guardian/language`, not `/api/me` (`routes/me.ts` is not B12's). No `.env`
  line is needed.
- **B12 · live check (4 Nov, `muse-spark-1.3`, `translate-v1`, 6 calls, $0.050):** every
  accepted output passed all five rules on the first call. The first isiZulu run was cut
  off at a 2,000-token output budget (the model reasons before the JSON; 2,216 and 1,995
  output tokens were needed), so the budget is 6,000 like the work check and an unusable
  answer is remembered as `unavailable` (English stands, no re-spend). **For a fluent
  speaker to check** (names and numbers were placeholders in the prompt and restored after):
  - EN plan: *One step slipped this week: factorising. Ask Lerato to teach you step 2
    tonight. Ten minutes is enough; you do not need to know the maths. Lerato brought 3
    pieces of work this week and had every one checked.*
  - ZU: *Isinyathelo esisodwa asihambanga kahle kuleli sonto: ukuhlukanisa ngezici. Cela
    Lerato akufundise isinyathelo 2 namhlanje ebusuku. Imizuzu elishumi yanele; awudingi
    ukwazi izibalo. Lerato ulethe imisebenzi engu-3 kuleli sonto futhi yonke yahloliwe.*
  - AF: *Een stap het hierdie week geglip: faktorisering. Vra Lerato om jou vanaand stap 2
    te leer. Tien minute is genoeg; jy hoef nie die wiskunde te ken nie. Lerato het hierdie
    week 3 stukke werk gebring en elkeen laat nasien.*
  - EN note: *This week Lerato worked on algebra. One step slipped: writing the final
    answers after factorising. Please ask Lerato to explain that step to you tonight; 10
    minutes is enough. Ms Dlamini*
  - ZU: *Kuleli sonto Lerato usebenze nge-algebra. Isinyathelo esisodwa asihambanga kahle:
    ukubhala izimpendulo zokugcina ngemuva kokufactorisa. Ngicela ucele Lerato ukuthi
    akuchazele leso sinyathelo namhlanje ebusuku; 10 amaminithi anele. Ms Dlamini*
  - AF: *Hierdie week het Lerato aan algebra gewerk. Een stap het geglip: om die finale
    antwoorde na faktorisering neer te skryf. Vra Lerato asseblief om daardie stap vanaand
    vir jou te verduidelik; 10 minute is genoeg. Ms Dlamini*
- **B12 · synced with main (B11) on 4 Nov by merge commit:** two conflicts, both additive
  (the `AuditAction` list in `audit/record.ts`; the B11 and B12 rows above), kept both sides;
  no migration clash (main added none, 0004 stands). Running the whole e2e suite, not only
  the B12 spec, showed `guardian-language.spec` leaving the parent in isiZulu on the shared
  e2e server, so `loop.spec` (B06) read a mock-translated week; the spec now switches the
  parent back to English at its end (test only, no product change). Typecheck, lint, unit,
  integration (throwaway Postgres on 5438), build and all 9 e2e green after the merge.
- **B16 · the "no dates" notice, found and fixed (§5).** A live probe of the notice prompt on
  the fixture's dateless handwritten page (`muse-spark-1.3`, one call, 5.8 s, $0.004) came
  back `{events: [], not_a_notice: true}`, accepted first time, so the model path already
  said "not a notice". Three things could still show the wrong words: (1) an accepted read
  with `events: []` and `not_a_notice: false` read as `extracted` ("Dates found") while
  Today's row stayed "Reading"; now any accepted read with no dated events is
  `not_a_notice` and the Calendar says *I couldn't find any dates on this. Is it a school
  notice?* (the same words for both; no new `NoticeState`). (2) The Calendar's 2-second
  poll turned any dropped request (a phone losing signal, a 5xx) into the failure message
  and stopped; it now retries up to five polls before giving up. (3) The only server path
  to `failed` is a gateway error, and the notice read had the tightest budget in the app
  (4,000 output tokens, 45 s) for a page the model must read line by line; it now matches
  the work check (6,000 tokens, 90 s per call, D37) inside the same 120 s whole-run
  deadline. Every non-accepted run now logs `notice: not accepted` with its status, the
  gateway error code and the failed verifier codes per call. **Founder:** the Railway log
  line for the input you tried (`model call: timeout`, `truncated by max_tokens` or
  `notice: not accepted`) would say which of the three it was; the fix covers all three.
- **B16 · the grade has no card (§1).** `profile_cards` holds dream, subjects, hardest and
  how-I-learn, and `profiles` has no grade column, so the grade the learner taps rides as
  the first sentence of the "how I learn" answer (*I am in Grade 12.*), the one card a
  parent never sees; the prompt (`profile-cards-v1`, immutable) and the contract are
  untouched. B17 (past papers by grade) will want a real `grade` field: please rule where
  it lives (a `profiles` column plus a field on `POST /api/me/profile` is the natural home).
- **B16 · "One day I want to ___" (§1):** the gap follows *One day I want to…* rather than
  *be a…* so the third example chip (*start a business*) reads correctly; the chips are
  *be an engineer*, *be a nurse*, *start a business*. The composed answer is always
  *One day I want to <gap>.* (a learner who types the whole sentence is not doubled).
- **B16 · evidence in plain words (§3):** `timelineEventSchema` carries what happened and
  when, not the mark per event or the step, so a chip's evidence reads *Tuesday: your work
  was checked · Yesterday: fixed it yourself · Today: checked it alone, no hints*, not
  *lost the mark at step 2*. Saying the step needs the event payload (or an `outcome`
  field) on the wire, which is B05's brain route, not B16's folders. Rule if that is wanted.
- **B16 · Today's "Reading" for a notice (§2):** `GET /api/me/today` marks a notice `read`
  only when it produced calendar events, so a dateless notice stays "Being read…" until the
  day-old rule hides it (`routes/me/today.ts`, not B16's). A `read` status from the model
  run's state would fix it in that route; noted, not changed.
- **B16 · outside the owned folders, both test-only:** `test/integration/practiceGateway.ts`
  gained a `profile_cards` case (cards read off the four answer blocks) so the taps-only
  Playwright walk reaches real cards instead of "We could not make cards from that"; the
  notice tests live in a new `test/integration/notice-clarity.test.ts`. `MathTextKatex.tsx`
  now imports its `Segment` type from the new pure module `MathText.logic.ts`.
- **B16 · step 6 (maths keyboard on Fix and Item):** B15's `MathInput` was not on
  `origin/main` at merge time, so the Fix and Item screens are untouched; wire it in when
  B15 lands (two typed boxes).

