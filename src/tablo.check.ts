/**
 * Grind Tablo's rail in node, and check that the circuit, the model and the
 * sheet's house all say what they should. `node src/tablo.check.ts`.
 *
 * Held: **the circuit** — every edge leaves its node and arrives at the next
 * on the node's own line and height, so a fork and a join are Ys and nothing
 * turns faster than the fillet allows; every node has a way out and every
 * edge leads back to the board, so whichever way he steers he goes round;
 * steering right at a fork takes the branch on his right. **The grind** — a
 * board coming down onto the rail catches it, one coming up through it or
 * landing beside it does not; each of the four routes round passes the board
 * every lap and lights its own set, and the four together light every
 * appliance. **The island** — every post, appliance and rail point on the
 * flat top for the real seed and radius, inside the frontmatter box, every
 * appliance clear of a grinding board, the deep link parked clear of every
 * wall; a board ridden into an appliance stops and knocks. **The file** —
 * the conductor in `src/models/tablo.glb` is where the rail is, and every
 * appliance has its light. **The sheet's house** — four rooms that tile it,
 * every point tagged as Tablo tags it, the bathroom behind the 30 mA.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BOARD, GROUND, RIDER_MASS, inside, makeSet, profileAt, profileOf, seedOf, stepProps,
  type Board, type Hit, type Terrain,
} from './plateau.ts'
import {
  APPLIANCES, CIRCUITS, EDGES, FILLET, FIXTURES, GANTRY, HOLD, HOUSE, ISLAND_WALLS, NODES, OUTS, POINTS, RAIL, RCDS,
  ROOMS, GRIND, catchRail, chooseOut, heightAt, layout, litAt, pointAt, startGrind, stepGrind,
} from './tablo.ts'

const DT = 1 / 120
const SPREAD = 1.9 // `ISLAND_SPREAD`, `world.ts`

const fm = readFileSync(new URL('./content/projects/tablo.en.mdx', import.meta.url), 'utf8')
const nums = (key: string) => fm.match(new RegExp(`^${key}: \\[?([-\\d., ]+)\\]?$`, 'm'))![1]!.split(',').map(Number)
const [px, pz] = nums('pos') as [number, number]
const [radius] = nums('radius') as [number]
const [wx, wz] = nums('waypoint') as [number, number]
const [bw, bh, bd] = nums('size') as [number, number, number]
const R = radius * SPREAD
const rot = Math.atan2(-px, -pz)
const toLocal = (x: number, z: number) => ({
  x: (x - px) * Math.cos(rot) - (z - pz) * Math.sin(rot),
  z: (x - px) * Math.sin(rot) + (z - pz) * Math.cos(rot),
})
const toWorld = (x: number, z: number) => ({
  x: px + x * Math.cos(rot) + z * Math.sin(rot),
  z: pz - x * Math.sin(rot) + z * Math.cos(rot),
})

// ------------------------------------------------------------ the circuit
{
  EDGES.forEach((e, i) => {
    const a = NODES[e.from]!, b = NODES[e.to]!
    const p0 = pointAt(e, 0), p1 = pointAt(e, e.len)
    assert.ok(Math.hypot(p0.x - a.x, p0.z - a.z) < 1e-9, `edge ${i} does not start at ${a.name}`)
    assert.ok(Math.hypot(p1.x - b.x, p1.z - b.z) < 1e-9, `edge ${i} does not end at ${b.name}`)
    assert.ok(p0.tx * a.tx + p0.tz * a.tz > 0.999, `edge ${i} leaves ${a.name} off its line`)
    assert.ok(p1.tx * b.tx + p1.tz * b.tz > 0.999, `edge ${i} arrives at ${b.name} off its line`)
    assert.equal(heightAt(e, 0), RAIL.low, `edge ${i} starts off the node's height`)
    assert.equal(heightAt(e, e.len), RAIL.low, `edge ${i} ends off the node's height`)
    // No turn tighter than the fillet: the change of direction per metre,
    // measured every 5 cm, never more than a radius of `FILLET` allows (with
    // the slack the quadratic's not-quite-circle and the sampling take).
    let last = pointAt(e, 0)
    for (let s = 0.05; s <= e.len; s += 0.05) {
      const p = pointAt(e, s)
      const turn = Math.acos(Math.min(1, p.tx * last.tx + p.tz * last.tz)) / 0.05
      assert.ok(turn < 2.2 / FILLET, `edge ${i} turns at ${turn.toFixed(2)} rad/m at ${s.toFixed(2)}`)
      last = p
    }
    if (e.high) assert.ok(Math.abs(heightAt(e, e.len / 2) - RAIL.high) < 1e-9, `inner edge ${i} is not high`)
  })
  // Every node has a way out; from every edge the board is reachable, and
  // from the board every edge — so whichever way he steers, he goes round.
  OUTS.forEach((o, n) => assert.ok(o.length >= 1, `${NODES[n]!.name} is a dead end`))
  const reach = (from: number) => {
    const seen = new Set<number>([from])
    const todo = [from]
    while (todo.length) for (const o of OUTS[EDGES[todo.pop()!]!.to]!) if (!seen.has(o)) { seen.add(o); todo.push(o) }
    return seen
  }
  assert.equal(reach(0).size, EDGES.length, 'some rail cannot be reached from the board')
  for (let i = 0; i < EDGES.length; i++) assert.ok(reach(i).has(0), `edge ${i} never comes back to the board`)
  // Three forks, two ways each, and steering picks the branch on his right.
  const forks = OUTS.flatMap((o, n) => (o.length === 2 ? [n] : []))
  assert.equal(forks.length, 3, 'not three forks')
  for (const n of forks) {
    const node = NODES[n]!
    const right = chooseOut(n, 1, node.tx, node.tz)
    const left = chooseOut(n, -1, node.tx, node.tz)
    assert.notEqual(right, left, `${node.name}: left and right go the same way`)
    assert.equal(chooseOut(n, 0, node.tx, node.tz), OUTS[n]![0], `${node.name}: no steer is not the default`)
    // His right, heading (tx, tz), is (-tz, tx) in this frame.
    const [bx, bz] = EDGES[right]!.bend
    assert.ok(bx * -node.tz + bz * node.tx > 0, `${node.name}: steering right went left`)
  }
}

// -------------------------------------------------------------- the grind
{
  // Down onto the middle of the outer west path: caught.
  const e = EDGES[2]!
  const p = pointAt(e, e.len / 2)
  const top = heightAt(e, e.len / 2)
  const c = catchRail(p.x - p.tz * 0.2, p.z + p.tx * 0.2, top + 0.2, top - 0.05)
  assert.ok(c && c.edge === 2, 'a board landing on the rail did not catch it')
  // Coming up through it from under: not caught. Landing beside it: not caught.
  assert.equal(catchRail(p.x, p.z, top - 0.3, top + 0.02), null, 'caught from below')
  assert.equal(catchRail(p.x - p.tz * 0.8, p.z + p.tx * 0.8, top + 0.2, top - 0.05), null, 'caught from 0.8 m away')
  // A high rail is caught at its own height and not at the low one's.
  const hi = EDGES[3]!
  const q = pointAt(hi, hi.len / 2)
  assert.equal(catchRail(q.x, q.z, RAIL.low + 0.1, RAIL.low - 0.05), null, 'the high rail caught at the low height')
  assert.ok(catchRail(q.x, q.z, RAIL.high + 0.1, RAIL.high - 0.02), 'the high rail not caught at its height')
  // The speed he lands with along it, held between the limits.
  assert.equal(startGrind({ edge: 2, s: 1 }, 0, 0).v, 4, 'a slow landing is not lifted to the minimum')

  // Four routes round: no steer, right, left, and right-then-left. Each one,
  // three laps from the board: every lap through the board, its own set lit.
  const lap = (steers: number[]) => {
    const g = { edge: 0, s: 0, v: 5 }
    const passed: number[] = []
    let boards = 0
    let k = 0
    let lastEdge = 0
    for (let f = 0; f < 120 * 40; f++) {
      const n = passed.length
      stepGrind(g, DT, steers[k % steers.length]!, passed)
      for (let i = n; i < passed.length; i++) if (APPLIANCES[passed[i]!]!.kind === 'board') boards++
      if (g.edge !== lastEdge && OUTS[EDGES[lastEdge]!.to]!.length === 2) k++
      lastEdge = g.edge
    }
    return { lit: new Set(passed), boards }
  }
  const routes = [[0], [1], [-1], [1, -1]].map(lap)
  for (const r of routes) assert.ok(r.boards >= 3, `a route passed the board ${r.boards} times in 40 s`)
  const sets = routes.map((r) => [...r.lit].sort((a, b) => a - b).join(','))
  assert.equal(new Set(sets).size, 4, `two routes light the same set: ${sets.join(' | ')}`)
  const all = new Set(routes.flatMap((r) => [...r.lit]))
  assert.equal(all.size, APPLIANCES.length, 'some appliance is on no route')

  // Shift on the rail: up to the boost within two seconds, and coasting back
  // toward cruise once it is let go — never under the cruise it drifts to.
  {
    const g = startGrind({ edge: 9, s: 0 }, 0, 5)
    for (let f = 0; f < 2 / DT; f++) stepGrind(g, DT, 0, [], true)
    assert.ok(g.v > GRIND.cruise * GRIND.boost * 0.97, `boosted to only ${g.v.toFixed(2)}`)
    for (let f = 0; f < 6 / DT; f++) stepGrind(g, DT, 0, [])
    assert.ok(g.v < GRIND.cruise * 1.3 && g.v > GRIND.cruise, `coasted to ${g.v.toFixed(2)}`)
  }

  // On for `HOLD.on`, out over `HOLD.fade`.
  assert.equal(litAt(0.1), 1)
  assert.equal(litAt(HOLD.on + HOLD.fade + 1), 0)
  assert.equal(litAt(-1), 0)
}

// ------------------------------------------------------------- the island
{
  const L = layout(R)
  const seed = seedOf('tablo')
  const flat = (x: number, z: number, what: string) =>
    assert.equal(profileAt(R, seed, x, z, profileOf('tablo')), 0, `${what} at (${x.toFixed(2)}, ${z.toFixed(2)}) is off the flat top`)
  for (const [x, z] of L.posts) flat(x, z, 'a post')
  for (const r of L.rails) for (const [x, , z] of r) flat(x!, z!, 'the rail')
  for (const poly of ISLAND_WALLS) for (const v of poly) flat(v.x, v.z, 'an appliance')
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
  for (const r of L.rails) for (const [x, , z] of r) {
    x0 = Math.min(x0, x! - RAIL.r); x1 = Math.max(x1, x! + RAIL.r); z0 = Math.min(z0, z! - RAIL.r); z1 = Math.max(z1, z! + RAIL.r)
  }
  for (const poly of ISLAND_WALLS) for (const v of poly) {
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z)
  }
  assert.ok(x1 - x0 <= bw && z1 - z0 <= bd && GANTRY.top <= bh, `the island is ${(x1 - x0).toFixed(2)} × ${(z1 - z0).toFixed(2)}, outside its box`)

  // Every appliance clear of a grinding board on every rail: the board is a
  // third of a metre wide and leans; half a metre of air from its centre line.
  const nearRail = (x: number, z: number) => {
    let d = Infinity
    for (const e of EDGES) for (let s = 0; s <= e.len; s += 0.1) {
      const p = pointAt(e, s)
      d = Math.min(d, Math.hypot(p.x - x, p.z - z))
    }
    return d
  }
  for (const poly of ISLAND_WALLS) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, b = poly[(i + 1) % poly.length]!
      for (let u = 0; u <= 1; u += 0.1) {
        const d = nearRail(a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u)
        assert.ok(d > BOARD.r + 0.25, `an appliance's edge is ${d.toFixed(2)} from a rail`)
      }
    }
  }
  // The gantry's legs stand either side of the return, clear of it.
  const g = APPLIANCES[0]!
  assert.equal(g.kind, 'board')
  assert.ok(GANTRY.half - 0.16 > BOARD.r + 0.4, 'the gantry legs are in the grind')

  // The deep link parks the board clear of every wall.
  const ww = toLocal(wx, wz)
  for (const poly of ISLAND_WALLS) assert.ok(!inside(poly, ww.x, ww.z), 'the waypoint is inside an appliance')
  assert.ok(Math.hypot(ww.x, ww.z) < radius, 'the waypoint is outside the radius')

  // A board ridden at the washer from the inside of the loop, at cruise,
  // stops at it and knocks.
  const washer = APPLIANCES.find((a) => a.kind === 'washer')!
  const fix = FIXTURES.tablo!
  const set = makeSet('tablo', px, pz, rot, [], fix.walls, null, fix.knock)
  const terrain: Terrain = () => ({ land: GROUND, water: 0 })
  const fx = Math.sin(washer.yaw), fz = Math.cos(washer.yaw)
  const start = toWorld(washer.x + fx * 2.2, washer.z + fz * 2.2)
  const yaw = Math.atan2(-fx, -fz) + rot
  const b: Board = { x: start.x, y: GROUND + 0.05, z: start.z, yaw, vx: Math.sin(yaw) * 7.5, vz: Math.cos(yaw) * 7.5,
    spin: 0, len: BOARD.len, r: BOARD.r, m: RIDER_MASS }
  const hits: Hit[] = []
  for (let f = 0; f < 120; f++) {
    b.x += b.vx * DT
    b.z += b.vz * DT
    stepProps(set, DT, b, true, terrain, hits)
    const c = toLocal(b.x, b.z)
    assert.ok(!inside(fix.walls[APPLIANCES.indexOf(washer)]!, c.x, c.z), 'rode into the washing machine')
  }
  assert.ok(hits.some((h) => h.kind === 'metal' && h.force > 0.3), 'rode into the washing machine without a knock')
}

// --------------------------------------------------------------- the file

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
  const KEYS = ['frame', 'panel', 'dark', 'wire', 'lamp', 'glass']
  for (const m of meshes) {
    assert.ok(!m.name.includes('~'), `${m.name}: Tablo has no loose props`)
    assert.ok(KEYS.includes(m.name.split('_')[0]!), `${m.name}: no material for it`)
  }
  APPLIANCES.forEach((_, i) => assert.ok(meshes.some((m) => m.name === `lamp_a${i}`), `appliance ${i} has no light`))
  // Every vertex of the conductor within a tube's radius of the rail's centre
  // line, at the rail's height — the line the grind runs on.
  const rail = meshes.find((m) => m.name === 'wire_rail')
  assert.ok(rail, 'no wire_rail in tablo.glb')
  const L = layout(R)
  const pts = L.rails.flatMap((r) => r)
  for (let i = 0; i < rail.pos.length; i += 9) {
    const x = rail.pos[i]!, y = rail.pos[i + 1]!, z = rail.pos[i + 2]!
    let d = Infinity
    for (const [qx, qy, qz] of pts) d = Math.min(d, Math.hypot(x - qx!, (y - (qy! - RAIL.r)) * 1, z - qz!))
    assert.ok(d < RAIL.r * 1.6 + 0.2, `a conductor vertex is ${d.toFixed(2)} off the rail`)
  }
}

// --------------------------------------------------------- the sheet's house
{
  let area = 0
  for (const r of ROOMS) area += (r.x1 - r.x0) * (r.z1 - r.z0)
  assert.ok(Math.abs(area - (HOUSE.x1 - HOUSE.x0) * (HOUSE.z1 - HOUSE.z0)) < 1e-9, 'the rooms do not tile the house')
  CIRCUITS.forEach((c, k) => assert.equal(c.room, k, `circuit ${c.tag} is not room ${k}'s`))
  assert.deepEqual(POINTS.map((p) => p.tag), ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'D1', 'D2'])
  for (const c of CIRCUITS) assert.equal(RCDS[c.rcd]!.ma, ROOMS[c.room]!.key === 'bathroom' ? 30 : 300, `${c.tag}'s RCD`)
}

const lapLen = EDGES[0]!.len + EDGES[1]!.len + EDGES[2]!.len + EDGES[4]!.len + EDGES[9]!.len
console.log(`tablo: ${EDGES.length} rails, ${OUTS.filter((o) => o.length === 2).length} forks, ` +
  `${APPLIANCES.length} appliances, a lap ${lapLen.toFixed(1)} m — ok`)
