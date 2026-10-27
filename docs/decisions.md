# Decision log

Newest first. A decision is binding once it's here. To change one, add a new entry that
supersedes it — don't edit history.

## Decided

| Date | Decision | Notes |
| --- | --- | --- |
| 2026-10-27 | Fresh repo for the rebuild; previous build archived as `guardian-book-legacy` | Legacy data (past papers, evals, permission tests, erasure approach) may be reused after verification; UI/app code is not |
| 2026-10 | Full reset — nothing counts as live until it works on Mozey's own phone | Previous build: poor design, not user friendly, broken |
| 2026-10 | Guardians see school-assessed work in full once the teacher releases it; private practice stays the learner's unless shared | Supersedes the July rule of aggregates only |
| 2026-10 | Backend on Railway | Worked well on iGezi; open to a better option only with a clear reason |
| 2026-10 | Build paper by paper / subject by subject, each with its own test pathway | |
| 2026-09 | Logo: Sentinel (secretary-bird) mark | Logo and mascot; core of the brand story |
| 2026-07 | Web application (mobile-first) rather than a native app first | PWA so it installs like an app |

## Open — needs a ruling

| # | Question | Who rules | Notes |
| --- | --- | --- | --- |
| 1 | Design system: v1 (Sentinel / Direction K) or v2 (Sunrise) | Mozey | Until then, build on theme tokens only |
| 2 | Frontend framework and repo layout | CTO, after kickoff proposal | Proposed in `docs/architecture.md` |
| 3 | Railway service layout (web / API / background worker) and database setup | CTO | |
| 4 | Auth provider and guardian-consent flow for minors | CTO + Mozey | POPIA: consent before collecting a learner's personal information |
| 5 | File storage for scans/photos and data residency | CTO + attorney | Railway has no African region at last check — cross-border transfer analysis is on the critical path; consider SA-region storage for scans |
| 6 | Model providers behind the gateway | CTO | Gateway must stay provider-agnostic; competition builds may require a specific provider |
| 7 | First vertical slice | Mozey | Proposed in `docs/plan-slice-1.md` |

Logged by Maverick.
