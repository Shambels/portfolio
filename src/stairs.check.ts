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
import { MAN, STAIR, STEP, atDoor, stairAt, stairExit, stairGround, stairLength, stairMouth, stairPath } from './stairs.ts'

const path = stairPath()
const len = stairLength()
const mouth = stairMouth()
const exit = stairExit()

/* ------------------------------------------------------------- the passage */

// The doorway is a hole in the alcove's back wall: the rock AT the mouth
// stands over it, and the sand a stride outside is at the floor's level, which
// is what makes it a door you walk into rather than a hole you climb up to.
{
  const rock = stairGround(mouth.x, mouth.z)
  assert.ok(rock > mouth.y + STAIR.head,
    `the wall over the doorway is ${rock.toFixed(2)} m, the opening is ${STAIR.head}`)
  const out = {
    x: mouth.x + Math.cos(mouth.phi) * 0.9,
    z: mouth.z + Math.sin(mouth.phi) * 0.9,
  }
  const sand = stairGround(out.x, out.z)
  assert.ok(Math.abs(sand - mouth.y) < 0.25,
    `the sand outside the door is ${sand.toFixed(2)} m and the floor is ${mouth.y}`)
}

// And the exit is a hole in the flank: the floor arrives exactly where the
// mountain's surface is, or it opens into rock or into the air.
{
  const g = stairGround(exit.x, exit.z)
  assert.ok(Math.abs(g - exit.y) < 0.35,
    `the exit floor is ${exit.y.toFixed(2)} m and the flank is ${g.toFixed(2)}`)
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
  assert.ok(len / treads >= STEP.going * 0.85,
    `${(len / treads).toFixed(3)} m of going a tread, wanted ${STEP.going}`)
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
    const c = cover(t * len)
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
    const p = stairAt(t * len)
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
    const p = stairAt((k / 400) * len)
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
  // Both doors answer, and only from the right side. A door you can only walk
  // in through is a door a wave cannot shove you through, which matters at the
  // mouth, because the mouth is on a beach.
  assert.equal(atDoor(mouth.x, mouth.z, mouth.yaw), 'mouth')
  assert.equal(atDoor(exit.x, exit.z, exit.yaw + Math.PI), 'exit')
  assert.equal(atDoor(mouth.x, mouth.z, mouth.yaw + Math.PI), null)
  assert.equal(atDoor(mouth.x + 30, mouth.z, mouth.yaw), null)
}

console.log(
  `stair: ok — ${len.toFixed(1)} m of going for ${(STAIR.y1 - STAIR.mouthY).toFixed(1)} m of climb, ` +
  `${Math.round((STAIR.y1 - STAIR.mouthY) / STEP.rise)} treads, ` +
  `${(len / 2.7).toFixed(1)} s at a walk`,
)
