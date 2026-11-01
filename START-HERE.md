# START HERE

Read this first, every session. Chats hold no state; this page does.
**Updated:** 1 Nov 2026, planning session.

## What we're doing right now

Building **Guardian Book** for the **Meta Global AI Developer Hackathon** (Indie, solo),
scope v2 (D34): **one learner, three people, one Brain.** A learner, their guardian and
their teacher, linked; the learner brings anything; Muse Spark reads it; checks the model
cannot skip; the Brain updates; one Help Plan rendered three ways; the teacher confirms
and approves the note home. The homework check is one input, never the headline.

**Deadlines:**
- Full phone run (Gate P0): **Mon 2 Nov, 20:00 SAST**.
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

**1. Push and go public** (paste in Terminal):
```bash
cd ~/Projects/guardian-book && git status -sb && git push -u origin main
gh repo edit MozeyZvinas/guardian-book --visibility public --accept-visibility-change-consequences
```
Then on GitHub: Settings → Rules → New ruleset on `main`: require a pull request, require
status checks, block force-pushes.

Check `.claude/settings.json` exists with the deny list for `../guardian-book-legacy`,
`../guardian-book-private` and `.env*` (the block is in the 27 Oct handover below). If it
is missing, create it before any session runs.

**2. Meta:** Billing → spend-limit email at $150. API keys → create `guardian-book-app`.
Put it only in `~/Projects/guardian-book/.env` as `META_API_KEY=...` (the file is
git-ignored). Never paste it into any chat. Note whether `muse-wonder-1.0` appears in the
model list.

**3. Railway:** new project (EU West) → service from the GitHub repo (Dockerfile) → add
Postgres 16 and a Bucket → variables from `docs/specs/03-architecture-data.md` §7 →
"wait for CI" on → daily backups on. The deploy will fail until B01 merges; that is fine.

**4. People:** message 1 maths teacher, 2–3 parents and 1–2 learners aged 18+ today.
Two consents each (data use; filming). Handwritten answers by Sat 1 Nov.

**5. Two Claude Code sessions, two credit sources.** Session A uses the Console
promotional credits (expire 14 Nov); session B uses the subscription. Billing is decided
per terminal by whether `ANTHROPIC_API_KEY` is set; there is no per-repo pin. First remove
any `export ANTHROPIC_API_KEY=...` line from `~/.zshrc` or `~/.zprofile`, then open two
terminals:

```bash
# Terminal A — promotional credits (Console key). The key never enters shell history.
cd ~/Projects/guardian-book
read -s "ANTHROPIC_API_KEY?Console API key: "; echo; export ANTHROPIC_API_KEY
fable --budget 15            # approve "use API key" when asked; /status must show API key
```
```bash
# Terminal B — subscription. Make sure the key is not set here.
cd ~/Projects/guardian-book
unset ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN
fable --budget 25            # /status must show the subscription
```
In each session, `/usage` shows the running cost. Promo balance: Console → Billing →
Promotional credits.

**6. Run the briefs:**
- Terminal A first: `/file prompts/B01-scaffold-ci-deploy.md`. When the PR is open and CI
  is green, send the link to the planning session for review; merge only after review.
- After B01 merges, both terminals, each in its own worktree:
  - Terminal A: `fable -w b02 --budget 25` then `/file prompts/B02-data-auth-circle.md`
  - Terminal B: `fable -w b03 --budget 25` then `/file prompts/B03-gateway-verifier.md`
  (`fable -w <name>` creates `.claude/worktrees/<name>` on its own branch; add
  `.claude/worktrees/` to `.gitignore` in B01.)

## Last session handover (31 Oct)

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
