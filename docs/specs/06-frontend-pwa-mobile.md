# 06 · Frontend architecture, responsive design, PWA and the path to a native app

**APPROVED 1 Nov 2026 (planning session).** Completes the tech spec with the client side.
Rests on `01-stack.md` (versions), `03-architecture-data.md` (API and data), `04` (quality)
and `05-screens-and-flows.md` (what to build). Where this file and `01` disagree, `01` wins
on versions.

## 1. What the client is

One **responsive web application**: a single React codebase that lays itself out for a
360px phone, a 768px tablet and a 1024px+ laptop. It is **installable as a progressive web
app** from a link (home-screen icon, full-screen, its own window; no app store). The same
API is designed to serve a **native mobile app later** without a second backend.

## 2. Structure (`apps/web`)

```
apps/web/src/
  app/            router, providers, error boundary, layout shells (phone tabs / sidebar)
  routes/         one folder per screen in spec 05 (today/, bring/, attempt/, brain/, me/,
                  guardian/, teacher/, public/)
  components/     shared components (StepMap, WorkViewer, PlanCard, ChecksList, ...)
  design/         tokens.css (Sentinel), typography, motion, the Sentinel crest SVGs
  api/            typed client: one function per API route, Zod-validated responses
                  (schemas imported from packages/shared)
  state/          server state via TanStack Query; local UI state via React state
  lib/            formatting, dates (Africa/Johannesburg), image prep, feature flags
  pwa/            manifest, service-worker registration, update prompt
```

- **Routing:** React Router (data routers), lazy-loaded route modules, one chunk per space
  (learner, guardian, teacher, public) so a phone never downloads the teacher console.
- **Data:** TanStack Query for everything from the API (cache, retries, optimistic updates
  for Confirm/Release and "We did it"); no global store. Every response is parsed with the
  shared Zod schema before it touches a component (a malformed response is a bug, not a
  blank screen).
- **Forms:** uncontrolled where possible; Zod on submit; errors inline, plain words.
- **Images:** the browser's `<input type="file" accept="image/*,application/pdf"
  capture="environment">`; client-side downscale to ≤2,000px on the long edge before upload
  to save data; EXIF stripped server-side regardless.
- **Maths:** KaTeX for item prompts; the learner's own work is shown as the image or text
  they submitted, never re-typeset.
- **Overlay (P1-c):** boxes come as 0–1000 grid coordinates; the WorkViewer scales them to
  the rendered image with CSS percentages (divide by 10) and clamps.
- **Errors:** a route-level error boundary with a retry and the request ID; the "not
  configured" banner reads `/healthz` once per session.

## 3. Design system in code

- `design/tokens.css` defines every Sentinel token as a CSS variable; Tailwind's theme maps
  to those variables and nothing else (no raw hex in components; a lint rule fails the build
  on `#` colours outside `tokens.css`).
- Dark mode: `prefers-color-scheme` plus a `data-theme` override; the marked page stays
  light and the surround dims.
- Type: Outfit (interface) and Source Serif 4 (question text), self-hosted and subset;
  tabular numerals on every mark and count.
- Motion: CSS transforms and opacity only; a spring for the crest; everything honours
  `prefers-reduced-motion`.
- Pink is for the one primary action and the crest; teal for marks found and progress;
  correctness is never carried by colour alone (a glyph and the text always say it too).

## 4. Responsive rules (how it adapts)

| Concern | Rule |
|---|---|
| Breakpoints | 360 (base), 600, 768, 1024, 1440. Mobile-first CSS; features are added as width grows, never removed. |
| Layout | Phone: one column, bottom TabBar (≤4 tabs), 16px gutters. Tablet: one column, wider gutters, paired cards side by side from 768px. Laptop: Sidebar replaces TabBar; content max-width 1200px centred; teacher review in two panes. |
| Type | A fluid scale with `clamp()`: body 16–18px; headings step up one size at 1024px. Never below 16px for body on any width. |
| Touch | Targets ≥44×44px; the primary action within thumb reach on a phone (bottom third). |
| Tables | Become stacked cards below 768px (teacher queue, evidence tables). |
| Images | `max-width: 100%`; the learner's work fills the width on a phone and shares a row with the step map from 768px. |
| Text length | Copy is written for the phone first; nothing relies on a wide line to make sense. |
| Testing | Playwright at 360×800, 390×844, 768×1024, 1440×900 for every screen in spec 05; a screenshot per width attached to the PR for new screens; "no horizontal scroll" asserted. |

## 5. Progressive web app

- **Manifest:** name, short name, icons (pink app icon from the Sentinel set, maskable),
  `display: standalone`, theme colour, start URL `/today`.
- **Service worker (vite-plugin-pwa):** `registerType: 'prompt'`. Precache the app shell
  (HTML, JS, CSS, fonts, icons) only. **No API responses are cached** in this build and we
  make **no offline claim**; the "offline" state is a clear message. (Offline practice packs
  and queued uploads are a later phase.)
- **Update prompt:** when a new build is available the app shows *A new version is ready.
  Update*; never a silent swap. Every deploy is checked in a fresh tab for the stale-bundle
  trap.
- **Install prompt:** an in-app *Add to home screen* hint on the second visit, dismissible,
  never a modal on first load.
- **Permissions:** camera via the file input only; no push notifications in this build
  (digests are a later phase; WhatsApp-ready text first).

## 6. Performance budget (a R1,500 Android on 3G)

| Measure | Budget |
|---|---|
| App shell JS (gzipped) | ≤150 KB; each space's route chunk ≤120 KB |
| Fonts | ≤120 KB total, subset, `font-display: swap` |
| Largest Contentful Paint on a 3G-class profile | <2.5 s on Today and Feedback |
| Image upload | downscaled client-side; ≤8 MB server limit |
| Skeleton | visible under 200 ms; nothing static on screen for >2 s during marking |

Lighthouse (mobile) runs on every release and the numbers are recorded, not claimed in
advance.

## 7. Accessibility (a hard gate)

WCAG 2.1 AA contrast; keyboard navigation and visible focus on every control; labels on
every input; `aria-live` for the marking stream and for status changes; text resizes to
200% without breaking; reduced motion honoured; no colour-only meaning. An inaccessible PR
fails review.

## 8. Security on the client

No secrets in the bundle (the build scans for `META_API_KEY`, `BETTER_AUTH_SECRET` and
`sk-` patterns). Cookies are set by the server (`HttpOnly; Secure; SameSite=Lax`); the client
never handles tokens. Images are fetched through short-lived presigned URLs. No third-party
scripts, no analytics SDKs in this build. CSP `default-src 'self'` with `data:` images.

## 9. The path to a native mobile app (later, without a second backend)

1. **Now:** the responsive PWA. Installable, full-screen, works on any phone from a link.
2. **Next (when the pilot asks for it):** wrap the same web app with **Capacitor** to ship
   to the Play Store and App Store with native camera, share-sheet and push notifications.
   One codebase, the same API, the same screens; native shell only.
3. **Later (if the product needs it):** a native client (React Native/Expo) as **a second
   client of the same API**. Never a second backend; every rule stays server-side, so a
   second client cannot bypass permissions, the verifier or the caps.

Decision rule: we move a step only when a measured need appears (store distribution demanded
by schools, native push, offline packs), never for its own sake.

## 10. Build order for the client (matches the briefs)

B01 shell, tokens, landing · B02 sign-up/in, join class, invite guardian, link, classes ·
B04 Bring, Feedback · B05 Setup, Today, Brain, Me · B06 Fix it, follow-up, Guardian space ·
B07 Teacher space · B08 Proof page · B09 PWA manifest and service worker, polish, E2E at
four widths · B10 hardening.
