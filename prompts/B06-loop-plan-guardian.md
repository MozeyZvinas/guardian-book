# B06 · Close the loop: fix it, check it alone, the Help Plan, the guardian space

**Status:** APPROVED (planning session, 3 Nov 2026)
**Risk tier:** High (model-written plans reach parents)
**Model / spend cap:** Fable 5.1 · $30
**Requirements:** P0-05, P0-08, P0-09 in `docs/specs/02-product-p0.md` v2.1.
**Depends on:** B04 and B05 merged.
**Runs in parallel with:** B07. **Own only:** `apps/api/src/plans/*`, `apps/api/src/resources/*`,
`apps/api/src/routes/guardian/*`, the fix/check routes under `apps/api/src/assessment/fix.ts`,
and web routes `apps/web/src/routes/learner/{fix,item}` and `apps/web/src/routes/guardian/*`.
**Do not touch** `apps/api/src/teacher/*`, `apps/api/src/interventions/*` or
`apps/web/src/routes/teacher/*` (B07 owns them).

## Read first (only these)
- `CLAUDE.md`, `START-HERE.md`, `docs/BUILD-PLAN.md`
- `docs/decisions.md`: D6, D34, D35
- `docs/specs/02-product-p0.md`: §1 (the loop), §3 rows P0-05, P0-08, P0-09, §6
- `docs/specs/03-architecture-data.md`: §8.1 (`help_plans`, `resources`, `guardian_links`),
  §8.2, §8.3 (plan and guardian routes), §8.4 (plan rules), §9.1 (`attempts.mode`,
  `interventions` read-only here, `notes` origin and audience), §9.2, §9.3
- `docs/specs/05-screens-and-flows.md`: §4.2 L4, L5, §4.3 G0–G4, §9 (L4, G1 changes)

## Do
1. **Fix it** (`POST /api/attempts/:id/fix`): redo the lost step (typed or photo) on the same
   item, assessed only for that step; a pass appends `fixed_independently` (first independent
   retry only).
2. **Check it alone:** `POST /api/attempts` with `mode = independent` on a matched item (the
   approved item with the most guideline steps tagged with the lost skill, excluding items
   already attempted); no hint served before submission; appends
   `independent_check_completed`. Schedule a **retention check** for +2 days (configurable)
   unless an open intervention already sets the follow-up date. `mode = retention` attempts
   append `retention_check_completed`.
3. **Resources** (`pnpm resources:load <file>`; outside-repo `RESOURCE_LIST_PATH`): vetted list
   with licence, attribution, free flag, skill tags; provenance `licensed_content`.
4. **The Help Plan** (`apps/api/src/plans`): a **bounded tool-using workflow** on Muse Spark
   (`META_MODEL_AGENT`): allowed tools `getEvidence`, `getCalendar`, `getProfileCards`,
   `getResources`, `writePlan`; at most 8 steps; trace stored; unknown tool → discarded;
   exceeding steps → a safe template plan. Output `PlanOutput` with three views. Verifier
   rules: every statement cites ≥1 evidence ID; `RESOURCE_UNVETTED`; `PLAIN_LANGUAGE_FAIL`
   on the guardian view; `INFERENCE_FORBIDDEN`; no answer in the learner view; length limits.
   Triggered **the same day a gap is detected** (an `assessed` event with a lost step) and
   weekly; one `issued` plan per learner per week, newer supersedes. Provenance
   `model_generated`. Append `plan_issued`.
5. **Guardian space:**
   - **G0 Link** (if B02 built it, reuse);
   - **G1 This week with [nickname]** per spec 05 §4.3 and §9: celebrate, effort, what's coming,
     the gap at topic level, one 10-minute action ("ask them to teach you step 2"), free help
     first, **We did it** (`support_given`, idempotent per plan); teacher messages labelled
     **Teacher-reviewed** (origin `teacher_approved` or `teacher_revised`) or with the
     teacher's name (`teacher_added`); guardian-audience intervention actions;
   - **G2 Notes** (sent notes only; B07 writes them), **G3 Calendar**, **G4 Settings** (what
     you can and can't see).
6. **Learner screens:** **L4 Fix it** → **Check it alone** (the *Independent* chip; result
   "You did it on your own" or "Not yet; here's a hint for next time"); **L5 Follow-up item**
   with "why this".
7. **Tests:** plan agent with a mocked model (accepted; unknown tool discarded; 9th step →
   template; a resource not on the list → re-ask; guardian view with jargon → re-ask);
   guardian sees no attempt, answer or image (change-the-ID tests for every guardian route);
   a learner-audience or teacher-only note never appears in G1/G2; independent mode serves no
   hint before submission; "fixed on their own" counted once; Playwright 390×844: feedback →
   fix → check it alone → guardian "We did it".

## Don't
- No teacher screens, no intervention writes, no note drafting (B07).
- No new dependencies.

## Acceptance (and tests)

| GIVEN / WHEN | THEN |
|---|---|
| A lost step on factorising is assessed | A Help Plan is issued the same day with three views, each statement citing evidence |
| The learner fixes the step, then checks it alone and passes | `fixed_independently` and `independent_check_completed` events; a retention check due in 2 days |
| The guardian opens This week | The gap at topic level and one action; no attempt, answer or image anywhere |
| The guardian taps We did it twice | One `support_given` event |
| CI | All six jobs green |

## Git
Worktree branch `b06-loop-plan-guardian` (`fable -w b06`). Small commits; push; PR; stop
when CI has finished. Do not merge.
