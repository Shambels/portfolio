// The Sudoku Solver's puzzle, as the hologram reads it.
//
// This is the one board hard-coded in `main()` of github.com/Shambels/sudoku,
// the 2019 repository the case study is about, transcribed row by row. The
// landmark used to compute its well depths from it in `tools/sudoku.py`; the
// hologram draws the puzzle itself, so the puzzle lives where the shader reads
// it. Pure arithmetic, no three, so `sudoku.check.ts` runs in node.
//
// `candidates()` is that repository's `possibleEntries`, ported a second time —
// the tray counted the set, the hologram cycles through it. `solve()` is the
// same backtracking search with the three defects the case study names taken
// out: it returns on success, the scan for the first empty cell stops at the
// first one, and it is a function that returns rather than one that paints.

export const PUZZLE =
  '008734160' +
  '100085000' +
  '700019000' +
  '003090000' +
  '020500913' +
  '900300007' +
  '006003801' +
  '300000020' +
  '000900340'

/** The board as 81 digits, row-major, 0 for an open cell. */
export const BOARD: readonly number[] = Array.from(PUZZLE, (c) => Number(c))

/** Digits cell `i` of `board` may still take — the repo's `possibleEntries`. */
export function candidates(board: readonly number[], i: number): number[] {
  const row = Math.floor(i / 9)
  const col = i % 9
  const seen = new Set<number>()
  for (let k = 0; k < 9; k++) {
    seen.add(board[row * 9 + k]!)
    seen.add(board[k * 9 + col]!)
  }
  const r0 = row - (row % 3)
  const c0 = col - (col % 3)
  for (let r = r0; r < r0 + 3; r++)
    for (let c = c0; c < c0 + 3; c++) seen.add(board[r * 9 + c]!)
  const out: number[] = []
  for (let n = 1; n <= 9; n++) if (!seen.has(n)) out.push(n)
  return out
}

/**
 * Backtracking, in the scan order the repository uses: first empty cell,
 * row-major. Fills `board` in place and returns the number of solutions it
 * found, stopping at `limit` — so `solve(b)` returns 1 with `b` solved, and
 * `solve(b, 2)` returning 1 is proof of uniqueness.
 */
export function solve(board: number[], limit = 1): number {
  const i = board.indexOf(0)
  if (i < 0) return 1
  let found = 0
  for (const n of candidates(board, i)) {
    board[i] = n
    found += solve(board, limit - found)
    if (found >= limit) return found
  }
  board[i] = 0
  return found
}

/** Rows of the shader's puzzle texture: the clue digit, then six flicker slots. */
export const SLOTS = 6

/**
 * The bytes of an 81 × (1 + SLOTS) texture, one column per cell, row-major
 * across the columns. Row 0 is the clue digit, 0 for an open cell. Rows
 * 1..SLOTS are what an open cell flickers through: its candidates, repeated
 * round until the six slots are full, so a cell with two candidates alternates
 * and a cell with six walks through all of them. A clue cell's slots hold its
 * digit, so the same lookup serves both.
 */
export function table(board: readonly number[] = BOARD): Uint8Array {
  const out = new Uint8Array(81 * (1 + SLOTS))
  for (let i = 0; i < 81; i++) {
    const clue = board[i]!
    const cycle = clue ? [clue] : candidates(board, i)
    out[i] = clue
    for (let s = 0; s < SLOTS; s++) out[(1 + s) * 81 + i] = cycle[s % cycle.length]!
  }
  return out
}
