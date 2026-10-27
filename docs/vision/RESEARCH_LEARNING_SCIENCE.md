# RESEARCH_LEARNING_SCIENCE.md — what the evidence says, and what Guardian Book does about it

**v1 · 6 October 2026 · CTO-owned.** The world's best-backed findings on how people learn,
how feedback should work, what makes learners come back and keep going, what the newest
AI-tutoring trials show, what parents and teachers in the loop actually do to outcomes,
and what the strongest consumer learning platforms have learned the hard way — each one
tied to a specific Guardian Book mechanic, screen, and metric. Standard of evidence:
randomized trials and meta-analyses first, well-replicated lab findings second,
correlational or single-study findings flagged as such. Where a famous finding has
replication trouble, it says so. References in §13.

---

## 1. The ten findings that matter most (ranked by evidence × fit)

1. **Retrieval practice and spacing are the two highest-utility learning techniques
   known.** Dunlosky et al. (2013) rated practice testing and distributed practice "high
   utility" across ages, materials and outcomes; rereading and highlighting rated low.
   Roediger & Karpicke (2006) showed that testing yourself beats restudying by a wide
   margin a week later. *Guardian Book is a retrieval-practice engine with spaced review
   built into Today's set — the core loop is the single best-supported thing in education.*
2. **Tutoring is the most reliably effective intervention in education — and AI tutors
   with guardrails now reach it.** Human tutoring pools at ~0.37 SD (Nickow, Oreopoulos &
   Quan, 2020/2024). In 2024–2025 the AI results landed: Kestin et al. (2025) 0.73–1.3 SD
   in less time than active-learning class; Rori on WhatsApp in Ghana 0.36 SD from two
   30-minute sessions a week (Henkel et al., 2024); the World Bank's Nigeria pilot 0.23–
   0.31 SD in six weeks (De Simone et al., 2025). *Our marker + Socratic tutor on
   official papers is this category; WhatsApp as a channel is proven in Africa.*
3. **Unguarded chatbots harm learning; guarded ones don't.** Bastani et al. (PNAS 2025):
   students with plain GPT-4 did 48% better in practice and **17% worse on the exam**;
   a tutor prompted to withhold answers removed the harm. *This is the scientific basis of
   our magic-with-rigor clause and the reason our success metric is unassisted
   performance, never in-session marks.*
4. **Feedback that targets the task and the next step helps; feedback that targets the
   self hurts.** Kluger & DeNisi (1996): over a third of feedback interventions made
   performance worse — those that drew attention to the person. Hattie & Timperley
   (2007): task, process and self-regulation feedback work; praise aimed at the self is
   the weakest. Shute (2008): specific, elaborated, timely, non-comparative. *Our per-step
   memo-cited feedback is task/process feedback by construction; "reclaim 2 marks" is
   feed-forward; no generic praise anywhere.*
5. **Adapting to the learner's level beats adapting to their grade.** Teaching at the
   Right Level is a GEEAP "great buy"; Mindspark's adaptive software produced 0.37 SD in
   maths in 4.5 months with the largest gains for the weakest students (Muralidharan,
   Singh & Ganimian, 2019). *The Brain's weak-topic weighting and the subject-topic
   taxonomy are this; the adaptive set is where the learning happens.*
6. **Parents informed with specific, actionable, improvement-focused information change
   outcomes — surveillance and control do not.** Kraft & Rogers (2015): one short weekly
   teacher-to-parent message cut course failure 41%, and messages about what to improve
   beat messages of praise. Bergman & Chan (2021): automated alerts on missed work and
   absences cut failures by more than a quarter. Meta-analyses of parenting find autonomy
   support positively related to achievement and controlling monitoring of homework
   negatively related (Vasquez et al., 2016; Pomerantz et al., 2007). *Our guardian loop —
   effort and growth, what to help with this week, never raw answers — is exactly the
   evidence-backed shape.*
7. **Slack makes streaks work.** Sharif & Shu (2017): emergency reserves increase goal
   persistence versus rigid rules; Duolingo's streak freeze and 7-day-streak retention
   multiples are the industrial confirmation. *Streak mercy is not softness; it is the
   mechanism.*
8. **Plans with a when-and-where double follow-through.** Implementation intentions carry
   a meta-analytic d = 0.65 (Gollwitzer & Sheeran, 2006). *The study planner asks "when,
   where, after what" — never just "how much".*
9. **Relevance and future-self interventions lift the learners who need it most.** A
   one-paragraph "how does this relate to my life" exercise raised low-expectancy
   students' grades by three-quarters of a grade point (Hulleman & Harackiewicz, 2009);
   possible-selves interventions improved grades and attendance (Oyserman et al., 2006).
   *Career-fit and Pathway Finder are not side features; they are motivation
   interventions with trial evidence, delivered at the practice moment.*
10. **High-confidence errors are the most correctable — if the learner commits first.**
    The hypercorrection effect (Butterfield & Metcalfe, 2001; replicated widely): errors
    made with high confidence are corrected better after feedback, because surprise
    recruits attention. *A one-tap confidence check before the mark reveal turns every
    marked answer into a stronger learning event.*

## 2. Learning science — how practice must work

**Retrieval practice (the testing effect).** Recalling beats rereading; the effect grows
with delay and with feedback. Design: every question is a retrieval event; memo
self-check for non-marked subjects still counts because the attempt precedes the reveal.

**Spacing and successive relearning.** Cepeda et al. (2008): the optimal gap between
study sessions is roughly 10–20% of the time until the test; Rawson & Dunlosky (2011):
relearning to criterion across spaced sessions produces durable retention. Design: the
scheduler re-queues a topic at expanding intervals anchored to the exam date; "mastered"
means retrieved correctly across spaced sessions, not once.

**Interleaving.** Mixing problem types forces the learner to choose the method, not just
execute it; Rohrer, Dedrick & Stershic (2015) roughly doubled a month-later maths test
score versus blocked practice. Design: Today's set mixes topics by default; blocked
drilling is a deliberate choice the learner makes for a brand-new skill.

**Worked examples, faded.** Novices learn more from studying worked solutions than from
solving (Sweller's worked-example effect); experts are hurt by them (Kalyuga's expertise
reversal). Design: Lesson Capsules open with a full worked example, then a partially
completed one, then the learner's own attempt — faded by mastery level.

**Desirable difficulties and productive failure.** Effort that feels harder often learns
better (Bjork); attempting a problem before instruction can improve conceptual learning
(Kapur; Sinha & Kapur 2021 meta-analysis: moderate positive effect, larger when designed
well). Design: the attempt always comes before the walkthrough; the tutor never opens with
the answer.

**Difficulty targeting.** Wilson et al. (2019) show, for a wide class of learning
systems, learning is fastest at about 85% accuracy. This is a computational result, not a
classroom trial; we treat it as a sensible target band, not a law. Design: the adaptive
set aims each learner at a 75–90% in-session success band and widens the band under exam
stress.

**Metacognition and calibration.** Learners are poor judges of what they know; confidence
judgments followed by feedback improve calibration and recruit the hypercorrection effect.
Design: "How sure are you?" (one tap: sure / not sure) before the mark reveal; calibration
shown in Progress.

**Multimedia principles (Mayer).** Words plus relevant pictures beat words alone;
spoken explanation with a diagram beats on-screen text with a diagram (modality
principle); segment content; signal what matters; cut decoration (coherence). Design:
capsules are segmented, signaled, diagram-first with optional narration; the canvas
puts the learner's working on the diagram itself (no split attention).

**Learning styles — no.** Pashler, McDaniel, Rohrer & Bjork (2008) found no credible
evidence that matching instruction to a claimed style improves learning. We serve
modality *choice and access* (read / see / hear) because multi-modal reinforcement helps
everyone; we never label a child a type.

**Mastery learning and the 2-sigma problem.** Bloom (1984): tutoring plus mastery-based
instruction moved the average student to the 98th percentile of conventional classes.
Guardian Book is an attempt at that result at the cost of a data bundle.

## 3. Feedback science — how marking must feel

**Levels of feedback.** Hattie & Timperley (2007): feedback about the task ("the sign
flipped at step 3"), the process ("check units before substituting"), and
self-regulation ("you got this type right when you drew the sketch first") works; praise
about the person does not. **Design law:** every mark carries task-level feedback citing
the memo; walkthroughs add process feedback; the Brain's "you do better when…" lines are
self-regulation feedback; "well done, genius" never appears.

**Feedback can hurt.** Kluger & DeNisi (1996), 607 effect sizes: average positive (d ≈
0.41), but more than a third of interventions decreased performance — typically those
that moved attention to the self (grades without comments, comparisons to others,
threats to self-esteem). **Design law:** no normative comparison on a result screen, no
"you are below average", no leaderboard on the marking surface.

**Specific, elaborated, timely.** Shute (2008): elaborated feedback (why, and what next)
beats verification alone; immediate feedback suits procedural skills, slightly delayed
feedback can help transfer; keep it non-comparative. **Design:** per-step feedback is
elaborated; marks are immediate; the Brain's spaced re-ask is the delayed layer.

**Feedback should cause thinking.** Wiliam: feedback should be more work for the
recipient than the giver. **Design:** the "reclaim" action requires a reasoning turn
before the reveal.

**Red ink — the evidence, honestly.** Elliot et al. (2007): brief exposure to red before an
achievement task impaired performance (avoidance motivation). Rutchick, Slepian & Ferris
(2010): graders using red pens marked more errors and gave lower grades than those using
blue. Dukes & Albanesi (2013): students rated red-pen comments and the teacher more
negatively than the same comments in another colour. Caveat: later replication attempts
of some red–performance effects failed (Collabra, 2020), so the performance effect is
suggestive, not settled; the perception effect is consistent across studies. Meanwhile,
realism has its own evidence: human-like social cues (conversational style, a visible
"marker" presence) increase engagement and learning (Mayer's personalization and
embodiment principles). **Ruling (FEATURES §4.10):** marks are drawn as real pen on the
learner's own page — ticks, crosses, circled totals, margin comments in a legible
handwriting face — because authenticity is the asset; the ink colour defaults to a
teacher's green (the colour the South African "green pen" marking movement adopted for
exactly these reasons), classic red is a learner-selectable pen, and the beta runs red
versus green on retry rate and session continuation. The data decides; the founder picks
the default after the test.

**The DBE marking vocabulary is the realism.** Official memos award marks with codes —
ticks per mark, A (accuracy), CA (consistent accuracy), M (method), S (substitution), R
(reason) — and markers circle the question total. Rendering marks in the memo's own
grammar, on the page, is exam-faithful marking: it looks like a real marker because it
marks like one.

## 4. Motivation and behaviour — why they come back, and keep going

**Self-Determination Theory** (Ryan & Deci): autonomy, competence and relatedness fuel
durable motivation; controlling rewards undermine it (Deci, Koestner & Ryan, 1999).
Gamification helps when autonomy-supportive and hurts when controlling (Sailer & Homner,
2020; Hanus & Fox, 2015 found leaderboards and badges reduced motivation and exam scores
in a class). **Design law:** XP only for demonstrated mastery; choice preserved ("choose
another topic"); leaderboards never on learning surfaces and never public for minors;
relatedness through the guardian loop and Sentinel, not through social comparison.

**Expectancy-value and utility value.** Hulleman & Harackiewicz (2009), randomized in 30
science classrooms: writing how the topic relates to one's life raised low-expectancy
students' grades by ~0.8 grade points and raised interest. **Design:** at the top of a
weak topic's capsule, a 60-second "why this matters to the future you chose" prompt,
pre-filled from Career-fit and Pathway Finder ("Euclidean geometry is in the first-year
engineering course you're aiming at") and asking the learner to write one line of their
own.

**Possible selves and identity-based motivation.** Oyserman, Bybee & Terry (2006): a
brief school-to-jobs programme that made future selves concrete and tied them to present
strategies improved grades, attendance and behaviour. **Design:** the Record and
Opportunity Radar show a concrete future self ("Thandi, 2nd-year BSc, Pretoria") next to
this week's plan.

**Growth mindset, at honest size.** Yeager et al. (2019), a national randomized study of
12,000 students: a one-hour online intervention raised lower-achieving students' GPA by
~0.10 and increased advanced-course enrolment — small, cheap, real. **Design:**
process-focused feedback copy ("this step is learnable") and the Brain's trajectory
chart as evidence that practice changes marks; no mindset posters.

**Belonging.** Walton & Cohen (2011) and later scale-ups show that normalising struggle
("most learners find this topic hard at first and get it") protects persistence,
especially for learners who doubt they belong. **Design:** struggle-normalising copy on
low-mark results, grounded in real cohort data ("68% of learners miss this step the first
time").

**Implementation intentions.** Gollwitzer & Sheeran (2006), d = 0.65: "if it is Tuesday
after supper, then I do my set at the kitchen table" doubles follow-through over vague
goals. **Design:** the planner asks when, where, and after which existing habit (Fogg's
anchoring), then reminds at that moment, not at random.

**Fresh starts.** Dai, Milkman & Riis (2014): goal pursuit spikes after temporal landmarks
— Mondays, new terms, birthdays. **Design:** streak restarts and plan launches are offered
on fresh-start dates; the first day of term is a campaign moment; "new week, clean sheet"
copy after a broken streak.

**Goal gradient and endowed progress.** People accelerate as they approach a goal and
work harder when progress is already visible (Kivetz, Urminsky & Zheng, 2006).
**Design:** mastery rings start from real evidence, never zero; "2 questions to finish
today's set" over "set of 3".

**Loss aversion with slack.** Streaks exploit loss aversion; Sharif & Shu (2017) show
reserves (freezes) increase persistence versus rigid rules; Duolingo reports 7-day-streak
users retain at multiples of non-streak users. **Design:** streak freezes earned by
mastery, exam-week immunity, earn-back after a slip, never shame copy.

**Deadlines and commitment devices.** Ariely & Wertenbroch (2002): self-imposed deadlines
improve performance; external, evenly spaced deadlines improve it more. **Design:**
teacher-assigned or guardian-witnessed due dates for sets; Deadline Radar makes
real-world deadlines visible early.

**Peak–end rule.** Experiences are remembered by their peak and their end (Kahneman).
**Design:** sessions end on a win — the last item of a set is chosen to be achievable,
the "done for today" moment celebrates specifically, and the session never ends on a
failed question without a reclaim path.

**Flow and challenge–skill balance.** Engagement is highest when difficulty tracks skill
(Csikszentmihalyi). **Design:** the 75–90% band above; "exam mode" intentionally breaks
the band to simulate the real thing, and says so.

**Anxiety.** Ramirez & Beilock (2011, Science): ten minutes of writing about test worries
before an exam improved anxious students' performance. **Design:** an optional exam-day
"empty your head" note (private, never stored as text — a local-only sheet that clears)
on the countdown screen the morning of a paper.

**Tiny habits and anchors.** Fogg: behaviour happens when motivation, ability and a
prompt meet; anchor new habits to existing routines and keep them tiny. **Design:** the
default daily set is three questions, anchored to a routine the learner names.

**Social accountability.** Accountability partners and witnessed commitments improve
follow-through; the guardian loop and encourage-only nudges are the ethical version.
**Design:** "Mom will see you practised today" is stated once at setup, never as a threat.

## 5. The engagement playbook of the best platforms — borrow, adapt, refuse

**Duolingo.** Streaks with freezes (slack); a contextual-bandit notification system
trained on hundreds of millions of reminders that picks copy and timing per user and
stops nagging when it isn't working; relentless A/B testing; one clear daily action.
*Borrow:* streak + mercy, the bandit (later), the humility of "we'll stop reminding you".
*Refuse:* leagues/leaderboards for minors' learning surfaces.

**Khan Academy / Khanmigo.** Mastery levels per skill; a tutor that asks before it tells.
*Borrow:* mastery semantics; Socratic default. **Photomath.** Step-by-step reveal on a
photographed problem. *Borrow:* the camera-first entry, step reveal — add the memo
receipts they don't have. **Brilliant.** Do first, read second; interactive problems
before explanation. *Borrow:* attempt-before-instruction. **Anki / Quizlet.** Spaced
repetition as a scheduler, not a feature. *Borrow:* the scheduler under Today.
**Headspace / Calm.** Gentle onboarding, forgiving streaks, sessions that end. *Borrow:*
the tone and the ending. **Forest.** A commitment device that makes phone-checking cost
something emotionally. *Borrow:* Focus Mode with a visible stake (Sentinel keeps watch).
**Strava.** Kudos from people who matter. *Borrow:* encourage-only nudges.

**Refuse, by name:** infinite feeds (TikTok-style bottomlessness); companion intimacy
(Character.AI); answer vending (Chegg); shame mechanics (Snapchat streak panic); dark
patterns of any kind. Each has a reason in VISION_FULL §10 and now a study behind it.

## 6. Parents and teachers in the loop — what the trials say

**Teacher-to-parent messages.** Kraft & Rogers (2015): one sentence a week from a teacher
raised credit completion by 6.5 points, a 41% drop in failure, mostly by preventing
dropout; messages about what to improve beat praise. **Design:** the weekly guardian
digest leads with one specific, improvable thing ("Geometry is the gap; two sets this
week closes it") and one bright spot; it is short; it suggests one action.

**Automated information to parents.** Bergman (2021) and Bergman & Chan (2021): text
alerts about missed assignments, grades and absences raised GPA and attendance and cut
course failures by more than a quarter — information frictions between parents and
children are real and cheap to fix. **Design:** "didn't practise for 3 days", "skipped the
assigned set", "deadline in 10 days with two documents missing" are the alerts; they are
specific, rare, and actionable.

**Bite-sized parenting texts.** York, Loeb & Doss (2019, READY4K): simple weekly texts
with one tip improved early literacy and parent engagement; overload backfires.
**Design:** one tip per week in the guardian's language, tied to the learner's current
gap; never a feed.

**Autonomy support beats monitoring.** Vasquez et al. (2016) meta-analysis: autonomy
support relates positively to achievement and wellbeing, most strongly in adolescence;
Pomerantz et al. (2007): controlling monitoring of homework relates negatively to
academic adjustment. **This is why guardians see effort and growth, not answers and
photos — not only privacy law, but the evidence on what helps.** The "Activity Window"
(FEATURES §4.12) widens what guardians see to session-level activity (when, how long,
which topics, totals) because that is the Bergman-class information that works; it still
excludes raw work because that is the Pomerantz-class control that hurts. *(Applied in FEATURES §4.24, 26 Oct 2026: released school work — marked tests, the results information Bergman's studies used — is shown to guardians in full; private practice stays hidden unless the learner shares it.)*

**Teachers with AI assistance.** Wang et al. (2024, Tutor CoPilot RCT, 900 tutors, 1,800
students): AI suggestions to human tutors raised mastery by 4 percentage points overall
and 9 for lower-rated tutors. **Design:** the teacher console is an AI-assisted human
marker of record — the evidence says that pairing lifts the weakest practitioners most,
which is exactly the under-resourced school.

## 7. AI tutoring, 2024–2026 — the design rules the trials teach

Kestin et al. (2025) attribute their result to a design, not a model: active engagement
(the learner works first), cognitive-load management (one idea at a time), growth-mindset
messaging, and scaffolding that withholds the answer. Bastani et al. (2025) show the
inverse: remove the scaffolding and practice looks better while learning gets worse —
the crutch effect. Rori shows the channel can be WhatsApp and the dose can be an hour a
week. The Nigeria pilot shows six weeks is enough to see it, after school, on shared
devices. Tutor CoPilot shows AI helps humans most where humans are weakest.

**Guardian Book's rules, drawn from them:** the attempt precedes any help; the tutor
asks before it tells and never vends the answer; one step at a time; feedback cites the
memo; the success metric is *unassisted* performance — timed exam mode and spaced
retests — never in-session marks; WhatsApp is a first-class channel; an hour a week is a
meaningful dose, so the default plan is small; and when human tutors arrive, they get
the copilot.

## 8. South Africa and the continent — the context evidence

GEEAP's "Smart Buys" (2023) names two "great buys": structured pedagogy for teachers and
targeting instruction by learning level rather than grade; adaptive software earns a
"good buy" where devices exist. Mindspark (India) is the clearest trial that software can
do the targeting. Rori proves WhatsApp delivery in West Africa. Mother-tongue
explanation is supported by decades of literacy research and is why the Language layer
exists. The device and data realities (entry-level Android, prepaid bundles, shared
phones) are design constraints with evidence behind them: low-data and offline modes are
access, not polish.

## 9. What does not work (so we don't build it)

Learning-styles matching · rereading and highlighting as primary study · generic praise
and person-focused feedback · grades without comments · normative comparison and public
leaderboards for struggling learners · controlling gamification (points for volume) ·
unguarded chatbots that hand over answers · red ink as default correction colour
(suggestive harm, no upside) · notification spam (Duolingo's own lesson) · exhortation
("be gritty") without skills · brain-training transfer claims · over-claiming effect
sizes (Hattie's league tables are contested; we cite trials, not averages of averages).

## 10. The application map — principle → mechanic → screen → metric

| Principle | Guardian Book mechanic | Screen | Metric |
|---|---|---|---|
| Retrieval practice | every question is an attempt before any reveal | S07 Practice | attempts/day; unassisted retest score |
| Spacing / successive relearning | expanding-interval re-queue anchored to exam date | S05 Today | retention at spaced retest |
| Interleaving | mixed-topic default set | S05 | month-later topic accuracy |
| Faded worked examples | capsule sequence: full → partial → own attempt | Capsules | capsule→practice conversion |
| Productive failure | attempt before walkthrough; tutor asks first | S10 Step | reasoning-turn rate before reveal |
| 85% band | adaptive difficulty targeting 75–90% | S05 | in-session accuracy distribution |
| Hypercorrection | one-tap confidence check before reveal (new) | S07/S09 | correction of high-confidence errors on retest |
| Multimedia principles | diagram-first, segmented, optional narration | Capsules, canvas | completion; mastery after capsule |
| Task/process feedback | per-step memo-cited feedback; "reclaim" feed-forward | S09 Result | reclaim rate; dispute rate |
| No self-feedback / comparison | no praise-of-person, no normative stats on results | S09 | — (design gate) |
| Red-ink evidence | realistic ink marking; green default, red selectable; A/B | S09 Marked page | retry rate; continuation by pen colour |
| SDT / autonomy | XP for mastery only; choice escape; no leaderboards | all | mastery events vs volume |
| Utility value | "why this matters to your future" one-liner, pre-filled from Career-fit | Capsules | low-expectancy learners' persistence |
| Possible selves | future-self card next to the plan | S14 Record, S13 Radar | goal-set rate; weekly return |
| Growth mindset (honest) | trajectory chart; process copy | S11 Progress | — |
| Belonging | struggle-normalising copy from real cohort data | S09 | continuation after low marks |
| Implementation intentions | planner asks when/where/after-what; reminds then | Planner | plan adherence |
| Fresh start | restart offers on Mondays/term starts | S05 | restart rate after break |
| Goal gradient | rings start from evidence; "2 to go" copy | S05, S11 | set completion |
| Slack | streak freeze, exam immunity, earn-back | S05, Streak | 7-day streak rate; churn after slip |
| Peak–end | achievable last item; specific celebration; never end on failure | S09, set runner | next-day return |
| Anxiety writing | exam-morning private note (local-only) | S16 Countdown | exam-mode score for anxious self-reporters |
| Phone distraction | Focus Mode (new, §4.11) | S07, Me | focus-session completion |
| Parent information | weekly digest: one improvable thing + one bright spot + one action | Guardian | learner practice days after digest |
| Autonomy support | Activity Window, never raw work | Guardian | — (design gate) |
| Teacher copilot | AI-assisted marker of record | School console | marking time; agreement rate |
| Unassisted performance | timed exam mode + spaced retests as the efficacy metric | Exam mode | the number we report |

## 11. The ten moves that set us apart (research-backed, buildable)

1. **Marking that looks and marks like a real marker** — pen on the learner's own page in
   the memo's own grammar (ticks, A/CA/M, circled total, margin comments) — authenticity
   as presence, evidence-chosen ink.
2. **Confidence before the reveal** — the hypercorrection effect, one tap, every question.
3. **Unassisted performance as the headline metric** — we report exam-mode and spaced
   retest scores, the number Bastani says everyone else is faking with practice gains.
4. **The improvement-first guardian digest** — Kraft & Rogers in product form.
5. **"Why this matters to the future you chose"** — utility-value prompts pre-filled from
   Career-fit at the moment of struggle.
6. **Successive relearning as the definition of mastered.**
7. **Implementation-intention planning** — when, where, after what; reminders at that
   moment, not at random.
8. **Focus Mode with Sentinel keeping watch** — a commitment device for the device.
9. **Sessions that end on a win** — the peak–end rule as architecture.
10. **An AI-assisted human marker of record for schools** — Tutor CoPilot's lesson, aimed
    at the classrooms that need it most.

## 12. Measuring efficacy (the "efficacy reckoning" investors and schools will demand)

Primary: unassisted performance — timed exam-mode scores on unseen official questions and
spaced retests, by topic, over time. Secondary: time-to-mastery per topic; retention at
spaced retest; persistence (practice days, return after a slip); calibration (confidence
vs correctness); dispute rate and dispute-resolved-in-learner's-favour rate (marker
quality); guardian-digest-to-practice lift; and for schools, marking time saved and
teacher–AI agreement. Every number comes with its denominator; every claim we make
externally has already been true in a phone.

## 13. References

Ariely & Wertenbroch (2002) *Psychological Science* · Banerjee et al. (2017) *J. Economic
Perspectives* (TaRL) · Bastani, Bastani, Sungu, Ge, Kabakcı & Mariman (2025) *PNAS* 122(26)
· Bergman (2021) *J. Political Economy*; Bergman & Chan (2021) *J. Human Resources* ·
Bjork & Bjork (desirable difficulties) · Bloom (1984) *Educational Researcher* ·
Butterfield & Metcalfe (2001) *JEP: Learning, Memory & Cognition*; Metcalfe (2017) *Annual
Review of Psychology* · Cepeda et al. (2008) *Psychological Science* · Csikszentmihalyi
(1990) *Flow* · Dai, Milkman & Riis (2014) *Management Science* · Deci, Koestner & Ryan
(1999) *Psychological Bulletin* · De Simone et al. (2025) World Bank, *From Chalkboards to
Chatbots* · Dukes & Albanesi (2013) *Social Science Journal* · Dunlosky, Rawson, Marsh,
Nathan & Willingham (2013) *Psychological Science in the Public Interest* · Elliot, Maier,
Moller, Friedman & Meinhardt (2007) *JEP: General*; replication caveat: *Collabra:
Psychology* (2020) · Fiorella & Mayer (2013) learning by teaching · Fogg (2019) *Tiny
Habits* · GEEAP (2023) *Cost-Effective Approaches to Improve Global Learning ("Smart
Buys")* · Gollwitzer & Sheeran (2006) *Advances in Experimental Social Psychology* · Hanus
& Fox (2015) *Computers & Education* · Hattie & Timperley (2007) *Review of Educational
Research* · Henkel et al. (2024) *AIED* (Rori, Ghana) · Hulleman & Harackiewicz (2009)
*Science* 326 · Kahneman; Redelmeier & Kahneman (1996) peak–end · Kapur (2008); Sinha &
Kapur (2021) *Review of Educational Research* · Kalyuga (expertise reversal) · Kestin,
Miller, Klales, Milbourne & Ponti (2025) *Scientific Reports* 15:17458 · Kivetz, Urminsky
& Zheng (2006) *J. Marketing Research* · Kluger & DeNisi (1996) *Psychological Bulletin* ·
Kraft & Rogers (2015) *Economics of Education Review* · Mayer (2020) *Multimedia Learning*
· Mekler et al. (2017) *Computers in Human Behavior* · Muralidharan, Singh & Ganimian
(2019) *American Economic Review* (Mindspark) · Nickow, Oreopoulos & Quan (2020 NBER;
2024 *AERJ*) · Oyserman, Bybee & Terry (2006) *JPSP* · Pashler, McDaniel, Rohrer & Bjork
(2008) *PSPI* · Pomerantz, Moorman & Litwack (2007) *RER* · Ramirez & Beilock (2011)
*Science* 331 · Rawson & Dunlosky (2011) *JEP: General* · Roediger & Karpicke (2006)
*Psychological Science* · Rohrer, Dedrick & Stershic (2015) *J. Educational Psychology* ·
Rutchick, Slepian & Ferris (2010) *European J. Social Psychology* · Ryan & Deci
(Self-Determination Theory) · Sailer & Homner (2020) *Educational Psychology Review* ·
Sharif & Shu (2017) *J. Marketing Research* · Shute (2008) *RER* · Sweller (cognitive
load; worked examples) · Vasquez, Patall, Fong, Corrigan & Pine (2016) *Educational
Psychology Review* · Walton & Cohen (2011) *Science* · Wang, Demszky et al. (2024) Tutor
CoPilot RCT · Ward, Duke, Gneezy & Bos (2017) *J. Association for Consumer Research*
(replication caveat noted) · Wiliam (2011) *Embedded Formative Assessment* · Wilson,
Shenhav, Straccia & Cohen (2019) *Nature Communications* · Yeager et al. (2019) *Nature*
573 · York, Loeb & Doss (2019) *J. Human Resources* · Duolingo engineering and growth
write-ups on streaks and the notification bandit (industry, not peer-reviewed).

## 14. Grade relevance (founder question, 6 Oct 2026)

Most of §2–§4 is age-general: retrieval practice, spacing, interleaving, step-based
tutoring, the feedback laws, autonomy support, implementation intentions and slack
replicate from primary school through university. Findings that are adolescent-specific
or stronger in adolescence — autonomy support (strongest in middle/high school), the
growth-mindset national trial (Grade 9), the utility-value trial (high-school science),
the parent-messaging trials (middle/high school), Bastani's crutch effect (high-school
maths), and the exam-anxiety writing effect (highest stakes) — all sit squarely on Grades
8–12, with Grade 12 the band where stakes, data and the gateway converge. The grade-by-
grade calibration (explanation style, tutor ladder speed, difficulty band, motivation
levers, guardian loop, content set) is in `AI_PEDAGOGY.md` §8. First launch stays
Grade 12, then 10–11; the engine is the same, the calibration block and the content set
change.
