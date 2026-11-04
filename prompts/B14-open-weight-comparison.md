# B14 · Open-weight comparison on the proof page (Muse Spark Open)

**Status:** APPROVED (planning session, 4 Nov 2026)
**Risk tier:** Medium (public claims)
**Model:** Fable 5.1 on the Claude subscription (`claude --model claude-fable-5-1`)
**Requirements:** P1-d in `docs/specs/02-product-p0.md` §4; D30 (provider-neutral gateway);
D24; D38.
**Depends on:** B08 merged (it is). **Founder action first:** an account with a partner host
that serves **Muse Spark Open** (or Muse Glimmer) through an OpenAI-compatible API, and its
base URL, key and model name in the git-ignored `.env` as `OPEN_WEIGHT_BASE_URL`,
`OPEN_WEIGHT_API_KEY`, `OPEN_WEIGHT_MODEL`. Without them, build everything and stop at
mocked tests.
**Own only:** `apps/api/src/gateway/providers/*`, `apps/api/src/evals/*`,
`packages/shared/src/contracts/evidence.ts`, `apps/web/src/routes/public/Evidence.tsx` and
its components, `evals/results/`.

## Read first (only these)
- `CLAUDE.md`, `docs/decisions.md` (D24, D30, D38), B03's gateway, B08's runner and summary
- The partner host's docs for its OpenAI-compatible endpoint and the open model's licence
  (Muse Model License for Spark Open, Apache 2.0 for Glimmer). Quote what you rely on.

## Do
1. A second provider in the gateway, `open_weight`, used **only by the eval runner** (never
   by app traffic; a test asserts the app's config can't select it). Same retry policy, cost
   from the host's published price (dated), same `model_runs`-style record in the results.
2. `pnpm eval:dev --provider open_weight` runs the same 12 in-repo cases; the summary file
   gains one more model entry with its own suites. If the model can't do structured output,
   record that as a finding (schema validity rate), don't work around it silently.
3. The proof page shows a **comparison row** per metric (Muse Spark 1.3 vs the open model),
   each with n, rate and interval, plus the licence line and "served by [host]". If not run:
   "Open-weight comparison: not run yet".
4. Tests: provider selection, mocked open-weight run, page with and without the second model.

## Don't
- No open-weight model in the learner, parent or teacher paths.
- No claims beyond the file; same dataset label.

## Git
Worktree `.claude/worktrees/b14`, branch `b14-open-weight`. Merge `origin/main` before the
PR; push; PR; stop when CI has finished. Do not merge.
