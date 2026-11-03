# Runbook · Deploy (Railway)

One Railway service (EU West, Amsterdam) built from the repo's `Dockerfile`, plus a
Postgres 16 database and a Bucket. **A merge to `main` is a deploy**: Railway waits for CI
(all six checks green) and then builds the image. Nothing here needs the Railway CLI; the
founder sets it all in the Railway dashboard.

## First-time setup (founder, dashboard)

1. **New project** → region **EU West** → **Deploy from GitHub repo** `MozeyZvinas/guardian-book`,
   branch `main`. Railway detects the `Dockerfile`.
2. **Add Postgres** (16) and **Add Bucket** to the project.
3. **Service → Settings**
   - **Wait for CI:** on. The deploy starts only after the `ci` workflow passes on `main`.
   - **Health check path:** `/healthz` (expects HTTP 200; the app answers within 2 s even
     when the database is down, reporting `db: "down"`).
   - **Port:** Railway injects `PORT`; the app reads it (default 8080).
   - **Restart policy:** on failure.
4. **Service → Variables** (names from `docs/specs/03-architecture-data.md` §7; the app
   boots with none of them and reports each group in `/healthz`):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Reference the Postgres plugin's `DATABASE_URL` |
   | `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
   | `BETTER_AUTH_URL` | The service's public URL, e.g. `https://<service>.up.railway.app` |
   | `META_API_KEY` | From dev.meta.ai → API keys → `guardian-book-app` (Standard tier) |
   | `META_BASE_URL` | `https://api.meta.ai/v1` |
   | `META_MODEL` | `muse-spark-1.3` (never a `-contributor` ID; the app refuses them) |
   | `MODEL_DAILY_BUDGET_USD` | e.g. `20` |
   | `MODEL_USER_DAILY_CALLS` | e.g. `60` |
   | `BUCKET_ENDPOINT`, `BUCKET_NAME`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY`, `BUCKET_REGION` | References to the Bucket's `ENDPOINT`, `BUCKET` (not `RAILWAY_BUCKET_NAME`), `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`, e.g. `${{photos.ENDPOINT}}` |
   | `SENTRY_DSN` | Optional |

   Never set `BENCHMARK_DIR` in the deployed app. Never paste any of these values into a
   chat, a commit or a doc.
5. **Postgres → Backups:** turn on the **daily** schedule (spec 04 §7). The restore drill
   into a scratch environment is B11.
6. **Domain (D36):** generate the Railway domain (target port 8080) and set the variable
   `PORT=8080`. Set `BETTER_AUTH_URL` to the Railway URL until `guardianbook.app` is green,
   then to `https://guardianbook.app`.

## Domains (D36): `guardianbook.app` is the front door

Both domains are registered at GoDaddy; their DNS lives on Cloudflare (free plan).

| Name | Cloudflare record | What it does |
|---|---|---|
| `guardianbook.app` | `CNAME @ → <value Railway shows>` (proxied) + Railway's `TXT` (exact name and value) | The product. Railway custom domain, port 8080 |
| `www.guardianbook.app` | `CNAME www → guardianbook.app` (proxied) | Redirect rule "WWW to root", 301 |
| `guardianbook.co.za`, `www.guardianbook.co.za` | `A @ → 192.0.2.1` (proxied, placeholder) + `CNAME www → guardianbook.co.za` (proxied) | Redirect rule: `concat("https://guardianbook.app", http.request.uri.path)`, 301, keep query |

Cloudflare settings on both zones: SSL/TLS **Full** (never Full (strict)); Universal SSL on;
Always Use HTTPS on. Limits the app must respect behind the proxy: **100 s** per request
(model calls must finish or fail inside it) and **100 MB** per upload.
If a custom domain shows a 404 after the CNAME resolves, the `TXT` record is missing or
wrong. If the browser loops (`ERR_TOO_MANY_REDIRECTS`), SSL/TLS is not on **Full**.

## Every deploy

1. CI green on the PR → the founder merges (`gh pr merge <n> --squash`).
2. Railway builds and swaps when `/healthz` returns 200.
3. **Check in a fresh tab** (PWA cache trap) and on the phone:
   `https://guardianbook.app/healthz` (or the `*.up.railway.app` URL) must show `"ok":true` and the expected
   `configured` flags; `/` must render the landing screen.

## Rollback

Railway → Deployments → the previous successful deployment → **Redeploy**. Migrations
(from B02 on) are additive only, so the previous version keeps working against the newer
schema. Record what happened in `docs/runbooks/incidents.md`.

## Migrations and the demo seed (from B02)

- **Migrations run at boot.** When `DATABASE_URL` is set the server applies pending
  migrations (`apps/api/drizzle/`, additive, idempotent) before it listens; a failure is
  logged and `/healthz` still answers. To run them as a separate release step instead, set
  `DB_MIGRATE_ON_BOOT=false` and use Railway → Settings → Deploy → **Pre-deploy command**:
  `node apps/api/dist/db/migrate.js`.
- **Seed the demo circle once** (fictional people only). With the Railway CLI linked to the
  app service: `SEED_PASSWORD='<choose one>' railway run pnpm db:seed`. It prints the class
  codes; the seed password is never committed and never shared in chat. Re-running is safe.
- **Reviewed content** is loaded the same way from a directory outside the repo:
  `railway run pnpm content:load /path/to/items`.

## Local rules that protect production

- Local `.env` points at docker Postgres (`127.0.0.1:5433`), never at Railway. The
  integration harness refuses any non-loopback database host.
- Secrets live only in Railway variables and the git-ignored `.env`.
