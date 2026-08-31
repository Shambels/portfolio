# pinchs.be — Build Plan

## What this is

A portfolio for a web-app / SaaS developer. Case studies only, plus a minimal
footer. The site is itself the portfolio piece.

**The concept.** A navigable 3D world, in the spirit of
[messenger.abeto.co](https://messenger.abeto.co/). The visitor controls a
character and walks around. Each project is a physical thing in that world — a
mine, an easel, a Scrabble board. Approach one and a panel opens with the case
study.

No backend, no database. Static build, edge-hosted at **pinchs.be**.
Trilingual: EN / FR / NL.

## Non-negotiables

1. Every case study is readable with WebGL disabled and with JavaScript off.
2. All prose is DOM text. Nothing readable is rendered into the canvas.
3. The world is a layer over a working flat site, never a prerequisite for it.
4. 60fps on a mid-tier 2022 laptop, or the effect gets cut.
5. Every landmark is reachable without walking to it — keyboard, skip link, and
   a direct URL.

Breaking one is allowed. Doing it quietly is not.

---

## The world

### Projects and their landmarks

| Project | Landmark | What it is |
|---|---|---|
| **PolarSense** | A mine | VS Code extension: column autocompletion for Polars / pandas / DuckDB, read from file schemas without executing code. TypeScript, tree-sitter, hyparquet. Released on the Marketplace. [Repo](https://github.com/Shambels/polarSense) |
| **Arts by Sandra** | An easel and canvas | Trilingual site for an artist — courses, artwork sales, studio rental. [Live](https://artsbysandra.be/) |
| **Scrubble** | A Scrabble board | Scrabble game app |

The mine is the strongest of the three, because the metaphor is not decorative:
PolarSense extracts structure from files without running them. Seams, strata,
ore that is already there before you dig. Lean on that in the scene — visible
rock layers as schema, veins as columns — rather than adding a generic mine cart
because mines have carts.

### Entry and navigation

- `/` spawns the visitor in the world, with a **skip link** to a flat list —
  first thing in the tab order, visible on focus. Recruiters are in a hurry.
- Walking within a landmark's radius opens its panel and pushes
  `/{lang}/work/{slug}` to history without remounting anything. Walking away
  pops back.
- Hitting `/{lang}/work/{slug}` cold: if the world loads, spawn beside that
  landmark with the panel open. If it does not, the prerendered flat page is
  already there and complete.
- `/{lang}/work` is the flat index the skip link points at.

That is the whole reconciliation between "a world you explore" and "a site
Google can read". Both are real; neither is a fallback stub.

### Character controller

The character is a **cartoon flying saucer hovering above the ground**, built
procedurally in `src/Ship.tsx`. Third-person, ship plus follow camera.

Because it floats, there is no walk cycle, no foot planting and no ground
following. Movement is XZ translation plus a sine bob, turning is a bank angle,
and landmark collision is circle-vs-circle against 3–8 positions. Hover height is
a constant over flat ground; only if the terrain gains hills does it need a
raycast. That is a few dozen lines and no dependency.

Add `@react-three/rapier` only when the world genuinely needs slopes, stacking,
or thrown objects — and note the ~200 kB when you do.

### Input abstraction — the one permitted abstraction

Mobile is deferred, not cancelled. All input goes through a single
`useInput()` hook returning `{ move: Vector2, look: Vector2, interact: boolean }`.
Keyboard and gamepad feed it now; touch feeds it later.

This is the one place the "no abstraction before the third use" rule is
suspended, deliberately. Retrofitting touch input into a camera rig and a
character controller that both read `keydown` directly is a rewrite, and the cost
is known in advance. One hook now is cheaper than that later.

---

## Asset pipeline

You are modelling these yourself, which makes Blender a **parallel workstream**,
not a Phase 3 task. It starts on day one alongside the writing, because neither
blocks the other and both are gates.

```
Blender  →  glTF export  →  gltf-transform (Draco + KTX2)  →  gltfjsx  →  typed component
```

The character is **not** part of this track. It is procedural code, already
built, and it needs no modelling, no rig and no export.

Budgets per landmark: **≤ 300 kB** compressed, **≤ 25k triangles**, one material
where possible. The whole world including the character stays under **3 MB**
compressed, loaded progressively — ground and character first, landmarks after.

Blocking-out comes first: grey primitives at true scale for every landmark, so
the world's layout, walking distances and camera framing are proven before a
single thing is detailed. A world that is fun to walk around in grey boxes will
be good detailed. One that is boring in grey boxes will be a beautiful, boring
world.

---

## Internationalisation

Locale is a route prefix: `/en/…`, `/fr/…`, `/nl/…`. `/` redirects via a
Cloudflare `_redirects` rule. `hreflang` on every page.

**Content:** `src/content/projects/{slug}.{lang}.mdx`. English is the source of
truth. FR and NL are machine-translated from it and then human-reviewed before
publish — never published unreviewed. Your French and Dutch readers are local;
machine-translation artefacts will read as carelessness, in a document whose
entire job is demonstrating care.

**UI strings:** one typed object per locale in `src/i18n/`. No i18n library.
Three locales and roughly thirty strings do not justify `react-i18next` and its
runtime.

---

## Phases

Two tracks run in parallel from the start. Both are gates on Phase 3.

### Track A, Phase 1 — Writing — GATE

Nothing is written yet. This phase decides whether the site is good, and it is
the one that reliably loses to the fun part.

Three case studies in English, plain markdown, no styling and no code. Each one:

- The problem, in the user's words — not the ticket title
- What you chose, **and what you rejected, and why**
- What it cost: what broke, what constraint you hit, what tradeoff still annoys
  you
- The outcome, with a number if one honestly exists

The rejected-alternatives section is the only part that demonstrates judgement
rather than output. It is what separates a case study from a README.

**Deliverable:** three `.en.mdx` files, 600–900 words each, with frontmatter
(`title`, `slug`, `year`, `stack`, `summary`, `landmark`, `waypoint`). Plus a
one-line bio and footer links. FR and NL follow after Phase 2, once the English
is settled — translating drafts twice is wasted work.

**Exit test:** read them aloud. If you would send them to someone hiring, done.
If a case study is dull as plain text, no shader will rescue it.

### Track B, Phase 1 — Blocking out — GATE

In parallel with the writing, in Blender. Grey primitives, true scale, no
detail: ground, the three landmarks, a character-height reference.

**Exit test:** export it, drop it in the Phase 0 scene, and walk around. Is
getting from the mine to the easel interesting, or is it a chore? Fix that now,
while everything is still a box.

### Phase 2 — The flat site

A complete, fast, typographic trilingual site with zero 3D. It ships on its own
and stays the permanent fallback and SEO surface.

- React Router 7 in framework mode, `prerender` on → static HTML for every route
  in every locale
- MDX via `@mdx-js/rollup`. Content is files; git is the CMS
- Routes: `/{lang}`, `/{lang}/work`, `/{lang}/work/{slug}`, 404
- Typography: one variable font, subset per locale, dark by default, real
  vertical rhythm. The craft signal starts here, not in Phase 4
- Footer: name, one line, email, GitHub, LinkedIn
- Deploy to Cloudflare Pages on pinchs.be, with `_redirects` for locale root

**Exit test:** Lighthouse 100 across the board, fully usable with JS off, live on
the real domain in all three languages.

### Phase 3 — The world

Requires both Phase 1 gates. Data-driven, so it scales from three landmarks to
eight without touching scene code.

- One `<Canvas>` in the root layout. Mounts once, never unmounts on navigation
- Landmarks built by mapping the content array — a new project is a new MDX file
  and a new model, and zero new scene code
- Character controller and follow camera, per above
- Proximity → panel opens, URL pushed, no remount
- `?debug` renders waypoint gizmos, collision radii, wireframes, frame stats

Fallbacks built here, not bolted on in Phase 5:

- No WebGPU and no WebGL2 → canvas never mounts, Phase 2 site stands
- `prefers-reduced-motion` → no idle motion, no camera sway, instant panel
  transitions
- Canvas and models are a dynamic `import()`, loaded after first paint
- Full keyboard path to every landmark that does not require walking

**Exit test:** every route walked twice, once with the canvas on and once with it
forced off. Both must be coherent experiences — not one experience and one
apology.

### Phase 4 — Craft

Only once Phase 3 is stable. Every item independently cuttable.

- Detailed models replacing the blockout, one landmark at a time
- TSL shaders derived from what each project does. The mine's strata are
  PolarSense's schema; the easel's canvas resolves as you approach; the Scrabble
  tiles settle into a real word. Generic noise does not ship
- Post-processing, sparingly. Bloom is not a personality
- GPU compute particles where WebGPU is available, cheaper path or nothing where
  it is not
- Ambient sound, off by default, only if it earns its place

### Phase 5 — Hardening

- Budgets enforced in CI (see CLAUDE.md)
- Lighthouse CI on every push
- Keyboard path through every landmark and link, in all three locales
- Matrix: Safari macOS + iOS, Chrome, Firefox, mid-tier Android, WebGL disabled
- Per-case-study OG images, per locale

### Phase 6 — Mobile — deferred

Decide after Phase 3. Tap-to-move is the cheap option: tap a landmark, the
character walks there, the panel opens. No joystick, no free camera. Full touch
controls are the faithful option and will constrain the art direction across all
devices, because mobile GPUs set the ceiling.

Deferring this is a real choice with a real cost: roughly half of recruiter
traffic is on a phone, and until this phase they get the flat site. The
`useInput()` abstraction is what keeps the door open.

---

## Decisions

**Rails + Postgres — cut.** Around fifteen pages of content that change
quarterly. A database adds a server to keep alive and demonstrates nothing a
visitor can see. Backend skill belongs in the projects you link to.

**Next.js — cut.** RSC buys little for a site that is one persistent client
canvas, and brings a build model and hosting bias for no return.

**Astro — considered, rejected.** Better for per-page scenes, worse for a
persistent canvas with a character walking between routes. The single mounted
`<Canvas>` is the concept.

**React over Svelte.** Your fluency, and R3F + drei is why 3D on React is
tractable.

**WebGPU via three's `WebGPURenderer`.** Automatic WebGL2 fallback, and TSL
compiles one shader source to both WGSL and GLSL.

**React Router 7 over TanStack Start.** Simpler prerender story for a handful of
static routes across three locales.

**No physics engine, initially.** See Character controller.

**No i18n library.** See Internationalisation.

**The character is a procedural flying saucer.** `LatheGeometry` plus a few
primitives in `src/Ship.tsx` — no model file, no rig, no walk cycle, no loader,
no Draco, roughly zero bytes. Hovering removes ground-following and foot-planting
outright. This is the single biggest de-risking decision in the project: it
deletes the one asset that would have needed a skill (character rigging and
animation) neither the plan nor the timeline had room for.

---

## Open questions

- Scrubble — is it shipped, and where? PolarSense has a repo and a Marketplace
  listing, Arts by Sandra is live. Scrubble needs an equivalent, or it reads as
  the filler project
- Is the world one continuous space, or islands? Continuous means walking
  distance between landmarks becomes pacing you have to design. Islands are
  easier to art-direct and easier to add a fourth project to
- Time of day, weather, seasons — atmosphere is where worlds like the reference
  earn most of their charm, and it is cheap in shader terms and expensive in
  decision terms. Pick one look and commit

---

## Risk register

**1. Track A never finishes.** Still the most likely failure. Nine documents
eventually, three before anything else. Mitigation: it is a gate, and FR/NL are
explicitly deferred until the English is settled.

**2. The models look like a first Blender project.** Now the largest remaining
asset risk, and the one that most determines whether the site reads as
accomplished or as ambitious. The saucer decision removed the hardest asset;
these three landmarks are static props, which is the easiest category to model
well. A world
of grey blockout with excellent lighting and one beautifully finished landmark
beats four mediocre models. Mitigation: finish landmarks one at a time in Phase
4, and keep the blockout shippable at every point.

**3. The world is charming and unusable.** Mitigation: skip link in the tab
order, full keyboard path, flat pages that are complete documents.

**4. Bundle bloat.** `three/webgpu` is ~490 kB gz before a single model.
Mitigation: budgets in CI from Phase 2, canvas and assets always lazy.

**5. Mobile deferral becomes permanent.** Mitigation: `useInput()` from day one,
and Phase 6 stays in this document rather than in a note somewhere.

**6. Cliché.** A dark scene with a distorted sphere is this stack's default
output. The character-world concept already avoids most of it — the remaining
risk is generic assets. Mitigation: the Phase 4 rule.
