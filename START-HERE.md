# START HERE

Read this first, every session. Chats hold no state; this page does.
**Updated:** 27 Oct 2026, planning session.

## Current reality (verified 27 Oct 2026)

**This repo:**
- Private repo `MozeyZvinas/guardian-book`, on the Mac at `~/Projects/guardian-book`.
- Setup only: no application code.

**The legacy build lives in two places:**

| Folder | What it holds |
|---|---|
| `~/GitHub/guardian-book-legacy` | The **October vision canon**: 28 commits not on GitHub yet, so the only copy is this laptop. Its remote still points at the old repo name, which GitHub now resolves to THIS repo. See action H0 below. |
| `~/Projects/guardian-book-legacy` | A fresh clone from GitHub. It stops before the October work. |

**Reusable legacy data** (verify before relying on it):

| Data | Where | Notes |
|---|---|---|
| Structured DBE Maths papers | `tools/ingest/data/structured/` | 10 papers, 513 questions on disk. The legacy notes say 11 papers and 519 questions: reconcile. |
| Golden marking cases | `tools/evals/` | Only 4 cases |
| Permission tests | `tools/rls-tests/` | Ideas to reuse |
| Erasure script | `tools/erase-user.mjs` | Approach to reuse |

**Claude Code:**
- Runs as `fable` (Agent SDK runner) on the $199.98 promo, which expires **14 Nov**.
- Fable 5.1 costs $10/$50 per million tokens.
- Default cap: $20 per session.

## Where we are

| Stage | What | Status |
|---|---|---|
| 0 | Vision | Close to done; open items below |
| 1 | Document set (`docs/plan/00-document-set.md`) | **Awaiting Mozey's approval** |
| 2 | Tech stack decision (`docs/specs/01-stack.md`) | Not started |
| 3+ | Remaining documents, in the approved order | Not started |
| Build | Numbered briefs in `prompts/` | Not started |

**T-001 and `prompts/01-kickoff.md` are on hold.** Planning moved to the planning session to
save Fable budget. Don't run them.

## Open decisions (owner)

| # | Decision | Owner |
|---|---|---|
| 1 | Meta hackathon (submit by 4 Nov): is Guardian Book still the entry? The rules require a public repo, new work only and Meta's models. This changes the scope, pace and model provider. | Mozey |
| 2 | Design system: v1 Sentinel (Direction K) or v2 Sunrise. This blocks the screens spec. | Mozey |
| 3 | Release-1 audience: learner loop only, or learner + teacher confirm/release + guardian Help Plan. | Mozey, on the CTO's proposal in 02-product |
| 4 | Data residency at launch: South Africa-hosted, or cross-border with consent and an attorney's basis. Feeds the stack. | Mozey + attorney |
| 5 | Every other stack question. | Stage 2 |

## Next actions

**Mozey: H0, now.** Protect the vision canon (it's reversible and safe):
```bash
cd ~/GitHub/guardian-book-legacy
git remote set-url origin https://github.com/MozeyZvinas/guardian-book-legacy.git
git fetch origin && git status -sb      # expect "ahead 28", not "behind"
git push origin main
cd ~/Projects/guardian-book-legacy && git pull --ff-only
```

**Mozey:** approve or adjust Stage 1, and answer open decisions 1–4.

**Planning session:** on approval, do the housekeeping H1–H2, then Stage 2 (stack).

## Last session handover

- Read the shared setup chat.
- Inspected both repos.
- Researched how teams plan builds for coding agents.
- Wrote the Stage 1 document set and this page.
- No code; nothing touched production.
