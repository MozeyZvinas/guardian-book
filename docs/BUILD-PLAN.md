# Build plan (scope v2, D34): what we build now, in what order

**1 Nov 2026.** One page. Links point to the specs that carry the detail.

## What we are building

A **responsive, installable web app** (one codebase for phone, tablet and laptop; added to
the home screen from a link; a native app later from the same API) that serves **one
learner, their guardian and their teacher** around one piece of real work:

1. the learner brings anything (photo, text, question; voice next);
2. Muse Spark reads it against a human-approved marking guideline, or extracts a notice;
3. checks the model cannot skip gate every output;
4. the Brain (append-only evidence) updates;
5. one Help Plan renders three ways: tonight's step; one thing for the parent to do; who
   shares the gap for the teacher;
6. the teacher confirms what was uncertain and approves the note home;
7. a public proof page shows the numbers with their denominators.

Marking is one input. The circle is the product.

## The documents that define it

| Need | Read |
|---|---|
| What is in and out, acceptance tests, cut order, stop rules | `docs/specs/02-product-p0.md` (v2) |
| Stack and versions | `docs/specs/01-stack.md` |
| Data model, permissions, API, marking rules, the verifier | `docs/specs/03-architecture-data.md` (+ §8) |
| Tests, CI, security, evaluation, delivery | `docs/specs/04-quality-security-eval.md` |
| Every screen, the navigation map, the core flow | `docs/specs/05-screens-and-flows.md` |
| Frontend architecture, responsive rules, PWA, native path | `docs/specs/06-frontend-pwa-mobile.md` |
| Design tokens and the Sentinel identity | `docs/vision/DESIGN.md` |
| How to describe it | `docs/vision/DESCRIPTION.md` (the headline: *Every learner understood. Every next step clearer.*) |
| Decisions that outrank all of the above | `docs/decisions.md` |
| Live status | `docs/TASKS.md` · `START-HERE.md` |

## The order (two Claude Code sessions after B01; each brief in `prompts/`)

| Step | Brief | Builds | Screens (spec 05) |
|---|---|---|---|
| 1 | B01 | Workspace, API skeleton, config check, logging, CI, Docker, tokens, landing | P1 |
| 2 ∥ | B02 | Schema, migrations, append-only guard, Better Auth (18+), access module, circle (class code, guardian code), items + loader, seeds, permission harness | P2, P3, L8 (join/invite), G0, T1 |
| 2 ∥ | B03 | Gateway (Standard only), shared model contracts, verifier rules, retry runner, work-check prompt v1, eval runner, live smoke | (none; server) |
| 3 | B04 | Inputs (classify, store, route), work check → attempt → assessment, notice → calendar, `model_runs` | L2, L3, L7, T5 |
| 3 ∥ | B05 | Profile cards, Today, Brain page, timeline | L0, L1, L6, L8 |
| 4 | B06 | Fix it, follow-up, Help Plan agent, guardian space, "We did it" | L4, L5, G1–G4 |
| 4 ∥ | B07 | Teacher space: picture, queue, review, release, notes, notice, learner profile | T2–T6 |
| 5 | B08 | Eval results and the proof page | P4 |
| **Gate** | — | **Full run on the founder's phone, Mon 2 Nov 20:00 SAST** | all |
| 6 | B09 | PWA manifest and service worker, polish, E2E at four widths; then P1 in order (voice, see-it card, overlay, open-weight row, WhatsApp text) | — |
| 7 | B10 | Hardening, restore drill, history scan, README | — |
| 8 | — | Record the video and the X cut (3 Nov); submit by 20:00 SAST, 4 Nov | — |

## The founder's part

Push and go public (F2) · Meta key and spend cap (F3) · Railway (F4) · one maths teacher,
two or three parents, one or two learners aged 18+ with two consents each (F5) · run the
sessions as in `START-HERE.md` · the phone run on 2 Nov · the recording on 3 Nov.

## The planning session's part

Original items with marking guidelines (C1) · the vetted resource list and two fictional
notices (C4) · evaluation cases (C5) · briefs B04–B08 (C6) · reviews of every PR against its
brief · the script rewritten against the real build · the submission text.

## Rules that do not move

Adults only in this build (D19). Standard model tier only (D24). Original content only (D20).
New work only, in this repo (D27). The teacher is the marker of record. Fail closed. No
personal data in prompts. Guardians never see attempts, answers or images. Scope sheds before
dates. Done means it works on the founder's phone in a fresh tab.
