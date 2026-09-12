/**
 * No test framework (CLAUDE.md). The isle's shape is the one piece of Phase 7
 * logic a screenshot cannot settle — a mesh and a flight controller reading the
 * same function is the whole design, and "same" is an assert, not a look.
 *
 *   node src/isles.check.ts
 */
import assert from 'node:assert/strict'
import { ISLES, ISLE_EXTENT, RIM_MAX, ground, isleHeight, isleShore, spawn } from './isles.ts'
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
