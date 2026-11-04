# B15 · "Help me with a question": any question, step by step, never the answer first

**Status:** APPROVED (planning session, 4 Nov 2026, after the founder's first real use; D39)
**Risk tier:** High (model-written maths reaches learners)
**Model:** Fable 5.1 on the Claude subscription
**Why:** the founder photographed a textbook question and expected Guardian Book to read it and
take him through it step by step. Today the app only checks work on questions already in the
bank; anything else says "Answers arrive with your plan (PLANNED)". This is the most natural
first thing a learner (or a judge on `/try`) does, and it is the heart of "lifelong learning
support in your pocket".
**Runs in parallel with:** B16. **Own only:** `apps/api/src/guide/*`, the `guide` purpose and
its migration, `packages/shared/src/contracts/model/guide.ts`, a new
`apps/web/src/routes/learner/guide/*`, and the Bring screen's routing for the "Question" kind
(`apps/web/src/routes/learner/bring/*`). **Do not touch** Brain, Today, setup, MathText,
calendar or teacher/guardian screens (B16).

## Read first
`CLAUDE.md`, `docs/decisions.md` (D24, D37, D38, D39), B03's gateway and verifier, B04's
`runModel` and inputs, B13's hint prompt and `HINT_LEAKS_ANSWER`, B04's notice reader (how a
photo is sent to Muse Spark).

## Do
1. **Entry points.** On Bring, the three choices become plain:
   - **Check my work**: for a question your teacher set (today's flow, unchanged);
   - **Help me with a question**: any question, by photo or typing (new, this brief);
   - **School notice**: dates for your calendar (unchanged).
   When the classifier says "question", or a learner's typed or photographed text doesn't match
   a question in the bank, offer **Help me with this question** instead of the bank picker.
2. **Read the question** (`POST /api/guide`, photo or text; idempotency key). Purpose `guide`
   (additive migration after main's latest). Muse Spark returns, as structured output: the
   question read back in Markdown with `$…$` maths, subject, topic, 2–8 steps (each: a short
   goal, a hint, and the worked step), the final answer, and confidence. Typed input written as
   `\( … \)` or `\[ … \]` is normalised to `$…$` first.
3. **Check it twice (self-consistency).** Make a second, independent call and compare the two
   final answers (normalised). Agree → show the guide. Disagree, low confidence, or the verifier
   fails three times → show only the question read back and the first hint, labelled
   *"I'm not sure about this one. Try the first step, then ask your teacher."* Never show a
   worked step we aren't sure of. Verifier rules (pure, reason codes, a test each): question
   read-back present (`QUESTION_MISSING`), step count 2–8 (`STEPS_OUT_OF_RANGE`), maths
   delimiters balanced (`MATH_UNBALANCED`), no personal data echoed (`PERSONAL_DATA`),
   final answers agree (`ANSWERS_DISAGREE`).
4. **The screen (`/guide/:id`)**, 360 px first, maths through `MathText`:
   - "Is this your question?" with the read-back and **Edit** (re-reads once from the corrected
     text);
   - one step at a time: the goal, a box to **try it yourself** (optional), **Hint**, then
     **Show this step**; the next step unlocks after the current one is shown;
   - the final answer only after the last step, or behind **Show the answer** with a one-line
     "Try the steps first?" confirm;
   - label: *AI-guided practice · not marked by your teacher*; a link **Check my own working**
     to the bank flow when the question matches a bank item;
   - the waiting state while the two reads run ("Reading your question…").
5. **Records:** the input (provenance `student_provided`), every `model_runs` row, an audit
   event. No learning event moves the Brain (`basis = none`), because nothing was marked.
6. **Tests:** two agreeing reads → guide shown; disagreeing → first hint only; a `\(…\)` typed
   question renders as maths; the answer is hidden until the last step; cross-learner 404;
   prompt injection inside the photographed/typed question is ignored; Playwright at 390 with a
   mocked model (photo of a question → read back → step through → answer).
7. **Live check:** the founder's textbook photo case: "Find two rational numbers between 1/4
   and 7/8" typed as `\(\frac{1}{4}\)` and `\(\frac{7}{8}\)`, plus one Grade 12 quadratic; record
   both reads, agreement, latency and cost (under $0.10) in `docs/TASKS.md`.

## Don't
- Never show the final answer first. Never mark anything or move the Brain.
- No new runtime dependencies.

## Git
Worktree `.claude/worktrees/b15`, branch `b15-guide`. Merge `origin/main` before the PR; own
Postgres and e2e ports; push; PR; stop when CI has finished. Do not merge.
