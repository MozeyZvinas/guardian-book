# B17 · The past-paper engine: real exam questions power the bank, the library, the guide and the proof

**Status:** APPROVED (planning session, 4 Nov 2026; D40)
**Risk tier:** High (third-party content, public claims)
**Model:** Fable 5.1 on the Claude subscription
**Why:** 989 English DBE papers and memos sit in the founder's Cloudflare R2 bucket
(`guardian-book-dbe`) and nothing in the app uses them. Turn them into the app's intelligence:
real NSC questions with their official memos, in a library learners can browse, feeding every
existing loop, and measured on the proof page.

## Rules that do not bend (D40)
- **Attribution stays.** Every question keeps its source ("NSC Mathematics P1, November 2023,
  Q3.2 · Department of Basic Education"), shown wherever the question is shown. We never strip
  copyright notices or disguise where a question came from.
- **No DBE content in the public repo**, tests or screenshots committed to it. Extracted data
  lives in `~/guardian-book-corpus/` (outside the repo) and in the database. Tests use
  synthetic fixtures.
- **Behind sign-in only.** Library and bank routes require a session, send
  `X-Robots-Tag: noindex, nofollow, noarchive`, and never expose a direct PDF or bucket URL.
  "Download" links to DBE's own free past-papers page for now (Pro downloads wait for written
  permission).
- **No training or fine-tuning on DBE content** (D31). "Intelligence" here means structure,
  retrieval and measurement.
- R2 access is a **read-only** token in the git-ignored `.env` (`DBE_R2_ENDPOINT`,
  `DBE_R2_BUCKET`, `DBE_R2_ACCESS_KEY_ID`, `DBE_R2_SECRET_ACCESS_KEY`); never printed, never
  committed.

## Phases (run A first; B in parallel against a fixture; C after A)

### A · Extract (tooling in `apps/api/src/corpus/*`, data outside the repo)
1. List the bucket; pick **Mathematics Grade 12, Papers 1 and 2, English, with memos**, newest
   sessions first (2025, 2024, 2023, 2022; Nov and May/June). Download each PDF to
   `~/guardian-book-corpus/raw/`, rasterise pages (poppler `pdftoppm`; install with Homebrew if
   missing, asking first).
2. For each paper, Muse Spark (vision + structured output, through the gateway, `model_runs`
   recorded, purpose `extract`, additive migration) returns every question and sub-question:
   number, `prompt_md` with `$…$` maths, marks, whether it needs a diagram (crop the diagram
   region from the page image as a PNG and store it in the private bucket under the item, with
   `diagram_key`), and topic. For the matching memo: each question's marking steps (criterion,
   M/A/CA type, marks). Verifier: step marks sum to the question's marks; numbering matches
   between paper and memo; maths delimiters balance. Anything that fails three times is kept
   as `draft` with its reason, never approved.
3. Map each question to the skill tags (extend the taxonomy in
   `packages/shared/src/brain/skills.ts` with new tags and plain labels in all three wordings).
4. Write items in the loader format (extend B02's loader: `source: 'dbe_nsc'` allowed with
   required `source_ref` and `attribution`, provenance `licensed_content`) to
   `~/guardian-book-corpus/items/`, then `pnpm content:load` them into the local database.
   Report counts per paper: questions found, memo-aligned, approved, draft.
5. Hold out the newest session (D31): its items are tagged `held_out` and kept out of practice
   suggestions; they feed phase C only.

### B · In the app (start immediately against a 5-item synthetic fixture in the same format)
1. **Library** (`/library`): Subject → Grade → Year → Session (Feb/March, May/June,
   November) → Paper; a paper view lists its questions rendered with `MathText` and diagrams,
   with marks and the attribution line. Each question offers **Check my work** (the existing
   homework check, using the memo steps as the guideline) and **Help me with this** (B15's
   guide, if merged; else hidden). Memo steps show after the learner's own attempt, or to
   teachers. Search by topic. Beautiful on a phone: sticky year/session chips, a progress mark
   on questions you've done.
2. **Teachers:** approve a whole paper's guidelines for a class in one action (each question
   still listed), and set a paper or a topic set as class practice with a due date (lands on
   learners' Today and parents' "What's coming").
3. **Parents:** "This week" shows practice done from past papers in plain words ("Lerato did 3
   past exam questions on factorising; 2 on her own") and the next real exam date.
4. **Brain and Help Plans use the bank:** check-it-alone and follow-up checks draw from real
   exam questions on the same skill (excluding held-out); the plan agent's `getResources`
   includes "a past exam question on this skill" with its source.
5. **"What comes up":** per skill, how often it appears and how many marks it carries across
   the extracted papers ("Factorising: in every Paper 1 since 2022, about 6 marks"), shown on
   Brain chips and in the teacher's class picture.
6. **Privacy (founder, 4 Nov):** crawlers may read only the public pages: `/`, `/try`, `/evidence`
   (plus static assets and `robots.txt`). Every other HTML route, including `/signin` and
   `/signup`, and every `/api` response sends `X-Robots-Tag: noindex, nofollow, noarchive`;
   `robots.txt` (B09) also disallows `/library`; a test asserts no library response contains a
   bucket URL.

### C · Measure (after A)
On the held-out session: for each question, does Muse Spark's guide (B15, or the work-check
prompt on the memo's own model answer) reach the memo's final answer? And for a sample of
synthetic wrong answers (one step perturbed), does the work check name the lost step? Write
both to `evals/results/latest.json` with n and intervals and the label "held-out NSC questions
(newest session), memos as truth"; the proof page shows them. Cost cap $10.

## Tests
Loader accepts `dbe_nsc` only with `source_ref` and `attribution`; library routes 401 without a
session and carry the noindex header; held-out items never appear in practice; attribution
renders on every question view; Playwright at 390: Library → 2023 → November → P1 → a question
→ Check my work.

## Git
Worktrees `.claude/worktrees/b17a` (phase A, branch `b17a-extract`) and `b17b` (phase B,
branch `b17b-library`); phase C rides on `b17a` or a third branch. Own Postgres and e2e ports.
Merge `origin/main` before each PR; push; PR; stop when CI has finished. Do not merge.
