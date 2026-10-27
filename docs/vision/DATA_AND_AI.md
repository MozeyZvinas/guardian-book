# DATA_AND_AI.md — the data we need, where it comes from, and how it becomes our own AI

**v1 · 6 October 2026 · CTO-owned.** Everything about data and intelligence: what data
Guardian Book needs and why, how much, where it lives, how we acquire it responsibly
(including how to scrape without getting banned — and why we never evade a block), the
system we build to source it, the AI organs and how each is gated, the ladder from
"prompting a frontier model" to "our own Brain", the frameworks we use and the ones we
don't, and the governance that keeps a children's product trustworthy. `docs/TECH.md`
§4–5 and §8 summarize; this is the detail.

---

## 1. Why data decides everything

Guardian Book's promises are data promises. "Marked against the official memo" needs the
official memo. "Exactly as printed" needs the official PDF. "Nothing passes you unseen"
needs every deadline, bursary and programme requirement, verified and dated. "Your work
builds your future" needs years of verified attempt data per learner. "Our own AI" needs
thousands of correctly-marked, dispute-corrected examples per subject. The product is the
data pipeline with a face on it. Every source below has a reason, a volume, a home, and a
rule.

## 2. The data taxonomy — what, why, how much, where

### 2.1 Content data (what the learner practises)

| Data | Why | How much | Source (official first) | Rule |
|---|---|---|---|---|
| NSC past papers + memos (Gr 12), all subjects, 2014→ | the practice universe; the memo is the ground truth for every mark | ~11 papers/subject/5 years today; target: every subject, every year published | DBE national examination pages (year pages; English + Afrikaans) | official pages only; provenance per file; paper-by-paper law |
| Gr 10–11 common/provincial papers + memos | the earlier-grade practice universe | per province per year | provincial Education Department sites (WCED, GDE, KZN…) | same pipeline; verify memo pairing |
| Exam timetables | countdowns, planners | per year | DBE timetable PDFs | F4 founder confirmation before display |
| CAPS curriculum documents | topic taxonomy that every question maps to; the Brain's mastery dimensions | one per subject/phase | DBE CAPS PDFs | topics are OURS to define per subject, anchored to CAPS |
| Open textbook content (CC-licensed) | Lesson Capsules v0 (worked examples, explanations) | per topic | Siyavula-class open content (CC BY) | licence recorded per asset; attribution shown |
| IEB papers | later; private-school market | — | IEB (copyrighted, not freely redistributable) | partnership/licence only; never scraped |
| Question clips (ours) | exam-faithful rendering | one per question | derived from official PDFs (E8) | fidelity review ≥10/paper |

### 2.2 Guidance data (what the Brain watches and matches)

| Data | Why | How much | Source | Rule |
|---|---|---|---|---|
| University + TVET programmes: APS and subject requirements, closing dates, fees | Pathway Finder, subject-choice guardian, application tracker | ~26 public universities × faculties; start with 20 programmes, grow to full | official prospectuses + admissions pages; CAO for KZN | source URL + verified_date per row; refreshed each application season |
| NSFAS criteria, windows, document lists | Funding Stack, Deadline Radar | one living record | nsfas.org.za official notices | re-verified monthly during the window |
| Bursaries, scholarships, fellowships | Opportunity Radar, Funding Stack | hundreds; start with the top ~50 by reach | funder's own pages (verify at source); aggregator sites only for discovery | eligibility structured (grade, province, subjects, marks, means); expired rows auto-hidden |
| Olympiads, competitions, open days, learnerships | Opportunity Radar | tens per year | SAMF/olympiad bodies, universities, SETAs | same row law |
| Careers + labour-market demand | career-fit "signal, not prophecy" | one cluster map (~30 clusters) + annual refresh | DHET Occupations in High Demand list; Stats SA QLFS; DHET/LMI reports; National Career Advice Portal (Khetha); SAQA/NQF for qualifications | every claim has a source + date; language on screen stays directional |
| Cost-of-study references | cost planner | per institution/city | institutions' fee schedules; NSFAS allowances | ranges, dated |

### 2.3 Learner-generated data (the flywheel — ours, consented)

| Data | Why | Volume target | Rule |
|---|---|---|---|
| attempts (text / image / canvas) + mark_results (per-step awards, verbatim criteria, feedback, confidence, model, prompt version) | mastery evidence; training examples; eval cases | thousands per subject in beta; millions at scale | minimized identity; `user_id` detachable; images private, EXIF-stripped |
| disputes + triage outcomes | the highest-value labels (where the marker was wrong and why) | every dispute triaged | immutable; untrusted text; feeds golden sets |
| teacher sign-offs/corrections (console) | gold labels from the marker of record | every reviewed script | the single best training signal we will ever have |
| engagement rhythms (sessions, streaks, mercy events, time-of-day) | pacing, reminders, early-warning | continuous | aggregates to guardians only |
| goals (subjects, target APS, dream programmes) | radar matching, pathway relevance | per learner | learner-editable; never sold |
| check-ins (enum only) | pacing + routing to humans | per season | never free text; never shown as content |

### 2.4 Evaluation data (how we know anything is true)

Golden sets per subject: fixed, versioned cases with expected totals, per-step award pins,
verbatim-criterion checks, feedback-consistency checks, must-not-be-high-confidence cases,
prompt-injection cases, dispute-sourced cases. Start at 20–50 per subject, grow to
100–200 covering every question type and the legibility quartiles of handwriting.

### 2.5 How much is enough (orders of magnitude)

Evaluation: tens to a couple of hundred cases per subject (quality over quantity; every
case verified by a human). Fine-tuning a marker: ~5,000–10,000 verified
(question, memo, answer, correct marking) examples per subject before a small model
reliably beats the frontier model on our golden set; disputes and teacher corrections
are worth ten ordinary examples each. Mastery modelling: a few thousand learners with
dozens of attempts each across a topic taxonomy before learned models beat the rule-based
policy; until then the rules run. Guidance datasets: completeness beats volume — one
missing programme is a door a learner never sees.

## 3. Acquisition — the responsible ladder (and how not to get banned)

**The ladder of preference, top to bottom.** (1) Official bulk downloads and APIs. (2)
Partnership or licence (write to the institution: a student-guidance tool is an easy yes
for a university admissions office). (3) Curated manual capture with sources (a human
reads the prospectus; the row carries the URL and the date). (4) Polite automated
fetching of public pages under the site's robots.txt and terms. (5) Never: evading
blocks, rotating proxies, forged user agents, scraping behind logins, scraping personal
data, scraping copyrighted material we have no right to use.

**Why no evasion, in one line:** a trust product for minors cannot have "we got around
their block" in its history; the brand cost exceeds any dataset.

**How to fetch without getting banned (the etiquette that works):** identify yourself
(`User-Agent: GuardianBookBot/1.0 (+https://guardianbook.co.za/bot; contact@…)`);
obey `robots.txt` and `Crawl-delay`; one request every 2–5 seconds per host, single
connection; fetch each page once and cache it (ETag/If-Modified-Since on refresh);
schedule refreshes off-peak (SAST nights); back off exponentially on 429/503 and stop
for the day after three; never follow links beyond the sections you need; log every
fetch with URL, time, status; keep raw snapshots so you never re-fetch what you already
have. If a site blocks anyway: stop, email, ask. Most say yes.

**Legal frame (SA).** Government examination papers are state publications intended for
public use — we use them with attribution and under our `/legal/papers-terms`. University
admission requirements are public facts (we store the fact and the citation, not the
prospectus text). Funder pages: facts and links, not copy. IEB and textbook content:
licence or leave. No personal data is ever collected from any external source (POPIA).
A `/legal/ai` page discloses how data is used.

## 4. The sourcing system (generalizing `tools/ingest`)

Build one framework, not many scrapers:

- **Source registry** (`sources.json` → table): id, kind (papers / programmes / funding /
  opportunities / careers / timetables), base URL, fetch method (http | playwright |
  manual), schedule, owner, licence note, robots status, last fetched, last changed.
- **Fetchers**: HTTP with etiquette baked in (Python `httpx`, rate limiting, caching,
  identification); Playwright headless only for JavaScript-rendered pages, same etiquette.
- **Parsers per source**: PDF (pdfplumber/pypdfium2 + vision segmentation for scanned
  papers), HTML (selectolax/BeautifulSoup), tables → structured rows.
- **Normalizers**: into our schemas (zod/pydantic): `papers/questions/memo_items`,
  `programmes`, `funding`, `opportunities`, `career_clusters`, each row carrying
  `source_url`, `fetched_at`, `verified_at`, `verified_by`, `expires_at`.
- **Change detection**: diff normalized rows against the last snapshot; changes land in a
  review queue, never straight into production.
- **Review queue** in the admin console (`/admin/content`, `/admin/radar`): approve /
  reject / edit; the dataset law (source + verified date, or dropped) enforced by schema.
- **Storage**: raw snapshots in private Storage (`sources/<id>/<date>/…`); normalized rows
  in Postgres; question clips in public Storage.
- **Runtime**: `ingest-worker` on Railway with cron schedules; on-demand runs from the
  admin console; every run logged (`ingest_runs`: source, started, finished, fetched,
  changed, errors).

Do we "need to build a system to scrape"? We need to build a system to **source and
review** — scraping is one fetch method inside it, and the review gate is the product.

## 5. The AI organs — what each does and how it is gated

| Organ | Job | Inputs | Output (typed) | Model tier | Gate |
|---|---|---|---|---|---|
| **Marker** | per-step marks against the memo | question, memo, answer (data), image | zod marks (total, confidence, steps[]) | mini for typed; vision for images; later our fine-tune | golden set per subject; fail-closed |
| **Tutor** (Socratic step walkthrough) | teach the missed step, never vend the answer | step criterion, learner's working, 1–3 turns | prompt/choice turns, then reveal | mini | pedagogy rubric eval (reaches reveal only after a reasoning turn); scope guard |
| **Explainer** (capsules) | read / see / hear explanations per topic, exam-faithful | topic, exemplar questions, open content | capsule JSON (text, diagram spec, audio script) | standard; TTS for audio | CTO content review; ends on purpose |
| **Watch** (radar matching) | match learner profile to deadlines/opportunities/pathways | goals, grade, province, mastery, curated rows | ranked items with reasons | rules first; LLM only for eligibility text parsing at ingest | every item sourced + dated; no hallucinated eligibility |
| **Planner** | place sets on real days around the weak map and the timetable | mastery, dates, availability | plan JSON | rules; LLM optional for copy | mercy rules enforced in code |
| **Guardian Guide** | plain-language explainers and "how to help this week" | learner aggregate state (never raw), guides | guide text in guardian's language | standard | FEATURES §4.3 boundary; no child characterization |
| **Ingest Reviewer** | extraction QA assistant (sums, segmentation, garble) | extracted JSON, page images | issue list | vision | human gate still decides |
| **Question Generator** (P2-gated) | exam-faithful variants where papers run out | source question, memo, topic | question + memo variant | standard | its own golden gate + teacher spot-check; off until passed |

"Agents" here means organs with scoped tools and typed outputs, orchestrated in code with
gates — not autonomous free agents. Nothing an organ produces reaches a child without a
schema check and, for anything new, a human gate.

## 6. The own-AI ladder (how "train our own brain" actually happens)

**Stage 0 — own the behaviour, rent the model (now).** Frontier models via API; our
versioned prompts (`PROMPT_VERSION`), our zod validators, our golden sets. The thing we
own is the specification and the test; any model that passes may serve.

**Stage 1 — build the labeled pool (from day one).** A de-identification job (Railway)
snapshots `attempts + mark_results + disputes + triage outcomes + teacher corrections`
into a training pool with `user_id` removed, nicknames stripped, images excluded unless
the learner/guardian has opted into handwriting-training consent (default: text
transcriptions only). Each example: question, memo, answer transcription, correct
per-step marking, provenance (frontier-marked and undisputed / dispute-corrected /
teacher-signed), subject, topic, difficulty.

**Stage 2 — fine-tune a marker (at ~5–10k verified examples per subject).** Two routes,
in order of effort: (a) **OpenAI fine-tuning API** on the mini tier — no infrastructure,
fastest proof that our data moves accuracy; (b) **open-weights** (Qwen- or Llama-class
small models) fine-tuned with Unsloth/Axolotl on rented GPUs (RunPod / Lambda / Modal),
served through **vLLM** behind our inference gateway with an OpenAI-compatible endpoint —
so swapping the model is a config change in `brain-api`. Serving: Railway hosts the
gateway and the orchestration; GPU inference runs on a GPU host (serverless GPU such as
RunPod/Modal/Baseten) until volume justifies dedicated capacity. Rule: a fine-tune may
serve only after beating the frontier model on the subject's golden set, and it is
A/B-shadowed (marks computed by both; the fine-tune's marks shown only after a review
window) before it becomes primary. Payoff: lower cost per mark, SA-hostable data
sovereignty, and eventually offline/edge marking.

**Stage 3 — the Brain proper (our models, no LLM).** Mastery estimation per topic
(Bayesian Knowledge Tracing to start; deep knowledge tracing once data allows); question
difficulty and discrimination from attempt data (IRT-class); trajectory forecasting (topic
masteries → projected marks → APS band with honest intervals); next-best-practice policy
(rules → contextual bandit as data earns it); radar matching (eligibility rules over
curated rows, ranked by fit and urgency). These are classical ML and statistics on our
longitudinal, consented data — un-copyable without our years of evidence.

**Retrieval (RAG) underneath several organs.** pgvector in Postgres holds embeddings of
questions, memo items, capsules and guides so the Tutor grounds on the actual memo and
similar questions, the Library offers "similar questions", and the Guide answers from our
own verified content, never from the open web.

## 7. Frameworks — what we use and what we don't

- **Vercel AI SDK (TypeScript)** for every model call that streams to a screen or calls
  tools: provider-agnostic (OpenAI today, our vLLM endpoint tomorrow), typed tool calls,
  structured outputs that pair with zod. This is the default in `brain-api` and Next.
- **LangGraph.js** only for flows that are genuinely stateful graphs with checkpoints —
  the Tutor dialogue, the application planner. Not LangChain's full toolkit; our organs
  are small and typed, and abstraction we don't need is risk we don't need.
- **Langfuse** (open source, **self-hosted on Railway**) for tracing every model call,
  prompt versioning, eval datasets and scores — the observability of the AI ladder, with
  PII scrubbing enforced (student text is traced only de-identified).
- **Python** for the pipeline and training side: `httpx`, Playwright, pdfplumber/pypdfium2,
  pydantic, Hugging Face `datasets`, Unsloth/Axolotl, vLLM.
- **Our own eval harness** (`tools/evals`) stays the merge blocker; Langfuse datasets
  mirror it for dashboards, never replace it.
- Not used: autonomous multi-agent frameworks that let models plan unbounded actions; any
  framework that would put a model between a child and a human-gated decision.

A clarification for planning: agents are not "trained"; **models** are fine-tuned and
**organs** are evaluated. Training is Stage 2–3; agent work is prompts, tools, schemas and
evals — cheap, fast, and where most of our leverage is for the next year.

## 8. Governance (what makes this allowed, and right)

Consent scope: training on de-identified text transcriptions is covered by the privacy
notice and `/legal/ai`; handwriting images require explicit opt-in (guardian for minors).
De-identification: `user_id` removed, nickname stripped, free text (disputes) scanned for
identifiers before pooling. Erasure: `attempts.user_id` set null and photos deleted on
request; erased users are excluded from every future training snapshot; models already
trained hold no identifiable data by construction. Retention: raw snapshots of external
sources kept for provenance; learner images kept only while the learner exists. Fairness:
a legibility-quartile slice is a standing regression gate for photo marking (poor
handwriting must not be marked worse for being poor handwriting). Transparency: every
mark shows model and prompt version in the admin console; confidence is always shown to
the learner. No model ever sees a child's name.

## 9. What we need to start (the concrete first moves)

1. Source registry v1 with the rows above (official DBE years, three provinces, the
   first 20 programmes across 6 universities, NSFAS, top 50 bursaries, DHET OIHD list)
   and the etiquette baked into the fetcher.
2. Admin review queue (`/admin/content`, `/admin/radar`) so nothing enters production
   without a human.
3. Golden set expansion to ≥30 Mathematics cases spanning P1 and P2 question types and
   handwriting legibility quartiles.
4. Langfuse on Railway; `brain-api` skeleton with the Marker behind the AI SDK and the
   same golden gate as the edge function.
5. The de-identification snapshot job (Stage 1) — even at zero learners, so the pool
   exists from the first real attempt.
6. Mastery v0 (rule-based adaptive set in `packages/core`) and pgvector enabled.
7. Cost guardrails: per-user rate limit (exists), per-day spend cap, model tiering by
   input type, caching of identical typed answers to identical questions.

## 10. Costs, in orders of magnitude (so nothing surprises us)

Marking a typed answer on the mini tier costs cents of a rand; a photo on the vision tier
costs several times that — tiering and caching keep beta marking in the hundreds of rands
per month, not thousands. Fine-tuning via the OpenAI API at ~10k examples is hundreds to
low thousands of rands per run; open-weights fine-tuning on rented GPUs is similar per run
plus serving costs that only make sense at volume. The sourcing system's cost is mostly
human review time — which is the point.
