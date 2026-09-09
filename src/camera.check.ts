/**
 * No test framework (CLAUDE.md). The camera turns with the ship now, which
 * closes a loop — the push is read against the camera, the camera chases the
 * heading, the heading chases the push — and the two functions that close it
 * leave a check behind.
 *
 *   node src/camera.check.ts
 */
import assert from 'node:assert/strict'
import { forwardX, forwardZ, steer, swing } from './camera.ts'

const near = (a: number, b: number, what: string) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} is not ${b}`)

const out = { x: 0, z: 0 }
const HEADINGS = [0, 0.7, Math.PI / 2, 2.4, Math.PI, -1.1, -Math.PI / 2, 5.9]

// The world before this change, and the frame the landing page cuts to: the
// camera astern at +z, the ship pointed down -z. Every heading below is a
// rotation of this one, so if it is wrong nothing else being right helps.
steer(0, 1, Math.PI, out)
near(out.x, 0, 'forward at the default bearing')
near(out.z, -1, 'forward at the default bearing')
steer(1, 0, Math.PI, out)
near(out.x, 1, 'right at the default bearing')
near(out.z, 0, 'right at the default bearing')

for (const yaw of HEADINGS) {
  // Up the screen is where the camera looks. This is the whole reason the
  // camera turns, and the reason `stick.ts` flips y before it ever gets here.
  steer(0, 1, yaw, out)
  near(out.x, forwardX(yaw), `forward is the bearing at ${yaw}`)
  near(out.z, forwardZ(yaw), `forward is the bearing at ${yaw}`)

  // And right of the screen is right of that, not left of it: the cross product
  // of the look direction with up, in three's right-handed world.
  steer(1, 0, yaw, out)
  near(out.x, -forwardZ(yaw), `right is starboard at ${yaw}`)
  near(out.z, forwardX(yaw), `right is starboard at ${yaw}`)

  // A rotation, so a full push is a full push whichever way it points — the
  // speed is `move`'s length and nothing here may add to it or take from it.
  steer(0.6, -0.8, yaw, out)
  near(Math.hypot(out.x, out.z), 1, `length is kept at ${yaw}`)
}

// The swing takes the short way round, including across the wrap, and never
// overshoots the heading it is chasing. `ds` is the distance advanced along the
// heading this frame — at cruise, 7.5 units a second, a sixtieth is 0.125.
const RATE = 0.18
const MAX = 0.09
const SPIN = 0.9
const DT = 1 / 60
const CRUISE = 7.5 * DT
const BOOST = 7.5 * 2.4 * DT

for (const [from, to] of [[3.0, -3.0], [-3.0, 3.0], [0, 0.2], [1, -1]] as [number, number][]) {
  const err = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  const step = swing(from, to, CRUISE, DT, RATE, MAX, SPIN) - from
  assert.ok(step * err > 0, `swing ${from} -> ${to} turns the wrong way`)
  assert.ok(Math.abs(step) <= Math.abs(err) + 1e-12, `swing ${from} -> ${to} overshoots`)
  assert.ok(Math.abs(step) <= MAX * CRUISE + 1e-12, `swing ${from} -> ${to} breaks the cap`)
  assert.ok(Math.abs(step) <= SPIN * DT + 1e-12, `swing ${from} -> ${to} breaks the ceiling`)
}
near(swing(1.2, 1.2, CRUISE, DT, RATE, MAX, SPIN), 1.2, 'already astern')

// The whole of this change, in one line: a craft that is not advancing does not
// turn the frame. A quarter turn of the hull, held, with no ground covered —
// stopped, shoved sideways out of a shoreline, sliding down the back of a
// roller — and the camera is exactly where it was.
near(swing(1.2, 1.2 + Math.PI / 2, 0, DT, RATE, MAX, SPIN), 1.2, 'a camera that goes nowhere')
for (let i = 0, cam = 1.2; i < 600; i++) {
  cam = swing(cam, 1.2 + Math.PI / 2, 0, DT, RATE, MAX, SPIN)
  near(cam, 1.2, 'ten seconds of standing still')
}

// Held hard left, worst case: the heading sits a quarter turn off the camera
// every frame, which is the fastest the loop can ever be driven. The camera
// must not spin, and the circle the ship draws must be big enough to read as a
// turn rather than as a pirouette. Because the cap is spent per unit travelled,
// that circle is `1 / MAX` — 11.1 units of radius, a good deal wider than the
// world's biggest landmark — at cruise *and* under boost, where the old
// per-second cap gave 8.3 and 20.
const held = (ds: number) => {
  let cam = Math.PI
  let turned = 0
  for (let i = 0; i < 600; i++) {
    const next = swing(cam, cam + Math.PI / 2, ds, DT, RATE, MAX, SPIN)
    turned += next - cam
    cam = next
  }
  return turned / 10 // radians a second, sustained
}
near(held(CRUISE), MAX * 7.5, 'a held sideways push turns the camera at exactly the cap')
near(7.5 / held(CRUISE), 1 / MAX, 'the sustained carve is 1 / MAX units of radius')
assert.ok(1 / MAX > 11, 'the tightest sustained circle is over 11 units of radius')

// And the ceiling is what keeps boost from being a pirouette: the same hold at
// 2.4x cruise would be 1.6 rad/s on the per-unit cap alone.
near(held(BOOST), SPIN, 'boost is held at the per-second ceiling')
assert.ok(MAX * 7.5 * 2.4 > SPIN, 'the ceiling would not bind under boost')
assert.ok(MAX * 7.5 < SPIN, 'the ceiling binds at cruise, where the distance cap should')

console.log('camera: ok')
