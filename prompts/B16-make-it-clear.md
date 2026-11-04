# B16 · Make it clear: setup, Today, Brain, maths display, notices

**Status:** APPROVED (planning session, 4 Nov 2026, after the founder's first real use; D39)
**Risk tier:** Medium
**Model:** Fable 5.1 on the Claude subscription
**Why:** on first use the founder couldn't tell what each screen was for. These are fixes to
words, layout and two bugs; no new model features.
**Runs in parallel with:** B15. **Own only:** `apps/web/src/routes/learner/{setup,today,brain,me,calendar}/*`,
`apps/web/src/components/MathText*`, `SkillChip*`, `EmptyState*`, `apps/api/src/calendar/*`
(the notice-failure bug only). **Do not touch** Bring, guide, attempt, fix, teacher or
guardian screens.

## Do
1. **Tell me about you** becomes quick taps, not essays:
   - Grade: a dropdown (8–12, or "Finished school / rewriting matric").
   - My subjects: tappable chips from the CAPS FET list (Mathematics, Mathematical Literacy,
     Physical Sciences, Life Sciences, Accounting, Business Studies, Economics, Geography,
     History, English HL/FAL, Afrikaans HL/FAL, isiZulu HL/FAL, Sesotho HL/FAL, Life
     Orientation, Information Technology, CAT, Engineering Graphics and Design, Tourism,
     Consumer Studies, Agricultural Sciences, Visual Arts, Dramatic Arts), plus "Other".
   - The subject I find hardest: a dropdown from the chosen subjects.
   - One day I want to: a fill-in-the-gap, "One day I want to be a ____" with three example
     chips (engineer, nurse, start a business).
   - I learn best when: chips (someone shows me an example; I try first, then check; I watch a
     video; I talk it through; I practise lots of questions). The learner's own choice, never a
     label from the model.
   The profile model call stays for turning these into the cards; it gets structured input now.
2. **Today:** one clear next action at the top (Bring something / Fix your step / Check it
   alone / Your follow-up check), then "Your recent work" with plain statuses: *Marked*,
   *Waiting for your teacher*, *Couldn't read it: try again*, never raw states. Failed and
   abandoned inputs older than a day are hidden; a "Show all" link reveals them.
3. **Brain:** a one-line explainer at the top ("This is what you can do, and how sure we are")
   and a legend for the three marks: *With help* = right with hints · *On your own* = right in
   a check with no hints · *Later* = still right two days later. **Secure** = all three. Each
   chip opens its evidence in plain words ("Tuesday: lost the mark at step 2 · Wednesday: fixed
   it yourself · Wednesday: right on your own"). Empty state: "Bring your first piece of work
   and your Brain starts here."
4. **Maths display:** `MathText` also renders `\( … \)`, `\[ … \]` and bare `\frac{a}{b}` that a
   learner or another app pasted; it never shows raw backslashes to a learner.
5. **Notice bug:** a photographed page with no dates shows "Could not be read right now" (the
   failure message). Find why; when the model returns no events, say *"I couldn't find any
   dates on this. Is it a school notice?"*; keep the failure message for real failures; log the
   verifier codes. Test both.
6. **Maths keyboard on Fix and Item:** after `git merge origin/main`, if B15's `MathInput` is on main, use it for the typed boxes on the Fix and Item screens (you may edit those two screens for this only).
7. **Words everywhere in your folders:** say what each screen is for in one line under its title.
8. **Tests and shots:** unit tests for the MathText normaliser and the Today status mapping;
   Playwright at 390 for setup (taps only), Today and Brain; refreshed screenshots.

## Don't
- No new runtime dependencies. No changes to marking, events or permissions.

## Git
Worktree `.claude/worktrees/b16`, branch `b16-clarity`. Merge `origin/main` before the PR;
own Postgres and e2e ports; push; PR; stop when CI has finished. Do not merge.
