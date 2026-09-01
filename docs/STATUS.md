`# Status

Single source of truth for what is built. Update the boxes in the same commit as
the work — a status file that lags is worse than none.

Phases and their exit tests are in `BUILD-PLAN.md`. This file only tracks state.

## Phase 0 — Baseline

- [x] Vite 7 + React 19 + TypeScript
- [x] `WebGPURenderer` with automatic WebGL2 fallback
- [x] TSL node materials
- [x] Backend readout in the HUD
- [x] `.gitignore` reviewed, repo initialised, first push

## Phase 1 — Gates (both block Phase 3)

### Track A — Writing  · Seb
- [x] PolarSense case study (EN)
- [x] Arts by Sandra case study (EN)
- [x] Scrubble case study (EN)
- [x] One-line bio + footer links — `src/i18n/index.ts`, three locales
- [x] FR translations — `*.fr.mdx`, reviewed and approved
- [x] NL translations — `*.nl.mdx`, reviewed and approved

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
- [x] Locale routing `/en /fr /nl` + `hreflang` + canonical (root redirect in nginx)
- [x] `src/i18n/` typed strings per locale — English defines the shape, so a
      missing key in `fr` or `nl` is a type error
- [x] Routes: `/{lang}`, `/{lang}/work`, `/{lang}/work/{slug}`, `/{lang}/404`
- [x] Typography and layout — system stack, one rhythm unit, dark
- [x] Footer — name, one line, email, GitHub
- [x] Deploy tooling — `deploy.sh` (build + rsync + smoke test) and
      `deploy/nginx.conf`, self-hosted instead of Cloudflare Pages
- [ ] First deploy run: `./deploy.sh` *(Seb — server setup steps in README)*
- [ ] DNS A records for `pinchs.be` and `www` → 167.233.245.42
- [ ] TLS via `certbot --nginx`
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

- `/world` existed, prerendered but unlinked and `noindex`, so Track B's exit
  test was runnable while the flat site shipped. **Retired in Phase 3** — the
  scene is behind `/{lang}` now and an unlinked route had nothing left to hold.
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

## Phase 3 — The world

- [x] Canvas moved into the root layout, mounts once — `src/WorldGate.tsx`,
      rendered by `root.tsx` above every route. `/world` is retired
- [x] Landmarks mapped from content, not hardcoded — `src/world.ts` reads
      `PROJECTS`, and the placement is English frontmatter
- [x] Proximity opens a panel and pushes the URL without remounting
- [x] Deep link spawns beside the landmark with its panel open
- [x] Skip link, first in tab order — and it goes to the flat index when the
      world is showing, because there is no "content" below the fold to skip to
- [x] Full keyboard path to every landmark — tab order on the world's home page
      is skip · wordmark · work · FR · NL · the three landmarks · contact
- [x] No-WebGL path: canvas never mounts
- [x] `prefers-reduced-motion` honoured
- [x] Canvas and models behind a dynamic `import()`
- [x] `?debug`: proximity radii, blockout wireframes, waypoints, backend, fps
- [ ] Exit: walk every route twice, canvas on and canvas forced off, on real
      hardware *(Seb — verified headless below, but 1fps under swiftshader is
      not a judgement of how it feels)*

### How it fits together

`WorldGate` is the whole seam, and it is a function of the URL:

- `isWorldPath()` (`src/i18n/locales.ts`) says the world shows behind `/{lang}`
  and `/{lang}/work/{slug}`, and behind nothing else. The flat index the skip
  link points at, and the 404, are reading surfaces with nothing moving.
- The canvas mounts the first time a route wants it and then never unmounts
  (invariant 3). Routes with no world set `frameloop="never"`, disable
  `useInput` and hide the layer — verified by tagging the `<canvas>` element and
  finding the same one after a round trip through `/en/work`.
- Proximity is an event, not state: `Ship` pushes `/{lang}/work/{slug}` and
  everything else — the panel, the landmark highlight, the ship's own spawn —
  reads the URL back. There is no second copy of "which panel is open".
- Flying out pops the pushed entry rather than adding one, so a lap of the world
  leaves history at two entries, not eight.

### Decisions taken in this phase

- **The panel is a card, not the case study.** Flying into a landmark opens
  title, year, stack, summary and a link out. Seb's call, over rendering the
  full prose in the panel.
- **`?read` is the way out**, and a query rather than client state so it
  survives a reload, a share and the back button. The flat index links carry it.
  A visitor who arrives from a search result on a machine that can run the world
  therefore gets the card first — that is the cost of the choice above, and the
  prerendered document is still the full article for everything without JS.
- **Touch gets no world.** `(pointer: fine)` is part of the mount test. Mobile
  is Phase 6, and a world you cannot steer is worse than no world.
- **The capability probe asks for WebGL2**, not `navigator.gpu`: the property
  existing is not the adapter working, and three's own fallback is WebGL2. An
  earlier version trusted `navigator.gpu` and mounted a canvas that then threw.
- **The HUD lost the landmark label** — the panel says which landmark this is,
  in the right language — and the renderer backend moved behind `?debug`.
- `src/App.tsx` is now `src/Scene.tsx`. `src/routes/world.tsx` is gone; 18
  routes prerender instead of 19.
- **`/` redirects in dev too**, via a four-line `apply: 'serve'` plugin in
  `vite.config.ts`. `/` matches the root route with no child and renders an
  empty document; nginx has always redirected it in production, so the dev
  server was the only place that showed a black screen. Pre-existing, and
  only noticed once `/world` stopped being the URL you type.

### Content gained the world's geometry

`{slug}.en.mdx` now carries `order`, `pos`, `size`, `radius` and `waypoint`
alongside `landmark`, and `src/world.ts` maps them. `pos` and `waypoint` are XZ
only — the plateau height is one constant and does not belong in three files.
PolarSense's waypoint moved from `[-10, 0, -4]` to `[-10.5, -6]`: the old one
was 5.66 out with a radius of 5, so a deep link would have spawned the ship just
outside the landmark it had just opened, and the panel would have closed itself
one frame later. `world.ts` now asserts that in dev, both for the waypoint and
for two islands overlapping.

`Landmarks.tsx` keys its shapes off `landmark`, not off the slug: a slug is a
URL, not a model name, and two projects may want the same shape.

### Needs Seb

- **`worldControls` in `fr` and `nl` is unreviewed** (`src/i18n/index.ts`) — the
  one new UI string this phase added, machine-drafted, and CLAUDE.md says those
  do not ship unreviewed. The French line says ZQSD on purpose: `useInput` reads
  physical key codes, so it is the same three keys under the same fingers.
- Track B's last gate, *is traversal interesting or a chore*, is still open.
  Phase 3 was built over it on Seb's go-ahead; landmark positions are data, so
  moving them touches none of the above.

### Verified, on a throwaway install in Claude's container

Not on Seb's machine — `npm install` there is forbidden. Note that
`react-router typegen` and `oxlint` cannot run from Claude's Linux VM at all:
both ship native bindings built for macOS arm64. `tsc -b` and the checks do run
there, against the types typegen last wrote.

- [x] `tsc -b` clean, `node src/i18n/locales.check.ts` green
- [x] 18 routes prerendered; production build walked at `/en /fr /nl`
- [x] First-route JS **126.8 kB gz** (budget 200) · canvas chunk **422 kB gz**
      (budget 600) · CSS 2.0 kB gz. No `WebGPURenderer` and no scene chunk in
      any prerendered document
- [x] Canvas element identity survives `/en` → `/en/work/polarsense` →
      `/en/work` → back
- [x] Flying into Scrubble pushed `/en/work/scrubble` and opened the card;
      flying out popped back to `/en` with history at the same depth
- [x] Deep link to `/en/work/scrubble` spawned the ship inside the radius with
      the card open, and did not close it
- [x] Card → *read the case study* → `?read`, 964 words of prose, canvas still
      mounted and switched off; back returns to the card
- [x] WebGL2 unavailable: canvas never mounts, the case study is the full
      article, console clean
- [x] Coarse pointer (Pixel 7 profile): no world, full article
- [x] `prefers-reduced-motion`: world mounts, nothing drifts
- [x] Tab order and Enter on a landmark link both correct; Space on a focused
      link does not fly the ship
- [ ] Lighthouse — still needs the real deploy

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
