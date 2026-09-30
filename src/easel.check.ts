// What Arts by Sandra's easel has to be true for the paint to land where the
// pointer is. `node src/easel.check.ts`.

import assert from 'node:assert/strict'
import { BLOBS, BLOB_R, CORNERS, H, PH, PW, RAG, W, toCanvas } from './easel.ts'

const near = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) < eps

// The map takes the canvas's four corners in the plate to its square's.
const unit = [[0, 0], [1, 0], [1, 1], [0, 1]]
CORNERS.forEach(([x, y], i) => {
  const [u, v] = toCanvas(x, y)
  assert(near(u, unit[i]![0]!) && near(v, unit[i]![1]!), `corner ${i} maps to ${u}, ${v}`)
})

// The middle of the quad is inside the canvas, and a point outside it is not.
const [cx, cy] = toCanvas((CORNERS[0][0] + CORNERS[2][0]) / 2, (CORNERS[0][1] + CORNERS[2][1]) / 2)
assert(cx > 0.45 && cx < 0.55 && cy > 0.45 && cy < 0.55, 'the canvas has a middle')
const [ox] = toCanvas(CORNERS[0][0] - 0.02, 0.3)
assert(ox < 0, 'left of the canvas is off it')

// Every blob is off the canvas, inside the plate, and clear of the others and
// of the rag — or a stroke would load a colour, or a colour wipe the canvas.
for (const [i, b] of BLOBS.entries()) {
  const [u, v] = toCanvas(b.at[0], b.at[1])
  assert(v > 1, `blob ${i} is on the canvas`)
  assert(b.at[0] > 0 && b.at[0] < 1 && b.at[1] > 0 && b.at[1] < 1, `blob ${i} is off the plate`)
  assert(!(b.at[0] > RAG[0][0] && b.at[1] > RAG[0][1]), `blob ${i} is under the rag`)
  for (const o of BLOBS.slice(i + 1)) {
    assert(Math.hypot((b.at[0] - o.at[0]) * W, (b.at[1] - o.at[1]) * H) > 2 * BLOB_R * W, `blob ${i} overlaps the next`)
  }
  assert(/^#[0-9a-f]{6}$/.test(b.paint))
  void u
}
assert.equal(BLOBS.length, 6, 'six oils')

// The paint layer has the canvas's own proportions, to a percent.
const wTop = (CORNERS[1][0] - CORNERS[0][0]) * W
const hLeft = (CORNERS[3][1] - CORNERS[0][1]) * H
assert(Math.abs(PW / PH - wTop / hLeft) / (wTop / hLeft) < 0.02, `paint layer ${PW / PH} vs canvas ${wTop / hLeft}`)

console.log('easel: ok — canvas', wTop.toFixed(0), '×', hLeft.toFixed(0), 'plate units, six blobs clear of it and of each other')
