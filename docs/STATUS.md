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
- [x] One-line bio + footer links — `src/i18n/index.ts`, three locales
- [x] FR translations, drafted — `*.fr.mdx`, machine-written, **not reviewed**
- [x] NL translations, drafted — `*.nl.mdx`, machine-written, **not reviewed**
- [ ] **FR and NL read by Seb.** The plan says translations are never published
      unreviewed, and this is the gate in front of the deploy below. Structural
      frontmatter stayed in the English files, so a fix here is prose only.

### Track B — Blockout  · Seb
- [x] World layout as data — `src/world.ts`
- [x] Placeholder landmarks at true scale, in engine
- [x] Island geometry under each landmark — `src/Islands.tsx`, lathe + coastline wobble
- [ ] Layout judged by flying it: is traversal interesting or a chore?
- [x] Landmark blockout, in code — `src/Landmarks.tsx`, primitives + TSL, no assets
  - [x] Mine — benches, adit, head-frame with sheave, spoil heap
  - [x] Easel and canvas — A-frame, ledge, blank canvas
  - [x] Scrabble board — slab, rim, 15×15 grid in the shader, played tiles, rack
- [ ] Blender models replacing the code blockout *(moved to Phase 4 — they drop
      in behind `<Landmarks />` without touching `App`)*

## Built ahead of schedule

Needed to run Track B's exit test, so built before Phase 2.

- [x] `useInput()` — invariant 8, keyboard
- [x] Flight controller: damped velocity, shortest-arc yaw, bank on turn
- [x] Held-Space climb to a ceiling and sink back; held-Shift speed boost
- [x] Acceleration-driven spring: lean, pitch and suspension bounce on any change
- [x] Fixed-offset follow camera
- [x] Proximity detection, landmark in range surfaced in the HUD
- [x] `src/Scenery.tsx` — sky, sun, ocean and clouds in TSL, golden hour, zero assets

## Phase 2 — Flat site

- [x] React Router **8**, framework mode, `ssr: false` + `prerender`
      *(v8, not the plan's v7 — see CLAUDE.md, Stack)*
- [x] MDX via `@mdx-js/rollup` + `remark-frontmatter` + `remark-mdx-frontmatter`
- [x] Locale routing `/en /fr /nl` + `_redirects` + `hreflang` + canonical
- [x] `src/i18n/` typed strings per locale — English defines the shape, so a
      missing key in `fr` or `nl` is a type error
- [x] Routes: `/{lang}`, `/{lang}/work`, `/{lang}/work/{slug}`, `/{lang}/404`
- [x] Typography and layout — system stack, one rhythm unit, dark
- [x] Footer — name, one line, email, GitHub
- [ ] Deploy to Cloudflare Pages on pinchs.be *(Seb — blocked on the translation
      review above)*
- [ ] Exit: Lighthouse 100, usable with JS off, live in three languages

### Verified, on a throwaway install in Claude's container

Not on Seb's machine — `npm install` there is forbidden. Re-run after installing.

- [x] `tsc -b` clean under `"strict": true`, which the config had never set
- [x] 19 routes prerendered: 3 locales × (home, work, 3 case studies, 404) + `/world`
- [x] Case studies render in full with JavaScript disabled, styled, no console errors
- [x] `<html lang>`, `hreflang`, `x-default` and canonical correct per locale,
      and canonicals carry no trailing slash
- [x] First-route JS **127 kB gz** (budget 200) · canvas chunk **427 kB gz**
      (budget 600) · CSS 1.6 kB gz
- [x] `three` is in no prerendered document and in no first-route chunk
- [ ] Lighthouse — needs the real deploy

### No webfont

Deliberate, against the plan's "one variable font, subset per locale": zero bytes,
zero requests, no swap, nothing to subset three ways. The craft here is measure,
rhythm and colour. A typeface can land in Phase 4 with the shaders if it earns it.

### Deviations to know about

- `/world` exists, prerendered but unlinked and `noindex`: the Phase 0/1 scene
  behind a dynamic `import()` and a mount gate, so Track B's exit test — *fly the
  layout and judge it* — is still runnable while the flat site ships.
- `src/Scenery.tsx` and `src/Landmarks.tsx` were type-broken against
  `@types/three` 0.185.4 (`Vec3` was aliased to what `vec3()` returns, which is
  narrower than what every operator returns). Fixed, because `npm run build` now
  type-checks first.
- `index.html`, `src/main.tsx` and `src/App.css` are gone — framework mode owns
  the document.
- `@vitejs/plugin-react` removed: React Router's Vite plugin does refresh itself.

### New dependencies

| Package | Why | Runtime cost |
|---|---|---|
| `react-router` | the router, and Phase 3's push-without-remount | in the 127 kB gz above |
| `@react-router/dev` | typegen, build, prerender | build only |
| `@mdx-js/rollup` | content is files | build only |
| `remark-frontmatter`, `remark-mdx-frontmatter` | frontmatter as an export | build only |
| `@types/mdx` | types for `*.mdx` | none |

## Phase 3 — The world  *(blocked: needs both Phase 1 gates)*

- [ ] Canvas moved into the root layout, mounts once *(it lives at `/world`
      today — `src/routes/world.tsx` is the seam)*
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
