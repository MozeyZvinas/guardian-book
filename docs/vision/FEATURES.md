# FEATURES.md — Problems → Promises → Features (the operating map)

**v1 · 2026-10-05 · CTO-owned.** docs/VISION_FULL.md carries the whole organism; this
document is its working skeleton: every feature ever listed, organized by the problem it
kills and the promise it keeps, with honest status. A feature with no promise behind it
does not ship. A promise with no feature behind it does not get made.

Status tags: **LIVE** (in production) · **H** (hackathon Track H, docs/HACKATHON.md) ·
**NEXT** (current arc) · **LATER** (earned, in order) · **GUARDED** (allowed only inside
a stated boundary) · **RETIRED** (closed, with reasons — see VISION_FULL §14).

> **⚠️ RESET V3 (founder ruling, 2026-10-05, same day as v1 of this doc):** nothing is
> product-live; v2's user-facing surface is retired. Until Track R (TASKS.md) delivers
> the v3 rebuild, read every **LIVE** tag below as **ENGINE** — the asset exists in the
> repo (dataset, marking pipeline, schema, core logic) but its product surface is being
> rebuilt from zero and must pass the founder's phone test before anything is called
> live again.

---

## 1. The problems we exist to kill

P1. **The feedback gap.** A learner writes; feedback arrives weeks late or never. By the
    time anyone sees the gap, it has compounded. Teachers drown in marking; parents find
    out at the June report; the learner finds out in the matric hall.
P2. **The blindness problem** (the founding scar): *you cannot look for what you do not
    know.* Subjects chosen blind, bursaries missed, programmes never heard of, deadlines
    discovered after they pass — talent lost to ignorance of the map, not lack of ability.
P3. **The lonely learner.** No tutor money, no one at home who can help with the work,
    nothing between "stuck" and "give up" except a distracting internet.
P4. **The gate pile-up.** Matric → applications → funding → first job is a chain of
    paperwork cliffs (218k NSFAS applications died incomplete for 2026 alone) that no one
    walks the learner through.
P5. **The cold start of every system.** Every school year, every application, every job
    hunt starts from zero because nothing carries the learner's verified story forward.
P6. **The unsupported supporters.** Parents who never got this schooling can't decode
    APS, NSFAS, or subject choice; teachers can't see class-wide gaps until exams; both
    care, neither has instruments.

## 2. The promises (what we are telling users — each must be keepable on screen)

To the **learner**:
- PR1 "**You will never wait to know how you did.** Seconds, not weeks — with every mark
  explained against the official memo, and the right to dispute."
- PR2 "**You will always know what to do next.** Your weakest topic, today's set, the
  exact step you keep missing — and the path to close it without leaving the app."
- PR3 "**Nothing that belongs to your future will pass you unseen.** Bursaries,
  programmes, deadlines, subject-choice consequences — watched for you, in time."
- PR4 "**Your work builds your future by itself.** Every marked answer becomes part of a
  verified profile that applies to universities, funders, and one day employers with
  you — no cold starts, ever."
- PR5 "**You will never be stuck alone.** An AI tutor on every step, humans when you
  need them, and someone who cares kept in the loop."
- PR6 "**Your chance is free.** The core never costs the learner; those who benefit from
  your talent (schools, funders, employers) are the ones who pay."

To the **guardian/parent**:
- PR7 "**You will never be the last to know — and you'll always know how to help.**
  Effort, growth and the marked school work in real time, in your language, with plain
  guidance; never surveillance of private practice."

To the **teacher/school**:
- PR8 "**Marking stops eating your life, and gaps surface the day they form** — you stay
  the marker of record; we carry the pile."

To **funders/employers** (the economy around the learner):
- PR9 "**Talent, verified by evidence, findable with consent** — fund and hire on proof
  of growth, not paperwork."

System promise over all of them: **zero feedback gaps** — learner, guardian, teacher see
the same truth in real time, from any age of interception.

## 3. The feature map (promise → features → status)

### PR1 · Instant, explained, honest marking — kills P1
- AI marking of typed + photographed handwritten work, per-step, verbatim official-memo
  citation, ~20s — **LIVE** (Maths, 11 papers / 519 questions, eval-gated)
- Confidence honesty (refuses to guess; low-confidence fail-closed) — **LIVE**
- **Exam-faithful rendering** (founder law, 2026-10-05): every question on screen looks
  EXACTLY as printed on the real paper — same figure, layout, typographic feel — via
  per-question image clips from the source PDFs (text retained underneath for
  search/accessibility). Familiarity with the real exam page is part of exam readiness —
  **NEXT** (task E8)
- Dispute flow (every dispute improves the marker — it already has) — **LIVE**
- "Why it was wrong": per-step feedback referencing the learner's actual working — **LIVE**
- **Answer any way you work** (founder, 2026-10-05): typed · photographed paper · or an
  on-screen **canvas** (finger/stylus) to write and draw — canvas output enters the SAME
  vision-marking path as a photo (one pipeline, three inputs); geometry questions offer
  the diagram as the drawing background — canvas **NEXT** (§4.6); live ink-to-text
  ("write it and it pops up as typed text") — **LATER**
- Full subject universe: practice + official memo self-check all subjects — **NEXT**
  (library depth); AI-marking per subject strictly behind its own golden-set gate — e.g.
  Maths Lit next — **NEXT/LATER**
- Marking in home languages — **LATER** (Language & Access layer)

### PR2 · Always a next step — kills P1, P3
- Adaptive daily set (weakest-topic weighting, spaced review, exam proximity) — **LIVE**
- Per-learner challenge profile: mastery rings, trajectories, the Brain's picture of
  where this mind struggles and thrives — **LIVE**, deepens with every attempt
- **Gap-closing plan** (founder, 2026-10-05): the profile turns into a proactive plan —
  "your three gaps before trials, in order, with the capsule for each" — **NEXT**
- Tutor-grade Socratic step walkthroughs (the AI tutor, on the step you missed) —
  **NEXT**, GUARDED (see §4.1)
- **Lesson Capsules — the no-distraction layer** (founder, 2026-10-05): every gap links
  to a capsule *inside* Guardian Book — worked examples, micro-explanations, and in time
  our own short videos — so a stuck learner is never sent to YouTube/social media to be
  eaten by the feed. v0 = generated worked-example pages + curated free content
  (Siyavula-class, vetted) — **NEXT**; own-produced video library — **LATER**
- Generated practice, exam-faithful, quality-gated — **LATER** (P2-gated)
- Study architecture: exam countdown **LIVE**; study planner, exam-mode intensives,
  offline packs — **NEXT/LATER**

### PR3 · The watch — kills P2 (the founding feature-set)
- Opportunity Radar: curated personalized feed of deadline-bound doors (bursaries,
  olympiads, open days, learnerships) — **H4 v0 → NEXT v1**
- Deadline Radar: every date + required document tracked, learner AND guardian nagged
  before cutoffs, not after — **H2 v0**
- Subject-choice guardian (the Maths-Lit trap, dismantled at decision time with the
  learner's own data) — **LATER**, demo narrative allowed in H; founder emphasis
  2026-10-05: this fires at the Grade 9 → 10 decision window, and its explanations ship
  in every modality (§4.7) — a learner can *see* the doors each choice opens/closes
  (visual pathway map), hear it, or read it
- Pathway Finder: live APS from real marks → qualifying programmes + what one subject's
  improvement unlocks — APS calc **LIVE**, matching **H1 v0**
- Career-fit intelligence: mastery patterns × growing industries → employment odds at
  graduation year + entrepreneurship fork ("signal, not prophecy") — **H4 v0 → LATER**

### PR4 · The living record — kills P4, P5
- Guardian Record / Living CV: auto-assembled verified profile from Grade 8 on — **H3
  v0 → LATER** (full)
- Gateway suite: guided university/TVET/CAO applications, NSFAS companionship, fee
  waivers, bursary matching with consent — **LATER** (H demos the radar + record slices)
- First-CV generation, micro-certifications, talent pipeline, funder tooling — **LATER**
- Re-use everywhere: the profile pre-fills applications → internships → jobs ("from
  first practice to first paycheck") — architecture principle, phased with the above

### PR5 · Never stuck alone — kills P3
- **The tutoring ladder** (founder ruling canonized 2026-10-05, §4.2): AI tutor (free,
  always there) → volunteer human tutors (free, vetted) → paid human tutors (matched by
  actual weak-topic data) → hybrid (human sets the plan, AI runs the reps between
  sessions). AI rung **NEXT**; human rungs **LATER** (safeguarding first, §4.2)
- Academic Q&A (any subject, photo or text, in the learner's register) — **LATER**,
  GUARDED (subject-scoped, not open chat)
- Community layer: moderated study groups, peer Q&A, mentor-back culture — **LATER**
  (child-safe by construction; open social feed stays **RETIRED**)
- Wellbeing: sessions end on purpose, streak mercy, exam-season check-ins, route to real
  humans (guardian/teacher/SADAG) — mercy **LIVE**, check-ins **H5**; AI-as-therapist —
  **RETIRED-class boundary, never** (SB 243 era; see HACKATHON.md §0.6)
- Mascot/companion layer (silhouette → Sentinel) — **LIVE v1**, emotional constitution
  binding

### PR6 · Free chance, fair economy — funds the mission
- Learner core free forever — **LIVE** (principle in force)
- Schools pay (teacher console), families optionally pay (premium depth), marketplace
  rates, employer/funder subscriptions, institutional insight — **LATER**, in
  VISION_FULL §11 order; **no paid tiers now** (guardrail holds)

### PR7 · The guardian made powerful — kills P6 (parent half)
- Guardian portal: aggregates, streaks, topic strengths/struggles — **LIVE** (consent
  spine = POPIA architecture)
- One-tap encouragement (locked to encourage) — **LIVE**; WhatsApp digests — **NEXT**
- Early-warning + bright-spot alerts ("three quiet weeks before trials" in time to
  matter) — **NEXT**
- Guardian guidance: APS/NSFAS/subject-choice explainers in the guardian's language +
  "how to help this week" tied to the learner's current gaps — **NEXT**, GUARDED
  (§4.3: study-support guidance, never psychological profiling of the child)
- Multi-child family views; cohort views for tutors/sponsors/NGOs — **LATER**
- **Parent–school communication hub** (founder, 2026-10-05): school notices, letters,
  meeting dates flowing through the same portal — one inbox for the child's whole
  schooling — **LATER**, school-ecosystem dependent; build-vs-integrate call (d6-class
  incumbents) at teacher-console pilot time — §4.4

### PR8 · Teacher superpowers — kills P1 at the source, P6 (teacher half); THE business
- Teacher marking console (photograph a class set → review-adjust-sign; teacher is
  marker of record by architecture; time-saved meter) — **NEXT** (pilot = F5 calls)
- Class intelligence: weak-topic clustering, per-learner flags, printable feedback,
  SA-SAMS/d6 integration — **NEXT/LATER** with console
- Leadership views (anti-surveillance covenant: no per-teacher league tables) — **LATER**
- Cross-school/district/DBE-grade anonymized insight — **LATER**
- School-configured Guardian Book (class groups, assigned sets, war rooms) — **LATER**

### PR9 · The talent economy — kills P4's far end
- Funder layer (bursars find provably-improving learners, with consent) — **LATER**
- Employer/recruiter talent pipeline; placement outcomes feed the Brain — **LATER**
- Textbook exchange; courses & certifications (free-first) — **LATER**

### Cross-cutting (every promise)
- The Guardian Brain: one longitudinal model per learner, consent-anchored, erasable,
  never sold — **LIVE in embryo** (every feature feeds it; it is the moat)
- Language & access: 11 languages, voice-first, WhatsApp-as-full-citizen, USSD/offline,
  R1,500-Android speed — **LATER** phased; performance-as-respect **LIVE** (DESIGN law)
- Trust constitution (VISION_FULL §10) — **LIVE**, governs everything above

## 4. New rulings (2026-10-05)

**4.1 The AI tutor boundary.** "AI tutor" = subject-scoped, question-anchored, Socratic.
It explains THIS step, sets the next rep, celebrates the click. It is not an open-ended
chat, has no persona intimacy, never discusses the learner's personal life, and hands
wellbeing signals to humans. This keeps us the safe side of SB-243-era law and makes the
tutor BETTER at tutoring (focus is the pedagogy anyway).

**4.2 The tutoring ladder.** Canonized as access architecture: free AI rung first (serves
everyone immediately, no marketplace risk), human rungs only after a safeguarding gate —
vetting (ID + record checks), in-platform-only contact, session transparency to
guardians, minors never alone in unmoderated channels with adults. Volunteer rung can
pilot through partnered NGOs/alumni programmes before open marketplace. Hybrid is the
premium product. Matching is by weak-topic data ("Euclidean Geometry, Gr 11" not "maths,
vaguely") — our differentiation over every tutor listing site.

**4.3 Pattern-insights-to-parents boundary.** Guardians get effort, growth, topic
struggles, and study-support guidance tied to them ("three quiet weeks; trials in 20
days; here's a 10-minute way to help"). Guardians do NOT get behavioural/psychological
characterizations of the child from our patterns. Insight serves the learner's growth,
never adult surveillance — this is both POPIA posture and product soul.

**4.4 Comms hub = integrate-or-build later.** Real pain, real incumbent (d6-class). Not
before the teacher console earns school trust; decide build-vs-integrate on pilot
evidence. Until then, guardian digests carry the communication promise.

**4.5 Lesson Capsules.** The anti-distraction ruling: remediation content lives in-app;
external links only to vetted, ad-light free content; own video production is LATER
(cost), AI-generated worked examples are the v0 capsule. No infinite feed anywhere —
capsules end on purpose, like sessions.

**4.6 The canvas (founder, 2026-10-05).** Maths is written, not typed — so the input
layer meets the hand: (a) photograph paper (pen-and-paper natives), (b) draw/write on an
on-screen canvas with finger or stylus, exported as an image into the *same* vision
marking path — one pipeline, no second marking stack, and geometry/graph questions
render the diagram as the canvas background so the learner draws ON the problem;
(c) later, live ink-to-text for learners who want handwriting to become typed text.
Typed input always remains available. Build order: photo (R3) → canvas (NEXT) →
ink-to-text (LATER).

**4.7 The modality layer (founder, 2026-10-05).** Every explanation — marking feedback,
capsules, subject-choice guidance — must be available to **read** (text), **see**
(diagram-first/visual pathway maps), and **hear** (audio/TTS in the learner's language).
The learner picks per moment; the Brain learns which modality actually lands (mastery
after explanation, not self-report) and adapts defaults. Boundary: we serve modality
*preference and access* — we never label a child "a visual learner" (VAK typing is
scientifically unsupported; multi-modal reinforcement helps everyone). Voice matters
doubly here: many learners speak more fluently than they type.

**4.8 The own-AI ladder ("train our own brain" — the honest path).** We do not pretrain
an LLM (hundred-million-rand nonsense). We OWN the AI the only way that compounds:
- **Stage 0 (now):** frontier models via API, pinned versions, OUR prompts + OUR
  golden-set gates. What we own is the behaviour spec and the test that any model must
  pass — models stay swappable commodities.
- **Stage 1 (the flywheel — on from day one):** every attempt, marked result, dispute
  and correction becomes a de-identified, consent-covered training example. The dispute
  flow is labeling infrastructure. Target: thousands of verified
  (question, memo, answer, correct-marking) examples per subject.
- **Stage 2 (~5–10k verified examples/subject):** fine-tune small open-weights models on
  marking; a fine-tune may serve ONLY after beating the frontier model on our golden
  set. Payoff: cheaper per call, SA-hostable (data sovereignty), eventually
  offline/edge.
- **Stage 3 (the real "own brain"):** the Guardian Brain itself — mastery estimation,
  trajectory forecasting, next-best-practice recommendation — is classical ML on OUR
  longitudinal data, no LLM required, un-copyable without our years of evidence. The LLM
  is a replaceable organ; the Brain is the organism.
Law: no training on identifiable child data, ever; the training pool is de-identified
and erasure-respecting (the attempts/user_id SET NULL architecture exists for this).

**4.9 Magic with rigor (the soul clause, founder 2026-10-05).** Guardian Book makes it
easier to LEARN, never easier to avoid learning. Magic in the experience — instant
marking, canvas input, modality choice, zero friction, delight. Rigor in the pedagogy —
Socratic walkthroughs that teach the step rather than hand the answer, productive
struggle preserved, capsules and sessions that end on purpose, XP only through
demonstrated mastery. The anti-Chegg clause: never an answer vending machine. We teach
so they genuinely pass — and are great in life after the exam hall.

**4.10 Realistic ink marking (founder, 2026-10-06; evidence in RESEARCH_LEARNING_SCIENCE
§3).** The marked result is shown ON THE LEARNER'S OWN PAGE — the photo, the canvas
export, or the typed answer rendered as a lined page — as if a real teacher marked it in
pen: hand-drawn ticks per mark, crosses, circled step marks, the question total circled
at the top right, and short margin comments in a legible handwriting face. The grammar
is the DBE memo's own (✓ per mark, A / CA / M / S / R codes where the memo uses them),
so it marks like a marker, not just looks like one. Readability law: comments ≥18px
equivalent, high-legibility handwriting face (candidates: Patrick Hand, Kalam — chosen by
a legibility test with the founder's brothers and ≥10 learners), never cursive scrawl;
every ink comment is also available as plain text (tap to expand) for accessibility.
Rendering: SVG stroke templates with seeded per-attempt jitter (stable on reload),
variable stroke width, slight ink translucency; placement from step coordinates. **Pen
colour:** default **teacher's green** (the evidence on red is suggestive harm for affect
and no upside; the SA green-pen marking practice exists for this reason); **classic red**
and **blue** are learner-selectable pens in Me → Marking pen; the beta runs red vs green
on retry rate and session continuation and the founder picks the default on the data.
Pipeline requirement: the Marker returns an optional normalized bounding box per step
for image inputs (additive schema field; prompt version bump; golden evals must stay
green; a missing box falls back to margin placement). DESIGN.md A1's hollow-marker
rendering is superseded ON THE MARKED PAGE only; pink-means-act stays law in UI chrome.
The mark sheet (S09) remains the structured view beneath the marked page.

**4.11 Focus Mode (founder, 2026-10-06).** A learner can study without being pulled
away: one tap enters Focus — full-screen practice, all in-app notifications and nudges
held until the session ends, chrome dimmed to near-black (OLED-friendly, "the device
goes dark around the work"), optional timer (default 25 minutes, mercy on overrun),
Sentinel visibly "keeping watch", and a quiet session summary at the end (questions,
marks, minutes). A web app cannot switch the phone's own Do-Not-Disturb; we show a
one-time, platform-specific "turn on Focus/DND" tip with deep instructions, and the
native app later requests notification-policy access on Android (iOS allows adapting to
a Focus, not enabling one — stated honestly). Held notifications are delivered after,
never dropped. Evidence: phone presence taxes attention (Ward et al. 2017, replication
caveat), commitment devices with a visible stake sustain focus (Forest-class). Metric:
focus-session completion and marks per focused minute.

**4.12 Guardian Activity Window (founder ask "visibility on everything", ruled
2026-10-06 on the evidence).** Guardians see MORE than today — session-level activity:
when the learner practised, for how long, which subjects and topics, totals earned
(e.g. "Tue 19:40 · 22 min · Geometry · 7/10"), assigned-set completion, deadlines and
documents outstanding, check-in happened (never its content), and the weekly
improvement-first digest. Guardians still never see the question, the answer, the photo,
or the marker's feedback text — the trials say specific activity information helps
(Bergman; Kraft & Rogers) and controlling monitoring of the work itself hurts
(Pomerantz; Vasquez meta-analysis), and POPIA agrees. Teachers see the same activity
window for their class plus the scripts they themselves marked in the console. Any
screen that would show a guardian a learner's work fails the design gate.

**4.13 Evidence-backed mechanics bundle (ruled 2026-10-06; RESEARCH §10).** Ship these
as standard parts of the loop, not options: (a) **confidence check** — one tap
"sure / not sure" before every mark reveal (hypercorrection); (b) **difficulty band** —
the adaptive set targets 75–90% in-session accuracy and relaxes under exam stress; (c)
**successive relearning** defines "mastered" (correct across spaced sessions, never
once); (d) **interleaved default** sets; (e) **faded worked examples** in capsules; (f)
**utility-value prompt** — a one-line "why this matters to the future you chose",
pre-filled from Career-fit, at the top of a weak topic's capsule; (g) **future-self
card** beside the plan; (h) **implementation-intention planner** — when, where, after
which routine; reminders at that moment; (i) **fresh-start triggers** for restarts
(Mondays, new term); (j) **peak–end session design** — achievable last item, specific
celebration, never end on a failure without a reclaim path; (k) **struggle-normalising
copy** from real cohort data on low marks; (l) **exam-morning private note** (local-only,
never stored) on the countdown screen; (m) **improvement-first guardian digest** — one
improvable thing, one bright spot, one action, weekly, short; (n) **unassisted
performance** (exam mode + spaced retests) as the efficacy metric we report. Never:
leaderboards on learning surfaces, praise-of-person copy, normative comparison on a
result, XP for volume.

**4.14 The outcome we exist for (founder, 26 Oct 2026).** Unemployment is the bill for
blind choices: subjects chosen at 14 without the map, doors closed unnoticed, degrees
chosen in crowded fields, funding missed. Every guidance feature is judged by whether it
closes the education-to-work gap. The claim we make is "no talent walks blind into a
closed door", never "we end unemployment" (jobs need an economy; we fix guidance,
signalling and the record, and we show the business path).

**4.15 Choice architecture: signals, not verdicts.** Suggestions come in three rings,
each with "why we suggest this": near (fits strengths and goals), stretch (reachable with
a named change), far (outside current interests, so nobody is boxed in). Pros and cons
are shown for every option; the learner chooses, the system never pushes. Estimates
(admission chances, demand, crowding) are ranges with sources and dates, never a single
verdict number about a child. School, province and home language are never used as a
negative signal (they correlate with race and class in South Africa). Labour-market data
is sourced and expires when stale.

**4.16 Talent access: the person decides.** The living CV belongs to the person.
Employers, recruiters and talent scouts never see minors' records. From 18 the person
curates what to share and with whom; organisations pay to reach people who opted in.
Never raw answers, never sold, revocable at any time.

**4.17 Adult-life guidance is partner-built.** Financial guidance (budgeting, credit,
home, retirement) is regulated advice in South Africa and is delivered later with
licensed partners; family and parenting guidance follows the same expert-partner rule.
Reskilling for workers displaced by AI and technology belongs to the career layer.

**4.18 Learning anywhere: Pocket Mode (founder, 26 Oct 2026).** A learner on a taxi or
bus, with a cheap phone and little data, can still learn without a mentor beside them.
Pocket Mode is built for that moment: 5-minute sets (retrieval questions, "reflect on your
marks" review of yesterday's lost steps, flash re-tries of reclaimed marks), downloaded
with today's question clips for offline use, low-data images, one-thumb layout. Work done
on paper (a notepad) is photographed whenever the learner is ready; uploads queue offline
and are marked on reconnect. Self-marking is real: AI marking where a subject has passed
its gate, and guided memo self-check (tick each official memo step) everywhere else, with
a confidence check before reveal so learners learn to judge their own work.

**4.19 The Help Plan: one gap, three views (founder, 26 Oct 2026).** Parents are often too
busy, may not have done this work in years, don't know where to look, and the child often
can't explain what they're stuck on. The Brain can, because it has the evidence. Every
significant gap becomes one Help Plan object rendered three ways from the same truth:
- **Learner:** the exact step, the capsule, the next set (as today).
- **Guardian:** what the gap is in plain language (topic level), why
  it matters for what comes next, and a **help menu** ranked free first: our capsule;
  vetted free resources (named, linked, ad-light); a 10-minute "how to help without
  knowing the maths" action (questions to ask, routines to set); human help (school
  support, then tutoring when the ladder's safeguarding gate opens); and a **Tutor Brief**:
  a one-page, shareable description of exactly what to work on, so any tutor the family
  hires (paid or volunteer) spends the hour on the real gap, not "maths, vaguely".
- **Teacher:** which learners share the gap, the intervention suggestion, and the
  personalised note to each guardian (§4.20).
Rules: free options always listed first; any paid option labelled; **no pay-to-rank**:
commercial relationships never influence what is recommended, and any that exist are
disclosed. Guardian visibility follows §4.24.

**4.20 Personalised school-to-guardian notes (the comms wedge).** Instead of one blanket
letter, a teacher can send each guardian a short note built from that child's own
picture ("Lerato lost most marks on factorising this week; here is one thing to do at
home"). The Wonder agent drafts from aggregates; the teacher reviews, edits and sends; it
lands in the guardian's inbox. This is the first, buildable slice of the parent–school
communication hub (§4.4), and it makes "personal support for every child" literal.

**4.21 Scope of the lifelong vision (founder, 26 Oct 2026).** Ages 14–18 (Grade 8–12) are
the start, not the boundary. The engine is stage-agnostic (evidence of learning → the
Brain → guidance → the record), so it extends to every phase: first letters and numbers,
primary school, university and TVET, honours, masters, PhD, professional certification,
and running a business. Sequencing stays disciplined: one stage proven before the next,
each curriculum entering through the onboarding pipeline and its own accuracy gate.
Externally we say: "Built for every stage of learning; starting in high school."

**4.22 Teacher marking is the school product's core (founder, 26 Oct 2026).** Scan a
class set → SAM finds pages and masks names → scripts matched by learner code or roster
order → AI marks against the memo with confidence → teacher confirms, adjusts and signs
off (marker of record) → release sends the learner their marked script and Help Plan,
the guardian a plain-language summary and how to help, and the teacher the class picture
and "needs help" list. School-assessed marks are released only after sign-off; self-
practice marks are instant. The saved hours are meant for the learners who need help.
Full flow and per-audience value: docs/VALUE_BY_AUDIENCE.md.

**4.23 Buyers and commercial boundaries (founder ruling, 26 Oct 2026).** The buyers are
schools and parents. **Schools pay for their teachers and their learners** (teacher and
learner seats) or buy a **whole-school plan** that covers every teacher, learner and
guardian and makes Guardian Book the school's communication platform; sponsors (CSI,
NGOs, districts) can fund seats for no-fee schools. When a school pays, its families pay
nothing extra; otherwise parents can take an optional family plan. The learner's free
core exists regardless. Details: VALUE_BY_AUDIENCE §0a. Paid
offers (tutors, paid resources, premium) appear only in adult spaces, labelled, never
ranked by payment; learners see only free help made or vetted for them.

**4.24 Guardian visibility v2 (founder ruling, 26 Oct 2026; supersedes "aggregates only").**
Guardians see the child's **school-assessed work in full once the teacher releases it**:
the marked script, the marks and the teacher's feedback, the way a marked test comes home
to be signed. They also see effort and practice as aggregates, the Help Plan, deadlines
and teacher notes. **Private practice attempts and photos stay the learner's own** unless
the learner chooses to share a specific piece. Why the line sits here: the evidence
separates results information for parents (alerts on grades and missed work cut course
failures by more than a quarter; Bergman & Chan 2021) from controlling monitoring of
homework, which relates negatively to adolescents' academic adjustment (Pomerantz et al.
2007); and practice only works if learners feel free to get things wrong, which also
keeps the Brain's evidence honest. Implementation: release-gated read policy for linked
active guardians on school-assessed attempts (`released_at`), a learner-controlled
`shared_with_guardian` flag on practice attempts, consent copy updated, attorney packet
(F3) updated. No guardian ever sees another child's work.

### Whole-learner rulings (founder-directed, 27 Oct 2026; evidence and full map in docs/WHOLE_LEARNER.md)

**4.25 The whole learner is core scope.** The intelligence covers more than academics and
guidance:
- support: academic, personal and emotional;
- goals, dreams, hobbies and interests;
- opportunities beyond university and bursaries;
- the people around the learner.

The principle: **AI that knows you, people who care for you.** Guardian Book never
pretends to be your friend; it makes sure you're never without one.

**4.26 The Me layer and the Opportunity Radar.** The parts:
- **The Me page:** dreams, hobbies, causes and proud moments; learner-owned; parents see
  it only if the learner shares.
- **Dream → plan:** each dream becomes sourced, dated steps.
- **Hobby and talent paths:** each interest links to clubs, competitions, programmes and
  careers.
- **The Radar for learners:** Olympiads, expos, competitions, holiday programmes,
  volunteering and youth programmes, matched to interest, grade, province and deadline.
  A Wonder agent finds them; a person reviews every item before it shows.

Doors for 18+ (SAYouth, YES, learnerships) open only from age 18. Sponsored listings are
labelled and never pay-to-rank.

**4.27 The Care layer.**
- **Ships:** the "Help now" button (Childline 116, SADAG 0800 567 567, My people, the
  school's support person; no AI conversation), and My people (one to three trusted
  adults the learner names, with learner-set visibility).
- **Guarded:** structured three-tap check-ins (product H5, not in the hackathon build), a
  Toolkit of self-help capsules reviewed by a registered professional, and a scripted
  reply of at most two turns when a feeling surfaces in the tutor.
- **Later:** the school support queue, Shamiri-style group programmes in school through
  partners, moderated peer circles, and registered counsellors through the marketplace.

Everything follows the Care Protocol (WHOLE_LEARNER §4).

**4.28 The companion line, restated with evidence.** Never, for minors:
- an AI friend or companion, or open-ended emotional chat;
- AI therapy, diagnosis or a counsellor persona;
- reading emotion from camera, voice or typing;
- streaks, points or attachment on support features;
- sharing wellbeing data without consent, or using it commercially.

The reasons: Common Sense + Stanford rate general chatbots unsafe for teen mental-health
support (Nov 2025). There is no adolescent trial. The law: California SB 243 and SB 1119,
Illinois WOPR, Nevada AB 406, and EU AI Act Art. 5(1)(f).

The single exception to privacy is the **safety rule**: for immediate danger, crisis help
shows at once and a trained person is alerted under a protocol agreed with the school and
the attorney. Learners are told this when they join. A clinical advisor and the attorney
sign off before it ships.

**4.29 The Brief, generalised.** The Tutor Brief becomes the **Brief** for any helper:
tutor, mentor, coach or counsellor.
- The learner approves the content, and parents also approve for paid help.
- It never includes health labels without both learner and parent consent, and never
  raw private practice.
- Session notes flow back to the Brain.

**4.30 People marketplace (supersedes "no marketplace" for the human rungs, behind
gates).** The order:
1. Volunteers via partner NGOs and alumni (2027 H2).
2. Paid tutors (2027 H2).
3. Mentors and coaches (2028).
4. Registered counsellors (after the legal opinion).

Safeguarding is required for every helper:
- 18 or older; ID; SAPS clearance; their own Child Protection Register (Part B) self-check.
- The sex-offender register certificate, obtained by Guardian Book as the likely
  "employer" under Sexual Offences Act s40/45.
- References, an interview and training, rechecked every year.
- Contact on the platform only; parent visibility of every adult–learner channel;
  in-person sessions only at school, a public venue, or with a parent present.

Money: the parent pays into escrow. The fee is about 15–20% on tutoring, mentoring and
coaching; counselling uses a flat booking fee, not a percentage (HPCSA rule 7(4)). Ranking
is by fit only.

**4.31 Hackathon slice.** These go into META_HACKATHON §4 P1:
- the Me page and dream → plan;
- the Opportunity Radar for learners;
- Help now and My people (static, human-routed);
- the Mentor Brief for a fictional mentor.

No check-ins and no emotional chat; all data fictional and labelled.

**4.32 Living intelligence: it grows with the learner and keeps them a step ahead
(founder, 27 Oct 2026).** Guardian Book never stays fixed. It keeps adapting to the
learner, the school year, the world and its own improving models, so the learner stays
ahead of the generic pace.

*It evolves on five clocks:*

| Clock | What changes |
|---|---|
| Every answer | Mastery estimates update; the next set retargets at a 75–90% success band, spaced and interleaved (RESEARCH §2) |
| Every week | The plan re-forms around goals, deadlines and the school's pacing. A plateau changes the approach (a worked example, another format, or a person), not just the volume |
| Every term and year | The learner changes, so the Brain does too. Dreams and interests are re-asked each term ("still yours?"). Old beliefs fade unless the learner's work keeps confirming them; nothing is a permanent label. Grade transitions bring their own doors: Grade 9 subject choice, Grade 11 applications, Grade 12 funding, then post-school |
| The world | Career demand signals, opportunities and future skills are refreshed with source and date. The World Economic Forum's *Future of Jobs Report 2025* expects about 39% of key job skills to change by 2030, with AI and big data growing fastest |
| Guardian Book itself | Better models, open weights, new subjects through their accuracy gates, and every teacher-confirmed mark improving the marking. Nothing that changes marking ships without passing its accuracy test |

*"A step ahead" means, concretely:*
- **Previews of next term's topics** before the class reaches them: questions attempted
  before instruction, then short capsules. Attempting before instruction helps (Kapur;
  Sinha & Kapur 2021). Aligned to the CAPS annual teaching plans and the school's own
  pacing.
- **Move on when mastered** instead of waiting for the class. Learning goes deeper and
  further: enrichment and Olympiad-style problems, then next-grade content once
  foundations hold (mastery = correct across spaced sessions). This follows mastery
  learning (Bloom 1984) and the acceleration evidence (Steenbergen-Hu, Makel &
  Olszewski-Kubilius 2016).
- **Exam readiness before it's needed:** timed exam mode and spaced retests ahead of
  trials.
- **Beyond the curriculum:** AI literacy, data, coding, money and the business path,
  offered as Toolkit capsules and Radar opportunities.
- **Deadlines seen early:** subject choice, applications and funding, never discovered
  late.

*Guardrails:*
- **Never against the teacher.** It follows the school's pacing and the teacher can see
  it. There is no "your class is behind" messaging.
- **Depth before breadth.** Stretch work comes only when foundations are secure.
- **Ahead never means more hours.** The balanced week and sessions that end on purpose
  stay (WHOLE_LEARNER §3A).
- **"Ahead" is offered to every learner,** not only top performers. The stretch ring is
  for everyone.
- **No "learning style" labels** (Pashler et al. 2008). "How they learn" means evidence
  of what works for this learner, not a type.
- **The learner can always see what changed and why** on the Brain page: "what Guardian
  Book believes about you now, what changed, and the evidence".

*Learner-visible features:*
- the **Growth timeline** on the Brain page ("six months ago… now…");
- **"Next up in class"** previews;
- **"Ready for more"** stretch sets;
- a termly **"Still yours?"** review of dreams and interests.

*Engine:* every one of these runs on the evidence engine (§4.33).

*Measures:*
- time-to-mastery;
- the share of next-term topics previewed before the class gets there;
- retention at spaced retest;
- the share of learners working beyond grade where mastered, split by school type for
  fairness;
- beliefs re-tested each term.

**4.33 Every interaction teaches the Brain (founder, 27 Oct 2026; TECH §3a).** Each
learning-relevant interaction is a data point that helps Guardian Book understand the
learner and improve their chances of success. The chain:
- each interaction is an immutable event;
- events become evidence;
- evidence becomes beliefs, with their reasons shown;
- beliefs become decisions, with "why this?";
- decisions are scored against outcomes: mastery, unassisted exam performance, results,
  deadlines met, applications, funding and, for consenting adults, destinations.

The rules:
- **Minimal by purpose:** POPIA s10. No keystrokes, location, contacts, emotion
  inference or ad IDs.
- **Care events in a separate store,** never used in learning models or offers.
- **The learner can see, export and delete** what was learned.
- **Three consent scopes:** service; improvement (de-identified, opt-in); research
  (adults, asked again at 18).
- **No experiment withholds help.**
- **Fairness slices on every policy.**

How we say it: "Every answer, question and goal teaches Guardian Book to help you
better, and you can see exactly what it learned." Never "we track everything".

## 5. What sets us apart (the differentiation thesis — every pitch draws from here)

1. **Marking with receipts.** Not "AI feedback" — marks, cited verbatim to the official
   DBE memo line, disputable, accuracy-gated per subject before it may touch a child's
   confidence. No one else shows their marking receipts.
2. **State.** Every other tool is a session: ask, answer, forget. Guardian Book keeps
   state across years — the Brain. Chegg sold answers and died; Duolingo owns a habit;
   we own the learner's whole trajectory. The product compounds the longer you stay, and
   so does the moat (years of verified, dispute-corrected evidence no rival can fake).
3. **The watch.** Tools answer the questions you ask. Guardian Book acts on the ones you
   don't know to ask — deadlines, bursaries, subject-choice consequences. *"You cannot
   look for what you do not know"* is the founding insight and the category difference:
   proactive guardian, not reactive tool.
4. **Everyone in the loop, by architecture.** Guardian, teacher, learner see the same
   truth in real time (aggregates for adults, never surveillance). Other apps serve a
   learner alone; we serve the constellation around them. Zero feedback gaps.
5. **Exam-faithful everything.** Real papers, real memos, questions rendered exactly as
   printed, marked the way a real marker marks. Practice that transfers to the actual
   hall — not generic "AI questions."
6. **Teaching, not answers** (§4.9). Easier to learn, never easier to skip learning.
7. **Built for SA reality.** R1,500-Android speed, low-data/offline, home languages,
   WhatsApp as a full citizen, POPIA-native consent — trust a parent chooses *because*
   of how it behaves.
8. **One system for the whole cycle.** Others pick a slice (prep, applications, careers);
   the Brain carries one verified record from first practice to first paycheck — the
   cold-start no competitor can offer at any single slice.

## 6. Never (so the promises stay credible)
Celebrity AI avatars · ads to learners · open social feed for minors · engagement-first
monetization · AI-as-therapist for minors · AI friend/companion or open-ended emotional
chat for minors · emotion recognition from camera, voice or typing · pay-to-rank ·
unvetted adults contacting minors · selling data · dark patterns of any kind ·
paywalling a child's basic chance. (Reasons in VISION_FULL §14 RETIRED + §10 and
WHOLE_LEARNER.md §3.)

---
*Cross-links: VISION_FULL.md (the whole), PRD.md (current build), HACKATHON.md (Track
H), DESIGN.md + DESIGN_BRIEF.md (how it must feel), TASKS.md (state).*
