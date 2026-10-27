# Brief 01 — Kickoff: architecture proposal and first-slice plan (task T-001)

You are the implementer on Guardian Book. This task is **planning only**: no application
code, no package installs, no scaffolding, no config beyond the docs listed below.
It ends with documents for Mozey to approve.

## 1. Load context (targeted reads — this session is paid per token)
1. `CLAUDE.md` — binding rules. They override anything else you read.
2. `docs/decisions.md` — what's decided and what's open.
3. `docs/TASKS.md` — set T-001 to `doing`.
4. `docs/pack/` — the pre-development pack, if present. Read the PRD, technical
   specification, UI/UX flow plan, evaluation plan and risk & compliance documents in full;
   skim the rest. Where the pack conflicts with `docs/decisions.md`, decisions win — list each
   conflict you find.
5. `../guardian-book-legacy/`, if it exists next to this repo. Data and lessons only:
   look at the structure of `tools/ingest/data/structured/` (sample one paper file — don't read
   them all), `tools/evals/`, `tools/rls-tests/`, `docs/marking-pipeline.md`, and the
   "Known traps" section of its `CLAUDE.md`. Don't read or port its UI or app code.

You may use web search to check current facts that affect a decision (e.g. Railway regions,
framework versions, POPIA guidance). Cite what you used.

## 2. Write `docs/architecture.md`
A proposal, not a ruling. For each open decision (#2–#6 in `docs/decisions.md`) give 2–3
options with honest pros and cons, then one recommendation and why. Cover:

- **System overview** — a Mermaid diagram of clients, services on Railway, database,
  file storage, model gateway, background jobs.
- **Repo layout** — folders and what lives where.
- **Data model outline** (tables and key fields, not SQL): learners, guardians and their
  links, consent records, schools, classes, teachers, subjects, papers, questions (faithful to
  the printed paper — layout, maths, diagrams), memos, attempts (typed and handwritten canvas
  input), proposed vs teacher-confirmed marks, releases, private-practice sharing, erasure.
  Show how each binding rule in `CLAUDE.md` is enforced by the structure itself.
- **Permissions** — a role × data matrix (learner, guardian, teacher, school admin) and how
  it is enforced server side and tested.
- **Model gateway** — interface, provider-agnostic design, prompt/model pinning, schema
  validation, untrusted-input handling, eval hooks, cost controls.
- **Question rendering** — how a past-paper question will look exactly like the printed
  paper on a small phone (maths typesetting, diagrams, mark allocations).
- **Phone and data reality** — PWA install, offline study of downloaded papers, page-weight
  and data budgets for a mid-range Android on patchy mobile data.
- **Theming** — the token structure that lets design system v1 or v2 drop in unchanged.
- **POPIA** — consent flow for minors, data minimisation, erasure end to end, where each kind
  of data is stored and the cross-border implications.
- **Testing** — unit, permission tests per role, golden-set evals for marking, and the
  "works on Mozey's phone" check.
- **Environments and deployment** — local, preview, production on Railway; secrets; CI that
  builds without secrets.
- **Risks** — what could sink this, contradictions you found, and what you'd cut.

## 3. Write `docs/plan-slice-1.md`
The smallest end-to-end slice that is genuinely useful to a real learner on a real phone.
Propose two candidate slices, recommend one, then for the recommended slice give:
- the user journey, screen by screen (learner first; what the guardian sees, if anything);
- acceptance criteria Mozey can check on his phone;
- what is deliberately out of scope;
- a task breakdown (T-002, T-003, …), each small enough for one commit, in dependency order,
  each with its own test;
- a **demo cut line**: if Mozey has to show it by a fixed date (there may be a competition
  deadline in early November 2026), which tasks make the cut and which wait.

## 4. Update `docs/TASKS.md`
Set T-001 to `review`. Add the proposed tasks under "Next", marked `proposed`. Add any
questions for Mozey or the planning session under "Questions", linked to a task ID.

## 5. Finish
- One commit containing only the docs changes, following the commit rules in `CLAUDE.md`.
- In your reply: a short summary, the decisions Mozey needs to make (numbered, each with
  your recommendation), and anything that blocked you. Then stop — don't start T-002.
