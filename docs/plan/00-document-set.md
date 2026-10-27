# 00 · The document set for the build (Stage 1)

> **Partly STALE (D25, 27 Oct night).** The document list, order and schedule (§3, §4, §9)
> are replaced by four specs in `docs/specs/` and the board in `docs/TASKS.md`. The rules
> in §2 and the research in §1 still apply.

**Status:** PROPOSED v1.1 · 27 Oct 2026 · written by the planning session for Mozey's approval.
v1.1 adds the ChatGPT blueprint adoptions (§8) and the compressed hackathon schedule (§9).
**Depends on:** the vision canon in `guardian-book-legacy/docs` (October 2026). Housekeeping
item H1 imports it into this repo.
**What it decides, once approved:**
- which documents get written before any code;
- in what order;
- where each one lives;
- which ones wait until the build needs them.

---

## 1. What the research says, and what we take from it

| Source | Finding | What we do |
|---|---|---|
| Anthropic, *Best practices for Claude Code* (code.claude.com/docs/en/best-practices) | Write down only what the agent can't find in the repo, and keep `CLAUDE.md` short (under 200 lines). Give it a pass/fail check, and ask for evidence such as the command and its output. Rules that can't have exceptions belong in hooks, deny rules and CI, not prose. Have something that didn't write the code review it against the spec. Unattended runs need five things: a definition of done, a self-check, limited reach, a spend cap and a human sign-off. | Two layers of documents: a short always-loaded layer, and specs read on demand. Every brief carries its checks and the evidence to report. Binding rules become hooks or CI. The CTO reviews every brief against its spec before merge. |
| Same source, cost notes | On an API key the prompt cache lasts about **5 minutes**. Every turn re-sends the conversation. | One brief per fresh session, run without idle gaps. Specs have numbered sections so a brief cites "§3.2" and Fable reads only that. |
| Böckeler, *Understanding Spec-Driven Development: Kiro, spec-kit and Tessl* (martinfowler.com, Oct 2025) | Separate the "memory bank" (product, tech and structure context) from per-feature specs. Verbose spec sets create review overload and a false sense of control; small iterative steps keep control. | Lean specs: tables, testable acceptance criteria, no padding. Specs are written per slice, just in time, not all up front. |
| GitHub Spec Kit (github.com/github/spec-kit) | A constitution of non-negotiable principles, then specify → plan → tasks → implement, reviewing each step before the next. | Our constitution is `CLAUDE.md` plus the decision log. Each slice goes product spec → design sections → numbered briefs → build → review. |
| Kiro, via Böckeler | Requirements as user stories with GIVEN/WHEN/THEN acceptance; a design document; tasks traced back to requirement numbers. | Product spec requirements get IDs (e.g. `R1.3`) and GIVEN/WHEN/THEN criteria, and every brief lists the IDs it satisfies. |
| Dan Vega, *Claude Code Tasks: Stop Babysitting Your AI Agent* (Feb 2026, in the Dan Vega folder) | Plan in a PRD, split it into tasks with explicit blocked-by links, avoid context rot with fresh sessions and subagents, and capture what you learn in `CLAUDE.md` or skills. | `TASKS.md` carries a blocked-by column. Each trap we hit becomes one line in "Known traps". |
| Nygard, *Documenting Architecture Decisions* (2011); the C4 model (c4model.com) | Record each significant decision with its context, options, consequences and status. Diagram the system at context and container level. | ADR files for stack and architecture decisions. Two C4 diagrams in the architecture spec, and no more. |
| OWASP ASVS 5.0.0 (May 2025) | A verifiable security requirements standard with three levels. | The security spec picks the ASVS Level 2 chapters relevant to us as checklist items, not the whole standard. |
| POPIA Regulations, reg. 4 (in force since 1 May 2021) | The Information Officer must make sure a personal information impact assessment is done. | The privacy spec *is* our impact assessment draft, for the attorney to review. |
| How we run iGezi (`igezi-landing` docs) | One file per locked decision, build specs (data model, API, screens), numbered briefs, runbooks, an integration-test harness on throwaway databases, and CI running gitleaks, typecheck and integration tests. | We carry all of it over, scaled down to one founder and one agent. |

## 2. Rules that apply to every document

1. **Header.** Every document opens with: version, date, status
   (`DRAFT`/`APPROVED`/`STALE`), what it supersedes and what it depends on.
2. **Which wins.** `docs/decisions.md` outranks every spec and all code. If a spec and
   the log disagree, the log wins and the conflict is raised in `TASKS.md`.
3. **Written against the real stack.** Specs name real tables, packages, routes and
   commands. Nothing generic.
4. **Testable.** Every requirement has an ID and a GIVEN/WHEN/THEN criterion. Every
   brief names its tests and the evidence to report.
5. **Sized for the agent.**
   - Numbered sections, tables before prose.
   - A target of 400 lines or fewer per spec. Split it if it grows past that.
   - Briefs cite sections; they never say "read the docs".
6. **Spec-anchored.** A brief that changes behaviour updates its spec section in the
   same commit. A spec section nobody keeps current gets marked `STALE`.
7. **Rules without exceptions live in configuration:** `.claude/settings.json` deny
   rules and hooks, CI jobs and branch protection. Prose only explains them.

## 3. The set, in the order we write it

"Have" means what already exists that covers part of the job. The vision canon lives in
`guardian-book-legacy/docs` until H1 imports it.

### H · Housekeeping, before Stage 2 (no new writing)

| # | Item | Why |
|---|---|---|
| H0 | **Back up, don't work from:** push the 28 unpushed commits in `~/GitHub/guardian-book-legacy` to the retired `guardian-book-legacy` GitHub repo, after repointing its remote (founder paste block in START-HERE). We build only in `guardian-book` (D8); this is purely an off-laptop backup of the company documents, which must never enter the public repo (D16) | The company documents (BUSINESS_PLAN, QUESTION_BANK, META_* and others) exist only on the laptop. That folder's remote still points at the old name, which GitHub now resolves to the NEW repo. A normal push would be refused (unrelated histories); a force push would overwrite the new repo |
| H1 | **Done 27 Oct.** Import the vision canon into `docs/vision/` as read-only reference (list in §5) | Builders and briefs cite it. It replaces `docs/pack/`, which waited for the July pack that October superseded |
| H2 | **Done 27 Oct.** Mark STALE: `prompts/01-kickoff.md` and T-001 (planning moved to this session to save Fable budget); `docs/pack/README.md`; the README line calling Guardian Book a "companion" (contradicts DESCRIPTION.md) | Stops a paid session from running the old kickoff |

### The documents

**1. `START-HERE.md`** (repo root)
- **Purpose:** the first read of every session: current reality, the live tracker, open
  decisions, the next action.
- **Must contain:**
  - what exists today (verified);
  - the stage and slice in progress;
  - the brief queue with statuses;
  - open decisions with owners;
  - the budget left;
  - the last session's handover (5 lines).
- **Depends on:** the decision log.
- **Have:** nothing.
- **Size and timing:** one page; **v0 now**, updated at the end of every session.

**2. `docs/decisions.md` plus `docs/adr/ADR-NNNN-*.md`**
- **Purpose:** the register of every ruling, with status, and the reasoning behind
  architectural ones.
- **Must contain:**
  - register columns: ID, date, status (`LOCKED` · `OPEN` · `STALE` ·
    `SUPERSEDED by …`), decision, why, re-open trigger;
  - an ADR file for any decision that had options: context, options, decision,
    consequences.
- **Depends on:** nothing.
- **Have:** `decisions.md` with 7 decided and 7 open. It is missing the October rulings:
  whole learner and the Care Protocol, the evidence engine, grows-with-you, pricing,
  marketplace gates.
- **Size and timing:** the register stays short; written with Stage 2.

**3. `docs/specs/01-stack.md` plus ADRs** (Stage 2)
- **Purpose:** one choice per layer, each with the reason it beat the alternatives.
- **Must contain:**
  - the requirements that drive the stack, taken from the vision;
  - per layer, 2–3 options scored on cost, speed, agent-friendliness, phone and data
    fit, POPIA and residency, and lock-in;
  - the pick per layer;
  - versions and prices, with citations;
  - the iGezi baseline kept or replaced, with reasons.
- **Depends on:** the vision and the decision log.
- **Have:** TECH.md v3 (old Supabase/Next stack: a reference, not a baseline) and the
  iGezi stack.
- **Size and timing:** about 300 lines; Stage 2.

**4. `docs/specs/02-product.md`** (PRD v3)
- **Purpose:** what release 1 is and who it serves, broken into slices.
- **Must contain:**
  - release-1 goal and success measures;
  - users and roles;
  - slices in order;
  - per slice: user journeys, requirements with IDs and GIVEN/WHEN/THEN criteria, and
    explicit non-goals;
  - the binding rules mapped to requirements;
  - the content scope (Maths, which papers).
- **Depends on:** the vision and the stack.
- **Have:** legacy PRD v2 (stale); SCREENS v3, FEATURES rulings, VALUE_BY_AUDIENCE,
  WHOLE_LEARNER, META_HACKATHON P0 (all in the canon).
- **Size and timing:** about 400 lines, distilled rather than invented; next after the
  stack.

**5. `docs/specs/03-architecture-data.md`**
- **Purpose:** how the system is built and where data lives.
- **Must contain:**
  - C4 context and container diagrams;
  - module boundaries;
  - key request flows (practice → mark → evidence; scan → confirm → release; consent;
    erasure);
  - the data model: every table, column, constraint and retention rule;
  - the role × data permission matrix, and how each binding rule is enforced by
    structure;
  - API conventions: auth, errors, idempotency, rate limits, zod contracts in a shared
    package;
  - migration policy;
  - seed data.
- **Depends on:** the stack and the product spec.
- **Have:** TECH §3/§3a (evidence engine), WIRE_DIAGRAMS, legacy `schema.sql`,
  `tools/rls-tests` (ideas), iGezi build-spec-01/02 as patterns.
- **Size and timing:** about 400 lines; before the first code brief.

**6. `docs/specs/04-privacy-safety-security.md`**
- **Purpose:** the POPIA impact assessment draft, the threat model and the safety rules.
- **Must contain:**
  - a data map: every piece of personal information, its purpose, the store and
    **region** it lives in, retention, who sees it;
  - the consent flow for minors;
  - erasure end to end;
  - cross-border transfer basis (s72);
  - logging policy (no personal information or answers in logs);
  - secrets;
  - a threat model of the key flows (STRIDE);
  - selected ASVS L2 items;
  - breach response (s22);
  - the Care Protocol essentials (from WHOLE_LEARNER §4);
  - questions for the attorney.
- **Depends on:** the stack and architecture.
- **Have:** TECH §6–7, WHOLE_LEARNER §4, FEATURES §4.28 and §4.33, legacy
  `attorney-email.md` and `erase-user.mjs`.
- **Size and timing:** about 300 lines. **The minimum before the first code brief:**
  data map, consent, erasure, secrets. The rest before any real learner's data.

**7. `docs/specs/05-quality-delivery.md`**
- **Purpose:** how code is proven, shipped and kept alive.
- **Must contain:**
  - **Tests:** unit; integration against a fresh database; permission tests per role;
    golden evals; end-to-end tests at phone size; performance budgets for a mid-range
    Android on 3G; accessibility checks.
  - **CI:** gitleaks, typecheck, lint, unit, integration, end-to-end, building the real
    production image. Merge only on green CI.
  - **Deploy:** a merge is a Railway deploy; migrations go snapshot → migrate → merge →
    catch-up, additive only; local env never points at production; startup config checks;
    idempotent seeds.
  - **PWA updates:** the service-worker update strategy and a fresh-tab check after each
    deploy.
  - **Backups:** schedule and a tested restore drill.
  - **Monitoring:** error tracking and alerts.
  - **Incidents:** response and rollback.
  - **Done:** the definition of done, including the phone test.
- **Depends on:** the stack.
- **Have:** the legacy testing doctrine and known traps; iGezi CI, integration-testing,
  runbooks; EXECUTION.md.
- **Size and timing:** about 300 lines; before the first code brief (the first brief
  builds CI).

**8. `docs/specs/06-intelligence-content.md`**
- **Purpose:** the model gateway, marking, the Brain v0 and content.
- **Must contain:**
  - **Gateway:** interface, model and prompt pinning, schema validation, untrusted-input
    rules, cost caps per learner and per day.
  - **Marking:** prompt rules, method marks, consistent-accuracy follow-through, fail
    closed.
  - **Golden sets:** format, gate (≤2% confidently wrong), fairness slices.
  - **Evidence engine v0:** events, mastery, beliefs.
  - **Tutor boundary.**
  - **Content pipeline:** ingest → human review → load; question rendering faithful to
    print (maths, diagrams); provenance.
- **Depends on:** architecture and the product spec.
- **Have:**
  - legacy `marking-pipeline.md`, `tools/evals` (only 4 golden cases, far too few) and
    `tools/ingest`;
  - **10 structured papers, 513 questions on disk.** Legacy notes say 11 papers and 519
    questions; reconcile before relying on them;
  - AI_PEDAGOGY, RESEARCH_LEARNING_SCIENCE, TECH §3a.
- **Size and timing:** about 400 lines; before the first practice or marking brief.

**9. `docs/specs/07-screens-design.md`**
- **Purpose:** each screen in the slice, and the tokens.
- **Must contain:**
  - per screen: purpose, layout, states (empty, loading, error, offline), copy,
    acceptance criteria;
  - the token set (colour, type, space, radius, motion) as the only styling source;
  - Mobbin references;
  - the phone-size checklist.
- **Depends on:** the product spec, and **the design system ruling (v1 or v2)**.
- **Have:** SCREENS v3 (22+ screens), DESIGN.md (binding rules), DESIGN_BRIEF, the
  Sentinel identity.
- **Size and timing:** about 300 lines per slice; before the first UI brief.

**10. `docs/plan/build-plan.md`, with `docs/TASKS.md`**
- **Purpose:** what gets built when, and what it costs.
- **Must contain:**
  - slices broken into briefs, each with blocked-by links;
  - a demo cut line per date;
  - a Fable budget per brief and which model;
  - the risk register;
  - the dates that matter (14 Nov credit expiry; hackathon if any; pilot term).
- **Depends on:** documents 4–9.
- **Have:** legacy TASKS tracks M and R (stale), META_HACKATHON §10.
- **Size and timing:** about 150 lines; before the first code brief.

**11. `prompts/00-brief-template.md`, plus `.claude/` harness config**
- **Purpose:** the shape of every Claude Code brief, and the rules the harness enforces.
- **Must contain:**
  - **Template sections:** task ID and requirement IDs; spec sections to read (exact
    list); goal; in and out of scope; steps; acceptance criteria; tests to add; commands
    to run; evidence to report (commands and their output); budget cap; stop condition;
    what's off-limits.
  - **Harness:** deny rules (`.env`, production URLs); a Stop hook (typecheck and tests);
    a block on editing applied migrations; a read-only reviewer agent.
- **Depends on:** documents 3, 5 and 7.
- **Have:** `prompts/01-kickoff.md` (pattern); `.claude/settings.json` (deny `.env`,
  attribution off).
- **Size and timing:** about 80 lines; before the first code brief.

**12. `CLAUDE.md` (rewrite)**
- **Purpose:** the short always-loaded guide.
- **Must contain:**
  - the commands (install, test, single test, typecheck, run);
  - binding rules (one line each, pointing to the hook or test that enforces them);
  - where specs live;
  - known traps.
- **Depends on:** documents 3, 5 and 11.
- **Have:** the current `CLAUDE.md` (good bones; it has no commands yet).
- **Size and timing:** under 200 lines; last, just before the first code brief.

## 4. The smallest set that keeps us fast

**Before the first line of code (the core nine):**
- START-HERE (1);
- the decision log and ADRs (2);
- the stack (3);
- the product spec for slice 1 (4);
- architecture and data (5);
- the privacy minimum (part of 6);
- quality and delivery (7);
- the build plan (10);
- the brief template and harness (11);
- `CLAUDE.md` (12).

**Just in time, before the slice that needs them:**
- intelligence and content (8), before the first practice or marking brief;
- screens and design (9), before the first UI brief;
- the full privacy spec (6), before any real learner's data.

**Merged on purpose,** compared with a standard enterprise set:
- architecture, data model and API conventions are one document;
- testing, CI/CD and operations are one document;
- AI and content are one document.

**Deliberately skipped, and why:**

| Skipped | Why |
|---|---|
| A separate API reference | Contracts live as zod schemas in a shared package, which is the source of truth, plus a table in 03 |
| A separate test plan | It's inside 05 |
| Personas and market docs | They're in the vision canon |
| A Gantt chart | The build plan's tables do that job |
| A release plan | Merge = deploy |

**Later, not before code:**
- runbooks, split out of 05 as operations grow;
- the privacy notice, terms and parent consent copy (attorney), before the first real
  learner;
- the pilot playbook, before the first school;
- the metrics plan, part of the evidence engine in 08 until it grows.

## 5. Vision canon to import into `docs/vision/` (H1)

**Import (product truth the build cites):**
- DESCRIPTION
- GUARDIAN_BOOK
- VALUE_BY_AUDIENCE
- FEATURES (rulings 4.1–4.33)
- WHOLE_LEARNER
- SCREENS
- DESIGN
- DESIGN_BRIEF
- RESEARCH_LEARNING_SCIENCE
- AI_PEDAGOGY
- DATA_AND_AI
- SITEMAP
- WIRE_DIAGRAMS
- TECH (marked: architecture STALE, §3a evidence engine still binding until 03 replaces
  it)

**Leave in the legacy repo (company material, not build input):**
- BUSINESS_PLAN and business_model.py
- QUESTION_BANK
- META_HACKATHON and META_FORMS
- HACKATHON
- VISION_FULL (pointer only)
- PRD v2
- legacy TASKS, FOUNDER_RUNBOOK, SETUP_RUNBOOK
- attorney-email

## 6. What bites later, and the document that prevents it

| Failure (most seen before, in the legacy build or iGezi) | Prevented in |
|---|---|
| CI green while the product is broken | 05: end-to-end golden paths at phone size in CI; the phone test before "done" |
| Builds crash with no env; local passes, CI fails | 05 and CLAUDE: zero-env rule, secret-free CI build |
| Lockfile and package-manager drift breaks CI | 01 and 05: exact toolchain pins |
| Learner data stored abroad with no lawful basis | 01 and 04: data map with regions, s72 basis |
| Personal information collected before consent | 03 and 04: consent gate in the schema, tested |
| Erasure leaves copies behind | 03, 04 and 05: erasure test across every store |
| Phones serve a stale PWA after deploy | 05: service-worker update strategy, fresh-tab check |
| A migration breaks production | 05: additive only; snapshot → migrate → merge → catch-up |
| Backups exist but never restore | 05: scheduled restore drill with a date |
| Secrets or answers end up in logs | 04 and 05: log policy, gitleaks, redaction test |
| AI marks confidently wrong | 06: golden gate per subject, fail closed |
| Model spend runs away | 01 and 06: gateway caps per learner and per day |
| Fable budget burned on rediscovery | START-HERE, a short CLAUDE.md, briefs citing sections |
| Prompt injection through scanned answers | 06: untrusted-input rules and an injection golden case |
| The visibility, marker-of-record or no-surveillance rules quietly broken | 03: permission matrix with tests per role |

## 7. Budget note for Claude Code (Fable 5.1 on the promo)

**Price:** $10 per million input tokens, $50 per million output; the $200 credit expires
14 Nov. The repeated re-reading of context dominates the cost.

**Rules:**
- Planning, specs and reviews happen in this session, never in Fable.
- One brief = one fresh session, run straight through: the cache dies after about 5
  idle minutes.
- Every run has `--budget` or `--max-budget-usd` set.
- Use Sonnet 5.5 ($2/$10) for bulk or mechanical briefs, Fable for hard ones. The build
  plan assigns a model per brief.

## 8. Adopted from the ChatGPT blueprint (v1.1; full review in `01-blueprint-review.md`)

| Document | Addition |
|---|---|
| 4 · Product | Each requirement block gets: roles and permissions, failure/edge cases, data dependencies, and verification by layer |
| 5 · Architecture and data | A mandatory "change the ID" authorization test per role and per resource |
| 6 · Privacy, safety and security | AI-assisted development threats (package verification, prompt injection from repo or web text, no production credentials where the agent runs); OWASP Top 10 for LLM applications for marking and the tutor; MFA on every privileged account |
| 7 · Quality and delivery | Risk tiers that set the depth of checks; CI hardening (pinned actions, least-privilege token, frozen lockfile, no secrets to pull requests, stable job names); release checklist; smoke test after each deploy; one pull request per brief |
| 10 · Build plan | A small scorecard: lead time per brief, escaped defects, cost per brief, critical-flow completion |
| 11 · Brief template and harness | Risk tier; a completion report (files, requirements covered, commands and real output, security notes, gaps, approvals needed); a read-only reviewer agent; a migration skill |

## 9. Hackathon schedule (D9: Guardian Book is the Meta entry; submit 20:00 SAST 4 Nov)

**The stages compress.** Each document is still approved before the next, but approvals
need to come within hours, not days.

| Day | Documents and work | Code |
|---|---|---|
| Tue 27 Oct | Stage 1 closed; housekeeping (H0–H2) done | — |
| Wed 28 Oct | Stage 2 stack (morning) → 02 product: the hackathon slice (midday) → 03 architecture and data (evening) | — |
| Thu 29 Oct | 04 privacy minimum, 05 quality and delivery, build plan, brief template, CLAUDE.md | Brief 02: scaffold, CI, deploy skeleton, health check |
| Fri 30 Oct – Mon 2 Nov | 06 AI and content, then 07 screens, each just before its briefs | Slice briefs: past-paper practice faithful to print; answer by typing or canvas; Meta-model marking with the accuracy gate; evidence engine and Brain page; teacher scan → confirm → release; open-weights evaluation |
| Tue 3 Nov | Video script, evidence page | Phone test, fixes, record the demo |
| Wed 4 Nov | Submission package; repo goes public | Freeze by 18:00, submit by 20:00 SAST |

**What we build to:** the judging rubric. Impact, Use of Meta tooling, Technical depth and
Demo carry equal weight. The video shows only work built during the event.

**What gives if time runs short:** scope sheds before the date (CLAUDE.md rule 6). The
build plan sets the cut line.
