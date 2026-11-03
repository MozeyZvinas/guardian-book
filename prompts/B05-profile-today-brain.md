# B05 · Tell me about you, Today, the Brain

**Status:** APPROVED (planning session, 3 Nov 2026)
**Risk tier:** Medium (one model call; learner data on screen)
**Model / spend cap:** Fable 5.1 · $20
**Requirements:** P0-02, P0-07 in `docs/specs/02-product-p0.md` v2.1.
**Depends on:** B02 and B03 merged.
**Runs in parallel with:** B04. **Own only:** `packages/shared/src/brain/*`,
`apps/api/src/routes/me/*` (profile, brain, today), `apps/api/src/evidence/projection.ts`, and
web routes `apps/web/src/routes/learner/{setup,today,brain,me}`. **Do not touch** B04's
folders (inputs, assessment, calendar, modelRuns, storage, bring, attempt, calendar, notice).

## Read first (only these)
- `CLAUDE.md`, `START-HERE.md`, `docs/BUILD-PLAN.md`
- `docs/decisions.md`: D34, D35
- `docs/specs/02-product-p0.md`: §3 rows P0-02, P0-07
- `docs/specs/03-architecture-data.md`: §2 (`learning_events`, `topic_state`), §3, §8.1
  (`profiles` cards), §8.3 (profile routes), §9.1 (`skill_evidence`, `attempts.mode`, event
  kinds), §9.3 (`GET /api/me/checks`)
- `docs/specs/05-screens-and-flows.md`: §4.2 L0, L1, L6, L8, §5, §6, §7, §9 (L1, L6 changes)
- `docs/specs/06-frontend-pwa-mobile.md`: §2–§4, §7

## Do
1. **The reducer** (`packages/shared/src/brain/reduce.ts`, pure, no I/O): events → per-skill
   `skill_evidence` (assisted, independent, retained counts; confidence calibration;
   `evidence_count`; `last_checked_at`) and the derived label: `new` (no evidence),
   `practising` (any evidence without the secure rule), `secure` (≥1 correct independent and
   ≥1 correct retained, on different days; assisted success alone never). Only events with
   `basis ≠ none` move state; teacher-confirmed overrides model-based for the same attempt.
   **Property tests:** replay is deterministic; order-independence within a day; assisted-only
   never yields secure.
2. **Projection** (`apps/api/src/evidence/projection.ts`): compute from events on read (the
   hackathon data is small); write-through to `skill_evidence` and `topic_state` is optional.
3. **Profile** (`POST /api/me/profile`, `PATCH /api/me/profile/cards`): one `profile_cards`
   model call through B03's `verifiedCall` (schema `ProfileCards`; verifier rule
   `INFERENCE_FORBIDDEN` must pass: no personality, mood or learning-style labels); edits make
   no model call; append `profile_set`; provenance `student_provided` for the raw text,
   `model_generated` for the cards. Raw text is never served to a guardian (test).
4. **Today** (`GET /api/me/today`): exam chip (next confirmed calendar event); tonight's step
   (from the current Help Plan if one exists, else "Bring something and we'll start");
   **check-in due** (from `GET /api/me/checks`: due retention checks and open interventions'
   follow-up dates); recent inputs with status; the invite-a-parent nudge when no guardian is
   linked.
5. **Brain** (`GET /api/me/brain`): skill chips with three marks (*with help*, *on your own*,
   *later*) and the evidence behind each; the growth timeline (events, newest first).
6. **Web:** **L0** (four prompts, one per step → four editable cards; skip allowed),
   **L1 Today** (one pink primary: Bring anything; the check-in card outranks tonight's step
   when due), **L6 Brain** (the plain line "Secure means you did it on your own, and again
   later."), **L8 Me** (cards; invite a parent with the share text; join a class; "what your
   parent can see"). 360 px first; tokens only; skeletons; empty states per spec 05 §7.
7. **Tests:** reducer property tests; profile route with a mocked gateway (accepted;
   `INFERENCE_FORBIDDEN` → re-ask → exhausted → cards empty, labelled); guardian → learner's
   raw profile text → not present; learner A → learner B's brain → 404; Playwright at 390×844:
   setup → today → brain with seeded events.

## Don't
- No Help Plan generation (B06), no fix-it or check-alone screens (B06), no teacher screens.
- No new dependencies. No chat box anywhere.

## Acceptance (and tests)

| GIVEN / WHEN | THEN |
|---|---|
| Seeded events: assisted correct ×3 on one skill | Label `practising`, never `secure` |
| Plus independent correct on day 1 and retained correct on day 3 | Label `secure`; the chip shows all three marks |
| Replay the same events twice | Identical state |
| Profile text contains "I'm lazy and anxious" | The cards contain no mood or personality label (verifier) |
| A due retention check exists | Today shows the check-in card above tonight's step |
| CI | All six jobs green |

## Git
Worktree branch `b05-profile-today-brain` (worktree `.claude/worktrees/b05`; see START-HERE). Small commits; push; PR with the
completion report; stop when CI has finished. Do not merge.
