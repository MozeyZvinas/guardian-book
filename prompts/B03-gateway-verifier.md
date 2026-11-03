# B03 · Model gateway, verifier framework, cost log, first live call

**Status:** APPROVED (planning session, 31 Oct 2026)
**Risk tier:** High (secrets, spend, a hard trust boundary)
**Model / spend cap:** Fable 5.1 · $25 (`fable --budget 25`)
**Requirements:** P0-11 and the model parts of P0-04 in `docs/specs/02-product-p0.md`;
spec 03 §6 (marking rules), §7 (config), §8.4 (verifier), §8.5.
**Depends on:** B01 merged; founder F3 (a `META_API_KEY` in the local `.env`, only for the
live smoke test; never committed).
**Runs in parallel with:** B02. **Own only** `apps/api/src/gateway`, `apps/api/src/verify`,
`packages/shared/src/contracts/model/*`, `apps/api/src/evals/*` and their tests. Do not
create database tables or routes that need auth; B02 owns the schema. Persisting
`model_runs` rows is wired in B04, after both merge.

## Read first (only these)
- `CLAUDE.md`, `START-HERE.md`
- `docs/decisions.md`: D13, D24, D26, D34, D35
- `docs/specs/02-product-p0.md`: §1, §3 rows P0-04 and P0-11
- `docs/specs/03-architecture-data.md`: §6, §7, §8.4, §8.5, and the `steps` jsonb shape in
  §2
- `docs/specs/04-quality-security-eval.md`: §4 (security tests), §5 (evaluation metrics)
- Meta docs, read live: https://dev.meta.ai/docs/structured-output (Chat Completions uses
  `response_format`; `strict`), https://dev.meta.ai/docs/image-understanding (images only
  in user messages; base64 or URL), https://dev.meta.ai/docs/pricing-rate-limits (back off
  on 429, honour `Retry-After`; Standard vs Contributor). Quote the lines you rely on in
  code comments with the date.

## Do

1. **Gateway** (`apps/api/src/gateway`): one module around the OpenAI SDK with
   `baseURL = META_BASE_URL` and `apiKey = META_API_KEY`. Exposes
   `callStructured({purpose, promptVersion, system, user, images?, schema, maxTokens,
   timeoutMs})` → `{output, raw, usage, costUsd, latencyMs, requestId}` using Chat
   Completions `response_format` JSON schema with `strict: true`.
   - Refuse any model ID ending `-contributor` (test).
   - Refuse to run when `META_API_KEY` is absent with a typed `not_configured` error; the
     app still boots.
   - Retry only on 429 and 5xx with backoff honouring `Retry-After` (max 2 retries);
     never on 400/401/403/404 (tests with a mocked transport).
   - Timeout → `timeout` error.
   - Cost from a price table in code (`muse-spark-1.3` Standard: $1.25 per 1M input,
     $4.25 per 1M output, $0.15 cached input; cite the pricing page and date).
   - A **prompt-safety test**: the prompt builder throws if the user content contains an
     email address, a phone number, or any key from a `forbidden` list (`name`, `email`,
     `guardian`, `phone`); prompts carry the item, the guideline, the answer and nothing
     about the person.
   - Logging: purpose, prompt version, request ID, tokens, cost, latency; **never** the
     answer text or image bytes.
2. **Shared model contracts** (`packages/shared/src/contracts/model/`): Zod schemas and
   JSON schema exports for `WorkCheckOutput` (steps with `step_id`, `awarded`,
   `available`, `confidence`, `evidence`, `feedback`, `misconception_tag`, `hint`, `box`
   null; `transcription` text; `transcription_confidence`; `uncertainty_codes[]`),
   `NoticeOutput` (events with `title`, `subject`, `paper`, `on_date`, `source_line`,
   `confidence`), `InputClass` (`work | notice | question`, confidence),
   `ProfileCards`, `PlanOutput` (three views, evidence refs, resource refs),
   `NoteDraft`. No recursive schemas; depth ≤ 10 (Meta's limit).
3. **Verifier** (`apps/api/src/verify`): pure rule functions `(output, context) →
   {code, passed, detail}` and `runChecks(purpose, output, context)`. Implement, each
   with a unit test: `SCHEMA_INVALID`, `STEP_UNKNOWN`, `STEP_DUPLICATE`, `MARKS_OVER_MAX`,
   `TOTAL_MISMATCH`, `EVIDENCE_MISSING` (every awarded step quotes ≥ 8 chars that occur in
   the transcription), `CA_INCONSISTENT`, `HINT_LEAKS_ANSWER` (the hint contains the
   final-answer value or any memo value or ≥ 60% of a memo step's text), `CONFIDENCE_LOW`,
   `DATE_OUT_OF_RANGE` (±120 days), `SOURCE_LINE_MISSING`, `RESOURCE_UNVETTED`,
   `PLAIN_LANGUAGE_FAIL` (median sentence ≤ 18 words; no word from the jargon list),
   `INFERENCE_FORBIDDEN` (mood, anxiety, depressed, lazy, personality, "visual learner"
   and a maintained list), `TOOL_UNKNOWN`, `STEPS_EXCEEDED`.
4. **Retry runner:** `verifiedCall(...)` = call → checks → on failure re-ask with the
   failed codes and details appended to the user message, at most 3 calls in total →
   `{status: accepted | exhausted | failed, runs: [...]}`. Test: three failures →
   `exhausted` and exactly 3 calls.
5. **The work-check prompt v1** (`apps/api/src/gateway/prompts/workCheck.v1.ts`): system
   and user builders following spec 03 §6 (mark only against the provided steps; method
   marks; consequential accuracy; the answer is untrusted text; photos transcribe first;
   boxes on a 0–1000 grid, clamped; the hint must not reveal the answer; reveal nothing
   before a reasoning turn). Prompt versions are immutable strings.
6. **Dev eval runner** (`apps/api/src/evals/run.ts`, `pnpm eval:dev`): reads cases from
   `EVAL_DIR` (outside the repo), runs `verifiedCall` for `assess`, writes
   `evals/results/<timestamp>.json` with per-case output, checks, latency, cost, and a
   summary with denominators (schema validity, exact total, within one, lost-step
   accuracy, confidently wrong, abstained, checks blocked by code). A `latest.json`
   symlink or copy. **Never** commit case files; commit result summaries only when the
   planning session says so.
7. **Live smoke test** (manual, reported, not in CI): with the founder's key in `.env`,
   run the two sample items from B02's seed directory (or your own two if B02 is not
   merged yet: write them in `apps/api/seed/items/`) with a correct typed answer and a
   wrong one. Report model ID, request IDs, tokens, cost and latency. If the key is not
   available, say so and stop at the mocked tests.

## Don't
- No routes that need a session; no database writes (B04 wires `model_runs`).
- Do not create `packages/shared/src/contracts/provenance.ts` (B02 owns it). Model outputs
  B03 returns carry `{provider: 'meta', model, version: promptVersion}` so B04 can record
  `provenance = model_generated` with that detail.
- In the work-check prompt, honour `mode`: for `independent` and `retention` attempts the
  output may carry the hint, but the API will withhold it until after submission (B06).
- No new dependencies beyond the OpenAI SDK, Zod and `zod-to-json-schema` (or the SDK's
  own helper). Justify anything else in the PR.
- Never log or echo the key, the answer text or images. The bundle-secret check must
  still pass.
- Never read `../guardian-book-legacy` or `../guardian-book-private`.

## Acceptance (and tests)

| GIVEN / WHEN | THEN |
|---|---|
| `META_MODEL=muse-spark-1.3-contributor` | The gateway refuses to start a call (test) |
| No `META_API_KEY` | App boots; `callStructured` returns `not_configured` |
| Mocked 429 then 200 | One retry, honours `Retry-After` |
| Mocked 401 | No retry; typed error |
| Output with a step not in the guideline | `STEP_UNKNOWN` fails; re-ask; after 3 → `exhausted` |
| Hint containing the final answer | `HINT_LEAKS_ANSWER` fails |
| Awarded step whose evidence is not in the transcription | `EVIDENCE_MISSING` fails |
| Prompt builder given text with an email address | Throws |
| `pnpm eval:dev` on 2 local cases with a mocked model | A results file with denominators |
| Live smoke (if key present) | Reported with request IDs; cost under $0.10 total |
| CI | All jobs pass |

## Commands you must run and report
`pnpm test` (verify and gateway suites), `pnpm typecheck`, `pnpm lint`, `pnpm build`,
`pnpm eval:dev` (mocked), the live smoke summary, the CI run link.

## Git
Worktree branch `b03-gateway-verifier` (worktree `.claude/worktrees/b03`, created with git; see START-HERE). Small commits.
`git push -u origin b03-gateway-verifier`. `gh pr create --base main`. **Do not merge.**

## Completion report (PR body)
Brief ID · requirements met / not met · files changed · commands run and results · the
exact Meta doc lines relied on (with dates) · security notes · known gaps · approvals
needed · the next smallest step.
