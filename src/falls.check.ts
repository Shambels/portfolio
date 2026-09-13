/**
 * No test framework (CLAUDE.md). The fall is scenery and most scenery is a
 * matter of looking — but this one has a job, and the job is a geometric
 * claim: **the doorway at the back of the alcove cannot be seen from the
 * water.** That is exactly the kind of thing a screenshot settles from one
 * angle and node settles from three hundred.
 *
 *   node src/fall.check.ts
 */
import assert from 'node:assert/strict'
import { FALL, FALL_BEARING, AXIS, fallAt, fallBlocks, fallFoot, fallFootWidth, fallLip, TOP } from './falls.ts'
import { ISLES, isleHeight } from './isles.ts'
import { stairDoor, stairExit } from './stairs.ts'

const isle = ISLES.find((i) => i.id === FALL.isle)!
const g = (x: number, z: number) => isleHeight(isle, x, z)
const door = stairDoor()
const pad = stairExit()

/* ------------------------------------------------------------- it hangs off */

// The near edge of the lip is the pad's own corner, so the water comes off the
// landing and not off some ledge beside it.
{
  const p = fallLip(0)
  assert.ok(Math.hypot(p.x - pad.x, p.z - pad.z) < 0.05,
    `the lip starts ${Math.hypot(p.x - pad.x, p.z - pad.z).toFixed(2)} m from the pad`)
  assert.ok(Math.abs(p.y - pad.y) < 1e-9, 'the lip is not at the pad\'s height')
}

// And the rest of it is on the rim: within a stride of the pad the lip has
// settled onto rock that is exactly as high as the water is.
{
  // Past `settle`, where it has finished coming off the pad. And half a metre
  // of tolerance rather than a centimetre, because this face stands at more
  // than eighty degrees: a hand's breadth of radius is a metre of height, and
  // the number that matters is that the water is on the rock and not a stride
  // out from it.
  let worst = 0
  for (let k = Math.ceil(FALL.settle * 20) + 1; k <= 20; k++) {
    const p = fallLip(k / 20)
    worst = Math.max(worst, Math.abs(g(p.x, p.z) - TOP))
  }
  assert.ok(worst < 0.55, `the lip stands ${worst.toFixed(2)} m off the rim somewhere`)
}

// Below the lip it is in the air. A curtain inside a cliff is a wet cliff.
{
  let worst = -Infinity
  let where = ''
  for (let k = 0; k <= 40; k++) {
    for (let j = 3; j <= 40; j++) {
      const p = fallAt(k / 40, j / 40)
      const into = g(p.x, p.z) - p.y
      if (into > worst) { worst = into; where = `v=${(k / 40).toFixed(2)} d=${(j / 40).toFixed(2)}` }
    }
  }
  assert.ok(worst < 0.5, `the curtain is ${worst.toFixed(2)} m inside the rock at ${where}`)
}

// And it lands on the wet sand or in the water, across its whole width bar the
// two corners — the pad end throws clear into the bay, which is the point of
// it leaning out.
{
  let land = 0
  for (let k = 2; k <= 38; k++) {
    const p = fallFoot(k / 40)
    if (g(p.x, p.z) < 0.7) land++
  }
  assert.ok(land >= 33, `only ${land} of 37 samples of the foot come down on the water or the wet sand`)
}

/* ------------------------------------------------- and it hides the doorway */

{
  // Every eye on the water whose line to the doorway is not already cut by
  // rock has to be cut by the fall. The alcove's own side walls do most of the
  // work — that is what makes it an alcove — and this is about the fan they
  // leave open, which is the fan a person actually sails into.
  const rockBlocks = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => {
    for (let k = 1; k < 200; k++) {
      const t = k / 200
      const x = a.x + (b.x - a.x) * t
      const y = a.y + (b.y - a.y) * t
      const z = a.z + (b.z - a.z) * t
      if (g(x, z) > y + 0.05) return true
    }
    return false
  }

  let clear = 0
  let seen = 0
  const misses: string[] = []
  // ...and not only the middle of the door: its two jambs and its lintel too,
  // or a curtain that covers a point and not an opening passes this.
  const targets = [
    { dx: 0, dy: 1.1 },
    { dx: -1.0, dy: 0.9 },
    { dx: 1.0, dy: 0.9 },
    { dx: 0, dy: 2.0 },
  ]
  for (let off = -80; off <= 80; off += 4) {
    for (const dist of [12, 16, 22, 30, 45]) {
      for (const eye of [1.6, 5, 10]) {
        const phi = FALL_BEARING + (off * Math.PI) / 180
        const a = { x: AXIS.x + Math.cos(phi) * dist, y: eye, z: AXIS.z + Math.sin(phi) * dist }
        if (g(a.x, a.z) > -0.05) continue // not on the water
        for (const t of targets) {
          // across the doorway, square to the way it faces
          const b = {
            x: door.x - Math.sin(FALL_BEARING) * t.dx,
            y: door.y + t.dy,
            z: door.z + Math.cos(FALL_BEARING) * t.dx,
          }
          if (rockBlocks(a, b)) continue
          clear++
          if (!fallBlocks(a, b)) {
            seen++
            if (misses.length < 6) misses.push(`${off} deg, ${dist} m out, ${eye} m up`)
          }
        }
      }
    }
  }
  assert.ok(clear > 40, `only ${clear} lines of sight reach the doorway at all — the test is not testing`)
  assert.equal(seen, 0,
    `${seen} of ${clear} lines of sight see the doorway past the fall: ${misses.join('; ')}`)
  console.log(`fall: ok — ${(TOP - FALL.base).toFixed(1)} m from the landing pad, ` +
    `${fallFootWidth().toFixed(1)} m of foot, ` +
    `${clear} clear lines of sight to the doorway and every one of them cut`)
}
