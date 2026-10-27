# Decision log

**This log outranks every spec and all code.**

How it works:
- Newest first.
- To change a decision, add a new entry that supersedes it. Mark the old one
  `SUPERSEDED by Dxx` or `STALE`; never delete it.
- When a blocker clears, re-open any decision it was holding up.

**Status values:**
- `LOCKED`: binding.
- `OPEN`: needs a ruling.
- `STALE`: no longer applies.
- `SUPERSEDED by Dxx`: replaced by that entry.

## Decided

| ID | Date | Status | Decision | Why / notes | Re-open when |
|---|---|---|---|---|---|
| D16 | 2026-10-27 | LOCKED | **The repo must stay publishable.** No company, strategy, legal or pricing documents, personal data or secrets are ever committed. | The repo goes public at the hackathon submission, and git history goes public with it. Company material lives outside the repo. | Never |
| D15 | 2026-10-27 | LOCKED | The vision canon is imported into `docs/vision/` as read-only reference (from legacy `dc3d734`). | One repo to work from; briefs cite it. See `docs/vision/README.md` for what's stale. | — |
| D14 | 2026-10-27 | LOCKED | Planning, specs and reviews happen in the planning session. Claude Code (`fable`) only implements numbered briefs in `prompts/`. T-001 and `prompts/01-kickoff.md` are STALE. | Fable runs on about $200 of promo credit that expires 14 Nov. | Credit or tooling changes |
| D13 | 2026-10-27 | LOCKED | **Meta models are the primary AI path for the hackathon:** the Muse family via the Meta Model API, plus open weights through partner hosts. The model gateway stays provider-agnostic. | "Use of Meta tooling" is a quarter of the judging. | After submission |
| D12 | 2026-10-27 | LOCKED | **Hosting for the hackathon may be overseas.** No real learner data before submission (adult volunteers and fictional learners only). Prefer a South African database for SA learners when one is practical. | Real learner data is unlikely before submission. POPIA s72 cross-border basis to be settled before real learners. | Before the first real learner's data or any pilot |
| D11 | 2026-10-27 | LOCKED | **Design system: Sentinel, latest version** (`docs/vision/DESIGN.md` §v2 + v3 addendum, `docs/vision/design/sentinel/`). The "v2 Sunrise" option is dropped. | Founder ruling. Closes Open #1. | — |
| D10 | 2026-10-27 | LOCKED | **Release 1 serves learners and teachers.** The guardian/parent plan comes next. | Founder ruling. The hackathon slice drops the guardian Help Plan from P0. | After the hackathon |
| D9 | 2026-10-27 | LOCKED | **Guardian Book is the Meta Global AI Developer Hackathon entry** (Indie, solo). Roam & Nest is not entered in Meta; it is in the World's Biggest Business Competition. | Submit by 20:00 SAST 4 Nov (official close 04:00 SAST 5 Nov). Product code written during the event; public repo at submission. Judged equally on Impact, Use of Meta tooling, Technical depth and Demo. | — |
| D8 | 2026-10-27 | LOCKED | Build only in the new `guardian-book` repo. `guardian-book-legacy` is retired: a read-only archive whose data may be reused after verification. | Fresh start; the legacy UI and app code are not reused. | — |
| D7 | 2026-10 | LOCKED | Full reset: nothing counts as live until it works on Mozey's own phone. | Previous build: poor design, not user friendly, broken. | — |
| D6 | 2026-10 | LOCKED | Guardians see school-assessed work in full once the teacher releases it. Private practice stays the learner's unless the learner shares it. | Supersedes the July "aggregates only" rule. Applies when the guardian plan ships (D10). | — |
| D5 | 2026-10 | LOCKED | Backend on Railway. | Worked well on iGezi. Open to a better option only with a clear reason (Stage 2). | Stage 2 finds a clear reason |
| D4 | 2026-10 | LOCKED | Build paper by paper and subject by subject, each with its own test pathway. | Content law. | — |
| D3 | 2026-09 | LOCKED | Logo: the Sentinel (secretary-bird) mark. | Logo and mascot; the core of the brand story. | — |
| D2 | 2026-07 | LOCKED | Web application (mobile-first) rather than a native app first. | A PWA installs like an app. | — |

## Open — needs a ruling

| # | Question | Who rules | Notes |
|---|---|---|---|
| 1 | ~~Design system~~ | — | Decided: D11 |
| 2 | Frontend framework and repo layout | CTO, Stage 2 | `docs/specs/01-stack.md` |
| 3 | Railway service layout (web / API / worker) and database setup | CTO, Stage 2 | |
| 4 | Auth provider and the guardian-consent flow for minors | CTO + Mozey, Stage 2 and spec 04 | POPIA: consent before collecting a learner's personal information |
| 5 | File storage for scans/photos and data residency | CTO + attorney | Hackathon: D12. Re-open before real learners |
| 6 | Model providers behind the gateway | CTO | Hackathon: D13. The rest in Stage 2 |
| 7 | First vertical slice | Mozey, on the CTO's proposal | Audience decided (D10); the slice is defined in `docs/specs/02-product.md` |
| 8 | Branch protection on a private repo needs GitHub Pro (about $4 a month), or the repo goes public early (free rulesets and secret scanning), or we rely on CI discipline until submission | Mozey (money / visibility) | GitHub docs: rulesets on private repos need Pro, Team or Enterprise |
| 9 | Approve the Stage 1 document set (v1.1, with ChatGPT blueprint adoptions) | Mozey | `docs/plan/00-document-set.md`, `docs/plan/01-blueprint-review.md` |
