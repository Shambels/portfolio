/**
 * Ride onto the isle and off it again, and check that the man is never inside
 * it. `node src/beach.check.ts`.
 *
 * This exists because the first version of the beach had exactly one visible
 * bug and it was this: the altitude was eased in over the same second and a
 * quarter as the choreography, so the surfer spent the whole change of mode
 * *under* the sand and stepped out of it when the animation finished. It was
 * obvious the moment anybody drove at the island and invisible in every number
 * on the page, which is the definition of a thing that wants an assert.
 *
 * What is simulated is the vertical and nothing else: `beach.ts`'s three
 * functions over `isles.ts`'s real height field, at 120 Hz, on eight bearings.
 * The speed is a flat 9 units a second all the way in — harsher than the craft,
 * which is blending down to `WALK_SPEED` from the moment the ramp starts, so
 * passing here passes there.
 */
import assert from 'node:assert/strict'
import { ISLES, ground } from './isles.ts'
import { BEACH, FOOT_DROP, altitude, ashore, carried, follow } from './beach.ts'

const isle = ISLES[0]!
/** Riding speed. The real approach decelerates; this one does not. */
const RUN = 9
const DT = 1 / 120
/**
 * How far under the sand the craft's origin may be with the board still on it,
 * and it is two millimetres because the answer should be zero: `follow` tracks
 * the ground exactly on the way up and `altitude` is a floor, so nothing here
 * is a matter of tuning. The two millimetres are for the arithmetic.
 *
 * The first version reached 44 cm, and it reached it on a summit that turned
 * out to have a 2.1 m step in it — which is how the isle's own gully term came
 * to be fixed. See `isles.ts`.
 */
const TOL = 0.002
/** And the largest step the altitude may take in one frame, so that "never
 *  under the sand" is not bought with a jump cut. */
const STEP = 0.25

let worstDeep = 0
let worstStep = 0
let ever = 0

for (let b = 0; b < 8; b++) {
  const th = (b / 8) * Math.PI * 2
  // Start well out in open water, aimed at the middle, and run past the summit
  // and out the far side — so every bearing rides on and walks off again.
  const from = isle.radius * 1.6
  let x = isle.pos[0] + Math.cos(th) * from
  let z = isle.pos[1] + Math.sin(th) * from
  const vx = -Math.cos(th) * RUN
  const vz = -Math.sin(th) * RUN

  let land = 0
  let sandY = 0
  let y = 0
  let was = 0

  for (let i = 0; i < (2 * from) / RUN / DT; i++) {
    x += vx * DT
    z += vz * DT
    const g = ground(x, z)
    land = ashore(land, g, DT)
    sandY = follow(sandY, g, DT)
    // The water under him, which the buoyancy owns and which this check has no
    // business modelling: a flat sea is the worst case for a floor anyway,
    // because a swell would only ever hold him higher.
    y = land > 0 ? altitude(0, sandY - FOOT_DROP * carried(land), land) : 0

    if (land > 0) {
      // The board's keel is the craft's origin. While the board is still under
      // him the origin has to be on the sand; as it goes under his arm the
      // origin is allowed to sink by exactly the `FOOT_DROP` that puts his
      // soles there instead.
      worstDeep = Math.max(worstDeep, g - (y + FOOT_DROP * carried(land)))
      worstStep = Math.max(worstStep, Math.abs(y - was))
      ever = Math.max(ever, land)
    }
    was = y
  }
}

assert.ok(ever > 0.99,
  `never got ashore — the ramp reached ${ever.toFixed(2)}, so this checked nothing`)
assert.ok(worstDeep < TOL,
  `the board goes ${(worstDeep * 100).toFixed(1)} cm into the sand — the altitude is lagging ` +
  'the terrain, which is the bug `altitude` is a floor rather than a fade to prevent')
assert.ok(worstStep < STEP,
  `the altitude jumps ${(worstStep * 100).toFixed(1)} cm in one frame — ` +
  'the floor is being bought with a cut')

// And the ramp is as long as it says it is, which is the other half of the
// original bug: a floor is worthless if the choreography is not what it looks.
let t = 0
let l = 0
while (l < 0.999 && t < 5) { l = ashore(l, 1, DT); t += DT }
assert.ok(Math.abs(t - BEACH) < 0.02,
  `the change of mode takes ${t.toFixed(2)} s, not ${BEACH}`)

console.log(`beach: ok — ${(worstDeep * 100).toFixed(1)} cm into the sand at worst, ` +
  `${(worstStep * 100).toFixed(1)} cm the biggest step, ${t.toFixed(2)} s to change mode`)
