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
import { ISLES, ground, isleHeight, isleShore } from './isles.ts'
import { BEACH, FOOT_DROP, MAX_CLIMB, altitude, ashore, carried, follow, scarp } from './beach.ts'

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

/* ---------------------------------------------------------------------------
 * And the slope he may not climb.
 *
 * `MAX_CLIMB` arrived with the crag isle, and the one thing it must not do is
 * change the island that was already here. `palm-isle`'s steepest flank is
 * 55.1 degrees and the limit is 60, so a man who can climb anything and a man
 * who can climb sixty degrees walk it identically — asserted rather than
 * asserted-ish: every step of a walk straight over the summit, on sixteen
 * bearings, is the step he would have taken before.
 * ------------------------------------------------------------------------ */
{
  const palm = ISLES[0]!
  const g = (x: number, z: number) => isleHeight(palm, x, z)
  let refused = 0
  let steepest = 0
  for (let k = 0; k < 16; k++) {
    const t = (k / 16) * Math.PI * 2
    const fx = Math.cos(t)
    const fz = Math.sin(t)
    // in from the waterline, over the top, and out the other side
    for (let d = -isleShore(palm, t) * 0.99; d < isleShore(palm, t + Math.PI) * 0.99; d += 0.25) {
      const x = palm.pos[0] + fx * d
      const z = palm.pos[1] + fz * d
      if (g(x, z) < 0.05) continue
      const to = { x: x + fx * 0.25, z: z + fz * 0.25 }
      const slid = scarp(x, z, to.x, to.z, g)
      if (Math.hypot(slid.x - to.x, slid.z - to.z) > 1e-9) refused++
      const e = 0.4
      const gx = (g(x + e, z) - g(x - e, z)) / (2 * e)
      const gz = (g(x, z + e) - g(x, z - e)) / (2 * e)
      steepest = Math.max(steepest, (Math.atan(Math.hypot(gx, gz)) * 180) / Math.PI)
    }
  }
  assert.equal(refused, 0, `${refused} steps on palm-isle are refused by MAX_CLIMB`)

  // And it does refuse a wall, or it is not doing anything at all. The crag
  // isle's strand has an 83-degree back wall with a doorway in it.
  const crag = ISLES.find((i) => i.id === 'crag-isle')
  if (crag) {
    const cg = (x: number, z: number) => isleHeight(crag, x, z)
    const b = crag.lagoon!.bearing
    const ax = crag.pos[0] - Math.cos(b) * (crag.spire?.off ?? 0)
    const az = crag.pos[1] - Math.sin(b) * (crag.spire?.off ?? 0)
    // Walked up the strand from the water, straight at the back wall, and he
    // has to stop at it. Where he stops is the whole fix: before, he walked up
    // an 83-degree wall and over the doorway he was aiming for.
    let x = ax + Math.cos(b) * 7.4
    let z = az + Math.sin(b) * 7.4
    for (let n = 0; n < 400; n++) {
      const step = scarp(x, z, x - Math.cos(b) * 0.05, z - Math.sin(b) * 0.05, cg)
      if (Math.hypot(step.x - x, step.z - z) < 1e-4) break
      x = step.x
      z = step.z
    }
    const stopped = Math.hypot(x - ax, z - az)
    assert.ok(stopped > 3.9 && stopped < 5.0,
      `a man walked up the strand stops ${stopped.toFixed(2)} m from the axis, ` +
      'and the back wall with the doorway in it is at 4.3')
  }
  console.log(`climb: ok — palm-isle's steepest is ${steepest.toFixed(1)} deg, ` +
    `the limit is ${((Math.atan(MAX_CLIMB) * 180) / Math.PI).toFixed(0)}, nothing on it refused`)
}
