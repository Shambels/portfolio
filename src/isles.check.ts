/**
 * No test framework (CLAUDE.md). The isle's shape is the one piece of Phase 7
 * logic a screenshot cannot settle — a mesh and a flight controller reading the
 * same function is the whole design, and "same" is an assert, not a look.
 *
 *   node src/isles.check.ts
 */
import assert from 'node:assert/strict'
import { ISLES, ISLE_EXTENT, RIM_MAX, ground, isleHeight, isleShore } from './isles.ts'

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

// The saucer's clearance: it flies `hover` over the water and the same over the
// beach, so the number it adds to its altitude is what the land does *above*
// the plateau the three project islands sit on, and never less than nothing.
console.log('isle: ok — summit', at(0, 0).toFixed(2), 'm, coast', (isle.radius * 2).toFixed(0), 'm across')
