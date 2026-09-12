/**
 * No test framework (CLAUDE.md). The isle's shape is the one piece of Phase 7
 * logic a screenshot cannot settle — a mesh and a flight controller reading the
 * same function is the whole design, and "same" is an assert, not a look.
 *
 *   node src/isles.check.ts
 */
import assert from 'node:assert/strict'
import { ISLES, ISLE_EXTENT, RIM_MAX, ground, isleHeight, isleShore, lagoonDist, pushOut, spawn } from './isles.ts'
import { WALK_FULL } from './beach.ts'

const isle = ISLES[0]!
const at = (r: number, theta: number) =>
  isleHeight(isle, isle.pos[0] + Math.cos(theta) * r, isle.pos[1] + Math.sin(theta) * r)

for (let k = 0; k < 360; k++) {
  const theta = (k / 360) * Math.PI * 2
  const shore = isleShore(isle, theta)

  // The coast the mesh draws is the coast the hull is pushed out of. Every
  // other assert here is downstream of this one.
  assert.ok(Math.abs(at(shore, theta)) < 1e-9, `${theta}: ground is ${at(shore, theta)} at its own waterline`)

  // Which side of it is land is not a matter of opinion either.
  assert.ok(at(shore * 0.97, theta) > 0.02, `${theta}: dry land is under water`)
  assert.ok(at(shore * 1.03, theta) < -0.02, `${theta}: the sea is above sea level`)

  // The circle the water shader shelters and the hull rejects against has to
  // contain the whole island.
  assert.ok(shore / isle.radius <= RIM_MAX, `${theta}: the rim is outside RIM_MAX`)

  // And the profile climbs the whole way in — a terrace or a dip on the way up
  // is a place the saucer would dive into and climb back out of.
  let last = at(shore, theta)
  for (let u = 0.99; u > 0.06; u -= 0.01) {
    const h = at(shore * u, theta)
    assert.ok(h >= last - 1e-9, `${theta}: the ground falls away at u=${u.toFixed(2)}`)
    last = h
  }
}

// The summit is a summit, and it is where the peak says it is.
assert.ok(at(0, 0) > isle.peak * 0.8, 'no summit')
assert.ok(at(0, 0) <= isle.peak + 1e-9, 'the summit is over its own stated peak')

// A ridge and not a cone: along it and across it are different islands.
const along = at(isle.radius * 0.22, isle.ridge)
const across = at(isle.radius * 0.22, isle.ridge + Math.PI / 2)
assert.ok(along - across > 1.5, `the ridge is a cone: ${along.toFixed(2)} vs ${across.toFixed(2)}`)

// The seabed keeps dropping, and it is under the water everywhere past the
// coast — the skirt is what stops the silhouette ending in a cut edge.
assert.ok(at(isle.radius * ISLE_EXTENT, 0) < -14, 'the skirt does not reach the seabed')

// `ground` is the flight controller's view of all of it: sea level everywhere
// else, and never below it.
assert.equal(ground(0, 0), 0)
assert.equal(ground(isle.pos[0] + 400, isle.pos[1]), 0)
assert.ok(ground(isle.pos[0], isle.pos[1]) > isle.peak * 0.8)
for (let k = 0; k < 200; k++) {
  const theta = (k / 200) * Math.PI * 2
  const r = isle.radius * (1 + (k % 7) * 0.06)
  assert.ok(ground(isle.pos[0] + Math.cos(theta) * r, isle.pos[1] + Math.sin(theta) * r) >= 0, 'ground went under water')
}

// Where the world begins. The sand spawn has to be on foot by the beach's own
// numbers — a man put down at `WALK_FULL` exactly is a man half on his board —
// and a good stride above it, so the opening run has somewhere to run from. The
// sea spawn is over water, and both face straight out from the island: the run
// between them crosses the coast once, going out, and never comes back.
const sand = spawn(true)
const sea = spawn(false)
assert.ok(ground(sand.x, sand.z) > WALK_FULL + 0.5,
  `the sand spawn is ${ground(sand.x, sand.z).toFixed(2)} m up, which is not on foot`)
assert.equal(ground(sea.x, sea.z), 0, 'the sea spawn is on land')
assert.equal(sand.yaw, sea.yaw)
{
  const fx = Math.sin(sand.yaw)
  const fz = Math.cos(sand.yaw)
  let was = ground(sand.x, sand.z)
  let crossings = 0
  for (let d = 0; d < 60; d += 0.25) {
    const h = ground(sand.x + fx * d, sand.z + fz * d)
    if ((h > 0) !== (was > 0)) crossings++
    assert.ok(h <= was + 1e-9, `the run to the sea climbs at ${d} units out`)
    was = h
  }
  assert.equal(crossings, 1, 'the run out to sea does not cross the coast exactly once')
  // And it ends in the water, not back on land — 60 units at a run is well
  // past the sea spawn, and the isle is the only land on this bearing.
  assert.ok(Math.hypot(sea.x - sand.x, sea.z - sand.z) < 60)
}

// The saucer's clearance: it flies `hover` over the water and the same over the
// beach, so the number it adds to its altitude is what the land does *above*
// the plateau the three project islands sit on, and never less than nothing.
console.log('isle: ok — summit', at(0, 0).toFixed(2), 'm, coast', (isle.radius * 2).toFixed(0), 'm across')

/* ---------------------------------------------------------------------------
 * And the other kind of island.
 *
 * Everything above is written for a star-convex isle with its summit over its
 * own centre, and `crag-isle` is neither. Two of those asserts cannot be
 * written for it at all:
 *
 *   "the ground is zero at its own waterline, on every bearing" — the lagoon's
 *   shoreline is not on any bearing's list. It is exact by construction
 *   instead: the carve returns `min(h, 0)` at a signed distance of zero.
 *
 *   "the profile climbs the whole way in" — the lagoon is a dip on every
 *   bearing that crosses it, and that is the feature. What the assert was FOR
 *   was the saucer diving into a hole it then has to climb out of, so that is
 *   what gets asserted instead, along with the two things this shape can get
 *   wrong that the old one could not.
 * ------------------------------------------------------------------------ */

for (const c of ISLES.filter((i) => i.lagoon)) {
  const at = (dx: number, dz: number) => isleHeight(c, c.pos[0] + dx, c.pos[1] + dz)
  const bx = Math.cos(c.lagoon!.bearing)
  const bz = Math.sin(c.lagoon!.bearing)

  // The rim is still the coast everywhere the entrance is not, and it is still
  // exact there. The entrance names itself — `lagoonDist` says which bearings
  // are water, rather than a range anybody wrote down.
  let worstRim = 0
  let widest = 0
  let entrance = 0
  for (let k = 0; k < 1440; k++) {
    const theta = (k / 1440) * Math.PI * 2
    const rim = isleShore(c, theta)
    widest = Math.max(widest, rim / c.radius)
    const dx = Math.cos(theta) * rim
    const dz = Math.sin(theta) * rim
    if (lagoonDist(c, dx, dz) < 0) { entrance++; continue }
    worstRim = Math.max(worstRim, Math.abs(at(dx, dz)))
  }
  assert.ok(worstRim < 1e-9, `${c.id}: the rim is ${worstRim} off the water`)
  assert.ok(widest <= RIM_MAX, `${c.id}: the rim reaches ${widest.toFixed(3)}`)
  assert.ok(entrance > 20 && entrance < 200,
    `${c.id}: ${entrance} of 1440 bearings are the entrance, which is not an entrance`)

  // The summit is over the spire's axis, not over the island's centre.
  const ox = -bx * (c.spire?.off ?? 0)
  const oz = -bz * (c.spire?.off ?? 0)
  assert.ok(Math.abs(at(ox, oz) - c.peak) < 5e-3,
    `${c.id}: the summit is ${at(ox, oz).toFixed(3)} and the peak says ${c.peak}`)

  // No dry basin: a patch of land lower than everything around it is a hole
  // the saucer dives into and climbs back out of, which is the whole of what
  // the monotone assert was protecting.
  {
    const N = 300
    const EXT = c.radius * 1.3
    const g = new Float64Array(N * N)
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        g[j * N + i] = at((i / (N - 1) * 2 - 1) * EXT, (j / (N - 1) * 2 - 1) * EXT)
      }
    }
    let pits = 0
    for (let j = 1; j < N - 1; j++) {
      for (let i = 1; i < N - 1; i++) {
        const h = g[j * N + i]!
        if (h <= 0.05) continue
        let rise = Infinity
        let lowest = true
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const n = g[(j + dj!) * N + (i + di!)]!
          if (n <= h) { lowest = false; break }
          rise = Math.min(rise, n - h)
        }
        if (lowest && rise > 0.01) pits++
      }
    }
    assert.equal(pits, 0, `${c.id}: ${pits} dry basins in the land`)
  }

  // The entrance is open to the sea, and wide enough to take a hull.
  {
    const L = c.lagoon!
    let narrowest = Infinity
    for (let a = 6; a <= 34; a += 0.25) {
      let w = 0
      for (let q = -16; q <= 16; q += 0.05) {
        if (at(bx * (L.centre + a) - bz * q, bz * (L.centre + a) + bx * q) < 0) w += 0.05
      }
      narrowest = Math.min(narrowest, w)
    }
    assert.ok(narrowest > 4, `${c.id}: the entrance is ${narrowest.toFixed(1)} m at its narrowest`)
  }

  // And the push out of land always reaches water, from anywhere on it. This
  // is `offshore`'s job on this island and it is not a radius any more.
  {
    let bad = 0
    for (let k = 0; k < 360; k++) {
      const theta = (k / 360) * Math.PI * 2
      for (const f of [0.2, 0.45, 0.7, 0.9]) {
        const rim = isleShore(c, theta)
        const p = { x: c.pos[0] + Math.cos(theta) * rim * f, z: c.pos[1] + Math.sin(theta) * rim * f }
        if (isleHeight(c, p.x, p.z) <= 0) continue
        pushOut(c, p, 0.35, 60)
        if (isleHeight(c, p.x, p.z) > -0.1) bad++
      }
    }
    assert.equal(bad, 0, `${c.id}: ${bad} hulls could not be pushed off the land`)
  }

  console.log(`${c.id}: ok — lagoon ${(c.lagoon!.radius * 2).toFixed(0)} m across, ` +
    `summit ${at(ox, oz).toFixed(2)} m`)
}
