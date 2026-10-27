# Sentinel — design reference (adopted 25 Sep 2026)

Founder's pick from the Design Directions canvas: mark 01 "Sentinel" + Direction K.
Binding spec: `docs/DESIGN.md` §v2 (tokens, type, mark rules, CTO amendments A1–A7, verify items V1–V4).

- `K-spec.dc.html` — the brand-sheet artboard exported from the design canvas. REFERENCE MOCKUP,
  not production code: replicate its values (colours, sizes, spacing, radii) in our own components.
  It renders only inside the canvas runtime (support.js + vendored React, not committed) — read the
  inline `style="…"` values directly.
- `K-Sentinel-brand-sheet.pdf` — the same sheet as a PDF for viewing.
- Where K-spec and DESIGN.md §v2 disagree (e.g. the button gradient, the #00A699 chip, the link
  blues, red-pen misses), DESIGN.md wins.
