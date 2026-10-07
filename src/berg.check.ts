/**
 * The iceberg: its shape, the ring of ice on it, how it rocks, and a board
 * gliding on it. `node src/berg.check.ts`.
 *
 * Held: the profile is a snowfield that is flat out to the ice and meets the
 * water where `world.ts`'s `SHORE` says islands do; a berg nobody touches and
 * no clock moves stays exactly level (invariant 6); a rider's weight leans it
 * toward him; a landing sinks and dips it, harder for a harder landing, never
 * past the caps, back through level and settled; and on the ice a glide keeps
 * its speed and its direction whatever the input says, while a man stopped on
 * it can still creep off — and one riding in from the sea at cruise gets up
 * the shore onto the snow. And the apron: round the back the berg is exactly
 * `BERG_PROFILE`, in front of the adit a nearly flat run of ice `APRON.width`
 * long is spliced in after the roll-off and the coast stands that much further
 * out, and the ride up from the sea makes it to the snow across that too.
 */
import assert from 'node:assert/strict'
import {
  APRON, BERG_PROFILE, ICE_IN, LIFT, MAX_HEAVE, MAX_TILT, SKATE,
  apronWeight, bergLift, bergProfile, glide, kick, onIce, pose, shove, stepBerg, type BergState,
} from './berg.ts'
import { GROUND, profileAt } from './plateau.ts'

const DT = 1 / 120
const R = 5 * 1.9 // polarsense's radius times `ISLAND_SPREAD`
const GRAV = 9 // `Ship.tsx`
function fresh(): BergState {
  return { h: 0, vh: 0, sx: 0, vsx: 0, sz: 0, vsz: 0 }
}

// ------------------------------------------------------------ the shape
{
  const water = -(GROUND + LIFT)
  let last = Infinity
  let wet = -1
  for (let k = 0; k <= 1000; k++) {
    const f = k / 1000
    const y = profileAt(1, 0, f, 0, BERG_PROFILE)
    assert.ok(y <= last + 1e-9, `the berg climbs at ${f}`)
    if (f <= ICE_IN - 0.03 + 1e-9) assert.equal(y, 0, `the snow is not flat at ${f}`)
    if (wet < 0 && y < water) wet = f
    last = y
  }
  // The coast: where the profile goes under. Inside the 0.93 `world.ts` keeps
  // spray off the beach at, and well outside the snow.
  assert.ok(wet > 0.8 && wet < 0.93, `the berg meets the sea at ${wet}`)
  assert.ok(!onIce(ICE_IN - 0.01) && onIce(ICE_IN) && onIce(wet), 'the ice is the ring from ICE_IN out')
  // And at rest the pose adds the lift and nothing else.
  assert.equal(bergLift(3, -2, fresh()), LIFT)
}

// ------------------------------------------------------------- the pose
{
  // Untouched, with the clock held — reduced motion — it does not move at all.
  const b = fresh()
  for (let i = 0; i < 1200; i++) stepBerg(DT, 0, R, null, b)
  assert.deepEqual(b, fresh(), 'a berg nobody touches is still')
}
{
  // A rider standing at the edge of the snow on +x: it settles leaning his way.
  const b = fresh()
  for (let i = 0; i < 120 * 40; i++) stepBerg(DT, 0, R, { dx: R * ICE_IN, dz: 0 }, b)
  const p = pose(b)
  assert.ok(p.h < -0.03 && p.h > -0.07, `his weight sinks it ${p.h.toFixed(3)}`)
  assert.ok(p.sx < -0.008, `and it leans toward him ${p.sx.toFixed(4)}`)
  assert.ok(Math.abs(p.sz) < 1e-6, 'and not sideways')
  // His side is lower than the other side.
  assert.ok(bergLift(4, 0, b) < bergLift(-4, 0, b))
}
{
  // Landings: harder is bigger, nothing passes the caps, it swings back
  // through level more than once, and it settles.
  let lastHeave = 0
  let lastTilt = 0
  for (const fall of [2, 5, 9, 20, 60]) {
    const b = fresh()
    kick(R * 0.6, 0, fall, R, b)
    let heave = 0
    let tilt = 0
    let crossings = 0
    let prev = 0
    for (let i = 0; i < 120 * 40; i++) {
      stepBerg(DT, 0, R, null, b)
      const p = pose(b)
      heave = Math.max(heave, Math.abs(p.h))
      tilt = Math.max(tilt, Math.abs(p.sx))
      if (prev !== 0 && Math.sign(p.sx) !== Math.sign(prev)) crossings++
      prev = p.sx
      assert.ok(Math.abs(p.h) <= MAX_HEAVE && Math.abs(p.sx) <= MAX_TILT, 'past the caps')
    }
    assert.ok(heave > lastHeave && tilt > lastTilt, `a ${fall} u/s landing is not bigger than a softer one`)
    assert.ok(crossings >= 3, `a ${fall} u/s landing settles without rocking (${crossings})`)
    assert.ok(Math.abs(b.h) < 0.002 && Math.abs(b.sx) < 0.001, `a ${fall} u/s landing has not settled in 40 s`)
    lastHeave = heave
    lastTilt = tilt
  }
  // A cruise landing (~6 u/s) near the snow's edge is readable: ~20 cm, ~3°.
  const b = fresh()
  kick(R * 0.5, 0, 6, R, b)
  let heave = 0
  let tilt = 0
  for (let i = 0; i < 600; i++) {
    stepBerg(DT, 0, R, null, b)
    heave = Math.max(heave, -pose(b).h)
    tilt = Math.max(tilt, Math.abs(pose(b).sx))
  }
  assert.ok(heave > 0.12 && heave < 0.3, `a cruise landing heaves ${heave.toFixed(3)}`)
  assert.ok(tilt > 0.02 && tilt < MAX_TILT, `and tilts ${(tilt * 57.3).toFixed(1)}°`)
}
{
  // A shove along +z rolls the top along it: the +z side goes down.
  const b = fresh()
  shove(0, 12, b)
  for (let i = 0; i < 60; i++) stepBerg(DT, 0, R, null, b)
  assert.ok(pose(b).sz < -0.01 && pose(b).h < 0, 'a shove along +z dips the +z side')
}

// ------------------------------------------------------------ the glide
{
  // Flat ice, no input: the glide keeps its speed and its line.
  const v = { x: 6, z: 2 }
  for (let i = 0; i < 120; i++) glide(v, { x: 0, z: 0 }, 0, 0, GRAV, DT)
  assert.ok(Math.hypot(v.x, v.z) > 0.95 * Math.hypot(6, 2), 'the ice took the speed')
  assert.ok(Math.abs(Math.atan2(v.z, v.x) - Math.atan2(2, 6)) < 1e-9, 'the ice turned it')
  // Steering hard across it for a second turns it by less than a degree:
  // the input is a rotation of the board, not of the glide.
  const w = { x: 8, z: 0 }
  for (let i = 0; i < 120; i++) glide(w, { x: 0, z: 1 }, 0, 0, GRAV, DT)
  assert.ok(Math.atan2(w.z, w.x) < 1 / 57.3, `steering across turned it ${(Math.atan2(w.z, w.x) * 57.3).toFixed(2)}°`)
  // Stopped, the faint skate gets him moving — to about SKATE.most, no more.
  const s = { x: 0, z: 0 }
  for (let i = 0; i < 120 * 5; i++) glide(s, { x: 1, z: 0 }, 0, 0, GRAV, DT)
  assert.ok(s.x > SKATE.most * 0.9 && s.x <= SKATE.most + 1e-9, `the skate reaches ${s.x.toFixed(2)}`)
}
{
  // Up the real shore from the sea at cruise (`SPEED` × the surfer's 1.18):
  // the glide is uphill the whole way, and he arrives on the snow still moving.
  const water = -(GROUND + LIFT)
  let f = 0.86
  while (profileAt(1, 0, f, 0, BERG_PROFILE) < water) f -= 0.001
  let x = f * R
  let v = -7.5 * 1.18
  let t = 0
  while (x > ICE_IN * R && t < 10) {
    const e = 0.01
    const slope = (profileAt(R, 0, x + e, 0, BERG_PROFILE) - profileAt(R, 0, x - e, 0, BERG_PROFILE)) / (2 * e)
    const vv = { x: v, z: 0 }
    glide(vv, { x: 0, z: 0 }, slope, 0, GRAV, DT)
    v = vv.x
    x += v * DT
    t += DT
    assert.ok(v < 0, `a cruise ride up the shore stalled at ${(x / R).toFixed(2)}`)
  }
  assert.ok(x <= ICE_IN * R, 'he never reached the snow')
  // And one stopped halfway up slides back into the sea.
  let y = 0.7 * R
  let u = 0
  for (let i = 0; i < 120 * 6 && y < f * R; i++) {
    const e = 0.01
    const slope = (profileAt(R, 0, y + e, 0, BERG_PROFILE) - profileAt(R, 0, y - e, 0, BERG_PROFILE)) / (2 * e)
    const vv = { x: u, z: 0 }
    glide(vv, { x: 0, z: 0 }, slope, 0, GRAV, DT)
    u = vv.x
    y += u * DT
  }
  assert.ok(y >= f * R, 'a man stopped on the shore stayed there')
}

// ------------------------------------------------------------ the apron
{
  // Round the back it is the berg it was, to the millimetre.
  const back = bergProfile(0)
  assert.equal(back.length, BERG_PROFILE.length + 1)
  for (let k = 0; k <= 1200; k++) {
    const f = k / 1000
    assert.equal(profileAt(1, 0, f, 0, back), profileAt(1, 0, f, 0, BERG_PROFILE), `the back moved at ${f}`)
  }
  // In front of the adit, full; round the back, none; between, between.
  assert.equal(apronWeight(0.4, 0.4), 1)
  assert.equal(apronWeight(0.4 + Math.PI, 0.4), 0)
  const mid = apronWeight(0.4 + (APRON.full + APRON.gone) / 2, 0.4)
  assert.ok(mid > 0.2 && mid < 0.8, `the apron's edge is not an edge: ${mid}`)
  // Full: never climbing, the run nearly flat and all of it ice, and the
  // coast moved out by exactly the run.
  const front = bergProfile(1)
  const [h0, y0] = BERG_PROFILE[APRON.hinge]!
  const water = -(GROUND + LIFT)
  let last = Infinity
  let wet = -1
  let wetBack = -1
  for (let k = 0; k <= 1600; k++) {
    const f = k / 1000
    const y = profileAt(1, 0, f, 0, front)
    assert.ok(y <= last + 1e-9, `the apron climbs at ${f}`)
    if (f > h0 && f <= h0 + APRON.width) {
      assert.ok(onIce(f), `the apron is snow at ${f}`)
      assert.ok(y >= y0 - APRON.drop - 1e-9, `the apron is not flat at ${f}`)
    }
    if (wet < 0 && y < water) wet = f
    if (wetBack < 0 && profileAt(1, 0, f, 0, BERG_PROFILE) < water) wetBack = f
    last = y
  }
  // (A shade under the run: the shore past it starts `drop` lower, so it goes
  // under a little sooner.)
  const moved = wet - wetBack
  assert.ok(moved > APRON.width - 0.02 && moved <= APRON.width, `the apron moved the coast ${moved.toFixed(3)}`)
  // Nearly flat means the skate beats it: a man stopped on it gets off it
  // whichever way he points.
  const grade = APRON.drop / (APRON.width * R)
  assert.ok(GRAV * grade < SKATE.accel / 5, `the apron is a slope: ${(grade * 100).toFixed(1)}%`)
  // And the ride in at cruise, from the sea across all of it, onto the snow.
  let x = wet * R
  let v = -7.5 * 1.18
  let t = 0
  while (x > ICE_IN * R && t < 10) {
    const e = 0.01
    const slope = (profileAt(R, 0, x + e, 0, front) - profileAt(R, 0, x - e, 0, front)) / (2 * e)
    const vv = { x: v, z: 0 }
    glide(vv, { x: 0, z: 0 }, slope, 0, GRAV, DT)
    v = vv.x
    x += v * DT
    t += DT
    assert.ok(v < 0, `a cruise ride across the apron stalled at ${(x / R).toFixed(2)}`)
  }
  assert.ok(x <= ICE_IN * R, 'he never reached the snow across the apron')
}

console.log('berg: ok')
