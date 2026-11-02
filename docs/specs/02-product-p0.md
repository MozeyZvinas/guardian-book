# 02 · Product: hackathon scope v2, "One learner, three people, one Brain"

**APPROVED 31 Oct 2026 (D34); v2.1 2 Nov 2026 (D35).** Supersedes v1 of this file (D22). Changes need a same-size
cut and the founder's approval. Rests on D19 (adults in this build), D20 (original
content), D21 (stack), D24 (Standard model tier), D34 (this scope).

## 1. What we show the judge, in one sentence

A learner brings anything (a photo of handwritten working, a typed answer, a school
notice, a question). Muse Spark reads it against a human-approved marking guideline or
extracts the notice; checks the model cannot skip gate every output; the Brain updates
from evidence; and one understanding becomes three actions: tonight's step for the
learner, one plain-language thing to do for the parent, and the class picture plus a
drafted note home for the teacher to approve. The teacher stays the marker of record.
Every number on the proof page comes from a committed evaluation file.

Guardian Book is a lifelong learning intelligence (see `docs/vision/DESCRIPTION.md` for
how to describe it). The homework check is one input to it, never the headline.

**The demo is the learner support loop (D35):** learner work → Muse Spark proposes per-step
marks with evidence → the checks → the teacher approves the guideline and the result and adds
her own note → the learner gets teacher-approved feedback, fixes the step, then **checks it
alone** → the guardian's one action ("Teacher-reviewed") → the teacher's intervention with an
owner and a follow-up date → the follow-up check closes the loop → the proof page.
Teacher-reviewed assessment is the workflow schools buy first, inside this loop, not the
identity.

## 2. Users in this build

| Role | Who | Can | Cannot |
|---|---|---|---|
| Learner | An adult (18+; D19). The demo learner is a fictional adult matric learner ("Lerato, 18"); handwriting comes from consenting adult volunteers | Set up their profile, bring inputs, see their own feedback, Brain and plan, invite a guardian, see released marks | See other learners; release marks; see guideline steps before attempting |
| Guardian | An adult linked by the learner's invite code | See "This week": effort, what's coming, the gap at topic level, one action; tap "We did it"; read approved teacher notes | See the learner's attempts, images or answers; see other learners |
| Teacher | An adult; class code | See the class picture and shared gaps; confirm uncertain assessments; adjust and release; approve or edit drafted notes; upload a class notice | See other classes; send a note without approving it |
| Admin | Founder only | Load reviewed content and the resource list; read evaluation runs | Act as a teacher without logging the reason |

Age check: sign-up requires "I am 18 or older" (self-declaration; the README says so).
No minors' data exists in this build. Parents and schools for under-18 learners appear as
**PLANNED** in the video and README.

## 3. P0: must ship (each is a requirement with an ID)

| ID | Requirement | Acceptance tests (GIVEN / WHEN / THEN) |
|---|---|---|
| **P0-01** Circle accounts | Email + password (Better Auth) with required age attestation; roles learner / guardian / teacher / admin; **schools as tenants** (every class belongs to a school; D35); a teacher's class code; a learner's guardian invite code; seeded demo circle (one fictional school, one learner, one guardian, one teacher, five classmates; a second school for isolation tests) | No account without the attestation · Guardian link only via the learner's code · "Change the ID" tests: guardian → unlinked learner → 404; teacher 2 → class 1 → 404; learner → teacher route → 403; no session → 401 · Seeds are idempotent · **Tenant isolation:** a user of school A → any school B resource → 404 |
| **P0-02** Tell me about you | The learner's profile: dream, subjects, hardest subject, how they like to learn (free text, ≤ 500 chars each). Muse Spark turns it into structured profile cards (JSON schema) the learner can edit. No personality typing, no learning-style label | The schema rejects any field not in the contract · Editing a card never calls the model again · The raw text is stored once and never sent to a guardian |
| **P0-03** Bring anything | One capture entry: a practice question answer (typed or photo), a school notice (photo or PDF), or a question about a step. The server classifies the input (schema: `work | notice | question`) and routes it; the learner can override the class | JPEG/PNG/WebP/PDF ≤ 8 MB; EXIF stripped; private storage; stored object not publicly reachable (test) · Misclassification can be corrected without a second upload |
| **P0-04** The homework check | For an approved original item with a human-approved guideline (steps typed M / A / CA with marks), Muse Spark returns per step: awarded, evidence quoted from the learner's working, confidence, misconception tag, and a hint. Status `proposed` / `uncertain` / `failed`. The memo step is revealed only after a reasoning turn | Unit: out-of-range, unknown-step, duplicate-step, malformed outputs → `uncertain` · Hint containing the final answer or a memo value → rejected and re-asked (test) · Duplicate submit with the same idempotency key → one call · Timeout → `uncertain`, never an invented mark · Live smoke on 5 dev items, logged with model ID, prompt version, latency, cost |
| **P0-05** Fix it, then check it alone | After feedback the learner can redo the broken step on the same item (typed or photo). A pass is recorded as `fixed_independently`. Then a **"Check it alone"** item: a matched question in independent mode (no hints, no help until submitted), recorded as independent evidence. A **follow-up check** is scheduled (default 2 days) and recorded as retention evidence when done (D35) | A retry links to the original attempt · "Fixed on their own" is counted only on the first independent retry (test) · Independent-mode attempts expose no hint before submission (test) · No mastery claim after one success (copy test) |
| **P0-06** Notice to plan | A notice or timetable is extracted into dated events (subject, paper, date, source line). Low-confidence events are "please confirm" for the teacher or learner. Events appear on the learner's, guardian's and teacher's views; the plan re-forms around them | Dates parse and fall within ±120 days (test) · Every event cites its source line · Duplicates merged · A rejected event never reaches a guardian |
| **P0-07** The Brain | Append-only `learning_events`; per-skill mastery evidence kept apart as **assisted**, **independent** and **retained** performance, with evidence count and last checked (D35); a derived skill label (`new / practising / secure`) each state of which links to its evidence; a Brain page: "what we believe and the evidence" plus a growth timeline | Replaying events rebuilds the same state (test) · Only high-confidence or teacher-confirmed events move state; `uncertain` never does · Assisted success alone never yields `secure` (test) · No UPDATE/DELETE on events (test) |
| **P0-08** Help Plan: one gap, three views | A bounded agent (allowed tools only; ≤ 8 steps; trace stored) reads evidence, calendar, profile and the vetted resource list, and writes one Help Plan rendered three ways: learner (tonight's step, hint, why it matters), guardian (plain-language gap at topic level, one 10-minute action such as "ask them to teach you step 2", free help first), teacher (who shares this gap; suggested intervention) | Every statement cites ≥ 1 evidence ID (test) · Guardian view passes the plain-language check (sentence length; jargon list) · Resources only from the vetted list (test) · No answer in the learner view · No mood, health or personality inference (string tests) · Unknown tool → discarded; > 8 steps → safe template (tests) |
| **P0-09** Guardian view | "This week with [name]": effort (days, minutes, topics), what's coming, something to celebrate, the gap and the action; "We did it" writes a `support_given` event; approved teacher notes | Guardian sees no attempt, answer or image (change-the-ID tests) · "We did it" is idempotent per plan |
| **P0-10** Teacher view | **Approve the marking guideline** for her class before it is used (D35); class picture ("n of m share this gap"); confirm queue (uncertain first); per-step adjust → confirm → release (separate `reviews` row; optimistic lock); **feedback controls**: agree, correct, add her own note, choose the audience (learner, guardian, teacher-only); **interventions** with an owner, a follow-up date, an outcome and a close; drafted notes to each guardian (edit → approve → send in-app) with internal origin labels (AI-suggested, teacher-approved, teacher-added, teacher-revised) and **"Teacher-reviewed"** shown to the guardian; class notice upload | Release without confirm → 409 · Stale version → 409 · No assessment against a guideline the class's teacher has not approved (test) · A note is never visible to a guardian before `approved` (test) · Teacher-only notes never reach a learner or guardian (test) · Notes contain only that learner's data (cross-learner test) · The origin label is stored on every note and never shown as teacher-written when AI-drafted (test) · The model's proposal is never overwritten |
| **P0-11** Checks the model cannot skip | One verifier module with reason codes applied to every model output (work check, notice, profile, plan, note). On failure: re-ask with the reason code, at most 3 tries in total, then `uncertain` → teacher. The teacher detail view lists each check as pass/fail | A unit test per rule · Retry exhaustion → `uncertain` (test) · Gateway refuses any model ID ending `-contributor` (test) · Prompts never contain names, emails or guardian data (test) |
| **P0-11b** Provenance | Every stored artifact carries a provenance value (original_human, school_provided, teacher_verified, student_provided, model_generated with provider/model/version, licensed_content, synthetic_self_generated) and a training-permission status, default **not permitted** (D35) | Every insert path sets provenance (test) · No artifact defaults to training-permitted (test) |
| **P0-12** Proof page `/evidence` | Public: model IDs and tier (Standard), prompt versions, the evaluation table with denominators and 95% intervals (work check: agreement, confidently wrong, abstained; notices: field accuracy; plans: teacher ratings), "fixed on their own", checks blocked by reason, latency p50/p95, cost per learner-week, "built 26 Oct – 4 Nov" | Every number is read from a committed results file (test) · No hard-coded values |
| **P0-13** Platform | Railway (one service), installable PWA with an update prompt, Sentinel tokens, 360/390/768/1440 layouts, keyboard and contrast basics, rate limits, per-user daily model cap, global daily budget cap, startup config check, CI green on `main` | E2E (Playwright, phone viewport): learner brings work → feedback → fix → guardian sees the action → teacher confirms and approves a note · Fresh-tab test after deploy · Lighthouse on a mobile profile recorded |

## 4. P1: only after the full phone run passes (target: Tue 3 Nov, 20:00 SAST)

| ID | Item | Earns | Gate |
|---|---|---|---|
| P1-a | Voice input (Muse Voice Transcribe) for learner questions and guardian voice notes | Tooling, Demo | P0 stable |
| P1-b | A Muse Image "see it" card for one misconception, teacher-approved before showing | Creative bonus | Factually checked; static fallback |
| P1-c | Handwriting overlay: boxes on a 0–1000 grid, clamped; the lost step circled on the learner's own image | Demo, Tooling | Measured on 10 photos |
| P1-d | Open-weight comparison row (Muse Spark Open via a partner host) on the same held-out set | Open-weight bonus, Tooling | Access granted; reproducible run file |
| P1-e | WhatsApp-ready share text for approved notes | Impact | — |
| P1-f | Reading a teacher-marked test photo into the Brain | Impact | — |
| P1-g | Teacher uploads one learner's script for marking (the school workflow, on the existing path; class batches after the hackathon) | Impact, Demo | P0 stable |

## 5. Cut from the hackathon (with reason)

| Cut | Why |
|---|---|
| The content reader for examination papers (D28) | After 4 Nov; the build uses original items only (D20) |
| Any real examination paper content | Rights (D20, D29) |
| Me page beyond the four profile cards; Opportunity Radar; careers; mentors; marketplace | Not part of the judged loop; shown as PLANNED |
| Offline marking, Pocket Mode, multi-language | Time; no offline claim |
| Open chat, "talk to me", emotion or mood inference | Anti-project list; acceptable-use policy; Care Protocol |
| Under-18 accounts, consent flows for minors | D19; PLANNED |

## 6. Cut order if time runs short (keep the circle intact)

1. All of P1.
2. P0-06 notice to plan (the timetable becomes a seeded calendar).
3. The class notice upload and class statistics in P0-10 (keep confirm, release and notes).
4. Drafted notes (the teacher writes her own; approval stays).
5. The Help Plan agent becomes one structured Muse Spark call with the same checks.

Never cut: circle accounts, bring anything with the homework check, the Brain, the Help
Plan in three views, the confirm queue, the verifier, the proof page, and the loop's close
(check it alone, an intervention with an owner, the follow-up check). If the feedback
controls must shrink, keep agree / correct / add and the audience choice; drop prioritise and
schedule first.

## 7. Freeze and stop rules

- **Scope freezes with D34.** Anything added means something of the same size leaves.
- **Tue 3 Nov 12:00 SAST:** no deployed work check → Muse Spark → feedback yet? Cut P1 and
  P0-06.
- **Tue 3 Nov 20:00:** full phone run (the gate; moved from 2 Nov by D35). No new features after this; only
  demo-critical or security fixes.
- **The evaluation shows confidently wrong above the gate in spec 04?** The demo leads with
  abstention and teacher review. We never hide the numbers.
- **Wed 4 Nov 18:00:** code freeze; submit by 20:00 SAST.

## 8. Status legend (used in the app, the video and the README)

| Label | Meaning |
|---|---|
| **LIVE** | Works in the deployed build |
| **SYNTHETIC** | Live, using fictional or volunteer data |
| **PROTOTYPE** | Partial |
| **PLANNED** | Not built |
