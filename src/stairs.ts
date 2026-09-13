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

  /**
   * How far the passage runs out of the flank at the top, level, before it
   * ends — a balcony.
   *
   * Not decoration. The flank at the exit stands at 66 degrees and the face
   * below it at 80, and a man who may not climb what he cannot climb (see
   * `MAX_CLIMB` in `beach.ts`) can step out of a door onto that and never get
   * back to it. So the stair ends somewhere a person can stand and turn round.
   * The rail simply keeps going at the height it arrived at; the rock stops
   * where it stops, and the last two metres of it are a ledge in the open air.
   */
  balcony: 2.6,

  /**
   * And the same at the bottom: how far the rail runs out of the doorway onto
   * the sand before it ends.
   *
   * The mirror of the balcony, and for the mirror of its reason. The doorway
   * itself is a quarter of a metre inside a wall, so a man stopped by that
   * wall and let onto the rail at the doorway is a man who jumps a quarter of
   * a metre — and a trigger generous enough to catch him walking in off the
   * square was a trigger that jumped him a whole one. With a porch, the rail
   * already reaches the sand he is standing on and there is nothing to jump.
   */
  porch: 1.5,

  /**
   * And then down the outside.
   *
   * The balcony was a stop, and a stop is not an exit: the flank it hangs over
   * stands at 66 degrees and the face below that at 80, so a man who stepped
   * off it could not walk down and could never climb back. A dead end with a
   * view is a defensible thing to build and it is not what was asked for.
   *
   * So the rail keeps going. Out of the lookout and down the outside of the
   * crag on a cut path, at the same grade as the stair inside, until the flank
   * itself is gentle enough to walk on — and there it hands him back to the
   * island. `foot` is the height it goes down to; `descent` is how far round
   * the spire it spends getting there.
   *
   * It is **cut into the rock and not laid on it**, which is the whole reason
   * it lives in `isles.ts` as `terrace` rather than here as more rail. A path
   * solved to follow this flank wanders: `radiusAtHeight` answers the first
   * crossing on each bearing and the crag term makes that jump from 4.6 m to
   * 13 m and back within a quarter turn, so the path lurched in and out of the
   * mountain and came out at nine degrees over ninety-seven metres. A shelf
   * cut at a chosen grade is a shelf; a line laid on a cliff is a scribble.
   *
   * So the descent is ground, and he walks down it the way he walks down
   * anything. `foot` is only kept here as what the check measures against.
   */
  foot: 7.6,

  /** How close to a door, in metres of XZ, counts as being at it. Small on
   *  purpose: the doorway should be a place you walk to, not a radius you
   *  blunder into from the middle of a beach. */
  reach: 1.15,
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
/** How many samples of porch stand before the doorway, and the arc lengths of
 *  the two places the rock starts and stops. Set when the path is built. */
let PORCH = 0
let DOOR_S = 0
let CLIMB_S = 0

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

  // ...and then the balcony: `STAIR.balcony` metres of level going, curving
  // from the passage's own direction round to straight out of the flank, so
  // there is no corner to turn on the spot at.
  {
    const last = pts[N]!
    const prev = pts[N - 1]!
    let tx = last.x - prev.x
    let tz = last.z - prev.z
    const tl = Math.hypot(tx, tz) || 1
    tx /= tl
    tz /= tl
    const rx = Math.cos(last.phi)
    const rz = Math.sin(last.phi)
    const M = 20
    let x = last.x
    let z = last.z
    for (let k = 1; k <= M; k++) {
      const f = S(0, 1, k / M)
      let dx = mix(tx, rx, f)
      let dz = mix(tz, rz, f)
      const dl = Math.hypot(dx, dz) || 1
      dx /= dl
      dz /= dl
      x += (dx * STAIR.balcony) / M
      z += (dz * STAIR.balcony) / M
      pts.push({ t: 1, s: 0, x, y: last.y, z, phi: Math.atan2(z - AXIS.z, x - AXIS.x), r: Math.hypot(x - AXIS.x, z - AXIS.z), yaw: 0 })
    }
  }

  let s = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (i) {
      const q = pts[i - 1]!
      s += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
    }
    p.s = s
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!
    const b = pts[Math.min(pts.length - 1, i + 1)]!
    pts[i]!.yaw = Math.atan2(b.x - a.x, b.z - a.z)
  }
  // ...and the porch: the rail run back out of the doorway onto the sand, so
  // that walking to the door is walking onto the rail.
  {
    const first = pts[0]!
    const ox = Math.cos(first.phi)
    const oz = Math.sin(first.phi)
    const M = 10
    const porch: Rung[] = []
    for (let k = M; k >= 1; k--) {
      const d = (k / M) * STAIR.porch
      porch.push({
        t: 0, s: 0, x: first.x + ox * d, y: first.y, z: first.z + oz * d,
        phi: first.phi, r: first.r + d, yaw: 0,
      })
    }
    pts.unshift(...porch)
    PORCH = porch.length
  }

  let s2 = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!
    if (i) {
      const q = pts[i - 1]!
      s2 += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z)
    }
    p.s = s2
  }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)]!
    const b = pts[Math.min(pts.length - 1, i + 1)]!
    pts[i]!.yaw = Math.atan2(b.x - a.x, b.z - a.z)
  }
  DOOR_S = pts[PORCH]!.s
  CLIMB_S = pts[PORCH + N]!.s

  PATH = pts
  return PATH
}

/** How long the whole rail is, balcony included, in metres of going. */
export const stairLength = () => { const p = stairPath(); return p[p.length - 1]!.s }

/** Where the climbing stops, which is also where the rock stops. */
export const stairClimbEnd = () => { stairPath(); return CLIMB_S }
/** And where it starts: the doorway in the strand's back wall, `porch` metres
 *  in from the rail's own beginning. */
export const stairDoorS = () => { stairPath(); return DOOR_S }


/** The rail at an arc length from the mouth, clamped to its own ends. */
export function stairAt(s: number): Rung {
  const p = stairPath()
  const last = p.length - 1
  const m = Math.min(Math.max(s, 0), p[last]!.s)
  let lo = 0
  let hi = last
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

/** The rail's outer end on the sand — where a man walking up the strand meets
 *  it, and what the door test answers at. */
export const stairMouth = () => stairAt(0)
/** The doorway itself: where the rail goes into the rock. */
export const stairDoor = () => stairAt(stairDoorS())
/** The outer end of the balcony: where he steps off, and where the door test
 *  answers at the top. */
export const stairExit = () => stairAt(stairLength())
/** Where the rail leaves the rock — the hole in the flank, which is at the
 *  *inner* end of the balcony and not at the rail's end. */
export const stairPortal = () => stairAt(stairClimbEnd())

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
/**
 * The arc length of the point on the rail nearest an XZ — what a man stepping
 * onto it should be given, rather than the end of it.
 *
 * The porch and the balcony exist so that the rail reaches the ground he is
 * standing on; this is what stops him being teleported along it anyway. 352
 * samples once, at the moment he walks through a door.
 */
export function stairNearest(x: number, z: number, y?: number): number {
  const p = stairPath()
  let best = 0
  let bestD = Infinity
  for (const r of p) {
    // Height counts double when it is given, and it has to be given from the
    // beach: the balcony passes almost overhead of the strand seventeen metres
    // up, and a search in XZ alone put a man walking up the sand at the top of
    // the stairs. Found by walking in on eleven bearings.
    const dy = y === undefined ? 0 : (r.y - y) * 2
    const d = (r.x - x) ** 2 + (r.z - z) ** 2 + dy * dy
    if (d < bestD) {
      bestD = d
      best = r.s
    }
  }
  return best
}

export function atDoor(x: number, z: number, yaw: number, y: number): 'mouth' | 'exit' | null {
  // Measured against the nearest point of the RAIL and not against its two
  // ends, which is the difference between a door and a doorknob. A man walked
  // at the back of the alcove from twelve degrees off the square is stopped by
  // the wall three quarters of a metre to one side of the porch — at the door,
  // by any reading — and a test against the porch's tip refused him.
  const s = stairNearest(x, z, y)
  const p = stairAt(s)
  if (Math.hypot(x - p.x, z - p.z) > STAIR.reach) return null
  // Under it or over it is not at it.
  if (Math.abs(p.y - y) > 1.2) return null
  // And short of the end of it is not at it either. The nearest point to a man
  // walking straight up the porch's own line is its outer tip, at whatever
  // distance he still has to go — so without this he steps on a metre early,
  // and stepping on a metre early is a metre of teleport. Beside the rail he
  // may be `reach` off it, because that offset is kept and walked off; short
  // of its end he may not, because that one cannot be.
  const end = stairLength()
  if ((s <= 1e-6 || s >= end - 1e-6) && Math.hypot(x - p.x, z - p.z) > 0.3) return null
  // Which way the DOORWAY faces, which is radially out of the spire — not
  // which way the passage leaves in. The first version used the rail's own
  // tangent, and the rail starts turning the moment it is through the wall: at
  // the mouth that tangent is 76 degrees off the way anybody walks in, which
  // passed by four hundredths from dead ahead and refused every other
  // approach.
  const out = Math.atan2(Math.cos(p.phi), Math.sin(p.phi))
  // Going in is going against it. Generous, because a door is a thing you walk
  // at rather than aim at: anything but walking away opens it.
  if (Math.cos(yaw - out) >= -0.15) return null
  // And only at the two open ends — the porch on the sand and the ledge at the
  // top. The rest of the rail is inside a mountain.
  if (s <= stairDoorS() + 0.1) return 'mouth'
  if (s >= stairClimbEnd() - 0.1) return 'exit'
  return null
}

/**
 * Where a man who walks off the end of the balcony is put: a stride along the
 * terrace the isle cuts away from it, rather than straight out past its end.
 *
 * Out past its end is still f = 0 on the shelf, and f = 0 is the shelf's own
 * starting face — so stepping "forward" off a ledge that points radially
 * outward was a ten-metre fall onto the second metre of the path.
 */
export function stairStepOff(): { x: number; z: number } {
  const T = ISLE.terrace
  const p = stairExit()
  if (!T) return { x: p.x + Math.sin(p.yaw), z: p.z + Math.cos(p.yaw) }
  const phi = T.from + T.hand * (0.6 / T.r0)
  // ...and on the shelf's own line at that point, which has already moved out
  // a little from where the balcony left off.
  const r = T.r0 + (T.r1 - T.r0) * (0.6 / T.r0 / (T.turns * Math.PI * 2))
  return { x: AXIS.x + Math.cos(phi) * r, z: AXIS.z + Math.sin(phi) * r }
}

/** The ground the isle would report at a point — exported so the check and the
 *  mesh do not each go and find the isle again. */
export const stairGround = groundAt
