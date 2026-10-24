import { useEffect, useRef, useState } from 'react'
import type { Plate } from './content'
import type { Locale } from './i18n'
import {
  CIRCUITS, PLATE, RCDS, SHEET, UPSTREAM, sheet, sheetMatrix, type Owner,
} from './tablo'

/**
 * Tablo's plate on the flat index's stage: a distribution board on a wall,
 * and under it, pinned up, the sheet its diagram is kept on — the single-line
 * diagram over the position plan, which is the one idea Tablo is built on:
 * one model, drawn twice.
 *
 * - **Hover a device on the board** — the main switch, an RCD, a breaker —
 *   and everything it feeds lights up on the sheet in signal yellow: its
 *   branch of the diagram, and on the plan the rooms and the points it feeds,
 *   tagged the same on both. Hover a room on the plan and it is the other way
 *   round: its breaker lights on the board.
 * - **Click it** and it switches: the renderer's own lever goes down (a
 *   patch of the second render, `off`), and everything downstream goes dead —
 *   grey and broken on the diagram, the lamps out on the plan, and the
 *   indicator lamp on the board out with the main switch.
 *
 * The plate itself is a Blender render (`tools/tablo_plate.py`), the sheet
 * blank in it. Everything on the sheet is drawn here from `sheet()` in
 * `tablo.ts`, through the affine map the render's own camera measured, and
 * multiplied onto the paper so the lamp's fall-off and the board's shadow are
 * still on it. A 2D canvas, drawn only when something changes. With JS off,
 * the SVG below draws the same sheet, standing still, every device on.
 */

export const W = 900
export const H = 1162

type Key = Exclude<Owner, null>
const KEYS: Key[] = ['main', 'rcd0', 'rcd1', 'c0', 'c1', 'c2', 'c3']

/** Which device on the board each of the plate's boxes is. */
const keyOf = (d: (typeof PLATE.devices)[number]): Key | null =>
  d.kind === 'main' ? 'main' : d.kind === 'rcd' ? (`rcd${d.ref}` as Key) : d.kind === 'breaker' ? (`c${d.ref}` as Key) : null

/** What is written on each device's label strip. */
const LABEL: Record<Key, string> = {
  main: 'Q1', rcd0: `${RCDS[0]!.ma} mA`, rcd1: `${RCDS[1]!.ma} mA`,
  c0: CIRCUITS[0]!.tag, c1: CIRCUITS[1]!.tag, c2: CIRCUITS[2]!.tag, c3: CIRCUITS[3]!.tag,
}

const INK = '#26241f'
const HOT = '#c98700'
const DEAD = '#8d877c'
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif'

/** Is this owner fed, with these devices switched as they are? */
const fed = (o: Owner, on: Record<Key, boolean>) => o === null || UPSTREAM[o].every((k) => on[k])
/** Does a hover on `hot` light this owner — is `hot` upstream of it? */
const lit = (o: Owner, hot: Key | null) => !!hot && o !== null && UPSTREAM[o].includes(hot)

export function Switchboard({ plate, locale }: { on: boolean; plate: Plate; locale: Locale }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)

  useEffect(() => {
    const cv = canvas.current
    const base = plate.base
    const offSrc = plate.off
    if (!cv || !base || !offSrc) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const drawing = sheet(locale)
    const paths = drawing.inks.map((i) => ({ ...i, path: new Path2D(i.d) }))
    const M = sheetMatrix(PLATE.sheet)
    const off = new Image()
    off.src = offSrc
    let ready = false
    let dead = false
    let k = 1
    const on = Object.fromEntries(KEYS.map((key) => [key, true])) as Record<Key, boolean>
    let hot: Key | null = null

    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      k = cv.width / W
    }
    size()

    const draw = () => {
      raf = 0
      if (!ready) return
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)

      // ---- the board: levers down where a device is off, the hovered one
      // ringed, the label strips written, the indicator lit
      const sx = off.naturalWidth / W
      const sy = off.naturalHeight / H
      for (const d of PLATE.devices) {
        const key = keyOf(d)
        const [x0, y0, x1, y1] = d.box
        if (key && !on[key]) ctx.drawImage(off, x0 * sx, y0 * sy, (x1 - x0) * sx, (y1 - y0) * sy, x0 * k, y0 * k, (x1 - x0) * k, (y1 - y0) * k)
        if (key) {
          const q = d.label
          const cx = (q[0]![0] + q[1]![0]) / 2
          const cy = (q[0]![1] + q[3]![1]) / 2
          const h = q[3]![1] - q[0]![1]
          ctx.fillStyle = INK
          ctx.globalAlpha = 0.85
          ctx.font = `600 ${h * 0.62 * k}px ${FONT}`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(LABEL[key], cx * k, cy * k + h * 0.04 * k)
          ctx.globalAlpha = 1
        }
        if (key && lit(key, hot) && key === hot) {
          ctx.save()
          ctx.strokeStyle = '#ffc21a'
          ctx.lineWidth = 2.2 * k
          ctx.shadowColor = '#ffc21a'
          ctx.shadowBlur = 12 * k
          ctx.beginPath()
          ctx.roundRect(x0 * k - 2 * k, y0 * k - 2 * k, (x1 - x0 + 4) * k, (y1 - y0 + 4) * k, 3 * k)
          ctx.stroke()
          ctx.restore()
        }
        if (d.kind === 'lamp' && on.main) {
          const cx = ((x0 + x1) / 2) * k
          const cy = (y0 + (y1 - y0) * 0.36) * k
          const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16 * k)
          g.addColorStop(0, 'rgba(255,200,90,0.95)')
          g.addColorStop(0.25, 'rgba(255,160,40,0.55)')
          g.addColorStop(1, 'rgba(255,140,20,0)')
          ctx.globalCompositeOperation = 'screen'
          ctx.fillStyle = g
          ctx.fillRect(cx - 16 * k, cy - 16 * k, 32 * k, 32 * k)
          ctx.globalCompositeOperation = 'source-over'
        }
      }

      // ---- the sheet, in millimetres, multiplied onto the paper
      ctx.setTransform(M[0] * k, M[1] * k, M[2] * k, M[3] * k, M[4] * k, M[5] * k)
      ctx.globalCompositeOperation = 'multiply'
      for (const r of drawing.rooms) {
        if (lit(r.owner, hot)) {
          ctx.fillStyle = 'rgba(255,194,26,0.35)'
          ctx.fillRect(r.x, r.y, r.w, r.h)
        }
      }
      for (const l of drawing.lamps) {
        if (!fed(l.owner, on)) continue
        ctx.fillStyle = 'rgba(255,194,26,0.6)'
        ctx.beginPath()
        ctx.arc(l.x, l.y, 3.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      for (const p of paths) {
        const isHot = lit(p.owner, hot)
        const isDead = !fed(p.owner, on)
        const c = isHot ? HOT : isDead ? DEAD : INK
        ctx.setLineDash(isDead && !p.fill ? [1.6, 1.4] : [])
        if (p.fill) {
          ctx.fillStyle = c
          ctx.fill(p.path)
        } else {
          ctx.strokeStyle = c
          ctx.lineWidth = isHot ? 0.8 : 0.45
          ctx.stroke(p.path)
        }
      }
      ctx.setLineDash([])
      ctx.textBaseline = 'alphabetic'
      for (const w of drawing.words) {
        ctx.fillStyle = lit(w.owner, hot) ? HOT : fed(w.owner, on) ? INK : DEAD
        ctx.font = `${w.bold ? 700 : 400} ${w.size}px ${FONT}`
        ctx.textAlign = w.anchor === 'end' ? 'right' : w.anchor === 'middle' ? 'center' : 'left'
        ctx.fillText(w.t, w.x, w.y)
      }
      ctx.globalCompositeOperation = 'source-over'
      ctx.setTransform(1, 0, 0, 1, 0, 0)
    }
    let raf = 0
    const kick = () => {
      if (!raf && !dead) raf = requestAnimationFrame(draw)
    }

    Promise.all([off.decode(), new Promise<void>((res) => {
      const b = new Image()
      b.src = base
      b.decode().then(() => res(), () => res())
    })])
      .then(() => {
        if (dead) return
        ready = true
        setLive(true)
        kick()
      })
      .catch(() => {})

    // ---- the pointer: a device on the board, or a room on the plan
    const inv = (() => {
      const [a, b, c, d, e, f] = M
      const det = a * d - b * c
      return (x: number, y: number): [number, number] => [(d * (x - e) - c * (y - f)) / det, (-b * (x - e) + a * (y - f)) / det]
    })()
    const target = (ev: PointerEvent): Key | null => {
      const r = cv.getBoundingClientRect()
      const x = ((ev.clientX - r.left) / r.width) * W
      const y = ((ev.clientY - r.top) / r.height) * H
      for (const d of PLATE.devices) {
        const [x0, y0, x1, y1] = d.box
        const key = keyOf(d)
        if (key && x >= x0 && x <= x1 && y >= y0 && y <= y1) return key
      }
      const [u, v] = inv(x, y)
      if (u < 0 || v < 0 || u > SHEET.w || v > SHEET.h) return null
      for (const room of drawing.rooms) if (u >= room.x && u <= room.x + room.w && v >= room.y && v <= room.y + room.h) return room.owner
      return null
    }
    const move = (ev: PointerEvent) => {
      const t = target(ev)
      cv.style.cursor = t ? 'pointer' : ''
      if (t !== hot) {
        hot = t
        kick()
      }
    }
    const click = (ev: PointerEvent) => {
      const t = target(ev)
      if (!t) return
      on[t] = !on[t]
      hot = t
      kick()
    }
    const leave = () => {
      hot = null
      kick()
    }
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerup', click)
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
      cv.removeEventListener('pointerup', click)
      cv.removeEventListener('pointerleave', leave)
      cv.removeEventListener('pointercancel', leave)
    }
  }, [plate, locale])

  return (
    <>
      {!live && <Still locale={locale} />}
      <canvas ref={canvas} className="switchboard" />
    </>
  )
}

/** The sheet with no script: the same drawing, every device on, in SVG — the
 *  canvas's own paths through the same matrix. Also what the case study's
 *  stage draws over, which is why it takes a class per act. */
export function Still({ locale, acts = false }: { locale: Locale; acts?: boolean }) {
  const drawing = sheet(locale)
  const M = sheetMatrix(PLATE.sheet)
  const cls = (act: string, owner: Owner) => (acts ? `${act} ${owner ?? ''}`.trim() : undefined)
  return (
    <svg className="switchboard" viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <g transform={`matrix(${M.join(' ')})`} style={{ mixBlendMode: 'multiply' }}>
        {drawing.inks.map((i, n) => (
          <path key={n} className={cls(i.act, i.owner)} d={i.d} fill={i.fill ? INK : 'none'} stroke={i.fill ? 'none' : INK}
            strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round" pathLength={acts && !i.fill ? 1 : undefined} />
        ))}
        {drawing.words.map((w, n) => (
          <text key={n} className={cls(w.act, w.owner)} x={w.x} y={w.y} fontSize={w.size} fontWeight={w.bold ? 700 : 400}
            textAnchor={w.anchor ?? 'start'} fill={INK} fontFamily={FONT}>
            {w.t}
          </text>
        ))}
      </g>
    </svg>
  )
}

