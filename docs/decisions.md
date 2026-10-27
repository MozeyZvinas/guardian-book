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
| D30 | 2026-10-28 | LOCKED | **Provider flexibility:** the hackathon build is Meta-only (API, plus optional Muse Spark Open, which requires the "Built with Muse Spark Open" label where used). For school learners under 18, no provider is chosen yet: decide after Meta's policy answer and an evaluation of the options on our held-out set. The gateway stays provider-neutral | Meta API terms §10.1; the Muse Spark Open and Glimmer usage policies say "not intended for individuals under the age of 18" | Meta answers, or post-hackathon evaluation |
| D29 | 2026-10-28 | LOCKED | **DBE past papers are the internal working dataset** (development and evaluation): validation batch first, then up to about 108 Grade 12 Maths and Physical Sciences papers. Stored **outside every repo** with full provenance (URL, date, checksum, copyright notice); processed on paid model usage, not free credits. **Never** in the public repo, app, demo or submission until DBE confirms rights. Permission request sent in parallel. Supersedes D20's "private benchmark only" wording; D20's public rule stands | Founder ruling: keep building without waiting; the rights warranty in Meta terms §16.2 | DBE replies |
| D28 | 2026-10-28 | LOCKED | **Content reader in scope:** a Muse Spark reader turns paper PDFs + memos into structured items with step-level marking guides, self-checks and a human review queue. Public content = our original items + Siyavula CC BY 3.0 material (attribution "From siyavula.com", no Siyavula branding). The open-weight comparison moves to "only if time" (freeze rule) | More legal content variety; strong Meta-tooling and agentic evidence | — |
| D27 | 2026-10-27 | LOCKED | **Legacy is mined, never built on.** Knowledge (marking rules, test ideas, design, research) is re-expressed in our specs; Claude Code is denied read access to the legacy repo and private folders. Every line of product code is written in this repo during the event | Indie "new work only" rule (Participant Guide §4); the legacy history holds private material | After 4 Nov, for porting with tests |
| D26 | 2026-10-27 | LOCKED | **Evaluation before claims:** at least 30 held-out cases scored by a teacher, frozen 31 Oct 12:00; gates G1 (handwriting feasibility, 29 Oct), G2 (demo claim), G3 (open-weight row); counts and intervals always published (`docs/specs/04-quality-security-eval.md`) | 4 legacy golden cases prove nothing | — |
| D25 | 2026-10-27 | LOCKED | **Four public-safe specs replace the seven-spec plan**, and code starts 28 Oct. `docs/plan/00-document-set.md` §3–§4 and §9 are STALE; its rules (§2) stay | The Phase 0 review: docs must not consume the sprint | — |
| D24 | 2026-10-27 | LOCKED | **Meta model use:** Standard model IDs only (never Contributor); prompts carry the item, the guideline and the answer, never personal data | Free credits and Contributor models may use content for product improvement (Meta Billing page, 27 Oct) | — |
| D23 | 2026-10-27 | LOCKED | **The repo goes public now** (history is public-safe). A ruleset on `main` requires a pull request plus passing checks and blocks force-pushes | Free rulesets and secret scanning on public repos only (GitHub docs). Closes Open #8 | — |
| D22 | 2026-10-27 | LOCKED | **Hackathon P0 scope locked** (`docs/specs/02-product-p0.md`): question → typed and handwriting-photo answer (photo gated by G1) → Muse Spark marking with abstention → targeted retry → evidence-linked progress → teacher review, confirm and release → `/evidence`. Freeze: any addition means a same-size cut. Stop rules apply | Rubric fit: Meta tooling 25%; one strong loop. Closes Open #7 | — |
| D21 | 2026-10-27 | LOCKED | **Stack (Stage 2):** the iGezi baseline: Vite 8 + React 19 + Tailwind 4 PWA; Express 5 + Zod 4; Postgres on Railway (EU West) + Drizzle 0.45; Better Auth (email + password only); Railway Bucket; OpenAI SDK pointed at the Meta API; Vitest + Playwright; GitHub Actions; one Railway service. Node 24, pnpm 12, TypeScript 6.0.3 (`docs/specs/01-stack.md`) | No managed option has a South African region, so the baseline is the simplest and most portable. Closes Open #2, #3, #4 (auth for the hackathon), #6 | Before real minors: move data to a South African region |
| D20 | 2026-10-27 | LOCKED (internal-use part SUPERSEDED by D29) | **Content:** the app and the repo use only **original** CAPS-aligned NSC-style items with marking guidelines, verified by a maths teacher. The 10 legacy DBE papers (513 questions) are a **private benchmark** only (aggregate results published) and a pattern reference. A DBE permission request goes out | DBE papers are "Copyright reserved", with no licence; the rules ban assets without rights | DBE grants permission |
| D19 | 2026-10-27 | LOCKED | **Hackathon users are adults only:** teachers, and learners aged 18+ (e.g. adults completing or rewriting matric). The app asks for age attestation at sign-up. Under-18 use is PLANNED, pending Meta's written position or another provider behind the gateway | Meta Model API Terms (9 Oct 2026): end users must be 18+, and no products may target under-18s; the rules ban platform-policy violations. Narrows D10 | Meta written approval, or a provider change |
| D18 | 2026-10-27 | LOCKED | Phase 0 reconciliation approved (founder, 27 Oct): the private pack in `guardian-book-private/phase0/` | — | — |
| D17 | 2026-10-27 | LOCKED | **Judging weights: Impact 30% · Use of Meta tooling 25% · Technical depth 20% · Demo 25%** (Participant Guide §8, verified 27 Oct). Corrects the "equally" in D9 | Verified in the logged-in Participant Guide | — |
| D16 | 2026-10-27 | LOCKED | **The repo must stay publishable.** No company, strategy, legal or pricing documents, personal data or secrets are ever committed. | The repo goes public at the hackathon submission, and git history goes public with it. Company material lives outside the repo. | Never |
| D15 | 2026-10-27 | LOCKED | The vision canon is imported into `docs/vision/` as read-only reference (from legacy `dc3d734`). | One repo to work from; briefs cite it. See `docs/vision/README.md` for what's stale. | — |
| D14 | 2026-10-27 | LOCKED | Planning, specs and reviews happen in the planning session. Claude Code (`fable`) only implements numbered briefs in `prompts/`. T-001 and `prompts/01-kickoff.md` are STALE. | Fable runs on about $200 of promo credit that expires 14 Nov. | Credit or tooling changes |
| D13 | 2026-10-27 | LOCKED | **Meta models are the primary AI path for the hackathon:** the Muse family via the Meta Model API, plus open weights through partner hosts. The model gateway stays provider-agnostic. | "Use of Meta tooling" is a quarter of the judging. | After submission |
| D12 | 2026-10-27 | LOCKED | **Hosting for the hackathon may be overseas.** No real learner data before submission (adult volunteers and fictional learners only). Prefer a South African database for SA learners when one is practical. | Real learner data is unlikely before submission. POPIA s72 cross-border basis to be settled before real learners. | Before the first real learner's data or any pilot |
| D11 | 2026-10-27 | LOCKED | **Design system: Sentinel, latest version** (`docs/vision/DESIGN.md` §v2 + v3 addendum, `docs/vision/design/sentinel/`). The "v2 Sunrise" option is dropped. | Founder ruling. Closes Open #1. | — |
| D10 | 2026-10-27 | LOCKED | **Release 1 serves learners and teachers.** The guardian/parent plan comes next. | Founder ruling. The hackathon slice drops the guardian Help Plan from P0. | After the hackathon |
| D9 | 2026-10-27 | LOCKED | **Guardian Book is the Meta Global AI Developer Hackathon entry** (Indie, solo). Roam & Nest is not entered in Meta; it is in the World's Biggest Business Competition. | Submit by 20:00 SAST 4 Nov (official close 04:00 SAST 5 Nov). Product code written during the event; public repo at submission. ~~Judged equally~~ (corrected by D17: 30/25/20/25). | — |
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
| 2 | ~~Frontend framework and repo layout~~ | — | Decided: D21 |
| 3 | ~~Railway service layout~~ | — | Decided: D21 (one service + Postgres + Bucket) |
| 4 | Guardian consent flow for minors | CTO + Mozey + attorney | Hackathon is adults only (D19). Re-open before any minor uses the product |
| 5 | Data residency for real learners | CTO + attorney | Hackathon: D12. Re-open before real learners (ADR-0003) |
| 6 | ~~Model providers~~ | — | Decided for the hackathon: D13, D24. Under-18 provider strategy re-opens with Open #4 |
| 7 | ~~First vertical slice~~ | — | Decided: D22 |
| 8 | ~~Branch protection~~ | — | Decided: D23 |
| 9 | ~~Stage 1 document set~~ | — | Superseded by D25 |
| 10 | Positioning: keep DESCRIPTION v2.1 as canonical; "Every learner understood. Every next step clearer." as consumer copy only | Mozey | Default until after the hackathon |
| 11 | Prize stacking; whether an open-weight evaluation qualifies; agentic autonomy with human approval | Organisers (Discord) | Questions drafted in the private pack |
| 12 | **Teacher Studio as the Meta-powered core of the entry** (P0 v2: paper setup with the reader → script intake → grounded marking → class misconceptions → agent-drafted interventions → review, release, learner feedback sheets; no learner accounts in the hackathon) | Mozey, on the CTO's assessment (recommended) | Changes D22 and parts of `docs/specs/02-product-p0.md`. B01 is unaffected |
| 13 | Can a teacher-facing product send school learners' scripts (minors' work) to Meta's API, and does releasing feedback to learners make them end users? | Meta (office hours) | Doesn't block the hackathon (synthetic data only) |
