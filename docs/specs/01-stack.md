# 01 · Stack (Stage 2 ADR): based on real tooling, verified 27 Oct 2026

**APPROVED 27 Oct 2026 (D21).** Source of truth for the stack; the ADR table below lists the
architectural decisions.

**Baseline:** the founder's iGezi stack. A layer is replaced only with a clear reason.

**Scoring:**
- **Cost** at our scale (hackathon, then a pilot of about 1,000 learners).
- **Speed:** time to build.
- **Agent:** how well Claude Code works with it (mature, typed, conventional).
- **Phone:** fit for mid-range Android on patchy data.
- **Residency:** POPIA and data residency.
- **Lock-in.**

## Headline

| Layer | Pick (pinned at scaffold) | Beat | Why |
|---|---|---|---|
| Web app | **Vite 8.3 + React 19.3 + Tailwind 4.3**, a single-page app plus PWA | Next.js 16.4; SvelteKit | Baseline. The app lives behind login, so server rendering earns little. Simplest PWA (vite-plugin-pwa 2.0). Avoids the Next.js server/client and env traps we hit in the legacy build. Agent: excellent |
| API | **Express 5.3** + **Zod 4.6** contracts in `packages/shared` | Fastify 5; Hono | Baseline, mature, the agent knows it well; iGezi patterns (audit log, access control in the API) transfer as knowledge |
| Database | **PostgreSQL on Railway (EU West, Amsterdam)** + **Drizzle ORM 0.45.4 / drizzle-kit 0.31.11** | Supabase Postgres; Neon; AWS RDS af-south-1 | **None of Railway, Supabase or Neon has a South African region** (verified). The baseline is cheapest and simplest now. Plain Postgres + Drizzle can move to RDS Cape Town (about $15 a month) before real minors. Drizzle 1.0 is still RC, so pin 0.45 |
| Auth and consent | **Better Auth 1.7.14+**, email + password only; sessions in Postgres through the Drizzle adapter; required **18+ attestation** field | Own sessions (iGezi-style); Supabase Auth; Auth.js (security-patches only) | Typed, Drizzle-native, actively maintained. **Its advisory history sits in magic-link, OAuth, OIDC and device plugins: we enable none of them.** Pin and watch advisories. Guardian consent is out of scope for an adults-only build |
| File storage | **Railway Bucket** (S3-compatible, private, presigned URLs of 5 minutes or less), $0.015/GB-month | Cloudflare R2 (no Africa); AWS S3 af-south-1 | One vendor for the hackathon. Only adult or synthetic images. Bucket region is unverified: check at setup, and move to S3 Cape Town before minors |
| Background jobs | **None in P0.** Model calls are synchronous with a timeout; evaluation runs as CLI scripts. If async becomes necessary: **pg-boss** on the same Postgres | BullMQ + Redis | No extra service; Redis adds cost and moving parts |
| Model gateway | **One server module** using the **OpenAI npm SDK** with `baseURL=https://api.meta.ai/v1`. Pinned `muse-spark-1.3` (**Standard, never Contributor**), JSON schema output, Zod validation, caps, logging. A provider-neutral interface | Vercel AI SDK; raw fetch | Officially supported by Meta (docs/sdks). Swappable later for under-18 use (D19) |
| PWA and offline | **vite-plugin-pwa 2.0** with `registerType: 'prompt'` (the user taps "Update"), app-shell cache only | Hand-written service worker | Prevents the stale-bundle trap. **No offline-marking claim** |
| Maths and exam rendering | **KaTeX 0.19** over Markdown + LaTeX items; diagrams as SVG | MathJax | Small and fast on low-end phones. Original items, so no page clips |
| Handwriting input | **P0: photo** (`<input capture>`), EXIF stripped server-side. **P1: on-screen canvas** (perfect-freehand 1.2.3) exported to PNG into the same pipeline | react-sketch-canvas 8 | Photo is the real-world path; canvas is a nice-to-have |
| Notifications | **None in P0** | Web push; WhatsApp | Not in the loop |
| Errors and logs | Structured JSON logs with request IDs (no answer text, no personal data); **Sentry free** (1 user, 5k errors) if setup takes under 30 minutes, with PII scrubbing on | Logs only | Good enough for a solo hackathon |
| Product analytics | **None.** The evidence engine is the learning metric | PostHog | No personal tracking in the demo |
| Testing | **Vitest 5** (unit plus integration against real Postgres), supertest (API), **Playwright 1.64** (E2E at phone viewport), an evaluation runner (tsx script) | Jest; Cypress | Baseline; Vitest 5 needs Node 22.12 or later |
| CI/CD | **GitHub Actions** (third-party actions pinned to full SHAs, `permissions: contents: read`, frozen lockfile). Jobs: gitleaks · typecheck · lint · unit · integration (Postgres service container, fresh database) · E2E (against the built image) · Docker build. **Railway deploys `main` after CI passes**, so merge = deploy | Railway build only | Founder rule: merge only on green CI that builds the real image |
| Hosting | **Railway, EU West (Amsterdam):** 1 app service (Express serves the API and the static web build), 1 Postgres, 1 Bucket. **Backups: daily schedule set in B01; restore drill in B11** | Vercel + Supabase; Fly (JNB compute, no managed Postgres in JNB) | D5 is locked; one bill; Amsterdam is closest (inference, not measured); same-origin cookies mean no CORS |

## Toolchain pins

| Tool | Pin | Note |
|---|---|---|
| Node | **24 LTS** (Maintenance, security fixes to April 2028) | Node 26 becomes Active LTS on 28 Oct; upgrade after the hackathon, not during it |
| pnpm | **12.15** | Set via `packageManager`. CI uses the same version |
| TypeScript | **6.0.3** | TS 7 (native, July 2026) is newer than our lint tooling's verified support. Upgrade later |
| Everything else | Exact versions written to the lockfile at scaffold | `pnpm audit` high/critical blocks CI |

## Repo layout (new code only; created in B01)

| Path | What |
|---|---|
| `apps/api/` | Express 5, Drizzle schema and migrations, gateway, routes |
| `apps/web/` | Vite + React + Tailwind (Sentinel tokens), PWA |
| `packages/shared/` | Zod contracts, scoring rules, event reducers (pure, unit-tested) |
| `content/items/` | Original items and marking guidelines (Markdown + YAML), with a reviewer field |
| `evals/` | Case metadata, runner, results JSON (no personal data) |
| `tests/e2e/` | Playwright |
| `.github/workflows/ci.yml`, `Dockerfile`, `docker-compose.yml` | CI, image, local Postgres |

## ADRs to commit after approval (short form)

| ADR | Decision | Revisit when |
|---|---|---|
| ADR-0001 | Modular monolith, one Railway service | Measured need for separate scaling |
| ADR-0002 | Vite SPA + Express, not Next.js | Public SEO pages are needed (they can be a separate static site) |
| ADR-0003 | Railway Postgres (Amsterdam) + Drizzle; move to an SA region before real minors | First real learner data or a pilot (D12) |
| ADR-0004 | Better Auth, email + password only, no risky plugins | We need passwordless or social login |
| ADR-0005 | Meta gateway: Standard tier only, schema-validated, fail closed, provider-neutral interface | Under-18 users (D19), or price or quality changes |
| ADR-0006 | AI is advisory; the teacher is the marker of record; reviews never overwrite proposals | Never |
| ADR-0007 | Original content only in the repo and demo; DBE material only with permission | DBE permission received |

## Security plan (P0)

- **Secrets:** stored only in Railway variables and local `.env`. Local `.env` points at
  docker Postgres, never production. The Meta key lives only in the API process. gitleaks
  runs in CI. `.claude/settings.json` blocks reads of `.env*`.
- **Access control:** every route checks session, role and object ownership in the API
  layer. "Change the ID" integration tests cover every learner and teacher resource.
- **Input:** Zod on every request. Uploads accept only JPEG/PNG/WebP up to 8 MB; the image
  is decoded and re-encoded, which strips EXIF. Text answers are capped at 4,000 characters.
- **Model output** is treated as untrusted: schema-checked, bound-checked, never executed,
  and never allowed to change permissions.
- **Abuse and cost:** per-IP and per-user rate limits; a per-user daily cap on model calls;
  a global daily spend cap (the gateway refuses past it); Meta's spend-limit email at $150.
- **Web:** cookies are `HttpOnly; Secure; SameSite=Lax`; same-origin; Content-Security-Policy
  header; no third-party scripts except Sentry, if used.
- **Logs:** request ID, route, status, latency, model ID and cost. **Never answer text,
  images or email addresses.**
- **Data:** demo data is synthetic or from consenting adults. Never send personal data to
  the model; prompts contain the item, the guideline and the answer only.

## Cost estimate (hackathon)

| Item | Estimate |
|---|---|
| One photo assessment on `muse-spark-1.3` Standard | About 3,500 input tokens (image ~1,400 + prompt ~2,000) and ~800 output → **about $0.008** |
| One typed assessment | About $0.005 |
| Evaluation: 60 cases × 3 runs | About $1.50 |
| Total model spend through 4 Nov | Well under the $150 credit |
| Railway (Hobby or Pro usage), 2 weeks | About $5–20 |
| Claude Code (Fable 5.1 / Sonnet 5.5) | The binding constraint: budget per brief in `04` |
