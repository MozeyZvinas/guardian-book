# SITEMAP.md — every page of Guardian Book, to the T

**v1 · 6 October 2026 · CTO-owned.** The complete page tree across every surface and
role-space: the public website (which *is* the landing page), the learner app, the
guardian space, the school/teacher space, the internal admin/ops console, the legal
pages, the system pages, and mobile parity. Every page has a route, a parent, the pages
it links to, and a status. Diagrams of how these connect live in `docs/WIRE_DIAGRAMS.md`;
what each core screen contains lives in `docs/SCREENS.md`.

**Status tags:** **R** rebuild now · **H** hackathon layer · **N** next arc · **L** later
(earned, in order) · **P** policy page (ship with R1 — placeholder text until attorney
review, badge shown).

**Surfaces.** One Next.js web app serves everything below (website + web app + PWA); the
mobile app (Expo, later) mirrors the learner and guardian trees 1:1 and adds native
capabilities (§8). Route groups: `(public)`, `(auth)`, `(learner)`, `(guardian)`,
`(school)`, `(admin)`.

---

## 1. Public website (`(public)` — the landing page is the website)

| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/` | Landing — "Try a real exam question" hero (S01) | — | `/try/[q]`, `/how-it-works`, `/for-guardians`, `/for-schools`, `/papers`, `/auth`, `/install`, footer legal | R |
| `/how-it-works` | Three steps: practice → marked against the memo → the Brain guides | `/` | `/try/[q]`, `/auth` | R |
| `/for-learners` | Learner promise page (PR1–PR6) with real-content proof blocks | `/` | `/try/[q]`, `/auth` | R |
| `/for-guardians` | Guardian promise page: effort window, transparency timeline, how to link | `/` | `/guardian/join`, `/auth?role=guardian`, `/legal/children` | R |
| `/for-schools` | Teacher/school pitch: marking console, class intelligence, pilot request | `/` | `/for-schools/pilot`, `/legal/schools` | N |
| `/for-schools/pilot` | Pilot request form (school, role, learners, contact) → founder inbox | `/for-schools` | — | N |
| `/for-funders` | Bursary providers/NGOs: find and follow learners with consent | `/` | `/contact` | L |
| `/pricing` | Free core forever; schools "talk to us"; family premium later | `/` | `/for-schools/pilot`, `/auth` | N |
| `/about` | The story: founder, the founding insight, Sentinel, the trust constitution in plain words | `/` | `/legal/privacy`, `/contact` | R |
| `/papers` | Public official past-paper library (SEO: every DBE paper, per ToU) | `/` | `/papers/[subject]` | N |
| `/papers/[subject]` | Papers by year/session for a subject | `/papers` | `/papers/[subject]/[year]` | N |
| `/papers/[subject]/[year]` | One year: P1/P2 + memos, download per ToU, "practice this paper" | `/papers/[subject]` | `/library/[subject]/[paperId]`, `/legal/papers-terms` | N |
| `/guides` | Public guidance library (SEO + guardian guide reuse): APS, NSFAS, subject choice | `/` | `/guides/[slug]` | H (3 guides) · N |
| `/guides/[slug]` | One guide (read / visual / listen modes) | `/guides` | `/radar`, `/aps` | H · N |
| `/opportunities` | Public opportunity listings (SEO; curated, sourced, dated) | `/` | `/opportunities/[slug]` | H |
| `/opportunities/[slug]` | One bursary/olympiad/learnership: eligibility, dates, actions, source | `/opportunities` | `/auth`, `/radar/opportunities/[id]` | H |
| `/try/[questionId]` | Anonymous practice of a featured real question (S07 variant) | `/` | `/try/[questionId]/result` | R |
| `/try/[questionId]/result` | Anonymous first result + "Save my progress" (S02) | `/try/[questionId]` | `/auth`, `/try/[q2]` | R |
| `/share/[cardId]` | Public share-card landing (nickname only) → try the same question | — | `/try/[questionId]` | R |
| `/install` | Install as app (PWA instructions by platform; store links later) | `/` | — | R |
| `/contact` | Contact + support entry (WhatsApp/email), press | `/` | `/help` | R |
| `/help` | Help centre index | `/` | `/help/[slug]` | N |
| `/help/[slug]` | One help article (marking, photos, guardians, erasure…) | `/help` | — | N |
| `/status` | Service status (uptime, known issues) | footer | — | L |

## 2. Legal and policy pages (`/legal/*`, `(public)`)

| Route | Page | Notes | Status |
|---|---|---|---|
| `/legal` | Legal index | links all below; "last updated" dates | P |
| `/legal/terms` | Terms of use | learners + guardians + schools sections; minors clause | P |
| `/legal/privacy` | Privacy notice (POPIA) | what we keep (nickname/grade/province), purposes, retention, operators, cross-border, rights | P |
| `/legal/children` | Children's privacy & guardian consent explainer | competent-person consent in plain words; what guardians see/never see | P |
| `/legal/papers-terms` | Official papers terms | DBE content attribution and permitted use | P |
| `/legal/acceptable-use` | Acceptable use | no abuse, no cheating in assessed work, dispute etiquette | P |
| `/legal/cookies` | Cookies & analytics | PostHog/Sentry disclosure; opt-out | P |
| `/legal/data-requests` | Access / correction / erasure requests | links to in-app erasure; manual path | P |
| `/legal/paia` | PAIA manual | required for SA businesses under PAIA; information officer details | P |
| `/legal/security` | Security & responsible disclosure | contact, scope, no-bounty note | P |
| `/legal/schools` | School agreement summary | DPA terms for schools (teacher console) | L |
| `/legal/community` | Community guidelines | when the community layer ships | L |
| `/legal/ai` | How our AI marks and guides | model use, confidence labels, disputes, no-therapist rule, data use for training (de-identified) | P |

## 3. Auth and onboarding (`(auth)`)

| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/auth` | Sign in / sign up (magic link; S03) | any | `/auth/role`, `/auth/confirm`, `/legal/terms`, `/legal/privacy` | R |
| `/auth/role` | "I am a…" learner / guardian / teacher | `/auth` | `/auth/learner`, `/guardian/join`, `/school/join` | R |
| `/auth/learner` | Learner details: nickname, grade, province, under-18? | `/auth/role` | `/auth/consent` or `/today` | R |
| `/auth/consent` | Under-18 gate: transparency timeline, invite guardian / guardian is here (S04) | `/auth/learner` | `/links/invite`, `/today` (limited), `/legal/children` | R |
| `/auth/confirm` | Magic-link / token confirmation handler | email | role home | R |
| `/auth/signout` | Sign-out handler | `/me` | `/` | R |
| `/join/[code]` | Guardian invite deep link (from WhatsApp) | external | `/guardian/join?code=` | R |
| `/invite/[code]` | Learner invite deep link (guardian-initiated direction) | external | `/auth/learner?code=` | R |

## 4. Learner app (`(learner)` — tabs: Today · Library · Progress · Radar · Me)

### 4.1 Today
| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/today` | Home: exam target, streak, today's set, radar teaser (S05) | tab | `/practice/set/[setId]`, `/countdown`, `/radar`, `/checkin`, `/notifications` | R |
| `/practice/set/[setId]` | Today's set runner (sequence of questions with progress dots) | `/today` | `/practice/[questionId]`, `/today` (done for today) | R |
| `/notifications` | Inbox: nudges, radar alerts, marking done, streak notes | header bell | deep links to the item | R |
| `/checkin` | Exam-season check-in (S15) | `/today` | `/checkin/support` | H |
| `/checkin/support` | "Talk to someone": guardian call request, teacher, SADAG & resources | `/checkin` | `/links`, `/legal/ai` | H |

### 4.2 Library
| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/library` | Subjects (marking-enabled vs self-check labeled) (S06) | tab | `/library/[subject]` | R |
| `/library/[subject]` | Papers by year/session + topics tab | `/library` | `/library/[subject]/[paperId]`, `/library/[subject]/topics/[topic]` | R |
| `/library/[subject]/[paperId]` | Questions of one paper, exam-faithful thumbnails, mastery state | `/library/[subject]` | `/practice/[questionId]`, `/practice/exam/[paperId]`, `/library/[subject]/[paperId]/download` | R |
| `/library/[subject]/[paperId]/download` | Official PDF per ToU (paper + memo after an attempt policy) | paper | `/legal/papers-terms` | N |
| `/library/[subject]/topics/[topic]` | All questions on a topic across years, weakest first | subject | `/practice/[questionId]`, `/capsules/[subject]/[topic]` | N |
| `/practice/[questionId]` | Practice player: clip + typed/photo/canvas (S07) | library/set | `/practice/[questionId]/result` | R (typed) · R (photo) · N (canvas) |
| `/practice/[questionId]/result` | Mark sheet with receipts (S09) | player | `/practice/[questionId]/step/[n]`, `/practice/[questionId]/dispute`, next question, `/share/new` | R |
| `/practice/[questionId]/dispute` | Dispute sheet (S09a) | result | result | R |
| `/practice/[questionId]/step/[n]` | Socratic walkthrough for a missed step (S10) | result | result, "try a similar one" | N |
| `/practice/exam/[paperId]` | Timed exam mode (mock exam simulation: full paper, timer, no help) | paper | `/practice/exam/[paperId]/review` | N |
| `/practice/exam/[paperId]/review` | Exam review: per-question marks, time per question, weak map update | exam | `/practice/[questionId]/result` | N |
| `/capsules` | Lesson Capsules home (by subject; "for your gaps" first) | library | `/capsules/[subject]` | N |
| `/capsules/[subject]` | Capsules by topic | capsules | `/capsules/[subject]/[topic]` | N |
| `/capsules/[subject]/[topic]` | Topic capsule list (worked examples, micro-explanations, videos later) | subject | `/capsules/[id]` | N |
| `/capsules/[id]` | One capsule: read / see / hear modes; ends on purpose → practice CTA | topic | `/practice/[questionId]` | N |
| `/search` | Search questions, topics, capsules, opportunities | header | results deep links | N |

### 4.3 Progress
| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/progress` | Mastery rings, trajectory, APS band teaser, history (S11) | tab | `/progress/[subject]`, `/progress/history`, `/progress/streak`, `/progress/badges`, `/aps` | R |
| `/progress/[subject]` | Topic rings for a subject | progress | `/progress/[subject]/[topic]` | R |
| `/progress/[subject]/[topic]` | Topic detail: attempts, marks over time, "reclaim" list, capsule CTA | subject | `/practice/[questionId]`, `/capsules/[subject]/[topic]` | N |
| `/progress/history` | Every attempt (question · date · marks · confidence) | progress | `/practice/[questionId]/result` | R |
| `/progress/streak` | Streak calendar, freezes, earn-backs (mercy shown truthfully) | progress | `/today` | R |
| `/progress/badges` | Mastery-earned badges (never volume) | progress | `/record` | N |
| `/record` | Guardian Record — living profile (S14) | progress/me | `/record/export`, `/record/share` | H |
| `/record/export` | Export preview (PDF/image) "what your applications will reuse" | record | — | H (preview) · N (export) |
| `/record/share` | Consent-gated sharing with a funder/school (L) | record | `/legal/privacy` | L |

### 4.4 Radar (the watch)
| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/radar` | Radar home: urgent deadlines, opportunities, career-fit card (S13) | tab | all below | H |
| `/radar/deadlines` | All tracked deadlines with countdowns | radar | `/radar/deadlines/[id]` | H |
| `/radar/deadlines/[id]` | One deadline: steps, document checklist (checkbox state), "remind my guardian" | deadlines | `/guardian` mirror | H |
| `/radar/opportunities` | Matched bursaries, olympiads, open days, learnerships | radar | `/radar/opportunities/[id]` | H |
| `/radar/opportunities/[id]` | One opportunity: eligibility vs you, dates, actions, source | opportunities | `/radar/deadlines/[id]` (track it) | H |
| `/radar/funding` | Funding Stack: NSFAS eligibility + matched bursaries + cost planning | radar | `/radar/funding/nsfas`, `/radar/funding/[bursaryId]`, `/radar/funding/plan` | H |
| `/radar/funding/nsfas` | NSFAS step-by-step guide + document checklist + current window | funding | `/radar/deadlines/[nsfas]` | H |
| `/radar/funding/[bursaryId]` | One bursary | funding | track it | H |
| `/radar/funding/plan` | Cost-of-study planner (fees, accommodation, transport, data; funding gap) | funding | `/guides/money` | H (simple) · N |
| `/radar/careers` | Career-fit "Opportunity Radar": strong subjects → clusters → careers; honesty label | radar | `/radar/careers/[clusterId]` | H |
| `/radar/careers/[clusterId]` | One cluster: careers, growth note + source, required subjects/APS, entrepreneurship fork | careers | `/aps/pathways` | H |
| `/radar/applications` | Application tracker (institutions, programmes, status, dates) | radar | `/radar/applications/[id]` | N |
| `/radar/applications/[id]` | One application: steps, documents, status, pre-filled from Record | applications | `/record` | N |

### 4.5 APS and pathways
| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/aps` | APS calculator (manual + "use my practice marks") (S12) | progress/radar | `/aps/pathways`, `/aps/subject-choice` | R |
| `/aps/pathways` | Pathway Finder: qualifying programmes, "what unlocks what" | aps | `/aps/pathways/[programmeId]` | H |
| `/aps/pathways/[programmeId]` | One programme: institution, APS/subject requirements, source, verified date, apply link | pathways | `/radar/applications` | H |
| `/aps/subject-choice` | Subject-choice guardian (Grade 9→10): doors opened/closed per choice, with your data | aps | `/aps/subject-choice/compare` | H (narrative) · L (full) |
| `/aps/subject-choice/compare` | Compare two subject sets side by side (visual map / read / listen) | subject-choice | `/radar/careers` | L |

### 4.6 Countdown and planning
| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/countdown` | All exam dates with countdowns (official timetable) (S16) | today | `/countdown/plan` | R |
| `/countdown/plan` | Study planner: sets placed on real days around the weak map | countdown | `/countdown/plan/[week]` | N |
| `/countdown/plan/[week]` | One week's plan; reschedule with mercy | plan | `/practice/set/[setId]` | N |

### 4.7 Tutoring (the ladder)
| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/tutor` | AI tutor entry: scoped to a question/step you choose (never open chat) | result/progress | `/practice/[questionId]/step/[n]` | N |
| `/tutor/find` | Find a human tutor by weak topic (volunteer / paid / hybrid) | tutor | `/tutor/[tutorId]` | L |
| `/tutor/[tutorId]` | Tutor profile (vetted badge, topics, availability, price/free) | find | `/tutor/sessions` | L |
| `/tutor/sessions` | Booked sessions, in-platform contact only, guardian visibility | tutor | — | L |

### 4.8 Links (guardians, learner side)
| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/links` | Active guardians, pending invites, unlink (S18) | me | `/links/invite`, `/links/[linkId]` | R |
| `/links/invite` | Generate code + WhatsApp share | links | — | R |
| `/links/[linkId]` | One link: since, what they see, unlink with the transparency reminder | links | `/legal/children` | R |

### 4.9 Me (profile and settings)
| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/me` | Profile hub: nickname, grade, province, Sentinel state, quick links (S17) | tab | all below | R |
| `/me/edit` | Edit nickname / grade / province (nothing else exists) | me | `/me` | R |
| `/me/goals` | Goals: subjects taken, target APS, dream programmes/careers (feeds the Brain) | me | `/aps`, `/radar/careers` | H |
| `/me/subjects` | Subjects and levels (HL/FAL, Maths vs Maths Lit) | me | `/aps/subject-choice` | R |
| `/me/school` | Optional school link (code from teacher) | me | `/school/join` (teacher side) | L |
| `/me/language` | Interface language (11 later); feedback language (N) | me | — | R (toggle) · N |
| `/me/theme` | Light / dark / system; reduced motion | me | — | R |
| `/me/notifications` | Reminders (time of day), radar alerts, nudges, WhatsApp opt-in (N) | me | — | R |
| `/me/consent` | Consent status, linked guardian, what it means | me | `/links`, `/legal/children` | R |
| `/me/privacy` | "What we keep" list; download my data; erase my data | me | `/me/privacy/download`, `/me/privacy/erase`, `/legal/privacy` | R |
| `/me/privacy/download` | Data export request (JSON) | privacy | — | N |
| `/me/privacy/erase` | Erasure request with plain-words consequences and confirmation | privacy | `/` after | R |
| `/me/record` | Shortcut to Guardian Record | me | `/record` | H |
| `/me/help` | Help centre + contact + report a problem | me | `/help`, `/contact` | R |
| `/me/about` | About, version, legal links, open-source licences | me | `/legal` | R |
| `/me/signout` | Sign out | me | `/auth/signout` | R |

## 5. Guardian space (`(guardian)` — `/guardian/*`, deep-green header; tabs: Home · Guide · Me)

| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/guardian` | Home: linked learners switcher + effort window of the selected learner (S20) | tab | `/guardian/[learnerId]/*`, `/guardian/join`, `/guardian/invite` | R |
| `/guardian/join` | Accept invite by code; transparency timeline; consent; guardian nickname (S19) | `/join/[code]`, home | `/guardian` | R |
| `/guardian/invite` | Invite a learner (guardian-initiated direction; code/WhatsApp) | home | `/invite/[code]` | R |
| `/guardian/[learnerId]` | Effort window: practice days, streak, topics rising/stuck, last active | home | all below | R |
| `/guardian/[learnerId]/topics` | Topic strengths/struggles (aggregate accuracy only) | learner | `/guardian/guide/how-to-help` | R |
| `/guardian/[learnerId]/streak` | Streak + mercy events | learner | — | R |
| `/guardian/[learnerId]/deadlines` | Deadline mirror (the learner's urgent items) | learner | `/guardian/[learnerId]/deadlines/[id]` | H |
| `/guardian/[learnerId]/deadlines/[id]` | One deadline: steps, what's missing, "remind them" | deadlines | — | H |
| `/guardian/[learnerId]/encourage` | Nudge composer (encourage-only templates; lands warm) | learner | — | R |
| `/guardian/[learnerId]/alerts` | Early-warning / bright-spot history | learner | — | N |
| `/guardian/[learnerId]/consent` | Consent record: date, scope, revoke (with consequences in plain words) | learner | `/legal/children` | R |
| `/guardian/[learnerId]/settings` | Digest frequency, alert types, unlink | learner | `/guardian/digest` | R |
| `/guardian/guide` | Guide index: APS, subject choice, NSFAS, how to help this week (S21) | tab | `/guardian/guide/[slug]` | H |
| `/guardian/guide/[slug]` | One guide (read / see / listen; language toggle N) | guide | `/guardian/[learnerId]/deadlines` | H |
| `/guardian/guide/how-to-help` | This week's help, tied to the learner's stuck topic (study-support only) | guide | — | N |
| `/guardian/digest` | Weekly digest preview + WhatsApp/email settings | me | — | N |
| `/guardian/family` | Multi-learner family view (parents of several; tutors/sponsors cohort view L) | home | learners | N · L |
| `/guardian/me` | Guardian profile (nickname, language, notifications), legal, sign out | tab | `/legal`, `/auth/signout` | R |
| `/guardian/notifications` | Alerts inbox | header | deep links | R |
| `/guardian/help` | Help + contact | me | `/help` | R |

## 6. School / teacher space (`(school)` — `/school/*`; the business engine — N pilot, L scale)

| Route | Page | Parent | Links to | Status |
|---|---|---|---|---|
| `/school/join` | Teacher onboarding: school code / pilot invite; role; classes | `/auth/role` | `/school` | N |
| `/school` | Teacher dashboard: classes, marking queue, time-saved meter, class flags | tab | all below | N |
| `/school/classes` | Classes list | school | `/school/classes/[classId]` | N |
| `/school/classes/[classId]` | Class home: learners, assigned sets, insight | classes | sub-pages | N |
| `/school/classes/[classId]/learners` | Roster (nickname-level; join codes for learners) | class | `/school/learners/[learnerId]` | N |
| `/school/classes/[classId]/sets` | Assign practice sets (from the library) with due dates | class | `/library/*` | N |
| `/school/classes/[classId]/insight` | Weak-topic clustering ("14 of 32 lost marks on…"), intervention suggestions | class | `/school/reports` | N |
| `/school/mark` | Marking console: upload a class set (photos/scans), choose paper/questions | school | `/school/mark/[batchId]` | N |
| `/school/mark/[batchId]` | Batch review queue: per script status, keyboard-fast navigation | mark | `/school/mark/[batchId]/[scriptId]` | N |
| `/school/mark/[batchId]/[scriptId]` | Script review: AI-suggested per-step marks beside the memo line; adjust; sign off (teacher = marker of record) | batch | next script | N |
| `/school/learners/[learnerId]` | Learner view for the teacher (aggregates + teacher-level flags + marked scripts they marked) | roster | — | N |
| `/school/reports` | Printable feedback per learner / per class; export to SA-SAMS/d6 (L) | school | — | N · L |
| `/school/leadership` | Principal/HOD views: cohort-level only (anti-surveillance covenant) | school | — | L |
| `/school/comms` | Parent–school communication hub (notices, letters, meetings) | school | guardian inbox | L |
| `/school/settings` | School profile, teachers, terms, data agreement | school | `/legal/schools` | N |
| `/school/billing` | Plan, invoices (when paid) | settings | — | L |
| `/school/help` | Teacher help + support | school | `/help` | N |

## 7. Admin / ops console (`(admin)` — `/admin/*`; internal: founder + CTO; **R/H — the review gates need a home**)

| Route | Page | Purpose | Status |
|---|---|---|---|
| `/admin` | Ops dashboard: marking volume, confidence mix, disputes open, costs, rate-limit hits, errors | R |
| `/admin/content` | Papers: ingest status (downloaded / extracted / reviewed / loaded / clipped) per paper | R |
| `/admin/content/[paperId]` | Review gate: question list, mark sums, extraction issues, clip samples, approve/reject | R |
| `/admin/content/[paperId]/[questionId]` | Edit question text, context_text, has_diagram, topic; adjust clip bbox; memo items (service role view) | R |
| `/admin/disputes` | Dispute triage queue (pattern view by question/step) | R |
| `/admin/disputes/[id]` | One dispute: attempt, result, memo, learner text (untrusted display), actions: add golden case / mark reviewed | R |
| `/admin/evals` | Golden-set runs: history, pass/fail per case, prompt/model versions | R |
| `/admin/evals/[runId]` | One run detail | R |
| `/admin/prompts` | Prompt versions, model pins, rollout flags (read-only view of repo state + deploy notes) | N |
| `/admin/radar` | Curate radar items: deadlines, opportunities, funding, pathways, career-fit rows (source + verified date required) | H |
| `/admin/radar/[id]` | One item editor | H |
| `/admin/users` | Minimal: counts by grade/province, erasure requests queue (no browsing of individuals) | R |
| `/admin/users/erasure/[requestId]` | Run/record erasure (tool-backed), audit line | R |
| `/admin/flags` | Feature flags (hackathon layers, canvas, subjects' marking gates) | R |
| `/admin/health` | Service health: Supabase, Railway services, OpenAI latency, queues | N |
| `/admin/schools` | Pilot schools, codes, teacher accounts | N |

## 8. Mobile app (Expo, later) — parity and native-only

The mobile app mirrors §4 (learner) and §5 (guardian) route for route via shared
`packages/core` logic and the same backend. Native-only capabilities (not pages, but
surfaces): camera capture with guidance overlay; stylus/finger canvas with pressure;
push notifications (nudges, radar alerts, marking done); offline packs (download a paper
+ clips + capsules; queued attempts sync); biometric unlock for guardians; share sheet
integration; home-screen widget (streak + days to Paper 1). Until the native app ships,
the PWA (`/install`) provides installability, offline caching of the last paper, and
queued attempts.

## 9. Channels that are not pages (but are in the wire)

WhatsApp: practice nudges, weekly guardian digests, deadline reminders, share-card
delivery, and later Q&A over chat. Email: magic links, digests, erasure confirmations.
SMS/USSD (later): reminders and streak state for feature phones. Push (native, later).

## 10. System pages

`/404` (teaching empty state with a real question to try) · `/500` (error boundary with
a next step and a support link) · `/offline` (what's cached, what's queued) ·
`/maintenance` (planned downtime) · `/sitemap.xml`, `/robots.txt`, `/manifest.webmanifest`
(PWA), `/.well-known/security.txt`.

## 11. Page count and build order

Public 23 · Legal 13 · Auth 8 · Learner 73 · Guardian 22 · School 18 · Admin 16 · System 8
— **181 routes** across the full vision. Rebuild now (R): ~55. Hackathon (H): ~28. Next
(N): ~55. Later (L): ~43. Order of construction follows `docs/TECH.md` §13 and
`docs/SCREENS.md` Part E; this sitemap is the territory, those are the route.
