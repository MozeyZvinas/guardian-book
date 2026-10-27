# 02 · Product: hackathon P0 scope, cut list and acceptance tests

**APPROVED 27 Oct 2026 (D22, D19, D20).** Locked; changes need a same-size cut and the
founder's approval.
**Rests on D19–D23** (adults only, original content, iGezi stack, photo gated into P0,
public repo).

## 1. What we show the judge, in one sentence

An adult learner photographs or types their working on an NSC-style maths question. Muse
Spark reads each step against a human-written marking guideline, marks it, shows **where on
their own handwriting** the mark was lost, and says when it is unsure instead of guessing.
The learner gets a targeted next question. Their teacher reviews, corrects and releases the
marks, and every claim is backed by a published evaluation.

## 2. Users in this build (adults only, per D19)

| Role | Who | Can | Cannot |
|---|---|---|---|
| Learner | 18+; fictional demo accounts plus consenting adult volunteers | Practise, submit own attempts, see own feedback and progress, see teacher-released marks | See other learners; release marks |
| Teacher | Adult; demo account | See their own class's attempts, adjust and confirm, release, see class gaps | See other classes |
| Admin | Founder only | Load reviewed content, read evaluation runs | Act as a teacher without logging the reason |

Age check: sign-up asks "I am 18 or older" (required). This is a self-declaration, not
verification, and the README says so. Parents and schools appear only as **PLANNED** in the
video and README.

## 3. P0: must ship (each item is a requirement with an ID)

| ID | Requirement | Acceptance tests (GIVEN / WHEN / THEN) |
|---|---|---|
| **P0-01** Sign-in and roles | Email + password (Better Auth), required age attestation, seeded demo accounts (learner A, learner B, teacher of class 1, teacher of class 2) | GIVEN a new user WHEN they don't tick 18+ THEN no account is created · GIVEN a learner session WHEN they call any teacher endpoint THEN 403 · Seeds are idempotent (run twice → same rows) |
| **P0-02** Question viewer | Original CAPS Grade 12-style items with marks, topic, provenance ("Guardian Book original · CAPS topic · reviewed by …"). Maths rendered with KaTeX; diagrams as SVG/PNG | GIVEN an approved item WHEN opened at 360px THEN the question, marks and provenance are readable with no horizontal scroll · GIVEN an unapproved ID THEN 404 · Unit test: the marking guideline is never returned to the learner before an attempt exists |
| **P0-03** Typed attempt → assessment | Attempt saved first (idempotency key). The server calls `muse-spark-1.3` (Standard) through the gateway with item, guideline and attempt, using a JSON schema. The server validates bounds, step IDs and totals. Result status: `proposed` / `uncertain` / `failed`. A timeout or malformed output gives `uncertain` (needs review) and never an invented mark | Unit: malformed, out-of-range and unknown-step outputs are rejected → `uncertain` · Unit: a duplicate submit with the same key → one assessment, one model call · Integration: model timeout → attempt kept, status `uncertain` · Live smoke: 5 dev items return valid output (logged with model ID, prompt version, latency, cost) |
| **P0-04** Photo attempt → grounded assessment *(gated, G1 on 29 Oct)* | Camera/file upload (JPEG/PNG/WebP ≤ 8 MB), EXIF stripped server-side, private storage. Spark transcribes the working, maps steps to the guideline and returns step boxes (0–1000 grid, clamped). The overlay draws ✓/✗ and circles the lost mark on the learner's own image | Reject other types, oversize and corrupt files (tests) · Stored object not publicly reachable (test) · Boxes clamped to 0–1000; a missing box hides the overlay and keeps the marks · **If G1 fails, P0-04 is cut and typed-only is the honest flagship** |
| **P0-05** Feedback and next step | Two blocks: **what happened** (steps, evidence, marks, confidence) and **what to do next** (one targeted follow-up item, chosen from the rubric step lost, with "why this"). Retry links to the original attempt | GIVEN step 2 lost WHEN the next item is chosen THEN it is tagged with that step's skill (test) · The "why" text cites the attempt ID · No mastery claim after one attempt (copy test) |
| **P0-06** Progress (evidence engine v0) | Append-only `learning_events`; a derived topic state per skill; a progress page: "what we believe and the evidence" plus a growth timeline (before and after) | Unit: replaying events rebuilds the same state · Only `proposed` with high confidence or teacher-confirmed events change state; `uncertain` never does |
| **P0-07** Teacher review and release | Queue of the class's attempts (assigned only). Detail: image or text, proposed marks per step, reasons, confidence. Adjust per step, confirm, **release**. Review is a separate record with an audit event and an optimistic lock. The learner then sees "Teacher-confirmed" on released marks | **Change-the-ID tests:** teacher 2 → class 1 attempt → 403/404; learner A → learner B attempt → 404 · Stale version → 409 · Release without confirm → refused · The model's proposal is never overwritten (it is a separate row) |
| **P0-08** Evidence page `/evidence` | Public page listing model IDs and tier, prompt version, the evaluation table with denominators (from `05`), latency p50/p95, cost per attempt, known failures, "built during the hackathon" list, status legend | Every number is generated from a committed evaluation run file (test checks the page reads the file, not hard-coded values) |
| **P0-09** Platform | Deployed on Railway (single service), installable PWA with an update prompt (no stale bundle), Sentinel tokens, 360/390/768/1440 layouts, keyboard and contrast basics. Rate limit plus per-user daily model-call cap plus a global daily budget cap. Startup config check. CI green on `main` | E2E (Playwright, phone viewport): learner happy path, teacher release, cross-role denial · Lighthouse on a mobile profile recorded (no target claimed before measuring) · Fresh-tab test after deploy |

## 4. P1: only after P0 passes the full run on the founder's phone (target: evening of 1 Nov)

| ID | Item | Earns | Gate |
|---|---|---|---|
| P1-a | Class misconception summary ("9 of 14 lost the mark at step 2") from confirmed events | Impact, Demo | Uses only teacher-confirmed or high-confidence events |
| P1-b | **Open-weight comparison:** Muse Spark Open via Baseten (`meta-models/muse-spark-open-1026`) on the same held-out set | **Best Open Weight $10k**, Tooling | Baseten access granted; reproducible run file |
| P1-c | Bounded content-prep agent (Muse Wonder): topic → draft item + guideline → self-checks → **teacher review queue**; never auto-publishes; tool trace shown | **Best Agentic $5k**, Tooling | P0 stable; trace visible; human approval required |
| P1-d | Muse Image "see it" diagram for one misconception, teacher-approved before showing | Best Creative $5k | Factually checked; static fallback |
| P1-e | SAM 3.1 region finding on a multi-question answer page (teacher batch scan) | Tooling | Measured localisation benefit on 10 pages |

## 5. Cut from the hackathon (with reason)

| Cut | Why |
|---|---|
| Parent/guardian surfaces, Help Plan, digests | D10 (next), and learners must be adults for Meta's terms |
| Me page, Opportunity Radar, Help now / My people, Mentor Brief, "Next up in class" | Focus on one loop (kit freeze rule). They return after the hackathon under WHOLE_LEARNER |
| Real DBE papers, page clips "exactly as printed" | Copyright (D20) |
| Subject-choice map, careers, bursaries | Not part of the judged loop |
| Offline marking, Pocket Mode, multi-language | Time. The PWA installs, but we make no offline claim |
| Payments, marketplace, school comms, native apps, fine-tuning our own model | Post-hackathon |
| Any chat box or "talk to me" | Anti-project list; Care Protocol |

## 6. Freeze and stop rules

- **Scope freezes when this document is approved.** Anything added means something of the
  same size leaves, with your sign-off.
- **30 Oct 20:00 SAST:** no deployed typed attempt → Meta assessment yet? Then cut P0-04 and
  all P1.
- **1 Nov 20:00:** no teacher release yet? Then simplify P0-07 to queue + confirm + release
  only.
- **The evaluation shows confidently wrong marks above the gate in `05`?** Then the demo
  leads with abstention and teacher review. We never hide the numbers.
- **2 Nov 20:00:** no new features after this; only demo-critical or security fixes.
- **4 Nov 18:00:** code freeze; submit by 20:00 SAST.

## 7. Status legend (used in the app, the video and the README)

| Label | Meaning |
|---|---|
| **LIVE** | Works in the deployed build |
| **SYNTHETIC** | Live, using fictional or volunteer data |
| **PROTOTYPE** | Partial |
| **PLANNED** | Not built |
