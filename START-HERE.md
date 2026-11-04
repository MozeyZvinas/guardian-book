# START HERE

Read this first, every session. Chats hold no state; this page does.
**Updated:** 3 Nov 2026, planning session (briefs B04–B08 ready).

## What we're doing right now

Building **Guardian Book** for the **Meta Global AI Developer Hackathon** (Indie, solo),
scope v2.1 (D34, D35): **one learner, three people, one Brain**, shown as **the learner
support loop**. A learner, their guardian and
their teacher, linked; the learner brings anything; Muse Spark reads it; checks the model
cannot skip; the Brain updates; one Help Plan rendered three ways; the teacher confirms
and approves the note home. The homework check is one input, never the headline.

**Deadlines:**
- Full phone run (Gate P0): **as soon as B06 + B07 merge; target Wed 4 Nov, 13:00 SAST** (moved 3 Nov: B02/B03 started late).
- Submit by **20:00 SAST, Wed 4 Nov** (official close 04:00 SAST, 5 Nov).
- Promotional Claude credit expires **14 Nov**.

**Judging** (D17): Impact 30% · Use of Meta tooling 25% · Technical depth 20% · Demo 25%.

**Rules that shape everything:** public repo; new work only, built during the event; no
platform-policy violations; no assets we don't have rights to; every account holder in
this build is an adult (D19); Standard model tier only (D24).

## Current reality (verified 31 Oct)

- **Repo:** docs only (specs 01–04, decisions to D34, briefs B01–B03). No code, no CI, no
  deploy. **Local commits not yet pushed** (F2 overdue).
- **Meta account:** credits and card on; spend limit not set; no app key (F3 overdue).
- **Railway:** no project (F4 overdue).
- **People:** no teacher, parents or learner volunteers yet (F5 overdue).
- **Content:** nothing in the repo; original items are written by the planning session
  (C1) and loaded from outside the repo.

## Specs (approved)

| File | What it settles |
|---|---|
| `docs/specs/01-stack.md` | Stack, versions, security plan, costs |
| `docs/specs/02-product-p0.md` (v2) | Scope v2, acceptance tests, cut order, stop rules |
| `docs/specs/03-architecture-data.md` | Data model, permissions, API, marking rules; §8 adds the circle |
| `docs/specs/04-quality-security-eval.md` | Tests, CI, security tests, evaluation, delivery |
| `docs/specs/05-screens-and-flows.md` | Every screen, the navigation map, the core flow, responsive rules, states |
| `docs/specs/06-frontend-pwa-mobile.md` | Frontend architecture, responsive rules, PWA, performance budget, the native path |
| `docs/BUILD-PLAN.md` | One page: what we build, in what order, who does what |

## Tracker

`docs/TASKS.md` holds the board. **Next briefs:** `prompts/B01-scaffold-ci-deploy.md`,
then `B02` and `B03` in parallel.

## Founder: do these now, in order (about 40 minutes)

The planning session has done everything it can from its side (specs, briefs, settings,
`.gitignore`, the commits). These five need your accounts.

**1. Push, go public, protect `main`** (paste the whole block in Terminal; it asks nothing):
```bash
cd ~/Projects/guardian-book && git status -sb && git push -u origin main
gh repo edit MozeyZvinas/guardian-book --visibility public --accept-visibility-change-consequences
cat > /tmp/gb-ruleset.json <<'EOF'
{"name":"protect-main","target":"branch","enforcement":"active",
 "conditions":{"ref_name":{"include":["refs/heads/main"],"exclude":[]}},
 "bypass_actors":[{"actor_id":5,"actor_type":"RepositoryRole","bypass_mode":"always"}],
 "rules":[{"type":"deletion"},{"type":"non_fast_forward"},
  {"type":"pull_request","parameters":{"required_approving_review_count":0,"dismiss_stale_reviews_on_push":false,"require_code_owner_review":false,"require_last_push_approval":false,"required_review_thread_resolution":false}},
  {"type":"required_status_checks","parameters":{"strict_required_status_checks_policy":false,"required_status_checks":[{"context":"gitleaks"},{"context":"typecheck"},{"context":"lint"},{"context":"unit"},{"context":"integration"},{"context":"build-image"}]}}]}
EOF
gh api -X POST repos/MozeyZvinas/guardian-book/rulesets --input /tmp/gb-ruleset.json > /dev/null && echo "ruleset on main: ok"
```
If `gh` says you are not logged in: `gh auth login` first, then paste again. (The ruleset
requires a pull request and the six CI checks B01 creates, and blocks force-pushes; you,
as admin, can bypass it in an emergency.)

**2. Meta key.** dev.meta.ai → Billing: spend-limit email at $150. API keys → create
`guardian-book-app`. Then, in Terminal (the key goes only into the git-ignored `.env`):
```bash
cd ~/Projects/guardian-book && touch .env && chmod 600 .env && printf 'META_API_KEY=PASTE_THE_KEY_HERE\nMETA_BASE_URL=https://api.meta.ai/v1\nMETA_MODEL=muse-spark-1.3\n' >> .env && open -e .env
```
Replace `PASTE_THE_KEY_HERE` in the editor that opens, save, close. Never paste the key
into any chat. Note whether `muse-wonder-1.0` appears in your model list.

**3. Railway.** railway.com → New project (region EU West) → Deploy from GitHub repo
`MozeyZvinas/guardian-book` (it will fail until B01 merges; that is fine) → Add Postgres →
Add Bucket → Variables: paste the names from `docs/specs/03-architecture-data.md` §7 with
the values from Railway's Postgres and Bucket panels, plus `META_API_KEY`, `META_BASE_URL`,
`META_MODEL`, `BETTER_AUTH_SECRET` (generate: `openssl rand -base64 32`), `BETTER_AUTH_URL`
(the Railway app URL) → Settings: "Wait for CI" on; health check `/healthz`; daily backups on.

**4. People.** Today: one maths teacher, two or three parents, one or two learners aged 18+.
Two consents each (data; filming). Handwritten answers by Saturday.

**5. Claude Code.** Two terminals, two credit sources (billing is decided per terminal by
whether `ANTHROPIC_API_KEY` is set). Remove any `export ANTHROPIC_API_KEY=...` from
`~/.zshrc` first.
```bash
# Terminal A — promotional credits (Console key); the key never enters history
cd ~/Projects/guardian-book
read -s "ANTHROPIC_API_KEY?Console API key: "; echo; export ANTHROPIC_API_KEY
fable            # approve "use API key" when asked; /status must show API key
```
```bash
# Terminal B — subscription (open only after B01 merges)
cd ~/Projects/guardian-book
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
fable            # /status must show the subscription
```
Watch `/usage` in each. The spend caps in the briefs ($15 B01, $25 B02/B03) are yours to
hold: stop a session that passes its cap.

## Prompts to paste into Claude Code (one per session, exactly as written)

**Terminal A, now (B01):**
```
Read CLAUDE.md, START-HERE.md, docs/decisions.md (D16, D19–D27, D34) and docs/BUILD-PLAN.md. Then carry out prompts/B01-scaffold-ci-deploy.md and only that brief. First, in one message, report the actual state of the repo (files, no code yet) and your file-by-file plan; then proceed without waiting. Name the six CI jobs exactly gitleaks, typecheck, lint, unit, integration, build-image. Work on branch b01-scaffold, commit small, push the branch, open the PR with the completion report as the body, and stop when CI has finished. Do not merge. If anything in the brief is ambiguous, add the question under B01 in docs/TASKS.md and stop.
```
When CI is green, send the PR link to the planning session. Merge only after its review.

**Opening a session in its own worktree.** `fable` has no `-w` flag (its options are
`--model`, `--budget`, `--effort`, `--resume`), so make the worktree with git first. Replace
`b02` and the branch name for each brief; run from the main folder after `git pull`:
```bash
cd ~/projects/guardian-book && git pull --rebase && git fetch origin
git worktree add .claude/worktrees/b02 -b b02-data-auth-circle origin/main
cp .env .claude/worktrees/b02/.env
cd .claude/worktrees/b02 && fable --budget 30
```
Terminal B (subscription): `unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN` before `fable`; if
`fable` needs an API key, run `claude --model claude-fable-5-1` instead. After a merge:
`git worktree remove .claude/worktrees/b02` from the main folder.

**Terminal A (B02):** worktree `b02`, branch `b02-data-auth-circle`, `fable --budget 30`, then paste:
```
Read CLAUDE.md, START-HERE.md and docs/decisions.md (D19, D21, D24, D34, D35). Carry out prompts/B02-data-auth-circle.md and only that brief, in this worktree. Do not touch apps/api/src/gateway, apps/api/src/verify or packages/shared/src/contracts/model (another session owns them). Report the repo state and your plan in one message, then proceed. Small commits; push branch b02-data-auth-circle; open the PR with the completion report; stop when CI has finished. Do not merge.
```

**Terminal B (B03):** worktree `b03`, branch `b03-gateway-verifier`, `fable --budget 25`, then paste:
```
Read CLAUDE.md, START-HERE.md and docs/decisions.md (D13, D24, D26, D34, D35). Carry out prompts/B03-gateway-verifier.md and only that brief, in this worktree. Own only apps/api/src/gateway, apps/api/src/verify, packages/shared/src/contracts/model and apps/api/src/evals; create no database tables and no authenticated routes. Read the three Meta doc pages named in the brief before writing the gateway and quote the lines you rely on in code comments with today's date. If META_API_KEY is absent from .env, stop at the mocked tests and say so. Report the repo state and your plan in one message, then proceed. Small commits; push branch b03-gateway-verifier; open the PR with the completion report; stop when CI has finished. Do not merge.
```

**Review loop.** Paste each PR link to the planning session. It reviews the diff against the
brief and replies "merge" or with the fixes to paste back into the same session. You merge
(`gh pr merge <n> --squash`), Railway deploys, you open the URL in a fresh tab.


## The build schedule (3–4 Nov; the cut order in spec 02 §6 applies the moment a step slips)

| When | Terminal A (promotional credits) | Terminal B (subscription) | Optional Terminal C (subscription) |
|---|---|---|---|
| Now | B02 (worktree `b02`) | B03 (worktree `b03`) | — |
| After B02 + B03 merge | B04 (worktree `b04`) | B05 (worktree `b05`) | B08 (worktree `b08`) |
| After B04 (+ B05) merge | B06 (worktree `b06`) | B07 (worktree `b07`) | — |
| As soon as B06 + B07 merge (target 4 Nov, 13:00) | **The full run on your phone** | | |
| 4 Nov, after the phone run | B09 polish and PWA | B10 hardening | Record the video and the X cut |
| 4 Nov, by 20:00 SAST | **Submit** | | |

The prompt for every brief follows the same pattern (replace NN and the decision list):
```
Read CLAUDE.md, START-HERE.md and docs/BUILD-PLAN.md. Carry out prompts/BNN-....md and only that brief, in this worktree, touching only the folders the brief says you own. Report the repo state and your plan in one message, then proceed. Small commits; push the branch; open the PR with the completion report; stop when CI has finished. Do not merge.
```
Send every PR link to the planning session; merge only after its review
(`gh pr merge <n> --merge --delete-branch`, then `git pull` in the main folder before the next
worktree).

## Last session handover

- 4 Nov, ~02:30: **B02–B08 all merged** (PRs #2–#8). Next: the phone run
  (`docs/runbooks/phone-run.md`), then B09 polish and B10 hardening on the Claude subscription,
  the video and the submission by 20:00. The Help Plan agent has not yet run against the live
  model; the phone run is its first live test.
- 3 Nov: D36 (domains): `guardianbook.app` is the front door; `.co.za` and `www` redirect
  to it; DNS on Cloudflare. Steps in `docs/runbooks/deploy.md` § Domains. First Railway
  deploy failed on a leftover `pnpm` start command: clear Settings → Deploy → Custom Start
  Command.
- 2 Nov: D35 (the student success direction; the learner support loop; six mechanics).
  Spec 02 v2.1, spec 03 §9, spec 05 §9, B02 updated (schools, provenance, new tables; cap
  $30), B03 boundary note. Gate moved to 3 Nov 20:00. (31 Oct)

- 1 Nov: specs 05–06, BUILD-PLAN, the ruleset command, the Claude Code prompts.
- D34 recorded (scope v2, the circle). D22 superseded; D10 amended for this build; D28
  deferred; the held-out freeze moved to 1 Nov 12:00; Open #10 and #12 closed.
- `docs/specs/02-product-p0.md` rewritten (v2); spec 03 §8 added (tables, permissions,
  API, the verifier); CLAUDE.md and TASKS.md updated; B01's headline fixed; B02 and B03
  written for parallel sessions.
- The private company master (v2.0) and plan 17 live in `~/Projects/guardian-book-private/`
  (`company/`, `phase0/`). Never read from a build session.
- The 27 Oct `.claude/settings.json` block, if still needed:
```json
{
  "attribution": false,
  "permissions": {
    "deny": [
      "Read(./.env)", "Read(./.env.*)", "Read(./**/.env)", "Read(./**/.env.*)",
      "Read(~/Projects/guardian-book-legacy/**)", "Read(~/GitHub/guardian-book-legacy/**)",
      "Read(~/Projects/guardian-book-private/**)",
      "Edit(~/Projects/guardian-book-legacy/**)", "Edit(~/GitHub/guardian-book-legacy/**)",
      "Edit(~/Projects/guardian-book-private/**)"
    ],
    "ask": ["Bash(git push *)", "Bash(gh pr merge *)", "Bash(railway *)"]
  }
}
```
