/**
 * The three project islands as things a surfboard can ride on and knock about:
 * the ground's own profile, the loose props standing on it, and the one wall.
 *
 * Its own module for the reason `isles.ts` and `beach.ts` are: `Ship.tsx` and
 * `Landmarks.tsx` import three and TSL, node can load neither, and everything
 * here is arithmetic worth an assert. `src/plateau.check.ts` rides a board at
 * the real mine and over a real row of tiles with it.
 *
 * What is here is deliberately not a physics engine. The props move in XZ,
 * turn about their own axis, drop off a step and float in the sea; the board
 * is a capsule and every prop is a disc. That is enough for a tile to leave in
 * the direction it was hit, spin when it was clipped, and stop where a wooden
 * thing on a wooden board stops. Anything more — a table that topples, a tile
 * that lands on its edge — is a decision to make once somebody misses it.
 */

/** Smoothstep. Three-free, like the rest of the file. */
const S = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/* ------------------------------------------------------------- the ground
 *
 * Half an island, from the axis outward, as `Islands.tsx` revolves it:
 * [fraction of radius, height relative to the plateau]. Flat out to 0.52 so
 * the blockout boxes sit square on it; the last two points are the underwater
 * skirt. Here rather than in `Islands.tsx` since the surfer started riding it,
 * because the mesh and the floor under the board have to be the same island.
 */
export const PROFILE: [number, number][] = [
  [0, 0], [0.52, 0], [0.68, -0.12], [0.8, -0.3], [0.88, -0.55], [0.96, -1.6], [1, -3.2],
]

/** Coastline radius at an angle, as a multiple of the nominal one. Three
 *  detuned harmonics: enough that the eye reads a shape rather than a disc,
 *  few enough that the plateau stays convex and a box never overhangs it. */
export function rim(theta: number, seed: number): number {
  return (
    1 +
    0.11 * Math.sin(3 * theta + seed) +
    0.06 * Math.sin(5 * theta + seed * 2.3) -
    0.05 * Math.sin(7 * theta + seed * 0.7)
  )
}

/** The seed an island's rim is detuned by — its slug, summed. */
export const seedOf = (slug: string) => [...slug].reduce((h, c) => h + c.charCodeAt(0), 0)

/**
 * Height of an island's ground relative to its plateau, `dx, dz` from its
 * centre, for an island revolved out to `radius`. Zero on the flat top, the
 * profile's skirt down the beach, and -3.2 (a lot of water) past the last ring
 * — so `max` over the islands and the sea is always the sea out there.
 */
export function profileAt(radius: number, seed: number, dx: number, dz: number): number {
  const d = Math.hypot(dx, dz)
  const f = d / (radius * rim(Math.atan2(dz, dx), seed))
  if (f >= 1) return PROFILE[PROFILE.length - 1]![1]
  for (let i = 1; i < PROFILE.length; i++) {
    const [r1, y1] = PROFILE[i]!
    if (f > r1) continue
    const [r0, y0] = PROFILE[i - 1]!
    return y0 + ((y1 - y0) * (f - r0)) / (r1 - r0)
  }
  return 0
}

/**
 * What stands proud of a plateau and is ridden over rather than into: the
 * Scrabble board's plinth, a square deck a fifth of a metre high (`tools/
 * board.py`: `TOP`, `PLINTH`). Keyed by landmark shape, and a landmark with no
 * entry is flat. The tiles sit on this deck, so a board that could not get up
 * onto it could never reach them.
 */
export const DECKS: Record<string, { half: number; h: number } | undefined> = {
  board: { half: 2.97, h: 0.21 },
}

/**
 * And what is ridden *up*: Memojo's ramp, a deck that climbs along the
 * landmark's own -Z — which is away from the visitor, so he comes at it from
 * the water, goes up it, and leaves over the far shore.
 *
 * The run is straight and the foot is eased, and that asymmetry is the whole
 * shape of it. A smoothstep over the length would be flat at *both* ends, and
 * a lip with no slope on it is a ledge to fall off rather than a ramp to leave
 * by — the launch below is the slope at the lip and nothing else. So: a slope
 * that comes on over the first `ease` of the run and is constant from there,
 * which is a curve where the board meets it and a straight line where it
 * leaves.
 */
export type Ramp = {
  /** The run's centre line and half-width, across the landmark. */
  x: number
  half: number
  /** Where it starts, at plateau level, and where it ends, at `h`. */
  foot: number
  lip: number
  h: number
  /** Fraction of the run over which the slope comes on. */
  ease: number
}

export const RAMPS: Record<string, Ramp | undefined> = {
  ramp: { x: -1.05, half: 1.15, foot: 2.9, lip: -1.0, h: 1.55, ease: 0.28 },
}

/** Height of the run at `t` along it, 0 at the foot and 1 at the lip, for a
 *  slope that ramps in over `s` and is flat-out after it. The integral of that
 *  slope, normalised so the lip is exactly 1. */
const runAt = (t: number, s: number): number =>
  (t <= s ? (t * t) / (2 * s) : t - s / 2) / (1 - s / 2)

/** And its slope there, in height per unit of run, on the same normalisation. */
const runSlope = (t: number, s: number): number => (t <= s ? t / s : 1) / (1 - s / 2)

/** Where on the run a landmark-local XZ is: 0 at the foot, 1 at the lip, and
 *  -1 off the deck altogether. */
function along(r: Ramp, lx: number, lz: number): number {
  if (Math.abs(lx - r.x) > r.half) return -1
  if (lz > r.foot || lz < r.lip) return -1
  return (r.foot - lz) / (r.foot - r.lip)
}

/** The deck's lift at a landmark-local XZ, or zero off it — the Scrabble
 *  board's plinth, or the ramp's run. */
export function deckAt(shape: string, lx: number, lz: number): number {
  const d = DECKS[shape]
  if (d) return Math.abs(lx) <= d.half && Math.abs(lz) <= d.half ? d.h : 0
  const r = RAMPS[shape]
  if (!r) return 0
  const t = along(r, lx, lz)
  return t < 0 ? 0 : r.h * runAt(t, r.ease)
}

/**
 * The vertical a ramp imparts to something crossing it, in units a second: the
 * deck's slope where the board is, times how fast it is going up the run.
 *
 * This is what a jump off the ramp is made of, and it is why the ramp is the
 * only rising thing in the world that launches anything. Read as a frame
 * difference — how much the floor came up under him since last frame — every
 * beach on every island would become a kicker, because a beach also rises
 * under a board moving fast. Read analytically and confined to a ramp's own
 * deck, the beaches ride exactly as they did and the ramp throws him, which is
 * the difference between a change and a feature.
 *
 * Zero off the deck, zero going down it, and zero standing still.
 */
export function rampLift(shape: string, lx: number, lz: number, vlz: number): number {
  const r = RAMPS[shape]
  if (!r) return 0
  const t = along(r, lx, lz)
  if (t < 0) return 0
  // Up the run is -z in landmark space. Crossing it sideways climbs nothing,
  // and that falls out rather than being a case: `vlz` is the only component
  // the run has a slope along.
  const up = -vlz
  if (up <= 0) return 0
  return up * (r.h / (r.foot - r.lip)) * runSlope(t, r.ease)
}

/* -------------------------------------------------------------- the props
 *
 * A prop is one rigid thing in a landmark's own space — a tile, an easel, a
 * table with what is on it — moved by the board and by other props, and put
 * back where it was after a pause. Its geometry stays exactly where the model
 * put it; `Landmarks.tsx` turns it about `px, pz` and offsets it by `x, z, y`.
 */
export type Prop = {
  id: string
  /** The turning point — the footprint's centre — in landmark space. */
  px: number
  pz: number
  /** Disc radius, and mass in tiles. */
  r: number
  m: number
  /** The ground at its rest spot, so `y` can be an offset from where it was. */
  rest: number
  /** Displacement from rest: XZ, up, and turn. */
  x: number
  z: number
  y: number
  yaw: number
  vx: number
  vz: number
  vy: number
  w: number
  /** Not to be touched this frame — a found tile still in the air. */
  fixed: boolean
  /** Has left its rest pose since the last tidy-up. */
  loose: boolean
  asleep: boolean
  /** Where the tidy-up picked it up from. */
  fx: number
  fz: number
  fy: number
  fyaw: number
}

/**
 * The giant camera on Memojo's island, as something that can see: where the
 * lens is in the landmark's own space, where it looks, how wide, and how far.
 *
 * It is here and not in `Landmarks.tsx` for the reason everything else in this
 * file is: what it does is arithmetic — a cone against a point — and the model
 * beside it is a picture of that arithmetic. The two have to agree or the
 * shutter fires at a rider the lens is not pointing at, and only one of them
 * can be checked in node.
 */
export type Lens = {
  /** Where it stands, and the unit vector it looks along. */
  x: number
  y: number
  z: number
  dx: number
  dy: number
  dz: number
  /** The cosine of its half-angle, and how far it sees. */
  cos: number
  reach: number
}

/** Keyed by landmark shape, like `DECKS` and `RAMPS`. Aimed at the arc off
 *  the lip: the run leaves at `RAMPS.ramp.lip` and what the lens is for is the
 *  metre or two after that, which is the only place a rider is in the air. */
export const LENSES: Record<string, Lens | undefined> = {
  ramp: { x: 0.95, y: 2.62, z: -0.3, dx: -0.5735, dy: -0.0917, dz: -0.8141, cos: 0.9, reach: 13 },
}

/** A convex polygon in landmark space, counter-clockwise. */
export type Poly = { x: number; z: number }[]

export type PropSet = {
  slug: string
  /** The landmark's place and turn in the world — `Landmarks.tsx` sets both. */
  cx: number
  cz: number
  rot: number
  props: Prop[]
  walls: Poly[]
  /** The landmark's camera, if it has one — one landmark does. */
  lens: Lens | null
  /** Seconds everything has been still and out of place. */
  still: number
  /** The tidy-up: 0 not running, else its progress toward 1. */
  back: number
  /** The set's own reach — the furthest anything in it is from `cx, cz`. */
  reach: number
  /** How far each pair of discs overlapped as the model placed them — a
   *  canvas leaning on a table's end is two discs through each other — so
   *  that overlap is theirs to keep and not a push. `N * i + k`. */
  slack: Float32Array
}

/** The board as the contact code sees it: a capsule of `len` between the
 *  centres of its end caps and radius `r`, moving and turning. */
export type Board = {
  x: number
  /** World Y of the hull's origin — the underside of the board, near enough. */
  y: number
  z: number
  yaw: number
  vx: number
  vz: number
  /** Yaw rate, radians a second — a board swept round is a board that hits. */
  spin: number
  len: number
  r: number
  m: number
}

/** `shutter` is the odd one out and deliberately lives here anyway: it is not
 *  something the board hit, it is something that went off because of where the
 *  board was. The machinery is identical — a one-shot the sound plays once at
 *  a level — and a second list beside this one would be the same list. */
export type Hit = { kind: 'tile' | 'wood' | 'metal' | 'shutter'; force: number }

/**
 * Is a world point in a landmark's lens? False for every landmark that has no
 * lens, which is all but one.
 *
 * The transform is the same one `stepProps` does and is done here rather than
 * at the call site for the same reason: a second copy of it in `Ship.tsx` is a
 * second chance to get a sign wrong, and this one the check can hold.
 */
export function inShot(set: PropSet, wx: number, wy: number, wz: number): boolean {
  const l = set.lens
  if (!l) return false
  const cr = Math.cos(set.rot)
  const sr = Math.sin(set.rot)
  const dx = wx - set.cx
  const dz = wz - set.cz
  const rx = dx * cr - dz * sr - l.x
  const rz = dx * sr + dz * cr - l.z
  const ry = wy - l.y
  const d = Math.hypot(rx, ry, rz)
  if (d < 1e-6 || d > l.reach) return false
  return (rx * l.dx + ry * l.dy + rz * l.dz) / d >= l.cos
}

/** What the props stand on: the island and the sea at a world XZ, in world Y. */
export type Terrain = (wx: number, wz: number) => { land: number; water: number }

/** The surfboard: 2.0 by 0.63, and the capsule that is. */
export const BOARD = { len: 2.0 - 0.63, r: 0.315 }
/** A man and a board, in tiles. The heavier he is, the less a table slows him. */
export const RIDER_MASS = 80
/** How much of a hit comes back: 0 sticks, 1 is a billiard ball. Tiles on a
 *  board are dead wood; a bounce off the mine is a hull off rock. */
const BOUNCE = 0.35
const WALL_BOUNCE = 0.55
/** Friction at a contact, as a fraction of the normal impulse — and it is what
 *  puts spin on a clipped tile, because a disc hit through its centre would
 *  otherwise leave without turning. */
const GRIP = 0.35
/** Stylised gravity, the same number the hull falls under. */
const GRAV = 9
/** Sliding friction on the plateau, units/sec² — a tile slapped at nine
 *  units a second stops about four metres on. */
const DRAG = 10
/** And spin's own decay rate, per second. */
const SPIN_DRAG = 3.5
/** In the sea: the pull back to the surface, and the water's drag. */
const FLOAT_K = 40
const FLOAT_C = 9
const WATER_DRAG = 2.2
/** Under this it is stopped, not moving. */
const STILL = 0.04
/** Seconds of everything still before the tidy-up, and how long it takes. */
export const TIDY_AFTER = 5
export const TIDY_FOR = 1.2
/** Impact speed that is a full-strength hit, for the sound. */
const HIT_FULL = 7
const HIT_MIN = 0.6

export function makeProp(id: string, px: number, pz: number, r: number, m: number, rest: number): Prop {
  return {
    id, px, pz, r, m, rest,
    x: 0, z: 0, y: 0, yaw: 0, vx: 0, vz: 0, vy: 0, w: 0,
    fixed: false, loose: false, asleep: true, fx: 0, fz: 0, fy: 0, fyaw: 0,
  }
}

export function makeSet(slug: string, cx: number, cz: number, rot: number, props: Prop[],
  walls: Poly[], lens: Lens | null = null): PropSet {
  let reach = 0
  for (const p of props) reach = Math.max(reach, Math.hypot(p.px, p.pz) + p.r)
  for (const w of walls) for (const v of w) reach = Math.max(reach, Math.hypot(v.x, v.z))
  const n = props.length
  const slack = new Float32Array(n * n)
  for (let i = 0; i < n; i++) for (let k = i + 1; k < n; k++) {
    const a = props[i]!
    const b = props[k]!
    slack[n * i + k] = Math.max(0, a.r + b.r - Math.hypot(a.px - b.px, a.pz - b.pz))
  }
  return { slug, cx, cz, rot, props, walls, lens, still: 0, back: 0, reach, slack }
}

/** Every landmark that has loaded its model, by slug. `Landmarks.tsx` writes
 *  it once per model; `Ship.tsx` reads it once a frame. */
export const PROP_SETS = new Map<string, PropSet>()

// ------------------------------------------------------------- geometry

/**
 * Which landmark shapes are a wall to the board rather than things on it, and
 * the band of height the wall is read from — the rock and the head-frame's
 * legs, and not a strut crossing overhead. The wall is the convex hull of every
 * vertex in the band, built from the model when it loads: a hand-kept list of
 * boxes would be wrong the first time a bench moved.
 */
export const WALLED: Record<string, { band: [number, number]; part?: string } | undefined> = {
  mine: { band: [0.02, 1.2] },
  // And the tripod under the giant camera, which is the one thing on Memojo's
  // island a board cannot ride through. `part` is why this grew a shape: the
  // hull is convex, the ramp's own deck sits in the same band as the legs, and
  // a hull drawn round both would make the ramp a wall and the island
  // unridable. So the wall says which meshes it is made of, and the model
  // names them — the same `<material>_<part>` convention `matFor` already
  // reads, used for a second purpose rather than a second convention.
  ramp: { band: [0.02, 2.2], part: 'frame_tripod' },
}

/** The XZ of every vertex in a height band, appended to `into`. `pos` is a
 *  flat xyz array, which is what a glTF accessor and a BufferAttribute both are. */
export function footprint(pos: ArrayLike<number>, lo: number, hi: number, into: { x: number; z: number }[]): void {
  for (let i = 0; i + 2 < pos.length; i += 3) {
    const y = pos[i + 1]!
    if (y >= lo && y <= hi) into.push({ x: pos[i]!, z: pos[i + 2]! })
  }
}

/** Andrew's monotone chain. The hull of a footprint, counter-clockwise. */
export function hull2d(pts: { x: number; z: number }[]): Poly {
  const p = [...pts].sort((a, b) => a.x - b.x || a.z - b.z)
  if (p.length < 3) return p
  const cross = (o: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x)
  const lo: Poly = []
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop()
    lo.push(q)
  }
  const hi: Poly = []
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!
    while (hi.length >= 2 && cross(hi[hi.length - 2]!, hi[hi.length - 1]!, q) <= 0) hi.pop()
    hi.push(q)
  }
  lo.pop()
  hi.pop()
  return lo.concat(hi)
}

/** Closest point on segment ab to p, written into `out`. */
function onSegment(ax: number, az: number, bx: number, bz: number, px: number, pz: number,
  out: { x: number; z: number }): void {
  const dx = bx - ax
  const dz = bz - az
  const l2 = dx * dx + dz * dz
  const t = l2 > 1e-12 ? Math.min(Math.max(((px - ax) * dx + (pz - az) * dz) / l2, 0), 1) : 0
  out.x = ax + dx * t
  out.z = az + dz * t
}

/**
 * The closest pair of points between two segments, in `outA` (on ab) and
 * `outB` (on cd). Endpoint-against-segment four times, plus the one crossing
 * case — enough for two short segments in a plane, and no linear algebra.
 */
const _pa = { x: 0, z: 0 }
const _pb = { x: 0, z: 0 }
function segSeg(ax: number, az: number, bx: number, bz: number,
  cx: number, cz: number, dx: number, dz: number,
  outA: { x: number; z: number }, outB: { x: number; z: number }): number {
  // Crossing?
  const r1x = bx - ax, r1z = bz - az, r2x = dx - cx, r2z = dz - cz
  const den = r1x * r2z - r1z * r2x
  if (Math.abs(den) > 1e-12) {
    const t = ((cx - ax) * r2z - (cz - az) * r2x) / den
    const u = ((cx - ax) * r1z - (cz - az) * r1x) / den
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      outA.x = outB.x = ax + r1x * t
      outA.z = outB.z = az + r1z * t
      return 0
    }
  }
  let best = Infinity
  const tryPair = (px: number, pz: number, qx: number, qz: number, aOnFirst: boolean) => {
    const d = Math.hypot(px - qx, pz - qz)
    if (d >= best) return
    best = d
    if (aOnFirst) { outA.x = px; outA.z = pz; outB.x = qx; outB.z = qz }
    else { outA.x = qx; outA.z = qz; outB.x = px; outB.z = pz }
  }
  onSegment(cx, cz, dx, dz, ax, az, _pb); tryPair(ax, az, _pb.x, _pb.z, true)
  onSegment(cx, cz, dx, dz, bx, bz, _pb); tryPair(bx, bz, _pb.x, _pb.z, true)
  onSegment(ax, az, bx, bz, cx, cz, _pa); tryPair(cx, cz, _pa.x, _pa.z, false)
  onSegment(ax, az, bx, bz, dx, dz, _pa); tryPair(dx, dz, _pa.x, _pa.z, false)
  return best
}

/** Is p inside a convex counter-clockwise polygon? */
export function inside(poly: Poly, px: number, pz: number): boolean {
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    if ((b.x - a.x) * (pz - a.z) - (b.z - a.z) * (px - a.x) < 0) return false
  }
  return true
}

/** Distance from p to the polygon's edge, and the outward normal there. */
const _q = { x: 0, z: 0 }
function edgeNear(poly: Poly, px: number, pz: number, out: { d: number; nx: number; nz: number; qx: number; qz: number }): void {
  out.d = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!
    const b = poly[(i + 1) % poly.length]!
    onSegment(a.x, a.z, b.x, b.z, px, pz, _q)
    const d = Math.hypot(px - _q.x, pz - _q.z)
    if (d < out.d) {
      out.d = d
      out.qx = _q.x
      out.qz = _q.z
      // The edge's outward normal, for the case where p is on the edge itself
      // and the vector from q to p has no length to normalise.
      const ex = b.x - a.x
      const ez = b.z - a.z
      const el = Math.hypot(ex, ez) || 1
      out.nx = ez / el
      out.nz = -ex / el
    }
  }
}

// -------------------------------------------------------------- the step

const _bx = { x: 0, z: 0 } // the board, in landmark space
const _c = { x: 0, z: 0 }
const _cb = { x: 0, z: 0 }
const _e = { d: 0, nx: 0, nz: 0, qx: 0, qz: 0 }

const force = (v: number) => Math.min(Math.max((v - HIT_MIN) / (HIT_FULL - HIT_MIN), 0), 1)

/**
 * One frame of one landmark's props against the board, in landmark space.
 * Mutates the props and — for a wall, or the reaction to a heavy prop — the
 * board's own position and velocity, which are in world space and come back
 * that way. Hits are pushed to `hits` for the sound.
 *
 * `active` false is the saucer or the boat: the props still tidy up and float,
 * nothing touches them.
 */
export function stepProps(set: PropSet, dt: number, board: Board, active: boolean,
  terrain: Terrain, hits: Hit[]): void {
  // Nothing to do, almost always: the board is out at sea and everything is
  // where the model put it.
  const far = Math.hypot(board.x - set.cx, board.z - set.cz) > set.reach + board.len + board.r + 1
  let awake = set.back > 0
  for (const p of set.props) if (!p.asleep || p.loose) { awake = true; break }
  if (far && !awake) return

  // The board into landmark space: the landmark is turned by `rot` about its
  // centre, so the world is turned back by it.
  const cr = Math.cos(set.rot)
  const sr = Math.sin(set.rot)
  const toLocal = (wx: number, wz: number, out: { x: number; z: number }) => {
    const dx = wx - set.cx
    const dz = wz - set.cz
    out.x = dx * cr - dz * sr
    out.z = dx * sr + dz * cr
  }
  toLocal(board.x, board.z, _bx)
  const bvx = board.vx * cr - board.vz * sr
  const bvz = board.vx * sr + board.vz * cr
  const byaw = board.yaw - set.rot
  // The board's nose is +z in its own frame, which is the hull's heading.
  const hx = Math.sin(byaw)
  const hz = Math.cos(byaw)
  const half = board.len / 2
  const ax = _bx.x - hx * half, az = _bx.z - hz * half
  const ex = _bx.x + hx * half, ez = _bx.z + hz * half
  // What the board's own velocity picks up from the reactions below, in
  // landmark space, and its displacement.
  let dvx = 0, dvz = 0, dpx = 0, dpz = 0

  // The tidy-up: everything eases home together, and a hit during it is a hit
  // — the pose it had got to becomes where it is, and the rest is physics.
  if (set.back > 0) {
    set.back = Math.min(set.back + dt / TIDY_FOR, 1)
    const k = S(0, 1, set.back)
    for (const p of set.props) {
      if (!p.loose) continue
      p.x = p.fx * (1 - k); p.z = p.fz * (1 - k); p.y = p.fy * (1 - k); p.yaw = p.fyaw * (1 - k)
      if (set.back >= 1) { p.loose = false; p.asleep = true; p.vx = p.vz = p.vy = p.w = 0 }
    }
    if (set.back >= 1) { set.back = 0; set.still = 0 }
  }

  // The board against each prop. A disc against a capsule: the closest point
  // on the board's spine to the prop's centre, and the gap between.
  if (active) for (const p of set.props) {
    if (p.fixed) continue
    const cx = p.px + p.x
    const cz = p.pz + p.z
    onSegment(ax, az, ex, ez, cx, cz, _c)
    let nx = cx - _c.x
    let nz = cz - _c.z
    const d = Math.hypot(nx, nz)
    const gap = d - (board.r + p.r)
    if (gap >= 0) continue
    // A board in the air over a tile, or a tile that has dropped into the
    // sea under a board still on the deck: no contact. `board.y` is the
    // hull's origin, which rides a hair over whatever it is on; a prop's base
    // more than half a metre off it is clear of it.
    const propY = p.rest + p.y
    if (propY - board.y > 0.5 || board.y - propY > 0.45) continue
    if (d > 1e-6) { nx /= d; nz /= d } else { nx = -hz; nz = hx }
    // Push the prop out — the board is the one with a man on it.
    p.x -= nx * gap
    p.z -= nz * gap
    // The board's velocity at the contact: its own, plus its swing about its
    // centre — a board turned into a tile hits it without moving anywhere.
    const rx = _c.x - _bx.x
    const rz = _c.z - _bx.z
    const cvx = bvx + board.spin * rz
    const cvz = bvz - board.spin * rx
    const relx = p.vx - cvx
    const relz = p.vz - cvz
    const vn = relx * nx + relz * nz
    if (vn >= 0) continue // already separating
    wake(p)
    if (set.back > 0) { freeze(set); }
    const inv = 1 / p.m + 1 / board.m
    const j = (-(1 + BOUNCE) * vn) / inv
    p.vx += (j * nx) / p.m
    p.vz += (j * nz) / p.m
    dvx -= (j * nx) / board.m
    dvz -= (j * nz) / board.m
    // Friction along the contact, capped by `GRIP` of the hit. On a disc this
    // is the whole of its spin.
    const tx = -nz, tz = nx
    const vt = relx * tx + relz * tz
    const I = 0.5 * p.m * p.r * p.r
    const jt = Math.max(-GRIP * j, Math.min(GRIP * j, (-vt) / (inv + (p.r * p.r) / I)))
    p.vx += (jt * tx) / p.m
    p.vz += (jt * tz) / p.m
    // The contact is `-n * r` from the prop's centre; its cross with the
    // tangent is `-r` times the tangent's turn, which for t = (-nz, nx) is 1.
    p.w += (-p.r * jt) / I
    // A hard hit lifts a light thing off the board a little — it is the one
    // cue from the side that says it was struck rather than pushed.
    if (p.m <= 1.5 && -vn > 2.5 && p.vy === 0) p.vy = Math.min(-vn * 0.25, 2.2)
    const f = force(-vn)
    if (f > 0) hits.push({ kind: p.m <= 1.5 ? 'tile' : 'wood', force: f })
  }

  // Props against each other, discs, once per pair. Heavier things push
  // lighter ones the way the board pushes them.
  const ps = set.props
  for (let i = 0; i < ps.length; i++) {
    const a = ps[i]!
    if (a.fixed) continue
    for (let k = i + 1; k < ps.length; k++) {
      const b = ps[k]!
      if (b.fixed || (a.asleep && b.asleep)) continue
      if (Math.abs((a.rest + a.y) - (b.rest + b.y)) > 0.4) continue
      let nx = (b.px + b.x) - (a.px + a.x)
      let nz = (b.pz + b.z) - (a.pz + a.z)
      const d = Math.hypot(nx, nz)
      const gap = d - (a.r + b.r - set.slack[ps.length * i + k]!)
      if (gap >= 0) continue
      if (d > 1e-6) { nx /= d; nz /= d } else { nx = 1; nz = 0 }
      const share = a.m / (a.m + b.m)
      a.x += nx * gap * (1 - share); a.z += nz * gap * (1 - share)
      b.x -= nx * gap * share; b.z -= nz * gap * share
      const vn = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz
      if (vn >= 0) continue
      wake(a); wake(b)
      const j = (-(1 + BOUNCE) * vn) / (1 / a.m + 1 / b.m)
      a.vx -= (j * nx) / a.m; a.vz -= (j * nz) / a.m
      b.vx += (j * nx) / b.m; b.vz += (j * nz) / b.m
      const f = force(-vn)
      if (f > 0.1) hits.push({ kind: b.m <= 1.5 && a.m <= 1.5 ? 'tile' : 'wood', force: f * 0.7 })
    }
  }

  // Integrate. Gravity, the floor or the sea under it, and friction on whichever.
  let allStill = true
  let anyLoose = false
  for (const p of ps) {
    if (p.asleep) { if (p.loose) anyLoose = true; continue }
    // Along first, then the ground under where it now is: read the other way
    // round, a tile stopping on the lip of a step slept a few millimetres in
    // the air over the tread.
    p.x += p.vx * dt
    p.z += p.vz * dt
    p.yaw += p.w * dt
    const cx = p.px + p.x
    const cz = p.pz + p.z
    const wx = set.cx + cx * cr + cz * sr
    const wz = set.cz - cx * sr + cz * cr
    const here = terrain(wx, wz)
    // The floor as an offset from the ground at its rest spot, so a tile on
    // the plate is at 0 there and 0.21 lower once it has slid off the plinth.
    const floor = here.land - p.rest
    const afloat = here.water > here.land
    if (afloat) {
      // Wood floats: a spring to the surface, damped, and the water's drag.
      const surface = here.water - p.rest
      p.vy += dt * ((surface - p.y) * FLOAT_K - p.vy * FLOAT_C)
      p.y += p.vy * dt
      const k = Math.exp(-WATER_DRAG * dt)
      p.vx *= k; p.vz *= k; p.w *= k
    } else {
      p.vy -= GRAV * dt
      p.y += p.vy * dt
      if (p.y <= floor) {
        if (p.vy < -1.5) hits.push({ kind: p.m <= 1.5 ? 'tile' : 'wood', force: force(-p.vy) * 0.6 })
        p.y = floor
        p.vy = 0
        // Sliding friction: a fixed deceleration, the way friction is.
        const sp = Math.hypot(p.vx, p.vz)
        const k = sp > 1e-6 ? Math.max(sp - DRAG * dt, 0) / sp : 0
        p.vx *= k; p.vz *= k
        p.w *= Math.exp(-SPIN_DRAG * dt)
      }
    }
    const moving = Math.hypot(p.vx, p.vz) > STILL || Math.abs(p.w) > STILL || Math.abs(p.vy) > STILL
    const onFloor = afloat ? Math.abs(p.y - (here.water - p.rest)) < 0.05 : p.y <= floor + 1e-6
    if (!moving && onFloor) { p.asleep = true; p.vx = p.vz = p.vy = p.w = 0 } else allStill = false
    if (p.loose) anyLoose = true
  }

  // The pause, and then the tidy-up.
  if (allStill && anyLoose && set.back === 0) {
    set.still += dt
    if (set.still >= TIDY_AFTER) {
      for (const p of ps) { p.fx = p.x; p.fz = p.z; p.fy = p.y; p.fyaw = p.yaw }
      set.back = 1e-6
    }
  } else if (!allStill) set.still = 0

  // The wall. The board's spine against each polygon: inside, or nearer than
  // the board is wide, is a hit — pushed out along the normal, the velocity's
  // share into the wall reflected, and the bang is that share.
  if (active) for (const wall of set.walls) {
    let nx = 0, nz = 0, depth = 0
    const inA = inside(wall, ax + dpx, az + dpz)
    const inB = inside(wall, ex + dpx, ez + dpz)
    if (inA || inB) {
      // An end inside: out through the nearest edge, the whole way plus the radius.
      edgeNear(wall, inA ? ax + dpx : ex + dpx, inA ? az + dpz : ez + dpz, _e)
      nx = _e.nx; nz = _e.nz; depth = _e.d + board.r
    } else {
      let best = Infinity
      for (let i = 0; i < wall.length; i++) {
        const a = wall[i]!
        const b = wall[(i + 1) % wall.length]!
        const d = segSeg(ax + dpx, az + dpz, ex + dpx, ez + dpz, a.x, a.z, b.x, b.z, _c, _cb)
        if (d < best) {
          best = d
          nx = _c.x - _cb.x; nz = _c.z - _cb.z
          if (d < 1e-9) { nx = (b.z - a.z); nz = -(b.x - a.x) }
        }
      }
      if (best >= board.r) continue
      const l = Math.hypot(nx, nz) || 1
      nx /= l; nz /= l
      depth = board.r - best
    }
    dpx += nx * depth
    dpz += nz * depth
    const vn = (bvx + dvx) * nx + (bvz + dvz) * nz
    if (vn < 0) {
      dvx -= (1 + WALL_BOUNCE) * vn * nx
      dvz -= (1 + WALL_BOUNCE) * vn * nz
      const f = force(-vn)
      if (f > 0) hits.push({ kind: 'metal', force: f })
    }
  }

  // Back to the world.
  if (dpx !== 0 || dpz !== 0) {
    board.x += dpx * cr + dpz * sr
    board.z += -dpx * sr + dpz * cr
  }
  if (dvx !== 0 || dvz !== 0) {
    board.vx += dvx * cr + dvz * sr
    board.vz += -dvx * sr + dvz * cr
  }
}

function wake(p: Prop): void {
  p.asleep = false
  p.loose = true
}

/** A hit during the tidy-up: everything stops where it has got to. */
function freeze(set: PropSet): void {
  set.back = 0
  set.still = 0
  for (const p of set.props) if (p.loose) p.asleep = false
}

/** How far a prop is from where it belongs — what "out of place" means. */
export const displaced = (p: Prop) =>
  Math.hypot(p.x, p.z) > 1e-3 || Math.abs(p.y) > 1e-3 || Math.abs(p.yaw) > 1e-3
