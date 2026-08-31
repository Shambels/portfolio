# CLAUDE.md

**pinchs.be** — portfolio for a web-app / SaaS developer. Static React site, no
backend. The visitor controls a character in a 3D world; each project is a
landmark they walk up to. Trilingual EN / FR / NL.

Reference for the concept: https://messenger.abeto.co/

Full plan, phase gates and open questions: `docs/BUILD-PLAN.md`. Read it before
starting work.

## Commands

```
npm run dev        # react-router dev
npm run typecheck  # react-router typegen && tsc -b
npm run check      # the assert-based checks
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

Claude verifies with `npx react-router typegen && npx tsc --noEmit` and
`node src/i18n/locales.check.ts` — pure JS, safe from either side. Anything that
needs a real install or a real build, Claude does on a throwaway copy in its own
cloud container, never in this folder. Bundling and deploying are Seb's.

## Stack

Vite 8 · React 19 + TypeScript · React Router 8, framework mode, `ssr: false`
with `prerender` · `three` (WebGPURenderer + TSL) · `@react-three/fiber` ·
`@react-three/drei`. Content as MDX (`@mdx-js/rollup` + `remark-frontmatter`),
locale in the route. Deploy: static build → rsync → nginx on Seb's own Ubuntu
box at 167.233.245.42. No Node and no runtime on the server; `/var/www/pinchs.be`
is exactly `build/client/`. Root redirect and 404 live in `deploy/nginx.conf`,
not in a `_redirects` file.

The plan says "React Router 7"; v8 is what shipped. Same `react-router.config.ts`,
same `routes.ts`, same `root.tsx`, and v7 would have meant starting a new project
one major behind. Noted here rather than done quietly.

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
src/root.tsx            the HTML document — <html lang>, stylesheet, Scripts
src/routes.ts           the route table
src/routes/locale.tsx   :lang layout — validates the locale, chrome, hreflang
src/routes/home.tsx     /{lang}
src/routes/work.tsx     /{lang}/work
src/routes/case-study.tsx  /{lang}/work/{slug}
src/routes/not-found.tsx   /{lang}/404 — copied to build/client/404.html
src/routes/world.tsx    /world — the scene, unlinked, client-only, lazy
src/content.ts          every MDX file, keyed by slug and locale
src/i18n/               locales.ts (routing) + index.ts (strings) + a check
src/App.tsx             baseline scene — moves into the root layout in Phase 3
src/Scenery.tsx         sky, sun, ocean, clouds — all TSL, no assets
src/Islands.tsx         the ground under each landmark — lathed, no assets
src/Landmarks.tsx       the mine, the easel, the board — primitives + TSL, no assets
src/Ship.tsx            the character: procedural hovering saucer + flight controller
src/useInput.ts         invariant 8 — the only place input is read
src/world.ts            landmark layout + proximity. Moves into MDX in Phase 3
docs/STATUS.md          what is built and what is not — update it with the work
src/index.css           global styles
src/content/projects/   {slug}.{lang}.mdx  (Phase 1, not yet written)
src/i18n/               UI strings per locale
docs/BUILD-PLAN.md      phases, gates, decisions, open questions, risks
deploy.sh               build + rsync to the server, then a routing smoke test
deploy/nginx.conf       the server block — root redirect, 404, caching
```

## Content

`src/content/projects/{slug}.{lang}.mdx`, and nothing lists them anywhere else —
`react-router.config.ts` reads the directory to build its prerender list.

English carries the structural frontmatter (`year`, `stack`, `landmark`,
`waypoint`, `site`, `repo`); `fr` and `nl` carry only `title` and `summary` beside
their prose. A URL is never written down three times. A locale with no file for a
slug falls back to English rather than 404ing.

## Working together

**Ask first:** adding a dependency, adding a route, changing the render pipeline,
publishing an unreviewed translation, or starting a phase the plan gates.

**Just do it:** content edits, shader tweaks, styling, and any refactor that
makes the diff smaller.

## Current state

`docs/STATUS.md` is the source of truth. Update its boxes in the same commit as
the work.

Both Phase 1 gates are Seb's and neither has started: Track A (three English case
studies) and Track B (Blender blockout). Phase 2 is blocked on Track A.
