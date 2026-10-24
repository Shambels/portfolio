/**
 * Ride a board round Tablo's house and check that the plan, the wiring and
 * the model all say the same thing. `node src/tablo.check.ts`.
 *
 * Held: **the plan** — four rooms that tile the house, every point in its own
 * room, a doorway of 2.4 m into each, and all of it on the island's flat top
 * for the real seed and radius; **the wiring** — every conductor only ever
 * moves away from the board (which is what lets the shader read distance along
 * it as Manhattan distance), and no circuit's run crosses another's; **the
 * file** — the kerbs, the conductors and the two RCD levers in
 * `src/models/tablo.glb` are where `tablo.ts` says; **the walls** — a board
 * ridden at the kerbs on eight bearings never ends a frame inside one and
 * knocks; **the circuits** — riding into a room lights its circuit, a hard
 * knock trips the RCD upstream of that room and only that one, and it comes
 * back by itself.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { BOARD, GROUND, RIDER_MASS, inside, makeSet, profileAt, seedOf, stepProps, type Board, type Hit, type Terrain } from './plateau.ts'
import {
  CABINET, CIRCUITS, DEVICES, DOOR, FIXTURES, HOUSE, KERB, PLAN_WALLS, POINTS, RCDS, ROOMS, THROW, WALLS, WIRING,
  flowAt, pivot, roomAt, route, stepWiring, wallRect, wiring,
} from './tablo.ts'

const DT = 1 / 120
const SPREAD = 1.9 // `ISLAND_SPREAD`, `world.ts`

// The island where the content puts it — read off the frontmatter, so a move
// in the MDX is a move here.
const fm = readFileSync(new URL('./content/projects/tablo.en.mdx', import.meta.url), 'utf8')
const nums = (key: string) => fm.match(new RegExp(`^${key}: \\[?([-\\d., ]+)\\]?$`, 'm'))![1]!.split(',').map(Number)
const [px, pz] = nums('pos') as [number, number]
const [radius] = nums('radius') as [number]
const [wx, wz] = nums('waypoint') as [number, number]
const [bw, bh, bd] = nums('size') as [number, number, number]
const rot = Math.atan2(-px, -pz)
const toLocal = (x: number, z: number) => ({
  x: (x - px) * Math.cos(rot) - (z - pz) * Math.sin(rot),
  z: (x - px) * Math.sin(rot) + (z - pz) * Math.cos(rot),
})
/** Landmark-local back to world, the inverse of the turn above. */
const toWorld = (x: number, z: number) => ({
  x: px + x * Math.cos(rot) + z * Math.sin(rot),
  z: pz - x * Math.sin(rot) + z * Math.cos(rot),
})

// ------------------------------------------------------------- the plan
{
  let area = 0
  for (const r of ROOMS) area += (r.x1 - r.x0) * (r.z1 - r.z0)
  assert.ok(Math.abs(area - (HOUSE.x1 - HOUSE.x0) * (HOUSE.z1 - HOUSE.z0)) < 1e-9, 'the rooms do not tile the house')
  for (let i = 0; i < ROOMS.length; i++) for (let k = i + 1; k < ROOMS.length; k++) {
    const a = ROOMS[i]!, b = ROOMS[k]!
    assert.ok(a.x1 <= b.x0 || b.x1 <= a.x0 || a.z1 <= b.z0 || b.z1 <= a.z0, `${a.key} and ${b.key} overlap`)
  }
  CIRCUITS.forEach((c, k) => assert.equal(c.room, k, `circuit ${c.tag} is not room ${k}'s`))
  for (const p of POINTS) assert.equal(roomAt(p.x, p.z), p.circuit, `${p.tag} is not in its own room`)
  // Tags as Tablo writes them: the circuit's letter and a running number.
  assert.deepEqual(POINTS.map((p) => p.tag), ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'D1', 'D2'])
  // The bathroom is behind the 30 mA RCD and nothing else is.
  for (const c of CIRCUITS) assert.equal(RCDS[c.rcd]!.ma, ROOMS[c.room]!.key === 'bathroom' ? 30 : 300, `${c.tag}'s RCD`)

  // Every gap left in a wall line inside the house is a doorway a board fits
  // through: 2.4 m, or none.
  const lines = new Map<string, [number, number][]>()
  for (const [axis, at, a, b] of WALLS) {
    const key = `${axis}${at}`
    lines.set(key, [...(lines.get(key) ?? []), [a, b]])
  }
  let doors = 0
  for (const [key, runs] of lines) {
    runs.sort((p, q) => p[0] - q[0])
    for (let i = 1; i < runs.length; i++) {
      const gap = runs[i]![0] - runs[i - 1]![1]
      assert.ok(gap >= 2.4 - 1e-9, `${key}: a doorway of ${gap.toFixed(2)}`)
      doors++
    }
  }
  assert.ok(doors >= 8, `only ${doors} doorways`)
  // And each room has at least one, so no room is a box he cannot get into:
  // somewhere on its edge, 2.4 m in a row that no wall stands on.
  const blocked = (x: number, z: number) =>
    WALLS.map(wallRect).some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1)
  for (const r of ROOMS) {
    const edges: [number, number, number, number][] = [
      [r.x0, r.z0, r.x1, r.z0], [r.x1, r.z0, r.x1, r.z1], [r.x1, r.z1, r.x0, r.z1], [r.x0, r.z1, r.x0, r.z0],
    ]
    let best = 0
    for (const [ax, az, bx, bz] of edges) {
      const n = Math.round(Math.hypot(bx - ax, bz - az) / 0.02)
      let run = 0
      for (let i = 0; i <= n; i++) {
        run = blocked(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n) ? 0 : run + 0.02
        best = Math.max(best, run)
      }
    }
    // 2.4 between the runs is 2.28 between the kerbs' faces.
    assert.ok(best >= 2.25, `${r.key} has no doorway (${best.toFixed(2)} m free)`)
  }

  // On the flat top: every corner of every wall, the cabinet and the door's
  // far end, at the real seed and the real radius.
  const R = radius * SPREAD
  const seed = seedOf('tablo')
  for (const poly of PLAN_WALLS) for (const v of poly) {
    assert.equal(profileAt(R, seed, v.x, v.z), 0, `(${v.x.toFixed(2)}, ${v.z.toFixed(2)}) is off the flat top`)
  }
  // Inside the frontmatter box, which `tools/tablo.py` asserts too.
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const poly of PLAN_WALLS) for (const v of poly) {
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z)
  }
  assert.ok(x1 - x0 <= bw && z1 - z0 <= bd && CABINET.y1 <= bh, 'the plan is outside the frontmatter box')
}

// ----------------------------------------------------------- the wiring
{
  for (const p of POINTS) {
    const r = route(p)
    let along = 0
    for (let i = 1; i < r.length; i++) {
      const [ax, az] = r[i - 1]!
      const [bx, bz] = r[i]!
      along += Math.abs(bx - ax) + Math.abs(bz - az)
      // Monotone: the flow coordinate at every vertex is the length run so far.
      assert.ok(Math.abs(flowAt(p.circuit, bx, bz) - along) < 1e-9, `${p.tag}: the run doubles back at vertex ${i}`)
    }
  }
  // No two circuits' runs cross.
  const segs = POINTS.flatMap((p) => {
    const r = route(p)
    return r.slice(1).map((b, i) => ({ c: p.circuit, a: r[i]!, b }))
  })
  for (const s of segs) for (const t of segs) {
    if (s.c >= t.c) continue
    const [ax, az] = s.a, [bx, bz] = s.b, [cx, cz] = t.a, [dx, dz] = t.b
    const ox = Math.max(Math.min(ax, bx), Math.min(cx, dx)) <= Math.min(Math.max(ax, bx), Math.max(cx, dx)) + 1e-9
    const oz = Math.max(Math.min(az, bz), Math.min(cz, dz)) <= Math.min(Math.max(az, bz), Math.max(cz, dz)) + 1e-9
    assert.ok(!(ox && oz), `${CIRCUITS[s.c]!.tag} and ${CIRCUITS[t.c]!.tag} cross`)
  }
}

// -------------------------------------------------------------- the file

function meshesFromGlb(path: string): { name: string; pos: Float32Array }[] {
  const b = readFileSync(path)
  const len = b.readUInt32LE(12)
  const j = JSON.parse(b.subarray(20, 20 + len).toString()) as {
    nodes: { name?: string; mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[] }[]
    meshes: { name?: string; primitives: { attributes: { POSITION: number } }[] }[]
    accessors: { bufferView: number; byteOffset?: number; count: number }[]
    bufferViews: { byteOffset?: number; byteLength: number }[]
  }
  const bin = 20 + len + 8
  const out: { name: string; pos: Float32Array }[] = []
  for (const n of j.nodes) {
    if (n.mesh === undefined) continue
    assert.ok(!n.translation && !n.rotation && !n.scale, `${path}: a node with a transform`)
    for (const prim of j.meshes[n.mesh]!.primitives) {
      const acc = j.accessors[prim.attributes.POSITION]!
      const view = j.bufferViews[acc.bufferView]!
      const off = bin + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
      out.push({ name: n.name ?? '', pos: new Float32Array(b.buffer.slice(b.byteOffset + off, b.byteOffset + off + acc.count * 12)) })
    }
  }
  return out
}

{
  const meshes = meshesFromGlb(new URL('./models/tablo.glb', import.meta.url).pathname)
  const named = (n: string) => {
    const m = meshes.find((x) => x.name === n)
    assert.ok(m, `no ${n} in tablo.glb`)
    return m.pos
  }
  // Nothing loose, and every name a material key `Landmarks.tsx` knows.
  const KEYS = ['frame', 'panel', 'dark', 'plan', 'wire', 'lamp']
  for (const m of meshes) {
    assert.ok(!m.name.includes('~'), `${m.name}: Tablo has no loose props`)
    assert.ok(KEYS.includes(m.name.split('_')[0]!), `${m.name}: no material for it`)
  }
  // Every kerb vertex is a corner of one of `WALLS`' rectangles, give or take
  // the bevel, and stands no taller than `KERB.h`.
  const kerb = named('frame_kerb')
  const rects = WALLS.map(wallRect)
  for (let i = 0; i < kerb.length; i += 3) {
    const x = kerb[i]!, y = kerb[i + 1]!, z = kerb[i + 2]!
    assert.ok(y <= KERB.h + 1e-4 && y >= -1e-4, 'a kerb out of its height')
    assert.ok(rects.some((r) => x >= r.x0 - 1e-3 && x <= r.x1 + 1e-3 && z >= r.z0 - 1e-3 && z <= r.z1 + 1e-3),
      `a kerb vertex at (${x.toFixed(2)}, ${z.toFixed(2)}) is in no wall`)
  }
  // Every conductor vertex lies on its own circuit's route, within the
  // strip's half-width — which is what the flow shader assumes.
  CIRCUITS.forEach((_, k) => {
    const w = named(`wire_${'abcd'[k]}`)
    const segs = POINTS.filter((p) => p.circuit === k).flatMap((p) => {
      const r = route(p)
      return r.slice(1).map((b, i) => [r[i]!, b] as const)
    })
    for (let i = 0; i < w.length; i += 3) {
      const x = w[i]!, z = w[i + 2]!
      const near = segs.some(([[ax, az], [bx, bz]]) =>
        x >= Math.min(ax, bx) - 0.036 && x <= Math.max(ax, bx) + 0.036 && z >= Math.min(az, bz) - 0.036 && z <= Math.max(az, bz) + 0.036)
      assert.ok(near, `wire_${'abcd'[k]}: a vertex off the route at (${x.toFixed(2)}, ${z.toFixed(2)})`)
    }
  })
  // The levers the shader throws: each one's nearest vertex to the plate is
  // on its device's pivot, and its farthest is up and out — the "on" pose.
  RCDS.forEach((_, r) => {
    const lever = named(`panel_rcd${r}`)
    const [qx, qy, qz] = pivot(DEVICES.find((d) => d.kind === 'rcd' && d.ref === r)!)
    let tip = -Infinity
    for (let i = 0; i < lever.length; i += 3) {
      assert.ok(Math.abs(lever[i]! - qx) < 0.05, `panel_rcd${r} is not on its device`)
      const dy = lever[i + 1]! - qy, dz = lever[i + 2]! - qz
      assert.ok(Math.hypot(dy, dz) < 0.17, `panel_rcd${r} is not at its pivot`)
      tip = Math.max(tip, dy)
    }
    assert.ok(tip > 0.14 * Math.sin(THROW.on) - 0.03, `panel_rcd${r} is not thrown up`)
  })
}

// ------------------------------------------------------------- the walls
const flat: Terrain = () => ({ land: GROUND, water: 0 })
const board = (x: number, z: number, yaw: number, speed: number): Board => ({
  x, y: GROUND + 0.05, z, yaw, vx: Math.sin(yaw) * speed, vz: Math.cos(yaw) * speed,
  spin: 0, len: BOARD.len, r: BOARD.r, m: RIDER_MASS,
})
/** Is the board's spine, sampled, within its own radius of a wall? */
function into(b: Board): number {
  const hx = Math.sin(b.yaw - rot), hz = Math.cos(b.yaw - rot)
  const c = toLocal(b.x, b.z)
  let worst = Infinity
  for (let k = 0; k <= 8; k++) {
    const t = (k / 8 - 0.5) * b.len
    const qx = c.x + hx * t, qz = c.z + hz * t
    for (const poly of PLAN_WALLS) {
      if (inside(poly, qx, qz)) return -1
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, e = poly[(i + 1) % poly.length]!
        const dx = e.x - a.x, dz = e.z - a.z
        const u = Math.min(Math.max(((qx - a.x) * dx + (qz - a.z) * dz) / (dx * dx + dz * dz), 0), 1)
        worst = Math.min(worst, Math.hypot(qx - a.x - dx * u, qz - a.z - dz * u))
      }
    }
  }
  return worst
}

{
  // The deep link: a board parked at the waypoint facing the island is clear
  // of every wall.
  const yaw = Math.atan2(px - wx, pz - wz)
  assert.ok(into(board(wx, wz, yaw, 0)) > BOARD.r + 0.1, 'the waypoint parks the board in a wall')

  // At the bedroom's outside wall, from inside the room, on eight headings
  // fanned round square: it stops at the kerb — or the lamp post on the way —
  // and knocks.
  const fix = FIXTURES.tablo!
  for (let k = 0; k < 8; k++) {
    const set = makeSet('tablo', px, pz, rot, [], fix.walls, null, fix.knock)
    const heading = -Math.PI / 2 + (k / 7 - 0.5) * 1.0 // local -X, the left wall, ± 29°
    const start = toWorld(-0.9, -2.2 + 0.1 * k)
    // A local heading to a world yaw: the island is turned by `rot`.
    const b = board(start.x, start.z, heading + rot, 7.5)
    const hits: Hit[] = []
    for (let f = 0; f < 240; f++) {
      b.x += b.vx * DT
      b.z += b.vz * DT
      stepProps(set, DT, b, true, flat, hits)
      assert.ok(into(b) >= b.r - 0.03, `heading ${k}: frame ${f} is inside a wall`)
    }
    assert.ok(hits.some((h) => h.kind === 'wood' && h.force > 0.3), `heading ${k}: rode at a kerb and did not knock`)
  }
}

// ---------------------------------------------------------- the circuits
{
  const w = wiring()
  // Into the living room: A lights, the others do not.
  for (let f = 0; f < 120; f++) stepWiring(w, DT, 0, 0, false)
  assert.ok(w.live[0]! > 0.99 && w.live.slice(1).every((v) => v === 0), 'riding into the living room lit the wrong circuits')
  // Through the kitchen and into the bathroom.
  for (let f = 0; f < 120; f++) stepWiring(w, DT, 1, 0, false)
  for (let f = 0; f < 120; f++) stepWiring(w, DT, 3, 0, false)
  assert.ok(w.live[0]! > 0.99 && w.live[1]! > 0.99 && w.live[3]! > 0.99 && w.live[2] === 0, 'the circuits do not stay lit')
  // A hard knock in the bathroom trips its 30 mA RCD and nothing else.
  assert.equal(stepWiring(w, DT, 3, 0.9, false), 'trip')
  assert.ok(!w.armed[1] && w.armed[0], 'the bathroom tripped the wrong RCD')
  assert.equal(w.live[3], 0, 'D did not go out with its RCD')
  assert.ok(w.live[0]! > 0.99 && w.live[1]! > 0.99, 'A and B went out with the bathroom')
  // A soft one does nothing.
  assert.equal(stepWiring(w, DT, 0, WIRING.trip - 0.05, false), null)
  // And it comes back by itself, lever and circuit.
  let back = false
  for (let f = 0; f < (WIRING.reset + 1) / DT; f++) if (stepWiring(w, DT, 3, 0, false) === 'rearm') back = true
  assert.ok(back && w.armed[1] && w.lever[1] === 1, 'the RCD did not come back in')
  assert.ok(w.live[3]! > 0.99, 'D did not come back on')
  // A knock outside the house — the cabinet — is the house RCD.
  assert.equal(stepWiring(w, DT, -1, 1, false), 'trip')
  // …and the bathroom with it, because its 30 mA hangs off the 300 mA.
  assert.ok(!w.armed[0] && w.live.every((v) => v === 0), 'the house RCD left a circuit on')
  // Under reduced motion the lever is where it is going at once.
  const still = wiring()
  stepWiring(still, DT, -1, 1, true)
  assert.equal(still.lever[0], 0, 'reduced motion eased the lever')
  // Held, then out: forty-five seconds after leaving a room, its circuit goes.
  const h = wiring()
  for (let f = 0; f < 60; f++) stepWiring(h, DT, 2, 0, false)
  for (let f = 0; f < (WIRING.hold + 2) / DT; f++) stepWiring(h, DT, -1, 0, false)
  assert.equal(h.live[2], 0, 'the bedroom stayed lit forever')
}

// The door is drawn open where the wall says it is.
assert.ok(Math.abs(DOOR.open - (160 * Math.PI) / 180) < 1e-9)

console.log(`tablo: ${ROOMS.length} rooms, ${POINTS.length} points on ${CIRCUITS.length} circuits, ${PLAN_WALLS.length} walls — ok`)
