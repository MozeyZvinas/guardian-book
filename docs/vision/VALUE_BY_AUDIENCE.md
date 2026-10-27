# VALUE_BY_AUDIENCE.md — what each person gets from Guardian Book, and who pays

**v1 · 26 October 2026 · CTO-owned.** One product, four audiences. This document separates
them: for the learner, the guardian, the teacher and the school, the job they hire
Guardian Book to do, the value they get, the features that deliver it, what they can and
can never see, and how we measure it. The two buyers are **schools** and **parents**;
learners and teachers are the daily users whose experience makes those sales.

---

## 0. Who uses it, who pays

| Audience | Uses it | Pays | Sells it to others |
|---|---|---|---|
| Learner (Grade 8–12, 14–18) | Daily | Never personally. Their school pays for their seat, or the free core covers them | Shares results with friends; asks parents and school |
| Guardian / parent | Weekly, plus alerts | Nothing when the child's school is on a plan; otherwise an optional family plan; chooses paid help such as tutors | Talks to other parents and the school |
| Teacher | Every marking cycle, every week | Never personally. The school pays for each teacher's seat | The champion inside the school |
| School leadership (principal, HOD, owners) | Termly decisions, weekly views | **The school pays for its teachers and its learners** (seats), or buys the whole-school plan | Other schools, districts |

### 0a. How schools pay (founder ruling, 26 Oct 2026)

| Plan | Who it's for | What the school pays for | What everyone gets |
|---|---|---|---|
| **Seats** (class or department) | A school starting with one grade, subject or department | Each **teacher** seat and each **learner** seat, per year | Teachers: the marking console, class insight, assigned practice, personalised parent notes. Learners: the full app for their subjects. Their guardians: the full guardian app |
| **Whole school** | Schools that can afford to cover everyone | One annual plan for every teacher, every learner and every guardian in the school | Everything in Seats, plus **Guardian Book as the school's communication platform** (notices, letters, meeting bookings, one inbox per family, personalised notes), leadership views, early warnings across all grades, moderation, reporting and onboarding/training for staff |
| **Sponsored** | No-fee public schools that can't pay | Seats paid by a sponsor (company CSI programme, NGO, district or funder) | The same as Seats; the sponsor sees only aggregate impact, never learners' data |

Rules: the learner's free core (practice, self-marking, the Help Plan's free help) exists
for every learner whether or not their school pays; school plans add the teacher
console, school-assessed work, communication and school-wide insight. When a school
pays, its families pay nothing extra. Prices are set with the first pilot schools, not
in this document. Sell first to fee-paying and independent schools, then districts and
sponsors.

Learners never see advertising or paid offers. Paid options appear only in adult spaces
(guardian and school), labelled, and never ranked by who pays (FEATURES §4.19).

## 1. The flow that connects all four: one marking, four outcomes

This is the school product, and the reason teachers and principals buy in:

1. **Scan.** The teacher photographs or scans a class set of scripts (photo batch, or a
   short phone video panning across the stack). SAM 3.1 finds each page and question
   region, and masks the name box before anything is stored.
2. **Match.** Each script is matched to a learner by a printed learner code on the
   answer sheet (QR or short code), or by scanning in class-roster order; anything
   unmatched goes to a quick manual pick.
3. **Mark.** The AI marks every question against the official or teacher-supplied memo,
   step by step: memo line cited, consistent-accuracy follow-through applied, confidence
   on every mark. Anything low-confidence is flagged instead of guessed.
4. **Confirm.** The teacher reviews in a keyboard-fast console: accept, adjust, sign off.
   The teacher is the marker of record; nothing reaches a learner or parent until the
   teacher releases it. The time-saved meter shows the hours handed back.
5. **Release, and everyone gets what they need:**
   - **Learner:** the marked script on their phone, per-step feedback, the Help Plan,
     today's practice built from their gaps, free lessons and practice made or vetted
     for them.
   - **Guardian:** the marked script itself (with the teacher's marks and feedback), the
     result in plain language, where the child is losing marks, how to help this week,
     free and paid options (tutors, resources) labelled, and the teacher's personal note.
   - **Teacher:** the class picture ("14 of 32 lost marks on negative exponents"), the
     list of who needs help with what, and one-click personalised notes to each parent.
   - **School:** cohort and subject views, early warnings before trials and finals,
     moderation evidence, time saved across staff.
6. **Help.** The hours saved go to the learners on the "needs help" list: small-group
   support, re-teaching, mentoring. That is the point of the product.

Learners practising on their own (self-practice, not school assessment) get marks
instantly; only school-assessed work waits for teacher release.

## 2. Learner

**The job:** "Show me exactly where I lose marks and help me fix it, wherever I am. Help
me get where I dream of going, show me the chances I'd never find alone, and make sure
I always have someone when I need them." (Whole-learner scope: docs/WHOLE_LEARNER.md.)

| Value | Features that deliver it |
|---|---|
| Know how you did, in detail, fast | Marked page with receipts: each step ✓/✗, the official memo line, per-step feedback on your own handwriting; school work arrives as soon as the teacher releases it |
| Know exactly what to do next | Help Plan (your exact gap), today's set built from your gaps, "reclaim this mark" tutor that teaches the step instead of giving the answer |
| Learn anywhere, on your own | Pocket Mode (5-minute sets, offline, low data), notepad photos marked on reconnect, guided self-marking, confidence check |
| Practise on the real thing | Official past papers for every subject, questions shown exactly as printed |
| See yourself improve | Mastery rings, the Brain page, streaks with mercy, marks reclaimed over time |
| See your future clearly | Subject-choice map, pathways and careers with real demand signals, deadlines and bursaries you qualify for |
| Stay a step ahead, as you grow | "Next up in class" previews before the class gets there; "Ready for more" stretch work the moment a topic is mastered; the plan adapts with every answer and every term; the Growth timeline shows what changed and why (FEATURES §4.32) |
| Be known as a whole person | The Me page (dreams, hobbies, causes, proud moments), owned by you and shared only if you choose |
| Turn a dream into steps | Dream → plan: the subjects, scores, funding and this month's step, all sourced |
| Find chances you'd never find alone | The Opportunity Radar: Olympiads, expos, competitions, holiday programmes, volunteering and youth programmes matched to what you love, with deadlines in your plan |
| Never alone | "Help now" in one tap (Childline, SADAG, one of your people, your school's support person); My people (the trusted adults you choose); a week with room for life |
| Help from people who already get you | Mentors, tutors and coaches who arrive with your Brief (you approve what's in it), vetted and safe |
| Own your story | The Guardian Record: what you have mastered and achieved, inside and outside the classroom, verified, yours |

**Sees:** everything about their own work. **Never sees:** ads or paid offers, other
learners' marks, leaderboards on learning surfaces. **Measured by:** marks reclaimed,
unassisted retest improvement, weekly active practice.

## 3. Guardian / parent (buyer)

**The job:** "Tell me how my child is really doing and exactly how to help, even if I
don't know the subject and don't have much time."

| Value | Features that deliver it |
|---|---|
| Never the last to know | Effort window (practice days, effort, topics rising or stuck), the marked school work and results as soon as the teacher releases them, early-warning and bright-spot alerts |
| Know how to help without knowing the maths | Help Plan: the gap in plain language, why it matters, a 10-minute action for this week, free resources first, paid options labelled |
| Spend money only where it helps | Tutor Brief: a one-page summary of exactly what a tutor should work on, so a paid hour goes to the real gap |
| A real line to the school | Personalised notes from the teacher about their own child, not one blanket letter |
| Never miss a door | Deadline mirror (NSFAS, bursaries, applications) and the subject-choice explainer |
| Peace of mind | Consent and control: they link with the child's agreement, see effort and gaps, and can unlink |
| Be one of their child's people | Named by the child as a trusted adult; gentle nudges on how to show up when a week is heavy (only what the child allows); the safety rule for immediate danger, explained up front |
| The right helper, already briefed | The Brief for any tutor, mentor or coach; vetted helpers; sessions visible; free and volunteer options first |

**Sees:** the child's released school work in full (marked scripts, marks, teacher
feedback), aggregates of effort and practice, plain-language gaps, teacher notes,
deadlines. **Never sees:** the child's private practice attempts unless the child chooses
to share them, or any psychological characterisation of the child (FEATURES §4.24). **Why parents pay (later, optional):** multi-child views,
deeper reports, help booking; never the child's basic access. **Measured by:** digest
opened, help actions taken, Tutor Briefs used, child's improvement.

## 4. Teacher (the champion)

**The job:** "Give me my evenings back without lowering marking quality, and show me who
needs me."

The evidence: South African teachers report **7.1 hours a week marking and correcting
work, against an OECD average of 4.6**, and **72% name too much marking as their most
common source of stress** (OECD TALIS 2024).

| Value | Features that deliver it |
|---|---|
| Time back | Scan → AI marks → confirm; the time-saved meter |
| Marking you can stand behind | Memo-cited marks, consistent-accuracy rules, confidence flags, you decide every final mark |
| Feedback at a scale no person can manage | Every learner gets detailed per-step feedback and their own practice plan automatically after release |
| Know who needs you | Class insight, the "needs help" list by topic, intervention suggestions |
| Talk to parents one by one | Personalised notes drafted from each child's picture, edited and sent by you |
| Set the right practice | Assign sets from the library; see who did them |

**Sees:** their classes' work, marks and insight. **Never:** per-teacher league tables
or performance rankings (the anti-surveillance covenant). **Measured by:** minutes per
script, share of AI marks accepted unchanged, hours saved per term, how many learners on
the "needs help" list improved.

## 5. School leadership (buyer)

**The job:** "Raise results and parents' confidence across the school, with evidence,
without adding to teachers' load."

| Value | Features that deliver it |
|---|---|
| Teacher capacity redirected to support | Time saved across staff, visible per term |
| Problems seen early | Cohort and subject views, early warnings before trials and finals |
| Consistent, defensible marking | Memo citations, confidence flags, teacher sign-off, moderation samples |
| Parents engaged | Personalised notes, guardian app adoption, fewer "I didn't know" moments |
| Every learner gets personal support | Each learner's own Help Plan and practice, not one approach for the whole class |
| Compliance and trust | POPIA data agreement, school as responsible party, no per-teacher rankings |
| One place to talk to every family (whole-school plan) | Notices, letters, meeting bookings, one inbox per family, personalised notes, read receipts, in the guardian's language |
| Support that reaches every learner (Care) | "Help now" and My people for every learner; a private support queue for the school's support team; human-led group programmes through partners; a safety protocol with a named lead (docs/WHOLE_LEARNER.md) |

**Why schools pay:** the school pays for its teachers' and learners' seats, or buys the
whole-school plan that also makes Guardian Book the school's communication platform
(§0a). Priced with the first pilot schools; sold first to fee-paying and independent
schools, then districts and sponsors. **Measured by:** hours saved per teacher, results
movement on retests and trials, parent engagement, share of families reached.

## 6. Who sees what

| Item | Learner | Guardian | Teacher | School leadership |
|---|---|---|---|---|
| Own answers, photos, marked scripts | Yes | **Yes for school work after the teacher releases it** (like a marked test sent home to sign); private practice only if the learner chooses to share it | Yes (their classes) | Samples for moderation only |
| Per-step feedback | Yes | Yes on released school work; the plain-language gap for practice | Yes | No |
| Marks and results | Yes | Summary after release | Yes | Aggregates |
| Effort and practice activity | Yes | Yes (aggregates) | Yes (their classes) | Aggregates |
| Help Plan | Learner view | Guardian view | Teacher view | No |
| Paid offers | **Never** | Yes, labelled | No | No |
| Per-teacher comparisons | — | — | — | **Never** |

## 7. Rules that make this safe to sell

1. **Release gating:** school-assessed AI marks reach learners and guardians only after
   teacher sign-off.
2. **Names on scripts:** masked before storage. Inside the school space, a school may
   display the names it provides, visible only to that school's teachers and held under
   the school's data agreement. Guardian Book's own learner surfaces stay nickname-only.
   Attorney review (F3) before the first school pilot.
3. **Commercial content to adults only;** free first; labelled; no pay-to-rank.
4. **Guardians see released school work in full; practice is the learner's own space**
   (effort and gaps visible, attempts private unless the learner shares). FEATURES §4.24.
5. **The hackathon uses no real learner data:** scripts written by consenting adults,
   fictional learners.

## 8. The sell, in one paragraph each

**To schools:** "Your teachers spend about seven hours a week marking. Guardian Book
marks the pile against the memo, your teachers confirm in minutes, and every learner and
parent gets detailed feedback the same day. The time saved goes to the learners who need
your teachers most, and you see where every grade is heading before the exams, not
after. Start with the teachers and learners who need it most, or take the whole-school
plan and run all your parent communication through it too."

**To parents:** "Know how your child is really doing and exactly how to help, even if
you've never done this work yourself. Free help first, paid help only where it counts,
and a direct line to the school about your child."

**To learners:** "Your marks, explained step by step, wherever you are. Fix the exact
thing you keep getting wrong, and see where it can take you."

**To teachers:** "Get your evenings back. You stay the marker; Guardian Book does the
pile and tells you who needs you."

---
*Sources:* OECD TALIS 2024 country note, South Africa (7.1 h/week marking vs OECD 4.6;
72% cite too much marking as a top stressor) · DBE TALIS 2024 South Africa country
report. Related canon: FEATURES §4.19–4.20, §4.22–4.23 · VISION_FULL §3–4 ·
META_HACKATHON §4.
