`# Status

Single source of truth for what is built. Update the boxes in the same commit as
the work — a status file that lags is worse than none.

Phases and their exit tests are in `BUILD-PLAN.md`. This file only tracks state.

## Phase 0 — Baseline

- [x] Vite 7 + React 19 + TypeScript
- [x] `WebGPURenderer` with automatic WebGL2 fallback
- [x] TSL node materials
- [x] Backend readout in the HUD
- [ ] `.gitignore` reviewed, repo initialised, first push

## Phase 1 — Gates (both block Phase 3)

### Track A — Writing  · Seb
- [x] PolarSense case study (EN)
- [x] Arts by Sandra case study (EN)
- [x] Scrubble case study (EN)
- [ ] One-line bio + footer links
- [ ] FR translations, reviewed *(after Phase 2)*
- [ ] NL translations, reviewed *(after Phase 2)*

### Track B — Blockout  · Seb
- [x] World layout as data — `src/world.ts`
- [x] Placeholder landmarks at true scale, in engine
- [x] Island geometry under each landmark — `src/Islands.tsx`, lathe + coastline wobble
- [ ] Layout judged by flying it: is traversal interesting or a chore?
- [ ] Blender blockout replacing the code placeholders
- [ ] Mine
- [ ] Easel and canvas
- [ ] Scrabble board

## Built ahead of schedule

Needed to run Track B's exit test, so built before Phase 2.

- [x] `useInput()` — invariant 8, keyboard
- [x] Flight controller: damped velocity, shortest-arc yaw, bank on turn
- [x] Held-Space climb to a ceiling and sink back; held-Shift speed boost
- [x] Acceleration-driven spring: lean, pitch and suspension bounce on any change
- [x] Fixed-offset follow camera
- [x] Proximity detection, landmark in range surfaced in the HUD
- [x] `src/Scenery.tsx` — sky, sun, ocean and clouds in TSL, golden hour, zero assets

## Phase 2 — Flat site  *(blocked: needs Track A)*

- [ ] React Router 7, framework mode, prerender on
- [ ] MDX via `@mdx-js/rollup`
- [ ] Locale routing `/en /fr /nl` + `_redirects` + `hreflang`
- [ ] `src/i18n/` typed strings per locale
- [ ] Routes: `/{lang}`, `/{lang}/work`, `/{lang}/work/{slug}`, 404
- [ ] Typography and layout
- [ ] Footer
- [ ] Deploy to Cloudflare Pages on pinchs.be
- [ ] Exit: Lighthouse 100, usable with JS off, live in three languages

## Phase 3 — The world  *(blocked: needs both Phase 1 gates)*

- [ ] Canvas moved into the root layout, mounts once
- [ ] Landmarks mapped from content, not hardcoded
- [ ] Proximity opens a panel and pushes the URL without remounting
- [ ] Deep link spawns beside the landmark with its panel open
- [ ] Skip link, first in tab order
- [ ] Full keyboard path to every landmark
- [ ] No-WebGL path: canvas never mounts
- [ ] `prefers-reduced-motion` honoured
- [ ] Canvas and models behind a dynamic `import()`
- [ ] `?debug`: gizmos, collision radii, wireframes, frame stats

## Phase 4 — Craft

- [ ] Detailed models replacing blockout, one at a time
- [ ] TSL shaders derived from what each project does
- [ ] Post-processing
- [ ] GPU compute particles where WebGPU is available
- [ ] Ambient sound, off by default

## Phase 5 — Hardening

- [ ] Budgets in CI
- [ ] Lighthouse CI
- [ ] Keyboard audit in all three locales
- [ ] Browser matrix incl. WebGL disabled
- [ ] OG images per case study per locale

## Phase 6 — Mobile  *(deferred, decide after Phase 3)*

- [ ] Touch feeds `useInput()`
- [ ] Tap-to-move, or full touch controls
