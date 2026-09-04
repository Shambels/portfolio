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

### Both hulls stay mounted

`<Saucer visible={!boat} />` and `<Boat visible={boat} />`, inside the same
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
## The sea state — one slider, a mirror to a gale

**Sea** in the menu, between the craft and the sound: a native `<input
type="range">` that scales the water from dead flat to a storm. It is the
world's third setting and the second one that is remembered.

### Three scalars over `SWELL`, not a fourth wave

`SWELL` is still the same three crossing swells it has been since Phase 3. What
the slider moves is three numbers laid over them — **height, spatial frequency
and speed** — and all three read exactly **1 at `SEA_CALM`**, which is where the
slider starts. The default is therefore the committed golden-hour sea to the
bit, and nobody has to trust that claim: it falls out of the mapping.

- **Height** is `(level / SEA_CALM) ** 2` — squared, so the calm half of the
  travel is where the fine control is and the last quarter is where it turns
  into weather. Full travel is ×6.25, which is 64 cm of water at a crest against
  10 cm today.
- **Frequency** and **speed** are linear and gentle, ×1.6 and ×1.72 at the top.
  A gale is mostly taller and faster water; multiplying the spatial frequency
  much harder just makes small water.

They are written twice, on purpose: `uniform()` nodes for the shader and a plain
object for `swell()` on the CPU, both from one `setSea()`. That is the same
"one set of numbers, read twice" the boat already depends on, and the dev
finite-difference assert in `Scenery.tsx` **now runs at three sea states** rather
than one — the slider scales the height by `amp` and the slope by `amp * freq`,
which is exactly one place to drop a factor.

`Scenery` calls `setSea()` **during render**, which is the one place in that file
that writes anything during render. It is four uniform assignments and it is
idempotent; an effect would leave the frame between commit and effect showing
the sea the visitor just moved away from.

### The water is still geometrically flat, and that is the ceiling

The plane has never been displaced — Phase 3's note says a displaced mesh buys a
silhouette the horizon hides anyway, and at 10 cm of swell that was plainly
right. At 64 cm it is a real limitation and worth writing down: **a storm here
has no silhouette.** What sells it instead is

- **whitecaps** — the crest height, broken up by a second noise field so the foam
  is patches travelling with the water rather than bands drawn across it, gated
  on a `uStorm` uniform that is zero at the default sea and below;
- **the crest banding**, which takes over from the normal's own tilt as the
  normal saturates — without it a storm shades to a flat dark sheet;
- **a chop that scales sub-linearly**: the noise ripple's amplitude follows
  `sqrt(amp)` and its frequency follows the swell's, or it smears into soft
  blobs the size of the boat at full travel;
- **and the boat**, which rides the real height field.

**Displacing the mesh is Seb's call and is not a small one.** `GROUND` is 0.45 —
every island plateau is 45 cm above the water — so a sea whose crests reach 64 cm
would flood the world at the top of the slider. Real waves therefore mean
capping the slider lower, or raising the islands, which CLAUDE.md says means
teaching `Ship` to follow the ground first. Three changes, not one.

### What the hull does about it

Two saturating limits in `Ship`, both `m * tanh(v / m)` rather than a clamp, so
small signal keeps its full gain and the default sea is within a few percent of
what it always was (ride −4%, heel −5%):

- **`RIDE`, 22 cm.** The honest one. The water is a flat plane, so a hull that
  heaves further than this drops through a mirror and vanishes. Height at a
  storm lives in the *rate* of the heave and in the heel, which have no ceiling
  of that kind.
- **`HEEL`, 0.6 rad — 34°.** A gale, not a capsize.

And `WAVE_TILT` now tapers: it is a lie told to make a 12 cm swell visible, and
a gale does not need it. `1 + (WAVE_TILT - 1) / sqrt(amp)`, so it is exactly 3
at or below the sea the boat was tuned on and about 1.8 at full travel. Simulated
over 40 s of drifting hull: mean heel 3° at the default, 18° at the top, and only
4% of frames against the ceiling — without the taper it was 33%, which reads as
clipping rather than as weather.

### The sound has weather too

The surf is the one audio layer that is already a function of the water, so it is
the one the slider belongs in: the sea bed's gain scales from 0.15 at a mirror to
2.25 at a gale, 1.0 at the default. One multiplier, no new layer.

### Cost

No dependency, no asset. About 90 lines across seven files, and the canvas chunk
is unchanged in size to the kilobyte. `SEA_CALM` lives in `WorldGate` beside the
craft's default and `Scenery` imports it back — a value import *into* the canvas
chunk, which is free, and the build confirms `WorldGate` stayed its own 1.5 kB gz
chunk rather than pulling three into the first route.

### Verified, on a throwaway install in Claude's container

- `npx tsc -b` clean and `node src/i18n/locales.check.ts` green, on Seb's copy.
- Full `npm install` + `npm run build` on a copy in the container: typegen, build
  and all 22 prerenders clean. First-route JS unchanged; canvas chunk 456 kB gz,
  under the 600 kB budget.
- Rendered headless on swiftshader at sea 0, 0.4, 0.7 and 1.0, both hulls, with
  the menu open — no console errors in any of them. Screenshots in
  `Claude outputs/`.

### Needs Seb

- **Whether the top of the slider is a storm or a novelty.** Swiftshader has no
  opinion about how a sea reads at 60fps on a real GPU, and the foam thresholds
  (`0.55 … 0.98` on the crest, `0 … 0.4` on the breakup) are the two numbers to
  turn.
- **Whether the flat plane is good enough at full travel**, or whether the
  slider should stop lower — see the three-changes note above.
- **`sea` in FR and NL** — "Mer" / "Zee", the slider's label. Unreviewed, and it
  joins the nine already waiting.
- **Whether remembering it is right.** A visitor who left it at a gale comes back
  to a gale. The alternative is that the site always opens on its committed sea
  and the storm is something you go and find.
