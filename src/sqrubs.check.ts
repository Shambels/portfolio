// What Sqrubs' stage has to be true for its numbers to be honest.
// `node src/sqrubs.check.ts`. The words are ENABLE's — `tools/moves.py`
// checks those, and ranks the moves; this checks the board, the premiums and
// the arithmetic, which is what the stage shows.

import assert from 'node:assert/strict'
import { BOARD, MOVES, RACK, TOTAL, onBoard, play, premium } from './sqrubs.ts'

// The standard board, square by square, against the folded rule.
const TW = [[0, 0], [0, 7], [0, 14], [7, 0], [7, 14], [14, 0], [14, 7], [14, 14]]
const TL = [[1, 5], [1, 9], [5, 1], [5, 5], [5, 9], [5, 13], [9, 1], [9, 5], [9, 9], [9, 13], [13, 5], [13, 9]]
const DL = [[0, 3], [0, 11], [2, 6], [2, 8], [3, 0], [3, 7], [3, 14], [6, 2], [6, 6], [6, 8], [6, 12], [7, 3], [7, 11], [8, 2], [8, 6], [8, 8], [8, 12], [11, 0], [11, 7], [11, 14], [12, 6], [12, 8], [14, 3], [14, 11]]
const count = { W3: 0, W2: 0, L3: 0, L2: 0 }
for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) { const p = premium(r, c); if (p) count[p]++ }
assert.deepEqual(count, { W3: 8, W2: 17, L3: 12, L2: 24 }, 'the standard board has 8, 17, 12 and 24')
for (const [r, c] of TW) assert.equal(premium(r!, c!), 'W3')
for (const [r, c] of TL) assert.equal(premium(r!, c!), 'L3')
for (const [r, c] of DL) assert.equal(premium(r!, c!), 'L2')
for (let i = 1; i <= 4; i++) for (const [r, c] of [[i, i], [i, 14 - i], [14 - i, i], [14 - i, 14 - i]]) assert.equal(premium(r!, c!), 'W2')
assert.equal(premium(7, 7), 'W2', 'the star')

// The board: 15 × 15, and every letter connected to the one on the star.
assert.equal(BOARD.length, 15)
for (const row of BOARD) assert.equal(row.length, 15)
assert.notEqual(BOARD[7]![7], '.', 'the first word covered the star')
const seen = new Set<string>()
const walk = (r: number, c: number) => {
  if (r < 0 || r > 14 || c < 0 || c > 14 || BOARD[r]![c] === '.' || seen.has(`${r},${c}`)) return
  seen.add(`${r},${c}`)
  walk(r + 1, c); walk(r - 1, c); walk(r, c + 1); walk(r, c - 1)
}
walk(7, 7)
const letters = BOARD.join('').replaceAll('.', '').length
assert.equal(seen.size, letters, 'a tile is not connected to the rest')

// Every move: fits, takes only what is on the rack, scores what it says, and
// makes the cross-words it says. The list is in order, best first.
assert.equal([...RACK].sort().join(''), 'AEINRST')
for (const m of MOVES) {
  const got = play(m)
  const rack = [...RACK]
  for (const t of got.placed) {
    const i = rack.indexOf(t.letter)
    assert(i >= 0, `${m.word} takes a ${t.letter} the rack has not got`)
    rack.splice(i, 1)
  }
  assert(got.placed.length > 0 && got.placed.length <= 7)
  assert.deepEqual(got.crosses, m.crosses, `${m.word} makes ${got.crosses}`)
  assert.equal(got.score, m.score, `${m.word} scores ${got.score}, not ${m.score}`)
}
for (let i = 1; i < MOVES.length; i++) {
  assert(MOVES[i]!.score < MOVES[i - 1]!.score, 'the moves are played best first')
  assert(MOVES[i]!.rank > MOVES[i - 1]!.rank)
}
assert.equal(MOVES[0]!.rank, 1)
assert.equal(MOVES[0]!.word, 'RETAINS', 'the move that was there')
assert(TOTAL > 1000)

// The grid lies in the plate, the far edge narrower than the near one.
const [tlx, tly] = onBoard(0, 0)
const [trx] = onBoard(15, 0)
const [brx, bry] = onBoard(15, 15)
const [blx] = onBoard(0, 15)
for (const v of [tlx, trx, brx, blx]) assert(v > 0 && v < 900)
assert(tly > 0 && bry < 1162 && bry > tly)
assert(trx - tlx < brx - blx, 'the board recedes')

console.log('sqrubs: ok —', MOVES.map((m) => `#${m.rank} ${m.word} ${m.score}`).join(', '), `of ${TOTAL}`)
