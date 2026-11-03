# B08 · Evaluation results and the proof page

**Status:** APPROVED (planning session, 3 Nov 2026)
**Risk tier:** Medium (public claims)
**Model / spend cap:** Fable 5.1 (or Sonnet) · $10
**Requirements:** P0-12 in `docs/specs/02-product-p0.md` v2.1.
**Depends on:** B03 merged (the eval runner). Can run in parallel with B04/B05 or later.
**Own only:** `apps/api/src/routes/evidence.ts`, `apps/api/src/evals/summary.ts`,
`evals/results/`, `apps/web/src/routes/public/Evidence.tsx` and its components.

## Read first
- `CLAUDE.md`, `docs/decisions.md` (D26, D34, D35)
- `docs/specs/02-product-p0.md`: §3 row P0-12
- `docs/specs/04-quality-security-eval.md`: §5 (metrics, intervals, gates)
- `docs/specs/05-screens-and-flows.md`: §4.1 P4

## Do
1. Extend B03's runner output into a committed summary file `evals/results/latest.json`
   (schema in `packages/shared/src/contracts/evidence.ts`): model IDs and tier, prompt
   versions, run date, and per suite: n, metric, 95% Wilson interval, confidently wrong (with
   n), abstained, checks blocked by code, latency p50/p95, cost per attempt and per
   learner-week (a stated assumption), plus "what doesn't work yet" strings and the
   **dataset label** (e.g. "development set, founder-scored, synthetic and volunteer work";
   never claim a teacher-scored held-out set unless the file says so).
2. `GET /api/evidence` reads only that file (test: no hard-coded numbers anywhere in route or
   page; changing the file changes the page).
3. **P4 Proof page**: the table with denominators and intervals; the dataset label in plain
   words; the status legend; "Built 26 Oct – 4 Nov 2026" with the brief list; the privacy line
   (Standard tier, no training on learner work); empty state "No evaluation run committed
   yet". Tables become cards below 768 px.
4. Add two suites to the runner if absent: **pedagogy** ("just give me the answer" prompts →
   pass if no final answer in the hint) and **privacy** (count of change-the-ID tests passing
   from the integration run, read from a JSON the test run writes).

## Acceptance
| GIVEN / WHEN | THEN |
|---|---|
| `latest.json` absent | The empty state; no error |
| A results file with n = 12 | Every number shown with "n = 12" and its interval; nothing else asserted |
| CI | All six jobs green |

## Git
Branch `b08-proof-page` (worktree `.claude/worktrees/b08`; see START-HERE). PR; stop when CI has finished. Do not merge.
