# 01 · Review of the ChatGPT "AI-First Engineering Operating System" blueprint

**Status:** v1 · 27 Oct 2026 · written by the planning session for Mozey.
**Input:** *AI_First_Engineering_Blueprint_Claude_Cowork_Handoff.md* (ChatGPT, 27 Oct 2026).
**Result:**
- What we adopt is folded into `00-document-set.md` v1.1 (§8 there).
- What we don't adopt is listed below with the reason.

## 1. Verdict

**Strong:**
- Evidence over claims ("never claim a check you didn't run").
- Every rule we can't afford to break is enforced in CI and settings rather than prose.
- A risk-tiered effort model.
- An independent reviewer with fresh context.
- The "change the ID, can you see someone else's data?" test.
- Honest warnings about AI-specific threats: hallucinated packages, prompt injection, false
  confidence.

It agrees with Anthropic's own guidance and with how we already run iGezi.

**Weak for us right now:**
- It is written to be reusable across ventures, and asks for a full research audit and an
  operating system *before* the project. We have one live project, 8 days to a
  submission, and about $200 of Claude Code credit.
- It also recommends ten separate documents, seven skills and a default Next.js + Supabase
  stack. Each of those costs tokens or time without buying anything we need in the next
  8 days.

**Missing:**
- The hackathon itself: the judging rubric, the public-repo and new-work rules.
- The cost model of a per-token coding agent: the cache lasts about 5 minutes on an API key,
  and context gets re-read every turn.
- PWA specifics: stale bundles, offline.
- Exam-content fidelity and the AI marking accuracy gate.
- Children's consent under POPIA s35.

## 2. Adopted (and where each lands)

| From the blueprint | Where it lands |
|---|---|
| "Never claim a test, scan or action that didn't run"; completion report: files, requirements covered, commands and real output, security notes, gaps, approvals needed | Brief template (doc 11), mandatory section |
| Feature spec fields: roles and permissions, failure/edge cases, data dependencies, verification by layer | Product spec (doc 4) requirement block and brief template |
| Risk tiers (low / medium / high) setting the depth of checks, with baseline checks always on | Brief template carries a tier. High = auth, consent, minors' data, marking, migrations, deploys. Quality spec (doc 7) defines the extra checks per tier |
| The authorization test: change a resource or class ID and you still can't read or modify other people's records | Architecture and data (doc 5) permission matrix; a required integration test per role |
| Independent reviewer: read-only tools, works from the spec and the diff, reports by severity, no style nitpicks | `.claude/agents/reviewer.md` (doc 11). The planning session also reviews every brief before merge |
| CI hardening: pinned third-party actions, least-privilege `GITHUB_TOKEN`, frozen lockfile, no secrets to pull requests, stable job names, separate deploy path | Quality and delivery (doc 7) |
| Release checklist; smoke test after every deploy; "a backup never restored is unverified" | Doc 7, alongside our phone test and fresh-tab check |
| AI-assisted development threats: verify every new package (name, maintainer, advisories), treat repo and web text as untrusted, no production credentials anywhere the agent runs | `CLAUDE.md` engineering rules plus the security spec (doc 6) |
| Product-AI protections: prompt injection, output validation, spend caps, fallbacks, evals (OWASP Top 10 for LLM applications) | AI and content (doc 8) and doc 6 |
| MFA on every privileged account | Founder action: GitHub, Railway, Anthropic Console, Meta developer account |
| A small scorecard instead of dashboards: lead time per brief, escaped defects, cost per brief, critical-flow completion | Build plan (doc 10) |
| "Distinguish current implemented state from desired state" | START-HERE "Current reality" (already) and spec headers |
| One pull request per brief; merge only on green CI | Doc 7 (matches our iGezi rule) |

## 3. Adapted

| Blueprint says | We do instead | Why |
|---|---|---|
| Ten separate docs (PRD, architecture, data model, security, design system, API spec, test strategy, deployment, runbook, decisions) | Seven specs plus START-HERE, the log and the build plan, merged where the content travels together | Fewer files means fewer re-reads per brief and less review overload (Böckeler). Same coverage |
| Default stack: Next.js + Supabase + Prisma or Drizzle | Stage 2 starts from the iGezi baseline (Express 5 + Drizzle + Postgres 16 on Railway, Vite + React + Tailwind) and replaces a layer only with a clear reason | Founder instruction; proven on iGezi; the blueprint itself calls its stack "a candidate, not a mandate" |
| Seven reusable skills | Two to start: the brief workflow (in the template) and a migration skill. More only when a task repeats | The blueprint's own advice: add skills when work repeats |
| Hooks as a general mechanism | Only fast deterministic hooks: a Stop hook (typecheck + unit tests) and a PreToolUse block on applied migrations and `.env`. Everything heavy runs in CI | Keeps the agent's feedback loop fast, as the blueprint itself warns |
| GitHub rulesets with required checks | Rulesets on private repos need GitHub Pro/Team (GitHub docs). Options: go public early (free), pay about $4 a month for Pro, or CI discipline until submission | Founder decision (Open #8) |
| Development / staging / production separation | Local plus production, with Railway preview environments per pull request if Stage 2 confirms them. A full staging environment after the hackathon | One founder, 8 days, no real learner data before submission |

## 4. Deferred

| Item | Revisit when |
|---|---|
| A reusable cross-venture "AI Engineering OS" as its own deliverable | After 4 Nov: extract it from what worked on iGezi and Guardian Book |
| The full research-verification table (Part 20 B) | Only claims that change a decision get verified, at the stage that needs them |
| CodeQL / Semgrep | When the repo goes public: CodeQL is free for public repos. Until then, gitleaks and the package-manager audit |
| Feature flags, canary releases, infrastructure-as-code, SLOs, load tests, multi-region | Before the first school pilot, if the risk calls for it |
| Formal privacy audit and vendor assessments | Attorney packet, before real learners |

## 5. Rejected

| Item | Why |
|---|---|
| "Do not assume any venture is active" | Guardian Book is the active project (D9) |
| Waiting for a complete operating system before any project work | It conflicts with the deadline, and with the blueprint's own "deliver a vertical slice early" |
| `bypassPermissions` or broad agent access for speed | Never. The Fable runner asks before shell commands; deny rules cover secrets |

## 6. Corrections and confirmations (verified 27 Oct 2026)

| Claim | Result | Source |
|---|---|---|
| OWASP ASVS 5.0.0 is the current stable release (May 2025) | Confirmed | asvs.owasp.org; Global AppSec EU 2025 |
| Rulesets: "capabilities depend on plan" | Sharper: private repos need Pro, Team or Enterprise; public repos are free | docs.github.com, *About rulesets* |
| Keep `CLAUDE.md` short; enforce no-exception rules with hooks, deny rules and CI; independent review against the spec | Confirmed; under 200 lines recommended | code.claude.com/docs/en/best-practices |
| Cost guidance | Missing from the blueprint: the prompt cache lasts about 5 minutes on an API key, which matters for Fable | Same source |
| Environment check (Part 0, item 4) | Done in §7 | — |

## 7. What actually works in this environment (checked 27 Oct 2026)

| Surface | Status |
|---|---|
| This planning session can read and write `~/Projects/guardian-book`, `~/Projects/guardian-book-legacy`, `~/GitHub/*` and the Dan Vega folder | Verified |
| It can run a Linux shell, use git locally, search and fetch the web, and use Chrome | Verified |
| It **cannot push to GitHub** (no credentials here) | Verified. It commits locally; Mozey runs `git push` |
| Claude Code runs on Mozey's Mac as `fable` (Agent SDK, promo key, $20 default cap per session) | Founder-confirmed; not run from here |
