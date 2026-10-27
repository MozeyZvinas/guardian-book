# Brief template (every Claude Code task uses this shape)

```
# B<NN> · <outcome in a few words>
Status: APPROVED (planning session, <date>) · Risk tier: Low | Medium | High
Model / spend cap: Fable 5.1 | Sonnet 5.5 · $<cap> (run with --budget <cap>)
Requirements: <IDs from docs/specs/02-product-p0.md>
Depends on: <brief IDs, founder actions>

## Read first (only these)
- CLAUDE.md, START-HERE.md, docs/decisions.md (<IDs>)
- <spec file §section>, …

## Current truth
<what exists in the repo right now, as checked by the planning session>

## Do
1. …

## Don't
- No work outside this brief. No new dependencies beyond those listed (justify any extra in the PR).
- Never read or copy from ../guardian-book-legacy or ../guardian-book-private.
- No secrets in code, logs or commits. No production URLs in .env.

## Acceptance (GIVEN / WHEN / THEN) and tests to add
- …

## Commands you must run and report (real output summaries)
- …

## Git
Branch `b<NN>-<slug>` → small commits → push → open a PR to main with the completion report as the PR body.
Do not merge. Stop when the PR is open and CI has run.

## Completion report (PR body)
Brief ID · requirements met / not met · files changed · commands run + results · commands NOT run + why ·
security notes · model calls (ID, count, cost, latency) if any · known gaps · approvals needed · next smallest step
```
