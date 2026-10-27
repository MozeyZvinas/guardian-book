# START HERE

Read this first, every session. Chats hold no state; this page does.
**Updated:** 27 Oct 2026 (night), planning session.

## What we're doing right now

Building **Guardian Book** for the **Meta Global AI Developer Hackathon** (Indie, solo).

**Deadlines:**
- Submit by **20:00 SAST, Wed 4 Nov** (official close 04:00 SAST, 5 Nov).
- Claude credit expires **14 Nov**.

**Judging** (D17, Participant Guide §8):
- **Impact 30% · Use of Meta tooling 25% · Technical depth 20% · Demo 25%.**
- The top 5 per track have their 3-minute videos watched live.

**Rules that shape everything:**
- Public repo.
- **New work only**, built during the event, and the demo must show clearly what was
  built (or face disqualification).
- No platform-policy violations.
- No assets we don't have rights to.

**Phase 0 is approved (D17–D27):**
- **Adults only** (teachers + learners 18+; Meta's terms).
- **Original questions**; the DBE papers are a private benchmark only.
- **Legacy is mined, never built on.**
- **iGezi stack** on Railway.
- **Locked P0 scope**, with handwriting gated on 29 Oct.
- **Repo public now.**

## Current reality (verified 27 Oct, night)

**Repo:**
- Docs only.
- No code, no CI, no deploy.
- Local commits not yet pushed.

**Meta account:**
- $150 credits applied; card on file.
- Spend limit **not** set.
- Only a "Playground" API key exists.

**Content:**
- Legacy DBE papers: 10 papers, 513 questions (private benchmark).
- Golden cases: 4 (too few to show accuracy).

## Specs (approved)

| File | What it settles |
|---|---|
| `docs/specs/01-stack.md` | Stack, versions, security plan, costs |
| `docs/specs/02-product-p0.md` | Scope, acceptance tests, cut list, stop rules |
| `docs/specs/03-architecture-data.md` | Data model, permissions, API, marking rules |
| `docs/specs/04-quality-security-eval.md` | Tests, CI, security tests, evaluation, delivery, release checklist |

## Tracker

`docs/TASKS.md` holds the board. **Next brief: `prompts/B01-scaffold-ci-deploy.md`.**

## Next actions (founder)

**1. Paste this in Terminal** (pushes both repos and updates the agent's guardrails):
```bash
cd ~/GitHub/guardian-book-legacy && git remote set-url origin https://github.com/MozeyZvinas/guardian-book-legacy.git && git fetch origin && git status -sb && git push origin main
cd ~/Projects/guardian-book && cat > .claude/settings.json <<'EOF'
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
EOF
git add .claude/settings.json && git commit -m "Deny agent access to legacy and private folders" && git push
gh repo edit MozeyZvinas/guardian-book --visibility public --accept-visibility-change-consequences
```
If the legacy status line says "behind", stop and send the output.

**2. GitHub:** add a ruleset on `main` (Settings → Rules): require a pull request, require
status checks, block force-pushes.

**3. Meta:** set the spend-limit email at $150. Create the key `guardian-book-app`. Keep it
for Railway; never paste it into any chat.

**4. Railway:** create the project (EU West) with an app service from GitHub (Dockerfile),
Postgres 16 and a Bucket. Turn on "wait for CI" and daily backups. Set the variables (list
in `docs/specs/03-architecture-data.md` §7).

**5. People:** ask 3–5 adults for handwritten answers and 1 maths teacher (about 2 hours,
29–31 Oct).

**6. Run B01:** `cd ~/Projects/guardian-book && fable --budget 15`, then
`/file prompts/B01-scaffold-ci-deploy.md`.

## Last session handover (27 Oct, night)

- The founder approved Phase 0 (mine legacy, private benchmark + original questions, all
  defaults).
- Logged D17–D27.
- Wrote specs 01–04, the brief template and B01.
- Rewrote CLAUDE.md, TASKS.md and this page.
- The private pack lives in `~/Projects/guardian-book-private/phase0/`.
- No code; nothing touched production.
