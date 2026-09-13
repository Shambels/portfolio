/**
 * Ride a surfboard at the mine, over a row of Scrabble tiles and off the edge
 * of the island, and check that each of those does what it says.
 * `node src/plateau.check.ts`.
 *
 * Three things are held. **The wall**: the mine's collision polygon is built
 * from `src/models/mine.glb` exactly as `Landmarks.tsx` builds it, and a board
 * ridden at it on eight bearings at cruise never ends a frame inside it, comes
 * off it with the part of its speed that went into the rock reversed, and
 * reports a bang the size of that part. **The tiles**: a tile hit square goes
 * the way the board was going at about the speed the impulse says; one hit off
 * the board's nose leaves at an angle and spins; a tile knocked into another
 * hands its motion on; a tile pushed off the plinth drops the plinth's height
 * and stops; one pushed off the island slides down the beach and floats. **The
 * tidy-up**: after `TIDY_AFTER` seconds of stillness everything is back where
 * it was, to the millimetre, and nothing is loose.
 *
 * The ground is the real profile, `profileAt` over the real seed, which is
 * also what `Islands.tsx` now revolves — so a tile here slides down the same
 * beach a visitor sees.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  BOARD, LENSES, PROFILE, PROP_SETS, RAMPS, RIDER_MASS, TIDY_AFTER, TIDY_FOR, WALLED,
  deckAt, displaced, footprint, hull2d, inShot, inside, makeProp, makeSet, profileAt,
  rampLift, rim, seedOf, stepProps,
  type Board, type Hit, type Poly, type Terrain,
} from './plateau.ts'

const DT = 1 / 120
const GROUND = 0.45 // `world.ts`
const SPREAD = 1.9 // `ISLAND_SPREAD`, the same file

// ------------------------------------------------------------ the ground

{
  // Flat to 0.52, monotone down from there, and the whole coast a real number.
  const seed = seedOf('polarsense')
  const R = 5 * SPREAD
  let last = Infinity
  for (let k = 0; k <= 400; k++) {
    const d = (k / 400) * R * 1.3
    const h = profileAt(R, seed, d, 0)
    assert.ok(Number.isFinite(h), 'profile is a number')
    assert.ok(h <= last + 1e-9, `profile climbs at ${d.toFixed(2)}`)
    if (d < 0.52 * R * rim(0, seed)) assert.equal(h, 0, `plateau is not flat at ${d.toFixed(2)}`)
    last = h
  }
  assert.equal(profileAt(R, seed, R * 2, 0), PROFILE[PROFILE.length - 1]![1], 'past the skirt is the skirt')
  // And the rim never lets the flat top reach past the nominal radius, which
  // is what keeps a blockout box on the plateau.
  let widest = 0
  for (let k = 0; k < 720; k++) widest = Math.max(widest, rim((k / 720) * Math.PI * 2, seed))
  assert.ok(widest * 0.52 < 1, 'the plateau overhangs its nominal radius')
  assert.equal(deckAt('board', 2.9, -2.9), 0.21)
  assert.equal(deckAt('board', 3.0, 0), 0)
  assert.equal(deckAt('mine', 0, 0), 0)
}

// ------------------------------------------------------------- the wall

/** Every mesh in a .glb, by name, with its positions — the way `Landmarks.tsx`
 *  reads them, and the only way a check can hold a model to anything. */
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
    assert.ok(!n.translation && !n.rotation && !n.scale,
      `${path}: a node with a transform — the browser bakes it, this does not`)
    const mesh = j.meshes[n.mesh]!
    for (const prim of mesh.primitives) {
      const acc = j.accessors[prim.attributes.POSITION]!
      const view = j.bufferViews[acc.bufferView]!
      const off = bin + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
      out.push({
        name: n.name ?? mesh.name ?? '',
        pos: new Float32Array(b.buffer.slice(b.byteOffset + off, b.byteOffset + off + acc.count * 12)),
      })
    }
  }
  return out
}

/** A landmark's wall, built out of its file exactly as `Detailed` builds it:
 *  the hull of every vertex in the band, from the meshes the entry names. */
function wallFromGlb(path: string, shape: string): Poly {
  const w = WALLED[shape]!
  const pts: { x: number; z: number }[] = []
  for (const m of meshesFromGlb(path)) {
    if (w.part && !m.name.startsWith(w.part)) continue
    footprint(m.pos, w.band[0], w.band[1], pts)
  }
  return hull2d(pts)
}

const wall = wallFromGlb(new URL('./models/mine.glb', import.meta.url).pathname, 'mine')
assert.ok(wall.length >= 6 && wall.length <= 64, `the mine's hull has ${wall.length} vertices`)
// Counter-clockwise, and it holds the rock: the bench's own centre is inside.
assert.ok(inside(wall, 0, -1.5), 'the benches are outside their own wall')
assert.ok(!inside(wall, 0, 4), 'the approach is inside the wall')
{
  let area = 0
  for (let i = 0; i < wall.length; i++) {
    const a = wall[i]!
    const b = wall[(i + 1) % wall.length]!
    area += a.x * b.z - b.x * a.z
  }
  assert.ok(area > 0, 'the wall winds clockwise')
}

const flat: Terrain = () => ({ land: GROUND, water: 0 })
const board = (x: number, z: number, yaw: number, speed: number): Board => ({
  x, y: GROUND + 0.05, z, yaw, vx: Math.sin(yaw) * speed, vz: Math.cos(yaw) * speed,
  spin: 0, len: BOARD.len, r: BOARD.r, m: RIDER_MASS,
})

/** Distance from the capsule's spine to the polygon, or negative inside. */
function clearance(b: Board, poly: Poly, cx: number, cz: number, rot: number): number {
  const cr = Math.cos(rot), sr = Math.sin(rot)
  const toLocal = (wx: number, wz: number) => ({ x: (wx - cx) * cr - (wz - cz) * sr, z: (wx - cx) * sr + (wz - cz) * cr })
  const hx = Math.sin(b.yaw - rot), hz = Math.cos(b.yaw - rot)
  const c = toLocal(b.x, b.z)
  let best = Infinity
  for (let k = 0; k <= 8; k++) {
    const t = (k / 8 - 0.5) * b.len
    const px = c.x + hx * t, pz = c.z + hz * t
    if (inside(poly, px, pz)) return -1
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!, e = poly[(i + 1) % poly.length]!
      const dx = e.x - a.x, dz = e.z - a.z
      const l2 = dx * dx + dz * dz
      const u = Math.min(Math.max(((px - a.x) * dx + (pz - a.z) * dz) / l2, 0), 1)
      best = Math.min(best, Math.hypot(px - a.x - dx * u, pz - a.z - dz * u))
    }
  }
  return best
}

{
  // The mine where it is (`polarsense.en.mdx`): -14, -8, turned to face the origin.
  const cx = -14, cz = -8
  const rot = Math.atan2(-cx, -cz)
  for (let k = 0; k < 8; k++) {
    const set = makeSet('polarsense', cx, cz, rot, [], [wall])
    const bearing = (k / 8) * Math.PI * 2
    // Start 6 out on the bearing, ride in along it at cruise.
    const b = board(cx - Math.sin(bearing) * 6, cz - Math.cos(bearing) * 6, bearing, 7.5)
    const v0x = b.vx, v0z = b.vz
    const hits: Hit[] = []
    let bounced = false
    let minClear = Infinity
    for (let f = 0; f < 240; f++) {
      b.x += b.vx * DT
      b.z += b.vz * DT
      stepProps(set, DT, b, true, flat, hits)
      const c = clearance(b, wall, cx, cz, rot)
      minClear = Math.min(minClear, c)
      assert.ok(c >= b.r - 0.02, `bearing ${k}: frame ${f} is ${(b.r - c).toFixed(3)} into the mine`)
      if (hits.length && !bounced) {
        bounced = true
        // The velocity's share along the approach is reversed, some of it.
        const along = (b.vx * v0x + b.vz * v0z) / Math.hypot(v0x, v0z)
        assert.ok(along < 0, `bearing ${k}: no bounce — still going in at ${along.toFixed(2)}`)
        assert.ok(hits[0]!.kind === 'metal', 'the mine is not metal')
        assert.ok(hits[0]!.force > 0.5, `bearing ${k}: a bang of ${hits[0]!.force.toFixed(2)} for a hit at cruise`)
      }
    }
    assert.ok(bounced, `bearing ${k}: rode through the mine without touching it`)
    assert.ok(minClear < b.r + 0.05, `bearing ${k}: never reached the wall (${minClear.toFixed(2)})`)
  }
  // Swept in from the side rather than head-on: still out, still a bang.
  const set = makeSet('polarsense', cx, cz, rot, [], [wall])
  const b = board(cx + 3.2, cz + 2.5, Math.PI * 0.5, 0)
  b.vx = -5
  const hits: Hit[] = []
  for (let f = 0; f < 120; f++) {
    b.x += b.vx * DT
    b.z += b.vz * DT
    stepProps(set, DT, b, true, flat, hits)
    assert.ok(clearance(b, wall, cx, cz, rot) >= b.r - 0.02, `sideways: frame ${f} is inside the mine`)
  }
  assert.ok(hits.length > 0, 'sideways: no hit')
  // And the saucer, which is not a board: nothing happens.
  const s = board(cx, cz, 0, 7.5)
  const none: Hit[] = []
  stepProps(makeSet('polarsense', cx, cz, rot, [], [wall]), DT, s, false, flat, none)
  assert.equal(none.length, 0, 'the mine hit something that was not the board')
}

// ------------------------------------------------------------- the tiles

const CELL = 0.36
const TILE_R = 0.1675 // half a tile: `TILE / 2` in `tools/board.py`
const DECK = 0.21

/** A set with the board's plinth as its ground, the way `world.ts` builds it. */
function boardIsland() {
  const cx = 0, cz = 14
  const rot = Math.atan2(-cx, -cz)
  const R = 5 * SPREAD
  const seed = seedOf('scrubble')
  const terrain: Terrain = (wx, wz) => {
    const dx = wx - cx, dz = wz - cz
    const lx = dx * Math.cos(rot) - dz * Math.sin(rot)
    const lz = dx * Math.sin(rot) + dz * Math.cos(rot)
    return { land: GROUND + profileAt(R, seed, dx, dz) + deckAt('board', lx, lz), water: 0 }
  }
  const props = []
  for (let i = 3; i <= 10; i++) props.push(makeProp(`t${i}`, (i - 7) * CELL, 0, TILE_R, 1, GROUND + DECK))
  props.push(makeProp('e', 2.2, 0, 0.55, 8, GROUND)) // something heavy, off the deck? no: on it
  props[props.length - 1]!.rest = GROUND + DECK
  const set = makeSet('scrubble', cx, cz, rot, props, [])
  return { set, terrain, cx, cz, rot, seed, R }
}

/** Local -> world, for placing the board. */
function toWorld(cx: number, cz: number, rot: number, lx: number, lz: number) {
  return { x: cx + lx * Math.cos(rot) + lz * Math.sin(rot), z: cz - lx * Math.sin(rot) + lz * Math.cos(rot) }
}

{
  // Square on: ride along local -z toward the first tile of the row, at cruise.
  const { set, terrain, cx, cz, rot } = boardIsland()
  const first = set.props[0]!
  const start = toWorld(cx, cz, rot, first.px, first.pz + 3)
  const b = board(start.x, start.z, rot + Math.PI, 7.5) // heading local -z
  b.y = GROUND + DECK + 0.05
  const hits: Hit[] = []
  let struck = false
  for (let f = 0; f < 60; f++) {
    b.x += b.vx * DT
    b.z += b.vz * DT
    stepProps(set, DT, b, true, terrain, hits)
    if (first.loose && !struck) {
      struck = true
      // It left the way the board was going — along local -z — and fast: a
      // tile against eighty of rider takes (1 + BOUNCE) of the closing speed.
      const sp = Math.hypot(first.vx, first.vz)
      assert.ok(sp > 7.5 * 1.2 && sp < 7.5 * 1.45, `square hit: tile left at ${sp.toFixed(2)} for a board at 7.5`)
      assert.ok(first.vz < 0 && Math.abs(first.vx) < 0.35 * sp, `square hit: tile went (${first.vx.toFixed(2)}, ${first.vz.toFixed(2)})`)
      assert.ok(hits.some((h) => h.kind === 'tile' && h.force > 0.8), 'square hit: no clack')
    }
  }
  assert.ok(struck, 'square: the board never reached the tile')
  // The board barely noticed: a tile is a hundredth of him.
  assert.ok(Math.hypot(b.vx, b.vz) > 7.5 * 0.97, 'a tile stopped the board')
}

{
  // Clipped: the same run, offset half a tile to the side. It leaves at an
  // angle, and it spins — which is what the friction term is for.
  const { set, terrain, cx, cz, rot } = boardIsland()
  const first = set.props[0]!
  const start = toWorld(cx, cz, rot, first.px - 0.42, first.pz + 3)
  const b = board(start.x, start.z, rot + Math.PI, 7.5)
  b.y = GROUND + DECK + 0.05
  const hits: Hit[] = []
  let struck = false
  for (let f = 0; f < 60 && !struck; f++) {
    b.x += b.vx * DT
    b.z += b.vz * DT
    stepProps(set, DT, b, true, terrain, hits)
    if (first.loose) {
      struck = true
      const sp = Math.hypot(first.vx, first.vz)
      assert.ok(first.vx > 0.2 * sp, `clipped: tile went straight (${first.vx.toFixed(2)}, ${first.vz.toFixed(2)})`)
      assert.ok(Math.abs(first.w) > 1, `clipped: no spin (${first.w.toFixed(2)})`)
    }
  }
  assert.ok(struck, 'clipped: missed')
}

{
  // A tile knocked into its neighbour hands the motion on: strike the row's
  // first tile *along* the row, and count how many moved.
  const { set, terrain, cx, cz, rot } = boardIsland()
  const first = set.props[0]!
  const start = toWorld(cx, cz, rot, first.px - 3, first.pz)
  const b = board(start.x, start.z, rot + Math.PI / 2, 9) // heading local +x
  b.y = GROUND + DECK + 0.05
  const hits: Hit[] = []
  for (let f = 0; f < 30; f++) {
    b.x += b.vx * DT
    b.z += b.vz * DT
    stepProps(set, DT, b, true, terrain, hits)
  }
  // Stop the board dead and let the tiles run.
  b.vx = b.vz = 0
  for (let f = 0; f < 600; f++) stepProps(set, DT, b, true, terrain, hits)
  const moved = set.props.filter((p) => p.id.startsWith('t') && displaced(p)).length
  assert.ok(moved >= 3, `a tile hit along the row moved ${moved} tiles`)
}

{
  // Off the plinth: a tile pushed off the deck falls 0.21 and stops; one
  // pushed off the island slides down the beach and floats.
  const { set, terrain, cx, cz, rot, seed, R } = boardIsland()
  const t = set.props[0]!
  t.asleep = false; t.loose = true
  t.vx = -7 // toward local -x: off the plinth at -2.97, stopping short of the coast
  const b = board(100, 100, 0, 0)
  const hits: Hit[] = []
  // Two and a half seconds: long enough to stop, short of the tidy-up.
  for (let f = 0; f < 300; f++) stepProps(set, DT, b, true, terrain, hits)
  assert.ok(t.asleep, 'the tile never stopped')
  assert.ok(t.px + t.x < -2.97, `the tile stopped on the plinth at ${(t.px + t.x).toFixed(2)}`)
  {
    const w = toWorld(cx, cz, rot, t.px + t.x, t.pz + t.z)
    const floor = terrain(w.x, w.z).land - t.rest
    assert.ok(floor <= -DECK + 1e-6, `the tile is still on the deck: floor ${floor.toFixed(3)}`)
    assert.ok(Math.abs(t.y - floor) < 1e-3, `off the plinth the tile sits at ${t.y.toFixed(3)} over a floor at ${floor.toFixed(3)}`)
  }
  assert.ok(hits.some((h) => h.kind === 'tile'), 'no clack landing off the plinth')

  // Now hard enough to reach the water.
  const u = set.props[1]!
  u.asleep = false; u.loose = true
  u.vx = -30
  for (let f = 0; f < 400; f++) stepProps(set, DT, b, true, terrain, hits)
  const lx = u.px + u.x, lz = u.pz + u.z
  const w = toWorld(cx, cz, rot, lx, lz)
  const land = GROUND + profileAt(R, seed, w.x - cx, w.z - cz)
  assert.ok(land < 0, `the second tile stopped on land at ${land.toFixed(2)}`)
  // Floating: its base is at the water, not on the sea floor.
  assert.ok(Math.abs(u.rest + u.y - 0) < 0.03, `afloat, the tile sits at ${(u.rest + u.y).toFixed(3)} against a sea at 0`)
}

{
  // The tidy-up. Knock a tile, wait, and everything is back — including the
  // one that went for a swim.
  const { set, terrain } = boardIsland()
  const a = set.props[0]!
  const c = set.props[1]!
  a.asleep = c.asleep = false; a.loose = c.loose = true
  a.vx = -30; c.vz = 2; c.w = 3
  const b = board(100, 100, 0, 0)
  const hits: Hit[] = []
  let quiet = 0
  let frames = 0
  while (frames < 60 * 120) {
    stepProps(set, DT, b, true, terrain, hits)
    frames++
    if (set.props.every((p) => p.asleep) && set.back === 0 && !set.props.some((p) => p.loose)) { quiet++; if (quiet > 5) break }
  }
  assert.ok(frames < 60 * 120, 'the props never tidied up')
  for (const p of set.props) {
    assert.ok(!displaced(p), `${p.id} is still out of place after the tidy-up`)
    assert.ok(!p.loose && p.asleep, `${p.id} is still loose`)
  }
  // And it took about the pause plus the ease, no more.
  assert.ok(frames * DT < TIDY_AFTER + TIDY_FOR + 12, `tidy-up took ${(frames * DT).toFixed(1)} s`)
}

// -------------------------------------------------------------- the ramp
//
// Memojo's island. Four things are held. **The shape**: the run climbs from
// nothing at the foot to the lip with slope still on it, which is what a ramp
// is and what a smoothstep is not. **The file**: `src/models/memojo.glb` is
// the same curve to a millimetre at every station, so the deck under the board
// and the deck in front of the eye cannot drift apart. **The ride**: a board
// taken up it at cruise stays on the deck the whole way, leaves the lip going
// up, and comes down in the water past the island — and the same board on the
// same line with the ramp taken out never leaves the ground, which is what
// says the jump is the ramp's doing and not the beach's. **The shot**: the
// giant camera sees him in the air off the lip and does not see him standing
// at the foot.

const RAMP = RAMPS.ramp!
const GRAV = 9 // `Ship.tsx`, and the same number the props fall under
const SIT = 0.05 // `Ship.tsx`: how far over a deck the hull's origin rides
const STATIONS = 24 // `tools/memojo.py`

{
  // The shape. Zero at the foot and flat there, `h` at the lip and not flat
  // there, monotone in between, and nothing off the deck.
  assert.equal(deckAt('ramp', RAMP.x, RAMP.foot), 0)
  assert.ok(Math.abs(deckAt('ramp', RAMP.x, RAMP.lip) - RAMP.h) < 1e-9, 'the lip is not `h`')
  assert.equal(deckAt('ramp', RAMP.x, RAMP.foot + 0.01), 0, 'the deck runs past its own foot')
  assert.equal(deckAt('ramp', RAMP.x + RAMP.half + 0.01, 0), 0, 'the deck is wider than its own width')
  let last = -1
  for (let k = 0; k <= 200; k++) {
    const z = RAMP.foot + (RAMP.lip - RAMP.foot) * (k / 200)
    const h = deckAt('ramp', RAMP.x, z)
    assert.ok(h >= last - 1e-12, `the run falls at z ${z.toFixed(2)}`)
    last = h
  }
  // The foot is a curve and the lip is a straight line — the whole asymmetry.
  const e = 1e-4
  const atFoot = (deckAt('ramp', RAMP.x, RAMP.foot - e) - 0) / e
  const atLip = (RAMP.h - deckAt('ramp', RAMP.x, RAMP.lip + e)) / e
  assert.ok(atFoot < 0.02, `the foot is a step: slope ${atFoot.toFixed(3)}`)
  assert.ok(atLip > 0.4, `the lip has no slope left on it: ${atLip.toFixed(3)}`)
  // And `rampLift` is that slope times the speed up the run, zero off it.
  assert.ok(Math.abs(rampLift('ramp', RAMP.x, RAMP.lip + 0.01, -9) - 9 * atLip) < 0.02, 'the lift is not the slope')
  assert.equal(rampLift('ramp', RAMP.x, RAMP.lip + 0.01, 9), 0, 'going back down the run is a climb')
  assert.equal(rampLift('mine', 0, 0, -9), 0, 'a landmark with no ramp lifted something')
}

{
  // The file. Every station's own vertices, against `deckAt` at that z.
  const meshes = meshesFromGlb(new URL('./models/memojo.glb', import.meta.url).pathname)
  const deck = meshes.filter((m) => m.name === 'frame_deck')
  assert.equal(deck.length, 1, 'memojo.glb has no frame_deck')
  for (let k = 0; k <= STATIONS; k++) {
    const t = k / STATIONS
    const z = RAMP.foot + (RAMP.lip - RAMP.foot) * t
    let top = -Infinity
    const pos = deck[0]!.pos
    for (let i = 0; i + 2 < pos.length; i += 3) {
      if (Math.abs(pos[i + 2]! - z) > 1e-3) continue
      if (Math.abs(pos[i]! - RAMP.x) > RAMP.half + 1e-3) continue
      top = Math.max(top, pos[i + 1]!)
    }
    assert.ok(top > -Infinity, `memojo.glb: no deck vertices at station ${k}`)
    const want = deckAt('ramp', RAMP.x, z)
    assert.ok(Math.abs(top - want) < 1e-3,
      `memojo.glb: station ${k} is ${top.toFixed(4)} where the board rides ${want.toFixed(4)}`)
  }
  // And the wall is the tripod alone. A hull round the deck as well would
  // swallow the ramp, which is the failure `WALLED.ramp.part` exists to stop.
  const tripod = wallFromGlb(new URL('./models/memojo.glb', import.meta.url).pathname, 'ramp')
  assert.ok(tripod.length >= 3, 'the tripod has no hull')
  assert.ok(!inside(tripod, RAMP.x, 0), 'the wall swallowed the ramp')
  assert.ok(!inside(tripod, RAMP.x, RAMP.lip), "the wall swallowed the ramp's lip")
  const lens = LENSES.ramp!
  assert.ok(inside(tripod, lens.x - lens.dx * 1.55, lens.z - lens.dz * 1.55), 'the camera is not over its own tripod')
}

/** Ride the ramp — or the same line with the ramp taken out — and report the
 *  flight. Landmark-local, at `memojo.en.mdx`'s own place in the world. */
function ride(withRamp: boolean) {
  const cx = 24, cz = 18
  const rot = Math.atan2(-cx, -cz)
  const R = 5.2 * SPREAD
  const seed = seedOf('memojo')
  const bedAt = (lx: number, lz: number) => {
    const w = toWorld(cx, cz, rot, lx, lz)
    const h = GROUND + profileAt(R, seed, w.x - cx, w.z - cz) +
      (withRamp ? deckAt('ramp', lx, lz) : 0)
    return { bed: h + SIT, sea: 0 + SIT, wx: w.x, wz: w.z }
  }
  const speed = 9 // cruise on the board
  let lz = RAMP.foot + 2.5
  let y = bedAt(RAMP.x, lz).bed
  let vy = 0
  let apex = -Infinity, liftOff = 0, onDeck = 0, flew = false, landed = 0
  for (let f = 0; f < 900; f++) {
    lz -= speed * DT
    const { bed } = bedAt(RAMP.x, lz)
    const dry = bed > SIT
    vy -= GRAV * DT
    y += vy * DT
    if (dry && y < bed) {
      // `Ship.tsx`: the floor, and the vertical the floor hands over.
      y = bed
      vy = Math.max(vy, 0, rampLift(withRamp ? 'ramp' : 'mine', RAMP.x, lz, -speed))
      if (flew && landed === 0) landed = lz
    } else if (!dry && y < SIT) {
      y = SIT
      if (flew && landed === 0) landed = lz
    }
    if (!flew && y > bed + 0.06 && lz < RAMP.lip + 0.2) { flew = true; liftOff = vy }
    if (!flew) onDeck = Math.max(onDeck, y - bed)
    apex = Math.max(apex, y - RAMP.h - GROUND - SIT)
  }
  const w = toWorld(cx, cz, rot, RAMP.x, landed)
  return { liftOff, apex, onDeck, landed, ground: GROUND + profileAt(R, seed, w.x - cx, w.z - cz) }
}

{
  const on = ride(true)
  // On the way up he is on the deck, not bouncing up it.
  assert.ok(on.onDeck < 0.02, `the board bounced ${on.onDeck.toFixed(3)} up the run`)
  // He leaves it going up, at about the run's own rate: 9 units a second up a
  // slope of 0.46 is four and a bit.
  assert.ok(on.liftOff > 3.5 && on.liftOff < 5,
    `off the lip at ${on.liftOff.toFixed(2)} up — the run should be handing him about 4.2`)
  // Which buys most of a metre over the lip, and a landing in the water past
  // the island rather than on the grass beside it.
  assert.ok(on.apex > 0.6, `only ${on.apex.toFixed(2)} of air over the lip`)
  assert.ok(on.ground < 0, `he landed on land at ${on.ground.toFixed(2)}`)

  // And the control: the same line at the same speed with no ramp under it
  // never leaves the ground at all. A beach is not a kicker.
  // He does leave the ground on the way down the far beach — that is a skim
  // off a falling slope and it is what the beaches have always done. What he
  // never gets is anything *upward*, which is the whole difference.
  const off = ride(false)
  assert.ok(off.liftOff <= 0, `the flat island handed him ${off.liftOff.toFixed(2)} upward`)
  assert.ok(off.apex < 0, 'the flat island gave him the ramp\'s height')
}

{
  // The shot. The set the browser builds, and a rider in the air off the lip
  // against a rider standing at the foot.
  const cx = 24, cz = 18
  const rot = Math.atan2(-cx, -cz)
  const set = makeSet('memojo', cx, cz, rot, [], [], LENSES.ramp!)
  const at = (lx: number, ly: number, lz: number) => {
    const w = toWorld(cx, cz, rot, lx, lz)
    return [w.x, ly, w.z] as const
  }
  const air = at(RAMP.x, GROUND + RAMP.h + SIT + 0.5, RAMP.lip - 1.2)
  assert.ok(inShot(set, air[0], air[1], air[2]), 'the lens missed a rider in the air off the lip')
  const foot = at(RAMP.x, GROUND + SIT, RAMP.foot)
  assert.ok(!inShot(set, foot[0], foot[1], foot[2]), 'the lens fired at a rider at the foot of the ramp')
  const behind = at(RAMP.x, GROUND + 3, RAMP.foot + 6)
  assert.ok(!inShot(set, behind[0], behind[1], behind[2]), 'the lens sees behind itself')
  const miles = at(RAMP.x, GROUND + RAMP.h + 0.5, RAMP.lip - 30)
  assert.ok(!inShot(set, miles[0], miles[1], miles[2]), 'the lens sees past its own reach')
  // And a landmark with no lens never fires.
  assert.ok(!inShot(makeSet('scrubble', 0, 14, 0, [], []), 0, 1, 12), 'a landmark with no lens took a photograph')
}

{
  // The registry is the interface `Ship.tsx` reads; it starts empty here.
  assert.equal(PROP_SETS.size, 0)
}

console.log('plateau: ok')
