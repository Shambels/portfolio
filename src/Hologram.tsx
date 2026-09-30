import { useEffect, useRef, useState } from 'react'
import { BOARD, candidates, trace } from './sudoku'

/**
 * The sudoku's panel on the flat index's stage: the repository's puzzle,
 * projected into the empty square of light `tools/plate.py` cut out of the
 * generated picture. The picture brings the projector and the beam; the
 * digits are `src/sudoku.ts`'s board, the one the island's hologram draws,
 * because an image model cannot be trusted with a sudoku and this one is the
 * point.
 *
 * What it does, all of it off the puzzle:
 *
 * - **Arrives as rain.** Each time it comes on stage, digits fall through the
 *   panel and the cells settle out of it in the solver's own scan order —
 *   row-major, first empty cell first — the clues large and bright, the open
 *   cells small and dim and cycling through the candidates they have left,
 *   which is `possibleEntries` seen rather than counted.
 * - **Flickers.** Every few seconds, never on a beat: the light dips, a band
 *   of it tears sideways, the colour splits for a frame or two. The beam in
 *   the picture dips with it (`--flick` on the plate).
 * - **Breathes.** Faint rays over the beam turn slightly about the lens on a
 *   slow irregular pulse, and beads of light float up it to the cells whose
 *   digits change.
 * - **Is disturbed by the cursor.** A cell the pointer passes over goes back
 *   to rain and settles again a moment later, in scan order — the island's
 *   `pierce` and `holes`, with a pointer for a hull.
 * - **Solves on hover.** Held over for half a second, it replays `trace()` —
 *   the actual search, all 8,950 writes, every backtrack — slow enough at the
 *   start to watch it try, fast enough at the end to finish. Leave, and the
 *   solution fades back to the puzzle.
 *
 * Idle motion stops under `prefers-reduced-motion`: no rain, no flicker, no
 * cycling, no motes. Hover still solves — at once, not animated — because
 * that is an answer to something the visitor did, not motion for its own
 * sake. The loop runs only while the slide is on stage and on screen.
 *
 * With JS off, or before the script arrives, the SVG is the whole thing: the
 * grid and the 31 clues, standing still.
 */

/** Where the empty square is in the plate, in percent of its box — measured
 *  off `tools/art/sudoku-source.png` (175–1168 × 170–1107 of 1344 × 2016,
 *  cropped from row 120). Moves if the source is regenerated. */
export const PANEL = { left: 13.02, top: 2.88, width: 73.88, height: 53.99 }

// The plate is 900 × 1162; everything below is in its units.
const PLATE_W = 900
const PLATE_H = 1162
const PX = (PANEL.left / 100) * PLATE_W
const PY = (PANEL.top / 100) * PLATE_H
const PW = (PANEL.width / 100) * PLATE_W
const PH = (PANEL.height / 100) * PLATE_H
/** The grid: a square in the panel, clear of its corner ticks. */
const SIDE = 560
const GX = PX + (PW - SIDE) / 2
const GY = PY + (PH - SIDE) / 2
const CELL = SIDE / 9
/** The grid in plate units, for the case study's stage (`Backtrack.tsx`),
 *  which draws the same board into the same panel. */
export const GRID = { x: GX, y: GY, side: SIDE, cell: CELL, panel: [PX, PY, PW, PH] as const, plate: [PLATE_W, PLATE_H] as const }
/** The lens, where the beam's motes rise from. */
const LENS: [number, number] = [450, 940]

/** Every duration here is in milliseconds. */
const HOLO = {
  /** Rain alone, then the cells settle one by one across `settle`. */
  rain: 700,
  settle: 1500,
  /** A settling cell flares white for this long, then cools. */
  flare: 380,
  /** Between two flickers, at random in this range; how long one lasts. */
  flickEvery: [2400, 7000] as const,
  flickFor: [140, 420] as const,
  /** An open cell shows each candidate for this long. */
  cycle: 900,
  /** The pointer's reach, in cells, and how long a touched cell stays rain
   *  after the pointer has gone; the resettle is staggered by scan order. */
  reach: 0.8,
  hold: 350,
  stagger: 9,
  /** Held this long before it starts solving; the solve takes `solve`. */
  wait: 500,
  solve: 2100,
  /** The solution fading back to the puzzle, on leaving. */
  unsolve: 600,
  /** The beam: how bright a ray is at the top of its swell, how far the fan
   *  turns either way about the lens (radians — about 1.2 degrees), how long
   *  a bead takes to rise, how many are ever in the air, and the odds that a
   *  change in the panel sends one — at rest, on settling, while solving. */
  rayLit: 0.075,
  turn: 0.021,
  rise: [3800, 6200] as const,
  beads: 36,
  odds: { idle: 0.045, settle: 0.25, solve: 0.004 },
}

const MOVES = trace()
const STEPS = MOVES.length / 2
const CANDS = BOARD.map((n, i) => (n ? [] : candidates(BOARD, i)))

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const glyph = () => 1 + Math.floor(Math.random() * 9)

/** A digit drawn once per size and colour with its glow, then stamped. */
export function atlas(px: number, fill: string, glow: string, blur: number): HTMLCanvasElement {
  const pad = Math.ceil(blur * 2)
  const w = Math.ceil(px * 0.75) + pad * 2
  const h = Math.ceil(px * 1.1) + pad * 2
  const c = document.createElement('canvas')
  c.width = w * 9
  c.height = h
  const g = c.getContext('2d')!
  g.font = `500 ${px}px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillStyle = fill
  g.shadowColor = glow
  for (let pass = 0; pass < 2; pass++) {
    g.shadowBlur = pass ? blur * 0.35 : blur
    for (let d = 1; d <= 9; d++) g.fillText(String(d), w * (d - 1) + w / 2, h / 2 + px * 0.04)
  }
  return c
}

type Stamp = { img: HTMLCanvasElement; w: number; h: number }
const stamp = (img: HTMLCanvasElement): Stamp => ({ img, w: img.width / 9, h: img.height })

export function Hologram({ on }: { on: boolean; plate?: unknown }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)
  const onRef = useRef(on)
  onRef.current = on

  useEffect(() => {
    const cv = canvas.current
    const plate = cv?.parentElement
    if (!cv || !plate) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    setLive(true)
    const still = matchMedia('(prefers-reduced-motion: reduce)')

    // ---- sizing, and everything drawn once per size
    let k = 1 // canvas pixels per plate unit
    let clue: Stamp, solved: Stamp, trial: Stamp, rainS: Stamp, pencil: Stamp
    let grid: HTMLCanvasElement
    const buf = document.createElement('canvas')
    const b = buf.getContext('2d')!
    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      buf.width = cv.width
      buf.height = cv.height
      k = cv.width / PLATE_W
      const c = CELL * k
      clue = stamp(atlas(c * 0.6, '#e6fdff', '#1fd0ff', c * 0.16))
      solved = stamp(atlas(c * 0.54, '#5ccfff', '#0070ff', c * 0.1))
      trial = stamp(atlas(c * 0.56, '#ffffff', '#7fe8ff', c * 0.22))
      rainS = stamp(atlas(c * 0.42, '#5fe3ff', '#00a8ff', c * 0.12))
      pencil = stamp(atlas(c * 0.3, '#8fe4ff', '#00a0ff', c * 0.08))
      grid = document.createElement('canvas')
      grid.width = cv.width
      grid.height = cv.height
      const g = grid.getContext('2d')!
      g.scale(k, k)
      g.shadowColor = '#22ccff'
      for (let n = 0; n <= 9; n++) {
        const box = n % 3 === 0
        g.strokeStyle = box ? 'rgba(140,235,255,0.55)' : 'rgba(120,225,255,0.16)'
        g.lineWidth = box ? 1.6 : 0.8
        g.shadowBlur = (box ? 8 : 3) * k
        g.beginPath()
        g.moveTo(GX + n * CELL, GY)
        g.lineTo(GX + n * CELL, GY + SIDE)
        g.moveTo(GX, GY + n * CELL)
        g.lineTo(GX + SIDE, GY + n * CELL)
        g.stroke()
      }
      // Scanlines across the panel, every three units, too faint to count.
      g.shadowBlur = 0
      g.fillStyle = 'rgba(120,225,255,0.035)'
      for (let y = PY + 2; y < PY + PH - 2; y += 3) g.fillRect(PX + 2, y, PW - 4, 1)
      // Registration ticks at the cell corners of each box — the kind of
      // mark a projection carries and a drawing forgets.
      g.fillStyle = 'rgba(160,240,255,0.5)'
      g.shadowBlur = 4 * k
      for (let r = 0; r <= 9; r += 3)
        for (let q = 0; q <= 9; q += 3) g.fillRect(GX + q * CELL - 2, GY + r * CELL - 2, 4, 4)
    }
    size()

    // ---- state
    let arrived = performance.now()
    const settleAt = new Float64Array(81)
    const settled = new Uint8Array(81)
    const arrive = (now: number) => {
      arrived = now
      for (let i = 0; i < 81; i++) settleAt[i] = now + HOLO.rain + (i / 81) * HOLO.settle
      settled.fill(0)
    }
    arrive(arrived)

    const hitUntil = new Float64Array(81)
    const rainGlyph = new Uint8Array(81).map(glyph)
    type Drop = { x: number; y: number; v: number; len: number; g: Uint8Array; t: number }
    const COLS = 27
    const drops: Drop[] = Array.from({ length: COLS }, (_, c) => ({
      x: GX + (c + 0.5) * (SIDE / COLS),
      y: GY - rand(0, SIDE),
      v: rand(0.35, 0.75),
      len: 4 + Math.floor(rand(0, 7)),
      g: Uint8Array.from({ length: 12 }, glyph),
      t: 0,
    }))
    // The beam, alive — quietly. Sixteen faint rays over the picture's beam,
    // the whole fan turning a degree or so either way about the lens, and all
    // of it pulsing slowly and never on a beat: one shared swell made of three
    // clocks that never line up, and a little of each ray's own on top.
    // Beads of light float up it, slowly, each breathing as it goes: one for
    // some of the digits that change in the panel — a candidate turning over
    // at rest, a cell settling on arrival, a write while it solves — rising
    // from the lens to the foot of that cell's column and on up into it.
    // `energy` is how much has gone up lately; the lens warms with it.
    const RAYS = Array.from({ length: 16 }, (_, n) => ({
      x: PX + 24 + ((n + rand(-0.4, 0.4)) / 15) * (PW - 48),
      w: rand(6, 24),
      f: rand(0.00025, 0.0007),
      ph: rand(0, 7),
    }))
    type Bead = { i: number; t0: number; dur: number; ph: number; r: number }
    const beads: Bead[] = []
    let energy = 0
    const send = (i: number, now: number, odds = 1) => {
      if (beads.length >= HOLO.beads || Math.random() > odds) return
      beads.push({ i, t0: now, dur: rand(...HOLO.rise), ph: rand(0, 7), r: rand(1.6, 2.8) })
      energy = Math.min(energy + 0.05, 1)
    }
    // One soft bead, drawn once and stamped.
    const bead = document.createElement('canvas')
    bead.width = bead.height = 32
    {
      const g = bead.getContext('2d')!
      const r = g.createRadialGradient(16, 16, 0, 16, 16, 16)
      r.addColorStop(0, 'rgba(240,254,255,1)')
      r.addColorStop(0.25, 'rgba(170,240,255,0.75)')
      r.addColorStop(1, 'rgba(60,190,255,0)')
      g.fillStyle = r
      g.fillRect(0, 0, 32, 32)
    }
    const shown = new Int16Array(81).fill(-1)
    type Mote = { t: number; life: number; to: number; s: number }
    const motes: Mote[] = Array.from({ length: 26 }, () => ({ t: rand(0, 1), life: rand(3500, 7000), to: rand(-1, 1), s: rand(0.6, 1.6) }))

    let nextFlick = performance.now() + rand(...HOLO.flickEvery)
    let flickEnd = 0

    // Hover and the solve.
    let over = false
    let overSince = 0
    let solveFrom = 0
    let applied = 0
    let unsolveFrom = 0
    const board = BOARD.slice()
    const lastWrite = new Float64Array(81)

    const resetBoard = () => {
      for (let i = 0; i < 81; i++) board[i] = BOARD[i]!
      applied = 0
    }

    // ---- one frame
    let raf = 0
    let visible = true
    const frame = (now: number) => {
      raf = 0
      const quiet = still.matches
      const W = buf.width
      const H = buf.height
      b.setTransform(1, 0, 0, 1, 0, 0)
      b.clearRect(0, 0, W, H)
      b.globalCompositeOperation = 'lighter'
      b.drawImage(grid, 0, 0)
      b.setTransform(k, 0, 0, k, 0, 0)

      const put = (s: Stamp, d: number, x: number, y: number, a: number) => {
        if (a <= 0.01) return
        b.globalAlpha = Math.min(a, 1)
        b.drawImage(s.img, s.w * (d - 1), 0, s.w, s.h, x - s.w / (2 * k), y - s.h / (2 * k), s.w / k, s.h / k)
      }

      // The solve: move the replay on to where the clock says it is.
      let solving = false
      if (over && now - overSince > HOLO.wait) {
        if (!solveFrom) solveFrom = now
        const p = quiet ? 1 : Math.min((now - solveFrom) / HOLO.solve, 1)
        const target = Math.round(STEPS * p ** 2.4)
        while (applied < target) {
          const i = MOVES[applied * 2]!
          board[i] = MOVES[applied * 2 + 1]!
          lastWrite[i] = now
          applied++
          if (!quiet) send(i, now, HOLO.odds.solve)
        }
        solving = applied < STEPS
      }
      const fading = !over && unsolveFrom ? (quiet ? 0 : Math.max(1 - (now - unsolveFrom) / HOLO.unsolve, 0)) : 1
      if (!over && unsolveFrom && fading === 0) {
        unsolveFrom = 0
        resetBoard()
      }

      // The rays and the lens, under everything the panel draws.
      if (!quiet) {
        energy *= 0.985
        const footY = PY + PH - 4
        const swell =
          0.55 +
          0.22 * Math.sin(now * 0.00041) +
          0.14 * Math.sin(now * 0.00097 + 1.9) +
          0.09 * Math.sin(now * 0.0023 + 4.1)
        const turn = HOLO.turn * (Math.sin(now * 0.00017) * 0.7 + Math.sin(now * 0.00043 + 2.2) * 0.3)
        const cos = Math.cos(turn)
        const sin = Math.sin(turn)
        for (const r of RAYS) {
          const own = 0.5 + 0.5 * Math.sin(now * r.f + r.ph)
          const lit = HOLO.rayLit * swell * (0.45 + 0.55 * own)
          // The foot of the ray, turned about the lens.
          const dx = r.x - LENS[0]
          const dy = footY - LENS[1]
          const fx = LENS[0] + dx * cos - dy * sin
          const fy = LENS[1] + dx * sin + dy * cos
          const gr = b.createLinearGradient(LENS[0], LENS[1], fx, fy)
          gr.addColorStop(0, `rgba(190,245,255,${lit * 1.6})`)
          gr.addColorStop(0.55, `rgba(90,210,255,${lit * 0.7})`)
          gr.addColorStop(1, `rgba(60,190,255,${lit * 0.12})`)
          b.globalAlpha = 1
          b.fillStyle = gr
          b.beginPath()
          b.moveTo(LENS[0] - 2.5, LENS[1])
          b.lineTo(LENS[0] + 2.5, LENS[1])
          b.lineTo(fx + (r.w / 2) * cos, fy + (r.w / 2) * sin)
          b.lineTo(fx - (r.w / 2) * cos, fy - (r.w / 2) * sin)
          b.closePath()
          b.fill()
        }
        const glow = b.createRadialGradient(LENS[0], LENS[1] - 6, 0, LENS[0], LENS[1] - 6, 95)
        glow.addColorStop(0, `rgba(210,250,255,${0.1 + 0.1 * swell + 0.1 * energy})`)
        glow.addColorStop(1, 'rgba(60,190,255,0)')
        b.fillStyle = glow
        b.fillRect(LENS[0] - 100, LENS[1] - 106, 200, 200)
      }

      // Rain: thick on arrival, then thinning to nothing as the cells settle.
      const age = now - arrived
      const rainA = quiet ? 0 : age < HOLO.rain ? 1 : Math.max(1 - (age - HOLO.rain) / (HOLO.settle + 600), 0)
      if (rainA > 0) {
        for (const d of drops) {
          d.y += d.v * 16
          d.t += 16
          if (d.t > 70) {
            d.t = 0
            d.g[Math.floor(Math.random() * d.g.length)] = glyph()
          }
          if (d.y - d.len * CELL * 0.42 > GY + SIDE) {
            d.y = GY - rand(0, 120)
            d.v = rand(0.35, 0.75)
          }
          for (let n = 0; n < d.len; n++) {
            const y = d.y - n * CELL * 0.42
            if (y < GY || y > GY + SIDE) continue
            put(rainS, d.g[n % d.g.length]!, d.x, y, rainA * (n === 0 ? 1 : 0.75 * (1 - n / d.len)))
          }
        }
      }

      // The cells.
      for (let i = 0; i < 81; i++) {
        const x = GX + (i % 9) * CELL + CELL / 2
        const y = GY + Math.floor(i / 9) * CELL + CELL / 2
        const unsettled = !quiet && now < settleAt[i]!
        const hit = !quiet && now < hitUntil[i]!
        if (unsettled || hit) {
          if (Math.random() < 0.25) rainGlyph[i] = glyph()
          put(rainS, rainGlyph[i]!, x, y, 0.8)
          continue
        }
        if (!settled[i]) {
          settled[i] = 1
          if (!quiet) send(i, now, HOLO.odds.settle)
        }
        const flare = quiet ? 0 : Math.max(1 - (now - settleAt[i]!) / HOLO.flare, 0)
        if (BOARD[i]) {
          put(clue, BOARD[i]!, x, y, 1)
          if (flare) put(trial, BOARD[i]!, x, y, flare)
          continue
        }
        const n = board[i]!
        if (n && applied) {
          const fresh = quiet ? 0 : Math.max(1 - (now - lastWrite[i]!) / 220, 0)
          put(solved, n, x, y, 0.9 * fading)
          if (fresh && solving) put(trial, n, x, y, fresh)
          continue
        }
        // Open: its candidates, one at a time, each cell on its own phase.
        const c = CANDS[i]!
        const turn = Math.floor(now / HOLO.cycle + i * 0.37)
        const pick = quiet ? c[0]! : c[turn % c.length]!
        if (!quiet && shown[i] !== turn % 32768) {
          if (shown[i] >= 0) send(i, now, HOLO.odds.idle)
          shown[i] = turn % 32768
        }
        put(pencil, pick, x, y, 0.42 + flare * 0.5)
      }

      // The readout under the grid.
      b.globalAlpha = 0.75
      b.fillStyle = '#8fe8ff'
      b.font = '600 17px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
      b.textBaseline = 'top'
      b.textAlign = 'left'
      const label = applied
        ? `${applied === STEPS ? 'SOLVED' : MOVES[applied * 2 - 1] ? 'TRY' : 'BACKTRACK'}  ${applied.toLocaleString('en')} / ${STEPS.toLocaleString('en')}`
        : '31 CLUES · 50 OPEN'
      b.fillText(label, GX, GY + SIDE + 9)

      // Motes in the beam, from the lens to the panel's foot.
      if (!quiet) {
        for (const m of motes) {
          m.t += 16 / m.life
          if (m.t > 1) {
            m.t = 0
            m.to = rand(-1, 1)
          }
          const t = m.t
          const x = LENS[0] + (PW / 2) * m.to * t * 0.9
          const y = LENS[1] + (PY + PH - 6 - LENS[1]) * t
          b.globalAlpha = Math.sin(Math.PI * t) * 0.4
          b.fillStyle = '#bff6ff'
          b.beginPath()
          b.arc(x, y, m.s, 0, Math.PI * 2)
          b.fill()
        }
      }

      // The beads: up the beam to the foot of their column, then on up the
      // column to their cell, fading as they reach it, breathing all the way.
      if (!quiet) {
        const footY = PY + PH - 4
        for (let n = beads.length - 1; n >= 0; n--) {
          const q = beads[n]!
          const t = (now - q.t0) / q.dur
          if (t >= 1) {
            beads.splice(n, 1)
            continue
          }
          const cx = GX + (q.i % 9) * CELL + CELL / 2
          const cy = GY + Math.floor(q.i / 9) * CELL + CELL / 2
          let x: number
          let y: number
          if (t < 0.8) {
            const v = t / 0.8
            x = LENS[0] + (cx - LENS[0]) * v
            y = LENS[1] + (footY - LENS[1]) * v
          } else {
            const v = (t - 0.8) / 0.2
            x = cx
            y = footY + (cy - footY) * v
          }
          x += 2.2 * Math.sin(now * 0.0021 + q.ph)
          const beat = 0.5 + 0.5 * Math.sin(now * 0.0042 + q.ph)
          const fade = Math.min(t / 0.12, 1) * (t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2)
          const r = q.r * (0.8 + 0.45 * beat) * 3
          b.globalAlpha = fade * (0.28 + 0.3 * beat)
          b.drawImage(bead, x - r, y - r, r * 2, r * 2)
        }
      }

      // A slow band of brightness down the panel, once every few seconds.
      if (!quiet) {
        const band = ((now / 4200) % 1.4) - 0.2
        const by = PY + band * PH
        const gr = b.createLinearGradient(0, by - 40, 0, by + 40)
        gr.addColorStop(0, 'rgba(120,230,255,0)')
        gr.addColorStop(0.5, 'rgba(120,230,255,0.07)')
        gr.addColorStop(1, 'rgba(120,230,255,0)')
        b.globalAlpha = 1
        b.fillStyle = gr
        b.fillRect(PX, Math.max(by - 40, PY), PW, Math.min(80, PY + PH - (by - 40)))
      }

      // ---- out to the screen, flickering when it is time
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, W, H)
      let a = 1
      let tear: [number, number, number] | null = null
      if (!quiet) {
        if (now > nextFlick) {
          flickEnd = now + rand(...HOLO.flickFor)
          nextFlick = flickEnd + rand(...HOLO.flickEvery)
        }
        if (now < flickEnd) {
          a = Math.random() < 0.2 ? rand(0.08, 0.3) : rand(0.45, 0.95)
          if (Math.random() < 0.6) {
            const y0 = rand(PY, PY + PH - 60) * k
            tear = [y0, rand(12, 70) * k, rand(-14, 14) * k]
          }
          if (Math.random() < 0.7) cv.dataset.split = ''
          else delete cv.dataset.split
        } else {
          a = 0.94 + Math.random() * 0.06
          delete cv.dataset.split
        }
      }
      ctx.globalAlpha = a
      ctx.drawImage(buf, 0, 0)
      if (tear) {
        const [y0, h, dx] = tear
        ctx.clearRect(0, y0, W, h)
        ctx.drawImage(buf, 0, y0, W, h, dx, y0, W, h)
      }
      // The beam in the picture flickers with the panel, breathes on two slow
      // clocks of its own, and brightens with what it has carried lately.
      const breathe = 0.9 + 0.06 * Math.sin(now * 0.0013) + 0.04 * Math.sin(now * 0.0047 + 1.3)
      plate.style.setProperty(
        '--flick',
        String(quiet ? 1 : Math.min((0.55 + 0.45 * a) * breathe + 0.05 * energy, 1)),
      )

      const busy = !quiet || solving || (unsolveFrom && fading > 0)
      if (busy && onRef.current && visible) raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame)
    }

    // ---- the pointer
    const toPlate = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      return { x: ((e.clientX - r.left) / r.width) * PLATE_W, y: ((e.clientY - r.top) / r.height) * PLATE_H }
    }
    const inPanel = (p: { x: number; y: number }) => p.x > PX && p.x < PX + PW && p.y > PY && p.y < PY + PH
    const touch = (p: { x: number; y: number }, now: number) => {
      if (still.matches) return
      let first = -1
      for (let i = 0; i < 81; i++) {
        const x = GX + (i % 9) * CELL + CELL / 2
        const y = GY + Math.floor(i / 9) * CELL + CELL / 2
        if (Math.hypot(x - p.x, y - p.y) > HOLO.reach * CELL) continue
        if (first < 0) first = i
        hitUntil[i] = now + HOLO.hold + (i - first) * HOLO.stagger
      }
    }
    const enter = (now: number) => {
      if (over) return
      over = true
      overSince = now
      unsolveFrom = 0
      if (applied === 0) solveFrom = 0
    }
    const leave = (now: number) => {
      if (!over) return
      over = false
      if (applied) unsolveFrom = now
      solveFrom = 0
      kick()
    }
    const move = (e: PointerEvent) => {
      const p = toPlate(e)
      const now = performance.now()
      if (inPanel(p)) {
        enter(now)
        touch(p, now)
      } else leave(now)
      kick()
    }
    const out = () => leave(performance.now())
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerdown', move)
    cv.addEventListener('pointerleave', out)
    cv.addEventListener('pointercancel', out)

    // ---- when to run
    const ro = new ResizeObserver(() => {
      size()
      kick()
    })
    ro.observe(cv)
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting && document.visibilityState === 'visible'
      if (visible) kick()
    })
    io.observe(cv)
    const vis = () => {
      visible = document.visibilityState === 'visible'
      if (visible) kick()
    }
    document.addEventListener('visibilitychange', vis)
    still.addEventListener('change', kick)

    // Coming on stage: rain again. Leaving it: stop, and forget any solve.
    const arriveNow = () => {
      arrive(performance.now())
      nextFlick = performance.now() + rand(...HOLO.flickEvery)
      kick()
    }
    cv.addEventListener('holo:arrive', arriveNow)
    kick()

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', vis)
      still.removeEventListener('change', kick)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerdown', move)
      cv.removeEventListener('pointerleave', out)
      cv.removeEventListener('pointercancel', out)
      cv.removeEventListener('holo:arrive', arriveNow)
      resetBoard()
    }
  }, [])

  // Each arrival on stage starts the rain over.
  useEffect(() => {
    if (on) canvas.current?.dispatchEvent(new Event('holo:arrive'))
  }, [on])

  return (
    <>
      {!live && <Still />}
      <canvas ref={canvas} className="holo-live" />
    </>
  )
}

/** The panel with no script: the grid and the clues, standing still. */
export function Still() {
  const lines: string[] = []
  for (let n = 0; n <= 9; n++) {
    const o = n * CELL
    lines.push(`M${GX + o} ${GY}v${SIDE}M${GX} ${GY + o}h${SIDE}`)
  }
  return (
    <svg className="holo" viewBox={`0 0 ${PLATE_W} ${PLATE_H}`}>
      <path d={lines.join('')} />
      {BOARD.map((n, i) =>
        n ? (
          <text key={i} x={GX + (i % 9) * CELL + CELL / 2} y={GY + Math.floor(i / 9) * CELL + CELL / 2}>
            {n}
          </text>
        ) : null,
      )}
    </svg>
  )
}
