/**
 * The waterfall: off the landing pad at the top of the stair, down the face
 * above the hidden strand, into the bay.
 *
 * Plural, for the third time in this island's life and for the same reason:
 * `Fall.tsx` is the component beside it and macOS cannot tell the two apart.
 * `isles.ts`, `stairs.ts`, and now this. Caught by `tsc` again rather than by
 * a deploy, which is the only reason it is only ever an annoyance.
 *
 * It exists for two reasons and the second is the one that fixes its shape. It
 * is the thing the reference photograph is built around — a fall coming off a
 * crag into a lagoon — and it is **what hides the cave**. The doorway at the
 * back of the alcove is a hole in a cliff and reads as one from anywhere on
 * the water; a curtain in front of it is what turns it into something you find
 * rather than something you spot.
 *
 * So the geometry is not free. The pad is 25 degrees round the spire from the
 * alcove and two and a half metres further out, and a sheet hanging straight
 * off it would come down three and a half metres to one side of the door. What
 * hangs here instead is a curtain whose lip **leaves the pad and settles onto
 * the rim**, sweeping round in front of the alcove, and which leans outward as
 * it falls the way water does. `fall.check.ts` asserts the doorway is behind
 * it from every angle anybody can look from.
 *
 * No `three` and no scene: this is the arithmetic, and `Fall.tsx` is the mesh
 * swept along it. One function for the shape and the picture, which is the
 * rule the water and the hull already live by — and the reason node can assert
 * a thing that is otherwise a matter of standing in the right place.
 */

import { ISLES, type Isle, isleHeight } from './isles.ts'
import { radiusAtHeight, stairExit } from './stairs.ts'

const S = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const DEG = Math.PI / 180

export const FALL = {
  isle: 'crag-isle',

  /**
   * How far round from the fall's own bearing the lip's far edge reaches,
   * against the near edge at the landing pad.
   *
   * The alcove is 15 degrees wide either side of that bearing at the height of
   * its back wall, and the pad sits 25 degrees round the other way — so the
   * lip spans a little over forty degrees in all, and the curtain is widest
   * exactly where the door is.
   */
  to: -13 * DEG,

  /** How much of the lip's run is spent coming off the pad and onto the rim.
   *  Short: the water leaves the ledge and is on the rock within a fifth of
   *  the sweep, which is what makes it read as pouring off the pad rather than
   *  as a sheet that happens to start near it. */
  settle: 0.22,

  /** How far out the curtain has drifted by the time it reaches the water.
   *  A fall is a parabola, so the drift goes as the square root of the drop —
   *  half of it is spent in the first quarter of the fall. */
  reach: 3.2,

  /**
   * How much wider the curtain is at the bottom than at the lip — and it
   * widens on ONE side only.
   *
   * Spread evenly, its near edge swings round into the hill as it falls, and
   * what is round the hill at that bearing is the terrace: seventeen metres of
   * shelf, which the check found the water pouring into fourteen metres below
   * where the rock had any business being. So the far edge opens out over the
   * bay and the near edge tucks the other way, which is also what water thrown
   * off a ledge does — it spreads into the air, not back into the cliff.
   */
  spread: 6 * DEG,
  tuck: 6 * DEG,

  /** Where the sheet stops and the plunge starts, in metres above the water. */
  base: 0.15,
}

const ISLE: Isle = (() => {
  const i = ISLES.find((k) => k.id === FALL.isle)
  if (!i) throw new Error(`fall: no isle called ${FALL.isle}`)
  return i
})()

const BEARING = ISLE.lagoon!.bearing
export const AXIS = {
  x: ISLE.pos[0] - Math.cos(BEARING) * (ISLE.spire?.off ?? 0),
  z: ISLE.pos[1] - Math.sin(BEARING) * (ISLE.spire?.off ?? 0),
}

/** The pad, which is also the lip's near edge: the stair's own last step. */
const PAD = (() => {
  const p = stairExit()
  const a = wrap(Math.atan2(p.z - AXIS.z, p.x - AXIS.x) - BEARING)
  return { phi: a, r: Math.hypot(p.x - AXIS.x, p.z - AXIS.z), y: p.y }
})()

export const TOP = PAD.y
const DROP = TOP - FALL.base

/** Bearing along the lip, `v` from 0 at the pad to 1 at the far edge, and how
 *  much wider the curtain has got by then. */
const lipNear = (d: number) => PAD.phi - FALL.tuck * d
const lipFar = (d: number) => FALL.to - FALL.spread * d
const lipPhi = (v: number, d = 0) => BEARING + mix(lipNear(d), lipFar(d), v)

/**
 * The lip at `v`: on the pad's own corner at one end, and on the rim the rest
 * of the way — solved from the island, never written down, so the fall stays
 * on the cliff when the cliff moves.
 */
export function fallLip(v: number) {
  const phi = lipPhi(v)
  const rim = radiusAtHeight(phi, TOP)
  const r = mix(PAD.r, rim, S(0, FALL.settle, v))
  return { phi, r, x: AXIS.x + Math.cos(phi) * r, y: TOP, z: AXIS.z + Math.sin(phi) * r }
}

/** A point on the curtain: `v` across it, `d` from 0 at the lip to 1 at the
 *  water. */
export function fallAt(v: number, d: number) {
  const phi = lipPhi(v, d)
  // The lip's radius is taken at the same `v` without the spread, so the sheet
  // widens without the whole of it sliding round the hill.
  const rim = radiusAtHeight(lipPhi(v), TOP)
  const r0 = mix(PAD.r, rim, S(0, FALL.settle, v))
  const r = r0 + FALL.reach * Math.sqrt(Math.max(0, d))
  return {
    x: AXIS.x + Math.cos(phi) * r,
    y: TOP - DROP * d,
    z: AXIS.z + Math.sin(phi) * r,
    r,
    phi,
  }
}

/**
 * How far a point is OUTSIDE the curtain, in metres — negative behind it,
 * positive on the bay's side, and `null` where the curtain is not.
 *
 * The curtain is a ruled surface and every one of its three coordinates is
 * invertible, so this is arithmetic rather than a search: the height gives the
 * drop, the drop and the bearing give the place across, and those give the
 * radius the water is at.
 */
export function fallDepth(x: number, y: number, z: number): number | null {
  const d = (TOP - y) / DROP
  if (d < 0 || d > 1) return null
  const dx = x - AXIS.x
  const dz = z - AXIS.z
  const phi = wrap(Math.atan2(dz, dx) - BEARING)
  const n = lipNear(d)
  const f = lipFar(d)
  const v = (phi - n) / (f - n)
  if (v < 0 || v > 1) return null
  const rim = radiusAtHeight(lipPhi(v), TOP)
  const r0 = mix(PAD.r, rim, S(0, FALL.settle, v))
  return Math.hypot(dx, dz) - (r0 + FALL.reach * Math.sqrt(d))
}

/**
 * Does the straight line from `a` to `b` pass through the curtain?
 *
 * Which is the whole question the fall was asked to answer: `a` is an eye out
 * on the water and `b` is the doorway.
 */
export function fallBlocks(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  steps = 160,
): boolean {
  let was: number | null = null
  for (let k = 0; k <= steps; k++) {
    const t = k / steps
    const d = fallDepth(mix(a.x, b.x, t), mix(a.y, b.y, t), mix(a.z, b.z, t))
    if (d === null) { was = null; continue }
    if (was !== null && (d > 0) !== (was > 0)) return true
    was = d
  }
  return false
}

/** Where the water lands, across the foot of the curtain. */
export const fallFoot = (v: number) => fallAt(v, 1)

/** How wide the foot is, in metres — what the plunge has to cover. */
export const fallFootWidth = () => {
  const a = fallFoot(0)
  const b = fallFoot(1)
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** The island's own ground, so the plunge can be laid on it without `Fall.tsx`
 *  going and finding the isle for itself. */
export const fallGround = (x: number, z: number) => isleHeight(ISLE, x, z)

export { BEARING as FALL_BEARING, PAD as FALL_PAD }
