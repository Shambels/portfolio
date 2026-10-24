/**
 * Tablo's island, and the installation the index's plate and the case
 * study's stage draw, as data and arithmetic. Pure, no three and no DOM, so
 * `tablo.check.ts` can ride the island's rail in node.
 *
 * Tablo draws and checks the diagrams of Belgian installations, and the
 * single-line diagram is a circuit: a feed out of the board, forks, branches,
 * points on every branch. So the island is that circuit, closed and standing
 * up as a rail the surfer grinds. He catches it by landing on it, and on it he
 * is the current: carried downstream at the rail's own speed, round every
 * corner, steering only at the forks — and every fork's two paths join again
 * downstream, and the return runs back up through the board into the feed,
 * so whichever way he goes he goes round until he jumps. Every appliance on
 * the way switches on as he passes it, and stays on for a while.
 *
 * Two installations live here, and they are not the same one. The island's
 * is the rail (`NODES`, `EDGES`, `APPLIANCES`). The sheet's is a house — four
 * rooms, four circuits, two RCDs — which the plate and the stage draw as a
 * single-line diagram over a position plan (`sheet()`, at the end), because
 * that is the document Tablo produces.
 *
 * Everything is in the landmark's own space, metres: +Z toward the world's
 * centre (the visitor's approach), y up from the plateau. `tools/tablo.py`
 * builds the model from `layout()` — it runs this file in node — so the rail
 * the surfer rides and the rail the visitor sees are one set of numbers.
 */

import type { Hit, Poly } from './plateau.ts'
import { profileAt, profileOf, seedOf } from './plateau.ts'

// ================================================================ the sheet's house
// ------------------------------------------------------------------ the plan

/** The house's outline. The board stands outside its front wall, at the
 *  door, which is where a Belgian meter and board usually are. */
export const HOUSE = { x0: -4, x1: 4, z0: -3.5, z1: 3.0 }

/** Kerb walls: their height and thickness. Low enough to read as a plan from
 *  the water, tall enough to stop a board. */
export const KERB = { h: 0.32, t: 0.12 }

export type Room = { key: RoomKey; x0: number; x1: number; z0: number; z1: number }
export type RoomKey = 'living' | 'kitchen' | 'bedroom' | 'bathroom'

/** Four rooms, split at x = 0 and z = -0.25. One circuit each, in the same
 *  order — `CIRCUITS[k].room` is `k`. */
export const ROOMS: Room[] = [
  { key: 'living', x0: -4, x1: 0, z0: -0.25, z1: 3.0 },
  { key: 'kitchen', x0: 0, x1: 4, z0: -0.25, z1: 3.0 },
  { key: 'bedroom', x0: -4, x1: 0, z0: -3.5, z1: -0.25 },
  { key: 'bathroom', x0: 0, x1: 4, z0: -3.5, z1: -0.25 },
]

/** Every wall as a run along one axis with the doorways left out of it:
 *  `[axis, at, from, to]` — `x` runs along x at z = `at`, `z` along z at
 *  x = `at`. Doorways are 2.4 m: the board is 2.0 long, and a doorway it can
 *  only enter square-on is a wall with a slot in it. */
export const WALLS: ['x' | 'z', number, number, number][] = [
  // the front, either side of the board's own stretch
  ['x', 3.0, -4, -3.4], ['x', 3.0, -1.0, 1.0], ['x', 3.0, 3.4, 4],
  // the back
  ['x', -3.5, -4, -3.0], ['x', -3.5, -0.6, 0.6], ['x', -3.5, 3.0, 4],
  // the left, a door into the living room; the right, one into the bathroom
  ['z', -4, -3.5, 0.2], ['z', -4, 2.6, 3.0],
  ['z', 4, -3.5, -2.9], ['z', 4, -0.5, 3.0],
  // inside: across the middle, and down it
  ['x', -0.25, -4, -3.2], ['x', -0.25, -0.8, 0.8], ['x', -0.25, 3.2, 4],
  ['z', 0, 2.7, 3.0], ['z', 0, -0.6, 0.3], ['z', 0, -3.5, -3.0],
]

/** A wall run as the rectangle it is, corners included: each run is
 *  stretched half a thickness past its ends so two runs meeting at a corner
 *  overlap rather than leave a notch. */
export function wallRect([axis, at, a, b]: (typeof WALLS)[number]): { x0: number; x1: number; z0: number; z1: number } {
  const h = KERB.t / 2
  return axis === 'x'
    ? { x0: a - h, x1: b + h, z0: at - h, z1: at + h }
    : { x0: at - h, x1: at + h, z0: a - h, z1: b + h }
}


// -------------------------------------------------------------- the circuits

export type Rcd = { ma: number; amps: number; type: 'A' | 'AC' }
/** The main RCD and the bathroom's: 300 mA for the house, 30 mA for the wet
 *  room, which is the rule Tablo's checker leads with. The bathroom's is
 *  downstream of the house's, as on a Belgian board: the 300 mA going out
 *  takes everything with it, the 30 mA only the bathroom. */
export const RCDS: Rcd[] = [
  { ma: 300, amps: 40, type: 'A' },
  { ma: 30, amps: 40, type: 'A' },
]

export type Circuit = {
  tag: string
  room: number
  rcd: number
  amps: number
  curve: 'B' | 'C'
  mm2: number
}

export const CIRCUITS: Circuit[] = [
  { tag: 'A', room: 0, rcd: 0, amps: 20, curve: 'C', mm2: 2.5 },
  { tag: 'B', room: 1, rcd: 0, amps: 20, curve: 'C', mm2: 2.5 },
  { tag: 'C', room: 2, rcd: 0, amps: 16, curve: 'B', mm2: 1.5 },
  { tag: 'D', room: 3, rcd: 1, amps: 20, curve: 'C', mm2: 2.5 },
]

export type Point = { circuit: number; kind: 'lamp' | 'socket'; x: number; z: number; tag: string }

/** The points, tagged as Tablo tags them: the circuit's letter and a number,
 *  the same on the plan and on the diagram. A lamp in the middle of each
 *  room; sockets against a wall and clear of every doorway. The bedroom is
 *  lighting only, on 1.5 mm². */
export const POINTS: Point[] = ([
  [0, 'lamp', -2.0, 1.3], [0, 'socket', -3.75, -0.05], [0, 'socket', -0.6, 2.75],
  [1, 'lamp', 2.0, 1.3], [1, 'socket', 3.75, 0.5], [1, 'socket', 3.75, 2.2],
  [2, 'lamp', -2.0, -1.9],
  [3, 'lamp', 2.0, -1.9], [3, 'socket', 3.5, -3.25],
] as const).map(([circuit, kind, x, z], i, all) => ({
  circuit, kind, x, z,
  tag: `${CIRCUITS[circuit]!.tag}${all.slice(0, i + 1).filter((p) => p[0] === circuit).length}`,
}))

/** A socket outlet on the sheet's plan, giant. */
export const SOCKET = { w: 0.36, h: 0.36, d: 0.2 }
/** Where the board stands on the sheet's plan: outside the front door. */
export const CABINET = { x0: -0.95, x1: 0.95, z0: 3.62, z1: 4.07 }

/** A socket's footprint on the plan: its back against the nearest wall. */
export function socketBox(p: Point): [number, number, number, number] {
  const alongX = Math.abs(Math.abs(p.z) - 3.5) < 0.3 || Math.abs(p.z - 3.0) < 0.3
  const w = SOCKET.w / 2
  const d = SOCKET.d / 2
  return alongX ? [p.x - w, p.x + w, p.z - d, p.z + d] : [p.x - d, p.x + d, p.z - w, p.z + w]
}

// ------------------------------------------------------------- the words

/** Room names, for the diagram's labels on the plate and the stage. */
export const ROOM_NAMES: Record<'en' | 'fr' | 'nl', Record<RoomKey, string>> = {
  en: { living: 'Living room', kitchen: 'Kitchen', bedroom: 'Bedroom', bathroom: 'Bathroom' },
  fr: { living: 'Séjour', kitchen: 'Cuisine', bedroom: 'Chambre', bathroom: 'Salle de bain' },
  nl: { living: 'Woonkamer', kitchen: 'Keuken', bedroom: 'Slaapkamer', bathroom: 'Badkamer' },
}

// ================================================================ the island's rail

/**
 * The rail's shape: every corner rounded to this radius, so a grind turns
 * round it at speed rather than snapping, and where two paths meet they meet
 * on the same tangent — a fork is a Y and a join is a Y.
 */
export const FILLET = 0.9
/** Heights over the plateau: every node and the outer paths at `low`, the
 *  inner paths at `high`, eased between over `ramp` at each end — so the two
 *  read apart from the water and jumping from one to the other is a thing to
 *  learn. `r` is the conductor's own radius. */
export const RAIL = { low: 0.6, high: 1.05, ramp: 1.6, r: 0.05 }

/** A node: where it is and the one direction everything through it runs. */
export type Node = { name: string; x: number; z: number; tx: number; tz: number }
/** The board, the first fork, a fork and a join each side, and the join the
 *  return runs back up from. The board's node is where the feed leaves it. */
export const NODES: Node[] = [
  { name: 'board', x: 0, z: -1.4, tx: 0, tz: -1 },
  { name: 'split', x: 0, z: -4.6, tx: 0, tz: -1 },
  { name: 'west fork', x: -7.4, z: -1.3, tx: 0, tz: 1 },
  { name: 'west join', x: -5.4, z: 3.2, tx: 0, tz: 1 },
  { name: 'east fork', x: 7.4, z: -1.3, tx: 0, tz: 1 },
  { name: 'east join', x: 5.4, z: 3.2, tx: 0, tz: 1 },
  { name: 'return', x: 0, z: 4.7, tx: 0, tz: -1 },
]

type EdgeDef = { from: number; to: number; high: boolean; pts: [number, number][] }
const mirror = (e: EdgeDef, from: number, to: number): EdgeDef =>
  ({ ...e, from, to, pts: e.pts.map(([x, z]) => [-x, z] as [number, number]) })
/** The west half, laid out by hand; the east is its mirror. Every edge leaves
 *  its node along the node's direction and arrives along the next one's. */
const WEST: EdgeDef[] = [
  { from: 1, to: 2, high: false, pts: [[0, -4.6], [0, -5.8], [-5.4, -5.8], [-5.4, -4], [-7.4, -4], [-7.4, -1.3]] },
  { from: 2, to: 3, high: false, pts: [[-7.4, -1.3], [-7.4, -0.4], [-9.2, -0.4], [-9.2, 2.3], [-5.4, 2.3], [-5.4, 3.2]] },
  { from: 2, to: 3, high: true, pts: [[-7.4, -1.3], [-7.4, -0.4], [-3.6, -0.4], [-3.6, 1.4], [-5.4, 1.4], [-5.4, 3.2]] },
  { from: 3, to: 6, high: false, pts: [[-5.4, 3.2], [-5.4, 5.6], [0, 5.6], [0, 4.7]] },
]
const DEFS: EdgeDef[] = [
  { from: 0, to: 1, high: false, pts: [[0, -1.4], [0, -4.6]] },
  ...WEST,
  mirror(WEST[0]!, 1, 4), mirror(WEST[1]!, 4, 5), mirror(WEST[2]!, 4, 5), mirror(WEST[3]!, 5, 6),
  // The return, straight up the middle and through the board.
  { from: 6, to: 0, high: false, pts: [[0, 4.7], [0, -1.4]] },
]

/** An edge, sampled: the filleted centre line, its running length, and which
 *  way the second leg of its definition turns — what a fork reads. */
export type Edge = {
  from: number; to: number; high: boolean
  xs: number[]; zs: number[]; cum: number[]; len: number
  /** The direction it bends away from its node: the second leg of the
   *  definition, as a unit vector. */
  bend: [number, number]
}

/** Round every interior corner with a quadratic between the two tangent
 *  points — tangent-continuous, near enough circular at a right angle — and
 *  sample it. A leg shared by two corners lends each of them half. */
function fillet(pts: [number, number][]): [number, number][] {
  const out: [number, number][] = [pts[0]!]
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, pz] = pts[i - 1]!
    const [cx, cz] = pts[i]!
    const [nx, nz] = pts[i + 1]!
    const la = Math.hypot(cx - px, cz - pz)
    const lb = Math.hypot(nx - cx, nz - cz)
    const t = Math.min(FILLET, i === 1 ? la : la / 2, i === pts.length - 2 ? lb : lb / 2)
    const ax = cx - ((cx - px) / la) * t
    const az = cz - ((cz - pz) / la) * t
    const bx = cx + ((nx - cx) / lb) * t
    const bz = cz + ((nz - cz) / lb) * t
    const N = 14
    for (let k = 0; k <= N; k++) {
      const u = k / N
      out.push([
        (1 - u) * (1 - u) * ax + 2 * u * (1 - u) * cx + u * u * bx,
        (1 - u) * (1 - u) * az + 2 * u * (1 - u) * cz + u * u * bz,
      ])
    }
  }
  out.push(pts[pts.length - 1]!)
  // Drop the zero-length steps a corner that takes a whole leg leaves behind.
  return out.filter((p, i) => i === 0 || Math.hypot(p[0] - out[i - 1]![0], p[1] - out[i - 1]![1]) > 1e-6)
}

export const EDGES: Edge[] = DEFS.map((d) => {
  const p = fillet(d.pts)
  const cum = [0]
  for (let i = 1; i < p.length; i++) cum.push(cum[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]))
  const [a, b] = [d.pts[1]!, d.pts[Math.min(2, d.pts.length - 1)]!]
  const bl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return {
    from: d.from, to: d.to, high: d.high,
    xs: p.map((q) => q[0]), zs: p.map((q) => q[1]), cum, len: cum[cum.length - 1]!,
    bend: [(b[0] - a[0]) / bl, (b[1] - a[1]) / bl],
  }
})

/** Out of each node, in order of preference: the first is where a grind goes
 *  when nobody steers — the west side at the split, the outer path at a fork. */
export const OUTS: number[][] = NODES.map((_, n) => EDGES.flatMap((e, i) => (e.from === n ? [i] : [])))

const S = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/** The rail's top over the plateau, `s` along edge `e`. */
export function heightAt(e: Edge, s: number): number {
  if (!e.high) return RAIL.low
  const k = Math.min(S(0, RAIL.ramp, s), S(0, RAIL.ramp, e.len - s))
  return RAIL.low + (RAIL.high - RAIL.low) * k
}

/** Where `s` along edge `e` is, and which way the rail runs there — the
 *  direction blended across each sample so a corner turns smoothly. */
export function pointAt(e: Edge, s: number): { x: number; z: number; tx: number; tz: number } {
  const c = Math.min(Math.max(s, 0), e.len)
  let i = 1
  while (i < e.cum.length - 1 && e.cum[i]! < c) i++
  const u = (c - e.cum[i - 1]!) / Math.max(e.cum[i]! - e.cum[i - 1]!, 1e-9)
  const x = e.xs[i - 1]! + (e.xs[i]! - e.xs[i - 1]!) * u
  const z = e.zs[i - 1]! + (e.zs[i]! - e.zs[i - 1]!) * u
  const dir = (j: number) => {
    const j0 = Math.max(1, Math.min(j, e.cum.length - 1))
    const dx = e.xs[j0]! - e.xs[j0 - 1]!
    const dz = e.zs[j0]! - e.zs[j0 - 1]!
    const l = Math.hypot(dx, dz) || 1
    return [dx / l, dz / l] as const
  }
  const [ax, az] = dir(i)
  const [bx, bz] = u < 0.5 ? dir(i - 1) : dir(i + 1)
  const w = u < 0.5 ? 0.5 - u : u - 0.5
  let tx = ax + (bx - ax) * w
  let tz = az + (bz - az) * w
  const l = Math.hypot(tx, tz) || 1
  tx /= l
  tz /= l
  return { x, z, tx, tz }
}

// ---------------------------------------------------------------- the grind

/**
 * Catching it: a board coming *down* through the rail's top, from above, with
 * its centre within `reach` of the rail in plan. `above` is how far over the
 * top still counts, so a landing a frame early is still a landing; a board
 * coming up through it from below — riding into it, or a jump started under
 * it — never is. The board's own capsule is two metres long, and `reach`
 * is half a board-width: you land on it, not near it.
 */
export const CATCH = { reach: 0.5, above: 0.3 }

/** The nearest rail under a board at landmark-local `x, z`, crossed from
 *  `yPrev` to `yNow` (the board's underside over the plateau) this frame. */
export function catchRail(x: number, z: number, yPrev: number, yNow: number): { edge: number; s: number } | null {
  let best: { edge: number; s: number } | null = null
  let bestD = CATCH.reach
  EDGES.forEach((e, ei) => {
    for (let i = 1; i < e.xs.length; i++) {
      const ax = e.xs[i - 1]!, az = e.zs[i - 1]!
      const dx = e.xs[i]! - ax, dz = e.zs[i]! - az
      const l2 = dx * dx + dz * dz
      const u = l2 > 0 ? Math.min(Math.max(((x - ax) * dx + (z - az) * dz) / l2, 0), 1) : 0
      const d = Math.hypot(x - ax - dx * u, z - az - dz * u)
      if (d >= bestD) continue
      const s = e.cum[i - 1]! + (e.cum[i]! - e.cum[i - 1]!) * u
      const top = heightAt(e, s)
      if (yNow > top + CATCH.above || yPrev < top - 0.05) continue
      bestD = d
      best = { edge: ei, s }
    }
  })
  return best
}

/** On the rail: which edge, how far along, and how fast. */
export type Grind = { edge: number; s: number; v: number }

/** The grind's speed: whatever he landed with along the rail, held between
 *  `min` and `max`, drifting to `cruise` — the current pushing him. Shift is
 *  `boost` times that, as it is on the water (`BOOST` in `Ship.tsx`), reached
 *  at `surge` a second; let go and he coasts back down at `drift`. */
export const GRIND = { min: 4, max: 8, cruise: 5, drift: 0.6, steer: 0.25, pop: 4.2, boost: 2.4, surge: 3 }

export function startGrind(c: { edge: number; s: number }, vx: number, vz: number): Grind {
  const p = pointAt(EDGES[c.edge]!, c.s)
  const along = Math.abs(vx * p.tx + vz * p.tz)
  return { edge: c.edge, s: c.s, v: Math.min(Math.max(along, GRIND.min), GRIND.max) }
}

/**
 * Which way out of a node: the edge that bends the way he is steering, or the
 * first out of it if he is not. `steer` is his input across the rail, right
 * positive; `tx, tz` the way he arrived.
 */
export function chooseOut(node: number, steer: number, tx: number, tz: number): number {
  const outs = OUTS[node]!
  if (outs.length === 1 || Math.abs(steer) < GRIND.steer) return outs[0]!
  // His right, heading along (tx, tz), in a frame where +x is left of +z.
  const rx = -tz
  const rz = tx
  for (const o of outs) {
    const [bx, bz] = EDGES[o]!.bend
    if (Math.sign(bx * rx + bz * rz) === Math.sign(steer)) return o
  }
  return outs[0]!
}

/**
 * One frame on the rail: along it at its speed — faster with `boost` —
 * through any node into the edge the steering picks, every appliance passed pushed to `passed`. Returns
 * where he is, which way he faces, his height and how fast it is changing.
 */
export function stepGrind(g: Grind, dt: number, steer: number, passed: number[], boost = false) {
  const want = boost ? GRIND.cruise * GRIND.boost : GRIND.cruise
  g.v += (want - g.v) * Math.min(1, (boost ? GRIND.surge : GRIND.drift) * dt)
  let rest = g.v * dt
  for (let guard = 0; guard < 8 && rest > 0; guard++) {
    const e = EDGES[g.edge]!
    const to = Math.min(g.s + rest, e.len)
    for (const a of ON_EDGE[g.edge]!) {
      const s = APPLIANCES[a]!.s
      if (s > g.s && s <= to) passed.push(a)
    }
    rest -= to - g.s
    g.s = to
    if (g.s >= e.len - 1e-9) {
      const p = pointAt(e, e.len)
      g.edge = chooseOut(e.to, steer, p.tx, p.tz)
      g.s = 0
    }
  }
  const e = EDGES[g.edge]!
  const p = pointAt(e, g.s)
  const y = heightAt(e, g.s)
  const ahead = heightAt(e, Math.min(g.s + 0.05, e.len))
  return { ...p, y, vy: ((ahead - y) / 0.05) * g.v }
}

// ------------------------------------------------------------ the appliances

/**
 * What the circuit feeds, and what lights as he passes: the board itself,
 * which the rail runs through, and Tablo's own example installations — lamps,
 * sockets, a washing machine, a heat pump, an EV charger, solar panels and
 * their inverter, a roller shutter — one on every stretch, so every way round
 * lights a different set and the whole island takes a few laps.
 */
export type ApplianceKind = 'board' | 'lamp' | 'socket' | 'washer' | 'heatpump' | 'charger' | 'solar' | 'shutter'
type ApplianceDef = { kind: ApplianceKind; edge: number; at: [number, number]; inside?: boolean }
const DEF_APPLIANCES: ApplianceDef[] = [
  { kind: 'board', edge: 9, at: [0, 1.6] },
  { kind: 'lamp', edge: 1, at: [-2.7, -5.8] },
  { kind: 'socket', edge: 1, at: [-6.4, -4] },
  { kind: 'washer', edge: 2, at: [-9.2, 0.95], inside: true },
  { kind: 'lamp', edge: 3, at: [-3.6, 0.5] },
  { kind: 'heatpump', edge: 4, at: [-2.7, 5.6] },
  { kind: 'charger', edge: 5, at: [2.7, -5.8] },
  { kind: 'socket', edge: 5, at: [6.4, -4] },
  { kind: 'solar', edge: 6, at: [9.2, 0.95], inside: true },
  { kind: 'lamp', edge: 7, at: [3.6, 0.5] },
  { kind: 'shutter', edge: 8, at: [2.7, 5.6] },
]

/** Footprints, metres — how wide each is along the rail it faces, and how
 *  deep toward it: what a board hits on the ground, and the space
 *  `tools/tablo.py` builds each one in. */
export const FOOT: Record<ApplianceKind, [number, number]> = {
  board: [0.32, 0.6], lamp: [0.3, 0.3], socket: [0.42, 0.5], washer: [0.75, 0.8],
  heatpump: [1.15, 0.8], charger: [0.4, 0.5], solar: [1.5, 1.1], shutter: [1.7, 0.35],
}
/** How far from the rail's centre line each stands — clear of a grinding
 *  board, which is two metres long and a third of a metre wide. */
export const STANDOFF = 1.25

export type Appliance = {
  kind: ApplianceKind; edge: number; s: number
  /** Where it stands, and the way it faces — toward the rail. */
  x: number; z: number; yaw: number
}

export const APPLIANCES: Appliance[] = DEF_APPLIANCES.map((d) => {
  const e = EDGES[d.edge]!
  // Project the hand-placed point onto its edge.
  let s = 0
  let best = Infinity
  for (let i = 1; i < e.xs.length; i++) {
    const ax = e.xs[i - 1]!, az = e.zs[i - 1]!
    const dx = e.xs[i]! - ax, dz = e.zs[i]! - az
    const l2 = dx * dx + dz * dz
    const u = l2 > 0 ? Math.min(Math.max(((d.at[0] - ax) * dx + (d.at[1] - az) * dz) / l2, 0), 1) : 0
    const dd = Math.hypot(d.at[0] - ax - dx * u, d.at[1] - az - dz * u)
    if (dd < best) { best = dd; s = e.cum[i - 1]! + (e.cum[i]! - e.cum[i - 1]!) * u }
  }
  const p = pointAt(e, s)
  if (d.kind === 'board') return { kind: d.kind, edge: d.edge, s, x: p.x, z: p.z, yaw: 0 }
  // Beside the rail, on the side away from the island's middle — or toward
  // it, for the two on the outermost stretches — facing it.
  let nx = -p.tz
  let nz = p.tx
  if ((nx * p.x + nz * p.z < 0) !== !!d.inside) { nx = -nx; nz = -nz }
  return { kind: d.kind, edge: d.edge, s, x: p.x + nx * STANDOFF, z: p.z + nz * STANDOFF, yaw: Math.atan2(-nx, -nz) }
})

/** The appliances on each edge, for the grind to check as it goes. */
const ON_EDGE: number[][] = EDGES.map((_, i) => APPLIANCES.flatMap((a, k) => (a.edge === i ? [k] : [])))

/** When each appliance was last passed, in the world clock's seconds — written
 *  by `Ship` as it grinds, read by `Landmarks` into their light. */
export const LIT = new Float64Array(APPLIANCES.length).fill(-1e9)
/** Whether he is on the rail this frame — written by `Ship`, read by the
 *  rail's glow and the grind's sound. */
export const RIDING = { on: false }
/** Seconds an appliance stays on after he passes it, and how long it takes to
 *  go out. */
export const HOLD = { on: 45, fade: 3 }
/** How lit an appliance is, `age` seconds after it was passed: a flash on
 *  the pass, on for `HOLD.on`, out over `HOLD.fade`. */
export const litAt = (age: number) => (age < 0 ? 0 : age < HOLD.on ? 1 : Math.max(0, 1 - (age - HOLD.on) / HOLD.fade))

/** The board straddles the rail on two legs, its cabinet over his head:
 *  the legs' half-spread, the top of the beam, and the cabinet's foot. */
export const GANTRY = { half: 1.25, top: 3.3, cabinet: 2.35 }

/** The parts that move, over each appliance's own ground, metres: the heat
 *  pump's fan (its height and radius, turning about the appliance's own
 *  vertical), the charger's five bars (the span they fill), and the
 *  shutter (the span it rolls up from). `tools/tablo.py` builds to these and
 *  `Landmarks.tsx` moves them by them. */
export const PARTS = {
  fan: { y: 0.93, r: 0.34 },
  bars: { y0: 0.62, y1: 1.22 },
  shutter: { y0: 0.2, y1: 1.62 },
}

/** Everything on the island a board hits on the ground — every appliance's
 *  footprint and the gantry's two feet — as convex polygons. Not the rail and
 *  not its posts: he rides under it, and catches it from the air. */
export const ISLAND_WALLS: Poly[] = APPLIANCES.flatMap((a) => {
  if (a.kind === 'board') {
    const [w, d] = FOOT.board
    return [-1, 1].map((k) => box(a.x + k * GANTRY.half, a.z, 0, w, d))
  }
  const [w, d] = FOOT[a.kind]
  return [box(a.x, a.z, a.yaw, w, d)]
})

/** An oriented box: `w` across its facing and `d` along it. */
function box(cx: number, cz: number, yaw: number, w: number, d: number): Poly {
  const fx = Math.sin(yaw), fz = Math.cos(yaw) // facing
  const rx = fz, rz = -fx // across
  const pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
    x: cx + rx * (a! * w) / 2 + fx * (b! * d) / 2,
    z: cz + rz * (a! * w) / 2 + fz * (b! * d) / 2,
  }))
  return ccw(pts)
}

/** Wound the way `hull2d` winds and `inside()` in `plateau.ts` reads:
 *  positive signed area in (x, z). */
function ccw(poly: Poly): Poly {
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!
    const q = poly[(i + 1) % poly.length]!
    a += p.x * q.z - q.x * p.z
  }
  return a > 0 ? poly : [...poly].reverse()
}

/** What a landmark carries as walls besides any hull `WALLED` reads off its
 *  model, and what hitting them sounds like, keyed by landmark shape. */
export const FIXTURES: Record<string, { walls: Poly[]; knock: Hit['kind'] } | undefined> = {
  tablo: { walls: ISLAND_WALLS, knock: 'metal' },
}

/** Posts under the rail: one at most `POST_GAP` apart along every edge, not
 *  within a metre of a node (the node has its own), and one at every node. */
export const POST_GAP = 2.4

/**
 * Everything `tools/tablo.py` builds, from the numbers above: each edge's
 * centre line with its height, every post with the ground under it (the
 * island's real profile, for an island revolved out to `R`), and every
 * appliance. The script runs this in node and builds what it says.
 */
export function layout(R: number) {
  const seed = seedOf('tablo')
  const ground = (x: number, z: number) => profileAt(R, seed, x, z, profileOf('tablo'))
  const rails = EDGES.map((e) => e.xs.map((x, i) => [x, heightAt(e, e.cum[i]!), e.zs[i]!]))
  const posts: [number, number, number, number][] = []
  for (const n of NODES) posts.push([n.x, n.z, ground(n.x, n.z), RAIL.low])
  for (const e of EDGES) {
    const n = Math.max(1, Math.ceil((e.len - 2) / POST_GAP))
    for (let k = 1; k < n; k++) {
      const s = 1 + ((e.len - 2) * k) / n
      const p = pointAt(e, s)
      posts.push([p.x, p.z, ground(p.x, p.z), heightAt(e, s)])
    }
  }
  return {
    rails, posts, rail: RAIL, gantry: GANTRY, foot: FOOT, parts: PARTS,
    appliances: APPLIANCES.map((a) => ({ ...a, ground: ground(a.x, a.z) })),
  }
}

// --------------------------------------------------------------- the sheet
//
// The drawing on the sheet pinned under the board in the index's plate — the
// single-line diagram over the position plan, the two views of one model —
// as data: SVG path strings and words, in millimetres on an A3 sheet, each
// tagged with the device it hangs off. The plate's canvas strokes them with
// `Path2D`, the plate's no-script fallback and the case study's stage put them
// in an `<svg>`, and the three cannot draw three installations.

export const SHEET = { w: 297, h: 420 }

/** What a stroke hangs off: the main switch, an RCD, a circuit's breaker —
 *  or nothing, for the frame and the walls. */
export type Owner = 'main' | 'rcd0' | 'rcd1' | 'c0' | 'c1' | 'c2' | 'c3' | null

/** Everything upstream of a device, itself included — what has to be on for
 *  it to be live, and what a hover on any of them lights. The bathroom's RCD
 *  hangs off the house's. */
export const UPSTREAM: Record<Exclude<Owner, null>, Exclude<Owner, null>[]> = {
  main: ['main'],
  rcd0: ['main', 'rcd0'],
  rcd1: ['main', 'rcd0', 'rcd1'],
  c0: ['main', 'rcd0', 'c0'],
  c1: ['main', 'rcd0', 'c1'],
  c2: ['main', 'rcd0', 'c2'],
  c3: ['main', 'rcd0', 'rcd1', 'c3'],
}

/** The device reference each owner is on the drawing, Q1 to Q7. */
export const QREF: Record<Exclude<Owner, null>, string> = {
  main: 'Q1', rcd0: 'Q2', c0: 'Q3', c1: 'Q4', c2: 'Q5', rcd1: 'Q6', c3: 'Q7',
}

/** A stroke — or, with `fill`, a solid. `act` is which act of the case study's
 *  stage draws it (`Survey.tsx`). */
export type Ink = { d: string; owner: Owner; fill?: boolean; act: Act }
export type Word = {
  x: number; y: number; t: string; size: number; owner: Owner; act: Act
  anchor?: 'start' | 'middle' | 'end'; bold?: boolean
}
/** `frame` is the sheet itself, `plan` the survey, `line` the single-line
 *  diagram, `check` the checker's own marks, `title` the title block. */
export type Act = 'frame' | 'plan' | 'line' | 'title'

const f = (n: number) => +n.toFixed(2)

/** IEC symbols, as path data, hanging down from a point on a conductor. */
const SYM = {
  /** A lead, the blade, and the pivot: an isolating switch, 18 tall. */
  swtch: (x: number, y: number) => `M${x} ${y}V${y + 4}M${f(x - 4.5)} ${y + 5}L${x} ${y + 14}V${y + 18}`,
  /** The same with the cross on its fixed contact: a circuit breaker. */
  breaker: (x: number, y: number) =>
    `${SYM.swtch(x, y)}M${f(x - 1.6)} ${f(y + 2.4)}l3.2 3.2M${f(x + 1.6)} ${f(y + 2.4)}l-3.2 3.2`,
  /** A switch with its residual-current relay beside it, linked. */
  rcd: (x: number, y: number) =>
    `${SYM.swtch(x, y)}M${f(x - 2.2)} ${y + 9.5}H${x + 3}M${x + 3} ${y + 7}h5.4v5h-5.4Z`,
  /** The supply coming in. */
  arrow: (x: number, y: number) => `M${x} ${y}V${y + 10}M${f(x - 2.4)} ${y + 6}L${x} ${y + 10}L${f(x + 2.4)} ${y + 6}`,
  /** A lighting point: a cross in a circle, on a stub. */
  lamp: (x: number, y: number) =>
    `M${x} ${y}H${x + 7}M${x + 15} ${y}A4 4 0 1 1 ${x + 7} ${y}A4 4 0 1 1 ${x + 15} ${y}` +
    `M${f(x + 8.2)} ${f(y - 2.8)}L${f(x + 13.8)} ${f(y + 2.8)}M${f(x + 13.8)} ${f(y - 2.8)}L${f(x + 8.2)} ${f(y + 2.8)}`,
  /** A socket outlet with earth, on a stub: the cup, and the bar across it. */
  socket: (x: number, y: number) =>
    `M${x} ${y}H${x + 8}M${x + 12} ${y - 4}A4 4 0 0 0 ${x + 12} ${y + 4}M${x + 8} ${y - 4}V${y + 4}`,
  /** An earth electrode. */
  earth: (x: number, y: number) =>
    `M${x} ${y}V${y + 8}M${x - 4} ${y + 8}H${x + 4}M${f(x - 2.6)} ${y + 10}H${f(x + 2.6)}M${f(x - 1.2)} ${y + 12}H${f(x + 1.2)}`,
}

/** Where each circuit's branch drops off the bus. The bathroom's hangs off
 *  its own RCD, at the end. */
const BRANCH_X = [64, 100, 136, 190]
const FEED_X = 40
const BUS_Y = 88

/** Plan coordinates to sheet millimetres, at 1:50 — 20 mm a metre. */
export const onSheet = (x: number, z: number): [number, number] => [f(148.5 + 20 * x), f(214 + 20 * (z + 3.5))]

const WORDS_OF: Record<'en' | 'fr' | 'nl', { line: string; plan: string; house: string }> = {
  en: { line: 'Single-line diagram', plan: 'Position plan', house: 'House · ground floor' },
  fr: { line: 'Schéma unifilaire', plan: 'Plan de position', house: 'Maison · rez-de-chaussée' },
  nl: { line: 'Eendraadschema', plan: 'Situatieschema', house: 'Woning · gelijkvloers' },
}

export function sheet(locale: 'en' | 'fr' | 'nl') {
  const inks: Ink[] = []
  const words: Word[] = []
  const t = WORDS_OF[locale]
  const names = ROOM_NAMES[locale]
  const ink = (d: string, owner: Owner, act: Act, fill = false) => inks.push({ d, owner, act, fill })
  const word = (x: number, y: number, s: string, size: number, owner: Owner, act: Act,
    o: { anchor?: Word['anchor']; bold?: boolean } = {}) => words.push({ x, y, t: s, size, owner, act, ...o })
  const mm2 = (n: number) => (locale === 'en' ? String(n) : String(n).replace('.', ','))

  // The sheet: its border, the line between the two drawings, the headings.
  ink('M12 12H285V408H12Z', null, 'frame')
  ink('M12 200H285', null, 'frame')
  word(17, 21, t.line, 4.4, null, 'frame', { bold: true })
  word(17, 209, t.plan, 4.4, null, 'frame', { bold: true })

  // ---- the single-line diagram: supply, main switch, house RCD, the bus
  ink(SYM.arrow(FEED_X, 28), 'main', 'line')
  word(FEED_X + 6, 34, '230 V · 40 A', 3.4, 'main', 'line')
  ink(`${SYM.swtch(FEED_X, 38)}M${FEED_X} 56V62`, 'main', 'line')
  word(FEED_X + 6, 48, 'Q1', 4, 'main', 'line', { bold: true })
  word(FEED_X + 6, 53, '40 A', 3.2, 'main', 'line')
  ink(`${SYM.rcd(FEED_X, 62)}M${FEED_X} 80V${BUS_Y}`, 'rcd0', 'line')
  word(FEED_X + 11, 70, 'Q2', 4, 'rcd0', 'line', { bold: true })
  word(FEED_X + 11, 75, `40 A · ${RCDS[0]!.ma} mA · ${RCDS[0]!.type}`, 3.2, 'rcd0', 'line')
  ink(`M${FEED_X} ${BUS_Y}H${BRANCH_X[3]}`, 'rcd0', 'line')
  // The earth, beside the supply.
  ink(SYM.earth(110, 34), null, 'line')
  word(116, 42, 'PE', 3.4, null, 'line', { bold: true })

  CIRCUITS.forEach((c, k) => {
    const owner = `c${k}` as Owner
    const x = BRANCH_X[k]!
    let y = BUS_Y
    if (c.rcd === 1) {
      ink(`M${x} ${y}V${y + 4}${SYM.rcd(x, y + 4)}`, 'rcd1', 'line')
      word(x + 11, y + 12, QREF.rcd1, 4, 'rcd1', 'line', { bold: true })
      word(x + 11, y + 17, `${RCDS[1]!.ma} mA · ${RCDS[1]!.type}`, 3.2, 'rcd1', 'line')
      y += 22
    }
    ink(`M${x} ${y}V${y + 4}${SYM.breaker(x, y + 4)}`, owner, 'line')
    const q = QREF[owner as Exclude<Owner, null>]
    word(x + 6, y + 12, q, 4, owner, 'line', { bold: true })
    word(x + 6, y + 17, `${c.curve}${c.amps} A`, 3.2, owner, 'line')
    word(x + 6, y + 21.5, `${mm2(c.mm2)} mm²`, 2.9, owner, 'line')
    y += 22
    const pts = POINTS.filter((p) => p.circuit === k)
    const ys = pts.map((_, i) => y + 10 + i * 15)
    ink(`M${x} ${y}V${ys[ys.length - 1]}`, owner, 'line')
    pts.forEach((p, i) => {
      ink(SYM[p.kind](x, ys[i]!), owner, 'line')
      word(x + 18, ys[i]! + 1.2, p.tag, 3.2, owner, 'line')
    })
    word(x - 3, ys[ys.length - 1]! + 11, `${c.tag} · ${names[ROOMS[c.room]!.key]}`, 3.2, owner, 'line', { bold: true })
  })

  // ---- the position plan, at 1:50
  for (const w of WALLS) {
    const r = wallRect(w)
    const [x0, z0] = onSheet(r.x0, r.z0)
    const [x1, z1] = onSheet(r.x1, r.z1)
    ink(`M${x0} ${z0}H${x1}V${z1}H${x0}Z`, null, 'plan', true)
  }
  const rooms = ROOMS.map((r, k) => {
    const [x0, y0] = onSheet(r.x0, r.z0)
    const [x1, y1] = onSheet(r.x1, r.z1)
    word(x0 + 3, y0 + 6, names[r.key], 3.2, null, 'plan')
    return { owner: `c${k}` as Owner, x: x0, y: y0, w: f(x1 - x0), h: f(y1 - y0) }
  })
  const lamps: { owner: Owner; x: number; y: number }[] = []
  for (const p of POINTS) {
    const owner = `c${p.circuit}` as Owner
    const [x, y] = onSheet(p.x, p.z)
    if (p.kind === 'lamp') {
      lamps.push({ owner, x, y })
      ink(`M${x + 3.4} ${y}A3.4 3.4 0 1 1 ${x - 3.4} ${y}A3.4 3.4 0 1 1 ${x + 3.4} ${y}` +
        `M${f(x - 2.4)} ${f(y - 2.4)}L${f(x + 2.4)} ${f(y + 2.4)}M${f(x + 2.4)} ${f(y - 2.4)}L${f(x - 2.4)} ${f(y + 2.4)}`, owner, 'plan')
      word(x + 5, y - 4, p.tag, 3, owner, 'plan')
    } else {
      // The cup faces into the room, its stem back to the wall it is on.
      const [x0, x1, z0, z1] = socketBox(p)
      const alongX = x1 - x0 > z1 - z0
      const nx = alongX ? 0 : p.x < 0 ? 1 : -1
      const nz = alongX ? (p.z > 0 ? -1 : 1) : 0
      const r = 2.8
      const px = -nz, pz = nx
      const a = [f(x + px * r), f(y + pz * r)]
      const b = [f(x - px * r), f(y - pz * r)]
      // Which way round the half circle goes: through the side facing in.
      const sweep = px * nz - pz * nx > 0 ? 1 : 0
      ink(`M${a[0]} ${a[1]}A${r} ${r} 0 0 ${sweep} ${b[0]} ${b[1]}M${x} ${y}L${f(x - nx * 3.4)} ${f(y - nz * 3.4)}` +
        `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`, owner, 'plan')
      word(f(x + nx * 5 + (alongX ? 3.5 : 0)), f(y + nz * 6 + (alongX ? 0 : -3)), p.tag, 3, owner, 'plan',
        { anchor: nx < 0 ? 'end' : 'start' })
    }
  }
  // The board at the door: the symbol for a distribution board, a box half
  // filled across its diagonal.
  {
    const [x0, y0] = onSheet(CABINET.x0, CABINET.z0)
    const [x1, y1] = onSheet(CABINET.x1, CABINET.z1)
    ink(`M${x0} ${y0}H${x1}V${y1}H${x0}Z`, 'main', 'plan')
    ink(`M${x0} ${y1}L${x1} ${y0}V${y1}Z`, 'main', 'plan', true)
  }

  // ---- the title block
  ink('M177 384H285M177 384V408M177 392H285M177 400H285', null, 'title')
  word(181, 390, 'Tablo', 4.6, null, 'title', { bold: true })
  word(181, 398, t.house, 3.2, null, 'title')
  word(181, 406, '1:50 · A3 · RGIE', 3.2, null, 'title')

  return { inks, words, rooms, lamps }
}

/** Where the sheet lands in a 900 × 1162 plate: the affine map that takes
 *  sheet millimetres to plate units, `[a, b, c, d, e, f]` as `setTransform`
 *  and SVG's `matrix()` read it — from the sheet's top-left, top-right and
 *  bottom-left corners, which is exact for a flat sheet seen square-on and
 *  within a pixel for this one. */
export function sheetMatrix(corners: readonly (readonly [number, number])[]): [number, number, number, number, number, number] {
  const [tl, tr, , bl] = corners as [readonly [number, number], readonly [number, number], unknown, readonly [number, number]]
  return [
    (tr[0] - tl[0]) / SHEET.w, (tr[1] - tl[1]) / SHEET.w,
    (bl[0] - tl[0]) / SHEET.h, (bl[1] - tl[1]) / SHEET.h,
    tl[0], tl[1],
  ]
}


// --------------------------------------------------------------- the plate

/**
 * Where everything is in the index's plate, 900 × 1162 — measured by
 * `tools/tablo_plate.py` through the render's own camera and pasted here:
 * each device's box on the board (the whole face of its module, so a lever
 * either way is inside it), its label strip's four corners, the enclosure,
 * and the four corners of the sheet. Re-render, re-paste.
 */
export const PLATE: {
  devices: { kind: 'main' | 'rcd' | 'breaker' | 'lamp'; ref: number | null; box: [number, number, number, number]; label: [number, number][] }[]
  board: [number, number, number, number]
  sheet: [number, number][]
} = {
  devices: [
    { kind: 'main', ref: null, box: [280.3, 113.6, 337.1, 199.0], label: [[281.6, 91.0], [337.8, 91.0], [337.8, 111.4], [281.7, 111.4]] },
    { kind: 'rcd', ref: 0, box: [336.9, 113.6, 393.6, 199.0], label: [[337.8, 91.0], [393.9, 91.0], [393.9, 111.4], [337.8, 111.4]] },
    { kind: 'breaker', ref: 0, box: [393.4, 113.6, 421.8, 199.0], label: [[393.9, 91.0], [421.9, 91.0], [422.0, 111.4], [393.9, 111.4]] },
    { kind: 'breaker', ref: 1, box: [421.7, 113.6, 450.0, 199.0], label: [[421.9, 91.0], [450.0, 91.0], [450.0, 111.4], [422.0, 111.4]] },
    { kind: 'breaker', ref: 2, box: [450.0, 113.6, 478.2, 199.0], label: [[450.0, 91.0], [478.1, 91.0], [478.0, 111.4], [450.0, 111.4]] },
    { kind: 'rcd', ref: 1, box: [281.0, 287.3, 337.6, 372.0], label: [[282.3, 263.4], [338.2, 263.4], [338.3, 283.7], [282.4, 283.7]] },
    { kind: 'breaker', ref: 3, box: [337.4, 287.3, 365.7, 372.0], label: [[338.2, 263.4], [366.2, 263.4], [366.2, 283.7], [338.3, 283.7]] },
    { kind: 'lamp', ref: null, box: [365.5, 287.3, 393.8, 372.0], label: [[366.2, 263.4], [394.1, 263.4], [394.1, 283.7], [366.2, 283.7]] },
  ],
  board: [239.3, 28.0, 658.6, 457.7],
  sheet: [[226.0, 516.8], [660.1, 506.9], [669.7, 1108.5], [244.0, 1118.0]],
}
