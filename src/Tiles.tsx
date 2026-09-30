import { useEffect, useRef, useState } from 'react'
import type { Plate } from './content'
import { BOARD, MOVES, POINTS, RACK, RACK_AT, TOTAL, onBoard, play } from './scrubble'

/**
 * Scrubble's plate on the flat index's stage: a board in the middle of a
 * game, seen from the player's seat, and the rack in front of it — and the
 * move that was there.
 *
 * - **Hover the rack** and the board wakes: the empty squares next to tiles
 *   — the anchors, where any move has to start — glow for a moment, the way
 *   the solver sees the board first. Then the tiles lift off the rack one by
 *   one, cross, and click down as the best move on the board: RETAINS, 94,
 *   turning PEPPER into PEPPERS on a double word, a fifty-point bingo.
 * - **Under the rack** the readout says what it is: its rank among all 1,755
 *   legal moves, the word, the words it makes across, and the score counted
 *   up.
 * - **Leave, and hover again**, and it plays the next one down the list —
 *   NITRATES through the T of RAFT, AIRSCREWS round SCREW, TRAINS, the six
 *   most of us would have found — and then the best again.
 *
 * Every letter is drawn, so every letter and every point value is right: the
 * picture is the board empty and the rack empty (`tools/plate.py`,
 * `scrubble`). The position and the scores are `src/scrubble.ts`, found by
 * `tools/moves.py` and held by `scrubble.check.ts`. A 2D canvas, drawing only
 * while something moves; under reduced motion a move is simply there. With JS
 * off, the SVG below draws the position and the rack, standing still.
 */

const W = 900
const H = 1162

const TIME = { wake: 450, fly: 520, stagger: 130, count: 700, back: 380 }

type Pt = [number, number]
/** A face of a tile: three corners, top-left, top-right, bottom-left. */
type Face = [Pt, Pt, Pt]

/** A square's top face, `inset` in from its edges and raised `lift` of its
 *  own height off the board. */
function square(r: number, c: number, inset = 0.06, lift = 0): Face {
  const tl = onBoard(c + inset, r + inset)
  const tr = onBoard(c + 1 - inset, r + inset)
  const bl = onBoard(c + inset, r + 1 - inset)
  const up = (bl[1] - tl[1]) * lift
  return [
    [tl[0], tl[1] - up],
    [tr[0], tr[1] - up],
    [bl[0], bl[1] - up],
  ]
}

/** A tile standing in the rack's groove, `slot` of seven. */
function standing(slot: number): Face {
  const w = 64
  const gap = (RACK_AT.x1 - RACK_AT.x0 - 7 * w) / 8
  const x = RACK_AT.x0 + gap + slot * (w + gap)
  const top = RACK_AT.y - 96
  const bottom = RACK_AT.y + 10
  return [
    [x + 1.5, top],
    [x + w - 1.5, top],
    [x, bottom],
  ]
}

const lerp = (a: Face, b: Face, t: number): Face =>
  a.map((p, i) => [p[0] + (b[i]![0] - p[0]) * t, p[1] + (b[i]![1] - p[1]) * t]) as Face
const ease = (t: number) => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 3
const clamp = (t: number) => Math.min(Math.max(t, 0), 1)

/** The empty squares beside a tile: where a move can start. */
const ANCHORS: [number, number][] = []
for (let r = 0; r < 15; r++)
  for (let c = 0; c < 15; c++) {
    if (BOARD[r]![c] !== '.') continue
    const n = [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ].some(([a, b]) => a! >= 0 && a! < 15 && b! >= 0 && b! < 15 && BOARD[a!]![b!] !== '.')
    if (n) ANCHORS.push([r, c])
  }

const PLAYED = MOVES.map((m) => {
  const { placed } = play(m)
  // Each tile off the rack, from the first slot holding its letter.
  const free = [...RACK]
  const used = new Set<number>()
  return placed.map((t) => {
    const slot = free.findIndex((l, i) => l === t.letter && !used.has(i))
    used.add(slot)
    return { ...t, slot }
  })
})

export function Tiles({ plate }: { on: boolean; plate: Plate }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const cv = canvas.current
    const src = plate.base
    const host = cv?.parentElement
    if (!cv || !src || !host) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    const base = new Image()
    base.src = src
    let ready = false
    let dead = false
    let k = 1
    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      k = cv.width / W
    }
    size()

    // ---- a tile: its shadow, its thickness, its face, its letter and value
    const tile = (f: Face, letter: string, lying: number, glow = 0) => {
      const [tl, tr, bl] = f
      const ax = [tr[0] - tl[0], tr[1] - tl[1]]
      const ay = [bl[0] - tl[0], bl[1] - tl[1]]
      const br: Pt = [tl[0] + ax[0]! + ay[0]!, tl[1] + ax[1]! + ay[1]!]
      const quad = (pts: Pt[]) => {
        ctx.beginPath()
        ctx.moveTo(pts[0]![0] * k, pts[0]![1] * k)
        for (const p of pts.slice(1)) ctx.lineTo(p[0] * k, p[1] * k)
        ctx.closePath()
      }
      const depth = Math.hypot(ay[0]!, ay[1]!) * 0.22 * lying + 3 * (1 - lying)
      // Thickness: the near edge, darker.
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.shadowColor = 'rgba(0,0,0,0.45)'
      ctx.shadowBlur = 5 * k
      ctx.shadowOffsetY = 2 * k
      quad([bl, br, [br[0], br[1] + depth], [bl[0], bl[1] + depth]])
      ctx.fillStyle = '#b89c6c'
      ctx.fill()
      ctx.shadowColor = 'transparent'
      // Face: ivory, a little warmer where the lamp is not.
      const g = ctx.createLinearGradient(tl[0] * k, tl[1] * k, br[0] * k, br[1] * k)
      g.addColorStop(0, '#f4e8cc')
      g.addColorStop(1, '#dcc79f')
      quad([tl, tr, br, bl])
      ctx.fillStyle = g
      ctx.fill()
      ctx.strokeStyle = 'rgba(120,90,50,0.35)'
      ctx.lineWidth = 0.8 * k
      ctx.stroke()
      if (glow > 0) {
        ctx.strokeStyle = `rgba(233,168,81,${0.85 * glow})`
        ctx.lineWidth = 2.2 * k
        ctx.stroke()
      }
      // The letter and its value, laid on the face.
      ctx.setTransform((ax[0]! * k) / 100, (ax[1]! * k) / 100, (ay[0]! * k) / 100, (ay[1]! * k) / 100, tl[0] * k, tl[1] * k)
      ctx.fillStyle = '#2a2219'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '700 62px "Helvetica Neue", Helvetica, Arial, sans-serif'
      ctx.fillText(letter, 46, 54)
      ctx.font = '700 22px "Helvetica Neue", Helvetica, Arial, sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(String(POINTS[letter]), 90, 82)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }

    // ---- the move, in play
    let turn = 0 // which of MOVES the next hover plays
    let want = false
    let phase: 'idle' | 'out' | 'back' = 'idle'
    let began = -Infinity
    let playing = 0

    const frame = (now: number) => {
      raf = 0
      if (!ready) return
      const quiet = still.matches
      const t = now - began
      const placed = PLAYED[playing]!
      const flyEnd = quiet ? 0 : TIME.wake + TIME.stagger * (placed.length - 1) + TIME.fly
      const backEnd = quiet ? 0 : TIME.stagger * 0.5 * (placed.length - 1) + TIME.back

      if (phase === 'idle' && want) {
        playing = turn
        phase = 'out'
        began = now
        return kick()
      }
      if (phase === 'back' && t >= backEnd) {
        phase = 'idle'
        turn = (turn + 1) % MOVES.length
        if (want) return kick()
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)

      // The anchors, while the board wakes.
      if (phase === 'out' && !quiet && t < TIME.wake + 400) {
        const a = Math.sin(Math.PI * clamp(t / (TIME.wake + 400)))
        ctx.fillStyle = `rgba(233,168,81,${0.28 * a})`
        for (const [r, c] of ANCHORS) {
          const [tl, tr, bl] = square(r, c, 0.12)
          const br: Pt = [tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1]]
          ctx.beginPath()
          ctx.moveTo(tl[0] * k, tl[1] * k)
          ctx.lineTo(tr[0] * k, tr[1] * k)
          ctx.lineTo(br[0] * k, br[1] * k)
          ctx.lineTo(bl[0] * k, bl[1] * k)
          ctx.fill()
        }
      }

      // The tiles already down, back to front so the near ones overlap.
      const m = MOVES[playing]!
      const shown = phase !== 'idle'
      const crossing = new Set<string>()
      if (shown) {
        // The move's own word and the words across it light with it.
        const [dr, dc] = m.dir === 'A' ? [0, 1] : [1, 0]
        for (let i = 0; i < m.word.length; i++) crossing.add(`${m.row + dr * i},${m.col + dc * i}`)
        for (const p of placed) {
          let r = p.r
          let c = p.c
          while (r - dc >= 0 && c - dr >= 0 && BOARD[r - dc]![c - dr] !== '.') [r, c] = [r - dc, c - dr]
          for (; r < 15 && c < 15 && (BOARD[r]![c] !== '.' || (r === p.r && c === p.c)); [r, c] = [r + dc, c + dr])
            crossing.add(`${r},${c}`)
        }
      }
      const landed = phase === 'out' && t >= flyEnd
      const lit = landed ? clamp((t - flyEnd) / 300) : 0
      for (let r = 0; r < 15; r++)
        for (let c = 0; c < 15; c++) {
          const l = BOARD[r]![c]!
          if (l !== '.') tile(square(r, c, 0.06, 0.2), l, 1, crossing.has(`${r},${c}`) ? lit : 0)
        }

      // The rack: every tile not on its way somewhere stands in its slot.
      // A tile leaves its slot when it lifts, and is back in it when it lands.
      const flight = placed.map((_, i) => {
        if (!shown) return 0
        if (phase === 'out') return quiet ? 1 : ease((t - TIME.wake - i * TIME.stagger) / TIME.fly)
        return quiet ? 0 : 1 - ease((t - (placed.length - 1 - i) * TIME.stagger * 0.5) / TIME.back)
      })
      const off = new Set(placed.filter((_, i) => flight[i]! > 0).map((p) => p.slot))
      for (let s = 0; s < 7; s++) if (!off.has(s)) tile(standing(s), RACK[s]!, 0)
      // The lip of the rack, back over the feet of the tiles standing in it.
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const [y0, y1] = RACK_AT.lip
      ctx.drawImage(base, 0, (y0 / H) * base.naturalHeight, base.naturalWidth, ((y1 - y0) / H) * base.naturalHeight, 0, y0 * k, cv.width, (y1 - y0) * k)

      // The move's tiles: in flight out, down, or on their way back.
      if (shown)
        placed.forEach((p, i) => {
          const on = square(p.r, p.c, 0.06, 0.2)
          let f: Face
          const u = flight[i]!
          if (u <= 0) return
          f = lerp(standing(p.slot), on, u)
          // An arc: up off the rack and down onto the board.
          const lift = Math.sin(Math.PI * u) * 70
          f = f.map(([x, y]) => [x, y - lift]) as Face
          tile(f, p.letter, u, landed ? lit : 0)
        })

      // The readout, under the rack.
      if (phase === 'out' && landed) {
        const a = clamp((t - flyEnd) / 250)
        const n = Math.round(m.score * (quiet ? 1 : ease((t - flyEnd) / TIME.count)))
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.globalAlpha = a
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = 'rgba(231,228,221,0.6)'
        ctx.font = `500 ${15 * k}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
        ctx.fillText(`#${m.rank} OF ${TOTAL.toLocaleString('en')} LEGAL MOVES`, 450 * k, 966 * k)
        // The word and its score as one line, centred, the score's width
        // held at its final value so the line does not shift as it counts.
        const sans = `700 ${40 * k}px "Helvetica Neue", Helvetica, Arial, sans-serif`
        const mono = `700 ${40 * k}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
        ctx.font = sans
        const ww = ctx.measureText(m.word).width
        ctx.font = mono
        const sw = ctx.measureText(String(m.score)).width
        const x0 = 450 * k - (ww + 16 * k + sw) / 2
        ctx.textAlign = 'left'
        ctx.fillStyle = '#f1e6cf'
        ctx.font = sans
        ctx.fillText(m.word, x0, 1016 * k)
        ctx.fillStyle = '#e9a851'
        ctx.font = mono
        ctx.fillText(String(n), x0 + ww + 16 * k, 1016 * k)
        const extra = [...m.crosses, placed.length === 7 ? 'BINGO +50' : ''].filter(Boolean).join(' · ')
        if (extra) {
          ctx.textAlign = 'center'
          ctx.fillStyle = 'rgba(231,228,221,0.55)'
          ctx.font = `500 ${14 * k}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`
          ctx.fillText(extra, 450 * k, 1046 * k)
        }
        ctx.globalAlpha = 1
      }

      const moving = (phase === 'out' && t < flyEnd + Math.max(TIME.count, 400)) || phase === 'back'
      if (moving && !dead) kick()
    }
    let raf = 0
    const kick = () => {
      if (!raf && !dead) raf = requestAnimationFrame(frame)
    }

    base
      .decode()
      .then(() => {
        if (dead) return
        ready = true
        setLive(true)
        kick()
      })
      .catch(() => {})

    // ---- the pointer: the rack is what you reach for
    const overRack = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * W
      const y = ((e.clientY - r.top) / r.height) * H
      return x > RACK_AT.x0 - 30 && x < RACK_AT.x1 + 30 && y > RACK_AT.y - 100 && y < RACK_AT.lip[1] + 10
    }
    const move = (e: PointerEvent) => {
      const on = overRack(e)
      cv.style.cursor = on ? 'pointer' : ''
      if (on && !want) {
        want = true
        kick()
      } else if (!on && want) leave()
    }
    const leave = () => {
      want = false
      if (phase === 'out') {
        phase = 'back'
        began = performance.now()
      }
      kick()
    }
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerdown', move)
    cv.addEventListener('pointerleave', leave)
    cv.addEventListener('pointercancel', leave)
    const ro = new ResizeObserver(() => {
      size()
      kick()
    })
    ro.observe(cv)

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerdown', move)
      cv.removeEventListener('pointerleave', leave)
      cv.removeEventListener('pointercancel', leave)
    }
  }, [plate])

  return (
    <>
      {!live && <Still />}
      <canvas ref={canvas} className="tiles" />
    </>
  )
}

/** The position with no script: every tile on the board and on the rack,
 *  standing still, in SVG — the same geometry the canvas draws with. */
function Still() {
  const face = (f: Face, letter: string, key: string) => {
    const [tl, tr, bl] = f
    const ax = [tr[0] - tl[0], tr[1] - tl[1]]
    const ay = [bl[0] - tl[0], bl[1] - tl[1]]
    const br = [tl[0] + ax[0]! + ay[0]!, tl[1] + ax[1]! + ay[1]!]
    return (
      <g key={key}>
        <polygon points={`${tl} ${tr} ${br} ${bl}`} fill="#ecdcb8" stroke="#7a5a3259" strokeWidth="0.8" />
        <text
          transform={`matrix(${ax[0]! / 100} ${ax[1]! / 100} ${ay[0]! / 100} ${ay[1]! / 100} ${tl[0]} ${tl[1]})`}
          x="46"
          y="54"
          fontSize="62"
          fontWeight="700"
          textAnchor="middle"
          dominantBaseline="central"
          fill="#2a2219"
          fontFamily="Helvetica Neue, Helvetica, Arial, sans-serif"
        >
          {letter}
        </text>
      </g>
    )
  }
  const cells = []
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 15; c++) if (BOARD[r]![c] !== '.') cells.push(face(square(r, c, 0.06, 0.2), BOARD[r]![c]!, `${r},${c}`))
  return (
    <svg className="tiles" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {cells}
      {[...RACK].map((l, s) => face(standing(s), l, `rack${s}`))}
    </svg>
  )
}
