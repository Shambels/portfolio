/**
 * Tablo's island as data and arithmetic: a house drawn as its own position
 * plan, the distribution board that feeds it, and what riding through it does
 * to the circuits. Pure, no three and no DOM, so `tablo.check.ts` can ride the
 * plan in node — and so the index's plate (`Switchboard.tsx`) and the case
 * study's stage (`Survey.tsx`) draw the same installation the island is.
 *
 * Tablo draws and checks the diagrams of Belgian installations, and its one
 * idea is that the single-line diagram and the position plan are one model
 * seen twice: a point on the plan is a point on a circuit, tagged A1, A2…
 * like the board. So the island is that model standing up. The floor is the
 * plan — four rooms, kerbs for walls, a lamp and sockets where an installer
 * would put them — and every point is wired back to a breaker in a board at
 * the front door. Riding into a room is current going to it: its conductors
 * light from the board outward, its lamp comes on, its breaker's LED glows.
 * Hit a kerb hard enough and the RCD upstream of the room trips, and every
 * circuit behind it goes dark until it re-arms.
 *
 * Everything below is in the landmark's own space, metres: +Z toward the
 * world's centre (the visitor's approach), y up from the plateau.
 * `tools/tablo.py` builds the model from the same numbers, and the check reads
 * the .glb back against them.
 */

import type { Hit, Poly } from './plateau.ts'

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
  /** Where its conductor leaves the board, across the landmark — see
   *  `route`. The two deeper rooms take the inner trunks, so no circuit's
   *  run crosses another's. */
  trunk: number
}

export const CIRCUITS: Circuit[] = [
  { tag: 'A', room: 0, rcd: 0, amps: 20, curve: 'C', mm2: 2.5, trunk: -0.27 },
  { tag: 'B', room: 1, rcd: 0, amps: 20, curve: 'C', mm2: 2.5, trunk: 0.27 },
  { tag: 'C', room: 2, rcd: 0, amps: 16, curve: 'B', mm2: 1.5, trunk: -0.09 },
  { tag: 'D', room: 3, rcd: 1, amps: 20, curve: 'C', mm2: 2.5, trunk: 0.09 },
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

/** A lamp: a post, and the globe on it. */
export const LAMP = { post: 0.07, h: 1.45, r: 0.2 }
/** A socket outlet, giant: a block against its wall. */
export const SOCKET = { w: 0.36, h: 0.36, d: 0.2 }

// ---------------------------------------------------------------- the board

/** The cabinet, outside the front wall and facing the approach. */
export const CABINET = { x0: -0.95, x1: 0.95, z0: 3.62, z1: 4.07, y0: 0.2, y1: 2.6 }
/** The door, open on its left hinge and swung back flat against nothing:
 *  160° from shut, its inside — where the diagram lives — to the visitor. */
export const DOOR = { hinge: [-0.95, 4.07] as const, w: 1.9, t: 0.05, open: (160 * Math.PI) / 180 }

/** One DIN module, giant — ten times a real one, so a breaker reads as a
 *  breaker from the water's edge. */
export const MODULE = { w: 0.18, h: 0.56 }
/** The mounting plate's face, and how far a module stands proud of it:
 *  `base` all over, `nose` on the middle of the face. The lever's pivot is on
 *  the nose. */
export const DEPTH = { plate: 3.7, base: 0.12, nose: 0.07 }
export const ROW_Y = [1.98, 1.3] as const

export type Device = { kind: 'main' | 'rcd' | 'breaker' | 'blank'; row: number; slot: number; mods: number; ref?: number }
/** Left to right, row by row: the main switch, the house RCD and the three
 *  circuits under it; the bathroom's RCD and its one circuit, then blanks.
 *  `ref` is the RCD or the circuit the device is. */
export const DEVICES: Device[] = [
  { kind: 'main', row: 0, slot: 0, mods: 2 },
  { kind: 'rcd', row: 0, slot: 2, mods: 2, ref: 0 },
  { kind: 'breaker', row: 0, slot: 4, mods: 1, ref: 0 },
  { kind: 'breaker', row: 0, slot: 5, mods: 1, ref: 1 },
  { kind: 'breaker', row: 0, slot: 6, mods: 1, ref: 2 },
  { kind: 'rcd', row: 1, slot: 0, mods: 2, ref: 1 },
  { kind: 'breaker', row: 1, slot: 2, mods: 1, ref: 3 },
  { kind: 'blank', row: 1, slot: 3, mods: 4 },
]
/** Seven modules a row, centred. */
export const ROW_X0 = -3.5 * MODULE.w

/** Where a device's lever turns: the middle of its width, on its nose. */
export function pivot(d: Device): [number, number, number] {
  return [ROW_X0 + (d.slot + d.mods / 2) * MODULE.w, ROW_Y[d.row]!, DEPTH.plate + DEPTH.base + DEPTH.nose]
}

/** A lever's throw: up is on, as on every board here, and down is off. */
export const THROW = { on: 0.55, off: -0.55 }

// -------------------------------------------------------------- the wiring

/** Where every conductor starts: under the board, at its trunk. */
export const FEED_Z = 3.55

/**
 * A point's conductor, as the plan draws it: straight back from the board
 * on its circuit's trunk to the point's depth, then across to it. Two legs,
 * both always moving away from where it started — which is what lets the
 * shader read "how far along the wire" as plain Manhattan distance from the
 * trunk's foot, `flowAt`, without the model carrying a coordinate for it.
 */
export function route(p: Point): [number, number][] {
  const x = CIRCUITS[p.circuit]!.trunk
  return [[x, FEED_Z], [x, p.z], [p.x, p.z]]
}

/** How far along its circuit's wiring a point on the floor is. */
export const flowAt = (circuit: number, x: number, z: number) =>
  Math.abs(x - CIRCUITS[circuit]!.trunk) + (FEED_Z - z)

/** Which room an XZ is in, or -1 outside the house. */
export function roomAt(x: number, z: number): number {
  return ROOMS.findIndex((r) => x >= r.x0 && x < r.x1 && z >= r.z0 && z < r.z1)
}

/** Everything a board can hit on the island, as convex polygons
 *  counter-clockwise: the kerbs, the cabinet, its open door, the lamp posts
 *  and the sockets. Read by `Landmarks.tsx` into the island's prop set, so the
 *  walls come from the numbers and not from the mesh — a hull of the kerbs'
 *  vertices would be one polygon round the whole house. */
export const PLAN_WALLS: Poly[] = (() => {
  const rect = (x0: number, x1: number, z0: number, z1: number): Poly => [
    { x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 },
  ]
  const out = WALLS.map((w) => {
    const r = wallRect(w)
    return rect(r.x0, r.x1, r.z0, r.z1)
  })
  out.push(rect(CABINET.x0, CABINET.x1, CABINET.z0, CABINET.z1))
  // The door, a thin plank turned about its hinge.
  const [hx, hz] = DOOR.hinge
  const ux = Math.cos(DOOR.open)
  const uz = Math.sin(DOOR.open)
  const nx = -uz * DOOR.t
  const nz = ux * DOOR.t
  const door: Poly = [
    { x: hx, z: hz }, { x: hx + ux * DOOR.w, z: hz + uz * DOOR.w },
    { x: hx + ux * DOOR.w + nx, z: hz + uz * DOOR.w + nz }, { x: hx + nx, z: hz + nz },
  ]
  out.push(ccw(door))
  for (const p of POINTS) {
    if (p.kind === 'lamp') out.push(rect(p.x - LAMP.post, p.x + LAMP.post, p.z - LAMP.post, p.z + LAMP.post))
    else out.push(rect(...socketBox(p)))
  }
  return out
})()

/** What a landmark carries as walls besides the hull `WALLED` reads off its
 *  model, and what hitting them sounds like — keyed by landmark shape, like
 *  `DECKS`. One landmark has any: a house's kerbs are many walls, not one. */
export const FIXTURES: Record<string, { walls: Poly[]; knock: Hit['kind'] } | undefined> = {
  tablo: { walls: PLAN_WALLS, knock: 'wood' },
}

/** A socket's footprint: its back against the nearest wall. */
export function socketBox(p: Point): [number, number, number, number] {
  const alongX = Math.abs(Math.abs(p.z) - 3.5) < 0.3 || Math.abs(p.z - 3.0) < 0.3
  const w = SOCKET.w / 2
  const d = SOCKET.d / 2
  return alongX ? [p.x - w, p.x + w, p.z - d, p.z + d] : [p.x - d, p.x + d, p.z - w, p.z + w]
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

// ------------------------------------------------------------ the behaviour

/**
 * The installation's state, frame to frame. `live` is how lit each circuit
 * is, 0 to 1 — its conductors, its lamp, its LED. A circuit goes live when
 * somebody is in its room and stays live for `HOLD` seconds after they leave,
 * so riding the house through draws the whole diagram and it stays drawn for
 * a while. `armed` is whether each RCD is in, `down` how long a tripped one
 * has left before it re-arms, and `lever` where its lever is, 0 down and 1 up
 * — eased, because the shader draws it.
 */
export type Wiring = { live: number[]; seen: number[]; armed: boolean[]; down: number[]; lever: number[] }

export const WIRING = {
  /** Seconds a circuit stays live after its room was last visited. */
  hold: 45,
  /** How quickly a circuit lights, and goes out — per second. */
  on: 2.5,
  off: 1.2,
  /** Seconds a tripped RCD stays out. */
  reset: 3.5,
  /** And its lever's throw, per second. */
  throw: 6,
  /** A knock at least this hard (0 to 1, `Hit.force`) trips the room's RCD. */
  trip: 0.5,
}

export function wiring(): Wiring {
  return {
    live: CIRCUITS.map(() => 0),
    seen: CIRCUITS.map(() => Infinity),
    armed: RCDS.map(() => true),
    down: RCDS.map(() => 0),
    lever: RCDS.map(() => 1),
  }
}

/**
 * One frame. `room` is where the rider is (`roomAt`, or -1), `knock` the
 * hardest hit on the island this frame (0 for none). Returns what happened
 * that has a sound: an RCD tripping, or one coming back in. Under reduced
 * motion everything is where it is going at once.
 *
 * Which RCD a knock trips is the one upstream of the room it happened in —
 * the bathroom's own 30 mA in the bathroom, the house's 300 mA anywhere else,
 * the cabinet included. That is what a fault does.
 */
export function stepWiring(w: Wiring, dt: number, room: number, knock: number, reduced: boolean): 'trip' | 'rearm' | null {
  let event: 'trip' | 'rearm' | null = null
  for (let k = 0; k < CIRCUITS.length; k++) w.seen[k] = CIRCUITS[k]!.room === room ? 0 : w.seen[k]! + dt
  if (knock >= WIRING.trip) {
    const r = room >= 0 ? CIRCUITS[room]!.rcd : 0
    if (w.armed[r]) {
      w.armed[r] = false
      w.down[r] = WIRING.reset
      event = 'trip'
    }
  }
  for (let r = 0; r < RCDS.length; r++) {
    if (!w.armed[r]) {
      w.down[r] = w.down[r]! - dt
      if (w.down[r]! <= 0) {
        w.armed[r] = true
        w.down[r] = 0
        event ??= 'rearm'
      }
    }
    const want = w.armed[r] ? 1 : 0
    const l = w.lever[r]!
    w.lever[r] = reduced ? want : l + Math.sign(want - l) * Math.min(Math.abs(want - l), WIRING.throw * dt)
  }
  for (let k = 0; k < CIRCUITS.length; k++) {
    const c = CIRCUITS[k]!
    const fed = w.armed[0]! && w.armed[c.rcd]!
    const want = fed && w.seen[k]! < WIRING.hold ? 1 : 0
    const l = w.live[k]!
    // Out at once when an RCD goes — a trip is not a fade — and back up at
    // the usual rate when it comes back.
    if (reduced || !fed) w.live[k] = want
    else w.live[k] = l + Math.sign(want - l) * Math.min(Math.abs(want - l), (want > l ? WIRING.on : WIRING.off) * dt)
  }
  return event
}

// ------------------------------------------------------------- the words

/** Room names, for the diagram's labels on the plate and the stage. */
export const ROOM_NAMES: Record<'en' | 'fr' | 'nl', Record<RoomKey, string>> = {
  en: { living: 'Living room', kitchen: 'Kitchen', bedroom: 'Bedroom', bathroom: 'Bathroom' },
  fr: { living: 'Séjour', kitchen: 'Cuisine', bedroom: 'Chambre', bathroom: 'Salle de bain' },
  nl: { living: 'Woonkamer', kitchen: 'Keuken', bedroom: 'Slaapkamer', bathroom: 'Badkamer' },
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
