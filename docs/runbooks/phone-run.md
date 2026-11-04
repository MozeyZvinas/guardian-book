# Runbook · The full phone run (Gate P0)

**When:** as soon as B06 and B07 are merged and Railway shows the new deploy **Active**.
**Who:** the founder, with a phone and a laptop. About 45 minutes.
**Why:** nothing counts as live until it works on the founder's own phone (D7). This run is
also the rehearsal for the video: every screen below is a shot.

Write down anything that goes wrong in the log at the end (screen, what you did, what you
saw). Don't stop to fix things; finish the run, then send the log to the planning session.

## 0. Before you start (laptop, ~10 minutes)

1. **The app is on the latest version.** Open `https://guardianbook.app/healthz` in a
   private window: `"ok":true`, `db`, `auth`, `meta`, `bucket` all `true`, `"db":"up"`.
2. **Load the 12 practice questions and the help list into Railway.** Turn on the
   database's public access (Railway → Postgres → Settings → Networking → **Add Public
   Access**), copy `DATABASE_PUBLIC_URL` from its Variables, then run each line on its own
   at a `%` prompt:
   ```
   cd ~/projects/guardian-book && git pull && pnpm install
   ```
   ```
   read -s "DATABASE_URL?Railway public DB URL: "; echo; export DATABASE_URL
   ```
   ```
   pnpm content:load ~/projects/guardian-book-private/content/items
   ```
   ```
   pnpm resources:load ~/projects/guardian-book-private/content/resources/resources-load.json
   ```
   ```
   unset DATABASE_URL
   ```
   Expect "12 inserted" and "23 inserted". Then remove the public access again.
3. **Have these ready:**
   - The demo password (the one you chose at the last seed) and the 12A class code.
   - A sheet of paper and a pen (step 2.2).
   - `notice-1-maths-revision.png` from `guardian-book-private/content/notices/`, printed or
     open on the laptop screen so the phone can photograph it.
   - Two private browser windows on the phone (or one private window in Safari and one in
     Chrome), so the learner and the parent can be signed in at the same time.

| Person | Email | Where |
|---|---|---|
| Teacher | `ms-dlamini@demo.guardianbook.test` | Laptop |
| Learner | `lerato@demo.guardianbook.test` | Phone, window 1 |
| Parent | `mma-lerato@demo.guardianbook.test` | Phone, window 2 |

All three use the demo password.

## 1. Teacher: approve the marking (laptop)

1. Sign in as **Ms Dlamini**. You land on **My classes**. Open **12A**.
2. Open **Guidelines**. Find *Solve for x: x(x − 4) = 12* (`alg-01-solve-by-factorising`).
   It is labelled **AI-drafted: check before approving**. Read its three steps, then
   **Approve for 12A**.
3. Approve the other four questions that test factorising the same way:
   `alg-03-quadratic-inequality`, `alg-04-simultaneous-equations`,
   `seq-04-arithmetic-sum-equation` and `calc-04-turning-points`. "Check it alone" and the
   follow-up check pick from these, and a question can't be checked for 12A until it is
   approved.
4. **Class notice:** upload `notice-1-maths-revision.png` (or photograph it). Expect the
   dates to appear (Algebra test Thu 12 Nov, Calculus test Tue 17 Nov, extra classes, parents'
   evening). Confirm them. Expect "Published to n learners and m parents".

**Pass if:** the five questions show as approved for 12A and the four dates are on the class
calendar.

## 2. Learner: bring, check, fix, check it alone (phone, window 1)

1. Sign in as **Lerato**. You land on **Today**. If it asks **Tell me about you**, answer the
   four prompts in a few words (or skip). Expect four short cards with no labels about
   mood or personality.
2. **Write this on paper** (the deliberate mistake is in line 3; the factors are wrong):
   ```
   x(x − 4) = 12
   x² − 4x − 12 = 0
   (x + 6)(x − 2) = 0
   x = −6 or x = 2
   ```
3. Tap **Bring anything** → take a photo of the paper → when asked what it is, choose
   **Homework** → **Which question is this?** pick `alg-01-solve-by-factorising` →
   **Check my work**.
4. Expect the waiting state ("Reading your work…") for up to about 30 seconds, then the
   **feedback**: the question shown as proper maths, step 1 earned, **step 2 (factorising)
   lost**, step 3 earned on consistent accuracy (2 of 3). A hint, never the answer.
5. Tap **Fix it**. Redo only the lost step by typing `(x − 6)(x + 2) = 0`.
   Expect "You fixed it on your own".
6. Tap **Check it alone**. You get a different factorising question with no hints. Answer
   it correctly:
   - `alg-03` (x² − x ≤ 12): `x² − x − 12 ≤ 0`, `(x − 4)(x + 3) ≤ 0`, `−3 ≤ x ≤ 4`
   - `alg-04` (y = 2x − 1 and x² + xy = 14): `3x² − x − 14 = 0`, `(3x − 7)(x + 2) = 0`,
     `x = 7/3, y = 11/3` or `x = −2, y = −5`
   - `seq-04` (5 + 8 + 11 + … = 124): `n/2 [2(5) + (n − 1)(3)] = 124`, `3n² + 7n − 248 = 0`,
     `(3n + 31)(n − 8) = 0`, `n = 8`
   - `calc-04` (turning points of g(x) = x³ − 3x² − 9x + 5): `g'(x) = 3x² − 6x − 9 = 0`,
     `3(x − 3)(x + 1) = 0`, `(3 ; −22)` and `(−1 ; 10)`
   - a seed question x² − 5x + 6 = 0: `(x − 2)(x − 3) = 0`, `x = 2 or x = 3`

   Expect "You did it on your own".
7. Open **Brain**. Expect *Factorising into two brackets* with **with help** and **on your
   own** marked, and **later** due in two days. It is not yet *secure*; that needs the
   follow-up check on another day. This is correct.
8. Back on **Today**: expect the exam chip (from the class notice) and tonight's step from the
   Help Plan.
9. **Notice by the learner:** Bring anything → photograph `notice-2-term-dates.png` (if you
   have it) → expect proposed dates to confirm, and "Next Friday" or "to be confirmed" lines
   flagged rather than guessed.

**Pass if:** one check, one fix, one independent check, the Brain moved, and no answer was
given away.

## 3. Parent: this week with Lerato (phone, window 2)

1. Sign in as **Mma Lerato**. You land on **This week with Lerato**.
2. Expect, in plain words: something to celebrate, effort this week, what's coming (the
   algebra test), **the one gap at topic level** ("factorising"), **one 10-minute action**,
   and free help first.
3. Expect **no** attempt, answer or photo anywhere on the parent's screens.
4. Tap **We did it**. Tap it again: still recorded once.
5. **Settings** shows what a parent can and can't see.

**Pass if:** the parent understands the gap and the action without any maths.

## 4. Teacher: review, release, act, write home (laptop)

1. Open **12A → Queue**. Lerato's attempt is there (uncertain ones first).
2. Open it (**Review**, two panes). Expect her photo, each step with the model's proposal,
   the evidence and the **checks list** (each verifier rule passed or failed).
3. Agree with step 1; **Correct** the explanation on step 2 in your own words; **Add** a
   short note for the **Guardian** audience. **Confirm**, then **Release**.
4. Open the **class picture**. Expect the shared gap ("n of m lost the mark at step 2 of
   factorising"). **Assign** an intervention to Lerato with a follow-up date of today.
5. Back on the learner's phone (window 1), **Today** shows the check-in from the teacher.
6. **Notes home:** open the AI-drafted note for Mma Lerato. Expect it labelled as a draft.
   Edit one word, **Approve**, **Send**.
7. Back on the parent's phone (window 2): **Notes** shows the note labelled
   **Teacher-reviewed**, and This week shows the teacher's guardian-audience feedback.
8. Open **Lerato's profile (T6)**: the skill with its three marks, open intervention, no
   dream or raw profile text.

**Pass if:** the teacher's release reached the learner, and the approved note reached the
parent labelled correctly.

## 5. The proof page (any device)

Open `https://guardianbook.app/evidence`. Expect the table with denominators and intervals,
the honest dataset label, the privacy line and "Built 26 Oct – 4 Nov 2026".

## 6. Log (fill in as you go)

| # | Screen | What I did | What I saw | Expected |
|---|---|---|---|---|
| 1 | | | | |
| 2 | | | | |
| 3 | | | | |

Send this table to the planning session, with screenshots of anything that looked wrong.
