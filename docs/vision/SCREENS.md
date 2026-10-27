# SCREENS.md — Guardian Book v3, screen by screen

**v1 · 6 October 2026 · CTO-owned · Consumed by Claude Code (build) and Claude Design
(mockups).** Every screen below is specified the same way: purpose, what it shows (in
order), the one primary action, data in/out, states, design notes, and the acceptance
test the founder runs on his phone. `docs/DESIGN.md` is binding on every screen; where
this doc and `docs/PRD.md` differ, this doc wins (post-reset).

**Global laws (apply to every screen):** mobile-first at 360px, thumb-reachable primary
action, one primary action per screen, ≥16px body, AA contrast both themes, reduced-
motion parity, skeletons under 200ms perceived, every empty state teaches, every error
state offers a way forward, offline banner + retry on any network action, no dark
patterns, child-data minimization (nickname/grade/province only), Sentinel states used at
emotional moments only (never blocking content). Copy rules: verb-weight owning CTAs
("Start my practice"), specific numbers not adjectives ("Marked in ~20 seconds"), sentence
case. Fonts: Outfit (interface), Source Serif 4 (printed exam-question text). Tokens: the
closed Sentinel set (DESIGN.md §v2) — nothing off-palette.

**Navigation model (v3):** bottom tab bar on learner surfaces — **Today · Library ·
Progress · Radar · Me**. Guardian surfaces are a separate role-space under `/guardian`
with their own header (deep green). Public marketing + try-it lives at `/`.

**Track tags:** R = rebuild (must exist before hackathon), H = hackathon layer, N = next
(slot reserved, not built now).

---

## PART A — Public and onboarding

### S01 · Landing + "Try a real exam question" · `/` · R1/R2
**Purpose.** Transport, don't inform: the first thing a visitor sees is a REAL past-paper
question, and the easiest possible yes.
**Shows.** Sentinel lockup → one-line promise ("Real matric questions. Marked like the
real memo. In ~20 seconds.") → the hero IS a real question clip (e.g. 2024 P1 Q1.1,
exam-faithful image) with a typed-answer box directly under it → primary CTA "Mark my
answer" → beneath the fold: three real-content proof blocks (a marked mark sheet with memo
citations; a mastery ring; the guardian effort window) → "How it works" in three numbered
steps → footer (privacy, terms, contact).
**Primary action.** Mark my answer (creates an anonymous session on first use).
**Data.** Reads one featured question (public read of `questions` for the featured paper
only; memo never). Writes: anonymous auth session + `attempts` row on submit.
**States.** Loading skeleton for the clip; offline → "You're offline — the question is
saved, we'll mark it when you're back"; error → retry.
**Design.** DESIGN §2.1 (ask the easy question), §2.6 (real-content hero), no account
wall before value. Dark mode first-class.
**Accept (founder phone).** From a cold open, a visitor can answer a real question and
see a marked result without creating an account, in under 60 seconds on 3G.

### S02 · First result (anonymous) · `/practice/[questionId]/result` variant · R2
**Purpose.** The value moment, then the upgrade — never before.
**Shows.** The full S09 mark sheet (streamed) → celebration sized to the result →
Sentinel reacts → a single card: "Keep this. Your practice, your progress, your streak —
2 taps to save it" → CTA "Save my progress" (→ S03, attempts survive via session upgrade)
→ secondary "Try another question".
**Primary action.** Save my progress.
**Data.** Reads `mark_results` for the attempt; anonymous→permanent upgrade preserves
`attempts.user_id`.
**Accept.** The anonymous attempt is visible in Progress after sign-up.

### S03 · Sign up / sign in · `/auth` · R1
**Purpose.** Minimal identity: nickname, grade, province. Nothing else. Ever.
**Shows.** "What should Guardian Book call you?" (nickname) → grade chips (8–12, "not in
school yet" later) → province select → age gate ("Are you under 18?") → email or phone
magic link (no passwords) → consent text (attorney-reviewed; placeholder badge until F3
lands) → CTA "Start my practice".
**Primary action.** Start my practice.
**Data.** Writes `profiles` (id, nickname, grade, province, consent_status). Under-18 →
S04 gate before practice beyond the free try-it allowance.
**States.** Invalid/expired magic link → plain re-send; offline → explain and wait.
**Design.** Max 3 choices per step (DESIGN §2.4); timeline-style transparency for data
("We keep: nickname, grade, province. We never: your name, your photo, your answers to
anyone").
**Accept.** Sign-up in under 45 seconds; no real-name field exists anywhere.

### S04 · Under-18 gate (consent spine) · `/auth/consent` · R5
**Purpose.** POPIA competent-person consent as a feature, not a wall.
**Shows.** Transparency timeline (DESIGN §2.2): "Today: you link a guardian · Always: they
see your effort, your strengths and the school work your teacher marks — your own
practice stays yours unless you share it · Anytime: either of you can
unlink" → two paths: "Invite my guardian" (generates a code / WhatsApp share link) or
"My guardian is here" (guardian enters code on their device) → status card (pending /
active) → what the learner can still do while pending (practice continues; some surfaces
locked until active).
**Primary action.** Invite my guardian.
**Data.** `guardian_links` half-open invite (migration 005), consent fields service-role-
only; activation trigger-enforced; `profiles.consent_status` → `competent_person` on
activation.
**Accept.** Learner can invite, guardian can accept by code on another phone, learner
sees "active" without refresh gymnastics.

---

## PART B — Learner core

### S05 · Today (home) · `/today` · R4
**Purpose.** The single golden action, with the decision already made (DESIGN §2.5).
**Shows (in order).** Header: streak flame (tabular count) + mastery mini-rings → **exam
target card** ("Paper 1 · 29 days" — from `examDates`, countdown live) → **Today's
practice**: ONE recommended set (3 questions: e.g. 2 weak-spot + 1 review, with the
reason on its sleeve: "Geometry is your weak spot") + CTA "Start my practice" → quiet
escape "choose another topic" → **Radar teaser**: the single most urgent deadline
("NSFAS 2027 closes in 25 days") → Sentinel idle/encouraging state → bottom tabs.
**Primary action.** Start my practice.
**Data.** Reads `streaks`, mastery aggregates (from `mark_results`), `examDates`, adaptive
set (packages/core: 60% weak / 30% due / 10% new), radar items (H2). Writes none.
**States.** New user: empty state teaches ("No practice yet — your first marked answer
takes 2 taps") with a real question preview; streak at risk: caring copy ("Your 6-day
streak misses you"), never guilt; exam week: mercy copy, no streak pressure.
**Design.** DESIGN §3 engagement mechanics; §2.4 one number one choice.
**Accept.** Open → tap once → first question of today's set on screen; the exam card
shows the right real date.

### S06 · Library · `/library`, `/library/[subject]`, `/library/[subject]/[paperId]` · R2
**Purpose.** Find any official question in three taps; every list item looks like the
real paper.
**Shows.** Subjects (Mathematics first; others shown as "Practice + official memo
self-check" until their marking gate passes) → papers per subject (year · session · paper,
with DBE source badge "DBE · Nov 2024") → questions per paper: number, marks, topic
chip, mastery state (unattempted / attempted / mastered), and a thumbnail of the exam-
faithful clip.
**Primary action.** Open question.
**Data.** Reads `papers`, `questions` (incl. `image_path`, `has_diagram`, `context_text`).
Memo items never.
**States.** Paper with clips not yet reviewed → text rendering fallback with a quiet "clip
coming" note; offline → cached last-viewed paper.
**Design.** Source Serif 4 for question text; source badges truthful.
**Accept.** Subject → paper → question in 3 taps; the 2024 P1 list matches the real paper's
numbering 1:1.

### S07 · Question (practice player) · `/practice/[questionId]` · R2 (typed) · R3 (photo) · N (canvas)
**Purpose.** Answer the real question the way you work; nothing between you and the work.
**Shows.** Paper breadcrumb + marks available ("Q1.1 · 3 marks") → **the exam-faithful
clip** (E8 image, pinch-zoom, with `context_text` stem above when a sub-question depends
on it) → input mode switcher: **Type** (math-friendly textarea with a small symbol bar:
√ ² ³ π ÷ × ± ≤ ≥ θ), **Photo** (camera/upload, EXIF stripped client-side, 300s signed
upload), **Canvas** (N: finger/stylus drawing + writing; the clip can be set as the
canvas background for diagram questions; export → PNG → same photo pipeline) → CTA "Mark
my answer" → "Skip for now" (keeps place).
**Primary action.** Mark my answer — followed by the one-tap **confidence check**
("How sure are you?" sure / not sure; FEATURES §4.13a) before marking begins; stored
with the attempt, never shown to guardians.
**Focus toggle** (header): enters Focus Mode (S23) for this session.
**Data.** Reads `questions`; writes `attempts` (answer_text or image_path; user_id;
confidence_self) THEN calls `mark-attempt` (rate-limited 6/min; attempt-first recording). Non-Maths: memo
reveal + self-check per CTO ruling #6 (post-attempt only).
**States.** Marking → S08; photo too dark/blurry → inline guidance before upload; rate
limit → "Take a breath — marking opens again in 40s"; offline → attempt saved locally,
marked on reconnect.
**Design.** DESIGN §1.4 AI-surface patterns; A1 pink = act never wrong; question text in
Source Serif 4; the clip is sacred (no cropping of the figure).
**Accept.** Type an answer to 2024 P1 Q1.1 → marked result in ≤30s on 3G; photo of
handwritten work for the same question → marked result; the clip is pixel-faithful to
the PDF.

### S08 · Marking in progress · overlay on S07 · R2
**Purpose.** Kill the dead wait; show the marker working.
**Shows.** Skeleton mark sheet with one row per memo step (count known from
`questions.max_marks`/memo count server-side), rows resolving one by one as the result
streams; Sentinel "waiting" (crest raised); honest copy ("Checking against the official
memo…").
**Data.** Streams from `mark-attempt` (or polls `mark_results` if streaming is deferred —
the UX must still reveal step by step).
**States.** >30s → "Still marking — the memo for this one is long"; failure → "We couldn't
mark this one confidently" + options (try again / dispute / see the memo if allowed).
**Accept.** Perceived wait feels under 10s; nothing on screen is static for >2s.

### S09 · Result (mark sheet) · `/practice/[questionId]/result` · R2
**Purpose.** One headline number, then receipts, then ONE next action.
**Shows (top: the Marked Page, FEATURES §4.10).** The learner's own page — the photo,
the canvas export, or the typed answer laid out on a lined page — marked in pen:
hand-drawn ✓ per mark beside each step, ✗ on a lost step, the memo's codes (A / CA / M /
S / R) where the memo uses them, the total circled top-right ("4/6"), and short margin
comments in the legible handwriting face. Pinch-zoom; tap any ink comment to expand it
as plain text; pen colour from Me → Marking pen (default green). The structured mark
sheet follows beneath:
Headline "4/6" (tabular, big numeral, one emphasised word in pink: "**4** of 6")
→ confidence label (high/medium/low, always visible) → per-step rows: ✓ 1/1 or hollow ○
0/1 (A7: glyph + text, never colour alone), the memo criterion verbatim ("Memo: ∴ x = 3"),
feedback referencing the learner's working → for each lost step: pink action "1 mark to
reclaim" (→ S10 walkthrough; N: until built, opens the memo line + a "why" explainer) →
"Something wrong with this mark?" → dispute (S09a) → celebration sized to result (full
marks: crest fans open; partial: encouraging) → **next action**: "Next question" (today's
set) or "Done for today" when the set is complete → share card (S22).
**Data.** Reads `mark_results`, memo criteria (server-revealed post-attempt only). Writes
`streaks` events, XP on mastery events, `disputes` on dispute.
**States.** Low confidence → fail-closed copy ("I couldn't mark this confidently — here is
the official memo to check yourself"), no fake marks.
**Design.** A1 (missed = hollow, pink = act), A7, §1.4 source attribution, §2.4 one
headline number.
**Accept.** Every step shows a verbatim memo line; a 0-mark step never reads as
"correct"; founder can file a dispute in 2 taps.

### S09a · Dispute · sheet over S09 · R2
**Purpose.** The one free-text input in the product; the marker's learning loop.
**Shows.** "Which step?" (pick) → "What do you think happened?" (short text, max 300) →
"Send" → confirmation ("Thanks — disputes make the marker better. We'll review.").
**Data.** Insert-only `disputes` (immutable). Never editable by client.
**Accept.** Dispute visible in DB; student text treated as untrusted everywhere.

### S10 · Step walkthrough (Socratic) · sheet over S09 · N (slot reserved)
**Purpose.** Teach the step, never hand the answer (FEATURES §4.1, §4.9).
**Shows.** The step's memo criterion as the goal → Socratic prompt 1 ("What do we know
about…?") → learner reply (choice chips or short text) → prompt 2 → the reveal only after
engagement → "Try a similar one" → closes back to S09 with the step marked "revisited".
**Boundary.** Subject-scoped, question-anchored; no open chat; no personal topics.
**Accept (when built).** A learner cannot reach the answer without at least one
reasoning step.

### S11 · Progress · `/progress` · R4
**Purpose.** See the fight, not the homework: mastery, trajectory, history.
**Shows.** Mastery rings per topic (teal progress, tabular %) → trajectory chart of marks
over attempts (honest axes) → projected APS band teaser ("On this pattern: APS 34–38") →
practice history list (question · date · marks) → streak history with mercy events shown
truthfully ("freeze used").
**Data.** Reads `mark_results`, `attempts`, `streaks`, `aps_profiles`.
**States.** <3 attempts → "Rings fill after 3 marked answers — 2 to go" with CTA.
**Accept.** Rings reflect real marked results; nothing in Progress can be gamed by raw
volume (XP only on mastery events).

### S12 · APS & Pathways · `/aps` · R4 (calc) · H1 (Pathway Finder)
**Purpose.** Turn marks into doors.
**Shows.** APS calculator (ported logic, all official-language HL aliases) with a toggle
"use my practice marks" (projected from the Brain) → projected APS band → **Pathway
Finder** (H1): qualifying programmes from the curated dataset (institution · programme ·
APS required vs yours · subject requirements · source link · verified date) → "What
unlocks what": "+2 in Maths opens 6 more programmes" → subject-choice guardian narrative
card for Grade 9/10 (N: full feature; H: narrative + 2 example doors).
**Data.** Reads `aps_profiles`, curated `pathways.json` (in-repo, reviewed, sourced).
Writes `aps_profiles`.
**States.** No marks yet → manual-entry mode; dataset labeled "pilot dataset · 20
programmes · sources shown".
**Accept.** Entering real NSC marks gives the correct APS; each programme row shows a
working source link.

### S13 · Radar (Opportunity + Deadline) · `/radar` · H2 (deadlines) · H4 (opportunities)
**Purpose.** Nothing that belongs to your future passes unseen.
**Shows.** Top: **Deadline Radar** — urgent cards first ("NSFAS 2027 · closes 31 Oct ·
2 documents still missing"), each with a document checklist (checkbox state only, no
uploads) and "remind my guardian too" → below: **Opportunity Radar** — curated bursaries,
olympiads, open days, learnerships matched to grade/province/strengths, each with
eligibility, date, required actions, source → **Career-fit "Opportunity Radar"** card:
strong subjects → industry clusters → example careers + growth note + source, labeled
"directional signal based on public growth data" → entrepreneurship fork.
**Data.** Curated `funding.json`, `opportunities.json`, `careerfit.json` (reviewed,
sourced, verified_date); learner checklist state in a small table; guardian mirror.
**States.** Nothing matching → teach + "tell us your goals"; expired items auto-hide.
**Accept.** A real, current deadline shows a correct countdown; ticking a document box
persists; the guardian portal shows the same deadline.

### S14 · Guardian Record (living profile) · `/record` · H3
**Purpose.** Your work builds your future by itself.
**Shows.** Read-only profile assembled from state: practice volume, mastery by topic,
streak integrity, APS trajectory, badges earned by mastery → "What your applications
will reuse" preview (export as PDF/image later) → privacy note ("Only you see this until
you choose to share").
**Data.** Derived views; no new PII; nickname only.
**Accept.** Reflects real practice; contains no real-name or contact fields.

### S15 · Check-in (wellbeing) · sheet from Today during exam season · H5
**Purpose.** Structured support, never AI therapy.
**Shows.** 3-tap check-in ("How's your energy today?" low/ok/good → "What's heaviest?"
chips) → response: pacing suggestion (shorter set / streak freeze offered) → "Talk to
someone" panel: guardian (one tap "ask for a call"), teacher (when linked), SADAG line
and other real resources → copy that never diagnoses.
**Data.** Minimal: check-in enum + timestamp; never free text; never shown to guardians
as content, only as "checked in this week".
**Accept.** No free-text about feelings exists anywhere; resources are real and current.

### S16 · Countdown & plan · `/countdown` · R4 (countdown) · N (planner)
**Purpose.** Commitment consistency — the decision is already made.
**Shows.** All upcoming exam dates (official timetable, F4 verified) with countdowns →
"Your weak map vs days left" → N: planner that places sets on real days, built as
implementation intentions ("when, where, after what" — FEATURES §4.13h) with reminders at
that moment → on the morning of a paper: an optional **"empty your head" note** (private,
local-only, clears itself — Ramirez & Beilock; §4.13l) and a calm "what to carry" list.
**Accept.** Dates match the official DBE timetable; the note never leaves the device.

### S17 · Me (settings & privacy) · `/me` · R1 (shell) · R5 (consent/links)
**Purpose.** Ownership and transparency.
**Shows.** Nickname/grade/province edit → theme (light/dark/system) → language (interface;
N: feedback language) → data: "What we keep" list → guardian links (S18) → **Erase my
data** (full POPIA erasure, confirmation with plain words: photos deleted, identity
detached, disputes/golden data de-identified) → sign out.
**Data.** `profiles` update; erasure via server (tools/erase-user semantics exposed as an
endpoint later; v3: request → founder-run tool, honestly labeled turnaround).
**Accept.** Erasure request visibly recorded; no field asks for more than the minimum.

### S18 · Links (learner side) · `/links` · R5
**Purpose.** Invite and manage guardians.
**Shows.** Active guardians (nickname · since) → "Invite a guardian" (code + WhatsApp
share) → pending invites → "Unlink" with the transparency reminder.
**Data.** `guardian_links` (learner-side rights per RLS); nudges received.
**Accept.** Invite code shows and shares; unlink revokes immediately.

---

## PART C — Guardian role-space (`/guardian/*`, deep-green header)

### S19 · Guardian accept / onboarding · `/guardian/join` · R5
**Purpose.** Enter a code; understand the boundary; consent.
**Shows.** Code entry (4×4 groups) → the transparency timeline in the guardian's words →
consent panel (attorney text; placeholder badge until F3) → guardian nickname (role-aware
stub "Guardian" default, editable) → "Link".
**Data.** Accept by code; consent recorded service-side; activation.
**Accept.** From a WhatsApp link to active link in under 90 seconds on a second phone.

### S20 · Guardian home (effort window → Activity Window) · `/guardian` · R5
**Purpose.** See the fight, not the homework.
**Shows.** Per linked learner: practice days this week (7 dots), streak, topics rising /
stuck (aggregate accuracy, no questions, no answers), **session timeline** ("Tue 19:40 ·
22 min · Geometry · 7/10" — when, how long, which topics, totals; FEATURES §4.12),
assigned-set completion, "checked in this week" (never the content), last active →
**weekly digest card** (one improvable thing, one bright spot, one action — §4.13m) → **one-tap
"Send encouragement"** (kind locked to encourage; lands as "Mom sent you an
encouragement") → **deadline mirror** (H2: the learner's urgent items) → bright-spot /
early-warning cards (N) → multi-learner switcher (family) .
**Data.** Guardian aggregate views (`guardian_practice_days`, `guardian_streaks`,
`guardian_topic_accuracy`); `nudges` insert.
**States.** Learner inactive 7+ days → caring copy and a suggested action, never alarm;
no links → S19 CTA.
**Design.** Deep green header/chips only; aggregates for practice, plus released school
work (FEATURES §4.24) — the review gate rejects any surface showing private practice
attempts or photos the learner has not shared.
**Accept.** Nothing on this screen reveals a private practice attempt; released school
work appears only after teacher sign-off; the nudge
arrives on the learner's phone.

### S21 · Guardian guidance · `/guardian/guide` · H2 (deadline explainers) · N (full)
**Purpose.** Make the guardian powerful regardless of their own schooling.
**Shows.** Plain explainers: "What APS means", "Subject choice in Grade 9", "NSFAS in 5
steps", "How to help this week" tied to the learner's current stuck topic (study-support
tips only; FEATURES §4.3 boundary) → language toggle (N: 11 languages) → WhatsApp digest
opt-in (N).
**Accept.** A parent who never finished matric can explain APS after one card.

---

## PART D — Shared components and global surfaces

### S23 · Focus Mode · overlay state on practice (`?focus=1`) and `/me/focus` settings · H5/N
**Purpose.** The device goes dark around the work (FEATURES §4.11).
**Shows.** One tap from the practice header: full-screen practice on a near-black ground,
every in-app notification and nudge held, timer ring (default 25 min, "keep going" on
overrun, never a punishment), Sentinel in the corner "keeping watch" (crest raised), a
single "End focus" control → at the end: a quiet summary (questions, marks, minutes) and
"held notifications: 3" delivered now. First use: a one-time platform-specific tip to
turn on the phone's own Focus/Do Not Disturb (we cannot switch it from the web; the
native app later requests notification-policy access on Android; iOS allows adapting to
a Focus, not enabling it — say so plainly). Settings: default length, auto-focus for
exam-season sets, dim level.
**Data.** `focus_sessions` (learner, started, ended, questions, minutes); nudges/alerts
queued with `deliver_after`.
**Accept (founder phone).** No in-app interruption appears during a focus session; held
items arrive after; the screen is readable at the dim level on an entry-level Android.

### S24 · Marking pen (settings) · `/me/pen` · R2
**Purpose.** The learner chooses the pen the marker uses on their page.
**Shows.** Three real pens with a live sample of a marked step: **Green (default)**,
**Red (classic)**, **Blue** — plus the handwriting sample at the chosen size; a line of
plain words on why green is the default ("many learners find green marking easier to
come back to"). Beta: assignment is randomized red/green for the A/B unless the learner
changes it (disclosed in `/legal/ai`).
**Accept.** Changing the pen re-renders the last marked page instantly.

### S22 · Share card · generated image · R4
Pride artifact: "I scored 5/6 on a real 2024 exam question" with the clip thumbnail,
Sentinel, nickname only. WhatsApp-first sizing. No real names, no question text beyond
what's public in the paper.

### Global
- **Tab bar** (learner): Today · Library · Progress · Radar · Me. Guardian: Home · Guide ·
  Settings.
- **Offline banner** with queued actions count; **error boundary** page with a real next
  step; **empty-state system** (every list has a teaching empty state with a real
  content preview); **Sentinel component** with 5 states (celebrating / encouraging /
  waiting / concerned / proud) via crest position (DESIGN A5), reduced-motion crossfade.
- **Mark sheet component family**: `MarkSheet`, `StreamingMarkSheet`, `StepRow`,
  `ReclaimAction`, `ConfidenceLabel`.
- **Exam-faithful `QuestionClip`**: responsive image with pinch-zoom, lazy, retina,
  `context_text` slot, text fallback, source badge.
- **Input family**: `TypedAnswer` (symbol bar), `PhotoAnswer` (EXIF strip, size guard),
  `CanvasAnswer` (N).
- **Radar card family**: `DeadlineCard` (countdown + checklist), `OpportunityCard`,
  `CareerFitCard` (with its honesty label).

## PART E — Build order and ownership

| Order | Screens | Track | Gate |
|---|---|---|---|
| 1 | Global shell, tabs, S03, S17 shell | R1 | build + E2E smoke + founder shell test |
| 2 | S06, S07 (typed), S08, S09, S09a, S02, S01 | R2 | founder: typed answer → marked result |
| 3 | S07 photo path | R3 | founder: photo → marked result |
| 4 | S05, S11, S16, S22, S12 (calc) | R4 | founder: daily loop end to end |
| 5 | S04, S18, S19, S20 | R5 | founder + second phone: link → aggregates → nudge |
| 6 | S12 Pathway Finder, S13, S14, S15, S21 | H1–H5 | per HACKATHON.md + founder |
| 7 | S10, canvas, planner, guidance full, digests | N | next arc |

Every screen's acceptance line is the founder's phone test. "Done" is his word, nobody
else's.
