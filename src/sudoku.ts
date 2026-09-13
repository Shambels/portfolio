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

// ------------------------------------------------------------ the piercing
// The panel is light, and the board rides straight through it. What that
// does to the picture is here rather than in the shader, because it is
// arithmetic worth an assert: which cells a hull passing through the plane
// touches, and how each one comes back.
//
// A touched cell is scrambled — back to rain — and stays so while the hull
// is in the plane and for `hold` seconds after; then it settles again over
// `resettle`, the cells in the solver's own scan order across `stagger`, so
// the hole closes the way the board first resolved. `Landmarks.tsx` runs
// `pierce` when the hull is within `reach` of the plane and `holes` every
// frame, and the shader takes the lesser of the scan settle and `1 - hole`.

/** The panel in the landmark's frame — `tools/sudoku.py`'s `PANEL`,
 *  `PANEL_Z` and `PANEL_FOOT`, and `HOLO` in `Landmarks.tsx`. Nine cells of
 *  `side / 9` each way, row 0 at the top, column 0 at -x. */
export const PANEL = { side: 3.6, z: -0.6, foot: 0.51 }

export const PIERCE = {
  /** The hull as it pierces: a standing capsule of this radius and height
   *  off the hull's origin — a man on a board, near enough, and a saucer
   *  through its middle. */
  r: 0.45,
  h: 1.9,
  /** How far off the plane, along the landmark's z, a hull is still in it:
   *  half the board's length, so the nose and the tail both count. */
  reach: 1.0,
  /** Seconds a cell stays rain after the last touch — short, so the board
   *  is already mending as the hull leaves it — seconds it takes to settle
   *  back, and how far the settle is spread over the scan order. */
  hold: 0.6,
  resettle: 1.5,
  stagger: 0.8,
  /** Past the radius, how far the edge of the hole is feathered. */
  soft: 0.3,
}

/** The centre of cell `i` (row-major, 81) in the panel's plane. */
export function cellAt(i: number): [number, number] {
  const c = PANEL.side / 9
  return [(i % 9 + 0.5) * c - PANEL.side / 2, PANEL.foot + PANEL.side - (Math.floor(i / 9) + 0.5) * c]
}

/**
 * A hull at `(x, y)` in the panel's plane, its origin at `y`: how hard it
 * touches each cell, 1 inside the capsule and feathering to 0 over `soft`
 * beyond it. Written into `strength` where it is more than what is there,
 * and `hitAt[i]` is stamped `now` for every cell touched at all. Returns
 * whether anything was.
 */
export function pierce(x: number, y: number, now: number, strength: Float32Array, hitAt: Float32Array): boolean {
  let any = false
  for (let i = 0; i < 81; i++) {
    const [cx, cy] = cellAt(i)
    const dy = cy - Math.min(Math.max(cy, y), y + PIERCE.h)
    const d = Math.hypot(cx - x, dy)
    if (d >= PIERCE.r + PIERCE.soft) continue
    const t = Math.min(Math.max((d - PIERCE.r) / PIERCE.soft, 0), 1)
    const s = 1 - t * t * (3 - 2 * t)
    if (s > strength[i]!) strength[i] = s
    hitAt[i] = now
    any = true
  }
  return any
}

/**
 * How scrambled each cell is at `now`, 0..255 for the shader's texture: its
 * strength for `hold` seconds after its last touch, then falling to 0 over
 * `resettle`, later by `stagger · i / 81` so the hole closes in scan order.
 * A cell that has settled has its strength cleared, so the next touch is a
 * fresh one. Returns whether any cell is still open.
 */
export function holes(now: number, strength: Float32Array, hitAt: Float32Array, out: Uint8Array): boolean {
  let any = false
  for (let i = 0; i < 81; i++) {
    const s = strength[i]!
    if (s === 0) { out[i] = 0; continue }
    const age = now - hitAt[i]!
    const k = Math.min(Math.max((PIERCE.hold + (PIERCE.stagger * i) / 81 + PIERCE.resettle - age) / PIERCE.resettle, 0), 1)
    const h = s * k
    out[i] = Math.round(h * 255)
    if (h > 0) any = true
    else strength[i] = 0
  }
  return any
}
