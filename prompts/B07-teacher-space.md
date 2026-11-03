# B07 · The teacher space: guidelines, review, feedback, interventions, notes

**Status:** APPROVED (planning session, 3 Nov 2026)
**Risk tier:** High (official results, messages to parents)
**Model / spend cap:** Fable 5.1 · $30
**Requirements:** P0-10 in `docs/specs/02-product-p0.md` v2.1.
**Depends on:** B04 merged (assessments exist). B05 not required.
**Runs in parallel with:** B06. **Own only:** `apps/api/src/teacher/*`,
`apps/api/src/interventions/*`, `apps/api/src/notes/*`, their routes, and
`apps/web/src/routes/teacher/*` (except `notice`, which B04 built). **Do not touch** B06's
folders (plans, resources, guardian routes, fix/check, learner fix and item screens).

## Read first (only these)
- `CLAUDE.md`, `START-HERE.md`, `docs/BUILD-PLAN.md`
- `docs/decisions.md`: D6, D34, D35
- `docs/specs/02-product-p0.md`: §1, §3 row P0-10, §6 (what may shrink)
- `docs/specs/03-architecture-data.md`: §2 (`reviews`), §4, §5 (teacher routes), §8.1
  (`notes`), §8.2, §8.3 (teacher routes), §9.1 (`guideline_approvals`, `interventions`,
  `review_feedback`, notes origin and audience), §9.2, §9.3
- `docs/specs/05-screens-and-flows.md`: §4.4 T1–T6, §5, §6, §9 (T2, T3a, T7 changes)

## Do
1. **T7 Guidelines** (`/teacher/classes/:id/guidelines`): items for the class with their M/A/CA
   steps; **Approve for [class]** per item revision; append `guideline_approved`. Items with
   provenance `model_generated` carry the label **"AI-drafted: check before approving"**.
2. **T2 Class picture:** shared gaps ("n of m lost the mark at step 2 of factorising") from
   confirmed or high-confidence evidence; **Needs you**; counts for the queue and draft notes;
   the **Interventions** panel (open first, by follow-up date) with **Assign** from a gap
   (learners, one line, follow-up date) and **Close** (outcome improved / no change / needs
   more, showing the follow-up check as evidence; closing requires an outcome and ≥1 evidence
   event). Append `intervention_assigned` and `intervention_closed`.
3. **T3 Queue and T3a Review** (two panes from 1024 px): the learner's work; the model's
   per-step proposal (awarded, evidence, confidence); the **checks list** (each verifier rule
   pass/fail with its code from `model_runs.checks`); per-step adjust → **Confirm** →
   **Release** (separate `reviews` row; optimistic lock; release only after confirm);
   **feedback controls**: Agree, Correct (edit the AI's explanation → origin
   `teacher_revised`), Add (her own words → `teacher_added`), audience Learner · Guardian ·
   Only me; origin labels visible to the teacher. Append `review_confirmed`,
   `review_released`, `feedback_teacher_added`.
4. **T4 Notes home:** one `note` model call per guardian of the class's learners with a lost
   step this week (aggregates of that learner only; no other learner's data in the prompt or
   the output, test); drafts stored with origin `ai_suggested`; Edit → Approve (origin
   `teacher_approved`, or `teacher_revised` when edited) → Send (status `sent`, append
   `note_sent`). Never visible to a guardian before `sent`.
5. **T6 Learner profile** (own classes only): skill chips (from B05's projection endpoint if
   merged; otherwise the raw counts), recent attempts and status, subjects and hardest subject
   (never the dream or raw profile text), open interventions.
6. **Tests:** release before confirm → 409; stale version → 409; the model's proposal is never
   overwritten; teacher 11B (Riverside) → any Sentinel High resource → 404; teacher-only
   feedback never served to learner or guardian routes; a note's origin is stored and an
   `ai_suggested` draft is never shown as teacher-written; closing an intervention without an
   outcome → 400; Playwright at 1440×900: approve guideline → review → correct a step → add a
   note → release → assign an intervention → approve and send a note.

## Don't
- No Help Plan generation, no guardian screens (B06).
- No per-teacher rankings anywhere (the covenant).
- No new dependencies.

## Acceptance (and tests)

| GIVEN / WHEN | THEN |
|---|---|
| Teacher approves the guideline, then reviews an uncertain attempt, corrects step 3, adds a guardian-audience note and releases | A `reviews` row (confirmed → released), `review_feedback` rows with origins and audiences, events appended; the assessment row unchanged |
| Teacher assigns an intervention with a follow-up date | It appears on the learner's Today as a check-in on that date (via `GET /api/me/checks`) |
| Teacher sends an AI-drafted note unedited | Guardian sees it labelled "Teacher-reviewed" |
| CI | All six jobs green |

## Git
Worktree branch `b07-teacher-space` (worktree `.claude/worktrees/b07`; see START-HERE). Small commits; push; PR; stop when CI has
finished. Do not merge.
