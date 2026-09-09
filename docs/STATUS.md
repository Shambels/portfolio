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
- [x] Follow camera *(fixed-offset then; it swings round to stay astern of the
      heading now — see "The camera turns" at the end of this file)*
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
      *(`/{lang}/world` joined them with the landing page — last section)*
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
  *(Un-retired with the landing page — it is `/{lang}/world`, and linked.)*
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
  and `/{lang}/work/{slug}`, and behind nothing else. *(`/{lang}` became the
  landing page — it is `/{lang}/world` now; see the last section.)* The flat index the skip
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
  *(Superseded in Phase 6 — touch can steer now, and the pointer test is gone.)*
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

- [x] Detailed models replacing blockout, one at a time
  - [x] Mine — PolarSense. `tools/mine.py`, `src/models/mine.glb`
  - [x] Easel — Arts by Sandra. `tools/easel.py`, `src/models/easel.glb`
  - [x] Board — Scrubble. `tools/board.py`, `src/models/board.glb`
- [x] TSL shaders derived from what each project does
  - [x] The mine's veins are PolarSense's columns — `src/Landmarks.tsx`
  - [x] The easel's canvas resolves on approach
  - [x] The Scrabble tiles settle into the move that was there
- [x] The sun swung round, so the visitor sees lit faces — `src/Scenery.tsx`
      *(the finding below, and Seb's call between the two honest fixes)*
- [x] Post-processing — FXAA and an emissive-only bloom — `src/Post.tsx`
- [x] GPU compute particles where WebGPU is available — the spray under the
      ship, `src/Particles.tsx`. Nothing at all on WebGL2, on purpose
- [x] Ambient sound, off by default — synthesised, `src/Sound.tsx`

### Post-processing

Two effects, in `src/Post.tsx`, and the argument for each is why there are only
two. Seb's call between three chains; this was the middle one.

**FXAA**, because rendering through a target is exactly what costs the
anti-aliasing the plain canvas got for free — so a chain with no AA in it is a
net loss before its first effect. And this world is the worst case for it: the
mine's head-frame is a lattice of thin diagonals against a smooth gradient sky,
which is the shape that aliases worst. Side by side at 1000 × 640, the staircase
on those diagonals is gone.

**Bloom off the emissive buffer, at threshold zero.** BUILD-PLAN says "bloom is
not a personality", and the way it becomes one is a luminance threshold:
everything the sun hits hard enough starts to glow and the frame turns to soup.
Instead the pass renders `emissive` to its own MRT target and blooms only that,
so nothing can glow unless a material declares it emits. Here that is exactly two
things — the ship's pulsing lamp, and the ore in the mine's veins, which is the
whole claim that you can read PolarSense's schema without going into the adit.
The sky, the sun's glow, the glitter on the water and every lit surface go to
`output` and cannot reach the bloom however bright they get. There is no
threshold to tune and no way for a new bright material to start blooming by
accident; `strength` and `radius` are the only two numbers, and how bright a
thing glows stays the emissive value its material already chose.

Order is not free: bloom belongs in linear HDR before tone mapping, FXAA wants
sRGB after it. Hence `outputColorTransform = false` on the pipeline and an
explicit `renderOutput` between the two. A sky patch measured across both builds
came back within noise, so the committed golden hour is unchanged — this pass
adds a halo and takes away jaggies, and does nothing else.

**On both backends.** TSL compiles the one graph to WGSL and to GLSL and MRT is
native to WebGL2, so supporting the fallback costs a line of nothing; one look
was worth more than the frames a branch might have saved. If it turns out to cost
too much on WebGL2 that becomes a measured decision, not a guess made here.

`Post` renders at `useFrame` priority 1, which is what takes the frame away from
r3f. `frameloop` still decides whether it runs at all, so a route with no world
costs nothing, and `PassNode` and `BloomNode` both resize themselves off the
renderer — there is no resize handler.

#### Verified, on a throwaway install in Claude's container

- [x] `tsc -b` clean, `node src/i18n/locales.check.ts` green, 18 routes
      prerendered. `oxlint` and `typegen` still cannot run from the Linux VM
- [x] Canvas chunk **447 kB gz**, up 25 from 422 (budget 600). First-route JS
      **127 kB gz**, unchanged (budget 200). No `WebGPURenderer` and no scene
      chunk in any prerendered document
- [x] Walked headless under swiftshader at `/en` and at
      `/en/work/polarsense`, WebGL2 backend: no page errors, no shader
      compilation failures, console clean
- [x] Screenshotted with and against a build with `<Post />` removed. The
      head-frame's diagonals are anti-aliased; the ship's lamps have a halo and
      bleed onto the hull; the veins pick up a wash. Nothing else glows
- [x] A sky patch measured on both builds came back within cloud-drift noise —
      no double colour transform, no shift in the committed look
- [ ] 60fps with the chain on, and whether the halo is the strength Seb wants —
      real hardware only. Swiftshader renders this at about 1fps and has no
      opinion about either

### The pipeline

Seb's call, over detailing in code: the models are **Blender, scripted**.
One script per landmark — `tools/mine.py`, `tools/easel.py`, `tools/board.py` — running Blender
headless as a Python module (`pip install "bpy==4.5.13"`, which wants Python
3.11). Each writes both a `.blend` to open and sculpt and the `.glb` the site
loads. Re-running rebuilds both, so the script stays the source and the .blend
stays an output rather than a second thing to keep in sync.

`tools/landmark.py` holds what all of them need: the three-space-to-Blender
conversion, a box or cylinder between two points, a slab with three rotations, a
stone, the box-and-triangle gate, and the export and preview steps. Not an
abstraction over landmarks — no base class, no `Landmark` type — just the
fifteen functions each script would otherwise carry a copy of. Extracting it
left `mine.glb` byte-identical.

Nothing about the pipeline in BUILD-PLAN survived contact except its shape:

- **No Draco, no KTX2, no gltf-transform, no gltfjsx.** The raw export is 381 kB
  and **163 kB gzipped**, against a 300 kB budget — so the whole compression
  stage would buy nothing and cost a decoder fetched at runtime. `deploy/nginx.conf`
  gained `model/gltf-binary` in `gzip_types`; that is the entire asset pipeline.
- **The glTF carries geometry and nothing else** — `export_materials='NONE'`, no
  UVs, no tangents. Every surface is still shaded by the TSL in `Landmarks.tsx`.
  The strata are PolarSense's schema and they read world Y, which a baked texture
  cannot; and it keeps the proximity highlight working on a model exactly as it
  works on a blockout, because both ask the same two material sets for their
  colours.
- **Mesh names are the material keys.** `rock_cut`, `frame_easel`,
  `panel_canvases` → the `rock`, `frame` and `panel` materials. Checked twice: an
  unknown prefix is an assertion at build time in `landmark.py` and a
  `console.assert` in dev in the browser, rather than a black mesh found later.
- The adit is a real hole, cut with a boolean, because the saucer hovers at 0.45
  and the portal is 0.92 high: a visitor will fly at it, and a painted-on mouth
  is a promise the world breaks on the first try. The tunnel walls belong to the
  rock mesh, so the strata run from the hillside into the hole.

`tools/mine.py --render out.png` writes three views. Its light is deliberately
**not** the scene's — see the finding below.

### The mine — PolarSense

A terraced cut with a bored adit, a head-frame over the shaft, and the spoil.
The adit is a real hole, cut with a boolean, because the saucer hovers at 0.45
and the portal is 0.92 high: a visitor will fly at it, and a painted-on mouth is
a promise the world breaks on the first try. The tunnel walls belong to the rock
mesh, so the strata run from the hillside into the hole.

### The easel — Arts by Sandra

**Not one easel.** Sandra teaches, sells her own work and rents the studio, and
the case study's own line is "three different conversations, funnelled into one
form she can actually answer". So the landmark is a working corner: a canvas on
the easel, a stretched one waiting on the table, a small finished one leaning on
its end, and the brushes and palette where they were put down. Three canvases,
one place.

**The frontmatter box grew, 2 × 3 × 2 → 3 × 2.7 × 1.6.** A single easel at two
metres, alone on an island of nearly eight, reads as an ornament dropped on a
lawn — the mine fills its box and this filled a fifth of its island. `radius` is
deliberately untouched: it sets both the proximity trigger and the island, and
`waypoint` is 3.6 out, so shrinking it would have moved two more numbers and
changed how the landmark feels to fly into. Undoing all of it is deleting the
`build_table` and `build_props` calls in `main` and putting `size` back.

The canvas on the easel is **blank on purpose**. What resolves on it as the
visitor approaches is the next Phase 4 item — a TSL shader — and anything
legible painted into the model runs straight into invariant 2.

### The board — Scrubble

A board is flat, and that was the problem: the frontmatter box was 6 × 0.4 × 6
and the saucer hovers at 0.45, so the visitor flew over a rug. The mine is three
and a half metres of silhouette, the easel two and a half; this was four hundred
millimetres of nothing.

**The box grew, 6 × 0.4 × 6 → 6 × 1 × 6**, and what fills it is the case study's
own first line — *"the move you played is not the move that was there."* Seven
tiles hang above the empty squares they would have gone in: the bingo nobody at
the table saw, hooked under the played column and running out to the edge. It is
what Scrubble does, it is the only thing that gives this landmark a shape against
the sky, and it is the geometry the *tiles settle into a real word* item
animates. They are stepped and tipped rather than level, because with no shadow
maps height alone does not say "in the air" — a rank of tiles at one height reads
as a plank.

Kept from the blockout, deliberately: the grid and the premium squares stay in
the shader rather than becoming geometry, so the plate is one slab and has to
stay centred on the group origin — the shader reads `positionLocal.xz`. Tiles
are blank; letters are text and text belongs in the DOM (invariant 2), and the
crossword reads from the shape of the cluster. The found tiles are their own
mesh, `panel_found`, so a shader can single them out later without a second
model.

### Measured

| | mine | easel | board |
|---|---|---|---|
| built | 4.90 × 3.29 × 4.78 | 2.94 × 2.61 × 1.25 | 5.96 × 0.98 × 5.96 |
| frontmatter box | 5 × 3.5 × 5 | 3 × 2.7 × 1.6 | 6 × 1 × 6 |
| triangles (budget 25k) | 15,412 | 2,012 | 1,464 |
| gzipped (budget 300 kB) | 163 kB | 24 kB | 11 kB |

All three sit at y −0.06 or above, inside the −0.08 `Landmarks.tsx` allows.
**198 kB gz for the whole world's models**, against a 3 MB budget — the mine is
five sixths of it, and it is a heightfield.
- Canvas chunk **449 kB gz** (budget 600, was 422 — `useGLTF` and `GLTFLoader`
  are the +27; the second and third models added nothing to it). First-route JS
  **unchanged at ~130 kB gz**; no `.glb` is referenced by any prerendered
  document
- `npx tsc -b` clean, `locales.check.ts` green; 18 routes still prerender
- Walked headless under swiftshader at all three case-study URLs: every model
  loads (200) and renders with the TSL materials — including the board's grid
  and premium squares, which are still shader and still line up with the tiles.
  No page errors, console clean but for three's own WebGPU-unavailable notice.
  In dev the box-fit and material-key assertions are silent

### Two frontmatter boxes grew

`size` is a contract, not a description — the island, the proximity radius and
the ship's clearance are sized from it — so both changes are here rather than
quiet: the easel 2 × 3 × 2 → 3 × 2.7 × 1.6, the board 6 × 0.4 × 6 → 6 × 1 × 6.
Neither touches `radius`, so no waypoint moved and nothing about how a landmark
feels to fly into changed. The mine's box is untouched.

### New dependency: none, but drei is now actually used

`@react-three/drei` has been in `package.json` since Phase 0 and imported
nowhere. `useGLTF` is the first thing to use it — caching, Suspense and the
loader for 27 kB gz inside the canvas chunk, against hand-rolling a loader for
one file.

### The three shaders

Each one is the project, not a texture. All three live in `makeMats` in
`src/Landmarks.tsx`, which is now the only file Phase 4's craft touches besides
the sun.

**The mine — veins as columns.** The strata were already the file's rows. The
veins are its columns: dead straight, vertical, cut through every bench and on
into the adit, where a faint emissive keeps them readable in a hole the sun
cannot reach — the claim PolarSense makes is that you can see the schema without
running the file. Rows bend and columns do not, which is why the strata carry the
lateral wobble and the veins carry none. Their axis is set across the mine's cut
face, because rock is the mine's material and nothing else uses it; vein planes
parallel to that face would have washed it instead of striping it.

*Also changed here:* the strata wobble came down from 0.14 to 0.06. At 0.14 the
lateral bend was most of a band's own period, so the layers read as camouflage
rather than as strata — and a vein crossing camouflage reads as nothing at all.

**The easel — the canvas resolves.** Three colour fields: scattered, soft and
pale from across the island, drawn together and saturated by the time the ship is
parked. Sandra teaches, sells her own work and rents the studio, and the case
study's line is "three different conversations, funnelled into one form she can
actually answer" — so what resolves is three things becoming one composition.
Nothing legible is painted (invariant 2). The field is measured in the landmark's
own space, `x` across and `y + z` up, so one expression serves a canvas standing
on the easel and one lying flat on a table; it is anchored on the easel's canvas
and reaches the finished one leaning on the table, while the stretched one
waiting on the table falls outside it and stays primed, which is what
`tools/easel.py` says that canvas is.

The painting is the one thing in the world that does **not** take the proximity
tint. The highlight washes a landmark 72% toward cyan exactly when the visitor is
close enough for the painting to have resolved, and a painting the colour of the
highlight is not a painting. It reads as paint on a tinted ground instead.

**The board — the tiles settle.** The seven that hang over the squares they
belong in come down as the visitor arrives, the tile nearest the played word
first, so the hook lands before what hangs off it. The tip goes as each one
falls: a tile is tipped to say it is in the air, and a tipped tile lying on a
board buries a corner in it. Each tile is identified in the shader by its own x,
which is what keeps this one material over one mesh instead of seven of anything;
the constants it lands them on mirror `tools/board.py` and are commented as such
in both files.

Under `prefers-reduced-motion` the tiles stay up. Settling is the only thing in
Phase 4 that moves geometry, and hanging is the pose the model was built for —
collapsing them flat would take the landmark's silhouette with it (invariant 6).

**How "approach" is measured.** From the ship, not from the camera — `CAM_OFFSET`
is now exported from `src/Ship.tsx` for exactly this. The camera sits 7.2 behind
the ship in *world* Z and never turns, so the board (at +Z) is always nearer the
camera than the ship is, and the easel (at -Z) always further: a camera-distance
shader resolves the board from the middle of the world and the easel only when
you are sitting on it. From the ship, approach means the same thing at all three
— about 13 units out at the world's centre, about 4 parked at a waypoint.

### Two things the screenshots turned up

- **Mesh names now pick a material by their whole name first, prefix second.**
  `panel_canvases` and `panel_found` needed their own shaders and would otherwise
  have dragged the Scrabble tiles and the easel's canvases along with them. No
  model changed and no mesh was renamed; `landmark.py`'s prefix assertion still
  holds.
- **`board_palette` was drawing Scrabble grid lines across a paint palette.**
  `tools/easel.py` gives the palette the board material on purpose — it wants a
  different colour — but the board material has carried the 15x15 grid since
  Phase 4's models. It has its own flat material now.

### The finding is fixed, and it cost the golden hour in frame

Phase 4 recorded this and left it for Seb: the camera never turns, so it only
ever sees surfaces facing +Z, and the sun was at -Z. Every landmark showed its
shadow side, lit by fill alone, and a benched rock face and a smooth one were
the same flat grey.

**Seb chose the swing** over a second light. `SUN` is now `(-0.66, 0.27, 0.70)`
— the same 16 degrees up, round to port and behind, so it rakes the faces the
visitor is actually looking at and the shadow sides fall to the right of frame
where they model the shape instead of hiding it. Fill came down 2.8 to 2.1 to buy
the contrast back; at 1.7 the mine's shadow side crushed to navy.

The cost, paid knowingly: the sun disc, its glow and the glitter path on the
water are all behind the camera now, so none of them is in frame. The sky in view
is the anti-solar half. The haze warmth was wrapped right round the horizon
rather than clamped to the sun's side, which keeps a warm band low and to the
left, but the frame is a cool blue afternoon where it used to be a hazy gold.
Side by side, the old frame is flatter and hazier and the mine is a silhouette in
it; the new one has form. **If the trade reads wrong on real hardware, the whole
of it is three numbers in `Scenery.tsx`.**

### Verified for the shaders, on a throwaway install in Claude's container

Not on Seb's machine. Same caveats as before: `npm install` is forbidden in the
project folder, and `react-router typegen` and `oxlint` cannot run from Claude's
Linux VM at all.

- [x] `npx tsc -b` clean, `node src/i18n/locales.check.ts` green; 18 routes still
      prerender; `oxlint` clean on the three files touched
- [x] Canvas chunk **444 kB gz** (budget 600), everything else **131 kB gz**
      (budget 200). No `.glb` and no `WebGPURenderer` in any prerendered document
- [x] Walked headless under swiftshader at `/en` and all three case studies, with
      the world on: no page errors, console clean
- [x] The tiles settle. Screenshotted with the drop forced to 0 and to 1: they
      come down from the stepped cascade and land flat, in their squares, on the
      grid, hooked under the played column
- [x] The veins read as gold seams down the benches, not as a wash
- [x] The painting resolves on the easel's canvas and keeps its own colours
      inside the proximity highlight; the canvas on the table stays primed
- [x] The sun swing screenshotted before and after at `/en` and at the mine
- [ ] 60fps, and whether the new frame is the one Seb wants — real hardware only.
      Swiftshader renders it at about 1fps and has no opinion about either

### Two things worth Seb's eye while he is in there

- **The easel is behind the panel when you arrive.** Its waypoint sits to the
  landmark's left, the card is on the right of the screen, and the camera does
  not turn — so flying to Arts by Sandra parks the visitor looking at open water
  with the easel hidden under the card. The mine and the board are both clear of
  it. It is one number in `arts-by-sandra.en.mdx` (`waypoint`), and it is a
  layout judgement, so it is here rather than changed.
- **The board is only visible from close.** It sits at +Z and the camera is 7.2
  behind the ship in world Z, so the board only crosses into frame at about 7
  units out. The settle window was pulled in to 8.5 to 4.2 to fit inside that,
  but it does mean the tiles are already coming down when the board appears.

## The spray — Phase 4's compute particles

The saucer hovers, it points a beam at the water, and until now the water did
not notice. `src/Particles.tsx` is 2048 droplets of sea spray thrown off the
downwash: one compute dispatch, one draw call, no assets, and the CPU sends five
uniforms a frame whatever the count is.

It also does a job nothing else in the world does. The open sea has no landmarks
in it, so at 7.5 units per second over water nothing moves but the horizon and
the ship reads as parked. The plume is the speedometer.

**Density follows the ship, and that is a choice, not physics.** A hover's worth
of downwash is constant, but 2048 droplets piled into one ring 0.95 across read
as cotton wool — screenshotted, and it was worse than nothing. So `emit` runs
from 0.22 of full density at a stop to all of it at cruise, where the plume
smears over eight units and reads as a wake. `emit` is a *density* rather than a
switch: each droplet draws against it at respawn and sits the lifetime out under
the sea if it loses, so the spray thins instead of cutting. That is also what
stops it at a shoreline and what dries it up as the ship climbs — Space lifts
past the top of the fade, so rising takes the spray with it.

**Where the sea is now lives in `world.ts`.** `overWater()` and `ISLAND_SPREAD`
moved there out of `Islands.tsx`: two files guessing separately at one coastline
is one file too many, and spray over a beach is the failure that would have
looked like a shader bug.

**`Ship` publishes its hull position and velocity** as a module-level `SHIP`,
next to the `CAM_OFFSET` that `Landmarks` already reads. The alternative is
lifting the ship's state into `Scene` and threading it through a component that
has no other interest in it.

### WebGL2 gets nothing, and that is the decision

BUILD-PLAN allows "a cheaper path or nothing where it is not", and this is the
nothing. What makes these particles worth having is that their state never
leaves the GPU. WebGL2 has no compute stage, so the cheaper path is not a
cheaper version of this effect — it is a *second* effect, with the state in a
texture or on the CPU, written and tuned and debugged separately, to put foam
under a saucer. The world without it is the world as it shipped in Phase 4, and
`?debug` names the backend, so which one you are on is never a guess.

Not mounted at all under `prefers-reduced-motion` either (invariant 6): spray is
idle motion by definition and there is no still version of it.

### Verified, on a throwaway install in Claude's container

Same caveats as the last pass, and one new one — see below.

- [x] `npx tsc -b` clean, `node src/i18n/locales.check.ts` green; 18 routes still
      prerender; `oxlint` adds no new warning (`Ship.tsx`'s
      `only-export-components` predates this — `CAM_OFFSET` was already there)
- [x] Canvas chunk **437.7 kB gz** against 436.8 without the file — **+0.9 kB**,
      budget 600. First-route JS **128.2 kB gz** (budget 200), unchanged. No
      `Scene` chunk and no `WebGPURenderer` in any of the 20 prerendered
      documents
- [x] **Ran on the WebGPU backend**, not only the fallback: headless Chromium
      with SwiftShader's Vulkan adapter, HUD reading `WebGPU`. The compute pass
      compiles to WGSL and dispatches, the sprites draw from the storage buffer,
      console clean and no page errors
- [x] Screenshotted hovering (a light disturbance under the hull), at cruise (a
      trailing wake), climbing on Space (gone), and parked at the mine's
      waypoint (gone — the ship is over an island)
- [x] WebGL2 backend, same walk: the world stands, no spray, and the only
      console output is three's own WebGPU-unavailable notice
- [x] `prefers-reduced-motion` on both backends: no particles, no errors
- [ ] 60fps with the plume up, and whether the density and droplet size read
      right — real hardware only. Swiftshader draws this at 1fps and has no
      opinion about either. The knobs are the constants at the top of
      `Particles.tsx`, and `COUNT`, `OPACITY` and `SIZE` are the three that
      matter

**One caveat that is new.** To get a WebGPU run at all, three 0.185's
`GPUTextureViewDescriptor` had to be patched *in the container's own
`node_modules`* — it sends `swizzle: 'rgba'`, which the container's Chromium 141
rejects because the spec changed shape after it shipped. Nothing in this repo
was touched for it, and the same code runs unpatched on a current browser. It
does mean the WebGPU walk above proves the shaders and the plumbing, not that
this exact three-plus-Chromium pair is happy everywhere.

## The sound — Phase 4's last item

BUILD-PLAN gated this one on *only if it earns its place*. `src/Sound.tsx` is
the argument: every layer is a function of something the world already knows,
and one of them does a job nothing else in the world does.

**Synthesised, not sampled.** Web Audio and nothing else — no dependency, no
files, **+1.4 kB gz** in the canvas chunk. Two ambience loops would have been
the first bytes in this world that are not geometry, plus a licence to keep
track of, against a sky, an ocean and a set of clouds that are all TSL and cost
nothing. There was no case for sound being the exception.

**Off by default, and the toggle is the gesture.** No browser starts audio
without one, so the constraint and the courtesy want the same thing. Nothing is
constructed until the visitor clicks: no `AudioContext`, no noise buffer, no tab
marked as playing, no cost at all to a visitor who never asks. It is also
deliberately **not remembered** between visits — a returning visitor cannot be
given sound before they have clicked anything, so a stored *on* would only ever
be a toggle that lies about its own state.

### Four layers, and each one is already in the world

| | what it is | driven by |
|---|---|---|
| sea | pink noise, lowpass 420 Hz, two swells that never line up | `overWater()` — half level parked on an island |
| wind | the same noise, bandpass 1150 Hz | altitude, opening as Space lifts the ship |
| hum | two triangles 7 cents apart, beating at about 0.2 Hz | speed: 52 Hz idle → 74 Hz at full boost |
| voice | one per landmark | proximity, full inside `radius`, gone at 3 × it |

**The hum is what earns the feature.** The spray is WebGPU-only, on purpose, so
on the WebGL2 fallback nothing in the frame says how fast you are crossing
featureless water. The hum says it on both backends — the only part of Phase 4's
craft that reaches the fallback at all. The wind opens exactly where the spray
dries up, so one hands over to the other.

**The voices are the projects, the way the shaders are.** Keyed off `landmark`
and not off the slug, the same convention `Landmarks.tsx` keys its meshes on.
The mine is the head-frame's sheave turning — two sines a fifth apart through a
lowpass, a knock with a body, and a winch is what a shaft sounds like when
something is being brought up out of it. The easel is one stroke and then the
pause where she stands back and looks at it — noise through a bandpass swept
650 → 2300 Hz, slow enough never to settle into a hiss. The board is tiles going
down, two quick and one after a thought: the shader's seven settling, heard from
the other side of the table. An ambient pad under all three would have said
nothing about any of them.

Envelopes are **scheduled** in the audio thread rather than driven frame by
frame — a five-millisecond attack is a third of a frame at 60fps, and a knock
without its attack is a thud. Nothing is scheduled while it is inaudible, so
arriving at a landmark never fires everything it missed at once.

### The control

One button, in the HUD, last in the tab order — behind the skip link and every
link on the page. The label is one word (`sound` in `src/i18n/index.ts`) and
`aria-pressed` carries the state; the filled or open dot in front of it is CSS,
so there is nothing in the DOM for a screen reader to read twice. It is the
world's only focusable element, and `useInput` already ignores keys aimed at a
button, so Space on it toggles sound rather than flying the ship.

**It is hidden under 54rem**, because `.hud` is — the same rule that hides the
controls hint on a half-screened laptop. Sound is opt-in and optional, so losing
the toggle costs a narrow window nothing it had; worth knowing rather than
worth fixing.

**Not gated on `prefers-reduced-motion`.** Invariant 6 is about motion, and this
is the one thing in the world that only exists because someone asked for it out
loud. Silencing an opt-in on a motion preference would be guessing.

### Needs Seb

- **The mix, on real speakers.** Levels, the sea's swell depth, how loud a knock
  is against the surf — all of it is the constants at the top of `Sound.tsx`,
  and a container with a null audio sink has no opinion about any of it.
- **`sound` in `fr` and `nl` is unreviewed** — 'Son' and 'Geluid'. One word each
  and hard to get wrong, but CLAUDE.md says unreviewed translations do not ship,
  and this is the second one waiting (`worldControls` from Phase 3 is the other).

### Verified, on a throwaway install in Claude's container

Same caveats as the earlier passes: not on Seb's machine, and `typegen` and
`oxlint` cannot run from Claude's Linux VM. Swiftshader draws this world at
about 1.5 fps, which is also why the flight readings below were taken over
20-second holds.

- [x] `npx tsc -b` clean, `node src/i18n/locales.check.ts` green, 18 routes
      prerendered. No `<button>`, no `AudioContext` and no `.glb` in any
      prerendered document; `AudioContext` appears in the canvas chunk and
      nowhere else
- [x] Canvas chunk **449.6 kB gz** against 448.2 with the file stubbed out —
      **+1.4 kB**, budget 600. Everything else **131.3 kB gz** (budget 200),
      unchanged. CSS 2.1 kB gz
- [x] **No `AudioContext` exists on a loaded page.** Constructed on the first
      click, `running`, and the button reads `aria-pressed="true"`
- [x] The drive, read straight off the graph: idle `hum 0.050 @ 52 Hz, wind 0`;
      W held `0.077 @ 61.1 Hz`; W and Shift `0.115 @ 73.8 Hz` — the top of the
      range exactly; Space `wind 0.100`, full; everything released, back to
      `0.050 @ 52 Hz, wind 0`. Sea swells between 0.215 and 0.305 around 0.26
- [x] Parked at each landmark: that landmark's voice at full and the other two
      at exactly zero, the sea pulled back to half over the island, and the
      output pulsing — peak to floor 19× at the mine, 4× at the easel and the
      board, where the envelopes are softer and shorter
- [x] `/en/work` suspends the context and coming back resumes it; toggling off
      fades and suspends. Console clean on every walk, but for three's own
      WebGPU-unavailable notice
- [ ] The mix on real speakers, and 60fps with the graph running — real
      hardware only

## Phase 5 — Hardening

- [ ] Budgets in CI
- [ ] Lighthouse CI
- [ ] Keyboard audit in all three locales
- [ ] Browser matrix incl. WebGL disabled
- [ ] OG images per case study per locale

## Phase 6 — Mobile

- [x] Touch feeds `useInput()` — a thumb stick, `src/stick.ts`
- [x] The mount test stops rejecting a coarse pointer — `src/WorldGate.tsx`
- [x] The world's layout on a phone — `src/index.css`, `@media (pointer: coarse)`
- [x] The controls hint says what a thumb does — `worldControlsTouch`
- [ ] Exit: fly it on a real phone. 60fps, the stick's feel, the framing

BUILD-PLAN offered two options and **Seb chose drag-to-fly**, the faithful one,
over tap-to-move. Tap-to-move is less code in the input hook and more code
everywhere else — it needs an autopilot in `Ship`, a raycast layer over the
canvas, and a second way for a landmark to become the URL. Drag-to-fly is one
gesture read into the vector the keyboard already writes, and `Ship.tsx`,
`Particles.tsx` and `Sound.tsx` did not change a line for it.

**Everything is on, on a phone.** No effect is cut and the pixel ratio is not
capped — Seb's call, and an honest one: swiftshader has no opinion about frame
rate, so cutting the post-processing chain here would have been a guess dressed
up as a budget. The particles are already WebGPU-only, which most phones are
not, so the phone's frame is the landmarks, the shaders, the FXAA and the bloom.
If it is a slideshow on real hardware, `<Post />` is one line in `Scene.tsx` and
`dpr` is one prop on the `<Canvas>`.

### The stick

A drag anywhere on the world is a thumb stick measured **from where the finger
went down**, not from the middle of the screen or from a ring drawn somewhere —
so there is nothing to aim at, nothing to draw, and nothing to label. Full
deflection is 72px of travel, a constant rather than a fraction of the viewport
because a thumb is the same size on a phone and on a tablet.

**Boost is the same push, further** — past 1.7 × that travel. It is the one
control that teaches itself, because pushing further has already made the ship
faster before it makes it boost, which is why it is also the one control the
hint does not name. **Rise is a second finger**, anywhere. Neither needs a
button over the world, and the HUD stays one line of text and one toggle.

The arithmetic lives in `src/stick.ts`, on its own and importing nothing, so
`node src/stick.check.ts` can run it — a sign flip, a clamp and a threshold are
exactly what is wrong in one direction and invisible in a screenshot.

**A drag only starts on `.stage`.** A finger that goes down on the panel is
scrolling the case study and one on the header is following a link; once
started, the drag keeps steering wherever the finger goes, which is the reason
the listeners are on `window` and the origin is the finger's own. The mouse is
excluded on purpose — it has a keyboard next to it, and a click-drag over the
world would fight text selection for nothing. `touch-action: none` on `.stage`
is what stops the browser panning and double-tap-zooming underneath all of it.

### Two things the phone changed that the desktop did not ask for

- **`AIM_DOWN` in `Ship.tsx`.** The panel is a sheet across the bottom on touch,
  and a ship the camera centres in the viewport is a ship centred behind that
  sheet — the visitor could not see the thing they were steering. The camera now
  aims 1.15 units below the hull on a coarse pointer, which lifts the ship about
  18% of the screen into the band above the panel and brings the landmarks it is
  flying at up with it. `CAM_OFFSET` is untouched, so no approach distance and
  no proximity radius moved. It costs sky at the top of the frame. Zero on a
  fine pointer, so the committed desktop framing is exactly as it was.
- **The hint lost a control.** Naming boost cost a third line of the HUD in
  Dutch on a 320px screen, and the third line went through the panel. Measured,
  not guessed — see the comment on the panel's `bottom` in `index.css`.

### The layout, and what it costs

The panel is the same card, moved to the bottom, sized to its content up to
40dvh, capped at the site's own measure and centred in what is left — full width
on a phone, a column on a tablet where edge to edge would be a 45em line. The
HUD comes back below it, because on touch it is both the only place the controls
are named and the only way to reach the sound; the world's footer is hidden, the
same trade the narrow-window rule already makes, and its links are on every flat
page.

Two costs worth knowing: **the skip link is keyboard-only**, so on a phone the
way to the flat index is the *Work* link in the header and the project links in
the panel — invariant 5 holds by the second and third of its three routes, not
the first. And **a landscape phone is cramped**: 89px of world between the
header and the panel at 863 × 360. The flat site is one tap away and it is the
same complete article.

### Verified, on a throwaway install in Claude's container

Not on Seb's machine — `npm install` is forbidden in the project folder. This
pass could run `react-router typegen` as well, on the container copy.

- [x] `npx tsc -b` clean, `node src/stick.check.ts` and
      `node src/i18n/locales.check.ts` green, 18 routes still prerender.
      `oxlint src/` adds no new warning
- [x] **Cost of the whole phase: +528 bytes gz**, measured against a build of
      `git archive HEAD` with the same `node_modules`. First-route JS
      129,857 → 129,918 (+61, **126.9 kB**, budget 200) · canvas chunk
      448,297 → 448,645 (+348, **438.1 kB**, budget 600) · CSS 2,034 → 2,153
      (+119, **2.1 kB**)
- [x] No `.hud`, no `WebGPURenderer`, no `.glb` and no `pointerdown` in any of
      the 18 prerendered documents; the touch strings live in the i18n chunk
- [x] **19 input checks, driven as real touch events** through CDP on a Pixel 7
      profile: deadzone at 5px; 72px up is full forward and 72px right is full
      strafe; half deflection is half speed; past the ring is boost; the drag
      keeps steering when the finger slides over the panel; a second finger
      rises and lifting it stops; `touchcancel` mid-drag stops the ship; a drag
      begun on the header or on the panel is ignored; a mouse drag over the
      world is ignored; W, shift and space still work on the same object; and on
      `/en/work` the layer takes no pointers at all
- [x] Screenshotted at Pixel 7 portrait and landscape, iPhone SE, iPad portrait,
      1280 desktop and a 780px window, in EN and FR: the ship clears the panel
      everywhere, the HUD clears it by 22px in the worst case (a two-line hint
      on a 320px screen), and desktop is pixel-for-pixel what it was
- [x] Phone with WebGL2 unavailable: no canvas, and the case study is the full
      941-word article. `?read` and `/en/work` the same. Console clean
- [x] `prefers-reduced-motion` on a phone: world mounts, nothing drifts
- [ ] 60fps on a phone, whether 72px is the right travel, and whether
      `AIM_DOWN` is the right lift — real hardware only. Swiftshader draws this
      at about 1fps and has no opinion about any of them. On a portrait tablet
      the same 1.15 leaves a wide empty band between the ship and the panel,
      which is the one composition where a second number might be worth it

### Needs Seb

- **`worldControlsTouch` in `fr` and `nl` is unreviewed** — machine-drafted, and
  CLAUDE.md says those do not ship. That makes three waiting, with
  `worldControls` from Phase 3 and `sound` from Phase 4.
- **The feel, on a phone.** The stick's travel, the boost ring, whether a second
  finger for rise is discoverable enough to keep. All of them are the three
  constants at the top of `src/stick.ts` and one line in `useInput.ts`.

## The landing page — `/{lang}` is the ocean, `/{lang}/world` is the world

`/{lang}` used to be the world: the canvas mounted on the first route anyone
loaded, and the panel behind it was the bio and the three projects. It is a
landing page now — the sea, the name, one button — and the world has moved one
URL deeper.

### The route came back

Phase 3 retired `/world` because the scene was behind `/{lang}` and an unlinked
route had nothing left to hold. The landing page has taken `/{lang}`, so the
world needs an address again — and this one is linked, shareable and survives a
reload. One line in `routes.ts`, 21 prerendered documents instead of 18.

`isWorldPath()` moved with it: the world shows behind `/{lang}/world` and
`/{lang}/work/{slug}` and behind nothing else. So did the one navigation that
named the home page — flying away from a landmark with nothing to pop now
replaces with `/{lang}/world`, because leaving a landmark is not a reason to
leave the world. The page itself is `src/routes/world.tsx`, the old home
unchanged except for its title, so with no renderer or no JavaScript
`/{lang}/world` is the flat bio and project list it has always been. That is why
the button asks the visitor's hardware nothing: the address it points at is a
complete page either way.

### The ocean was sampled, not picked

The background is two CSS gradients, and every stop was read off a rendered
frame — the median of 210 columns per row, down `Claude outputs/
mobile-desktop-unchanged.png` — rather than eyeballed. A sky of three stops, a
sea of twelve, meeting at `--horizon`.

`--horizon` is 25dvh because the camera's 45° **vertical** field of view puts
the waterline there whatever the window size: a wider window sees more sea, not
a different horizon. `AIM_DOWN` in `Ship.tsx` tips the camera down on a coarse
pointer, which lifts the waterline, and one media query moves the variable to
6dvh — fitted against a phone render, not derived: the analytic 5.7° and the
best-fitting 5dvh agree, and 6 is within noise of both.

The same gradient is on `.stage`, the canvas layer, so it is also what the world
shows while the scene chunk loads and the renderer initialises. Pressing the
button therefore changes nothing on screen until there is a frame to show.

**Measured against the world, same viewport, same build:** worst channel
difference 6/255 over the whole desktop column, apart from two rows at 39–42%
where the world's own frame has an island and the ship's spray in it. On a phone
the far-haze band below the waterline is longer than the desktop's, which one
scale factor cannot reproduce; the residual there is up to 18/255 across about a
sixth of the screen, and it is the one place the still frame is visibly a still
frame.

### The hero centres in the water, not in the window

`padding-top: var(--horizon)` on `main`, so the name, the bio and the button sit
in the middle of everything below the waterline — and move up with it on a
phone. That band is also the darkest water on the page, which is what pays for
the text: `--paper` on it is 4.7:1 at the worst row, so there is no card and no
scrim, and the ocean is left alone. `--paper-dim` would have been 2.4:1, so the
second link is smaller rather than dimmer.

The button is the world's panel shrunk: same glass, same border, same 10px
radius, and gold on hover like every other link on the site. It is an `<a>` —
it goes somewhere, it has a URL, and it works before the JavaScript has loaded.

The footer is the world's: `.landing` joins `.world` on the same four rules, so
the chrome is one set of declarations, not two. One deliberate difference — the
world hides its footer on a narrow window and on touch, where the panel and the
HUD are already there; the landing page has neither, so it keeps it.

`.landing` is written on `<html>` in `root.tsx` rather than toggled in an
effect the way `.world` is, because it has to be in the prerendered document:
with JavaScript off, `/{lang}` is still the ocean.

### Verified, on a throwaway install in Claude's container

Not on Seb's machine — `npm install` is forbidden in the project folder.

- [x] `npm run typecheck` clean, `node src/i18n/locales.check.ts` and
      `node src/stick.check.ts` green, 21 routes prerender
- [x] **Cost: +380 bytes gz, all of it CSS** (2.16 → 2.54 kB). No new
      dependency, no new component, no JavaScript on the landing page beyond the
      router that was already there
- [x] **First-route JS is 23.6 kB gz lighter on `/{lang}`**: 130,224 → 106,601
      bytes gz, because the landing page imports no content and the MDX chunk
      left its first route. `/{lang}/world` and `/{lang}/work` are unchanged at
      130 kB gz (budget 200). The canvas chunk is untouched and still unasked
      for until the button is pressed
- [x] Colour match to the rendered world, 1280×720 and 390×844 — the numbers
      above
- [x] JavaScript off: `/en` is the ocean, the button, and both links;
      `/en/world` is the full flat page
- [x] WebGL2 unavailable: no canvas mounts, `/en/world` is the flat page, and
      the landing page is unchanged — it never asked
- [x] Pressing the button, sampled every ~70ms across the transition: the pixel
      under the water never leaves the water. No flash of the flat site's ink
- [x] Tab order on `/en`: skip · wordmark · Work · FR · NL · **Enter the
      world** · Or read the work · email · GitHub
- [x] `/en/world` → FR keeps the world (`/fr/world`), canonical and `hreflang`
      correct for the new route, `deploy.sh` smoke test probes it

### Needs Seb

- **`enterWorld` and `enterWorldAlt` in `fr` and `nl` are unreviewed** —
  machine-drafted, and CLAUDE.md says those do not ship. That makes five
  waiting, with `worldControls`, `worldControlsTouch` and `sound`.
- **Whether the horizon is in the right place on your screen.** It is measured,
  but it was measured under swiftshader, and the one thing that would give it
  away is the waterline jumping when the canvas takes over.
- **Whether the landing page should hold the eye at all.** It is deliberately
  four things on an empty sea; a visitor who wanted the case studies is two taps
  from them and no words on the page say so twice.

## The menu — one button instead of a header

The header is gone from every route. In its place, one square in the top right
of the screen, and behind it what the header carried: the wordmark's link, the
work index, the three languages — and the world's sound, which moved out of the
HUD, because it is the only thing on the site that is actually a setting.

### `<details>`, not a button and a piece of state

The disclosure is the platform's. That is the whole reason for it: with
JavaScript off the menu still opens, still closes and still takes the keyboard,
so the language switcher survives there — and it had to, because it was in the
prerendered header until now and invariant 4 says the flat site is complete.

Two effects add what the element does not do by itself: Escape closes it and
gives the focus back to the button, and a pointer down anywhere else closes it.
A third line closes it when the pathname changes, which is one line instead of a
handler on each of the six links.

### It is rendered by the layout, not by `WorldGate`

The first version hung it above the routes in `WorldGate`, next to the HUD.
That put it in front of the skip link in the DOM, and the skip link is first in
the tab order by invariant 5 — so it moved into `src/routes/locale.tsx`, exactly
where the header was, and the order is what it always was: **skip · menu ·
content · footer**.

The sound follows it: `useWorld()` used to return a boolean and now returns
`{ active, sound, toggleSound }`, so the two routes that ask whether the world is
showing read `.active` and the menu reads the rest. `WorldGate` still owns the
state — it is what feeds `Scene` — and still resets it on every load, because a
returning visitor cannot be given sound before they have clicked anything.

### What that changes in the world

The world now has **no focusable element of its own**. The HUD is a line of text
naming the controls and nothing else: no button, no `pointer-events: auto`, and
one less thing between a drag and the water. On touch it keeps its place — it is
still the only thing that names the controls — but it is no longer the only way
to reach the sound, which is now on every route including the ones with no
world behind them.

The header's dark top gradient went with it. Nothing needs it any more: the
button is its own glass, and the sky at the top of the world is the sky.

### The button

Three lines drawn in CSS — two borders and one gradient for the middle — on the
same glass, border and 10px radius as the landing page's button, with the
current locale code beside them so the language switcher is not invisible now
that it is behind a click. No icon file, no sprite, no request. `aria-label` is
the word *Menu*, which is the same word in all three locales and is therefore
the one new string here that nobody has to review.

The flat pages lost about 3rem of height off the top with the header, so
`main`'s top padding went from 1.5 to 2.75 rhythm units — measured against the
button, not the header, so the first heading clears it on a window too narrow
for the button to sit beside the measure.

### Verified, on a throwaway install in Claude's container

- [x] `npm run typecheck` clean, both checks green, 21 routes prerender, no
      console errors on any of them
- [x] **Cost: +575 bytes gz** — CSS 2,539 → 2,708 and first-route JS 106,601 →
      107,007 — and that is net of deleting the header, its gradient and the
      HUD's button. `/{lang}` 104.5 kB gz, `/{lang}/world` and `/{lang}/work`
      127.6 kB (budget 200)
- [x] Tab order on `/en`: **skip · Menu · Enter the world · Or read the work ·
      email · GitHub**
- [x] Opens on click, closes on Escape with the focus back on the button,
      closes on a click outside, closes after a link has navigated — and the
      canvas is the same element afterwards, so invariant 3 still holds through
      a menu navigation
- [x] **JavaScript off: the menu opens and the three languages work.** Also
      prerendered into all 21 documents, closed
- [x] The sound toggles from the menu in the world, `aria-pressed` follows, the
      menu stays open across the toggle, and there is no `button` in the HUD
- [x] Space on the button opens the menu instead of flying the ship —
      `useInput`'s `INTERACTIVE` selector already listed `summary` — and with
      nothing focused the world still takes W
- [x] `aria-current="page"` on the route you are on, `aria-current` on the
      locale you are in, and FR from `/en/world` lands on `/fr/world`
- [x] Screenshotted at 1280 and at 390 × 844, open and closed, on the landing
      page, in the world, on the flat index and on a case study

### Needs Seb

- **Whether it should say *Settings*.** It says *Menu*, which is the same word
  in EN, FR and NL and needs no review; *Settings* would be `Paramètres` and
  `Instellingen`, and those two would join the five already waiting.
- **The wordmark is only in the footer now.** On a case study, nothing at the
  top of the page says whose site it is until you open the menu.
- **The menu sheet overlaps the world's panel** when it is open on a wide
  screen — it is a popover over a card, and it looked right in the screenshot,
  but it is the one place two pieces of glass sit on top of each other.

## The boat — a second craft, and the first thing in the world with water under it

The visitor picks what they steer. **Craft** in the menu, above the sound:
*Saucer* or *Boat*. The saucer is unchanged. The boat is the same ship with its
altitude pinned to the sea, a coastline it cannot cross, and a wider circle to
call arrival — no second controller, no second frame loop, no second camera.

### Not the Going Merry

Seb asked for the *Going Merry* from One Piece. That is a specific, protected
design — the figurehead, the hull, the whole silhouette are the recognisable
thing — and generating a model of it is copying it whichever tool draws it. So
this is an original: a small single-masted boat with a square sail, sized and
coloured for this world rather than for that one.

### Procedural, like the saucer

CLAUDE.md says the character stays procedural and that a model file needs a
reason first. There isn't one here. A hull is the **bottom half of a squashed
sphere** with the forward sections pinched to a stem, and the deck is the same
unit circle in XZ with the same pinch applied — so the two rims agree by
construction rather than by two sets of numbers being kept in step. Everything
else is six sticks and a box: mast, yard, boom, bowsprit, rudder, cabin. Zero
asset bytes, and the export pipeline it would otherwise need is bigger than the
sixty lines that build it.

Seb chose *procedural now, a Blender script after*. `tools/boat.py` is **not
written** — the boat is worth looking at moving before anyone sculpts it.

The waterline is the model's own y = 0, so `Ship` puts the group on the swell
and the hull's numbers decide how much of it is wet: 18 cm of draft under, 20 cm
of freeboard over. The beam is 50 cm, which is **wider than a real boat of this
length and deliberately so** — the camera sits behind the ship and never turns,
so the view you get almost all the time is from astern, a boat's narrowest. At a
true beam the hull came out the same width as its own sail and the two read as
one slab.

### The sea is one set of numbers, read twice

`Scenery` has always had `SWELL`: three crossing sine waves whose **gradient**
the water shader turns into normals, on a plane that stays geometrically flat.
Its **height field** is the term those normals are the derivative of — so
`swell(x, z, t)` is a new export beside it that returns both, on the CPU, from
the same array. The boat rides the sea the visitor can see, rather than a second
sea that nearly matches. A dev-only finite-difference assert in that file is
what catches the day someone adds a fourth wave and gets one of the two wrong.

The noise ripple is deliberately not in the CPU version: it is a slope detail at
a scale no hull reacts to, and the one term with no cheap twin. The clock is
`clock.elapsedTime` rather than three's `time` node, so the phase is off by
however long the renderer took to come up — not observable on a flat plane
shaded by these normals, and threading the node's clock back to the CPU would be
a uniform read per frame to fix nothing.

Height is lagged into the hull (`BUOY`), and that lag is the whole of the
buoyancy. The gradient is read in the boat's own frame, so a swell on the bow
pitches it and one on the beam rolls it — added on top of the acceleration
spring, which is untouched, so the boat banks into a turn exactly as the saucer
does and wallows on the sea besides.

`WAVE_TILT` is 3, and it is a knob, not a measurement. The swell is 12 cm of
water at its steepest; a hull heeling by its true slope heels three degrees and
reads as dead flat. The water is a flat plane wearing painted-on waves, so this
is a lie on top of a lie and the only way to judge it is to look at it.

### Space does nothing, and the hint stops naming it

A boat floats. There is nowhere to climb to, so the altitude target is sea level
and Space and the second finger are inert. Rather than leave a key in the hint
doing nothing, there are two more control strings — one for keys, one for a
thumb — and the boat's are shorter, not apologetic.

The camera does **not** follow the heave. It follows the altitude, which for the
boat never leaves zero. A camera that bobs with the sea is a camera nobody
wants.

### A coastline, and what it cost the proximity radius

`world.ts` gained `offshore()`: a push out of every island's mooring circle,
in place, on a `{x, z}`. A push rather than a stop, so a boat leaning on a coast
keeps whatever part of its motion runs along it and slides round the island.

The circle is the island's shoreline — which `overWater` already knew, and which
is now `shoreOf()` so the two cannot disagree — plus half a hull, so the boat
stops with its side off the sand rather than in it.

**That shoreline is 1.77× the proximity radius**, which means a hull can never
reach the circle the saucer triggers on. So `landmarkAt` took a `moored` flag:
arriving *alongside* an island is what counts as arriving when you cannot fly
over it. The mooring circle a boat is stopped on is a hair narrower than the one
that opens the panel, because `offshore` puts the hull exactly on the first and
a strict `<` on the second would open or not open a panel on the last bit of a
float.

Two consequences, both checked in `world.ts`'s dev block beside the waypoint
assert it already had:

- **Mooring circles must not overlap.** Two that do leave a pocket where being
  pushed out of one puts you inside the other, and the hull buzzes between them
  forever. The three islands clear it comfortably — the tightest pair is the
  easel and the board, 22.5 apart against 18.2 needed.
- **A deep link must land inside the trigger.** Every waypoint is inside its own
  island, which is fine for something that flies and is dry land for something
  that floats, so the same `offshore` that keeps the boat off a coast is what
  puts the deep link on the water. It lands on the mooring circle, which is
  inside the circle that opens the panel — otherwise the deep link opens a panel
  and closes it one frame later, which is the Phase 3 bug wearing a hull.

The yaw a deep link faces is now measured from where the ship actually ended up
rather than from the waypoint it was aimed at. Identical for the saucer.

### The setting is remembered, and it is the only one that is

`localStorage`, read in the same after-mount effect as the renderer probe and
the pointer probe — before the canvas can mount, so there is no frame of the
wrong ship. Both the read and the write are in a `try`, because that effect is
also what decides whether there is a world at all and site data can be blocked
outright by policy.

The sound still is not remembered, and the reason is unchanged: the autoplay
policy would refuse to honour a stored *on*, so it would be a toggle that lies
about its own state. Nothing refuses a returning visitor the hull they picked.

### The control is a native `<select>`

Two options today. A pair of radios or a second toggle would be the same size
and would hand back the keyboard, the screen reader and the phone's own picker,
all of which come free here. `color-scheme: dark` at the top of `index.css` is
what keeps the popup from coming back white. `useInput`'s `INTERACTIVE`
selector already listed `select`, so nothing had to change for a focused
dropdown to stop flying the ship.

Like the sound, it renders only where there is a world, so it is in none of the
21 prerendered documents and does nothing with JavaScript off — which is the
same bargain the sound made, on a control that only exists to change something
that needs a GPU.

### All the craft stay mounted

`<Saucer visible={model === 'saucer'} />` and its two siblings, inside the same
`body` group that carries the bank and the spring. Toggling `visible` costs a
culled node. Unmounting would hand back a question about who disposes geometry
the renderer no longer has, for a tree that is two meshes deep.

### Verified, on a throwaway install in Claude's container

- [x] `npm run typecheck` clean, `npm run check` green, `oxlint src` adds no new
      class of warning, **21 routes prerender**, no page errors
- [x] **Cost: about +0.4 kB gz on the first route** — `/en` totals 107.4 kB gz
      against the 200 kB budget, and CSS 2.71 → 2.76 kB. Canvas chunk **457 kB
      gz against the 600 kB budget** — the boat is sixty lines of geometry in a
      chunk that is almost entirely three.js, and by the same `gzip -9` the
      Phase 3 entry above used it still measures the same 449 kB it did then
- [x] The pure arithmetic, asserted: the gradient `Ship` heels to is the finite
      difference of the height it rides, at three points; `offshore` lands
      exactly on the circle, is idempotent, leaves anything already clear
      untouched, never lands on dry land, and every waypoint pushed through it
      still reads as its own landmark under `moored` — and no longer reads as
      one without it, which is the pair that proves the wider circle is doing
      the work
- [x] In the built site: the select appears only in the world, changes the ship,
      the HUD hint follows it, the choice survives a reload, and switching back
      to the saucer works and stores
- [x] **A deep link to `/en/work/scrubble` on the boat keeps the panel open** —
      the boat spawns on the mooring circle and the very next proximity read
      agrees with the URL it came from
- [x] Screenshotted at rest, under way and mid-turn: the hull is cut by the
      waterline where it should be, and the saucer is untouched
- [x] Rendered offscreen from four views (broadside, bow-on, plan, and the
      camera's own quarter) before it ever went in the scene, which is what
      caught a hull too dark to read against this sea and a deckhouse that
      looked like a crate

### Needs Seb

- **The sign of the heel.** `WAVE_TILT` is applied as roll `+` and pitch `−` in
  the boat's own frame. It is self-consistent and it is arithmetic; whether the
  hull leans *into* the wave or *over* it is a screenshot at 60 fps, not a
  proof. Both signs are one character.
- **How much it should wallow.** `BUOY` 6 and `WAVE_TILT` 3 are the two feel
  numbers. Swiftshader ran the world at about one frame a second, which has no
  opinion about either.
- **Five new FR/NL strings**, joining the three already waiting: the boat's two
  control hints, and *Craft / Engin / Vaartuig* with *Saucer / Soucoupe /
  Schotel* and *Boat / Bateau / Boot*. *Craft* is the word doing the most work —
  it has to cover a flying saucer and a sailing boat in three languages.
- **`tools/boat.py`**, if the hull is worth sculpting once he has seen it move.
  It would be the first character with a model file, so it needs the reason
  CLAUDE.md asks for first.
- **The boat sits lower in frame than the saucer did.** The camera aims at the
  waterline instead of at a hover, which tips it further down and lifts the
  horizon. It looked right at 1280; the phone's `AIM_DOWN` was tuned against a
  saucer 90 cm higher and is worth a second look on real glass.

## The shore — the landing page grows a foreground, and flies through it

`/{lang}` was four things on an empty sea, and the open question at the end of
the landing-page section above was whether that was enough. It was not: an empty
sea says nothing about whether the thing behind the button is worth pressing.
So the landing page now has a foreground — two palm crowns leaning in over the
camera and a fainter pair behind them, cloud on the sky, the sun's glint on the
water, sand and a wash at our feet — and pressing the button flies the whole
thing past us.

Everything below is `src/index.css` under **"the shore"** and `src/routes/home.tsx`.
It is only on `/{lang}`. The world's own sky is the world's.

### One SVG path, used 44 times

`FROND` in `home.tsx` is a single palm frond: the rachis arcing out along +x,
34 leaflets alternating sides, each falling under its own weight. It was
generated rather than drawn — the shape is arithmetic, and arithmetic is what
gets a leaflet's droop consistent across 34 of them — and then it is the only
geometry on the page. Both crowns, both sides, near and far, the rim copies:
all of it is that path under a `<use>` transform. 1.7 kB of path data, no
request, no image, no dependency, and it is in the prerendered document, so the
shore is there with JavaScript off and with no renderer (invariant 4).

Everything else is gradients: six ellipses for the cloud, three for the sun and
what it throws on the water, two repeating gradients under an elliptical mask
for the glint, five stops from wet sand to dry for the beach.

### The flight is one dolly, not eight animations

Moving a camera forward projects every point *away from the vanishing point*.
The vanishing point of this picture is the middle of the horizon —
`50vw var(--horizon)`, the same constant the ocean gradient is built on — so
every layer scales about that one place and differs only in `--k`, which is how
near it is. The clouds barely move at 1.14; the crowns overhead go to 3.8 and
leave through the top corners; the sand goes to 2.7, which drops the waterline
below the bottom of the frame, because that is what a beach does when you walk
into the sea.

That is why the layers stay in register the whole way through, and it is why
there are no keyframes: one transition on `transform` and `opacity`, one curve,
and the numbers are depths rather than choreography. The `transform-origin`
lines look arbitrary and are not — each is that same viewport point written in
that layer's own box, which is why `.beach` reads `calc(var(--horizon) - 87dvh)`.

The mirrored crowns are flipped *inside* their `viewBox`, not with `scaleX(-1)`
on the element: the element's transform is the dolly and has to scale about the
vanishing point, and a flip on the element would move the point it scales about.

### The button holds the route back, and only when there is something to watch

`FLIGHT` is 560 ms; the CSS is 640, so nothing is still on screen at the cut.
The delay is a `setTimeout` held in an effect rather than in the handler, so
leaving the page cancels it — clicking through to the flat index mid-flight must
not drag the visitor into the world half a second later.

Two ways out of the delay, both of them the link doing what it says: a modified
click (new tab, new window) is handed straight to the browser, and
`prefers-reduced-motion` returns before `preventDefault` at all, so the
navigation is immediate and the CSS below it has nothing to play (invariant 6).
With JavaScript off there is no handler and the link is a link.

### Warmth, and where it comes from

The first pass was cold: the ocean gradient is twelve stops sampled off a
rendered frame, and those stops are blue. Rather than re-sample them — which
would put the landing page out of step with `.stage`, the one background both
share — the warmth is a wash inside `.sun`, which was already a full-frame
layer: a wider glow, a warm band lying on the water at the horizon, and a
linear tint over the whole frame with no gap in the middle, because a gap is
what made the water read as a cold stripe between two warm ends. Haze, cloud,
sand, wash, vignette and both silhouette colours went warm with it. No new
element, no new layer, and the sampled ocean underneath is untouched.

### Two things the foreground broke

- **The footer stands on the sand.** `--paper-dim` on lit sand is about a 1.6:1
  line. `.landing .foot` turns the ink over — dark on light, the one place on
  the site where the ground is brighter than the text. A scrim was the
  alternative, and a scrim over a beach is a stain.
- **A crown sized off `vw` alone eats a short window.** At 1024 × 640 — a
  half-screened laptop — the near fronds reached the headline. `width` now has a
  third cap in `dvh`.

### Idle motion, and what it is allowed to cost

The first version had none — nothing drifted at rest, and the only animation was
the one the visitor asked for. That was too still for a beach. There are three
loops now, and they are the neighbours of `transform` rather than `transform`
itself: `rotate`, `translate` and `scale` are separate properties, so each
composes with the dolly's `transform: scale(var(--k))` and the flight needs no
knowledge that any of them is running.

- **Wind**, `.sway`: a group inside each crown, rotating about where the crown
  meets its trunk. `will-change: transform` on that group is not decoration —
  it rasterises 44 filled paths once and hands the rotation to the compositor,
  instead of re-filling roughly nine thousand quadratic subpaths every frame.
  Four periods, none of them equal, because a gust does not reach two trees at
  once.
- **Surf**, `.wash` twice: the same shape at 8.5s and 12.5s, five seconds out of
  phase, so the two never line up into a pulse.
- **Birds**, two `<use>` of one 60-byte path. Each crossing takes about a fifth
  of its cycle, which is the difference between *at times* and *a loop*, and the
  flap is a `scale` on the same element the `translate` is flying — which is why
  the bird keeps its own `transform-origin` and does not get the vanishing
  point's, and why it flies on through the flight instead of being faded by a
  rule an animation outranks.

`prefers-reduced-motion` stops all three for nothing: the rule at the foot of
`index.css` already zeroes every duration on the page (invariant 6).

### Verified, in the container against the real stylesheet

Not on Seb's machine — the dev server cannot run from Claude's Linux VM, and
`npm install` there is forbidden.

- [x] `npx tsc -b` clean, `node src/i18n/locales.check.ts` green
- [x] The real `src/index.css` and the real markup, screenshotted at
      1440 × 900, 1024 × 640 and 390 × 844, at rest and mid-flight
- [x] The dolly holds: at 40% through, the crowns are streaming out of the top
      corners, the waterline has dropped below the frame, and the horizon has
      not moved a pixel — which is the test that says it is a camera and not
      eight separate fades
- [x] Footer legible on sand at all three sizes
- [x] No new class collides with anything already in `src`
- [x] Cost: **+1.7 kB of path data and about 90 lines of CSS**, no dependency,
      no image, no request, no JavaScript beyond one `useState` and one
      `setTimeout`

### Needs Seb

- **The build numbers.** First-route JS and the CSS gz figure both move, and
  neither can be measured here. The path data is markup in three prerendered
  documents per locale rather than a chunk, so the first-route JS should be
  near-flat and the HTML should grow by roughly 1.7 kB × 3.
- **Whether the idle loops hold 60 fps on your machine.** The wind is the one
  worth watching — four composited crown layers is the bet, and swiftshader in
  the container has no opinion about whether it paid off. Every period is one
  number in `index.css`.
- **Whether 560 ms is the right length.** It was judged on a screenshot at 40%,
  which has no opinion about how long a wait feels with a finger still on the
  mouse. It is one constant in `home.tsx`, and the CSS duration beside it.
- **Whether the canvas is ready when the flight ends.** The scene chunk is not
  requested until the route changes, so the flight buys it nothing today. If the
  world arrives late, starting the `import()` on the button's `pointerenter` is
  a two-line change in `WorldGate` — proposed, not built.
- **The sun is at 26% of the width.** The scene's own sun was swung round to
  port; 26% is where that looked right against the sampled gradient, not a
  number read out of `Scenery.tsx`.
- **Lighthouse, once it is deployed.** The shore is markup and gradients, so
  nothing here should touch LCP, but the flat-site 100 is a Phase 2 exit test
  and this is the first thing to land on that page since it was written.

---

## The map, and the panel that went away

The world's own route no longer opens with a card listing three projects. It
opens with the world, and the index moved into the bottom right corner as a top
view: three islands, a letter on each, and the character's arrow moving across
it.

### What it is

`src/MiniMap.tsx` — DOM, not canvas (invariant 2), and outside the canvas chunk.

- **Scale is measured, not written.** The box covers every island's coastline
  (`radius × ISLAND_SPREAD`, the same number `Islands` revolves out to) plus
  16%, one span for both axes so a circle stays a circle. A project moving in
  its frontmatter moves on the map, and nothing here knows there are three.
- **The letter is the slug's first character** — `P`, `A`, `S`. The title would
  have been the obvious source and is the wrong one: it is translated, so the
  map would change letters with the language.
- **Each island is a `<Link>`**, which is invariant 5 surviving the panel going
  away: the letters are a keyboard path to every landmark and they take focus in
  order. The menu's work index is still the other path.
- **The arrow reads `VIEW`**, three plain numbers in `src/world.ts` that `Ship`
  writes once a frame. Not `SHIP` — that is a `Vector3` in the canvas chunk, and
  a value import from it would pull three into the first-route bundle. One rAF
  loop writes `left`, `top` and `rotate` on one element; no React state moves at
  60 fps. Past the last coast the arrow is held at the edge rather than clipped.
- **The panel is hidden, not deleted.** `WorldGate` puts `.roam` on `<html>`
  when the world is showing and no landmark is open, and one CSS rule hides
  `main`. The prerendered document is untouched, so the visitor with JavaScript
  off, the visitor with no renderer, and every crawler still get the bio and the
  three projects as a page.

### The panel changed sides so the map could stay

`.world main` was a column down the right, which is the map's corner. It is a
column down the left now, and the map is up at a landmark as well as while
roaming — the one whose case study is open carries `aria-current` and goes gold,
which is the only place that state is visible while flying.

The HUD and the footer were already down the left and are untouched: both sit
below this column's bottom edge.

Where the panel is a sheet across the bottom rather than a column down one side
— a narrow window, and touch — it is back in the map's corner and the map gives
way. Roaming there is no sheet, so it stays, lifted 4.6rem to clear the HUD.

### Cost

One lazy chunk beside the canvas, about 110 lines of TSX and 70 of CSS, no
dependency, no asset. `npx tsc -b` clean, `node src/i18n/locales.check.ts`
green.

### Two waypoints moved with it

Where a landmark lands on the screen is arithmetic, not taste: the camera never
yaws — it is always `CAM_OFFSET` from the ship, +z and above — so `pos` against
`waypoint` says it outright. Lower z is in front of the ship; higher x is the
right half of the frame, which is the half the panel no longer covers. Both
survive `offshore`, which moves the boat further out along the same direction
without flipping either sign, so one pair of rules frames both hulls.

`world.ts` asserts them in dev now, beside the waypoint-inside-its-radius check
that has been there since Phase 3.

- **PolarSense**, `[-10.5, -6]` → `[-17.1, -4.9]`. It arrived left of the mine,
  which put the mine in the left half — under the new panel. Mirrored round to
  the other side and pulled south: the saucer now frames the mine about three
  quarters across, and the boat, which is pushed out to `moorRadius` and so
  further off-axis than the saucer, stays inside the frame instead of past its
  edge. A straight mirror to `[-17.5, -6]` framed the saucer better and put the
  boat about a degree outside it.
- **Scrubble**, `[0, 14]` → `[-3, 17.5]`. This one was already wrong and the
  panel is not why. The waypoint was *south* of the board — lower z — so the
  camera, 7.2 further south again, sat between the ship and nothing, with the
  board behind them both. Arriving at Scrubble by deep link framed a board that
  was behind the camera. It comes in from the north now, and the assert above is
  what would have caught it.

Arts by Sandra was already right on both counts and is untouched.

### Needs Seb

- **The two moved waypoints, flown.** The arithmetic says three quarters across
  for the saucer and something like 85% for the boat, on a 16:10 window. A
  narrower window is a narrower field of view, and this is the kind of number a
  screenshot settles and a calculator does not.
- **`worldMap` in FR and NL** — "Carte du monde" / "Kaart van de wereld", the
  map's accessible name. Unreviewed, and it joins the eight already waiting.
- **Whether the map is the right size.** `min(11rem, 34vw)`, and the letters are
  sized against it — one number in `.map` in `index.css`.
- **Whether losing the panel loses the bio.** `/{lang}/world` was where a
  visitor who flew in read who you are; now that sentence is only on the flat
  routes. Putting it back as a line of chrome, or on first arrival only, is a
  proposal and not built.
- **Whether the arrow reads as facing.** It is drawn from `yaw`, not from the
  hull's roll, so it does not swing on a wave — which is right for a map and is
  a thing a screenshot cannot settle.
### Two waypoints moved with it

Where a landmark lands on the screen is arithmetic, not taste: the camera never
yaws — it is always `CAM_OFFSET` from the ship, +z and above — so `pos` against
`waypoint` says it outright. Lower z is in front of the ship; higher x is the
right half of the frame, which is the half the panel no longer covers. Both
survive `offshore`, which moves the boat further out along the same direction
without flipping either sign, so one pair of rules frames both hulls.

`world.ts` asserts them in dev now, beside the waypoint-inside-its-radius check
that has been there since Phase 3.

- **PolarSense**, `[-10.5, -6]` → `[-17.1, -4.9]`. It arrived left of the mine,
  which put the mine in the left half — under the new panel. Mirrored round to
  the other side and pulled south: the saucer now frames the mine about three
  quarters across, and the boat, which is pushed out to `moorRadius` and so
  further off-axis than the saucer, stays inside the frame instead of past its
  edge. A straight mirror to `[-17.5, -6]` framed the saucer better and put the
  boat about a degree outside it.
- **Scrubble**, `[0, 14]` → `[-3, 17.5]`. This one was already wrong and the
  panel is not why. The waypoint was *south* of the board — lower z — so the
  camera, 7.2 further south again, sat between the ship and nothing, with the
  board behind them both. Arriving at Scrubble by deep link framed a board that
  was behind the camera. It comes in from the north now, and the assert above is
  what would have caught it.

Arts by Sandra was already right on both counts and is untouched.

### Needs Seb

- **The two moved waypoints, flown.** The arithmetic says three quarters across
  for the saucer and something like 85% for the boat, on a 16:10 window. A
  narrower window is a narrower field of view, and this is the kind of number a
  screenshot settles and a calculator does not.
- **`worldMap` in FR and NL**

## The sea has two states, and the agitated one is real geometry

**Sea** in the menu, under the craft and above the sound: a native `<select>`
with two options, *Calm* and *Agitated*. It is the world's third setting and the
second one that is remembered.

This replaced a continuous slider, built first and thrown away after Seb flew
it. Two named states beat a dial here for the reason two named states usually
do: there is nothing between them worth steering to, and a control with two
stops and no labels is worse than a control with two words on it.

### Calm is the old sea, a little bigger

`SWELL` still holds the three crossing swells the world shipped with, and `CHOP`
is the scale over them — ×1.5625 on height, ×1.1 on frequency, ×1.12 on speed.
Those are the numbers the discarded slider produced at half travel, which is
where Seb stopped it. Keeping the shipped array and a scale beside it rather
than folding the two together is what keeps the provenance readable; both are
constants, so the shader folds them at graph-build time and neither costs a
uniform.

The agitated sea is **that same chop, unchanged**, with something under it.

### The rollers, and why the plane is no longer flat

Three trains of big swells, `ROLLERS`, at headings 20°, 112° and 218° with
wavelengths 96, 74 and 60 and heights 2.6, 1.7 and 1.1 against a 1.9 m mast.
Each crest is a sine raised to the ninth or higher rather than a sine, which is
what makes them *few* — about a sixth of the wavelength is above half height and
the rest is the water that was already there — and a second, much longer wave
along each crest line takes a roller between 0.65 and 1.0 of its height, so the
sea runs big in places and slack in others and that drifts across the world over
half a minute.

**Three and not one, and that was Seb's correction to the first build.** One
train is a corrugated roof: every crest parallel to every other, from here to
the horizon, for as long as you sail — the shape is unmistakable the moment you
turn. Three at spread headings, with wavelengths and speeds sharing no factor,
cross into something with no readable direction: long ridges where two agree,
short pyramids where three do, flat water in between. They are summed, not
maxed, because a sum has the gradient of a sum and that is what keeps the hull
on the water the shader drew.

Summing three peaked trains does not make three times the water, because the
crests are narrow and rarely coincide. Over open water the height sits under
half a metre half the time, reaches 1.8 at the 90th percentile, 3.1 at the 99th,
and peaks near 4 where all three happen to agree — which is the rogue one, and
worth waiting for.

The heights fall off with the wavelength, which is what a real sea does, and the
first attempt at three trains kept the old 52-unit wavelength: that made the
faces steep enough to throw the boat into the air at cruising speed, which lost
the distinction the whole thing is built on. Longer and lower fixed it.

**The water plane is displaced now, and that reverses a decision this file has
carried since Phase 3.** The old note said a displaced mesh buys a silhouette
the horizon hides anyway, and at 15 cm of swell that was plainly right. At 2.8 m
it is not: a wave taller than the ship that is only a painted normal has nothing
to ride and nothing to be thrown off, and the hull would climb an invisible
hill. So the plane is 240 × 240 segments — a vertex every 3.75 units, fourteen
across a roller, 58k vertices and one draw call — and `positionNode` raises it
by the roller term in the vertex stage. The chop is still not displaced and
still does not need to be.

The frame-rate consequence is Seb's to judge on real hardware: the water went
from two triangles to 115k, each vertex evaluating one roller and three
smoothsteps.

### The islands sit in their own calm water

A 2.8 m swell running over a plateau 45 cm above the sea would put the mine
underwater twice a minute. So the rollers are damped to nothing across every
island's shallows: `shoal()` in `world.ts` is a product of one smoothstep per
island, and it lives there rather than in `Scenery` for the reason `shoreOf`
does — the water shader and the hull must not be two files guessing at one
coastline.

It returns the **gradient** as well as the factor, and that is not decoration.
The water is displaced by `roller × shoal`, so its slope is the product rule; a
version that faded the height and not the slope would shade a flat ring around
each island that visibly slopes. The dev finite-difference assert in `Scenery`
now runs calm and agitated, in open water and inside that ring, which is exactly
where a dropped term would hide.

`SHOAL` is 7 units and was 10 in the first pass. The three islands are close
enough that three overlapping ten-unit fades multiplied out to a quarter of the
swell **at the world's origin**, which is where the visitor arrives — so the
setting appeared to do nothing until you had sailed for five seconds. At seven
they clear each other and the sea is running where the ship starts.

### The hull rides it, and at speed it leaves it

`BUOY`'s first-order lag is gone. The boat's vertical is now one spring toward
the surface, damped against the surface's **own** vertical speed, with gravity
instead of the spring the moment the water drops away faster than the hull can
follow. Which is to say the hull can be in the air, and the air is ballistic.

The nice part is that "if it has enough speed" needed no rule of its own. The
surface is sampled under the hull each frame, so what the spring reads is
`dh/dt + v·∇h` — the wave's own motion plus the hull's run up the face. Standing
still, a roller lifts you. Meeting one at fourteen units a second, it throws you.
Simulated against the real wave train, over a minute of sailing straight at it:

| Speed | What happens |
|---|---|
| 7.5 (cruise) | rides. Under a metre of daylight at most, and rarely. |
| 13 | 1.1 to 2.9 m of air. |
| 18 (full sail) | 2.3 to 4.9 m, depending on the heading. |

Measured over 90 seconds of sailing at each of three headings, because with
three crossing trains the answer is no longer the same in every direction — and
that spread is the point of having three. Logged from the running world, the
biggest launches leave the water at the `LAUNCH` cap of 10 units a second, which
is 5.6 m of air.

**`POP` is what makes those numbers what they are, and it is a lie.** Buoyancy
alone tops out around three metres off the biggest roller at full sail — a
respectable hop off something taller than the mast, and not what Seb asked for.
So the hull's upward speed is multiplied by 1.45 at the instant it leaves the
water, which takes the same jump to five. It is the same class of lie as the
spray's gravity, and for the same reason: what a visitor judges is the arc, and
the arc is not improved by being correct. `POP_MIN` keeps it off the small
stuff, so a hull drifting over a crest in a calm sea is not launched for it.

Cruise is 7.5 and full sail is 18, so the threshold sits inside the boost range:
holding shift into a roller is the jump, and that is a thing a visitor finds
rather than a thing the hint has to tell them.

Three bounds keep it from becoming a catapult. `LAUNCH` caps what the water may
throw the hull off at — a crest crossed in one frame, or the island fade taken
at full sail, is a *step* in the surface, and a spring chasing a step launches
whatever sits on it. `SINK` stops a landing driving the hull under displaced
water it would disappear behind. `SURF_MAX` caps how fast the surface may appear
to be moving. Falling is not capped; only being thrown.

Leaving the water and landing are now the only two events in the flight
controller — everything else in it is still a rate. Between them the hull's own
vertical acceleration is fed into the bounce spring that has been there since
Phase 0, the one that already turns acceleration into squash, so the wave face
and the drop off a crest arrive through it bounded by `JOLT` with no second path
to tune. The landing adds to that spring directly (`LAND_SQUASH`), because
`JOLT` bounds the bounce at exactly the moment a landing should not be bounded.

### The splash

An impact writes `SPLASH` in `world.ts` — where, how hard, how long ago — and
two things read it. It is a level with an age rather than an event, so any
number of readers can have it and none of them consumes it.

**A ring of foam on the water**, in the water shader: a circle opening at 5.2
units a second from where the hull hit, thinning over 0.9 s, plus white water
under the hull itself for the first quarter second — the ring alone arrives from
nowhere; the flash is what makes it a landing. Both are torn up by the same
noise field the whitecaps use, so it is foam rather than a decal.

**A burst of spray**, in the existing compute particles: for a third of a second
every droplet that comes up for reuse is respawned whatever the density says,
out of a ring 2.4× as wide and thrown 2.2× as hard. 2048 droplets on a 1.1 s
stagger is about thirty a frame, so a burst is six or seven hundred of them —
enough to read as water going up, and no second particle system to own, seed and
dispose.

The ring is on the water rather than in the particles **on purpose**: the spray
is WebGPU-only and always has been (see the Phase 4 argument), so without it a
landing on the WebGL2 fallback would be a hull stopping and nothing else.

### Two things the displaced water quietly broke, now fixed

Both were introduced when the rollers arrived and neither was visible in a still:

- **The spray spawned at sea level**, which stopped being the sea. `SEA` is
  0.03 above y = 0, and the water is now three metres up as often as not, so the
  plume was spawning under the surface on every crest. `SHIP.sea` — the height
  of the water under the ship, published by `Ship` each frame for both hulls —
  is what it spawns on now.
- **The spray's ceiling and the wind's fade were measured from the origin.** A
  saucer hovering 0.9 over a 3 m crest read as 3.9 up: no spray, full wind, on
  water it was nearly touching. Both are `SHIP.pos.y - SHIP.sea` now.

The chop's slope is still exaggerated by `WAVE_TILT` and the roller's is not:
one is 15 cm of painted water that would heel a hull four degrees, the other is
a 24-degree face you can see. And the hull stops heeling to a wave it has left —
`wet` fades over about a tenth of a second, so a boat in the air holds its
attitude instead of banking to water it is no longer touching.

### The camera got a second lag

"A camera that bobs with the sea is a camera nobody wants" still holds for the
chop, and stops holding when the hull goes three metres up: a camera that
ignored that would lose the thing the visitor is steering off the top of the
frame — which is exactly what the first build did, and the screenshots caught.

So there are two lags. The camera's **height** follows slowly, so the chop never
moves it; its **aim** follows quickly, so the boat stays in the middle of the
frame. The gap between them is a tilt, and the tilt is what a jump looks like
from behind. The saucer's framing is untouched.

### The sound

The surf is the one layer already a function of the water, so it is the one the
rollers belong in: +85% on the sea bed at a full train, riding the same ramp the
water does. Switching seas ramps over about a second and a half rather than
popping two and a half metres of water into existence under the hull, and the
uniform and the CPU twin are moved by one function, as they have always been.

### Cost

No dependency, no asset. The canvas chunk went from 456.68 to 457.61 kB gz —
under a kilobyte for all of it, because it is arithmetic. The first-route JS is
untouched.

### Verified, on a throwaway install in Claude's container

- `npx tsc -b` clean and `node src/i18n/locales.check.ts` green, on Seb's copy.
- Full `npm install` + `npm run build` on a copy in the container: typegen,
  build and all 22 prerenders clean.
- The analytic gradients checked against finite differences — 1e-11 agreement,
  in open water and inside an island's fade, calm and agitated, and again after
  the sea became three trains.
- The height and slope distribution sampled over a 180-unit patch of open water,
  which is where the percentiles above come from.
- The hull dynamics simulated against the real wave field at three speeds and
  three headings, which is the table above.
- The launch and landing events logged out of the running world over two and a
  half minutes of sailing at full sail: launches from 2.4 to the 10-unit cap,
  impacts from 6.2 to 10, splash force 0.89 to 1.0 on the big ones.
- The foam ring photographed by driving `SPLASH` on a loop in the container copy
  — swiftshader runs the world twenty times slower than wall time, so a real
  landing and a splash that fades in 0.9 s of wall time cannot both be caught in
  one screenshot. The ring in `Claude outputs/sea-splash.png` is therefore a
  forced one; what it shows is that the shader draws what it should.
- **Not verified anywhere: the burst of spray.** It is WebGPU-only and headless
  Chromium here has no WebGPU adapter, so it has been read and not seen.
- Rendered headless on swiftshader: both seas, both hulls, the menu open, and
  nine frames sailing all four ways under full sail. No console errors anywhere.
  Screenshots in `Claude outputs/`.

### Needs Seb

- **The frame rate**, which is the one thing that changed shape here. 115k
  triangles of water, each vertex evaluating three trains and three smoothsteps,
  on a 2022 mid-tier laptop. `SEGMENTS` in `Scenery.tsx` is the dial; the
  shortest train needs about twelve vertices across it and has sixteen, so there
  is room under 240 before a crest starts to shimmer.
- **Whether the jump is a jump or a launch.** `POP` 1.45 with `GRAV` 9 and
  `LAUNCH` 10 gives up to 5.6 m of air and about two seconds of hang, which at
  full sail into the wave train means the hull is off the water a good part of
  the time. That is what "higher" asked for and it is one number from being
  calmer.
- **The burst of spray, on a machine with WebGPU.** `BURST_RING`, `BURST_KICK`
  and `BURST_LIFE` in `Particles.tsx` have never been seen doing anything.
- **Whether the camera's two lags feel right**, especially whether the horizon
  swinging as the aim follows a jump reads as drama or as seasickness. `CAM_RISE`
  and `CAM_AIM` in `Ship.tsx`.
- **Whether the shelter around each island is welcome or annoying.** It is what
  keeps the mine dry, but it also means the sea goes quiet exactly where the
  case studies are.
- **`seaCalm` and `seaAgitated` in FR and NL** — "Calme"/"Agitée",
  "Kalm"/"Bewogen". Unreviewed, and with `sea` they join the nine waiting.

## The surfer — a third craft, and the first one that is a person

**Craft** in the menu now has three entries: *Saucer*, *Boat*, *Surfer*. The
surfer floats, so it is the boat's machinery — altitude pinned to the sea, a
coastline it cannot cross, the wider circle that calls arrival — carrying a
different thing on top of it and a different column of numbers underneath.

Still one flight controller, one frame loop, one camera.

### `boat` became `floats`

Every branch in `Ship` that used to ask *is this the boat* now asks *does this
float*. That is the whole structural change: `const floats = model !== 'saucer'`
and eighteen call sites that read better for it. Nothing about the saucer or the
boat moved.

What is per-craft lives in two tables at the top of the file rather than in a
branch beside each constant:

- **`AGILITY`** — speed and turn rate, read for all three. The saucer and the
  boat are 1 and `TURN`, exactly what they were. The surfer is **1.18× and 16**:
  barely quicker in a straight line (the sea is the same sea and the landmarks
  are where they are) and **nearly twice as sharp into a turn**, because a board
  turns by leaning and a board that turned like a hull would be a hull.
- **`CRAFT_WATER`** — the nine numbers the buoyancy, the crest and the landing
  read. The boat's column *is* the existing constants, by reference, so the boat
  is provably unchanged. The surfer's says "lighter" nine ways: `buoyK` 105 to
  the boat's 70 and `buoyC` 11 to its 15 (bobs faster, damped less), `pop` 1.95
  and `popMin` 1 against 1.45 and 1.5 (leaves crests harder, and leaves much
  smaller ones), `tilt` 4.6 and `heel` 0.95 against 3 and 0.6 (leans further
  into a face), `launch` 12 against 10, `sink` **0.12 against 0.3** — a board
  rides on the surface where a hull sits in it — and `squash` 0.34 against 0.5,
  because there is less of it to compress on landing.

The whole point of a third craft is that it leaves the water, so the numbers
that decide that are the ones that moved most.

### The model: two ellipsoids, eleven cylinders, eight spheres

Procedural, like the other two. It is the one that most looks like it should
have been a model file, so, concretely: the board is the hull's trick again — an
ellipsoid pinched in plan, nose harder than tail, with a rocker bent into both
ends — and the **stringer is a clone of that geometry scaled to a fifth of its
beam**, so it follows the rocker by construction and pinches to a point at the
nose. A straight box laid on a curved deck sinks into both ends.

The rider is a pose: nineteen points in board space and a `Bone` that draws a
tapered cylinder between two of them. Changing the crouch is moving points.
Spheres at the knees, shoulders, fists and head, because two cylinders meeting
at an angle is a corner where a person has a joint. Shorty wetsuit — torso,
thighs and upper arms in it, shins, forearms and head bare — which is two
materials doing the work of a texture, and the thing that makes a figure this
small read as a person rather than a mannequin.

**The stance is read off what the camera can see.** It sits astern and never
yaws, so the visitor spends the session looking at this thing's back. The rider
is turned toe-side and crouched with **both arms out** — the one surfing pose
that is still a pose from directly behind — and those arms are most of the
silhouette's width, because a figure this size head-on with its arms down is a
post. The ponytail is the only detail here that is not structural: it is also
the only thing that says which way the craft is facing at a hundred units.

**The board rides high on purpose.** The first pass floated it with 2 cm of
keel under the waterline and the calm chop — 15 cm at its steepest — washed
straight over the deck; the board disappeared under its own rider. It now sits
with the keel *on* the waterline, which is what a board under a rider does.

### The wake is the surfer's share of the bloom

The other two craft carry running lights. This one carries the only thing a
board leaves behind: one strip of foam behind the tail, widening and fading aft,
its brightness multiplied by a `WAKE_SPEED` uniform that follows the board's own
speed. At rest there is nothing there. At full speed it peaks at 0.6 emissive
against the lamp's 1.

It fades **twice**, and the second one is not optional: `Post` blooms the
emissive buffer and not the alpha, so a strip that stops dead at its own rails
blooms as a rectangle with corners however transparent it is. Along the length
from `positionLocal.z`, across it from `uv().x` — which is the only one of the
two that survives the taper baked into the geometry.

The material and its uniform are at module scope, for the reason `LAMP` is: this
module is the canvas chunk, so nothing constructs it until the world mounts.

### Cost

No dependency, no asset. **1.15 kB gz** in the canvas chunk — the same chunk
built with the surfer stripped out measures 451,267 B gz against 452,440 B with
it. The chunk is **441.8 kB gz against the 600 kB budget**; the first route is
**106 kB gz against 200 kB**, and its share of this is six locale strings and a
third `<option>`.

### Verified, on a throwaway install in Claude's container

- `npx tsc -b` clean and `node src/i18n/locales.check.ts` green on Seb's copy.
- Full `npm install` + `npm run build` on a copy in the container: typegen,
  build and all 22 prerenders clean. `oxlint src` adds no warning that Ship.tsx
  did not already have — the first draft held the wake uniform in a `useMemo`
  and picked up a `react(immutability)` warning for writing to it in the frame
  loop, which is why it is at module scope now.
- **The TSL graph, compiled and drawn in isolation** before it went near the
  world: the wake material built exactly as `Ship.tsx` builds it, rendered
  through `WebGPURenderer` on its WebGL2 fallback, which is the path a machine
  without WebGPU takes. It compiles, and the fade runs the right way — brightest
  at the tail.
- **The model, rendered and looked at** rather than reasoned about. The
  geometry was ported to a standalone three.js page and screenshot from astern,
  the quarter, the side and close, and the pose went through three rounds on
  what those showed: the first rider was spindly and stood upright, the second
  had no feet and no crouch.
- **The built site driven headless**, surfer selected out of `localStorage`, on
  a calm sea and an agitated one: no console errors, the menu carries three
  craft, the HUD reads *WASD or arrows to surf · shift to charge*.
- The waterline checked with a probe on `SHIP` rather than by eye — the board
  settles to within a few centimetres of the sea it is riding.

### Not verified, and one of them is a trap

- **Nothing here has been seen at a real frame rate.** Swiftshader runs this
  world at about half a frame a second, and at that timestep the water under the
  hull appears to jump: `surfVel` sits on its ±11 cap, the buoyancy spring reads
  a step, and the board gets thrown metres into the air. *The boat does exactly
  the same thing under the same conditions* — probing both is what proved it was
  the frame rate and not the new craft — but it means every "airborne" frame in
  the screenshots below is an artifact, not a jump.
- **The wake at full strength.** Its uniform smooths at 0.12 a frame, so at half
  a frame a second it needs forty seconds of wall time to come up. `Claude
  outputs/surfer-wake.png` catches it partway.
- **The spray**, which is WebGPU-only and has never been seen by anyone here.

### Needs Seb

- **Whether the surfer is too jumpy.** `pop` 1.95 and `popMin` 1 in
  `CRAFT_WATER` are the two numbers; on an agitated sea it should be off the
  water a good part of the time, and that is the intent, but the intent has
  never been watched at 60 fps.
- **Whether 16 is too sharp a turn.** It is nearly twice the boat's, and a
  camera that never yaws is the thing that has to keep up with it.
- **The wake on real water.** It is a flat strip at the waterline behind a board
  that is riding displaced geometry; on a roller it will cut into the wave face
  behind it. Two units long and fading was chosen to keep that cheap, and it has
  only ever been seen on a calm sea.
- **`modelSurfer` and the two control hints in FR and NL** — "Surfeur"/"Surfer",
  and *ZQSD ou flèches pour surfer · maj pour foncer* / *WASD of pijltjes om te
  surfen · shift om te knallen*. Unreviewed, and they join the eleven waiting.



## The rider — the first character with a model file

Seb pointed at a picture of a surfer and asked for that man on the board. The
procedural rider could not become him: it was eleven tapered cylinders and eight
spheres, and what the picture has is a face, a beard, curls, and a wetsuit with
neon ribbons running across black. So `tools/surfer.py` exists, and it is the
first time anything in this world that moves has come out of a file.

### The reason CLAUDE.md asks for

Every other craft here is a **hull** — a solid of revolution with things bolted
to it. Code is good at those: the saucer is a lathe, the boat is half a squashed
sphere with six sticks on it, and the board still is. A **person** is one skin
over a skeleton, and the seam where a cylinder arm met a sphere shoulder was
never going to close no matter how the arithmetic was arranged.

So the skin is a **metaball field**: capsules and ellipsoids laid along the
pose, converted to a mesh, decimated to 20k triangles. Joints are blends. The
pose is still one list of points at the top of the file — the same contract the
procedural rider had, so deepening the crouch is moving points, not editing
thirty elements.

Two things came out of building it that are not obvious and are written down in
the file so nobody measures them twice:

- A metaball's `radius` is where its **influence** dies, not where the surface
  is. At the default stiffness of 2 a lone ball's surface sits at **0.574** of
  it. Everything in the script is written in real centimetres and converted.
- A **capsule**'s `size_x` is a length in object units; an **ellipsoid**'s
  `size_x/y/z` are *multipliers on its radius*. The two helpers convert
  differently for that reason, and both take real half-extents.

### Colour is in the file, and it is the second half of the reason

The landmark pipeline is geometry only: a mesh's name prefix picks a TSL
material. That has no way to say "magenta ribbon fading across a black panel"
without a texture or twenty meshes. The rider bakes colour into **COLOR_0**
instead — one attribute, one `vertexColors` material in `Ship.tsx`, linear in
the file and linear in the shader (glTF says COLOR_0 is linear and three uses it
as-is, so the sRGB conversion happens once, in Blender).

The suit is one scalar field sampled per vertex, and the bands are **ramps
between stops rather than thresholds**: a hard threshold on a mesh this coarse
gives a zigzag edge a centimetre deep, because the only place colour can change
is at a vertex. Ramps put two or three vertices in each transition and read as
airbrushed panels, which is what the reference has anyway.

### The face is geometry, because paint could not hold it

The first pass painted eyes and a smile as vertex colour and got two white stars
and a smear — the skin around an eye is about a centimetre a vertex. Eyes,
irises, brows, nose and a smile with teeth in it are now five small ellipsoids
each **aimed** rather than positioned: a ray from the head centre along the
feature's direction, and the feature sits where it comes out of the skin. That
was not a nicety — guessing the depth put the smile *inside* the jaw, because a
head with a jaw hung off the front of it is not a sphere and its surface is not
at a radius you can write down.

Curls are a second metaball field, so they pile on each other without inflating
the head to meet them. None of them crosses the face; the first pass grew a
fringe over both eyes.

### What changed in `Ship.tsx`

- `Surfer` keeps the board, the stringer, the fin and the wake. It gains a
  **traction pad** — a grid laid on `deckY`, not a slab on the deck, because the
  deck curves both ways and a flat box either floats at the middle or sinks at
  the corners — and the board is now lime with a magenta stringer, the
  reference's colours.
- `deckY(x, z)` is new and is the board's own three steps in order: plan pinch,
  ellipsoid, rocker. `tools/surfer.py` has the same function and uses it to put
  the soles on the deck and to draw the board in its previews. **Change one and
  change the other.**
- `Bone`, `Joint` and the twenty-point pose list are gone. So are the suit, skin
  and hair materials.
- `<Rider />` loads `src/models/surfer.glb` through `useGLTF` and flattens it the
  way `Landmarks.tsx` flattens a landmark. It is wrapped in `Suspense` on its
  own, not with the craft: the board should be on the water the frame the surfer
  is chosen, whether or not 420 kB of rider has landed yet.

### Not verified

- **Nothing has been seen in the browser.** The sandbox this was built in is
  Linux/arm64 and `node_modules` here is a macOS install, so `oxlint` and
  `react-router build` cannot run — both die on a native binding, not on
  anything in the source. `tsc -b` passes. Running `npm run lint && npm run
  build` on the Mac is the first thing to do.
- **The colour under the world's own light.** The previews use a hard key from
  the front; the scene's sun comes from behind and to the right of the rider,
  which is exactly the half a visitor astern is looking at.
- **The tri count against the frame budget.** 19k triangles, one draw call, one
  material — in the same order as `mine.glb` at 381 kB, but that one does not
  move.

### Needs Seb

- **Whether the face is worth it at all.** The camera sits astern and never
  yaws, so a visitor sees the back of this man's head for the whole session. The
  face is about 900 triangles and it exists for the model, the previews, and any
  future shot that is not from behind.
- **Whether the crouch is deep enough.** It is deeper than the procedural
  rider's and it was judged against a board drawn in Blender, not against a
  board moving on real water.
- **The board's new colours against this sea.** Lime and magenta were read off
  the reference, not chosen for a golden-hour sun on blue water.

## The sky and the sea — the reference palette, and the cut into the world

Two passes. The first repainted the landing page from a reference frame Seb
supplied — a tropical evening, saturated — and carried the world's shader
constants with it. The second brought the world's *sky* to the landing page's
and took the step out of the cut between them.

### The palette

`--sky` and `--water` in `index.css` and the eight constants at the top of
`Scenery.tsx` are the same three colours: **#1a68a8** overhead, a pale band
under it, **#f9c884** on the waterline, over water that runs turquoise at the
horizon. The shader's copies are those sRGB values pushed back through the
ACES curve, which is why `HAZE_WARM` is 2.77 in red — gold that survives tone
mapping has to go in hotter than it comes out.

The sun did not move. It is still low and over the visitor's left shoulder, so
the world's frame is still the anti-solar half of the sky, and the way the gold
got round to it is `WARM_FLOOR = 0.92`: the horizon is warm everywhere and a
hair warmer to port, rather than warm on one side and a fog bank on the other.
`sky()` also stopped spending half its vertical travel above the top edge of the
frame — `SKY_TOP` is the sine of the highest elevation the camera can see, 10.73
degrees, and the whole gradient is compressed into it. That is what took the
world from pale to the landing page's blue.

### What it cost elsewhere

- The world's water is much brighter than it was, and the HUD's pale cyan read
  1.2:1 on it. The readout and the footer under it turn over to ink (`#04343a`),
  the same move `.landing .foot` makes on the sand.
- The hero: worst case across the block, measured off a rendered frame, is
  **3.4:1 for the display size and 4.6:1 for the lede** — above AA for each, and
  better than the 4.2:1 the lede had before. The `.hero` text-shadow is two
  shadows now, for the glint crossing that band.

### The cut

Three things were moving that should not have been.

1. **The camera swooped in.** `snap` was only set by the deep-link effect, so
   entering `/{lang}/world` with no slug left the camera wherever `Scene` had
   parked it — off to one side — chasing its mark with a lag of 3.5 for about a
   second. It now starts true, and `Scene`'s initial camera is the settled
   position, so frame one is the frame.
2. **The horizon sat at a different height per craft.** `_cam.y` subtracted
   `hover` for the saucer and not for anything that floats, so the camera was
   1.5 over a saucer and 2.4 over a boat — 11.8 degrees of pitch against 18.4,
   and the horizon a tenth of the way down the frame instead of a quarter. The
   craft is remembered between visits, so anyone who had once picked the boat
   got a different world every time. Subtracted for all three now. **This lowers
   the boat's and the surfer's camera by 0.9 and is a framing change; it wants
   Seb's eye on real water, particularly with the agitated sea's rollers.**
3. **`--horizon` was a round 25dvh.** It is `atan(1.5 / 7.2)` against the 45
   degree field of view — 24.85% — and the media query for `AIM_DOWN` is the
   same sum, 5.57%. A dev assert beside `CAM_OFFSET` recomputes it and shouts if
   the offset moves, since the other two copies live in another file and in CSS.

The water layer is also drawn 1px taller than its gap so it runs up behind the
sky. `--horizon` lands mid-pixel at most window heights, and without the overlap
that fractional row is the sky at partial alpha over `--deep` — a dark hairline
along the horizon.

Measured on a headless render of the last frame of the flight against the first
frame of the world: **identical from the waterline down to 40% of the water**,
and within about 20 levels per channel in the sky above it.

### Not verified

- **Nothing has been seen in the browser**, and the world's frame has never been
  rendered — the palette was fitted against an offline model of `sky()`, the
  water and the ACES curve, validated by reproducing the gradient the original
  was sampled from. It is a model, not a frame. `npm run lint && npm run build`
  on the Mac is still the first thing to do.
- **The foam and the spray against the brighter sea.** Both are near-white on
  what is now bright turquoise rather than dark blue-grey.
- **The bottom edge of the frame at the cut.** The two seas part below 40% by
  design — the landing page's darkens for the headline, the world's opens out —
  so the very bottom of the frame still steps, behind a vignette that is three
  quarters closed and a shore flying past. Closing it means either a lighter
  landing page or a darker world.

## The isle — an island that is not a project

The world had three islands, all of them 17 metres across, all of them flat, and
all of them a project. From the water it read as three rocks in an empty sea:
the camera never yaws, so every frame looks down -Z, and there was nothing out
there. This is what is out there now — a tropical island at human scale, 70
metres of coast, a 13 m ridge, thirty-eight palm trees, and no case study.

The reference was an illustration: a surfer inside a wave at golden hour, palms
on a beach behind him. What was taken from it is the light and the palette, not
the picture.

### It carries no project, and that is a second list in the world

A landmark here *is* a project — `src/content.ts` reads `content/projects/*.mdx`,
`react-router.config.ts` prerenders one route per slug, and `/work` lists them.
An island with palm trees on it has no year, no stack and no case study, and
giving it a fake one to get a coastline would have put it in the index beside
three real ones.

So `src/isles.ts` is a second list beside `LANDMARKS`: islands that are places.
They have ground, a coastline, a mooring circle and a lagoon; they have no slug,
no panel, no URL and no row on `/work`. `overWater`, `offshore` and the shoal
damping all read both lists. Nothing else in the world learned a new concept —
`Scene` mounts `<Isle />` and passes it nothing.

**This bends invariant 7** ("content is data — never new scene components"). The
invariant is about *projects*, and it holds for them: a fourth project is still
one MDX file. But an island that is scenery is a new component, and that is the
first time anything in this world has been added to the scene without being
added to the content. Written here rather than done quietly.

`isles.ts` and not `isle.ts`, because `Isle.tsx` sits beside it and macOS cannot
tell the two apart — the same trap `Scenery.tsx` is named around, and this time
TypeScript caught it rather than a blank screen.

### One height function, a mesh and a flight controller

`isleHeight(isle, x, z)` is the island: a beach berm, an apron, a jungle slope,
a squeezed-axis ridge, gullies as a multiplier that vanishes at the waterline,
and a lagoon shelf that drops away to the seabed. `Isle.tsx` evaluates it on a
polar grid to build the mesh. `Ship.tsx` evaluates it to know where the ground
is. It is the rule the water and the hull already live by — one function, two
readers — and for the same reason: two surfaces that merely agree will stop.

`node src/isles.check.ts` asserts the parts a screenshot cannot: the ground is
exactly zero at the coastline the hull is pushed out of, land is above water on
one side of it and sea below on the other, the profile climbs monotonically the
whole way in (a dip is a hole the saucer would dive into), the summit is where
the ridge says, along the ridge is 2.5 m higher than across it, and `ground()`
is sea level everywhere else in the world.

The rings of the mesh are spaced by hand, not evenly: the ground does everything
interesting in the twenty metres either side of the waterline, so that is where
they are. 152 segments, ~14k triangles, no heightmap and no asset.

### The saucer follows the ground now

`GROUND` in `world.ts` says a taller island is one the saucer flies through, and
that raising it means teaching `Ship` to follow the ground first. That is done.

`ride` — the value the camera has always followed for a hull — is now the land
under the saucer, lagged by `FOLLOW` (3.2, about a third of a second). Two
details make it a change nobody can see anywhere except on the isle:

1. It is measured **above `GROUND`**, not above the water: `max(0, ground - 0.45)`.
   The saucer has always flown 0.9 over the sea and 0.45 over a landmark's flat
   plateau, and both of those frames are bit-for-bit what they were. Only ground
   *higher than a plateau* moves it, and the only ground higher than a plateau
   is this ridge.
2. The camera's two lagged copies now serve every craft: `alt + camY - hover`.
   A hull holds `alt` at zero, the saucer held `camY` at zero until there was a
   hill, so the sum is what both of them always were — one expression instead of
   a branch.

A lag and not a spring, deliberately: the one thing worse than flying through a
hill is bouncing over it. Reduced motion snaps instead of lagging.

### And it flies over the ridge rather than through it

One height query a frame under the centre of the hull was not enough of one, and
flying the isle showed it: the saucer clipped into the island, worst on the
jungle slope and the ridge, worst again under boost. Three things were wrong,
and each is one number or one line in `Ship.tsx`:

1. **One sample, for a disc two metres across.** A ridge flank is steeper than
   1:1, so 90 cm of clearance under the centre is the uphill rim already buried.
   `clearance()` now reads the ground at five points — four at `FEEL` (2.2 m)
   round the hull, one at `LOOK` (0.35 s) along its own velocity — and takes the
   highest. The look-ahead is deliberately the same third of a second `FOLLOW`
   lags by: the climb starts as the slope arrives instead of once it is inside.
2. **The lag was symmetric.** A slope met at boost is ~10 m/s of terrain coming
   up, and a third of a second of that is three metres of hull inside the hill.
   Rising now uses `RISE` (10, about a tenth of a second) and sinking still uses
   `FOLLOW`. Still a lag, still nothing to bounce on — the fast direction is the
   one that moves *away* from the ground, so the asymmetry can only remove
   overshoot.
3. **The clearance itself was a plateau's.** Over land the saucer now flies
   `CLEAR` (1.4 m) higher than the ground it is reading, smoothstepped in over
   the first `CLEAR_IN` (2.5 m) of land so the beach is a climb and not a step.

Measured by simulating the controller over `ground()` — straight passes on 36
headings across every offset of the island, at cruise and at boost, checking the
whole rim of the hull rather than its centre. Worst clearance under the hull was
**-4.1 m at cruise and -6.2 m at boost** (that is 6 m of saucer inside the
island); it is now **+0.45 m** at both. Over the summit the saucer sits 2.2 m up
instead of 0.45 m.

Sea level and the three plateaus are untouched by construction: `ground()` is
sea level everywhere but the isle, `clearance()` is measured above `GROUND`, and
every term of it is zero when there is no land — so the frames that shipped are
still arithmetically the frames that shipped.

### The lagoon, and the surf on the beach

The water gained two terms, and they apply to **all four islands**, so this is a
change to the committed look of the three that were already there:

- **Shallows.** `LAGOONS` in `world.ts` is each island's own coastline (not the
  wider circle the swell is sheltered inside — turquoise starting eight metres
  offshore is a ring, not a lagoon), and the water's body colour ramps to
  turquoise and then to pale aqua across a third of that radius. Proportional
  and not a fixed width, or a 9 m rock wears the same skirt as a 70 m island and
  the world loses its sense of scale in the one place it is trying to show it.
- **Surf.** The last few metres of every shore break white, on a slow beat
  running along the coast, torn up by the same noise the whitecaps use. In both
  sea states, because a calm sea still breaks on sand.

### The palms

`tools/palm.py` — the second model file in this world, and the second argument
for one. A palm is a curve with a hundred and forty leaflets hung off it, each a
quad at its own angle; the same case `surfer.py` makes about a person. Built
once it costs bytes, built in `Isle.tsx` it costs bytes *and* a frame budget on
something that never changes and is drawn thirty-eight times.

It exports a library rather than a landmark: three palms (old and leaning, 11.6 m;
upright, 8.9 m; young, 6.1 m), a fern clump and a boulder, each at its own
origin. 6.2k triangles, 262 kB. `landmark.py` gained three material keys —
`bark`, `frond`, `bush` — read by `Isle.tsx` the way `Landmarks.tsx` reads the
other five.

`Isle.tsx` plants them by rejection sampling against `isleHeight`: palms between
0.8 and 9.4 m and off anything steeper than 33 degrees, turned so their lean
faces the water; ferns higher and on steeper ground; boulders at the waterline
where the surf breaks on them and a few on the ridge they came from. One
`InstancedMesh` per part, eight draw calls, matrices written once on mount.
Deterministic — the island is the same island on every load.

Three numbers were found by rendering rather than by thinking: leaflets at
18 stations and half a spacing wide (at 11 and a third of that, a frond is a
fish bone); a boulder's origin at 0.40 and not 0.62, which is where `lump`'s
flattened underside actually lands after scaling — at 0.62 twenty-six boulders
floated up the hillside; and an edge split at 62 degrees rather than the
landmarks' 34, which was turning every boulder into a cut gemstone.

### Where it is, and what it is not on

`[-52, -58]`, 78 units from the world's origin — beyond the mine, in the half of
the frame the camera looks into, and clear of every mooring circle by more than
its own radius (asserted in dev). From the spawn point it is a headland filling
the top-left; from the mine it is the horizon.

**It is not on the map.** The minimap is bounded by the projects, and fitting an
island four times the size of everything on it would have shrunk every project
target from 38% of the box to 15% — on a phone, a 24 px circle with a letter in
it. The map is the project index and invariant 5's fallback; the isle is not a
project. Sailing out to it pins the arrow at the edge, which is what the map
already does for anything flown past. Reversible in four lines if it reads as
lost rather than as *out that way*.

### Verified

- `npx tsc -b`, `node src/isles.check.ts`, `node src/i18n/locales.check.ts`.
- A real `npm install && npm run build` on a throwaway copy in the cloud
  container: builds and prerenders. **Canvas chunk 444 kB gz** against the
  600 kB budget, first-route JS ~127 kB gz against 200 kB, models 1.2 MB
  uncompressed against the 3 MB world budget.
- Rendered in headless Chromium on swiftshader (WebGL2 backend) from the spawn
  point, from the lagoon, from the beach and from the summit — which is how the
  floating boulders and the fish-bone fronds were found.

### Not verified — Seb's eye

- **Frame rate.** Swiftshader has no opinion about it, and this adds ~90k
  triangles in eight instanced draw calls plus a 14k-triangle terrain mesh. If
  it costs, the cheap cuts in order are: ferns 110 → 60, palms 38 → 24, terrain
  segments 152 → 112.
- **The turquoise on the three project islands.** They were never meant to have
  lagoons and now do. It suits them; it is still a change to a committed look.
- **The isle from the spawn point.** It is large and close to the left edge on a
  16:9 frame. `pos` is one line in `src/isles.ts`.
- **The saucer over the ridge**, which is the one place the new flight code can
  look wrong, and the one place `FOLLOW` can feel slow or floaty.
- **The palms and the water at real scale.** Everything here is metres against a
  1.8 m rider: 12 m trunks, a 13 m ridge, 70 m of beach. Whether the world still
  reads at that scale beside three 17 m islands is a judgement, not a number.

## The camera turns — it stays astern of the heading now

Phase 0's "fixed-offset follow camera" is gone, and with it the sentence that
had been load-bearing in five files: *the camera never yaws*. It sits the same
7.2 back and 1.5 up, and it swings round the hull to stay behind whichever way
the hull is pointed.

**The one number that did not change is the pitch.** Swinging round changes the
bearing and not the 7.2 or the 1.5, so `atan(1.5 / 7.2)` is still 11.77 degrees
at every heading, the horizon is still 24.85% down the frame, and `--horizon` in
`index.css`, `SKY_TOP` in `Scenery.tsx` and the dev assert in `Ship.tsx` are all
untouched. The cut from the landing page still does not step.

### Steering moved with it, and that closes a loop

`move` is read against where the camera points rather than against the world:
forward is into the frame and right is right, at every heading. That is the loop
the fixed camera existed to avoid — steer left, the ship turns, the camera comes
round, and *left* is somewhere else — and it is now a bounded thing rather than
an avoided one. `CAM_SWING_MAX` caps the camera at 0.9 rad/s, so the worst a
sustained sideways push can do is carve: seven seconds a revolution, a circle
8.3 units in radius at cruise and 20 at full boost. Simulated against the real
flight constants, a full-right hold settles 77 degrees off the camera's bearing
and comes round at exactly the cap; W holds the camera dead astern. Tapped, it turns and settles;
`CAM_SWING` is 2.6, about a third of a second of lag.

The arithmetic — the screen-to-world basis and the capped swing — is `src/camera.ts`,
its own module importing nothing, and `node src/camera.check.ts` asserts the
things a screenshot cannot show: that forward is the camera's own bearing and
right is starboard at eight headings, that a push keeps its length, that the
swing takes the short way round without overshooting, and that a full-left hold
turns the camera at exactly the cap and no faster.

### Three things it changed that were not asked for

- **The ship spawns pointed the other way.** `yaw` starts at pi rather than 0.
  It has to: the camera is astern of the heading, and a hull spawned at 0 would
  put the camera on the far side of the world looking at empty sea. Pi is the
  heading every visitor has flown on every frame — forward is -z — so the camera
  lands exactly where `Scene.tsx` parks it and the frame is the one the landing
  page already cut to, with the stern of the craft in it rather than the bow.
  The first press of W no longer spins the hull through 180 degrees to start
  moving, which was a Phase 0 oddity nobody had written down.
- **A deep link now centres its landmark.** Arriving parks the ship facing the
  thing it named, and the camera is behind the ship, so the landmark is dead
  ahead instead of three quarters across the frame. `world.ts` still asserts
  `pos[2] < waypoint[2]` and `pos[0] > waypoint[0]` — they still fix which side
  the world is approached from, which is the composition the sun was swung for —
  but the second one no longer decides which half of the frame anything lands
  in. **Whether a centred landmark reads well against a panel down the left is
  Seb's eye, not an assert.** Every waypoint is one line of frontmatter.
- **The landmarks' approach shader stopped reading the camera.** It recovered
  the ship's position by subtracting a constant `CAM_OFFSET` from
  `cameraPosition`, which stops being a constant the moment the camera turns.
  `Ship.tsx` publishes `SHIP_XZ`, a uniform written in the same block as `SHIP`,
  and `Landmarks.tsx` measures from that — the hull's own position, which is
  what the subtraction was reconstructing all along.

Under `prefers-reduced-motion` the camera still comes round and takes four times
as long about it — `CAM_SWING` 0.7, capped at 0.22 rad/s (invariant 6). A
rotating world is the one thing on this page that can make somebody ill, and the
alternative — no rotation at all for those visitors — would have left them
steering against a camera that no longer agrees with the ship.

### Verified

- `npx tsc -b`, `node src/camera.check.ts`, `node src/i18n/locales.check.ts`,
  `node src/stick.check.ts`.

### Not verified — Seb's eye

- **The feel of the carve.** 0.9 rad/s and 2.6 of lag are two numbers in
  `Ship.tsx` and they were chosen by arithmetic, not by flying. A held sideways
  push circling is deliberate; whether the circle is the right size is a thumb's
  judgement and a thumb's alone.
- **Where a deep-linked landmark now sits against the panel**, above.
- **The world's composition off-axis.** The sun is at -z and the islands were
  laid out for a camera that only ever looked that way. Flying north now turns
  the frame round to face an empty sea and an anti-solar sky, which is a view of
  this world nobody has ever had.

## The rider moves — seventeen bones, and the legs do the work

The skin was finished and the man was still a figurine. Everything under him
already moved — the swell, the bank, the three metres of air off a roller — and
he held one crouch through all of it, which made him *more* wrong the better the
water got. He is rigged now, and what bends him is the physics that was already
there.

### The rest pose is the shipped model, to the vertex

`tools/surfer.py` grew an armature and skin weights. Every bone is two points
that were already in the pose list the metaballs were laid along — `HIP_F` to
`KNEE_F`, `CHEST` to `NECK` — so the rig is that list read a second time rather
than an anatomy invented beside it. Deepening the crouch is still moving a
point, and the rig follows it.

The runtime writes rotations *relative* to rest, so with no input every sum is
zero and every vertex is where Blender put it. That is the property that made
this safe to do at all, and it is also what made the arms fixable later by
moving four points rather than by fighting the runtime.

Seventeen bones: hips, spine, chest, neck, head, three a side in the arms and
three a side in the legs. No clavicle, no forearm twist, no toe. A figure whose
whole screen presence is ninety pixels of back does not spend a joint on a
collarbone.

Weights were Blender's bone heat and are not any more, and the reason is the
arms. With them out wide, heat worked on the first try and left nothing
unweighted. With them **down**, hanging five centimetres off the thighs they
pass, it refuses outright: heat shoots rays from each bone and takes what it can
see, and a forearm and a thigh that close can each see the other. It reports
that as a *warning* on one bone and a cancelled operator — never an exception —
and leaves the whole mesh with no group at all, which at runtime is not a soft
failure but every unweighted vertex pinned to the origin.

So the count is the test rather than the return code, and more than a stray
vertex throws the result away and runs `diffuse` instead. Half a mesh weighted
one way and half the other is a seam down the middle.

`diffuse` is two steps. Every vertex claims the bone whose *segment* it is
nearest, at weight 1 — correct and completely unusable, a paper doll with a
crease at every boundary. Then those weights are averaged with their neighbours'
along the mesh's own edges, twenty-six times, which turns every step into a ramp
about eight centimetres wide. It comes out at 2.87 bones a vertex, trimmed to
glTF's four and renormalised.

Diffusing along *edges* rather than through space is the whole point, and it is
exactly the thing that defeated heat: a forearm is five centimetres from the
thigh beside it and half a metre away across the surface — up the arm, over the
shoulder, down the torso, along the leg. Weights cannot cross that gap, so the
arm keeps its own and no solver has to decide. Its weakness is this model's
shape.

The hair and the seven face parts are given to neither: a curl and an eyeball
belong wholly to the head, and one group at weight 1 says so faster and better
than an opinion about a sphere floating inside a skull. Rigged before the join,
so joining merges the groups by name and what comes out is one skin with one set
of weights.

`python3 tools/surfer.py --render out.png --flex` is new: it renders a stress
pose rather than the rest pose, because the rest pose is the one pose that
cannot tell you whether the skinning works.

### The hull's attitude arrives split in three, and that is the whole design

The first pass rigged him and he was still stiff, and the reason was structural
rather than a matter of amplitudes. The rider is a child of `body` — the group
that carries the hull's bank, its pitch and the swell — so a board heeled thirty
degrees to a wave face rolled the whole man thirty degrees with it, head
included, before a single bone moved. Bones on top of that are a figurine with
joints.

A surfer is a suspension unit with a person balanced on top. So the frame loop
now names the three things that make up `body.rotation` instead of writing them
straight in, and the rider owes each one a different answer:

| | | |
|---|---|---|
| `tilt`, `slope` | what the **water** is doing to the deck (`roll`, `heel`) | stand up against it |
| `bank` | what the **craft** is doing — the bounce spring's lean into a turn | mostly go with it |
| `heave` | the deck's vertical acceleration, over `SHOCK` = 25 | get shorter |

Against `tilt` the joints sum to **0.95** — 0.58 at the hips, then 0.18, 0.11,
0.03, 0.05 up the spine — so nearly all of the wave's heel is subtracted back
out and the torso stands where the horizon is. Not all of it: a rider who
cancelled the deck exactly would be a gimbal, and the twentieth left over is the
wave still reaching him. Against `bank` the same joints sum to **0.34**, which
is the other half of the idea — a third of the carve resisted, two thirds
ridden, because a rider who stood upright through a turn would read as a
passenger.

And it pays for itself twice, because both ankles are nailed to the deck. The
pelvis cannot rotate without one hip rising and the other dropping, which is one
leg extending and one folding, with no line of code saying so. That is the whole
reason the legs are worth a solver, and it is what "the legs absorb the wave"
actually is here.

`heave` is the same idea one derivative up and it is what keeps the knees
working in ordinary chop rather than only on a landing. All five of the
attitude terms are multiplied by `1 - air`: off the water there is nothing to
brace against, and a man holding himself level against a board that is no longer
on anything is a man doing arithmetic.

Measured, in the headless pass below: a deck heeled **17.2deg** in chop leaves the
neck axis at **-2.5deg** off vertical, against **12.8deg** for a rigid rider. On a
**37deg** face it is **-11.8deg** against **32.8deg**. Through a full carve he leans
**less** than his own board.

### No clip, no mixer, no animation in the glb

`export_animations` is still `False`. What the rider does is a sum of eight
numbers the flight controller writes every frame — the four attitude terms
above, plus `speed`, `turn` (the heading's rate over `CARVE` = 2.2 rad/s), `air`
and `slam` (the landing impact, spent linearly over about a third of a second).

So he is *reacting* and not playing back. He folds on a landing because the hull
just took an impact, and a wave nobody has ridden before is ridden correctly the
first time. It is the same argument the shaders make about generic noise: the
motion derives from what the thing does.

They are smoothed once, where they are written, at `REACT` = 9 — about 110 ms,
which is a person's reaction time. A body's lag is one lag and not seventeen,
and here that lag is doing real work: the board snaps to the wave and the man
arrives a tenth of a second later, which is most of what absorbing a shock looks
like from outside.

### Two mechanisms, because a foot is not a hand

**The upper body is forward kinematics.** Hips, spine, chest, neck, head and both
arms are told how far to rotate about board space's own axes, and their children
come with them. That is right for a limb whose end is in the air.

What is left after the subtraction is deliberately quiet — about a third of the
first pass's `turn` amplitudes in the spine and chest. With the legs carrying
the sea, a torso that also swings reads as loose rather than as balanced. The
head is the exception and still leads the turn at 0.22, because it is the cue
that most reliably reads as alive at this size.

### The arms came down, and the raise became a gesture

The first two passes left the arms out wide, because that is how the model was
sculpted: leading one low over the rail, trailing one high. That is a
*photograph* of a surfer — the frame a photographer waits for — and held
permanently by a figure that now moves, it read as a man stuck mid-gesture,
which is what it was. No amplitude fixes a rest pose.

So the arm points moved in `tools/surfer.py`: both arms hang, elbows well
outboard of the knees, the leading hand carrying on forward past the front knee
and the trailing one down past the hip. Hands went from |x| 0.70-0.78 to
0.46-0.49 and the figure from 1.39 units across to 1.01. The old note in that
file was right that a body this size head-on is a post — the answer is just no
longer width held forever. It is width that arrives when the board changes
direction.

**Both elbows fold forward,** and that took a second pass. The first arms-down
attempt sent the trailing forearm *aft*, chasing the idea that a trailing hand
belongs past the back knee — which is a joint bending the wrong way, and the one
anatomical error a viewer spots instantly without being able to name it. An
elbow has one direction. The forearm now comes forward and down past the hip at
about fifty degrees off straight, matching the leading arm's sixty, and the
clearances that keep each forearm from welding itself to the thigh it passes are
written out beside the points: nothing closer than 25 cm, against about 20 cm of
metaball field.

Which arm rises is the part worth stating precisely, because it is the request
and it is easy to get backwards. **It is the arm on the outside of the circle**:
turning to the visitor's right the rider throws up his left, turning left his
right, while the inside hand drops toward the face. `side` is +1 for the leading
arm, which is his left because the model faces its open side; the camera sits
astern looking down +z, so the visitor's right is the world's -x and a turn that
way runs the heading negative. `Math.max(0, -c * side)` is therefore positive
for exactly the arm that should rise, on both sides, with one expression and no
branch — and zero for the other, which is left to a small shared roll that drops
it.

0.55 of shoulder, about thirty-five degrees, with the elbow folding 0.30 and the
arm swinging forward as it goes: an arm thrown up rather than levitated. There
is still no `bank` term on the arms — the chest has already handed them two
thirds of the carve, and a fourth counter-rotation on the end of the longest
lever in the silhouette was the single thing that read as flailing.

**The legs are inverse kinematics,** because a foot is not in the air. `Ship.tsx`
builds the board and `tools/surfer.py` puts the soles against it, so both ankles
are *constants in board space* and the only honest way to move the hips is to
solve the knees for them. Two bones to a fixed target has a closed form — one
triangle, no iteration, no solver — and it is what turns every counter-rotation
above into a leg that bends.

The knee's plane comes from the rest pose's own knee offset, which is what makes
the solve exact at rest, and the reach is clamped a millimetre short of straight
so a nearly-extended leg has a plane left to bend in. That millimetre is the
difference between a knee and the classic pop.

`prefers-reduced-motion` switches off the idle layer — breath, a weight shift, a
drift of the head, the hands riding the air, four sines at rates that share no
common multiple — and nothing else. Everything else is a response to something
the visitor did or something the sea did, and stopping *those* would be a rider
who ignores the wave.

### What changed in `Ship.tsx`

- `RIDE`, module-local beside `SHIP` and not exported, because only `Surfer`
  reads it. Written for every craft rather than only the surfer: they are facts
  about the hull, the branch would save a few multiplies, and a value that only
  updates while you are looking at it jumps the moment you switch craft.
- `bank` and `nose` are named before they are used, so `body.rotation.z` is now
  `bank + roll` rather than a clamp inline. Same value, and the two halves are
  separable, which is the only reason the rider can answer them differently.
- `Rider` stopped flattening the model. Every landmark is flattened with its
  transform baked in; this one cannot be, because the hierarchy *is* the
  skeleton.
- The outline is a second `SkinnedMesh` on the **same geometry and the same
  skeleton** — one set of bone matrices, computed once, read by both draws. It
  is added beside the rider so the two share a parent and a bind matrix, and
  `renderOrder` keeps the ordering the two JSX meshes used to carry.
- `OUTLINE.positionNode` did not change and did not need to.
  `NodeMaterial.setupPosition` runs the skinning node *before* it reads
  `positionNode`, and the skinning node assigns into `positionLocal` and
  `normalLocal` themselves — so both names in that expression are already the
  deformed values, and the outline follows every bone. Worth writing down
  because it looks like luck and is not.
- Both meshes are `frustumCulled = false`. A bounding sphere measured in the
  rest pose is a sphere a posed rider can leave.

### Cost

- **`src/models/surfer.glb`: 264 kB gz -> 343 kB gz.** All of it is `JOINTS_0`
  and `WEIGHTS_0`. The last 20 kB of that is `diffuse` rather than bone heat:
  2.87 bones a vertex is more non-zero weights, and they compress less well. The joints are already `UNSIGNED_BYTE`;
  the weights are `FLOAT` and Blender's exporter has no option to quantise them,
  so halving that would mean a post-process or meshopt — **a dependency, which
  is Seb's call and has not been taken.** Triangles, vertices and the whole
  colour pipeline are unchanged.
- **`src/Ship.tsx`: about 320 lines**, all of it below the material block.
- **Runtime: seventeen bone quaternions and one 4x4 a frame**, and only while
  the surfer is the craft being drawn. No allocation in the loop.

### Verified

- `npx tsc -b`, `npm run check`.
- **The rig solves back to its own rest pose.** A dev-only assert in `rigOf`
  runs the leg solver with the hips exactly where Blender left them and requires
  every bone to come back to the rotation it already has. It is the closed
  form's own identity, so a failure is a real one — a renamed chain, a bone that
  stopped being connected to its parent, a scale in the export. Measured
  0.019deg and 0.008deg against a 0.057deg threshold.
- **The soles do not move.** Eight drive states rendered in a headless Chromium
  in the container — rest, chop, a wave face, a turn each way, an easy turn,
  airborne, a landing, each with the deck actually heeled — and each foot bone
  measured in board space afterwards. 0.00 mm in every one.
- **The right arm goes up.** The same pass reports which hand is higher in
  world space: turning left it is his right (0.91 against 0.14), turning right
  it is his left (0.63 against 0.12). At rest they are 0.53 and 0.42, both at
  hip height. The two directions are now within five centimetres of being each
  other's mirror, which they were not before the elbow was fixed — the trailing
  arm's bad fold was worth 28 cm of asymmetry.
- **The absorption is real, not a look.** The neck-axis numbers above, against
  what a rigid rider would give in the same state.
- **The skinning holds at the extremes.** `--flex` renders every joint bent well
  past anything the runtime asks for: no shear at the shoulder, no collapse at
  the waist, hair and face riding the head.

### Not verified

- **Nothing has run under WebGPU.** The container's pass is WebGL with a
  stand-in material, which proves the bones and not the pipeline. The two things
  it cannot see are whether the skinned outline really does track the pose in
  TSL — the reasoning above says it must — and what skinning costs the frame
  rate on real hardware.
- **Nothing has run in motion.** Every number here was chosen against a still
  frame, and absorption is a thing you judge by watching, not by looking.

### Needs Seb

- **The two gains, 0.95 and 0.34.** They are the whole design and they are two
  lines' worth of constants spread over five joints. If he still reads as stiff
  the first is too low; if he reads as a gyroscope on a stick it is too high.
- **`SHOCK` = 25 and `CARVE` = 2.2.** They decide how much of the range ordinary
  water and an ordinary turn actually use, which is a thing only sailing it can
  say.
- **The sign of `push`.** Leaning back under power is the guess; it is one minus
  sign and it is a screenshot question, not an arithmetic one.
- **Whether the idle layer is felt or noticed.** It is meant to be the first and
  never the second.
- **The lift at 0.55, and the rest pose it lifts from.** The arms are down now
  and the gesture is the only thing putting width back in the silhouette, so
  these two numbers trade against each other and only motion can settle them.
- **The 82 kB gz**, and whether it is worth a quantisation dependency.

## The beach — the surfer gets off and walks

The isle was a wall with a beach painted on it. `offshore` pushes anything that
floats back onto the water at the coastline, which is right for a boat — it has
nowhere to go once the water runs out — and which meant the one craft in this
world whose vehicle is *portable* was stopped at the sand like the others.

He crosses now. Ride onto the beach and the board comes up under his arm and he
walks; walk back into the sea and he is riding again. It is one number,
`RIDE.land`, 0 on the board and 1 on foot, ramped over 1.25 s at a constant
rate rather than eased — a change of mode is a thing that finishes — and it runs
both ways, so **putting the board down is picking it up backwards** and the
return transition is not a second piece of code.

### What decides it is the ground, and that is why nothing else moved

The trigger is `ground(x, z)` between 6 cm and 34 cm, which is the first metre
of sand above the waterline. `ground()` is sea level everywhere but the isle, so
the boat, the saucer and every frame in open water read this and get zero: the
whole feature is arithmetically invisible to the two craft and the three
islands it does not concern. It is also why the crossing is not a step —
`isles.check.ts` already asserts the ground is zero at the coastline to a
millionth, and `shoal()` already damps the rollers to nothing there, so both
sides of the blend are near zero at the moment it starts.

The landmark islands are *not* his to walk on, and `offshore` grew one optional
argument to say so. Arriving alongside one is what opens its panel, and their
mooring circles are nearly twice the radius that does it, so walking up the mine
would be a hull inside a trigger the world was laid out to keep it outside of.

### Three things happen at once, and none of them is a state machine

- **The craft.** Speed blends from 1.18 to 0.24 of `SPEED`, `offshore` stops
  pushing him off the isle, the buoyancy spring keeps running underneath (he is
  going back to it) and the altitude blends from the swell to `ground()` minus
  16 cm. The water's heel, its pitch and its vertical throw fade out with the
  same number; the splash stops firing.
- **The board.** Its four meshes moved into a group of their own and the rider
  came out of it — a man parented to the thing he is carrying is a man who
  cannot put it down. The group lerps to `CARRY_POS` on a curve that *lags the
  crouch*, so the dip is him reaching for it rather than a board that rose on
  its own, with a hand's width of arc through the middle so it leaves the sand.
- **The man.** `pick`, one sine over the whole ramp, folds him over it — hips,
  spine, chest, neck, head and both arms — and the walk fades in behind it.

`CARRY_ROT` is the one number chosen against the camera rather than against the
model. The camera sits astern and never yaws, so a board carried along the
heading is 2.3 units of board seen end-on, hidden behind its own rider. A
quarter radian of yaw and an eighth of pitch put it diagonally across the frame,
which is where it reads and is also how anybody carries one.

The carry cost the arms very little pose of their own, and that is luck worth
recording: the model faces +z, so `armB` at x -0.09 is his **right** arm, and
the arms-down rest pose already hangs that elbow at very nearly the height and
the offset a board's outer rail wants. It took one number — 0.20 of inward
roll — to put the elbow *on* the rail rather than 12 cm outboard of it. The
pose was almost the pose; it mostly had to be given something to hold.

Both carry numbers were then measured rather than guessed, by replaying the
bone math on the glb's own hierarchy: the board's inner face lands at x -0.160,
against his hip, its outer face at -0.295, his elbow at -0.292 — on it — and his
hand 4.6 cm outboard of it. Move `CARRY_POS.x` and the 0.20 moves with it.

The leading arm needed the opposite. Its rest pose puts the hand 0.40 forward of
its own shoulder and 0.24 outboard, which is an arm reaching over the rail — a
surfer's arm, and on a walking man an arm held out at nothing. It comes back and
in (0.30 each) before it starts swinging at all.

### The finding: the two legs are not the same length

This is the important paragraph and it is not about the beach.

`tools/surfer.py` sculpts the front leg with a 0.498 thigh and a 0.287 shin —
0.785 of reach — and the back leg with a **0.238 thigh** and a 0.273 shin, which
is 0.511. The back thigh is a little under half the front one. Standing in the
surf crouch the back leg is already at **87% of its own reach**; the front one
is at 68%.

Nothing on a board ever straightens either leg, which is why it has never shown
in a screenshot or in the `--flex` render. A stride is the first thing that
asks, and it asks immediately: the first pass dropped both soles 16 cm to put
them on the sand, which needs 0.56 out of a leg that has 0.51, and the solver
clamped every frame — which on screen is a man skating.

What the walk does about it:

- **The 16 cm comes out of the craft's altitude, not out of his feet.** Dropping
  what he stands on asks nothing of either leg. This is the load-bearing
  decision and everything else is sized after it.
- **Each foot swings about the point under its own hip** (`Leg.sweep`, read off
  the model). That is the cheapest place along the board for each leg, and
  because the two hips are 12 cm apart it also produces the stagger a walking
  stance has, without a number for it.
- **`STRIDE_MAX` is 0.15**, a 30 cm step, which puts the back leg at 89% at the
  end of its swing against `reach`'s own clamp at 99.8%. It is a short step and
  it is the longest one this rig can take.
- **He does not stand up out of the crouch.** There is no `STAND` term, because
  the back leg has 13% of its reach left and standing spends all of it. He walks
  in the stance he surfs in.
- **`TERRAIN_DOWN` is 4 cm against `TERRAIN_UP`'s 18.** He can lift a foot onto
  a step and he cannot reach down into a hollow, for the same reason.

A dev assert in `rigOf` sweeps the whole cycle at `STRIDE_MAX`, with the lift
and the downhill clamp on, and requires both legs to stay under 97% — measured
55% and 89%. It exists because all five numbers above are measurements of *this
file*: fix the model and they are wrong in the safe direction, but a re-sculpt
that shortens something is a foot that slides, and a sliding foot reads as a bug
in the walk rather than as a limit of the rig.

**The fix is one point in `tools/surfer.py`.** `KNEE_B` at `(-0.21, 0.42,
-0.20)` is 0.238 from `HIP_B`; moving it to about 0.44 from the hip along the
same line gives the back leg a 0.72 reach and lets the stride roughly double,
the crouch stand up, and the walk stop being sized by an accident. It changes
the sculpted riding silhouette and it means rebuilding the model, so **it is
Seb's call and it has not been taken.**

### The knees needed one more thing

Both knees in the sculpted stance point *outward* — a surf crouch is a wide
stance, and `reach` takes the rest knee's own offset as its pole vector, which
is what makes the riding solve exact to the last decimal. Walking with an
outward pole is bow-legged. So `reach` grew a second optional argument and the
pole swings round to straight ahead with `RIDE.land`; at 0 it is `leg.pole`
unchanged, so nothing about riding moved.

### The walk itself

Distance drives the phase, not time — so a rider who stops stops mid-step, and
there is no way to moonwalk out of a halt. Speed buys stride first at a held
3.6 steps/s; past the stride's cap the rate rises instead, to `CADENCE_MAX` = 5;
past *that* the feet slide, which only happens under boost and is invisible at
90 pixels of back where legs going round like a cartoon's would not be.

On top of the feet: the pelvis turns with the stride and the shoulders
counter-rotate against it, the hips rise and fall twice a stride (lowest at
double support, where a real one is lowest) and sway over the standing leg, the
leading arm swings against its own leg — his left arm and his left leg, both on
the +x side — and the trailing arm keeps 8% of the swing because it is holding a
board. The hillside is read as two finite differences in the hull's own frame
and put into the feet, so the uphill foot is higher instead of both feet in the
slope.

### Cost

- **`src/Ship.tsx`: about 260 lines**, and `src/world.ts`: one optional
  argument and an `if`.
- **No new dependency, no new asset, no change to the model.**
- **Runtime: five height queries a frame, and only while he is on sand.** The
  four for the hillside plus the one for his altitude; `ground()`'s cheap reject
  is a squared distance against one circle. Nothing new is allocated.
- **Every other craft and every other frame is arithmetically unchanged** —
  `RIDE.land` is zero and every term it scales is a multiply by one or a branch
  not taken.

### Verified

- `npx tsc -b`, `npm run check`.
- **The walk fits inside the legs.** The dev assert above, and the same sweep
  run standalone against the bone positions read out of `surfer.glb` itself
  (not out of `tools/surfer.py`): front leg 17%–55%, back leg 30%–89%.
- **The bone lengths above are measured from the shipped `surfer.glb`**, by
  composing the node hierarchy out of the glTF JSON — not from the script that
  generated it.
- **The carry was measured the same way**, by replaying `bend()`'s arithmetic on
  that hierarchy and comparing the arm to the board's rotated volume. The four
  numbers are in the section above. It is geometry and not a render: it says the
  arm is on the board, not that the shot reads.
- **Invariant 6.** `prefers-reduced-motion` snaps the mode change instead of
  ramping it, which is the existing rule for transitions; the walk cycle itself
  is a response to movement the visitor asked for, so it stays.

### Not verified

- **Nothing has been looked at.** Not one frame of this has been rendered. Every
  number that is not a measurement of the model is reasoning about a shape, and
  the four that are pure judgement are `CARRY_POS`, `CARRY_ROT`, the 1.25 s and
  `WALK_SPEED`.
- **Nothing has run under WebGPU**, same as the rig.

### Needs Seb

- **Whether to fix the back thigh.** Everything cramped about the walk is
  downstream of it, and it is one point in a file. See the finding above.
- **`CARRY_POS` and `CARRY_ROT`.** Whether the board sits under the arm or
  through his hip, and whether a quarter radian of yaw is enough to read it as a
  board from astern. This is a screenshot question and it is the first one.
- **1.25 s, and where the crouch sits inside it.** The board starts rising at
  0.32 of the ramp and is settled at 0.94; if the pickup reads as him lifting a
  board that is already floating, the first number goes up.
- **`WALK_SPEED` = 0.24.** 70 m of island is about 40 seconds on foot and 16
  under boost. The isle carries no project, so walking it is a thing to enjoy
  rather than a thing to get through — but only sailing it says whether 40
  seconds is exploring or waiting.
- **Whether the walk reads at all at this size**, given the back leg. It may be
  that the bob, the arm and the lean carry it and nobody looks at the knees,
  which is what these amplitudes are betting on.

## The beach, second pass — the clip, the step and the jump

Three things asked for, and the first of them turned into four.

### He was walking through the island, and the fix is a floor

Riding onto the beach put the surfer *under* the sand for the whole change of
mode, and popped him out on top when the animation finished. The cause is one
line: the altitude was blended from the swell to the ground **weighted by the
ramp**, so the height arrived in step with the choreography — and the
choreography is 1.25 s long while the approach is nine units a second up a beach
that climbs 1.25 m in three.

It is a floor now and not a fade. The ground wins the frame it is higher,
which is the first frame of the change and not the last, and the ramp that is
left only ever runs the other way — walking back down into a sea that is by then
the higher of the two, where a quarter-second hand-off keeps him from being
dropped onto the water. Two asymmetries and both of them one-directional,
because the two directions are not the same problem.

The sand under his feet stopped being lagged upward at the same time. The
saucer's ground following is a pair of rates because it is a machine two metres
across holding a height over a hill; a sole is on the ground, the height field
is smooth already, and any lag going up is a foot inside it. Up exactly, down
lagged. The clipping is now zero by construction rather than small by tuning.

### `src/beach.ts` and `src/beach.check.ts`

The vertical came out of `Ship.tsx` into a module of its own, for exactly the
reason `isles.ts` is a module of its own: `Ship.tsx` imports three and TSL, node
can load neither, and this was a bug that *arithmetic could have caught and a
screenshot could not*. What moved is the ramp, the ground follow, the altitude
floor and the constants they read. What stayed is everything a check in node
could have no opinion about — the speed, the pose, the board and the walk cycle.

`beach.check.ts` rides a real approach onto the real isle: eight bearings, 120
Hz, from open water over the summit and out the far side, at a flat nine units a
second the whole way in — harsher than the craft, which is decelerating from the
moment the ramp starts. It asserts that the board's keel is never under the
sand, that the altitude never moves more than 25 cm in a frame (so that "never
under" is not bought with a jump cut), and that the mode change takes the 1.25 s
it says it does. It reports **0.0 cm into the sand, 8.7 cm the biggest step**.

### And then it found the isle's summit

The first run of that check failed at 44 cm — on the peak, at r = 0.0, with the
ground rising at 87 units a second.

The isle's gullies are an angular term: `0.075 · sin(4.3θ) · S(1, 0.45, u)`,
faded out at the waterline and at **full strength at the axis**. But `theta` is
undefined at r = 0 and flips by π across it, so the summit was not a summit — it
was **a four-lobed crown 2.1 m tall with a step down the middle of it**, at every
radius in to a millimetre of the centre. `Isle.tsx` draws its mesh from the same
function, so it has been drawing that crown; the saucer flies 1.4 m over it
behind a third of a second of lag, so it read as shape. Putting a man's own feet
on the ridge is what turned it into a 2.1 m teleport.

**This is a change to the isle's committed look, and it is small.** The gully
term now fades at the axis as well as at the coast, and it is subtractive where
it used to be signed — a term that *adds* height on some bearings makes the
profile rise on the way out of the axis fade, which is the terrace
`isles.check.ts` already refuses. So:

- The multiplier ran 0.925 to 1.075 and now runs 0.925 to 1.0. **The gullies are
  exactly as deep as they were; the spurs between them are gone**, flattened to
  the profile they were standing proud of.
- The island is about 4% lower on the flanks. Its summit *reads* 14.00 m where
  it read 13.15, because the peak is no longer whichever side of a crown θ = 0
  landed on.
- 0.075 is the most it can be. `isles.check.ts` rejects 0.10 and passes 0.075,
  and the flat spot it catches is at u 0.62, where the apron's smoothstep runs
  out of slope. That is a measured ceiling and not a taste.
- Every existing isle assert still passes, including the two this could have
  broken: the profile climbs the whole way in on every bearing, and the summit
  is at or under its own stated peak — 14.000 against 14.

Water running off a peak cuts gullies down the flanks and not across the summit,
so the fix is also the more honest island. **But it is Seb's isle and this
changes what it looks like, so it is called out rather than buried.**

### `npm run check` was running one check out of four

`camera.check.ts`, `isles.check.ts` and `stick.check.ts` have been in the tree
and out of the script. All three pass; all five run now. Nothing was wrong with
them — they simply were not being asked.

### The step is twice as long, and it came out of the crouch

`STRIDE_MAX` went 0.15 → 0.30, a 60 cm step against 30, and the cadence went
3.6 → 2.8 steps a second with it — because the stride is derived from speed and
raising the ceiling alone would have kept the same step and made him faster. At
`WALK_SPEED` he now runs 0.30 of stride at 3.0 steps a second, planted, no slide.

What paid for it is `CROUCH` = 0.09: nine centimetres lower than the surf
stance. That is not a mood. The back leg is the one with 13% of its reach left
(see the first pass), and every centimetre the hips come down is reach it can
spend going forward instead of going up. Nine centimetres doubles the step and
still leaves that leg at **89%** at the end of its swing, measured by the same
sweep the dev assert runs. There is still no rise: he goes *further* into the
crouch to get off the board, which is what carrying something three metres long
does to a person anyway. `CARRY_POS.y` came down 9 cm with him so the board's
top rail stays at the armpit.

### The jump — space, on the water and on the sand

The surfer alone, and the argument is not that he is the newest craft: **a person
can jump and a hull cannot.** He is the one craft in this world that is a body
rather than a boat, so he is the one that gets it. The boat's Space still does
nothing and its hint still does not name it.

- **On the water** the launch is added to the buoyancy spring's own velocity
  rather than replacing it, so a jump taken off the face of a roller is a bigger
  jump than one taken in a trough and nothing had to say so — the sea is already
  moving him. `flew` is set with it so `POP` does not compound it on the next
  frame: that kick is what a *crest* gives you and this is what his legs do.
  Everything downstream is the machinery that was already there — the arc, the
  ring of foam, the burst of spray, the compression on landing.
- **On land** it is the only place in this world that integrates gravity for
  something that is not water: 5.2 up against a stylised 14 down is 0.97 units
  of air, about three quarters of his own height, and 0.74 s of it. The same
  launch into the water's own gravity of 9 goes half as high again, which is
  right — a board pops. Landing is spent in the same currency as the hull's:
  into the bounce spring, and into his knees.
- **It is an edge and not a hold.** The saucer's Space is a held climb to a
  ceiling; this is a press. One `held` ref is what tells them apart, and on a
  phone the second finger is already Space, so the jump is on touch for free.
- `RIDE.air` now measures both — the hull off the surface, or the hop off the
  sand — because what the rider does about it is the same thing. Both feet come
  up 14 cm, the arms go where they went, and the walk cycle freezes in the air
  instead of running in it.

### Cost

- **`src/beach.ts`: 131 lines**, of which about 90 are the argument.
  `src/beach.check.ts`: 100. `src/Ship.tsx`: net about 100 lines added and 30
  moved out. `src/isles.ts`: one term. `package.json`: one line.
- **No new dependency, no new asset, no change to the model.**
- **Runtime: unchanged for every craft but the surfer**, and for him one extra
  height query a frame and a two-line ballistic integration while he is on sand.

### Verified

- `npx tsc -b`, and `npm run check` — which now means all five.
- **The clip is gone, measured**: 0.0 cm at worst over eight bearings at nine
  units a second, against 44 cm before the fix and 80 cm before that.
- **The summit is a point**: the height around a circle at r = 0.001, 0.05 and
  0.2 spans 0.000 m, against 2.100 m before.
- **The stride fits the legs**: the dev assert in `rigOf`, re-measured with the
  crouch — front leg 57%, back leg 90%, against the solver's clamp at 99.8%.
- **The jump's numbers are arithmetic**, not judgement: 0.97 units and 0.74 s
  fall straight out of 5.2 and 14.

### Not verified

- **Still nothing has been rendered.** Everything above is measurement and
  reasoning; none of it says the shot reads.
- **The isle's new summit has not been looked at.** The mesh loses a 2.1 m crown
  and gains a point. It should look better and it is a change to a committed
  frame, so it wants an eye before it wants agreement.

### Needs Seb

- **The isle's gullies at 0.075.** They are half the spread they were and the
  ceiling is a measurement, so if the flanks now read as smooth the fix is a
  different shape of gully rather than a bigger number.
- **`CROUCH` = 0.09 against the stride it buys.** They trade directly: less
  crouch is a shorter step, and there is no third option until the back thigh is
  fixed.
- **`JUMP` = 5.2.** Three quarters of his own height on land and half again as
  much off the water. It is the one number here chosen for how it should feel.
- **The three surfer hint strings**, EN, FR and NL, which now name Space.
  The FR and NL are mine and unreviewed, like the eight already on that list.
