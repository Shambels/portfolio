# CLAUDE.md

**pinchs.be** — portfolio for a software developer. Static React site, no
backend. The visitor controls a character in a 3D world; each project is a
landmark they walk up to. Trilingual EN / FR / NL.

Reference for the concept: https://messenger.abeto.co/

Full plan, phase gates and open questions: `docs/BUILD-PLAN.md`. Read it before
starting work.

## Commands

```
npm run dev        # react-router dev
npm run typecheck  # react-router typegen && tsc -b
npm run check      # the assert-based checks — all five of them
npm run build      # typecheck, prerender every route, copy the root 404.html
npm run preview    # serve build/client/
```

Build output is `build/client/` — one directory of static files, which is the
whole deploy. `dist/` is gone.

**Claude must never run `npm install`, `npm ci` or `npm run build` here.**
`node_modules` contains native bindings for the host (macOS arm64), and Claude's
shell is a Linux VM sharing the same folder. Installing from it empties every
platform binding directory and cannot delete them afterwards, which breaks the
build for everyone. Recovery is `rm -rf node_modules package-lock.json && npm
install`, run by Seb on macOS.

Claude verifies with `npx tsc -b` and `npm run check` — pure JS, safe from
either side. That script ran one check out of four for a while; it runs
`locales`, `camera`, `isles`, `stick` and `beach` now, and all five pass. `react-router typegen` and `oxlint` are *not* safe:
both ship native bindings built for macOS arm64, so they fail outright from
Claude's Linux VM and `tsc` runs against whatever types typegen last wrote.
Anything that needs a real install, a real build, typegen or the linter, Claude
does on a throwaway copy in its own cloud container, never in this folder.
Bundling and deploying are Seb's.

## Stack

Vite 8 · React 19 + TypeScript · React Router 8, framework mode, `ssr: false`
with `prerender` · `three` (WebGPURenderer + TSL) · `@react-three/fiber` ·
`@react-three/drei`. Content as MDX (`@mdx-js/rollup` + `remark-frontmatter`),
locale in the route. Deploy: static build → rsync → nginx on Seb's own Ubuntu
box. No Node and no runtime on the server; `/var/www/pinchs.be` is exactly
`build/client/`. Root redirect and 404 live in `deploy/nginx.conf`, not in a
`_redirects` file.

The plan says "React Router 7"; v8 is what shipped. Same `react-router.config.ts`,
same `routes.ts`, same `root.tsx`, and v7 would have meant starting a new project
one major behind. Noted here rather than done quietly.

## Projects

| Slug | Landmark | Links |
|---|---|---|
| `polarsense` | A mine | https://github.com/Shambels/polarSense |
| `arts-by-sandra` | An easel and canvas | https://artsbysandra.be/ |
| `scrubble` | A Scrabble board | — |

Where each one sits in the world — `pos`, `size`, `radius`, `waypoint`, `order`
— is English frontmatter, not a table anywhere in code.

## Invariants

Breaking one is allowed. Doing it without saying so is not.

1. **No backend, no database.** A feature needing a server gets proposed, not
   built.
2. **All prose lives in the DOM.** Never render case-study text into the canvas
   — unselectable, unsearchable, invisible to screen readers.
3. **The `<Canvas>` mounts once** in the root layout and never unmounts on
   navigation. Proximity pushes a URL; it does not remount a tree.
4. **The site works fully with WebGL unavailable and with JS off.** The world is
   an enhancement over a complete site.
5. **Every landmark is reachable without walking to it** — skip link first in tab
   order, full keyboard path, direct URL.
6. **`prefers-reduced-motion` is honoured everywhere** — no idle motion, no
   camera sway, instant transitions.
7. **Content is data.** A new project is a new MDX file plus a model. Never new
   scene components. *Bent once, on purpose:* the isle is scenery, not a
   project — no year, no stack, no case study — so it is `ISLES` in
   `src/isles.ts` and a component of its own, rather than a fake MDX file
   sitting in `/work` beside three real ones. `docs/STATUS.md` has the argument.
8. **All input goes through `useInput()`.** The one permitted early abstraction,
   and it paid: Phase 6's touch controls are a thumb stick written into the same
   `move` vector, and the flight controller, the spray and the sound did not
   change a line for them.

## Conventions

- Ponytail: fewest files, shortest working diff, platform and stdlib before
  dependencies. No abstraction before its third use — except invariant 8.
- New dependency needs a one-line justification and its gzipped cost.
- The camera is a follow camera that turns: 7.2 astern of the *heading* and 1.5
  up, swinging round the hull with a lagged, capped chase that is spent out of
  *distance travelled* rather than out of the clock — a change of direction on
  its own moves nothing, and the camera comes round as the craft gets somewhere
  in the new direction. `move` is read against where it points. The bearing changes and the two distances do
  not, so the pitch — and `--horizon`, `SKY_TOP` and the assert that ties them
  together — is the same at every heading. `src/camera.ts` is the arithmetic
  and `src/camera.check.ts` is what holds it.
- No physics engine until the world needs slopes or stacking. The character
  hovers: XZ translation, sine bob, bank on turn, circle-vs-circle landmark
  collision — and, since the isle, a handful of height queries a frame under the
  saucer so it rides the ridge instead of flying through it. Still no engine: a
  lagged read of `ground()` over the hull's rim and a little way ahead of it,
  measured above the plateau the landmark islands sit on, quick to rise and slow
  to sink, plus a metre and a bit of clearance that only exists over land — so
  every frame the sea and the plateaus already had is unchanged. The boat is the same controller with its altitude pinned to the
  swell (`swell()` in `Scenery.tsx`, the CPU twin of the water's own waves) and
  a circle-vs-circle push out of each island's shoreline — still no engine. No ground following over flat terrain — only where the land stands higher than a plateau.
  The surfer is the exception to that shoreline, and it is the only one: he
  crosses the isle's coast, picks the board up and walks, following the same
  `ground()` the saucer does with his soles on it instead of a metre above it —
  and jumps, on the sand and on the water alike, because he is the one craft
  here that is a body rather than a boat. His vertical is `src/beach.ts`, which
  is pure arithmetic so that `beach.check.ts` can walk him onto the real island
  in node; it is a *floor* and not a fade, and the difference between those two
  words is a man on the beach against a man inside it.
  The three project islands are still a wall for him — arriving *alongside* one
  is what opens its panel — so `offshore` takes an argument rather than growing
  a craft check.
- The character stays procedural — both hulls. The **surfer** is the one
  exception, rider and board both, and `tools/surfer.py` is where it says why:
  a hull is a solid of revolution with things bolted to it and code is good at
  those; a person is one skin over a skeleton, and a board a person stands on
  is drawn by the same hand as the person. Anything else that wants a model
  file still has to argue for one first. Since the third pass neither is
  sculpted here: `tools/surfer-tripo.glb` and `tools/surfboard-tripo.glb` are
  AI-generated sources, and the script is what rigs, poses, slims and exports
  them. The rider is still the only thing in the world with bones in it —
  seventeen, laid on the A-pose the generator delivered and then posed into
  the crouch, which is applied as the rest pose — and the only animation in
  the file is none: `Ship.tsx` bends him from the flight controller's own
  numbers every frame, the upper body by FK and the legs by a two-bone solve
  against ankles that are fixed to the deck. With no input every bone is at
  rest, which is the model exactly. The leash, its cuff and the wake are still
  built in `Ship.tsx`, because they run between the two files.
- No i18n library. Typed string objects per locale in `src/i18n/`.
- Canvas and models load via dynamic `import()`, never in the first-route chunk.
- TypeScript strict, no `any`. A narrow cast at a library boundary is fine — see
  `extend(THREE as never)` in `src/App.tsx`.
- No test framework. Non-trivial logic leaves one assert-based check behind.
- Models live in `src/models/`. Where one is generated by a script in `tools/`,
  that script is the source: `python3 tools/<name>.py` rebuilds it (`pip install
  "bpy==4.5.13"`, Python 3.11). A model that comes from somewhere else — sculpted
  by hand, or generated elsewhere and retopologised in — is fine, and does not
  have to argue for a script first; keep its `.blend` in `tools/` beside the
  scripted ones so the next pass has something to open, and say at the top of it
  where the geometry came from. The one thing that does not bend: whatever makes
  it, the result still has to meet the contract `Ship.tsx` and the landmark
  pipeline assert on — the rider's seventeen bone names, no scale on a bone,
  a basecolour texture on him and on his board.
  `tools/palm.py` is the one script that is not a landmark: it exports a library
  of parts `Isle.tsx` instances, and it argues its own case at the top of the
  file the way `surfer.py` does.
  Geometry only: materials stay in TSL, and a mesh's name prefix picks which one
  it gets. The surfer's two files are the exception and the only one — a face,
  a suit and a board graphic are not materials a prefix can name, so each
  carries a basecolour texture (2048² on him, 1024² on the board, JPEG, with
  no lighting painted in) and its own UVs, and both are lit like the world —
  `MeshStandardNodeMaterial` with the texture under the same sun — with an
  inverted-hull ink outline round each, which is the one thing that kept the
  shadow side legible on every rider. The second rider's toon shading, rim
  and glint went with COLOR_0; the third shipped unlit for a pass and Seb's
  eye put the sun back on him.
  For anything with a script behind it, `--render out.png` writes the preview
  views and `--render out.png --flex` writes them in a stress pose, which is the
  only way to see whether a rig's weights hold — a model that arrives without a
  script still needs that second picture taken some other way before it ships.
  The two shipped files are meshopt-compressed by `gltfpack`, pinned and run
  through `npx` at the end of `tools/surfer.py` (`--no-pack` skips it; the
  file is then the same model, four times heavier). The decoder is already in
  drei's `useGLTF`, so it costs the bundle nothing.
- Shaders derive from what a project does. Generic noise does not ship.

## Budgets

| Metric | Limit |
|---|---|
| First-route JS | ≤ 200 kB gz, excluding canvas chunk |
| Canvas chunk | ≤ 600 kB gz |
| Per landmark model | ≤ 300 kB compressed, ≤ 25k triangles |
| The rider, `surfer.glb` | ~38k triangles, ~600 kB compressed — **a guideline, not a limit.** Its own row since the second pass, and loosened by Seb for the same reason it was raised: it is the one model that is looked at rather than walked past, so it is judged by how it reads at the size it is drawn and not by the number. Going over is a decision to write down, not a gate to fail. Meshopt is the lever if it has to come down. **Over since the third pass, on purpose:** 91k triangles and 964 kB (809 kB gz), all of the generator's mesh kept at Seb's choice of fidelity over size, and meshopt already pulled — `docs/STATUS.md`, "The rider, third pass" |
| The board, `surfboard.glb` | 10k triangles, ~180 kB — decimated from the generator's 95k; nobody looks at it for long |
| Whole world, compressed | ≤ 3 MB, loaded progressively |
| LCP (4G) | < 2.0s |
| Lighthouse, flat site | 100 / 100 / 100 / 100 |
| Frame rate | 60fps on a 2022 mid-tier laptop, or cut the effect |

## Layout

```
src/root.tsx            the HTML document — <html lang>, stylesheet, Scripts
src/routes.ts           the route table
src/routes/locale.tsx   :lang layout — validates the locale, chrome, hreflang
src/Menu.tsx            the top chrome — a <details> in the top right of the
                        `.topbar` row: home, work, the three languages, and the
                        world's three settings: which craft you steer, how rough
                        its sea is, and its sound. The only other thing that ever
                        stands in that row is the cross that closes a case study
                        the world opened — `locale.tsx` renders it, and the
                        matching arrow in the other corner
src/routes/home.tsx     /{lang} — the landing page: the ocean as CSS, the shore
                        over it (palms, cloud, sand — one SVG path and gradients),
                        one button, and the dolly that flies all of it past the
                        camera on the way into the world
src/routes/world.tsx    /{lang}/world — the world's address, and its flat fallback
src/routes/work.tsx     /{lang}/work — the flat index, never has a world behind it
src/routes/case-study.tsx  /{lang}/work/{slug} — a card with the world, the prose
                        without, and one `view-transition-name` on <main> that
                        grows the first into the second
src/routes/not-found.tsx   /{lang}/404 — copied to build/client/404.html
src/content.ts          every MDX file, keyed by slug and locale
src/i18n/               locales.ts (routing + isWorldPath) + index.ts (strings) + a check
src/WorldGate.tsx       mounts the canvas once, decides where it shows, owns the
                        HUD and the sound state the menu toggles
src/MiniMap.tsx         the world's index since the panel went away — a top view
                        in the corner, a letter per project, the ship's arrow
src/Scene.tsx           the <Canvas> and everything in it
src/Scenery.tsx         sky, sun, ocean, clouds — all TSL, no assets
src/Post.tsx            the render pipeline — FXAA, and bloom off emissive only
src/Particles.tsx       the spray under the ship — GPU compute, WebGPU only
src/Sound.tsx           the ambient layer — Web Audio, synthesised, off by default
src/Islands.tsx         the ground under each landmark — lathed, no assets
src/beach.ts            coming ashore: the ramp between riding and walking, the
                        sand under his feet and the altitude floor over it —
                        pure arithmetic, no three, so the check runs in node
src/beach.check.ts      that, ridden onto the real isle on eight bearings
src/isles.ts            the isle: an island that is a place and not a project,
                        and the height function that is its shape — pure
                        arithmetic, no content import, so the check runs in node
src/Isle.tsx            that height function as a mesh, its colours, and where
                        its thirty-eight palms stand (plural filename: macOS
                        cannot tell `isles.ts` from `Isle.tsx` without the s)
src/Landmarks.tsx       the mine, the easel, the board — blockout in primitives +
                        TSL, and the detailed model where one exists (`MODEL`)
src/models/             the .glb files — geometry only, no materials, no UVs,
                        except the surfer's two, which carry a texture each
tools/landmark.py       what every landmark script needs — axes, members, export
tools/mine.py           builds tools/mine.blend and src/models/mine.glb, headless
tools/easel.py          the same, for the easel
tools/board.py          the same, for the board
tools/surfer.py         the rider and his surfboard — rigs, poses, slims and
                        exports the two generated sources beside it,
                        tools/surfer-tripo.glb and tools/surfboard-tripo.glb
tools/palm.py           not a landmark — a library: three palms, a fern and a
                        boulder, instanced across the isle by `Isle.tsx`
src/Debug.tsx           ?debug — radii, blockout boxes, waypoints
src/Ship.tsx            the character: the flight controller, and the two hulls
                        it drives — a hovering saucer and a boat on the water
src/useInput.ts         invariant 8 — the only place input is read, keys and touch
src/stick.ts            the thumb stick's arithmetic, and its check beside it
src/camera.ts           the follow camera's two sums — a push read against the
                        camera's bearing, and the capped swing that keeps it
                        astern of the heading — with its check beside it
src/world.ts            landmark layout + proximity, read from the content;
                        coastlines, moorings and lagoons, isles included
docs/STATUS.md          what is built and what is not — update it with the work
src/index.css           global styles — and `.world` / `.landing`, the two
                        classes on <html> that pin the chrome over the sea
src/content/projects/   {slug}.{lang}.mdx  (Phase 1, not yet written)
src/i18n/               UI strings per locale
docs/BUILD-PLAN.md      phases, gates, decisions, open questions, risks
deploy.sh               build + rsync to the server, then a routing smoke test
deploy/nginx.conf       the server block — root redirect, 404, caching
```

## Content

`src/content/projects/{slug}.{lang}.mdx`, and nothing lists them anywhere else —
`react-router.config.ts` reads the directory to build its prerender list.

English carries the structural frontmatter (`year`, `stack`, `site`, `repo`, and
the world's `landmark`, `order`, `pos`, `size`, `radius`, `waypoint`); `fr` and
`nl` carry only `title` and `summary` beside their prose. A URL is never written
down three times. A locale with no file for a slug falls back to English rather
than 404ing.

`pos` and `waypoint` are XZ only — the plateau height is one constant, `GROUND`
in `src/world.ts`. A `waypoint` must be inside its own `radius`, or a deep link
spawns the ship outside the landmark it just opened and the panel closes itself;
`world.ts` asserts it in dev.

Two more, asserted beside it. They were written when the camera never yawed —
it was always `CAM_OFFSET` from the ship, +z and above — so where a landmark
landed on the screen was arithmetic on the waypoint: `pos[1] < waypoint[1]` put
it in front of the ship rather than between the ship and the camera, and
`pos[0] > waypoint[0]` put it in the right half of the frame, the half the
reading panel does not cover. The camera stays astern of the heading now and a
deep link parks the ship facing its landmark, so the first is true by
construction and the second no longer picks the half of the frame. Both are kept
because they still fix which side the world is approached from — the composition
the sun was swung for — and both survive `offshore`, so they hold for the boat
too. `docs/STATUS.md`, "The camera turns", has what that left for Seb to look
at.

## Working together

**Ask first:** adding a dependency, adding a route, changing the render pipeline,
publishing an unreviewed translation, or starting a phase the plan gates.

**Just do it:** content edits, shader tweaks, styling, and any refactor that
makes the diff smaller.

## Current state

`docs/STATUS.md` is the source of truth. Update its boxes in the same commit as
the work.

Phases 0 to 4 are built, and Phase 6 with them: the models, the shaders, the
post-processing chain, the GPU particles, the ambient sound, and now touch. The sun was swung round to port in an
earlier pass, which is a change to the committed golden-hour look and is written
up in `docs/STATUS.md`.

Sound is synthesised in `src/Sound.tsx` — Web Audio, no files, no dependency,
+1.4 kB gz — and it is off until the visitor presses the one button in the HUD,
which is also the gesture the autoplay policy wants. Nothing is constructed
before that click.

The particles are WebGPU only and there is deliberately no WebGL2 version —
`docs/STATUS.md` has the argument. That makes them the first thing in the world
a visitor can miss, which is why `?debug` names the backend.

The surfer comes ashore. Riding onto the isle's beach brings the board up under
his arm and puts him on foot; walking back into the sea puts him on it again.
Space is a jump for him and for nothing else, on the water and on the sand
alike. He walks or runs, and which one is the **duty factor** — the fraction of
the cycle a foot is on the ground, 0.46 walking and 0.24 running. Step length is
`stride / duty`, so a run covers more ground by spending *less time down* rather
than by swinging further or cycling faster: the running step is 1.71 units where
the walking one is 0.85, and the legs go round slower doing it. The rate is not
chosen anywhere — it is whatever makes the planted foot travel backward at
exactly the speed the body travels forward, which is what makes sliding
impossible instead of merely capped. One ramped number, `RIDE.land`, drives the craft, the board and the man,
and it runs both ways — putting the board down is picking it up backwards. It found two things while it was in
there. The first: **the isle's summit was not a point.** Its gully term is
angular and was at full strength at the axis, where `theta` flips by pi, so the
peak was a four-lobed crown 2.1 m tall with a step down the middle — drawn by
the mesh, flown over by the saucer, and only visible once a man's own feet stood
on it. Fixed, and **that is a change to the isle's committed look**: the gullies
are as deep as they were and the spurs between them are gone. `docs/STATUS.md`,
"The beach, second pass", has the numbers and the ceiling.

The second: **the rider's two legs were not the same length** — 0.785 of reach at the front and 0.511 at the back, the back thigh a
shade under half the front one — which nothing on a board ever exposes and which
a stride exposes immediately. Every cramped number in the walk is sized around
it — 0.785 of reach at the front and 0.511 at the back, the back thigh a shade
under half the front. Two legs of different lengths have no hip height in common,
so the first walk had to crouch to find stride and the long leg folded to 57%,
which is a man walking on his knees. **Fixed in the model**: both legs are one
anatomy now, a 0.43 thigh on a 0.25 shin, only the two knees moved, and the walk
stands up 16 cm instead of crouching 9. **It changes the stance on the board** —
the back knee is lower and further outboard — and `docs/STATUS.md`, "The legs",
has the before-and-after and the one lever left if the new stance reads badly.

The rider is rigged, and the point of the rig is that the legs do the work.
Nothing about the model changed — same triangles, same COLOR_0, same rest pose
to the vertex — but the hull's attitude now arrives at him split three ways:
what the *water* is doing to the deck, which he stands up against (95% of it,
subtracted back out through the hips and the spine); what the *craft* is doing,
which he mostly goes with (a third resisted); and the deck's vertical
acceleration, which he meets by getting shorter. Both ankles are fixed to the
deck, so none of that can happen without one leg extending and the other
folding — which is the absorption, and is why the legs have a solver and the
arms do not. A deck heeled 17 degrees leaves his torso 2.5 degrees off vertical.
The arms hang low and near him by default, both elbows folding forward the way
an elbow does — the wide pose the model first shipped with was a photograph, and
a photograph held forever is a man stuck mid-gesture. Width comes back on every change of direction instead: the arm on
the *outside* of the turn goes up, so turning right raises his left and turning
left raises his right. Moving those four points broke Blender's bone heat, which
cannot separate a forearm from the thigh it hangs beside; weights are `diffuse`
now — nearest bone, then blurred along the mesh's own edges, which is the one
method whose blind spot is exactly this shape. `docs/STATUS.md`, "The rider
moves", has the gains and the numbers that want a second opinion. It cost 79 kB
gz on the model and nothing measurable a frame.

Touch is drag-to-fly, not tap-to-move: a drag on the world is a thumb stick
(`src/stick.ts`) read into `useInput`'s `move`, boost is the same push further,
rise is a second finger. Nothing is cut on a phone, and the whole phase cost
528 bytes gz. `docs/STATUS.md` has the layout it changed and the one camera
number it changed with it.

The visitor picks the craft in the menu, and the sea beside it — **calm** or
**agitated**, two states and not a dial. Both are remembered, and the sound is
not, because nothing in the platform refuses to give a returning visitor the
hull and the weather they chose, while it does refuse them sound before they
have clicked.

Calm is the chop the world shipped with, scaled up by `CHOP`. Agitated is that
same chop with three crossing trains of rollers under it — 96, 74 and 60 units
between crests, at spread headings, the tallest 2.6 against a 1.9 m mast, summed
so that no two crests line up twice. Three rather than one because one train is
a corrugated roof, every crest parallel to the last. They are the **one thing in
this world made of displaced geometry** —
Phase 3's "the surface stays geometrically flat" no longer holds for that term,
because a wave bigger than the ship that is only a painted normal has nothing to
ride and nothing to be thrown off. The rollers are damped to nothing over every
island's shallows (`shoal()` in `world.ts`), or a 2.8 m swell would put a 45 cm
plateau under water.

The boat's vertical is a buoyancy spring against the surface's own motion, and
gravity when the water drops away faster than the hull can follow — so a roller
taken at cruise is a ride and one taken at full sail is a jump, out of the
physics rather than out of a rule. Leaving the water and landing are the two
events on top of it: a kick on the way up (`POP`, which buys the height an
honest spring does not), and on the way down a compression of the bounce spring,
a ring of foam opening on the water and a burst out of the spray particles. One function still writes both the shader's uniform and
the CPU twin `swell()`, and the dev finite-difference assert beside it is what
keeps the water and the hull the same water. `docs/STATUS.md` has the numbers. The boat floats: its altitude is the
swell, it is pushed out of every island's shoreline instead of flying over it,
and arriving *alongside* an island is what opens the panel, because a hull can
never reach the circle the saucer triggers on.

The world gained a fourth island, and it is the only one that is not a project:
70 m of coast at human scale, a 13 m ridge, a turquoise lagoon and thirty-eight
palm trees, 78 units out in the half of the frame the camera looks into. It is
what unlocked ground following — the saucer rides the ridge — and it gave every
island a lagoon and a line of surf on its beach, which is a change to the
committed look of the three that were there already. `docs/STATUS.md`, "The
isle", has the whole of it, including the three numbers that were found by
rendering rather than by thinking.

The rider had a second pass: athletic proportions on the same skeleton, a
head of helical curls on a scalp cap, a suit that is *sewn*, and a board that
is made of something. `docs/STATUS.md`, "The rider, second pass", has it.

And a third, which replaced both with AI-generated models Seb brought in: a
man in an A-pose with a painted face and a 4096² basecolour, and a shortboard
with two pads and a graphic. `tools/surfer.py` is a different script now — it
finds the joints on the mesh by anthropometry, lays the same seventeen bones
on the A-pose, weights them by bone heat, poses him into the *second rider's*
stance to the number and applies that as the rest pose, so `Ship.tsx` did not
change how it moves him: same names, same solve, same ankles. What changed:
he stands half a metre further aft, on the board's own pads (`STANCE`); the
board is a file, 2.0 long and 0.63 across with a thinner deck, so the leash
points and `FOOT_DROP` were re-measured; he and the board are lit like the
world, texture plus outline, no toon, no rim; `STAND` doubled for the longer
legs; and the two files are meshopt-packed.
`docs/STATUS.md`, "The rider, third pass", has the numbers and what is still
Seb's eye.

What is open is Seb's: the first deploy and DNS/TLS (Phase 2's exit), Track B's
*is traversal interesting or a chore* judgement, reviewing the ten unreviewed
FR/NL UI strings (`worldControls`, `sound`, `worldControlsTouch`, the boat's two
control hints, the three craft labels and the reading view's `closeStudy` and
`backToWorld`), and judging
the lighting, the post-processing chain, the sound mix, the stick's feel and now
the isle's frame rate, its turquoise on the older islands and the saucer over
its ridge, on real hardware — swiftshader has no opinion about frame rate, a null audio sink
has none about levels, and neither has a thumb.
