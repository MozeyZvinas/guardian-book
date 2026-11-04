# B10 · Release hardening (runs last, after B09 and B11–B13 merge)

**Status:** APPROVED (planning session, 4 Nov 2026)
**Risk tier:** High (security, production)
**Model:** Fable 5.1 on the Claude subscription (`claude --model claude-fable-5-1`)
**Requirements:** P0-13 in `docs/specs/02-product-p0.md`; `docs/specs/04-quality-security-eval.md`
§3–§7; D37 (CSP note), D38.
**Depends on:** the wave-3 PRs merged. **Own:** middleware, config, CI, runbooks, README's
run section; small fixes anywhere they're needed, each named in the PR.

## Do
1. **Rate limits** (spec 03 §5): 60 requests/min per IP on `/api`, 10 assessments/min per
   user, sign-in and sign-up 10/min per IP; 429 with a plain message. Tests.
2. **Headers:** tighten CSP to `style-src 'self'; style-src-attr 'unsafe-inline'` if KaTeX
   still renders (Playwright check), otherwise keep D37's setting and say so;
   Permissions-Policy as B13 left it; HSTS; `X-Content-Type-Options`; frame-ancestors none.
3. **Errors:** a friendly 404 and error screen; API errors never leak stack traces; the
   request ID shown so a user can quote it.
4. **Dependencies:** `pnpm audit --prod` clean at high; record anything accepted.
5. **Secrets and history:** gitleaks over the full history (CI already); confirm no `.env`,
   key or seed password anywhere in the repo or the built bundle.
6. **Logs:** a test that no log line carries answer text, emails, passwords, images, audio
   or translations.
7. **Restore drill (runbook):** write `docs/runbooks/restore.md` from Railway's backup
   feature (the founder runs it later; record the date it was last tested as "not yet").
8. **Final pass:** `/healthz`, the PWA update path, `robots.txt`, and the README's run
   section match reality. Update `docs/TASKS.md`.

## Git
Worktree `.claude/worktrees/b10`, branch `b10-hardening`. Merge `origin/main` before the PR;
push; PR; stop when CI has finished. Do not merge.
