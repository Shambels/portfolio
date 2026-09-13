/**
 * No test framework (CLAUDE.md). The stair is the one piece of this island a
 * screenshot cannot settle, because most of it is inside a mountain where
 * nothing can see it — and the things that can go wrong with it are all
 * numbers: a tread too tall to walk, a ceiling too low for his head, a wall
 * with the beach on the other side of it.
 *
 *   node src/stair.check.ts
 */
import assert from 'node:assert/strict'
import { MAX_CLIMB, scarp } from './beach.ts'
import { ISLES } from './isles.ts'
import { MAN, STAIR, STEP, atDoor, stairAt, stairClimbEnd, stairDoor, stairDoorS, stairExit, stairGround, stairLength, stairMouth, stairNearest, stairPath, stairPortal, stairStepOff } from './stairs.ts'

const len = stairLength()
/** Where the climbing stops and the balcony starts. Almost every assert below
 *  is about the climb, and the balcony is level by construction. */
const climb = stairClimbEnd()
/** The rock runs from the doorway to the portal; `t` below is a fraction of
 *  THAT, not of the whole rail — the porch and the balcony are both out in the
 *  open by design, and measuring the roof over them is measuring the sky. */
const door = stairDoorS()
const cut = (t: number) => door + t * (climb - door)
const path = stairPath().filter((r) => r.s >= stairDoorS() - 1e-6 && r.s <= climb + 1e-6)
const mouth = stairMouth()
const portal = stairPortal()
const exit = stairExit()

/* ------------------------------------------------------------- the passage */

// The doorway is a hole in the alcove's back wall: the rock AT the mouth
// stands over it, and the sand a stride outside is at the floor's level, which
// is what makes it a door you walk into rather than a hole you climb up to.
{
  const door = stairDoor()
  const rock = stairGround(door.x, door.z)
  assert.ok(rock > door.y + STAIR.head,
    `the wall over the doorway is ${rock.toFixed(2)} m, the opening is ${STAIR.head}`)
  // And the porch outside it lies ON the sand — which is what makes walking
  // to the door walking onto the rail, with nothing to jump.
  //
  // The test is that the ground is never BELOW it, not that it matches: the
  // inner third of the porch is the thickness of the doorway itself and the
  // wall is over it, which is what a doorway is. What must not happen is the
  // rail hanging in the air over the beach.
  let below = 0
  for (let k = 0; k <= 30; k++) {
    const p = stairAt((k / 30) * stairDoorS())
    below = Math.min(below, stairGround(p.x, p.z) - p.y)
  }
  assert.ok(below > -0.2, `the porch hangs ${(-below).toFixed(2)} m over the sand`)
  const sand = stairGround(mouth.x, mouth.z)
  assert.ok(Math.abs(sand - mouth.y) < 0.25,
    `the rail meets the beach ${Math.abs(sand - mouth.y).toFixed(2)} m off the sand`)
  assert.ok(Math.abs(mouth.y - STAIR.mouthY) < 1e-9, 'the porch is not level')
}

// And the hole in the flank is where the floor arrives exactly at the
// mountain's surface, or it opens into rock or into thin air. That is the
// *portal*, at the inner end of the balcony — not the rail's end, which is
// two metres out in the open on purpose.
{
  const g = stairGround(portal.x, portal.z)
  assert.ok(Math.abs(g - portal.y) < 0.35,
    `the portal floor is ${portal.y.toFixed(2)} m and the flank is ${g.toFixed(2)}`)
}

// The terrace starts where the balcony ends. Two numbers in two files —
// `STAIR.turns`, `hand` and `balcony` here, `terrace.from` and `r0` in
// `isles.ts` — and this is what stops them drifting apart, because `isles.ts`
// cannot import this file to work them out for itself.
{
  const isle = ISLES.find((i) => i.id === STAIR.isle)!
  const T = isle.terrace!
  const b = isle.lagoon!.bearing
  const ax = isle.pos[0] - Math.cos(b) * (isle.spire?.off ?? 0)
  const az = isle.pos[1] - Math.sin(b) * (isle.spire?.off ?? 0)
  const a = Math.atan2(exit.z - az, exit.x - ax)
  const d = Math.atan2(Math.sin(a - T.from), Math.cos(a - T.from))
  const r = Math.hypot(exit.x - ax, exit.z - az)
  assert.ok(Math.abs(d) * r < 0.06,
    `the terrace starts ${(Math.abs(d) * r).toFixed(2)} m round from the end of the balcony`)
  assert.ok(Math.abs(r - T.r0) < 0.06,
    `the terrace starts at ${T.r0} m and the balcony ends at ${r.toFixed(2)}`)
  assert.ok(Math.abs(exit.y - T.y0) < 0.02,
    `the terrace starts at ${T.y0} m and the balcony ends at ${exit.y.toFixed(2)}`)
}

// And the whole point of it: he is not stuck up there. Walked off the end of
// the ledge and downhill from wherever that leaves him, he has to get off the
// crag — which is the bug this pass was opened by, in the form it was
// reported: "stuck at the top".
{
  const step = 0.12
  const off = stairStepOff()
  let x = off.x
  let z = off.z
  let lowest = stairGround(x, z)
  assert.ok(Math.abs(lowest - exit.y) < 0.5,
    `stepping off the ledge is a ${Math.abs(lowest - exit.y).toFixed(2)} m drop onto the terrace`)
  let moved = 0
  for (let n = 0; n < 3000; n++) {
    const e = 0.4
    const gx = (stairGround(x + e, z) - stairGround(x - e, z)) / (2 * e)
    const gz = (stairGround(x, z + e) - stairGround(x, z - e)) / (2 * e)
    const gl = Math.hypot(gx, gz)
    if (gl < 1e-6) break
    const to = scarp(x, z, x - (gx / gl) * step, z - (gz / gl) * step, stairGround)
    const d = Math.hypot(to.x - x, to.z - z)
    if (d < 1e-4) break
    moved += d
    x = to.x
    z = to.z
    lowest = stairGround(x, z)
    if (lowest < 4) break
  }
  assert.ok(lowest < 4,
    `a man who walks downhill off the ledge gets stuck at ${lowest.toFixed(1)} m ` +
    `after ${moved.toFixed(0)} m of walking`)
}

// The balcony: level, and clear of the flank it sticks out of. A ledge that
// ends inside the hill is a door onto a wall.
{
  assert.ok(Math.abs(exit.y - portal.y) < 1e-6,
    `the balcony climbs ${(exit.y - portal.y).toFixed(3)} m`)
  assert.ok(len - climb > 1.6, `the balcony is ${(len - climb).toFixed(2)} m of ledge`)
  // ...and the ledge itself stands over the terrace it hands him to, rather
  // than sitting on it: a balcony flush with the ground is not a balcony.
  const under = stairGround(exit.x - Math.sin(exit.yaw) * 1.2, exit.z - Math.cos(exit.yaw) * 1.2)
  assert.ok(under < exit.y - 1.0,
    `the balcony is ${(exit.y - under).toFixed(2)} m over the flank behind it`)
}

// It climbs the whole way, at one grade, and that grade is a stair's.
{
  let steepest = -90
  let shallowest = 90
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const run = Math.hypot(b.x - a.x, b.z - a.z)
    const deg = (Math.atan2(b.y - a.y, run) * 180) / Math.PI
    steepest = Math.max(steepest, deg)
    shallowest = Math.min(shallowest, deg)
  }
  assert.ok(shallowest >= -0.01, `the stair falls: ${shallowest.toFixed(1)} deg`)
  assert.ok(steepest <= 36, `the stair is a ladder: ${steepest.toFixed(1)} deg`)
  // Paced by the going, so the two are the same number to within the sampling.
  assert.ok(steepest - shallowest < 1.5,
    `the grade is not constant: ${shallowest.toFixed(1)} to ${steepest.toFixed(1)} deg`)
}

// The treads come out of the climb and the going has to be a going.
{
  const treads = Math.round((STAIR.y1 - STAIR.mouthY) / STEP.rise)
  const going = (climb - door) / treads
  assert.ok(going >= STEP.going * 0.85,
    `${going.toFixed(3)} m of going a tread, wanted ${STEP.going}`)
}

/* ------------------------------------------------------------ it fits a man */

assert.ok(STAIR.head >= MAN.height + 0.4, 'not enough headroom for the rider')
assert.ok(STAIR.half * 2 >= MAN.shoulders * 2.2, 'the passage is too narrow')
{
  // Head clearance on the diagonal a climber's head actually takes: going up a
  // thirty-degree ramp, the ceiling comes down to meet you.
  let worst = Infinity
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!
    const b = path[i]!
    const run = Math.hypot(b.x - a.x, b.z - a.z)
    const grade = (b.y - a.y) / Math.max(run, 1e-9)
    worst = Math.min(worst, STAIR.head - MAN.height - grade * 0.4)
  }
  assert.ok(worst > 0.1, `his head clears the ceiling by ${worst.toFixed(2)} m on the climb`)
}

/* --------------------------------------------- it stays inside the mountain */

/** How much rock stands over the ceiling, sampled across the tunnel's own
 *  width: a passage in a steep flank has plenty over its centreline and none
 *  at all over its downhill wall, and it is the downhill wall that opens. */
function cover(s: number): number {
  const p = stairAt(s)
  const nx = -Math.cos(p.yaw)
  const nz = Math.sin(p.yaw)
  let worst = Infinity
  for (const o of [-1, -0.6, -0.2, 0.2, 0.6, 1]) {
    worst = Math.min(worst,
      stairGround(p.x + nx * STAIR.half * o, p.z + nz * STAIR.half * o) - (p.y + STAIR.head))
  }
  return worst
}

{
  // The portals are excluded, and they are not the same size: the mouth is a
  // doorway one step deep, the exit is the last stretch where the passage
  // turns out to meet the flank. Both are holes in the surface on purpose;
  // everything between them has to be roofed.
  const from = STAIR.inset
  const to = 1 - STAIR.inset * 1.4
  let worst = Infinity
  let where = 0
  for (let k = 0; k <= 400; k++) {
    const t = from + (k / 400) * (to - from)
    const c = cover(cut(t))
    if (c < worst) { worst = c; where = t }
  }
  assert.ok(worst > 0.35,
    `only ${worst.toFixed(2)} m of rock over the ceiling at t=${where.toFixed(2)}`)
}

{
  // The floor is inside the rock too, which is a different question: a tunnel
  // can have a metre over its ceiling and still hang out of a cliff below it.
  let worst = Infinity
  for (let k = 0; k <= 400; k++) {
    const t = STAIR.inset + (k / 400) * (1 - STAIR.inset * 2.4)
    const p = stairAt(cut(t))
    const nx = -Math.cos(p.yaw)
    const nz = Math.sin(p.yaw)
    for (const o of [-1, 0, 1]) {
      worst = Math.min(worst,
        stairGround(p.x + nx * STAIR.half * o, p.z + nz * STAIR.half * o) - p.y)
    }
  }
  assert.ok(worst > 1.5, `only ${worst.toFixed(2)} m of rock outside the floor`)
}

{
  // One turn must not cut into the one below it. Compared by ARC LENGTH apart
  // and not by parameter: two samples a tenth of the curve apart are metres of
  // the same corridor, and the question is about different turns.
  let worst = Infinity
  for (let a = 0; a < path.length; a += 3) {
    for (let b = a + 3; b < path.length; b += 3) {
      const pa = path[a]!
      const pb = path[b]!
      if (pb.s - pa.s < 9) continue
      worst = Math.min(worst, Math.hypot(pa.x - pb.x, pa.y - pb.y, pa.z - pb.z))
    }
  }
  assert.ok(worst > STAIR.half * 2 + 0.6,
    `two turns pass ${worst.toFixed(2)} m apart and the passage is ${(STAIR.half * 2).toFixed(2)} wide`)
}

{
  // What the radius cap relies on: that going DEEPER is never worse. The stair
  // takes `min(skin, cap)`, and that is only safe if the mountain over a
  // smaller radius is at least as tall. It is not a law — the crag term puts
  // bumps in the flank and the strand cuts a flat disc out of its foot — so it
  // is asserted along the line the stair actually takes.
  const ax = stairAt(0)
  void ax
  let worst = Infinity
  for (let k = 20; k <= 380; k++) {
    const p = stairAt(cut(k / 400))
    const cx = p.x - Math.cos(p.phi) * p.r
    const cz = p.z - Math.sin(p.phi) * p.r
    for (const f of [0.75, 0.85, 0.95]) {
      worst = Math.min(worst,
        stairGround(cx + Math.cos(p.phi) * p.r * f, cz + Math.sin(p.phi) * p.r * f) - (p.y + STAIR.head))
    }
  }
  assert.ok(worst > 0, `deeper in is ${worst.toFixed(2)} m thinner somewhere`)
}

/* ------------------------------------------------------------ a man walks it */

{
  // At `WALK_SPEED * SPEED` = 2.7 units a second, sixty frames a second, from
  // the mouth to the exit — the numbers `beach.ts` already walks him at.
  const V = 2.7
  const dt = 1 / 60
  let s = 0
  let frames = 0
  let lastY = stairAt(0).y
  let worstJump = 0
  while (s < len && frames < 60 * 120) {
    s += V * dt
    frames++
    const p = stairAt(s)
    worstJump = Math.max(worstJump, Math.abs(p.y - lastY))
    lastY = p.y
  }
  assert.ok(s >= len, 'he never reaches the top')
  assert.ok(worstJump < 0.05,
    `${(worstJump * 100).toFixed(1)} cm of step under his feet in one frame`)
}

{
  // Both doors answer, and only from the right side.
  //
  // This is the assert that was missing when the cave could not be entered,
  // and it is written the way the failure happened: a man on the sand walking
  // at the wall. The first version of `atDoor` tested his heading against the
  // RAIL's, and the rail starts turning the moment it is through the wall — it
  // passed by four hundredths from dead ahead and refused every other
  // approach. So: walk in on nine bearings across the alcove's mouth, and
  // every one of them opens the door.
  const inward = (p: { phi: number }) => Math.atan2(-Math.cos(p.phi), -Math.sin(p.phi))
  for (let k = -4; k <= 4; k++) {
    const yaw = inward(mouth) + (k * 12 * Math.PI) / 180
    assert.equal(atDoor(mouth.x, mouth.z, yaw, mouth.y), 'mouth',
      `the door refuses a man walking in ${k * 12} degrees off the square`)
  }
  assert.equal(atDoor(exit.x, exit.z, inward(exit), exit.y), 'exit')
  // Walking away from it does not open it, which is what keeps a wave from
  // putting him through a door on a beach.
  assert.equal(atDoor(mouth.x, mouth.z, inward(mouth) + Math.PI, mouth.y), null)
  assert.equal(atDoor(mouth.x + 30, mouth.z, inward(mouth), mouth.y), null)
  // And he can actually reach it: the sand he can stand on has to come within
  // `reach` of the doorway, or the door is a door in the middle of a cliff.
  // Walked in from the water, stopped by `scarp` at the back wall.
  let stood = { x: 0, z: 0 }
  {
    const dir = { x: Math.cos(mouth.phi), z: Math.sin(mouth.phi) }
    let x = mouth.x + dir.x * 5
    let z = mouth.z + dir.z * 5
    for (let n = 0; n < 400; n++) {
      const step = scarp(x, z, x - dir.x * 0.045, z - dir.z * 0.045, stairGround)
      if (Math.hypot(step.x - x, step.z - z) < 1e-4) break
      x = step.x
      z = step.z
    }
    stood = { x, z }
  }
  // Every approach across the alcove's mouth gets in, and none of them gets in
  // at the top. The second half of that is the one that bit: the balcony hangs
  // almost over the strand, and a nearest-point search in XZ alone put a man
  // walking up the sand seventeen metres up at the other end of the stair.
  for (let k = -5; k <= 5; k++) {
    const dir = mouth.phi + (k * 8 * Math.PI) / 180
    const yaw = Math.atan2(-Math.cos(dir), -Math.sin(dir))
    let x = mouth.x + Math.cos(dir) * 3.4
    let z = mouth.z + Math.sin(dir) * 3.4
    let s = -1
    for (let n = 0; n < 900; n++) {
      const g = stairGround(x, z)
      if (atDoor(x, z, yaw, g)) { s = stairNearest(x, z, g); break }
      const step = scarp(x, z, x + Math.sin(yaw) * 0.05, z + Math.cos(yaw) * 0.05, stairGround)
      if (Math.hypot(step.x - x, step.z - z) < 1e-5) break
      x = step.x
      z = step.z
    }
    assert.ok(s >= 0, `a man walking in ${k * 8} degrees off the square never reaches the door`)
    assert.ok(s <= stairDoorS() + 0.1,
      `a man walking in ${k * 8} degrees off the square is put ${s.toFixed(1)} m along the rail`)
    // And stepping on is a step. What he keeps is his offset ACROSS the rail,
    // which is walked off over a third of a second; what he cannot keep is a
    // gap along it, so that is what this bounds.
    const on = stairAt(s)
    const lat = (x - on.x) * Math.cos(on.yaw) - (z - on.z) * Math.sin(on.yaw)
    const gap = Math.hypot(x - (on.x + Math.cos(on.yaw) * lat), z - (on.z - Math.sin(on.yaw) * lat))
    assert.ok(gap < 0.35,
      `walking in ${k * 8} degrees off the square steps ${(gap * 100).toFixed(0)} cm onto the rail`)
  }
  const gap = Math.hypot(stood.x - mouth.x, stood.z - mouth.z)
  assert.ok(gap < STAIR.reach + 0.6,
    `a man walked at the wall stops ${gap.toFixed(2)} m from the rail and \`reach\` is ${STAIR.reach}`)
  assert.equal(atDoor(stood.x, stood.z, inward(mouth), stairGround(stood.x, stood.z)), 'mouth',
    'a man stopped at the back wall is not at the door')
}

void MAX_CLIMB

console.log(
  `stair: ok — ${(climb - door).toFixed(1)} m of going for ${(STAIR.y1 - STAIR.mouthY).toFixed(1)} m of climb, ` +
  `${Math.round((STAIR.y1 - STAIR.mouthY) / STEP.rise)} treads, ` +
  `${door.toFixed(1)} m of porch and ${(len - climb).toFixed(1)} m of balcony, ` +
  `${(len / 2.7).toFixed(1)} s from the sand to the ledge`,
)
