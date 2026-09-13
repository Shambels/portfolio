// What the hologram's puzzle has to be true for the shader to be honest.
// `node src/sudoku.check.ts`.
//
// Runs in node with no three: the board, the candidates, the fixed solver,
// and the bytes the shader samples.

import assert from 'node:assert/strict'
import { BOARD, PUZZLE, SLOTS, candidates, solve, table } from './sudoku.ts'

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
