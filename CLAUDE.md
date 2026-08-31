# CLAUDE.md

**pinchs.be** — portfolio for a web-app / SaaS developer. Static React site, no
backend. The visitor controls a character in a 3D world; each project is a
landmark they walk up to. Trilingual EN / FR / NL.

Reference for the concept: https://messenger.abeto.co/

Full plan, phase gates and open questions: `docs/BUILD-PLAN.md`. Read it before
starting work.

## Commands

```
npm run dev      # vite dev server
npm run build    # tsc -b && vite build
npm run preview  # serve dist/
```

**Claude must never run `npm install`, `npm ci` or `npm run build` here.**
`node_modules` contains native bindings for the host (macOS arm64), and Claude's
shell is a Linux VM sharing the same folder. Installing from it empties every
platform binding directory and cannot delete them afterwards, which breaks the
build for everyone. Recovery is `rm -rf node_modules package-lock.json && npm
install`, run by Seb on macOS.

Claude verifies with `npx tsc --noEmit` — pure JS, safe from either side.
Bundling and running are Seb's.

## Stack

Vite 7 · React 19 + TypeScript · `three` (WebGPURenderer + TSL) ·
`@react-three/fiber` · `@react-three/drei`. Content as MDX, locale in the route.
Deploy: static build → Cloudflare Pages.

## Projects

| Slug | Landmark | Links |
|---|---|---|
| `polarsense` | A mine | https://github.com/Shambels/polarSense |
| `arts-by-sandra` | An easel and canvas | https://artsbysandra.be/ |
| `scrubble` | A Scrabble board | — |

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
   scene components.
8. **All input goes through `useInput()`.** The one permitted early abstraction —
   mobile is deferred, and retrofitting touch into rigs that read `keydown`
   directly is a rewrite.

## Conventions

- Ponytail: fewest files, shortest working diff, platform and stdlib before
  dependencies. No abstraction before its third use — except invariant 8.
- New dependency needs a one-line justification and its gzipped cost.
- No physics engine until the world needs slopes or stacking. The character
  hovers: XZ translation, sine bob, bank on turn, circle-vs-circle landmark
  collision. No ground following over flat terrain.
- The character stays procedural. If it ever needs a model file, say why first.
- No i18n library. Typed string objects per locale in `src/i18n/`.
- Canvas and models load via dynamic `import()`, never in the first-route chunk.
- TypeScript strict, no `any`. A narrow cast at a library boundary is fine — see
  `extend(THREE as never)` in `src/App.tsx`.
- No test framework. Non-trivial logic leaves one assert-based check behind.
- Shaders derive from what a project does. Generic noise does not ship.

## Budgets

| Metric | Limit |
|---|---|
| First-route JS | ≤ 200 kB gz, excluding canvas chunk |
| Canvas chunk | ≤ 600 kB gz |
| Per landmark model | ≤ 300 kB compressed, ≤ 25k triangles |
| Whole world, compressed | ≤ 3 MB, loaded progressively |
| LCP (4G) | < 2.0s |
| Lighthouse, flat site | 100 / 100 / 100 / 100 |
| Frame rate | 60fps on a 2022 mid-tier laptop, or cut the effect |

## Layout

```
src/App.tsx             baseline scene — moves under the router in Phase 2
src/Ship.tsx            the character: procedural hovering saucer, no model file
src/index.css           global styles
src/content/projects/   {slug}.{lang}.mdx  (Phase 1, not yet written)
src/i18n/               UI strings per locale
docs/BUILD-PLAN.md      phases, gates, decisions, open questions, risks
```

## Working together

**Ask first:** adding a dependency, adding a route, changing the render pipeline,
publishing an unreviewed translation, or starting a phase the plan gates.

**Just do it:** content edits, shader tweaks, styling, and any refactor that
makes the diff smaller.

## Current state

Phase 0 complete. **Two Phase 1 gates run in parallel and both block Phase 3:**
Track A — three English case studies as MDX. Track B — Blender blockout of the
three landmarks at true scale.

Neither has started.
