# START HERE

Read this first, every session. Chats hold no state; this page does.
**Updated:** 27 Oct 2026 (evening), planning session.

## What we're doing right now

Building **Guardian Book** for the **Meta Global AI Developer Hackathon** (Indie, solo).

**Deadlines:**
- Submit by **20:00 SAST, Wed 4 Nov**. The official close is 04:00 SAST, 5 Nov.
- Claude Code credit (about $200 promo) expires **14 Nov**.

**Judging:**
- Four equally weighted criteria: **Impact · Use of Meta tooling · Technical depth · Demo**.
- The top 5 per track have their 3-minute videos watched live. The video may show only
  work built during the event.

**Rules that shape every decision:**
- The repo goes **public** at submission, so nothing private is ever committed (D16).
- Product code is **new work** written during the event.
- Pre-existing inputs (DBE papers, reviewed answer keys, golden cases) are labelled as
  inputs.
- Meta models are the primary AI path (D13).

**Release 1 serves learners and teachers (D10).** Parents come next. **Design: Sentinel,
latest (D11).**

## Current reality (verified 27 Oct 2026)

**This repo** (`MozeyZvinas/guardian-book`, private until submission, at
`~/Projects/guardian-book`): planning only, no application code. It now contains:
- `docs/vision/`: the product vision, imported read-only;
- `docs/plan/`: the Stage 1 document set and the ChatGPT blueprint review;
- `docs/decisions.md`: D2–D16, plus open items.

**Retired legacy** (`guardian-book-legacy`, D8): an archive only. Data reused after
verification:

| Data | Where | Notes |
|---|---|---|
| DBE Maths papers | `tools/ingest/data/structured/` | 10 papers, 513 questions on disk; the legacy notes say 11 and 519, so reconcile |
| Golden marking cases | `tools/evals/` | Only 4 cases |
| Erasure approach | `tools/erase-user.mjs` | |
| Permission-test ideas | `tools/rls-tests/` | |

**Two local copies of the legacy repo:**
- `~/GitHub/guardian-book-legacy` holds 28 commits of October work (vision and company
  documents) that are on this laptop only. Action H0 below backs them up; it does not
  mean we work there.
- `~/Projects/guardian-book-legacy` is a fresh clone from GitHub, without them.

**Claude Code:** runs as `fable` (Agent SDK, promo key), Fable 5.1 at $10/$50 per million
tokens, $20 default cap per session.

## Tracker

| Stage | What | Status |
|---|---|---|
| 1 | Document set (`docs/plan/00-document-set.md` v1.1) and blueprint review (`01-blueprint-review.md`) | **Awaiting Mozey's approval (Open #9)** |
| H | Housekeeping: vision imported, kickoff STALE, README fixed, decisions logged | Done 27 Oct |
| 2 | Tech stack (`docs/specs/01-stack.md` + ADRs) | Next, Wed 28 Oct morning |
| 3+ | 02 product (hackathon slice) → 03 architecture and data → 04 privacy minimum → 05 quality and delivery → build plan → brief template → CLAUDE.md | 28–29 Oct |
| Build | Brief 02 (scaffold + CI + deploy skeleton) and then the slice briefs | From Thu 29 Oct |

The full day-by-day schedule is in `docs/plan/00-document-set.md` §9.

## Open decisions (owner)

| # | Decision | Owner |
|---|---|---|
| 9 | Approve the Stage 1 document set v1.1 | Mozey |
| 8 | Branch protection: go public early (free), GitHub Pro (about $4/month), or CI discipline until submission | Mozey |
| 2–4 | Framework, Railway layout, auth and consent | Stage 2 |
| 7 | The hackathon slice itself | Mozey, on the CTO's proposal in 02-product |

## Next actions

**Mozey: H0, back up the October work** (safe and reversible). This does NOT switch us to
the legacy repo; the last line pushes the new repo.
```bash
cd ~/GitHub/guardian-book-legacy
git remote set-url origin https://github.com/MozeyZvinas/guardian-book-legacy.git
git fetch origin && git status -sb     # expect "ahead 28"; if it says "behind", stop and paste the output
git push origin main
cd ~/Projects/guardian-book && git push
```

**Mozey:** turn on MFA for GitHub, Railway, the Anthropic Console and the Meta developer
account.

**Planning session:** on approval of Open #9, write Stage 2 (stack).

## Last session handover (27 Oct)

- Founder ruled D9–D16.
- Imported the vision into `docs/vision/`.
- Reviewed the ChatGPT blueprint (adopted, adapted, deferred, rejected).
- Updated the document set to v1.1 with the hackathon schedule.
- Built the downloadable vision, business and competition pack outside the repo, on the
  Desktop in the Dan Vega folder.
- No code; nothing touched production.
