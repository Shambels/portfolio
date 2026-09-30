// Scrubble's position on the flat index's stage, as data and arithmetic: a
// mid-game board, the rack R E T A I N S, and four of the moves on it, with
// what each one scores under the standard board's premiums. Pure, no DOM,
// so `scrubble.check.ts` scores every move again in node.
//
// The position is real in the only sense that matters here: `tools/moves.py`
// generates every legal move on it against ENABLE — the public-domain
// tournament word list — the way Scrubble does (anchors, cross-checks,
// multipliers on new tiles only, fifty for a full rack), and there are 1,755.
// RETAINS down the right-hand edge, turning PEPPER into PEPPERS on a double
// word, is the best of them. The other three are chosen for what they show —
// an eight through the T of RAFT, SCREW grown at both ends, and the six a
// person would probably have played — and ranked where the list ranks them.
// Tied moves share a rank.

/** The board before the move, row by row: a letter, or `.` for an empty
 *  square. Nine words: HAZY, PAPER, SCREW, WASP, PEPPER, SCORE, FRY, GLAZE,
 *  RAFT. */
export const BOARD = [
  '...............',
  '...............',
  '...............',
  '...............',
  '...............',
  '.........F.....',
  '.......P.RAFT..',
  '......HAZY.....',
  '.......P.......',
  '.......E.......',
  '.....SCREW.....',
  '.....C...A.....',
  '.....O...S.....',
  '.....R.PEPPER..',
  '.GLAZE.........',
] as const

/** The rack as it sits, in the order it was drawn. */
export const RACK = 'NIARTSE'

/** How many legal moves `tools/moves.py` finds on this position. */
export const TOTAL = 1755

export type Move = {
  word: string
  row: number
  col: number
  dir: 'A' | 'D'
  score: number
  rank: number
  /** The words the move makes across it, besides its own. */
  crosses: string[]
}

/** The four the stage plays, in the order it plays them: best first. */
export const MOVES: Move[] = [
  { word: 'RETAINS', row: 7, col: 13, dir: 'D', score: 94, rank: 1, crosses: ['PEPPERS'] },
  { word: 'NITRATES', row: 1, col: 12, dir: 'D', score: 68, rank: 11, crosses: [] },
  { word: 'AIRSCREWS', row: 10, col: 2, dir: 'A', score: 56, rank: 20, crosses: [] },
  { word: 'TRAINS', row: 8, col: 13, dir: 'D', score: 42, rank: 23, crosses: ['PEPPERS'] },
]

export const POINTS: Record<string, number> = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1, M: 3,
  N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8, Y: 4, Z: 10,
}

/** The standard board's premium squares: `W3` triple word, `W2` double word
 *  (the centre star among them), `L3` triple letter, `L2` double letter. Read
 *  off the generated picture too — `docs/STATUS.md` has how — and it is this. */
export function premium(r: number, c: number): 'W3' | 'W2' | 'L3' | 'L2' | null {
  const R = Math.min(r, 14 - r)
  const C = Math.min(c, 14 - c)
  const [a, b] = R < C ? [R, C] : [C, R]
  if (a === 0 && (b === 0 || b === 7)) return 'W3'
  if (a === b && a >= 1 && a <= 4) return 'W2'
  if (a === 7 && b === 7) return 'W2'
  if ((a === 1 && b === 5) || (a === 5 && b === 5)) return 'L3'
  if ((a === 0 && b === 3) || (a === 2 && b === 6) || (a === 3 && b === 7) || (a === 6 && b === 6)) return 'L2'
  return null
}

const at = (r: number, c: number) => (r >= 0 && r < 15 && c >= 0 && c < 15 ? BOARD[r]![c]! : '.')

/**
 * Plays `m` on `BOARD`: which squares it fills from the rack, the words it
 * makes and what it scores — the main word with its premiums, every cross
 * word with the premium under its one new tile, and fifty if all seven go.
 * Throws if the word does not fit what is on the board or is not a whole
 * word (a letter touching either end).
 */
export function play(m: Move) {
  const [dr, dc] = m.dir === 'A' ? [0, 1] : [1, 0]
  const placed: { r: number; c: number; letter: string }[] = []
  if (at(m.row - dr, m.col - dc) !== '.') throw new Error(`${m.word}: a letter before it`)
  const endR = m.row + dr * m.word.length
  const endC = m.col + dc * m.word.length
  if (at(endR, endC) !== '.') throw new Error(`${m.word}: a letter after it`)
  let sum = 0
  let mult = 1
  for (let i = 0; i < m.word.length; i++) {
    const r = m.row + dr * i
    const c = m.col + dc * i
    const letter = m.word[i]!
    const there = at(r, c)
    let v = POINTS[letter]!
    if (there === '.') {
      placed.push({ r, c, letter })
      const p = premium(r, c)
      if (p === 'L2') v *= 2
      if (p === 'L3') v *= 3
      if (p === 'W2') mult *= 2
      if (p === 'W3') mult *= 3
    } else if (there !== letter) throw new Error(`${m.word}: ${letter} over ${there} at ${r},${c}`)
    sum += v
  }
  let score = sum * mult
  const crosses: string[] = []
  for (const t of placed) {
    // The word across the move through this tile, if it makes one.
    let r = t.r
    let c = t.c
    while (at(r - dc, c - dr) !== '.') [r, c] = [r - dc, c - dr]
    let word = ''
    let s = 0
    let wm = 1
    for (;; [r, c] = [r + dc, c + dr]) {
      const isNew = r === t.r && c === t.c
      const letter = isNew ? t.letter : at(r, c)
      if (letter === '.') break
      let v = POINTS[letter]!
      if (isNew) {
        const p = premium(r, c)
        if (p === 'L2') v *= 2
        if (p === 'L3') v *= 3
        if (p === 'W2') wm *= 2
        if (p === 'W3') wm *= 3
      }
      word += letter
      s += v
    }
    if (word.length > 1) {
      crosses.push(word)
      score += s * wm
    }
  }
  if (placed.length === 7) score += 50
  return { placed, crosses, score }
}

// ---- where it all is in the plate (900 × 1162, `tools/plate.py`, `scrubble`)

/** The board's grid in the plate: a projective map from (column, row), in
 *  squares from the grid's top-left corner, to plate units — fitted to the
 *  eight triple-word squares' centres in the generated picture, within 3 px. */
export const GRID = [
  35.173831, -8.179776, 175.152478, -0.616325, 11.73448, 315.166191, -0.001206, -0.018632, 1,
] as const

export function onBoard(u: number, v: number): [number, number] {
  const [a, b, c, d, e, f, g, h, i] = GRID
  const w = g * u + h * v + i
  return [(a * u + b * v + c) / w, (d * u + e * v + f) / w]
}

/** The rack: the line its tiles stand on, the two ends of its groove, and the
 *  strip of its front lip that is drawn back over their feet. */
export const RACK_AT = { y: 880, x0: 60, x1: 818, lip: [870, 922] as const }
