/**
 * No test framework (CLAUDE.md). The stick is four lines of arithmetic with a
 * sign flip, a clamp and a threshold in them, and a wrong sign here is a world
 * that flies backwards — so it leaves a check behind.
 *
 *   node src/stick.check.ts
 */
import assert from 'node:assert/strict'
import { BOOST_AT, STICK, stick } from './stick.ts'

const near = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`)

// A finger down and not moved, and a finger that has only trembled, both mean
// stopped. Anything else and the ship creeps whenever it is being touched.
assert.deepEqual(stick(0, 0), { x: 0, y: 0, boost: false })
assert.deepEqual(stick(5, 5), { x: 0, y: 0, boost: false })

// Up the screen is forward. This is the whole reason this file exists.
near(stick(0, -STICK).y, 1, 'drag up')
near(stick(0, STICK).y, -1, 'drag down')
near(stick(STICK, 0).x, 1, 'drag right')
near(stick(-STICK, 0).x, -1, 'drag left')
near(stick(0, -STICK).x, 0, 'drag up, no strafe')

// Half deflection is half speed — the stick is analogue, which is the whole
// point of it over four arrow keys.
near(stick(0, -STICK / 2).y, 0.5, 'half up')

// Off the edge of the screen is full speed and not more: the flight controller
// multiplies by SPEED and a longer vector would simply fly faster than boost.
near(Math.hypot(stick(0, -STICK * 4).x, stick(0, -STICK * 4).y), 1, 'clamped')
near(Math.hypot(stick(600, 600).x, stick(600, 600).y), 1, 'clamped diagonally')

// A diagonal at full deflection is length 1, not length sqrt(2).
near(Math.hypot(stick(STICK, -STICK).x, stick(STICK, -STICK).y), 1, 'diagonal')

// Boost is the same push, further. It cannot fire before full deflection does.
assert.equal(stick(0, -STICK).boost, false, 'full deflection alone is not boost')
assert.equal(stick(0, -STICK * BOOST_AT - 1).boost, true, 'past the ring is boost')
assert.equal(stick(0, STICK * BOOST_AT + 1).boost, true, 'and backwards too')
near(stick(0, -STICK * BOOST_AT - 1).y, 1, 'boosting is still full deflection')

console.log('stick: ok')
