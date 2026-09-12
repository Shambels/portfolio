/**
 * The cave and the stair: a way up the inside of the crag isle's spire, from a
 * hidden strand under the waterfall to a ledge on the flank near the top.
 *
 * Plural, and that is not a style choice: `Stair.tsx` is the component beside
 * it, macOS cannot tell one from the other, and TypeScript refuses the pair
 * outright. The same trap `isles.ts` and `Scenery.tsx` are already named
 * around, walked into again by somebody who knew about it.
 *
 * THE PROBLEM, stated once. `ground(x, z)` has room for one height per point
 * and a cave needs two — the floor underfoot and the mountain overhead. No
 * heightfield holds that, and this world's collision, its mesh, its walk and
 * its camera floor are all that one function. So the stair is not a
 * heightfield: it is a **rail**. A parametric centreline through the rock with
 * a half-width and a headroom, and a character who, while he is inside it,
 * takes his position from the curve instead of from the ground.
 *
 * Which is the shape of answer `beach.ts` already is — a mode with its own
 * vertical, pure arithmetic, no `three` — so `node src/stair.check.ts` walks a
 * man up it and asserts every tread, the roof over his head and the rock
 * outside the wall. The tunnel mesh in `Stair.tsx` is a tube swept along this
 * same curve: one function for the collision and the geometry, which is the
 * rule the water and the hull already live by.
 *
 * The one idea that makes it fit inside a mountain that was not designed
 * around it: **the stair hugs the skin.** Its radius at every turn is not a
 * number anybody chose. It is solved, sample by sample, as the distance from
 * the spire's axis at which the island's own surface stands `roof` above where
 * the ceiling would be — so the passage spirals up at a fixed depth inside the
 * rock the way a cut stair in a real headland does, and retuning the island
 * moves the stair with it instead of leaving it hanging out of a cliff.
 */

import { ISLES, type Isle, isleHeight } from './isles.ts'

const S = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t
const TAU = Math.PI * 2

/** What has to fit. The rider is 1.8 tall and about half a metre across the
 *  shoulders; these are what the passage is checked against, not what it is
 *  drawn at. */
export const MAN = { height: 1.8, shoulders: 0.52 }

/**
 * A stair a person climbs: 18 cm of rise on 30 cm of going, which is 31
 * degrees. Steeper than a house stair, gentler than a ladder, and sized on the
 * walk cycle rather than on a building code — `WALK_STRIDE` is 0.40, so one
 * pace is one tread and he never has to shuffle.
 *
 * The treads are the *mesh's*. His feet follow the smooth centreline under
 * them, which is what a stair's collision is in every engine that has one, and
 * is why `follow()`'s lag is not needed in here: there is no step to lag.
 */
export const STEP = { rise: 0.18, going: 0.30 }

export const STAIR = {
  /** Which isle it is cut into — by id, so a reordered `ISLES` cannot silently
   *  put a staircase inside a different mountain. */
  isle: 'crag-isle',

  /** The mouth: metres from the spire's axis along the fall's own bearing,
   *  which is the back wall of the strand's alcove. */
  mouthR: 4.05,
  /** The strand's sand, and the floor of the passage off it. */
  mouthY: 0.62,

  /** How high it goes and how far round. Less than a full turn, deliberately:
   *  see `cap`. */
  y1: 17.4,
  turns: 0.9,
  /** -1 is clockwise seen from above, chosen so the first quarter turn bears
   *  into the thick of the crescent rather than out along the cliff. */
  hand: -1,

  /** The passage. 1.15 either side of the centreline is two people passing;
   *  2.35 of headroom is the rider with 55 cm over his head. */
  half: 1.15,
  head: 2.35,

  /** How much rock has to stand over the ceiling. Asserted, not hoped. */
  roof: 2.6,

  /**
   * The furthest from the axis the passage is allowed to wander.
   *
   * Hugging the skin alone is not enough, and the first draft proved it: down
   * at the bottom the mountain is only five metres tall, so "as deep as the
   * roof wants" is fifteen metres out from the axis, and the stair came out a
   * 99 m coast path at 10 degrees. A smaller radius is deeper rock, so a cap
   * can only ever make it safer — and it is what turns a wandering contour
   * into a spiral.
   *
   * It is also why `turns` is under one. A spiral of more than a full turn
   * comes back over its own mouth, and its own mouth is a hollow: the strand's
   * alcove is cut out of the rock exactly where the passage wanted to pass at
   * fifteen metres up, and the check found a metre and a half of window onto
   * the beach.
   */
  cap: 4.8,

  /**
   * The throat: how far in the passage dives before it begins to spiral.
   *
   * Arithmetic and not decoration. The alcove's inner edge stands 4.3 m from
   * the axis and its blend reaches in to 3.75. A passage whose outer wall is
   * inside that hollow is a passage with a window onto the beach, and the wall
   * is `half` out from the centreline — so the centreline has to be under 2.6
   * before it can turn. Found by the cover check, twice.
   */
  throat: 2.5,

  /** How much of each end is portal: where there is deliberately no rock
   *  overhead, because that is what a doorway is. The exit's is wider than the
   *  mouth's — it turns out to meet the flank rather than punching through a
   *  wall. */
  inset: 0.05,

  /** How close to a portal, in metres of XZ, counts as being at it. */
  reach: 2.2,
}

/* -------------------------------------------------------------------------
 * The isle, and where the spire stands in it.
 * ---------------------------------------------------------------------- */

const ISLE: Isle = (() => {
  const i = ISLES.find((k) => k.id === STAIR.isle)
  if (!i) throw new Error(`stair: no isle called ${STAIR.isle}`)
  return i
})()

/** The fall's bearing, which is also the strand's and the entrance's. */
export const BEARING = ISLE.lagoon!.bearing

/** The spire's axis in world XZ — the summit is over this, not over `pos`. */
export const AXIS = {
  x: ISLE.pos[0] - Math.cos(BEARING) * (ISLE.spire?.off ?? 0),
  z: ISLE.pos[1] - Math.sin(BEARING) * (ISLE.spire?.off ?? 0),
}

const groundAt = (x: number, z: number) => isleHeight(ISLE, x, z)
const gPolar = (r: number, phi: number) =>
  groundAt(AXIS.x + Math.cos(phi) * r, AXIS.z + Math.sin(phi) * r)

const phiAt = (t: number) => BEARING + STAIR.hand * t * STAIR.turns * TAU

/**
 * The radius, on a bearing, at which the island's surface stands at `want`.
 *
 * Scanned outward for the FIRST crossing and then refined, rather than
 * bisected. The flank mostly falls away outward but not everywhere — the crag
 * term puts bumps in it and the strand cuts a flat disc out of its foot — and
 * a bisection on a profile with a bump in it finds a root, just not the one
 * anybody meant. The first one going out is the one that means "here is where
 * the mountain stops being this tall".
 */
function radiusAtHeight(phi: number, want: number): number {
  let prev = gPolar(0.6, phi)
  for (let r = 0.8; r <= 24; r += 0.15) {
    const g = gPolar(r, phi)
    if (g <= want && prev > want) {
      let lo = r - 0.15
      let hi = r
      for (let k = 0; k < 26; k++) {
        const m = (lo + hi) / 2
        if (gPolar(m, phi) > want) lo = m
        else hi = m
      }
      return (lo + hi) / 2
    }
    prev = g
  }
  return 24
}

/** Where the stair comes out: solved, not chosen — the radius on the last
 *  bearing at which the flank is exactly as high as the floor arrives. */
const EXIT_R = radiusAtHeight(phiAt(1), STAIR.y1)

/**
 * The radius at a turn, given how high the floor is there.
 *
 * `- half` and not the centreline: it is the OUTER wall that has the least
 * rock over it, every time, and solving for the middle of the passage put a
 * metre and a half of window into the flank for a quarter of the climb.
 */
function radiusFor(t: number, y: number): number {
  const phi = phiAt(t)
  const skin = Math.min(radiusAtHeight(phi, y + STAIR.head + STAIR.roof) - STAIR.half, STAIR.cap)
  let r = mix(STAIR.mouthR, STAIR.throat, S(0, STAIR.inset, t))
  r = mix(r, skin, S(STAIR.inset, 0.25, t))
  return mix(r, EXIT_R, S(1 - STAIR.inset * 1.4, 1, t))
}

export type Rung = {
  /** Parameter along the shape, 0 at the mouth and 1 at the exit. */
  t: number
  /** Arc length from the mouth, in metres — what a walk is measured in. */
  s: number
  x: number
  y: number
  z: number
  /** Bearing round the axis, and distance from it. */
  phi: number
  r: number
  /** Heading along the rail, `atan2(dx, dz)` — the same convention as the
   *  ship's yaw. */
  yaw: number
}

/**
 * The whole curve, built once and lazily.
 *
 * **The climb is paced by the going and not by the parameter**, which is the
 * difference between a stair and a ramp with a kink in it. Where the passage
 * dives in through the wall it barely moves in plan, and a climb handed out
 * evenly in `t` spends a metre and a half of rise in half a metre of going:
 * the check read 45 degrees there, and a 45-degree stair is a ladder.
 *
 * So: lay the plan out, measure how far it goes, and hand out the rise in
 * proportion. The radius depends on the height and the height now depends on
 * the radius, so it is a fixed point — three passes, and the third moves
 * nothing by more than a millimetre. The result is a constant grade the whole
 * way, which is what a stair is.
 *
 * Lazy because this is the canvas chunk's arithmetic and the flat site should
 * not pay for a staircase it never draws.
 */
const N = 320
let PATH: Rung[] | null = null

export function stairPath(): Rung[] {
  if (PATH) return PATH
  const climb = STAIR.y1 - STAIR.mouthY
  let ys = Array.from({ length: N + 1 }, (_, i) => STAIR.mouthY + climb * (i / N))
  let pts: Rung[] = []
  for (let pass = 0; pass < 3; pass++) {
    pts = []
    let flat = 0
    let px = 0
    let pz = 0
    const flats: number[] = []
    for (let i = 0; i <= N; i++) {
      const t = i / N
      const phi = phiAt(t)
      const r = radiusFor(t, ys[i]!)
      const x = AXIS.x + Math.cos(phi) * r
      const z = AXIS.z + Math.sin(phi) * r
      if (i) flat += Math.hypot(x - px, z - pz)
      flats.push(flat)
      pts.push({ t, s: 0, x, y: ys[i]!, z, phi, r, yaw: 0 })
      px = x
      pz = z
    }
    const total = flats[N]! || 1
    ys = flats.map((f) => STAIR.mouthY + climb * (f / total))
  }
  // The heights first, ALL of them, and only then the arc length over the
  // finished shape. Measuring while overwriting means every segment is the gap
  // between a new height and an old one, and the length comes out three times
  // what it is — which is exactly what it did.
  for (let i = 0; i <= N; i++) pts[i]!.y = ys[i]!
  let s = 0
  for (let i = 0; i <= N; i++) {
    const p = pts[i]!
    if (i) {
      const q = pts[i - 1]!
      s += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
    }
    p.s = s
  }
  for (let i = 0; i <= N; i++) {
    const a = pts[Math.max(0, i - 1)]!
    const b = pts[Math.min(N, i + 1)]!
    pts[i]!.yaw = Math.atan2(b.x - a.x, b.z - a.z)
  }
  PATH = pts
  return PATH
}

/** How long the stair is, in metres of going. */
export const stairLength = () => stairPath()[N]!.s

/** The rail at an arc length from the mouth, clamped to its own ends. */
export function stairAt(s: number): Rung {
  const p = stairPath()
  const m = Math.min(Math.max(s, 0), p[N]!.s)
  let lo = 0
  let hi = N
  while (hi - lo > 1) {
    const k = (lo + hi) >> 1
    if (p[k]!.s < m) lo = k
    else hi = k
  }
  const a = p[lo]!
  const b = p[hi]!
  const f = (m - a.s) / Math.max(1e-9, b.s - a.s)
  // `yaw` is interpolated on the shortest way round, because the spiral passes
  // through pi and a naive lerp there spins a man on the spot.
  const d = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw))
  return {
    t: mix(a.t, b.t, f), s: m,
    x: mix(a.x, b.x, f), y: mix(a.y, b.y, f), z: mix(a.z, b.z, f),
    phi: mix(a.phi, b.phi, f), r: mix(a.r, b.r, f),
    yaw: a.yaw + d * f,
  }
}

export const stairMouth = () => stairAt(0)
export const stairExit = () => stairAt(stairLength())

/**
 * How far a point is outside the tunnel's own width at an arc length — used by
 * the walk to hold him off the walls, and by the mesh for nothing at all.
 */
export const STAIR_LATERAL = STAIR.half - MAN.shoulders / 2 - 0.08

/**
 * Is he at a door, and facing into it?
 *
 * Both ends, one function, and the sign of `into` is the only difference: the
 * mouth is entered heading away from the lagoon and the exit heading into the
 * hill. A door you can only walk in through is a door you cannot be shoved
 * through by a wave, which matters at the mouth, because the mouth is on a
 * beach.
 */
export function atDoor(x: number, z: number, yaw: number): 'mouth' | 'exit' | null {
  for (const [which, p, sign] of [
    ['mouth', stairMouth(), 1],
    ['exit', stairExit(), -1],
  ] as const) {
    if (Math.hypot(x - p.x, z - p.z) > STAIR.reach) continue
    // his heading against the rail's, at that end
    const want = p.yaw
    const dot = Math.cos(yaw) * Math.cos(want) + Math.sin(yaw) * Math.sin(want)
    if (dot * sign > 0.2) return which
  }
  return null
}

/** The ground the isle would report at a point — exported so the check and the
 *  mesh do not each go and find the isle again. */
export const stairGround = groundAt
