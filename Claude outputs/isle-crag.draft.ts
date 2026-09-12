/**
 * DRAFT — a crescent isle: a round lagoon almost enclosed by the island, one
 * narrow entrance for the ship, and the spire standing over the lagoon's far
 * shore with the fall coming down into it. Written against `src/isles.ts` and
 * not applied to it. Nothing here is committed.
 *
 * `palm-isle` carries none of these terms and evaluates bit-for-bit as it does
 * today — checked through this very code: coast 3.55e-28, summit 14.00.
 *
 * **This is the pass that breaks an invariant, and it is the one the shape
 * asks for.** Everything before it kept the island star-convex — one coast per
 * bearing, which is what `offshore()` is built on. A "C" is not that: a ray
 * from the middle crosses water, then land, then water again. So the coast
 * stops being a radius and the push out of it stops being radial. Both
 * replacements are below, and both are checked.
 */

export type Isle = {
  id: string
  pos: [number, number]
  radius: number
  seed: number
  peak: number
  ridge: number

  /**
   * The enclosed water. `centre` is how far the lagoon's own centre sits from
   * the island's, toward the entrance — the offset is what makes a crescent
   * rather than a doughnut. `radius` is the basin, `mouth` the half-width of
   * the entrance, `floor` how deep, `shelf` how fast it deepens off its own
   * shore, `band` how wide that shore is before the island's height takes
   * over, `round` the rounding of the throat where the channel meets the
   * basin.
   */
  lagoon?: {
    bearing: number
    centre: number
    radius: number
    mouth: number
    floor: number
    shelf: number
    band: number
    round: number
  }

  /** A crag instead of a crown, and `off` metres back from the island's
   *  centre — it has to be: the lagoon's centre is the other way, and a summit
   *  over the island's own centre would be a summit under water. */
  spire?: { share: number; spread: number; sharp: number; off: number }

  /** The fall's chute, cut in the spire's lagoon-facing side. */
  gorge?: { width: number; depth: number; lip: number; lipW: number }

  /** Jaggedness in XZ, never in `theta`, and faded to nothing at the summit so
   *  `peak` stays the number it says. */
  crag?: { amp: number; scale: number; from: number; to: number }
}

const S = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/** Polynomial smooth minimum — the union of two water shapes without a crease
 *  where they meet. `k` is how many metres the rounding is spread over. */
const smin = (a: number, b: number, k: number) => {
  const t = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k))
  return mix(b, a, t) - k * t * (1 - t)
}

/**
 * The island's outer rim. The harmonics are untouched — no notch, no bay, no
 * `reach`. **And it is no longer the whole coast**: the lagoon inside it is
 * not a radius from here and cannot be made into one.
 *
 * It is still exactly right for what most callers want it for — the polar grid
 * in `Isle.tsx`, `shoal()`'s circle, the rejection test in `ground()` — and it
 * is still where the ground crosses zero on every bearing but the 67 of 1440
 * that are the entrance. What it can no longer do on its own is `offshore`.
 */
export function isleShore(i: Isle, theta: number) {
  return (
    i.radius *
    (1 +
      0.115 * Math.sin(3 * theta + i.seed) +
      0.062 * Math.sin(5 * theta + i.seed * 2.3) -
      0.048 * Math.sin(7 * theta + i.seed * 0.7))
  )
}

export const RIM_MAX = 1.225
const BERM = 1.25
const APRON = 3.4
const SHOULDER = 9.0
const RIDGE_SQUEEZE = 0.45
const LAGOON = 1.5
const DROP = 9
const SEABED = 15
export const ISLE_EXTENT = 1.46

/**
 * How far a point is OUTSIDE the enclosed water, in metres — negative inside
 * it, zero on its shoreline, and it is a real distance rather than a ratio.
 *
 * The lagoon is a circle; the entrance is a corridor running out of it along
 * the bearing; the two are joined with a smooth minimum, so the throat is a
 * throat and not two square corners.
 *
 * **A signed distance and not an angle, and that is the whole change of
 * approach.** Angles are measured from a centre and this island has two of
 * them: the rim's and the lagoon's. Everything the previous drafts fought —
 * the cusp at the head of a gaussian notch, the wedge that had to widen
 * seaward, the mesh grid running out of radius inside the bay — was that
 * mismatch. In a distance field the shape is just the shape.
 */
export function lagoonDist(i: Isle, dx: number, dz: number) {
  const l = i.lagoon!
  const bx = Math.cos(l.bearing)
  const bz = Math.sin(l.bearing)
  const ex = dx - bx * l.centre
  const ez = dz - bz * l.centre
  const dCircle = Math.hypot(ex, ez) - l.radius
  const along = ex * bx + ez * bz
  const perp = -ex * bz + ez * bx
  const dChannel = Math.max(
    Math.abs(perp) - l.mouth,
    l.radius * 0.5 - along,
    along - (i.radius * RIM_MAX - l.centre + 6),
  )
  return smin(dCircle, dChannel, l.round)
}

export function isleHeight(i: Isle, x: number, z: number): number {
  const dx = x - i.pos[0]
  const dz = z - i.pos[1]
  const r = Math.hypot(dx, dz)
  const theta = Math.atan2(dz, dx)
  const u = r / isleShore(i, theta)

  // ---- the beach, unchanged ----------------------------------------------
  let h =
    BERM * S(1, 0.9, u) +
    (APRON - BERM) * S(0.9, 0.62, u) +
    (SHOULDER - APRON) * S(0.62, 0.3, u)

  // ---- the crown, and it is no longer over the middle ---------------------
  const sp = i.spire
  const ox = sp?.off ? -Math.cos(i.lagoon!.bearing) * sp.off : 0
  const oz = sp?.off ? -Math.sin(i.lagoon!.bearing) * sp.off : 0
  const px = dx - ox
  const pz = dz - oz
  const c = Math.cos(i.ridge)
  const sn = Math.sin(i.ridge)
  const q = Math.hypot((px * c + pz * sn) * RIDGE_SQUEEZE, -px * sn + pz * c) / i.radius
  const crest = S(0.36, 0.05, q)
  const pin = sp ? Math.pow(S(sp.spread, 0, q), sp.sharp) : 0
  h += (i.peak - SHOULDER) * (sp ? crest * (1 - sp.share) + pin * sp.share : crest)

  // ---- the gullies, now cut round the PEAK rather than the island's centre
  //
  // Same term, same 0.075, same 4.3 lobes. What changed is where its angle is
  // measured from. Water cuts gullies running off a summit, so once the summit
  // moves off the island's centre they have to move with it — otherwise the
  // axis fade that keeps them off the peak sits eleven metres away from the
  // peak, and the summit comes out 13 mm short of `peak` for no reason anyone
  // could name. Found by the assert, not by looking.
  const thetaS = Math.atan2(pz, px)
  const uS = Math.hypot(px, pz) / i.radius
  h *= 1 - 0.075 * (0.5 + 0.5 * Math.sin(4.3 * thetaS + i.seed * 1.7)) *
    S(1, 0.45, uS) * S(0.02, 0.2, uS)

  // ---- the fall's chute, in the spire's lagoon-facing side ----------------
  const g = i.gorge
  if (g) {
    const across = Math.exp(-((wrap(thetaS - i.lagoon!.bearing) / g.width) ** 2))
    const along = S(g.lip - g.lipW, g.lip + g.lipW, uS)
    h *= 1 - g.depth * across * along
  }

  // ---- crag detail --------------------------------------------------------
  const cr = i.crag
  if (cr) {
    const k = cr.scale
    const n =
      0.55 * Math.sin(dx * k + dz * k * 0.6 + i.seed) * Math.sin(dz * k * 1.3 - dx * k * 0.4) +
      0.30 * Math.sin(dx * k * 2.1 - dz * k * 1.7 + i.seed * 2) * Math.sin(dz * k * 2.4 + dx * k * 0.9) +
      0.15 * Math.sin(dx * k * 4.3 + dz * k * 3.1) * Math.sin(dz * k * 3.7 - dx * k * 2.2)
    h += cr.amp * n * S(cr.from, cr.to, h) * S(0.02, 0.12, q)
  }

  // ---- the sea outside, unchanged ----------------------------------------
  h -=
    LAGOON * S(1, 1.1, u) +
    (DROP - LAGOON) * S(1.1, 1.34, u) +
    (SEABED - DROP) * S(1.34, ISLE_EXTENT, u)

  // ---- and the lagoon carved out of all of it ----------------------------
  //
  // The floor saturates at `floor` going in, with slope 1 at the shoreline, so
  // the first metre off its beach shelves exactly as it does everywhere else
  // and only the bottom flattens. Going out, the island's own height is ramped
  // in over `band` metres — that ramp is the lagoon's shore, and it is short,
  // because forest at the water is a wall and not a beach.
  //
  // The `min` before the ramp is what keeps the open sea open: on land it
  // picks the flat zero the ramp climbs from, and in water already deeper than
  // the lagoon it picks that deeper water and the ramp does nothing at all.
  // Without it the entrance would build a bar across its own mouth.
  if (i.lagoon) {
    const d = lagoonDist(i, dx, dz)
    const floor = -i.lagoon.floor * (1 - Math.exp(Math.min(d, 0) / i.lagoon.shelf))
    h = mix(Math.min(h, floor), h, S(0, i.lagoon.band, d))
  }

  return h
}

/* ---------------------------------------------------------------------------
 * What `offshore()` has to become.
 * ------------------------------------------------------------------------ */

/**
 * A push out of land along the ground's own gradient, rather than out to a
 * radius.
 *
 * The radial version worked because every island was star-convex: "out" was a
 * direction you could name from the centre. A crescent has two coasts on most
 * bearings and the push has to know which one the hull is behind — and the
 * ground field already knows. It is negative in water and positive on land;
 * its gradient points uphill; walk down it. One Newton step lands on the
 * waterline if the slope holds, and the slope does not hold, which is what the
 * loop is for.
 *
 * Checked from 4,320 points of land: every one reaches water, worst case 60
 * steps and 34 m — and those are points in the middle of the massif, which no
 * hull is ever at. A hull is a metre inside its own shoreline and takes one or
 * two.
 *
 * It costs four height samples a step where the radial push cost none. It also
 * ends the star-convex constraint for good, which is worth more than it costs:
 * it is the same function for the three landmark islands, for `palm-isle` and
 * for anything either of us draws later.
 */
export function pushOut(i: Isle, p: { x: number; z: number }, clear = 0.35, maxSteps = 60) {
  const e = 0.5
  let { x, z } = p
  for (let n = 0; n < maxSteps; n++) {
    const h = isleHeight(i, x, z)
    if (h < -clear) break
    const gx = (isleHeight(i, x + e, z) - isleHeight(i, x - e, z)) / (2 * e)
    const gz = (isleHeight(i, x, z + e) - isleHeight(i, x, z - e)) / (2 * e)
    const g2 = gx * gx + gz * gz
    if (g2 < 1e-8) break
    const t = Math.min(8, (h + clear) / g2)
    x -= gx * t
    z -= gz * t
  }
  return { x, z }
}

/* ---------------------------------------------------------------------------
 * The island.
 * ------------------------------------------------------------------------ */

const BEARING = Math.PI * 0.72

export const CRAG_ISLE: Isle = {
  id: 'crag-isle',
  pos: [58, -54],
  radius: 35,
  seed: 5.1,
  peak: 23,
  // Across the entrance, not along it: the squeeze makes the crown's footprint
  // reach furthest along the ridge, and along the entrance is exactly where
  // there must be no crown left by the time the coast arrives.
  ridge: BEARING + Math.PI / 2,
  spire: { share: 0.78, spread: 0.30, sharp: 1.45, off: 11 },
  lagoon: {
    bearing: BEARING,
    centre: 11,
    radius: 13.5,
    mouth: 4.5,
    floor: 3.6,
    shelf: 5,
    band: 3.5,
    round: 2.5,
  },
  gorge: { width: 0.26, depth: 0.55, lip: 0.20, lipW: 0.04 },
  crag: { amp: 1.8, scale: 0.22, from: 8.5, to: 14.5 },
}

/* ---------------------------------------------------------------------------
 * Measured, not guessed.
 *
 *   the lagoon        27 m across, 3.4 m deep, its floor flat in the middle
 *   the entrance      9.0 m at its narrowest, 15 m out from the lagoon's
 *                     centre — the hull is 2 across
 *   the crescent      5 m of land at the entrance, 13 m at the horns,
 *                     27-36 m round the back where the spire stands
 *   the fall's face   23 m at the spire down to 0 in 8 m of run, the last
 *                     11 m of it in the final two — which is the cliff the
 *                     water comes over, and it exists because the spire is
 *                     that close to the lagoon rather than because a term
 *                     was added to make it
 *   the summit        23.000 of 23, at the spire's centre
 *
 * What `isles.check.ts` becomes. Four of its asserts survive as written:
 *
 *   ground is zero on the rim   PASS  3.55e-28, off the 67 bearings of 1440
 *                                     that are the entrance — and those are
 *                                     named by `lagoonDist`, not skipped
 *   rim inside RIM_MAX          PASS  1.212 / 1.225
 *   summit is exactly peak      PASS  23.000 — at the spire's centre now
 *   skirt reaches the seabed    PASS
 *
 * Two do not, and cannot:
 *
 *   "the ground is zero at its own waterline, on every bearing" — the lagoon's
 *   shoreline is not on any bearing's list. It is exact by construction
 *   instead: the carve returns `min(h, 0)` at d = 0.
 *
 *   "the profile climbs the whole way in" — the lagoon is a dip on every
 *   bearing that crosses it, and that is the feature. What the assert was
 *   *for* was the saucer diving into a hole it then has to climb out of, so
 *   that is what gets asserted instead, along with the two things the new
 *   shape can get wrong:
 *
 *   no dry basin in the land       PASS  0 pits on a 22 cm grid
 *   the entrance is open to sea    PASS  9.0 m at its narrowest
 *   pushOut always reaches water   PASS  4,320 starts, worst 60 steps
 *
 * ---------------------------------------------------------------------------
 * What this costs elsewhere, and none of it is free.
 *
 * 1. **`world.ts`'s `offshore` is the real bill.** It is a radial push today
 *    and it is what every hull depends on. `pushOut` above replaces it for
 *    isles; the three landmark islands can keep the radial version or move to
 *    the same one. The mooring asserts ("the circles do not overlap") still
 *    hold — they are about landmarks, not about this.
 *
 * 2. **`MiniMap` draws `isleShore` and would show a solid island.** The lagoon
 *    and its channel have to be drawn too, which is a circle and a rectangle
 *    in the same projection — small, but it is the world's index and an island
 *    you can sail into the middle of should look like one.
 *
 * 3. **`Isle.tsx`'s polar grid resolves the lagoon unevenly.** 152 segments at
 *    r = 24 is a metre of arc, and the lagoon's shore band is 3.5 m wide — so
 *    the wall round the basin gets three quads to stand on. The ring list
 *    wants rethinking near the lagoon, or the segment count goes up. (The
 *    *extent* problem the last draft had is gone: the rim is untouched, so the
 *    grid still covers everything.)
 *
 * 4. **The lagoon is ringed by cliffs and the surfer can walk up them.**
 *    83 degrees at the steepest, and `beach.ts` gates nothing. `band` is the
 *    lever — it is what buys forest at the water instead of a beach, and a
 *    wall is what it makes. Either it comes up on the entrance-facing arc so
 *    there is one place to land, or `beach.ts` grows a maximum grade and
 *    `beach.check.ts` an assert for it.
 *
 * 5. **The saucer's ground following has not been looked at over this.** It
 *    was tuned on a 13 m ridge; this is 23 m with a 3.4 m hole in it. `RISE`
 *    and `FOLLOW` are a guess until someone flies it.
 *
 * And the fall itself is still scenery, not geometry: what is here is the
 * chute and the cliff. The water is a TSL sheet on that face and a burst of
 * spray at its foot — and the spray is WebGPU only, so it has to read without.
 * ------------------------------------------------------------------------ */
