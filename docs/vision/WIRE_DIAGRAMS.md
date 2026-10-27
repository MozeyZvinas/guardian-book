# WIRE_DIAGRAMS.md — how everything connects

**v1 · 6 October 2026 · CTO-owned.** The wire diagrams of Guardian Book: who talks to
what, how a visitor becomes a learner, how a learner's answer becomes a mark, how a paper
becomes practice, how a guardian is linked, how the data becomes our own AI, and how the
web app, the mobile app and the backend communicate. Diagrams are Mermaid (GitHub renders
them in place); a rendered page is published alongside. Routes referenced are in
`docs/SITEMAP.md`; screen contents in `docs/SCREENS.md`; the stack in `docs/TECH.md`.

---

## 1. System context — who talks to what

```mermaid
flowchart LR
  subgraph People
    L[Learner<br/>Gr 8-12, later tertiary]
    G[Guardian<br/>parent, sibling, tutor, sponsor]
    T[Teacher / School]
    A[Founder + CTO<br/>admin, review gates]
  end

  subgraph Surfaces
    WEB[Web app + website + PWA<br/>Next.js]
    MOB[Mobile app<br/>Expo, later]
    WA[WhatsApp / email / SMS<br/>channels]
  end

  subgraph GB[Guardian Book platform]
    API[Brain API + workers<br/>Railway]
    DATA[(Data plane<br/>Supabase: Postgres+RLS, Auth, Storage)]
    BRAIN[[The Guardian Brain<br/>mastery, trajectory, radar, recommendations]]
  end

  subgraph External
    OAI[OpenAI API<br/>marking, explanation]
    DBE[DBE official papers + memos]
    SRC[Universities, NSFAS, bursars,<br/>labour-market data]
    OBS[PostHog, Sentry, Langfuse]
    MSG[WhatsApp Business API, email provider]
  end

  L --> WEB & MOB & WA
  G --> WEB & MOB & WA
  T --> WEB
  A --> WEB
  WEB --> API & DATA
  MOB --> API & DATA
  WA --> API
  API --> DATA & BRAIN & OAI & OBS & MSG
  BRAIN --> DATA
  DBE -. ingestion pipeline .-> API
  SRC -. curated, sourced, dated .-> API
```

Every human reaches the platform through the web app (which is also the website and the
installable PWA), later the mobile app, and the messaging channels. All surfaces speak to
the same two things: the **Brain API and workers on Railway** (compute: marking
orchestration, the Brain's models, radar, digests, ingestion) and the **data plane on
Supabase** (Postgres with row-level security, Auth, Storage). The Brain is a set of
models and jobs that read and write the data plane; it is ours. OpenAI is a replaceable
organ behind the API. Official sources enter only through the ingestion pipeline and the
curated-dataset gate.

## 2. Deployment — the containers and where they run

```mermaid
flowchart TB
  subgraph Vercel["Vercel (or Railway) — web"]
    NEXT[Next.js app<br/>website + learner + guardian + school + admin<br/>PWA, server actions, proxy guards]
  end

  subgraph Railway["Railway — compute"]
    BAPI[brain-api<br/>Node/TypeScript<br/>marking orchestration, radar, record, agents]
    ING[ingest-worker<br/>Python<br/>download, extract, clips, load]
    JOBS[jobs<br/>cron + queue consumers<br/>digests, reminders, mastery recompute, evals]
    REDIS[(Redis<br/>queues, rate limits, caches)]
    INF[inference gateway<br/>later: fine-tuned models via vLLM]
  end

  subgraph Supabase["Supabase — data plane"]
    PG[(Postgres + RLS<br/>profiles, papers, questions, memo_items,<br/>attempts, mark_results, disputes, streaks,<br/>guardian_links, nudges, radar_items...)]
    AUTH[Auth<br/>magic links, anonymous sessions, roles]
    STO[Storage<br/>answer photos (private), question clips (public)]
    EDGE[mark-attempt edge function<br/>transitional; retired once brain-api passes the golden set]
  end

  subgraph Ext["External services"]
    OAI[OpenAI API]
    LF[Langfuse tracing]
    PH[PostHog]
    SE[Sentry]
    WAB[WhatsApp Business API]
    EM[Email provider]
  end

  NEXT -- RLS-scoped reads/writes, auth --> PG & AUTH & STO
  NEXT -- typed HTTP, user JWT --> BAPI
  BAPI -- service role --> PG & STO
  BAPI --> REDIS & OAI & LF & INF
  ING --> PG & STO
  JOBS --> PG & REDIS & WAB & EM & OAI
  NEXT --> PH & SE
  BAPI --> SE
  EDGE -. transitional .-> OAI & PG
```

**Hosting ruling (6 Oct 2026).** The founder wants Railway for the backend; the CTO agrees
for **compute**: Railway hosts our own services (`brain-api`, `ingest-worker`, `jobs`,
Redis, later the inference gateway) because they are long-running, need Python and
Node side by side, need queues and cron, and will grow into model hosting. **Supabase stays
as the data plane** because the trust architecture — row-level security, minors'
consent spine, erasure, memo secrecy, private photo storage — is already built there and
rebuilding auth and RLS for children's data from scratch is risk with no benefit. The
Next.js app deploys to Vercel by default (best-in-class for Next, zero-ops, free tier);
if the founder prefers one bill, Railway can host it too — a configuration choice, not an
architectural one. Decision revisited at ~5,000 learners (as previously ruled). The
`mark-attempt` edge function is transitional: `brain-api` takes over marking once it
passes the same golden set, so all model calls live on Railway.

## 3. From the landing page to a learner — the front door

```mermaid
flowchart TD
  LAND["/ Landing: try a real question"] --> TRY["/try/[q]  answer it"]
  TRY --> TRES["/try/[q]/result  marked, with receipts"]
  TRES -->|Save my progress| AUTH["/auth  magic link"]
  TRES -->|Try another| TRY
  LAND --> HOW["/how-it-works"] --> TRY
  LAND --> FG["/for-guardians"] --> GJOIN["/guardian/join"]
  LAND --> FS["/for-schools"] --> PILOT["/for-schools/pilot"]
  LAND --> PAPERS["/papers (SEO library)"] --> TRY
  LAND --> OPPS["/opportunities (SEO)"] --> AUTH
  AUTH --> ROLE["/auth/role  learner | guardian | teacher"]
  ROLE -->|learner| LDET["/auth/learner  nickname, grade, province, under 18?"]
  ROLE -->|guardian| GJOIN
  ROLE -->|teacher| SJOIN["/school/join"]
  LDET -->|18+| TODAY["/today"]
  LDET -->|under 18| CONS["/auth/consent  transparency timeline"]
  CONS -->|invite guardian| LINV["/links/invite  code + WhatsApp"] --> TODAY
  CONS -->|guardian is here| GJOIN --> TODAY
  WAlink["WhatsApp link /join/[code]"] --> GJOIN
```

The decision psychology is built into the wiring: the easy question comes first, the
value is felt before any account exists, the anonymous attempt survives sign-up, and the
under-18 gate is a transparency timeline rather than a wall. Guardians arrive through
their own door (`/for-guardians`, `/join/[code]`) and never pass through learner
onboarding.

## 4. The learner app — tab-level wiring

```mermaid
flowchart LR
  subgraph Tabs
    TODAY["/today"]
    LIB["/library"]
    PROG["/progress"]
    RADAR["/radar"]
    ME["/me"]
  end

  TODAY --> SET["/practice/set/[setId]"] --> Q["/practice/[q]"]
  LIB --> SUBJ["/library/[subject]"] --> PAPER["/library/[subject]/[paperId]"] --> Q
  PAPER --> EXAM["/practice/exam/[paperId]  timed mock"]
  Q --> RES["/practice/[q]/result"]
  RES --> STEP["/practice/[q]/step/[n]  Socratic"]
  RES --> DISP["/practice/[q]/dispute"]
  RES --> SHARE["/share/[cardId]"]
  RES -->|next| Q
  RES -->|done for today| TODAY
  STEP --> CAP["/capsules/[id]  read / see / hear"]
  PROG --> PS["/progress/[subject]/[topic]"] --> CAP
  PROG --> REC["/record  Guardian Record"]
  PROG --> APS["/aps"] --> PATH["/aps/pathways/[programmeId]"]
  APS --> CHOICE["/aps/subject-choice"]
  RADAR --> DL["/radar/deadlines/[id]  checklist"]
  RADAR --> OPP["/radar/opportunities/[id]"] --> DL
  RADAR --> FUND["/radar/funding/nsfas"] --> DL
  RADAR --> CAR["/radar/careers/[clusterId]"] --> PATH
  RADAR --> APP["/radar/applications/[id]"] --> REC
  TODAY --> CD["/countdown"] --> PLAN["/countdown/plan/[week]"] --> SET
  TODAY --> CHK["/checkin"] --> SUP["/checkin/support"]
  ME --> LINKS["/links"] --> LINV["/links/invite"]
  ME --> PRIV["/me/privacy"] --> ERASE["/me/privacy/erase"]
  ME --> GOALS["/me/goals"] --> APS
```

Every result screen has exactly one forward edge the learner is pushed toward (next
question or done for today) and two optional edges (reclaim a step, dispute). The Radar
and APS surfaces converge on the same two objects — a deadline checklist and a programme
— so a career cluster, an opportunity and an NSFAS step all end in the same tracked
action. Progress feeds the Record; the Record pre-fills applications.

## 5. The guardian space — wiring and the aggregate boundary

```mermaid
flowchart LR
  JOIN["/guardian/join  code + consent"] --> HOME["/guardian  learner switcher"]
  HOME --> EW["/guardian/[learnerId]  effort window"]
  EW --> TOP["/topics  aggregate accuracy"]
  EW --> STR["/streak"]
  EW --> DLM["/deadlines  mirror"] --> DLI["/deadlines/[id]  remind them"]
  EW --> ENC["/encourage  encourage-only templates"] --> NUDGE[(nudges)]
  EW --> CONS["/consent  view / revoke"]
  EW --> SET["/settings  digest, alerts, unlink"]
  HOME --> GUIDE["/guardian/guide"] --> GS["/guide/[slug]  APS, NSFAS, subject choice"]
  GUIDE --> HELP["/guide/how-to-help  this week"]
  HOME --> FAM["/guardian/family  multi-learner"]
  NUDGE --> LN["learner /notifications"]
  VIEWS[(guardian aggregate views:<br/>practice_days, streaks, topic_accuracy)] --> EW
  REL[(released school work:<br/>marked scripts after teacher sign-off)] --> EW
  RAW[(private practice attempts,<br/>photos, answers)] -. never unless the learner shares .-> EW
```

The dotted "never" edge is the most important line in the diagram: there is no path from
a learner's private practice to any guardian page unless the learner shares it. School
work is different: once the teacher signs off and releases it, the marked script reaches
the guardian like a marked test sent home (FEATURES §4.24). The aggregate views contain no
question, answer or image columns by construction; released scripts reach guardians
through their own release-gated policy; the nudge table only accepts `encourage`.

## 6. Marking — from answer to mark sheet

```mermaid
sequenceDiagram
  autonumber
  participant L as Learner (web/mobile)
  participant W as Next.js
  participant D as Supabase (RLS)
  participant B as brain-api (Railway)
  participant S as Storage
  participant O as OpenAI
  participant R as Redis

  L->>W: Submit answer (typed | photo | canvas PNG)
  alt image
    W->>S: upload to own folder (EXIF stripped, signed)
  end
  W->>D: insert attempts (attempt-first, RLS-scoped)
  W->>B: POST /mark {attemptId} (user JWT)
  B->>R: rate limit check (6/min, before any spend)
  B->>D: load memo_items (service role, never to client)
  alt image
    B->>S: 300s signed URL
  end
  B->>O: MARK_SYSTEM_PROMPT vN + question + memo + answer (DATA, untrusted)
  O-->>B: JSON marks (streamed)
  B->>B: zod validate: totals reconcile, criteria verbatim, feedback consistent
  alt invalid or low confidence
    B->>B: fail closed -> low-confidence fallback (no invented marks)
  end
  B->>D: insert mark_results (model, prompt_version, confidence)
  B-->>W: per-step stream
  W-->>L: StreamingMarkSheet: steps reveal one by one, memo cited
  L->>W: Dispute (optional, <=300 chars)
  W->>D: insert disputes (immutable)
  D-->>B: weekly triage -> golden case candidate
```

The order matters: the attempt is recorded before the model is called (a failed marking
never loses the learner's work), the rate limit is checked before any money is spent, the
memo never leaves the server, the model's output is validated before it touches the
database, and anything that fails validation fails closed. The dispute closes the loop
into the golden set.

## 7. Content — from an official PDF to exam-faithful practice

```mermaid
flowchart LR
  MAN[manifest.json<br/>official DBE pages only] --> DLD[download.py<br/>section-parse, provenance map]
  DLD --> RAW[(raw PDFs<br/>untracked, founder machine)]
  RAW --> EXT[extract.py<br/>page render -> vision segmentation<br/>questions + marks + memo links]
  EXT --> JSON[(structured JSON<br/>reviewed:false, committed)]
  JSON --> GATE{CTO review gate<br/>sums=150, segmentation,<br/>solve-verify samples, garble scan}
  GATE -->|reject| EXT
  GATE -->|reviewed:true| LOAD[load.py<br/>refuses unreviewed]
  LOAD --> PG[(papers, questions, memo_items)]
  RAW --> CLIP[E8 clips<br/>bbox -> retina PNG crop]
  CLIP --> CGATE{clip fidelity review<br/>>=10 per paper}
  CGATE -->|pass| STO[(Storage: question clips, public)]
  STO --> QP[questions.image_path]
  PG --> APP[Library / Practice<br/>exam-faithful rendering]
  QP --> APP
  APP --> VERIFY{practice-verified<br/>on the founder's phone}
  VERIFY -->|next paper| MAN
```

Paper by paper: nothing moves to the next paper until this one is practice-verified.
Memos are born-digital and are never hand-written by us; a bad memo line is re-extracted
from the memo PDF.

## 8. Guardian link and consent — the spine

```mermaid
sequenceDiagram
  autonumber
  participant L as Learner (under 18)
  participant W as Next.js
  participant D as Supabase
  participant G as Guardian (second phone)
  participant J as jobs (Railway)

  L->>W: /auth/consent -> Invite my guardian
  W->>D: insert guardian_links (half-open: code, learner_id, status=pending)
  W-->>L: code + WhatsApp share link /join/CODE
  L->>G: WhatsApp message
  G->>W: /join/CODE -> /guardian/join (transparency timeline)
  G->>W: accept + consent
  W->>D: service role: attach guardian_id, record consent fields (client cannot write them)
  D->>D: trigger: activate link, profiles.consent_status -> competent_person
  D-->>W: link active
  W-->>L: "Your guardian is linked" (no refresh needed)
  W-->>G: effort window (aggregate views only)
  J->>D: weekly: compute digest from aggregate views
  J->>G: WhatsApp/email digest
  G->>W: revoke (anytime)
  W->>D: status=revoked (consent semantics per attorney F3)
```

## 9. The data flywheel — how the product trains our own AI

```mermaid
flowchart TB
  USE[Learners practice<br/>typed, photo, canvas] --> ATT[(attempts)]
  ATT --> MARK[Marker: frontier model<br/>behind our prompt + gates] --> RES[(mark_results)]
  RES --> DISP[(disputes)] --> TRI[Weekly triage<br/>admin console]
  TRI --> GOLD[(golden sets per subject<br/>tools/evals/golden)]
  TCON[Teacher console corrections<br/>marker of record] --> LABELS
  RES --> LABELS[(de-identified training pool<br/>question, memo, answer, correct marking)]
  DISP --> LABELS
  GOLD --> EVAL{golden-set eval<br/>merge blocker}
  LABELS -->|5-10k verified / subject| FT[Fine-tune small open model<br/>Unsloth / OpenAI FT]
  FT --> EVAL
  EVAL -->|beats frontier| INF[Inference gateway<br/>vLLM on Railway GPU host]
  INF --> MARK
  RES --> MAST[Mastery model<br/>BKT / IRT-class, ours]
  MAST --> BRAIN[[The Guardian Brain<br/>trajectory, next-best-practice, radar matching]]
  BRAIN --> SET[Today's set, APS band,<br/>pathways, deadlines]
  SET --> USE
  ERASE[Erasure request] -. user_id SET NULL,<br/>photos deleted .-> ATT
```

The loop is the moat: every marked answer and every dispute becomes a labeled example,
every teacher sign-off is a gold label, the golden sets gate every change, and the Brain's
own models learn from verified mastery evidence — never from identifiable data, and
always erasure-respecting.

## 10. Web, mobile and backend — the communication contract

```mermaid
flowchart LR
  subgraph Clients
    WEBC[Web / PWA<br/>Next.js client]
    MOBC[Mobile<br/>Expo RN]
    CORE[[packages/core<br/>shared logic + zod contracts]]
  end
  WEBC --- CORE
  MOBC --- CORE
  WEBC -- Supabase JS: RLS reads/writes, auth session --> SB[(Supabase)]
  MOBC -- Supabase JS: same policies, same session --> SB
  WEBC -- typed HTTP: /mark /record /radar /tutor (JWT) --> API[brain-api]
  MOBC -- same API, same contracts --> API
  WEBC -- server actions: service-role tasks --> SB
  MOBC -- offline queue: attempts sync on reconnect --> API
  API -- realtime / polling: marking progress --> WEBC & MOBC
  CORE -. zod schemas are the contract .-> API
```

The clients are thin: they read and write the data plane directly under RLS, call the
Brain API for anything that computes or spends, and share every rule (APS, streak,
adaptive set, contracts) through `packages/core` so web and mobile cannot drift. The API
contract is the zod schema; the mobile app is a second client of an API that already
exists, not a second backend.

## 11. The review gates — the admin console in the wire

```mermaid
flowchart LR
  ING[Ingest status] --> CR["/admin/content/[paperId]  review gate"]
  CR -->|approve| LOADED[(loaded + clipped)]
  DQ["/admin/disputes  triage"] --> GC[add golden case] --> EV["/admin/evals  runs"]
  EV -->|green| DEPLOY[prompt vN deployed]
  RC["/admin/radar  curate"] -->|source + verified date| RI[(radar_items)]
  ER["/admin/users/erasure"] --> TOOL[erase-user] --> DONE[(audit line)]
  FL["/admin/flags"] --> FEAT[hackathon layers, canvas, subject gates]
```

Nothing reaches a learner without passing through one of these doors: content through
the review gate, model changes through the eval runs, radar rows through the curation
gate, and erasure through an audited tool.
