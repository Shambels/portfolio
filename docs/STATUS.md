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
- [ ] GPU compute particles where WebGPU is available *(same)*
- [ ] Ambient sound, off by default *(same)*

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

## Phase 5 — Hardening

- [ ] Budgets in CI
- [ ] Lighthouse CI
- [ ] Keyboard audit in all three locales
- [ ] Browser matrix incl. WebGL disabled
- [ ] OG images per case study per locale

## Phase 6 — Mobile  *(deferred, decide after Phase 3)*

- [ ] Touch feeds `useInput()`
- [ ] Tap-to-move, or full touch controls
