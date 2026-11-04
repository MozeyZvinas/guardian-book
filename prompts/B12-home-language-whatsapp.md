# B12 · The parent's home language, and share to WhatsApp

**Status:** APPROVED (planning session, 4 Nov 2026; new scope, D38)
**Risk tier:** High (model text reaches parents)
**Model:** Fable 5.1 on the Claude subscription (`claude --model claude-fable-5-1`)
**Requirements:** P1-e (WhatsApp text) in `docs/specs/02-product-p0.md` §4; D38 (home
language); D24 (no personal data in prompts); D37.
**Depends on:** B06, B07 merged (they are).
**Runs in parallel with:** B09, B11, B13. **Own only:** `apps/api/src/translate/*`,
`apps/api/src/routes/guardian/*`, the guardian read in `apps/api/src/notes/*`,
`apps/web/src/routes/guardian/*`, one additive migration, and additive edits to config,
`access`, `audit`, the verifier (new `translate` rules) and the model contracts.
**Do not touch** learner or teacher screens.

## Read first (only these)
- `CLAUDE.md`, `START-HERE.md`, `docs/decisions.md` (D24, D35, D37, D38)
- `docs/specs/05-screens-and-flows.md` §4.3 (G1–G4) and §9
- B06's guardian routes and screens, B07's notes module, B04's `runModel`, B03's verifier

## Do
1. **The parent chooses a language** in G4 Settings: English, Afrikaans, isiZulu, isiXhosa,
   Setswana, Sesotho (codes `en af zu xh tn st`). Stored on the guardian's profile
   (`profiles.preferred_language`, default `en`; additive migration, next number after
   main's latest; if main gains a migration before you merge, renumber yours after it).
2. **What gets translated:** only text that was already safe for the parent in English: the
   guardian view of the issued Help Plan, sent notes (teacher-approved), guardian-audience
   review feedback and the intervention sentence. **Never** the learner's work or answers,
   and never anything not already visible in English.
3. **How:** a new model purpose `translate` (add the enum value in the same migration) through
   `runModel` (caps and `model_runs` rows apply; charge the guardian's own calls).
   - Before the prompt, replace the learner's nickname, the teacher's name and every number,
     date and URL with placeholders (`{{L}}`, `{{T}}`, `{{N1}}`…); restore them after. No
     names or numbers ever reach the model (D24).
   - Translate **in the background when the text is created** (plan issued, note sent,
     feedback released) for each linked guardian whose language isn't English; cache in a
     `translations` table (source kind, source id, language, source hash, text, `model_run_id`,
     provenance `model_generated`; unique on source hash + language). On read: serve the
     cached translation, or English with "Translation on its way" if it isn't ready.
   - Verifier rules for `translate` (pure functions, reason codes, a test each): every
     placeholder present exactly once (`PLACEHOLDER_MISSING`), length 0.5–2.5× the source
     (`LENGTH_OUT_OF_RANGE`), no digits introduced (`NUMBER_ADDED`), no URL introduced
     (`URL_ADDED`), not left in English (`NOT_TRANSLATED`, a simple ratio of the source's
     words). Three calls at most, then English only, recorded.
4. **On screen (G1 This week, G2 Notes):** the translated text with a quiet label
   **"Translated by AI from the teacher-reviewed English · Show English"**; tapping shows the
   English beside it. Teacher-reviewed labels stay as they are.
5. **Share to WhatsApp:** a button on This week's action and on each sent note: opens
   `https://wa.me/?text=` with the message in the parent's chosen language, plus the
   learner's nickname, no links to private pages, no attempt or answer text. A copy button
   beside it for other apps.
6. **Tests:** placeholders round-trip; no name or digit in any `translate` prompt (assert on
   the recorded prompt); a translation never appears for a note before it is `sent`; a
   guardian of another learner → 404 on every new route; the share text contains only what
   G1 shows; Playwright at 390: parent sets isiZulu → This week shows the label and Show
   English works (mocked model).
7. **Live check:** translate one plan and one note into isiZulu and Afrikaans for real
   (under $0.10); record the verifier result and put the four outputs under B12 in
   `docs/TASKS.md` for a fluent speaker to check (the founder will arrange it).

## Don't
- No translation of learner content, teacher-only text or anything unreleased.
- No new runtime dependencies.
- Don't change the English source or its verifier rules.

## Acceptance
| GIVEN / WHEN | THEN |
|---|---|
| Mma Lerato picks Setswana, a plan is issued | This week shows Setswana with the AI label; Show English works |
| A note is drafted but not sent | No translation exists or is served |
| The model drops a placeholder three times | The parent sees English only; the run is recorded `exhausted` |
| She taps Share to WhatsApp | WhatsApp opens with the action text, nickname only, no links |
| CI | All six jobs green |

## Git
Worktree `.claude/worktrees/b12`, branch `b12-home-language`. Before opening the PR,
`git fetch origin && git merge origin/main` and re-run the checks. Small commits; push; PR
with the completion report; stop when CI has finished. Do not merge.
