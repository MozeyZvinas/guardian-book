# B04 · Bring anything: inputs, the homework check, notice to plan

**Status:** APPROVED (planning session, 3 Nov 2026)
**Risk tier:** High (model calls, uploads, official-result path)
**Model / spend cap:** Fable 5.1 · $30
**Requirements:** P0-03, P0-04, P0-06, P0-11b (writes) in `docs/specs/02-product-p0.md` v2.1.
**Depends on:** B02 and B03 merged.
**Runs in parallel with:** B05. **Own only:** `apps/api/src/inputs/*`, `apps/api/src/assessment/*`,
`apps/api/src/calendar/*`, `apps/api/src/modelRuns/*`, `apps/api/src/storage/*`, their routes,
and web routes `apps/web/src/routes/learner/{bring,attempt,calendar}` and
`apps/web/src/routes/teacher/notice`. **Do not touch** `packages/shared/src/brain/*`,
`apps/api/src/routes/me/*` or `apps/web/src/routes/learner/{setup,today,brain}` (B05 owns them).

## Read first (only these)
- `CLAUDE.md`, `START-HERE.md`, `docs/BUILD-PLAN.md`
- `docs/decisions.md`: D20, D24, D34, D35
- `docs/specs/02-product-p0.md`: §1, §3 rows P0-03, P0-04, P0-06, P0-11, P0-11b
- `docs/specs/03-architecture-data.md`: §2 (attempts, assessments, the `steps` shape), §3, §6
  (marking rules), §8.1 (`inputs`, `model_runs`, `calendar_events`), §8.3 (inputs and
  calendar routes), §8.4, §9.1 (provenance, `attempts.mode`, `guideline_approvals`), §9.3
- `docs/specs/05-screens-and-flows.md`: §3 (core flow), §4.2 L2, L3, L7, §4.4 T5, §6, §7, §9
- `docs/specs/06-frontend-pwa-mobile.md`: §2, §4, §6

## Do
1. **Storage** (`apps/api/src/storage`): S3-compatible client for the Railway bucket
   (`BUCKET_*`; Railway buckets are private and use **virtual-hosted-style** URLs, so
   `forcePathStyle: false` and `BUCKET_REGION` as given, usually `auto`; the bucket has no
   public URL, so serve only through presigned links); private objects only; presigned GET ≤ 5 min; images re-encoded with EXIF
   stripped (sharp is allowed; justify in the PR); PDFs stored as-is (≤ 8 MB). Not configured →
   uploads return a clear 503 `storage_not_configured`; the app still runs.
2. **Inputs** (`POST /api/inputs`, `PATCH /api/inputs/:id/kind`): multipart or JSON; one
   classify call (`purpose = classify`, `InputClass` contract from B03) unless the client
   states the kind; low confidence → the client asks "Which is it?". Idempotency key.
3. **The homework check:** an input of kind `work` on an approved item creates an `attempt`
   (mode `assisted` unless the client sends `independent` or `retention`). `POST
   /api/attempts/:id/assess` runs B03's `verifiedCall` with the work-check prompt.
   - **Refuse** with 409 `guideline_not_approved` when the learner's class teacher has not
     approved that item revision (spec 03 §9.1).
   - Persist every model call as a `model_runs` row (`apps/api/src/modelRuns/record.ts`)
     with checks, attempt number, cost and request ID.
   - `accepted` → write the `assessments` row once (status `proposed`), steps with evidence
     and boxes; `exhausted`/`failed`/timeout → status `uncertain`, no marks shown.
   - Append `attempt_submitted` and `assessed` events through `appendEvent` (B02), with
     `basis` per spec 03 §3.
   - **Provenance** on every row: attempts `student_provided`; assessments
     `model_generated` with `{provider, model, version, model_run_id}`; all
     `training_permission = not_permitted`.
   - For `independent` and `retention` attempts, the hint is stored but **not returned** in
     the API response until the attempt is submitted and assessed (B06 builds the flow).
4. **Notice to plan:** an input of kind `notice` (learner or teacher) → one `notice` model
   call (`NoticeOutput`) → verifier rules `DATE_OUT_OF_RANGE`, `SOURCE_LINE_MISSING` →
   `calendar_events` as `proposed` (low confidence) or `confirmed` (high confidence, still
   editable); provenance `school_provided` for teacher uploads, `student_provided` for
   learner uploads; `GET /api/calendar`, `POST /api/calendar/:id/confirm|reject`.
5. **Web:**
   - **L2 Bring** (`/bring`): Snap · Type · Ask (Ask shows PLANNED for voice); the
     what-is-this chip; the item picker for homework (approved items, recent first);
     client-side downscale ≤ 2,000 px before upload.
   - **L3 Feedback** (`/attempts/:id`): the learner's own work as the hero; StepMap (✓/✗,
     marks small, tabular numerals); where it slipped (step name + the evidence quote);
     HintCard; confidence label; the uncertain state exactly as spec 05 §7; a disabled
     **Fix it** button labelled "Next: B06" is acceptable until B06 lands. Skeleton rows that
     resolve one by one while assessing.
   - **L7 Calendar** and **T5 Class notice** (upload → events with source lines → confirm or
     reject → "Published to n learners").
6. **Tests:** unit for routing, provenance setting, hint withholding; integration for the
   whole assess path with a **mocked gateway** (accepted, retried-then-accepted, exhausted,
   timeout), the guideline-approval refusal, cross-learner and cross-school 404s on attempts,
   images and calendar events, EXIF stripped (read the stored object back), object not
   publicly reachable; one Playwright test at 390×844: bring → feedback (mocked model).
7. **Live smoke** (if `META_API_KEY` is set locally): one typed and one photographed answer on
   a seeded item; report request IDs, cost and latency in the PR.

## Don't
- No Help Plan, no fix-it flow, no guardian or teacher review screens (B06, B07).
- No new dependencies beyond the S3 client and `sharp`; justify both.
- Never log answer text, images or keys. Never read the legacy or private folders.

## Acceptance (and tests)

| GIVEN / WHEN | THEN |
|---|---|
| A learner in 12A brings a photo answer to an approved item | One attempt, one or more `model_runs`, one assessment (`proposed` or `uncertain`), two events, provenance set |
| Same request replayed with the same idempotency key | No second model call |
| Item not approved for the learner's class | 409 `guideline_not_approved`, no model call |
| Mocked model returns a hint containing the answer three times | `exhausted` → `uncertain`, three `model_runs`, no marks shown |
| Teacher uploads a timetable photo | Events with source lines; low-confidence ones `proposed`; guardians see none until confirmed |
| Learner B requests learner A's image URL | 404 |
| CI | All six jobs green |

## Git
Worktree branch `b04-bring-assess-notice` (worktree `.claude/worktrees/b04`; see START-HERE). Small commits; push; PR with the
completion report; stop when CI has finished. Do not merge.
