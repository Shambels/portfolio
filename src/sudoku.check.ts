// What the hologram's puzzle has to be true for the shader to be honest.
// `node src/sudoku.check.ts`.
//
// Runs in node with no three: the board, the candidates, the fixed solver,
// the bytes the shader samples, and the hole a hull leaves through the panel.

import assert from 'node:assert/strict'
import { BOARD, PANEL, PIERCE, PUZZLE, SLOTS, candidates, cellAt, holes, pierce, solve, table } from './sudoku.ts'

// The board is the repository's: 81 cells, 31 clues, 50 open.
assert.equal(PUZZLE.length, 81)
assert.equal(BOARD.filter((n) => n).length, 31, '31 clues')
assert.equal(BOARD.filter((n) => !n).length, 50, '50 open cells')

// Every clue is consistent with every other — no row, column or box repeats.
for (let i = 0; i < 81; i++) {
  if (!BOARD[i]) continue
  const without = BOARD.slice()
  without[i] = 0
  assert(candidates(without, i).includes(BOARD[i]!), `clue ${BOARD[i]} at ${i} clashes`)
}

// An open cell has 2..6 candidates — what the tray sank its wells by.
const counts = new Map<number, number>()
for (let i = 0; i < 81; i++) {
  if (BOARD[i]) continue
  const n = candidates(BOARD, i).length
  assert(n >= 2 && n <= 6, `cell ${i} has ${n} candidates`)
  counts.set(n, (counts.get(n) ?? 0) + 1)
}
assert.equal([...counts.keys()].sort().join(''), '23456', 'every count 2..6 occurs')

// The fixed solver finds exactly one solution, and it keeps every clue.
const solved = BOARD.slice()
assert.equal(solve(solved), 1, 'solvable')
assert(!solved.includes(0), 'solved board is full')
for (let i = 0; i < 81; i++) {
  if (BOARD[i]) assert.equal(solved[i], BOARD[i], `clue ${i} kept`)
  const without = solved.slice()
  without[i] = 0
  assert.deepEqual(candidates(without, i), [solved[i]], `solved cell ${i} is forced`)
}
assert.equal(solve(BOARD.slice(), 2), 1, 'exactly one solution')

// The scan order is the repository's: the first empty cell, row-major, which
// is cell 0 on this board — the solver's first move is the top-left corner.
assert.equal(BOARD.indexOf(0), 0)

// The texture: one column per cell, the clue on row 0, six slots under it
// drawn only from that cell's own candidates and covering all of them.
const bytes = table()
assert.equal(bytes.length, 81 * (1 + SLOTS))
for (let i = 0; i < 81; i++) {
  assert.equal(bytes[i], BOARD[i], `row 0 is the clue at ${i}`)
  const slots = Array.from({ length: SLOTS }, (_, s) => bytes[(1 + s) * 81 + i]!)
  const allowed = BOARD[i] ? [BOARD[i]!] : candidates(BOARD, i)
  for (const d of slots) assert(allowed.includes(d), `slot digit ${d} at ${i} is not a candidate`)
  for (const d of allowed) assert(slots.includes(d), `candidate ${d} at ${i} never shown`)
}

// Six slots are enough: no open cell has more candidates than slots.
for (let i = 0; i < 81; i++) assert(BOARD[i] || candidates(BOARD, i).length <= SLOTS)

console.log('sudoku: ok —', BOARD.filter((n) => !n).length, 'open cells, one solution, table', bytes.length, 'bytes')

// ---- the piercing. A hull on the deck at the panel's middle scrambles the
// bottom of the middle column and nothing at the top; one off the panel
// touches nothing; a touched cell holds, then settles in scan order.
{
  const strength = new Float32Array(81)
  const hitAt = new Float32Array(81)
  const out = new Uint8Array(81)
  assert.equal(pierce(PANEL.side, 0.3, 0, strength, hitAt), false, 'a hull beside the panel touches it')
  assert.ok(pierce(0, 0.26, 0, strength, hitAt), 'a hull on the deck at the middle touches nothing')
  // Cell 76 is the bottom row, column 4 — the middle; cell 4 the top of it.
  assert.equal(strength[76], 1, 'the cell in front of the hull is not fully scrambled')
  assert.equal(strength[4], 0, 'a cell above the rider is scrambled')
  assert.equal(strength[72], 0, 'a cell at the far corner is scrambled')
  // The capsule stands `h` off the hull's origin: 0.26 + 1.9 = 2.16 has
  // row 4 (centre 2.31) inside, row 3 (2.71) in the feather, row 2 (3.11) clear.
  assert.equal(strength[40], 1, 'the rider does not reach the middle row')
  assert.ok(strength[31]! > 0 && strength[31]! < 1, 'the row over his head is not feathered')
  assert.equal(strength[22], 0, 'the rider reaches two rows above his own height')
  // A cell just outside the radius is feathered, not cut.
  const soft = [...strength].filter((s) => s > 0 && s < 1).length
  assert.ok(soft >= 2, 'the hole has no soft edge')

  holes(0.5, strength, hitAt, out)
  assert.equal(out[76], 255, 'a touched cell is not rain straight away')
  holes(PIERCE.hold - 0.01, strength, hitAt, out)
  assert.equal(out[76], 255, 'a touched cell settles before its hold is up')
  const mid = PIERCE.hold + PIERCE.stagger * 76 / 81 + PIERCE.resettle / 2
  holes(mid, strength, hitAt, out)
  assert.ok(out[76]! > 60 && out[76]! < 200, `cell 76 is ${out[76]} of 255 halfway through settling`)
  // Scan order: a lower cell in the same column, hit at the same time, is
  // further along its settle than the one under it at every instant.
  assert.ok(out[67]! < out[76]!, 'the hole does not close in scan order')
  const done = PIERCE.hold + PIERCE.stagger + PIERCE.resettle + 0.01
  assert.equal(holes(done, strength, hitAt, out), false, 'the hole never closes')
  assert.ok(out.every((v) => v === 0) && strength.every((s) => s === 0), 'a closed hole left something behind')
  // Cell centres: 0 is top-left, 80 bottom-right, on the panel.
  assert.deepEqual(cellAt(0).map((v) => +v.toFixed(3)), [-1.6, 3.91])
  assert.deepEqual(cellAt(80).map((v) => +v.toFixed(3)), [1.6, 0.71])
}
console.log('sudoku: pierce ok')
