# docs/vision — the product vision (read-only reference)

Imported on 27 Oct 2026 from the retired `guardian-book-legacy` repo (commit `dc3d734`).
These documents are the product truth the build cites.

**Precedence:**
1. `docs/decisions.md` outranks everything here.
2. Then the build specs in `docs/specs/`, once they exist.
3. Then these documents.

Never edit these files to change a decision. Log the decision instead, and mark the
superseded passage STALE here.

All of these documents are safe to publish: the repo goes public at the Meta hackathon
submission. Company material (business plan, question bank, competition strategy, forms,
attorney correspondence) is deliberately NOT here and must never be committed to this repo.

## Index

| Document | What it is | Status |
|---|---|---|
| `DESCRIPTION.md` | Canonical description (v2.1): how we describe Guardian Book; the eight pillars | Current |
| `VALUE_BY_AUDIENCE.md` | Value and features per learner, guardian, teacher, school; who sees what; the scan → mark → confirm → release flow | Current. Release order changed (below) |
| `FEATURES.md` | Problems, promises, feature map, rulings 4.1–4.33 (incl. whole learner, living intelligence, evidence engine) | Current rulings. "LIVE/NEXT" status labels describe the retired build: treat all as not built |
| `WHOLE_LEARNER.md` | Support, people, dreams, opportunities; the Care Protocol (binding for any support feature) | Current |
| `SCREENS.md` | Screen-by-screen spec (S01–S24) | Product intent current; stack details STALE pending `docs/specs/01-stack.md` |
| `SITEMAP.md` | Every route across learner, guardian, school, admin | Intent current; route syntax STALE pending stack |
| `WIRE_DIAGRAMS.md` | How everything connects (Mermaid) | Intent current; Supabase/Next specifics STALE |
| `DESIGN.md` | Binding design rules; Sentinel identity §v2 + v3 addendum | **Current: this is the "latest Sentinel" (ruling 27 Oct)** |
| `DESIGN_BRIEF.md` | Design philosophy and feeling | Current |
| `design/sentinel/` | Sentinel brand sheet (PDF) and value-source mockup | Current |
| `RESEARCH_LEARNING_SCIENCE.md` | The evidence behind every learning mechanic | Current |
| `AI_PEDAGOGY.md` | Tutor move library, ladder, prompt architecture, goldens | Current |
| `DATA_AND_AI.md` | Content sourcing and the own-AI ladder | Current; tooling names STALE pending stack |
| `TECH.md` | Old v3 architecture (Next.js + Supabase + Railway) | **STALE as architecture.** §3a "evidence engine" stays binding until `docs/specs/03-architecture-data.md` replaces it |

## Rulings since these were written (27 Oct 2026)

- **Release order:** learners + teachers first; the guardian/parent plan comes after.
  Guardian features in these documents are "later".
- **Design:** Sentinel, latest version (DESIGN.md §v2 + v3 addendum). Any "v2 Sunrise"
  option is dropped.
- **Meta hackathon:** Guardian Book is the entry. Build to the judging rubric: Impact,
  Use of Meta tooling, Technical depth and Demo, equally weighted.
- **Hosting:** overseas hosting is acceptable for the hackathon because there is no real
  learner data. Revisit before the first real learner.
