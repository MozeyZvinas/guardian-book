# B11 · Red ink on the learner's own page, and a teacher uploads a learner's script

**Status:** APPROVED (planning session, 4 Nov 2026)
**Risk tier:** High (official results; images)
**Model:** Fable 5.1 on the Claude subscription (`claude --model claude-fable-5-1`)
**Requirements:** P1-c (handwriting overlay) and P1-g (teacher uploads one learner's script)
in `docs/specs/02-product-p0.md` §4; D35 (teacher-reviewed assessment); D37; D38.
**Depends on:** B04, B07 merged (they are).
**Runs in parallel with:** B09, B12, B13. **Own only:** `apps/web/src/components/RedInk*`,
`apps/web/src/components/WorkViewer.tsx`, `apps/web/src/routes/learner/attempt/*`,
`apps/web/src/routes/teacher/review/*`, a new `apps/web/src/routes/teacher/script/*`,
`apps/api/src/teacher/scripts*`, and additive edits to the teacher router, `access` and
`audit`. **Do not touch** fix, item, guardian, bring or public screens.

## Read first (only these)
- `CLAUDE.md`, `START-HERE.md`, `docs/decisions.md` (D35, D37, D38)
- `docs/specs/03-architecture-data.md`: §2 (`steps` jsonb: `box` on a 0–1000 grid), §6 rule 7
- `apps/api/src/assessment/service.ts` (how steps and boxes are stored), B07's review screen
  and routes, `apps/web/src/components/WorkViewer.tsx`, `StepMap.tsx`

## Do
1. **Red ink (`RedInk` component):** draws on the learner's own photo the way a teacher
   marks a script, as an SVG layer over the image (scaled from the 0–1000 grid to the
   image's natural size, clamped):
   - an earned step: a red tick at the right edge of its box;
   - a lost step: a red ellipse around its box, a cross, and a short comment (≤ 60
     characters, from that step's feedback, shown as plain text) in the margin with a line to
     the circle;
   - the total, circled at the top right ("2/3"), like a teacher.
   - Use a bundled handwriting font **only** if its licence is OFL or similar and the licence
     file ships with it in `apps/web/public/fonts/`; otherwise a bold system font in red.
   - Ink only for steps whose box exists **and** whose confidence is `high` or `medium`;
     everything else stays in the step list beside the photo. Typed answers: no ink, the
     step list as today.
   - A toggle **Show red ink / Hide**, ink appearing step by step on first view (respect
     reduced motion), a label: *Checked by Guardian Book* before release and
     *Teacher-reviewed* after release, using the released review's steps (teacher values win).
   - Red comes from the tokens (add `--ink-red` with a dark-mode variant if missing).
2. **Where it shows:** the learner's feedback screen (`/attempts/:id`) and the teacher's
   review screen (B07), where the teacher sees the same ink and her corrections update it
   live before she confirms.
3. **Teacher uploads a learner's script** (the school workflow, on the existing path):
   - `POST /api/teacher/classes/:classId/scripts` (multipart: `learnerId`, `itemId`, `image`,
     `idempotencyKey`). The teacher must teach that class, the learner must be in it, and
     the item's guideline must be approved for the class (409 `guideline_not_approved`).
   - It creates the input and the attempt **for the learner** (mode `independent`; the
     learner wrote it in a test), provenance `school_provided`, uploader recorded in the
     audit event (D37 precedent until an uploader column exists), then runs B04's background
     assessment (202 + poll) through `runModel`.
   - The result lands in the teacher's queue like any other; nothing reaches the learner or
     the parent until the teacher releases it.
   - Screen **"Mark a script"** (`/teacher/classes/:id/script`): pick the learner, pick the
     question (shown with `MathText`), photograph or upload, wait, then go to Review.
   - Change-the-ID rows: another class's learner → 404; another school → 404; learner or
     guardian calling the route → 403.
4. **Live check:** run one real photo through the whole path (use a clear photo of
   handwritten working; ask the founder for one if the repo has none: put the request under
   B11 in `docs/TASKS.md` and use a synthetic image meanwhile). Record whether the boxes
   land on the right lines; if they are off, keep the ink to the margin list and say so.

## Don't
- No changes to how marks are decided; ink only draws what the stored steps say.
- No new runtime dependencies.
- Never draw ink from a model proposal the teacher has overridden.

## Acceptance
| GIVEN / WHEN | THEN |
|---|---|
| A photo attempt with step 2 lost (high confidence, box present) | Ticks on 1 and 3, a circle and comment on 2, "2/3" circled |
| The teacher corrects step 2 to earned and releases | The learner's ink shows three ticks, labelled Teacher-reviewed |
| Ms Dlamini uploads Lerato's script for an approved question | An independent attempt in her queue; nothing visible to Lerato or her parent until release |
| A Riverside teacher posts to a Sentinel High class | 404 |
| CI | All six jobs green; Playwright at 390 (learner ink) and 1440 (teacher upload → review) |

## Git
Worktree `.claude/worktrees/b11`, branch `b11-red-ink`. Before opening the PR,
`git fetch origin && git merge origin/main` and re-run the checks. Small commits; push; PR
with the completion report; stop when CI has finished. Do not merge.
