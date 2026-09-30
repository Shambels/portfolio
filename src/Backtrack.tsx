import { useEffect, useRef, useState } from 'react'
import type { Plate } from './content'
import { GRID, Still, atlas } from './Hologram'
import type { Locale } from './i18n'
import { BOARD, candidates, conflicts, enumerate, trace } from './sudoku'

/**
 * The Sudoku Solver's case study, staged: the index's projector beside the
 * prose, and the reading scroll is the search. Eight acts, one per section —
 * each spread over its whole section rather than a band of its heading,
 * because this page's sections run from one paragraph to eight, and the
 * third splits again at its three bold defects.
 *
 * 1. **The problem** — one cell's row, column and box light, then what is left
 *    for it, then what is left for every open cell: the board telling you
 *    what you may not do.
 * 2. **What I chose** — scroll is `trace()`: the search itself, all 8,950
 *    writes in order, and scrolling back up takes them back.
 * 3. **What it got wrong** — the 2019 search reaching the full board and
 *    carrying on (`enumerate()`: 3,742 more writes, every one of them taking
 *    a digit back, until the puzzle is empty again); the JavaScript's scan
 *    passing the first empty cell and keeping the last; "Wait for It…",
 *    written into a page that never paints it.
 * 4. **What it cost** — 162 elements typed by hand, counted onto the grid.
 * 5. **Going back to it** — the fixed search, stopping at `return true`, and
 *    the board as the 81 characters `parseBoard` reads.
 * 6. **Reading a puzzle from a photo** — a photographed grid rectified into
 *    the panel, its lines found, its digits read, two of them amber.
 * 7. **What the photographs taught me** — a read that is confident nonsense,
 *    its 21 conflicts, refused; four corners placed by hand.
 * 8. **The outcome** — the solved board, standing.
 *
 * The one stage with a script, because it scrubs 8,950 moves: the acts follow
 * the page's own geometry (a section is read from when its heading crosses
 * `LINE` of the window to when the next one does) and the panel is drawn only
 * when the scroll moves. Nothing moves on its own. Under reduced motion it is
 * the last act, standing; with no script, the index's panel, standing
 * (`Still`). The words in the box above are per locale (`WORDS`); the prose
 * beside it says all of this in full.
 */
export function Backtrack({ plate, locale }: { plate: Plate; locale: Locale }) {
  const figure = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const photo = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)
  const t = WORDS[locale]

  useEffect(() => {
    const fig = figure.current
    const cv = canvas.current
    const ph = photo.current
    const prose = fig?.parentElement?.querySelector<HTMLElement>('.prose')
    const ctx = cv?.getContext('2d')
    const pc = ph?.getContext('2d')
    if (!fig || !cv || !ph || !prose || !ctx || !pc) return
    setLive(true)
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    const fmt = new Intl.NumberFormat(locale)
    const cards = new Map([...fig.querySelectorAll<HTMLElement>('.card')].map((c) => [c.dataset.card!, c]))
    const counters = new Map([...fig.querySelectorAll<HTMLElement>('[data-n]')].map((c) => [c.dataset.n!, c]))

    // ---- where the acts are on the page
    const heads = [...prose.querySelectorAll<HTMLElement>(':scope > h2')]
    const end = prose.querySelector<HTMLElement>('.back') ?? prose
    // The defects in "What it got wrong": its paragraphs that open in bold.
    const wrong = heads[2]
    const defects: HTMLElement[] = []
    for (let n = wrong?.nextElementSibling; n && n !== heads[3]; n = n.nextElementSibling)
      if (n.tagName === 'P' && n.firstElementChild?.tagName === 'STRONG' && n.firstChild === n.firstElementChild)
        defects.push(n as HTMLElement)

    const read = () => {
      const line = innerHeight * LINE
      // Nothing below this can ever reach the line: the page ends first. So
      // the last act finishes at the foot of the page rather than never.
      const reach = line + (document.documentElement.scrollHeight - innerHeight - scrollY)
      const y = (e: Element) => Math.min(e.getBoundingClientRect().top, reach)
      const span = (a: number, b: number) => (b <= a ? (line >= a ? 1 : 0) : clamp((line - a) / (b - a)))
      const marks = [...heads.map(y), y(end)]
      let act = -1
      for (let k = 0; k < heads.length; k++) if (line >= marks[k]!) act = k
      const p = act < 0 ? 0 : span(marks[act]!, marks[act + 1]!)
      // Inside the third: before the first defect, then one part per defect.
      let sub = -1
      let q = 0
      if (act === 2 && defects.length >= 3) {
        const d = [...defects.slice(0, 3).map(y), marks[3]!]
        for (let k = 0; k < 3; k++) if (line >= d[k]!) sub = k
        q = sub < 0 ? 0 : span(d[sub]!, d[sub + 1]!)
      } else if (act === 2) {
        sub = Math.min(Math.floor(p * 3), 2)
        q = p * 3 - sub
      }
      return { act, p, sub, q }
    }

    // ---- sizing, and what is drawn once per size
    const [W] = GRID.plate
    const { x: GX, y: GY, side: SIDE, cell: C } = GRID
    const [PX, PY, PW, PH] = GRID.panel
    let k = 1
    let st: Record<'clue' | 'solved' | 'trial' | 'pencil' | 'amber' | 'red', Stamp>
    let grid: HTMLCanvasElement
    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      k = cv.width / W
      const c = C * k
      st = {
        clue: stamp(atlas(c * 0.6, '#e6fdff', '#1fd0ff', c * 0.16)),
        solved: stamp(atlas(c * 0.54, '#5ccfff', '#0070ff', c * 0.1)),
        trial: stamp(atlas(c * 0.56, '#ffffff', '#7fe8ff', c * 0.22)),
        pencil: stamp(atlas(c * 0.26, '#8fe4ff', '#00a0ff', c * 0.06)),
        amber: stamp(atlas(c * 0.6, '#ffe6b0', '#ff9d1f', c * 0.18)),
        red: stamp(atlas(c * 0.58, '#ffd0d0', '#ff3b3b', c * 0.18)),
      }
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
        g.moveTo(GX + n * C, GY)
        g.lineTo(GX + n * C, GY + SIDE)
        g.moveTo(GX, GY + n * C)
        g.lineTo(GX + SIDE, GY + n * C)
        g.stroke()
      }
      g.shadowBlur = 0
      g.fillStyle = 'rgba(120,225,255,0.035)'
      for (let yy = PY + 2; yy < PY + PH - 2; yy += 3) g.fillRect(PX + 2, yy, PW - 4, 1)
      paper()
    }

    // The photograph: the same puzzle printed on newsprint, drawn once, and
    // held in its own element so that CSS can tilt it in perspective — which a
    // 2D canvas cannot — while the read is drawn over it, square, on the panel.
    const paper = () => {
      // Its layout box, not its bounding box: the latter is the tilted one.
      const dpr = Math.min(devicePixelRatio || 1, 2)
      ph.width = Math.max(1, Math.round(ph.offsetWidth * dpr))
      ph.height = Math.max(1, Math.round(ph.offsetHeight * dpr))
      const s = ph.width / SIDE
      pc.setTransform(s, 0, 0, s, 0, 0)
      const bg = pc.createLinearGradient(0, 0, SIDE, SIDE)
      bg.addColorStop(0, '#e9e3d3')
      bg.addColorStop(0.6, '#ddd5c1')
      bg.addColorStop(1, '#c9bfa8')
      pc.fillStyle = bg
      pc.fillRect(0, 0, SIDE, SIDE)
      // A fold across it, and the grain of cheap paper.
      pc.fillStyle = 'rgba(0,0,0,0.07)'
      pc.fillRect(0, SIDE * 0.52, SIDE, 3)
      let seed = 7
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
      pc.fillStyle = 'rgba(60,50,30,0.05)'
      for (let n = 0; n < 900; n++) pc.fillRect(rnd() * SIDE, rnd() * SIDE, 1.2, 1.2)
      pc.strokeStyle = '#2b2721'
      for (let n = 0; n <= 9; n++) {
        pc.lineWidth = n % 3 === 0 ? 3.2 : 1.1
        const wob = () => (rnd() - 0.5) * 2.2
        pc.beginPath()
        pc.moveTo(n * C + wob(), 0)
        pc.lineTo(n * C + wob(), SIDE)
        pc.moveTo(0, n * C + wob())
        pc.lineTo(SIDE, n * C + wob())
        pc.stroke()
      }
      pc.fillStyle = '#26221c'
      pc.font = `600 ${C * 0.62}px Georgia, "Times New Roman", serif`
      pc.textAlign = 'center'
      pc.textBaseline = 'middle'
      for (let i = 0; i < 81; i++) {
        if (!BOARD[i]) continue
        pc.save()
        pc.translate((i % 9) * C + C / 2 + (rnd() - 0.5) * 3, Math.floor(i / 9) * C + C / 2 + 2 + (rnd() - 0.5) * 3)
        pc.rotate((rnd() - 0.5) * 0.12)
        pc.fillText(String(BOARD[i]), 0, 0)
        pc.restore()
      }
    }
    size()

    // ---- drawing
    const at = (i: number): [number, number] => [GX + (i % 9) * C + C / 2, GY + Math.floor(i / 9) * C + C / 2]
    const put = (s: Stamp, d: number, i: number, a = 1, dx = 0, dy = 0) => {
      if (a <= 0.01 || d < 1) return
      const [x, y] = at(i)
      ctx.globalAlpha = Math.min(a, 1)
      ctx.drawImage(s.img, s.w * (d - 1), 0, s.w, s.h, x + dx - s.w / (2 * k), y + dy - s.h / (2 * k), s.w / k, s.h / k)
    }
    const fill = (i: number, style: string, a: number) => {
      if (a <= 0.01) return
      ctx.globalAlpha = Math.min(a, 1)
      ctx.fillStyle = style
      ctx.fillRect(GX + (i % 9) * C + 1.5, GY + Math.floor(i / 9) * C + 1.5, C - 3, C - 3)
    }
    const ring = (i: number, style: string, a: number, w = 3) => {
      if (a <= 0.01) return
      ctx.globalAlpha = Math.min(a, 1)
      ctx.strokeStyle = style
      ctx.lineWidth = w
      ctx.shadowColor = style
      ctx.shadowBlur = 10 * k
      ctx.strokeRect(GX + (i % 9) * C + 3, GY + Math.floor(i / 9) * C + 3, C - 6, C - 6)
      ctx.shadowBlur = 0
    }
    const pencil = (i: number, board: readonly number[], a: number) => {
      for (const d of candidates(board, i)) put(st.pencil, d, i, a, (((d - 1) % 3) - 1) * C * 0.29, (Math.floor((d - 1) / 3) - 1) * C * 0.29)
    }
    const clues = (a = 1, except?: Set<number>) => {
      for (let i = 0; i < 81; i++) if (BOARD[i] && !except?.has(i)) put(st.clue, BOARD[i]!, i, a)
    }
    const filled = (board: readonly number[], a = 1) => {
      for (let i = 0; i < 81; i++) if (!BOARD[i] && board[i]) put(st.solved, board[i]!, i, a)
    }
    const text = (s: string, x: number, y: number, px: number, style: string, a: number, align: CanvasTextAlign = 'center') => {
      if (a <= 0.01) return
      ctx.globalAlpha = Math.min(a, 1)
      ctx.fillStyle = style
      ctx.shadowColor = style
      ctx.shadowBlur = 8 * k
      ctx.font = `500 ${px}px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`
      ctx.textAlign = align
      ctx.textBaseline = 'middle'
      ctx.fillText(s, x, y)
      ctx.shadowBlur = 0
    }
    /** The board as the 81 characters `parseBoard` reads, under the grid. */
    const ribbon = (board: readonly number[], a: number) => {
      const step = SIDE / 81
      for (let i = 0; i < 81; i++) {
        const d = board[i]!
        text(String(d), GX + (i + 0.5) * step, GY + SIDE + 17, step * 1.45, BOARD[i] ? '#e6fdff' : d ? '#5ccfff' : '#3f7f96', a)
      }
    }
    /** Replay the first `n` moves of `moves` onto the puzzle. */
    const replay = (moves: Uint8Array, n: number) => {
      const b = BOARD.slice()
      let last = -1
      let back = 0
      for (let m = 0; m < n; m++) {
        last = moves[2 * m]!
        const d = moves[2 * m + 1]!
        b[last] = d
        if (!d) back++
      }
      return { b, last, back }
    }

    let photoWas = ''
    const setPhoto = (opacity: number, transform: string) => {
      const key = opacity + transform
      if (key === photoWas) return
      photoWas = key
      ph.style.opacity = String(opacity)
      ph.style.transform = transform
    }
    // The markup shows the outcome's card, for a page with no script.
    let card = 'outcome'
    const show = (name: string) => {
      if (name === card) return
      cards.get(card)?.removeAttribute('data-on')
      cards.get(name)?.setAttribute('data-on', '')
      card = name
    }
    const count = (name: string, n: number) => {
      const el = counters.get(name)
      const s = fmt.format(n)
      if (el && el.textContent !== s) el.textContent = s
    }

    const draw = () => {
      const quiet = still.matches
      const { act, p, sub, q } = quiet ? { act: 7, p: 1, sub: -1, q: 0 } : read()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.globalCompositeOperation = 'source-over'
      let gridA = 1
      let photoA = 0
      let tilt = 1
      // Everything is drawn in plate units; the grid bitmap is already scaled.
      const scene = () => {
        ctx.setTransform(k, 0, 0, k, 0, 0)
        if (act < 0) {
          show('outcome')
          clues()
        } else if (act === 0) {
          show('problem')
          // Cell 1: its row, its column, its box, then what is left for it,
          // then what is left for every open cell.
          const row = clamp(p / 0.22)
          const col = clamp((p - 0.22) / 0.22)
          const box = clamp((p - 0.44) / 0.22)
          for (let n = 0; n < 9; n++) {
            fill(n, '#29c8ff', 0.12 * clamp(row * 9 - n))
            fill(n * 9, '#29c8ff', 0.12 * clamp(col * 9 - n))
            fill(Math.floor(n / 3) * 9 + (n % 3), '#29c8ff', 0.12 * clamp(box * 9 - n))
          }
          const lit = new Set<number>()
          for (let n = 0; n < 9; n++) {
            if (row * 9 > n) lit.add(n)
            if (col * 9 > n) lit.add(n * 9)
            if (box * 9 > n) lit.add(Math.floor(n / 3) * 9 + (n % 3))
          }
          clues(0.55, lit)
          for (const i of lit) if (BOARD[i]) put(st.trial, BOARD[i]!, i)
          ring(0, '#e9a851', clamp(p / 0.06))
          pencil(0, BOARD, clamp((p - 0.66) / 0.08))
          const open = clamp((p - 0.76) / 0.22) * 50
          let seen = 0
          for (let i = 1; i < 81; i++) if (!BOARD[i]) pencil(i, BOARD, clamp(open - seen++))
        } else if (act === 1) {
          show('chose')
          const n = Math.round(STEPS * p ** 2.2)
          const { b, last, back } = replay(MOVES, n)
          count('move', n)
          count('back', back)
          if (last >= 0 && n < STEPS) fill(last, '#29c8ff', 0.2)
          clues()
          filled(b)
          if (last >= 0 && n < STEPS && b[last]) put(st.trial, b[last]!, last)
        } else if (act === 2 && sub < 0) {
          show('won')
          count('after', 0)
          clues()
          filled(SOLVED)
        } else if (act === 2 && sub === 0) {
          show('won')
          const n = WON + Math.round((ENUM.length / 2 - WON) * q ** 1.3)
          const { b, last } = replay(ENUM, n)
          count('after', n - WON)
          // The frame goes red the moment it passes the full board.
          ctx.globalAlpha = 0.6 * clamp(q / 0.04) * (1 - clamp((q - 0.85) / 0.15))
          ctx.strokeStyle = '#ff5a5a'
          ctx.lineWidth = 3
          ctx.strokeRect(GX - 4, GY - 4, SIDE + 8, SIDE + 8)
          if (last >= 0 && q < 1) fill(last, '#ff5a5a', 0.18)
          clues()
          filled(b)
        } else if (act === 2 && sub === 1) {
          show('scan')
          // The scan, row by row: it passes the first empty cell, and every
          // empty cell after it overwrites the one it had, to the last.
          const pos = clamp(q / 0.8) * 81
          clues()
          for (let i = 0; i < 81; i++) {
            if (BOARD[i] || pos <= i) continue
            fill(i, '#e9a851', 0.08)
          }
          const c = Math.min(Math.floor(pos), 80)
          if (q < 0.8) fill(c, '#ffffff', 0.22)
          ring(0, '#e9a851', clamp(pos))
          ring(FIRST_LAST[1], '#ff5a5a', clamp((q - 0.8) / 0.06))
        } else if (act === 2) {
          show('block')
          clues()
          const a = clamp(q / 0.3)
          ctx.globalAlpha = 0.55 * a
          ctx.fillStyle = '#05080a'
          ctx.fillRect(PX, PY, PW, PH)
          text('Wait for It…', PX + PW / 2, PY + PH / 2 - 10, 36, '#8fe4ff', 0.45 * a)
          ctx.globalAlpha = 0.45 * a
          ctx.strokeStyle = '#8fe4ff'
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.moveTo(PX + PW / 2 - 140, PY + PH / 2 - 8)
          ctx.lineTo(PX + PW / 2 + 140, PY + PH / 2 - 8)
          ctx.stroke()
          // A spinner, stopped: the tab is not answering.
          ctx.lineWidth = 4
          ctx.beginPath()
          ctx.arc(PX + PW / 2, PY + PH / 2 + 60, 16, -1.2, 2.4)
          ctx.stroke()
        } else if (act === 3) {
          show('cost')
          const n = Math.round(162 * clamp(p / 0.9))
          count('typed', n)
          clues()
          ctx.font = '500 11px ui-monospace, SFMono-Regular, Menlo, monospace'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          for (let i = 0; i < Math.min(n, 81); i++) {
            ctx.globalAlpha = 0.55
            ctx.strokeStyle = '#8fe4ff'
            ctx.lineWidth = 1
            ctx.strokeRect(GX + (i % 9) * C + 4, GY + Math.floor(i / 9) * C + 4, C - 8, C - 8)
            ctx.fillStyle = '#8fe4ff'
            ctx.fillText(String(i + 1), GX + (i % 9) * C + 7, GY + Math.floor(i / 9) * C + 7)
          }
          for (let i = 0; i < Math.max(n - 81, 0); i++) {
            ctx.globalAlpha = 0.8
            ctx.fillStyle = '#e9a851'
            ctx.fillRect(GX + (i % 9) * C + C - 15, GY + Math.floor(i / 9) * C + C - 15, 8, 8)
          }
        } else if (act === 4) {
          show('back')
          const r = clamp(p / 0.6)
          const n = Math.round(STEPS * r ** 1.6)
          const { b, last } = replay(MOVES, n)
          clues()
          filled(b)
          if (n < STEPS && last >= 0 && b[last]) put(st.trial, b[last]!, last)
          // `return true`: the frame, gold, once — and the board holds.
          const done = clamp((p - 0.6) / 0.06)
          ctx.globalAlpha = done * (1 - 0.6 * clamp((p - 0.7) / 0.15))
          ctx.strokeStyle = '#e9a851'
          ctx.shadowColor = '#e9a851'
          ctx.shadowBlur = 14 * k
          ctx.lineWidth = 3
          ctx.strokeRect(GX - 4, GY - 4, SIDE + 8, SIDE + 8)
          ctx.shadowBlur = 0
          ribbon(b, clamp(p / 0.1))
        } else if (act === 5) {
          show('photo')
          // In, tilted as a phone sees a newspaper; rectified; its lines
          // found; its digits read in scan order, two of them unsure.
          const inn = clamp(p / 0.12)
          const rect = ease(clamp((p - 0.12) / 0.33))
          const lines = clamp((p - 0.45) / 0.13)
          const readN = clamp((p - 0.58) / 0.3) * CLUES.length
          const out = clamp((p - 0.9) / 0.1)
          gridA = 1 - inn + out
          photoA = inn * (1 - out)
          tilt = 1 - rect
          ctx.globalAlpha = lines * (1 - out)
          ctx.strokeStyle = '#29c8ff'
          ctx.shadowColor = '#29c8ff'
          ctx.shadowBlur = 8 * k
          ctx.lineWidth = 2
          for (let n = 0; n <= 9; n++) {
            const reach = clamp(lines * 10 - n)
            ctx.beginPath()
            ctx.moveTo(GX + n * C, GY)
            ctx.lineTo(GX + n * C, GY + SIDE * reach)
            ctx.moveTo(GX, GY + n * C)
            ctx.lineTo(GX + SIDE * reach, GY + n * C)
            ctx.stroke()
          }
          ctx.shadowBlur = 0
          CLUES.forEach((i, n) => {
            const a = clamp(readN - n)
            if (!a) return
            const unsure = UNSURE.includes(i)
            fill(i, unsure ? '#ff9d1f' : '#29c8ff', a * (unsure ? 0.28 : 0.14))
            put(unsure ? st.amber : st.clue, BOARD[i]!, i, a)
          })
        } else if (act === 6) {
          show('refused')
          const inn = clamp(p / 0.3) * NONSENSE.order.length
          const conf = clamp((p - 0.3) / 0.15)
          const stampA = clamp((p - 0.45) / 0.12)
          const corners = clamp((p - 0.6) / 0.2)
          const back = clamp((p - 0.82) / 0.18)
          count('conf', NONSENSE.bad.size)
          NONSENSE.order.forEach((i, n) => {
            const a = clamp(inn - n) * (1 - back)
            const bad = NONSENSE.bad.has(i)
            fill(i, '#ff3b3b', a * conf * (bad ? 0.3 : 0))
            put(bad && conf > 0.5 ? st.red : st.trial, NONSENSE.board[i]!, i, a)
          })
          ctx.save()
          ctx.translate(PX + PW / 2, PY + PH / 2)
          ctx.rotate(-0.14)
          ctx.globalAlpha = stampA * (1 - back)
          ctx.strokeStyle = '#ff6b6b'
          ctx.lineWidth = 5
          ctx.shadowColor = '#ff3b3b'
          ctx.shadowBlur = 16 * k
          ctx.strokeRect(-190, -46, 380, 92)
          ctx.fillStyle = '#ffb0b0'
          ctx.font = '700 58px ui-monospace, SFMono-Regular, Menlo, monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(t.refusedStamp, 0, 4)
          ctx.restore()
          // Four clicks, one per corner.
          const L = 34
          const cs: [number, number, number, number][] = [
            [GX, GY, 1, 1],
            [GX + SIDE, GY, -1, 1],
            [GX + SIDE, GY + SIDE, -1, -1],
            [GX, GY + SIDE, 1, -1],
          ]
          cs.forEach(([x, y, sx, sy], n) => {
            const a = clamp(corners * 4 - n) * (1 - back * 0.7)
            if (a <= 0) return
            ctx.globalAlpha = a
            ctx.strokeStyle = '#e9a851'
            ctx.shadowColor = '#e9a851'
            ctx.shadowBlur = 10 * k
            ctx.lineWidth = 5
            ctx.beginPath()
            ctx.moveTo(x + sx * L, y)
            ctx.lineTo(x, y)
            ctx.lineTo(x, y + sy * L)
            ctx.stroke()
            ctx.shadowBlur = 0
          })
          clues(back)
        } else {
          show('outcome')
          clues()
          filled(SOLVED, clamp(p / 0.4))
        }
      }
      scene()
      // The grid under it all, at whatever strength the photograph left it.
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'destination-over'
      ctx.globalAlpha = clamp(gridA)
      ctx.drawImage(grid, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      setPhoto(
        photoA > 0.001 ? +photoA.toFixed(3) : 0,
        `perspective(900px) rotateX(${(34 * tilt).toFixed(2)}deg) rotateZ(${(-13 * tilt).toFixed(2)}deg) scale(${(1 - 0.2 * tilt).toFixed(3)})`,
      )
    }

    let raf = 0
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), draw()))
    }
    const ro = new ResizeObserver(() => {
      size()
      kick()
    })
    ro.observe(cv)
    addEventListener('scroll', kick, { passive: true })
    addEventListener('resize', kick)
    still.addEventListener('change', kick)
    kick()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      removeEventListener('scroll', kick)
      removeEventListener('resize', kick)
      still.removeEventListener('change', kick)
    }
  }, [locale])

  return (
    <figure className="pinned backtrack" aria-hidden="true" ref={figure}>
      <div className="slot">
        {(Object.keys(t.cards) as (keyof Words['cards'])[]).map((key) => (
          <div key={key} className="card" data-card={key} data-on={key === 'outcome' ? '' : undefined}>
            {t.cards[key].map((line, n) => (
              <p key={n} className={n ? 'sub' : undefined}>
                {line.split(/\{(\w+)\}/).map((part, j) => (j % 2 ? <b key={j} data-n={part}>0</b> : part))}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div className="depth">
        <div className="plate">
          {plate.base && <img src={plate.base} alt="" decoding="async" />}
          {plate.light && <img className="light" src={plate.light} alt="" decoding="async" />}
          {!live && <Still />}
          <canvas
            ref={photo}
            className="photo"
            style={{
              left: `${(GRID.x / GRID.plate[0]) * 100}%`,
              top: `${(GRID.y / GRID.plate[1]) * 100}%`,
              width: `${(GRID.side / GRID.plate[0]) * 100}%`,
              height: `${(GRID.side / GRID.plate[1]) * 100}%`,
            }}
          />
          <canvas ref={canvas} className="holo-live" />
        </div>
      </div>
    </figure>
  )
}

/** Where on the window a section counts as being read: its heading has
 *  crossed this far down, and the next one has not. */
const LINE = 0.6

type Stamp = { img: HTMLCanvasElement; w: number; h: number }
const stamp = (img: HTMLCanvasElement): Stamp => ({ img, w: img.width / 9, h: img.height })
const clamp = (v: number) => Math.min(Math.max(v, 0), 1)
const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2)

const MOVES = trace()
const STEPS = MOVES.length / 2
const { moves: ENUM, won: WON } = enumerate()
const SOLVED = (() => {
  const b = BOARD.slice()
  for (let m = 0; m < STEPS; m++) b[MOVES[2 * m]!] = MOVES[2 * m + 1]!
  return b
})()
/** The first empty cell and the last: the one the scan wanted, and the one
 *  the 2019 JavaScript kept. */
const FIRST_LAST = [BOARD.indexOf(0), BOARD.lastIndexOf(0)] as const
const CLUES = BOARD.flatMap((d, i) => (d ? [i] : []))
/** The two the reader is unsure of — amber, for a glance. */
const UNSURE = [CLUES[6]!, CLUES[19]!]

/**
 * A read that is not a sudoku: 42 digits where the puzzle has 31, placed at
 * random but not by chance — the first seed whose board has exactly the 21
 * cells in conflict the case study measured on its impostor.
 */
const NONSENSE = (() => {
  for (let seed = 1; ; seed++) {
    let s = seed
    const rnd = () => ((s = (s * 48271) % 2147483647) / 2147483647)
    const board = new Array<number>(81).fill(0)
    const order: number[] = []
    while (order.length < 42) {
      const i = Math.floor(rnd() * 81)
      if (board[i]) continue
      board[i] = 1 + Math.floor(rnd() * 9)
      order.push(i)
    }
    const bad = conflicts(board)
    if (bad.size === 21) return { board, order, bad }
  }
})()

type Words = {
  refusedStamp: string
  /** One card per act, the first line the act and the second what it counts;
   *  `{name}` is a number the stage keeps up to date. Shown one at a time. */
  cards: Record<
    'problem' | 'chose' | 'won' | 'scan' | 'block' | 'cost' | 'back' | 'photo' | 'refused' | 'outcome',
    readonly [string, string]
  >
}

/** French and Dutch are unreviewed, like the prose they follow. */
const WORDS: Record<Locale, Words> = {
  en: {
    refusedStamp: 'REFUSED',
    cards: {
      problem: ['One rule, three hats: row, column, box', '50 open cells · 9⁵⁰ ≈ 5 × 10⁴⁷ ways to fill them'],
      chose: ['Backtracking, first empty cell', 'move {move} of 8,950 · {back} taken back'],
      won: ['2019 · the board is full, and the search goes on', '{after} moves after it had won'],
      scan: ['2019 · the JavaScript looks for the first empty cell', '…and keeps the last one'],
      block: ['2019 · “Wait for It…” — written, never painted', 'and a var alert shadowing window.alert'],
      cost: ['{typed} of 162 elements, typed by hand', 'README.md: # sudoku'],
      back: ['2026 · return true at the first full board', 'the board as the 81 characters parseBoard reads'],
      photo: ['threshold · warp · cut on the lines · classify', '~130 ms · a 37 kB model · nothing leaves the page'],
      refused: ['A photograph that is not a sudoku', '{conf} cells in conflict — refused, with a reason'],
      outcome: ['26 photographs · 9 cells wrong · every one amber', '~136 ms a photo, from a file on disk'],
    },
  },
  fr: {
    refusedStamp: 'REFUSÉE',
    cards: {
      problem: ['Une règle, trois casquettes : ligne, colonne, bloc', '50 cases vides · 9⁵⁰ ≈ 5 × 10⁴⁷ façons de les remplir'],
      chose: ['Retour sur trace, première case vide', 'coup {move} sur 8 950 · {back} repris'],
      won: ['2019 · la grille est pleine, et la recherche continue', '{after} coups après avoir gagné'],
      scan: ['2019 · le JavaScript cherche la première case vide', '… et garde la dernière'],
      block: ['2019 · « Wait for It… » — écrit, jamais affiché', 'et un var alert qui masque window.alert'],
      cost: ['{typed} éléments sur 162, tapés à la main', 'README.md : # sudoku'],
      back: ['2026 · return true à la première grille pleine', 'la grille en 81 caractères, ce que lit parseBoard'],
      photo: ['seuil · redressement · découpe sur les lignes · classement', '~130 ms · un modèle de 37 ko · rien ne quitte la page'],
      refused: ['Une photo qui n’est pas un sudoku', '{conf} cases en conflit — refusée, avec une raison'],
      outcome: ['26 photos · 9 cases fausses · toutes en ambre', '~136 ms par photo, depuis un fichier local'],
    },
  },
  nl: {
    refusedStamp: 'GEWEIGERD',
    cards: {
      problem: ['Eén regel, drie petten: rij, kolom, blok', '50 lege vakjes · 9⁵⁰ ≈ 5 × 10⁴⁷ manieren om ze te vullen'],
      chose: ['Backtracking, eerste lege vakje', 'zet {move} van 8.950 · {back} teruggenomen'],
      won: ['2019 · het rooster is vol, en het zoeken gaat door', '{after} zetten nadat het al gewonnen had'],
      scan: ['2019 · het JavaScript zoekt het eerste lege vakje', '… en houdt het laatste'],
      block: ['2019 · „Wait for It…” — geschreven, nooit getoond', 'en een var alert die window.alert overschaduwt'],
      cost: ['{typed} van 162 elementen, met de hand getypt', 'README.md: # sudoku'],
      back: ['2026 · return true bij het eerste volle rooster', 'het rooster als de 81 tekens die parseBoard leest'],
      photo: ['drempel · rechttrekken · knippen op de lijnen · classificeren', '~130 ms · een model van 37 kB · niets verlaat de pagina'],
      refused: ['Een foto die geen sudoku is', '{conf} vakjes in conflict — geweigerd, met een reden'],
      outcome: ['26 foto’s · 9 vakjes fout · allemaal amber', '~136 ms per foto, uit een bestand op schijf'],
    },
  },
}
