# Tasks

Shared state between the planning session and the implementer. Re-read it before every
edit, and make targeted edits only.

**Status values:** `todo` · `doing` · `review` (PR open) · `done` (merged + phone-checked)
· `blocked` · `cut`.

**Briefs live in `prompts/`.** Scope is in `docs/specs/02-product-p0.md`.

## Founder actions (before code)

| ID | Task | Due | Status |
|---|---|---|---|
| F2 | Push both repos; make `guardian-book` public; ruleset on `main` (require PR + status checks, block force-push); update `.claude/settings.json` (paste block in START-HERE) | 28 Oct 08:00 | todo |
| F3 | Meta: spend-limit email at $150; create API key `guardian-book-app` (never paste it into chat) | 28 Oct 08:00 | todo |
| F4 | Railway project (EU West): app service from the repo (Dockerfile), Postgres 16, Bucket, variables, "wait for CI", daily backups | 28 Oct 12:00 | todo |
| F5 | 3–5 adult volunteers (handwritten answers, written consent) and 1 maths teacher (checks guidelines, scores the eval set) | Ask 28 Oct; samples by 30 Oct | todo |
| F6 | Discord: post the organiser questions (prize stacking, open-weight eligibility, agentic autonomy, the 18+ approach) | 28 Oct, 16:00 SAST office hours | todo |

## Planning session

| ID | Task | Due | Status |
|---|---|---|---|
| C1 | Content pack v1: 12–16 original CAPS Grade 12-style items, 3 topics, with marking guidelines and skill tags (teacher verifies) | Draft 28 Oct; verified 29 Oct | todo |
| C2 | Specs 01–04, B01 brief, CLAUDE.md, decisions D17–D27 | 27 Oct | done (awaiting push) |
| C3 | Briefs B02–B04 | 28 Oct, before B01 merges | todo |

## Build briefs (in order)

| Brief | Date | Requirements | Depends on | Model / cap | Status |
|---|---|---|---|---|---|
| B01 Scaffold + CI + deploy skeleton | 28 Oct | P0-09 (part) | F2 (F4 for the deploy) | Fable / $15 | todo |
| B02 Database, auth (18+), roles, seeds, permission harness | 28–29 Oct | P0-01 | B01 | Fable / $20 | todo |
| B03 Content model + question viewer (KaTeX) | 29 Oct | P0-02 | B02, C1 | Sonnet / $6 | todo |
| B04 Model gateway + typed assessment (fail closed) | 29 Oct | P0-03 | B03, F3 | Fable / $25 | todo |
| G1 Handwriting feasibility gate | 29 Oct, evening | P0-04 go/no-go | B04, F5 | Planning | todo |
| B05 Photo attempt + grounded overlay | 30 Oct | P0-04 | G1 = go | Fable / $25 | todo |
| B06 Next step + evidence engine v0 + progress | 30–31 Oct | P0-05, P0-06 | B04 | Fable / $20 | todo |
| B07 Teacher review, confirm, release | 31 Oct – 1 Nov | P0-07 | B04, B06 | Fable / $25 | todo |
| E1 Eval set labelled; held-out frozen 31 Oct 12:00 | 29–31 Oct | spec 04 §5 | C1, F5 | Teacher + planning | todo |
| B08 Eval runner + `/evidence` | 1 Nov | P0-08 | B04, E1 | Sonnet / $8 | todo |
| **Gate P0:** full phone run | 1 Nov, 20:00 | all P0 | — | — | todo |
| B09 Open-weight comparison (Baseten) | 2 Nov | P1-b | Gate P0 | Sonnet / $6 | todo |
| B10 Polish, PWA, E2E in CI | 2 Nov | P0-09 | Gate P0 | Sonnet / $10 | todo |
| B11 Release hardening, restore drill, history scan | 3 Nov | P0-09 | B10 | Sonnet / $8 | todo |
| V1 Record the demo | 3 Nov | — | B11 | Founder + planning | todo |
| B12 Freeze + submit by 20:00 SAST | 4 Nov | — | V1 | Founder | todo |

## Questions for the planning session
Add any question here, linked to a task ID.
