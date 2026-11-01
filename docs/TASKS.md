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
| F3 | Meta: spend-limit email at $150; create API key `guardian-book-app` (never paste it into chat); check whether `muse-wonder-1.0` is listed for the account | **31 Oct (overdue)** | todo |
| F4 | Railway project (EU West): app service from the repo (Dockerfile), Postgres 16, Bucket, variables, "wait for CI", daily backups | **31 Oct (overdue)** | todo |
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
| C1 | Content pack v1: 12 original CAPS Grade 12-style items, 3 topics, with M/A/CA marking guidelines and skill tags (teacher verifies); loaded from a directory outside the repo (`CONTENT_DIR`) | Draft 31 Oct; verified 1 Nov | todo |
| C4 | Vetted resource list (Siyavula CC BY sections with attribution; free first) and two fictional school notices for the demo | 1 Nov | todo |
| C5 | Dev eval cases (`EVAL_DIR`): 10 typed + volunteer photos; held-out set frozen 1 Nov 12:00 (D34) | 1 Nov | todo |
| C2 | Specs 01–04, B01 brief, CLAUDE.md, decisions D17–D27 | 27 Oct | done (awaiting push) |
| C3 | Briefs B02–B03 | 31 Oct | done |
| C6 | Briefs B04–B08 | 1 Nov | todo |

## Build briefs (in order; scope v2, D34)

Two Fable sessions may run at once in separate worktrees (`fable -w <name>`): one on the
promotional credits, one on the subscription. Briefs marked ∥ are designed not to touch
the same files.

| Brief | Date | Requirements | Depends on | Session / cap | Status |
|---|---|---|---|---|---|
| B01 Scaffold + CI + deploy skeleton | 31 Oct | P0-13 (part) | F2 (F4 for the deploy) | A (promo) / $15 | done (PR #1 merged 1 Nov; reviewed by planning) |
| B02 ∥ Database, auth, the circle, seeds, permission harness | 1 Nov | P0-01 | B01 | A (promo) / $25 | doing |
| B03 ∥ Model gateway, verifier, cost log, live smoke | 1 Nov | P0-11, P0-04 (model) | B01, F3 | B (subscription) / $25 | doing |
| B04 Bring anything: inputs, work check → attempt → assessment, notice reader → calendar, `model_runs` | 1 Nov | P0-03, P0-04, P0-06 | B02 + B03 merged | A / $30 | todo |
| B05 ∥ Profile cards, learner Today, Brain page (events, skill map, timeline) | 1 Nov | P0-02, P0-07 | B02 + B03 merged | B / $20 | todo |
| B06 Help Plan agent + guardian view + "We did it" + fix-it retry | 2 Nov | P0-08, P0-09, P0-05 | B04, B05 | A / $30 | todo |
| B07 ∥ Teacher view: class picture, confirm queue, release, notes approve/send, class notice | 2 Nov | P0-10 | B04 | B / $25 | todo |
| B08 Eval runner results + proof page `/evidence` | 2 Nov | P0-12 | B03, E1 | B / $10 | todo |
| **Gate P0:** full run on the founder's phone | 2 Nov, 20:00 | all P0 | — | — | todo |
| B09 PWA, polish, E2E in CI; then P1 in order (voice, see-it card, overlay, open-weight row, WhatsApp text) | 3 Nov | P0-13, P1 | Gate P0 | A + B | todo |
| B10 Release hardening, restore drill, history scan, README | 3 Nov | P0-13 | B09 | B / $8 | todo |
| V1 Record the demo + X cut | 3 Nov | — | B10 | Founder + planning | todo |
| B11 Freeze + submit by 20:00 SAST | 4 Nov | — | V1 | Founder | todo |

Corpus waves (W1 English done; practical, home languages, Afrikaans catalogued) are
**paused until 5 Nov** (planning recommendation, 29 Oct).

## Questions for the planning session
Add any question here, linked to a task ID.
