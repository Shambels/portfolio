# pinchs.be

Portfolio for a web-app / SaaS developer. Static React site, no backend. The
visitor flies a character around a 3D world; each project is a landmark they
approach. Trilingual EN / FR / NL.

Plan, phases and open questions: [`docs/BUILD-PLAN.md`](docs/BUILD-PLAN.md).
What is actually built: [`docs/STATUS.md`](docs/STATUS.md).

## Requirements

- Node 20.19+ or 22.12+ (Vite 8). Developed on 22.x.
- A browser with WebGL2. WebGPU is used when available and falls back on its own.

## Run it

```sh
npm install     # first time only
npm run dev     # http://localhost:5173
```

Other scripts:

```sh
npm run build    # tsc -b && vite build  →  dist/
npm run preview  # serve the built dist/ on http://localhost:4173
npm run lint     # oxlint
npx tsc --noEmit # types only, no build
```

## Test it by hand

There is no test framework — non-trivial logic leaves an assert-based check
behind instead. What is built is verified by flying it.

Run `npm run dev`, open the page, click the canvas so it has focus, then:

| | |
|---|---|
| `W` `A` `S` `D` or arrows | fly (damped velocity, banks into turns) |
| `Space`, `E` or `Enter` | interact — wired through `useInput()`, no effect yet |
| alt-tab away mid-flight | input clears; the ship must not keep flying |

Check, in order:

1. **Renderer.** The HUD line at the bottom reads `renderer: WebGPU` on Chrome
   and recent Safari, `renderer: WebGL2` elsewhere. Both are correct; neither
   should read `detecting…` after a second.
2. **Proximity.** Fly into one of the three grey boxes. Inside its radius the
   box turns light blue and the HUD swaps to that landmark's label
   (`PolarSense — the mine`, etc.). Leave the radius and it reverts. Radii and
   positions live in `src/world.ts`.
3. **Traversal — the Track B exit test.** Getting from the mine to the easel to
   the board should be interesting, not a chore. This is a judgement call made
   by flying it, and it is the gate on detailing anything.
4. **Frame rate.** 60fps on a 2022 mid-tier laptop, or the effect gets cut.
   Browser devtools' FPS meter is enough at this stage.
5. **No page scroll.** Arrows and Space move the ship, they never scroll the
   document underneath the canvas.

To check the WebGL2 path deliberately, disable WebGPU in the browser
(Chrome: `chrome://flags` → *Unsafe WebGPU Support* → Disabled) and reload; the
HUD should read `WebGL2` and everything else behave identically.

Verify a production build the same way with `npm run build && npm run preview`.

## Layout

```
src/App.tsx     baseline scene + HUD — moves under the router in Phase 2
src/Ship.tsx    the character: procedural hovering saucer + flight controller
src/useInput.ts the only place input is read (invariant 8)
src/world.ts    landmark layout + proximity — moves into MDX frontmatter in Phase 3
```

Conventions, invariants and budgets: [`CLAUDE.md`](CLAUDE.md).
