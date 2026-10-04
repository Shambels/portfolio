import { useEffect, useId, useRef } from 'react'
import source from './assets/logo/logo-vector.svg?raw'

/**
 * The title's slide on the flat index's stage: the mark, lit by the cursor and
 * tilting a little towards it. The project plates beside it each answer the
 * pointer in their own project's terms; the mark is a folded ribbon, so it
 * answers as paper does — its faces catch the light and it has depth.
 *
 * **The light is the cursor**, standing a little in front of the picture. Each
 * face has a direction it faces (`FACE`) — the fold flap turned up and to the
 * right, the back of the fold down and to the left, the crossing up and to the
 * left — and is brightened or shaded by how much more or less it faces the
 * light than it does at rest, so at rest it is exactly the drawing. A sheen,
 * the light's own reflection, slides along the strokes after it.
 *
 * **The tilt** is the two strokes and the flap on three layers at three depths
 * — the stem at the back, the top stroke in front of it, the flap that is
 * folded over that in front of both, casting its shadow on it away from the
 * light — turned a few degrees towards the cursor. Seven degrees and forty
 * pixels of depth: enough to see that the flap is on top, not enough to look
 * like a card.
 *
 * The geometry is `src/assets/logo/logo-vector.svg`, read here rather than
 * copied — `tools/logo-vector.py` writes it, with a class on each shape.
 *
 * **The fly-in** is CSS: whenever the slide comes on stage — load, and every
 * scroll back up to the title — the two strokes fly in along the mark's own
 * diagonal from opposite corners and meet (`.part` in `index.css`), from the
 * first paint and with no script at all.
 *
 * Under reduced motion nothing flies and nothing tilts, and the light moves
 * with the cursor rather than easing after it. Without a script it is the
 * drawing, at rest.
 */

// ---- the drawing, out of the file
const ATTR = /([\w-]+)="([^"]*)"/g
const TAGS = [...source.matchAll(/<(path|polygon|stop|linearGradient)\b([^>]*?)\/?>/g)].map(([, tag, body]) => ({
  tag: tag!,
  a: Object.fromEntries([...body!.matchAll(ATTR)].map(([, k, v]) => [k!, v!])) as Record<string, string>,
}))
const VIEW = (source.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 512 686').split(' ').map(Number)
const [VW, VH] = [VIEW[2]!, VIEW[3]!]

type Name = 'top' | 'stem' | 'fold' | 'over' | 'back'
const shape = (name: Name) => {
  const a = TAGS.find((t) => t.a.class === name)?.a ?? {}
  const d = a.d ?? `M${(a.points ?? '').trim().split(/\s+/).join(' L')} Z`
  // The middle of its corners, for where the light falls on it — an arc's
  // radii are not a corner.
  const xy = [...d.replace(/A[\d.]+,[\d.]+/g, 'A').matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => [+m[1]!, +m[2]!])
  const mid = xy.reduce((s, [x, y]) => [s[0]! + x! / xy.length, s[1]! + y! / xy.length], [0, 0])
  return { d, fill: a.fill ?? '#fff', alpha: a['fill-opacity'] ?? '1', mid: mid as [number, number] }
}
const GRAD = TAGS.find((t) => t.tag === 'linearGradient')?.a ?? {}
const STOPS = TAGS.filter((t) => t.tag === 'stop').map((t) => t.a)

/** Which way each face faces: x right, y down, z out of the screen. */
const FACE: Record<Name, [number, number, number]> = {
  top: [0.12, -0.2, 1],
  stem: [-0.22, 0.12, 1],
  fold: [0.5, -0.5, 1],
  over: [-0.32, -0.32, 1],
  back: [-0.45, 0.45, 1],
}
const SHAPES = Object.fromEntries((Object.keys(FACE) as Name[]).map((n) => [n, shape(n)])) as Record<Name, ReturnType<typeof shape>>

/** Where the light is when nobody is pointing: up and to the left, in front.
 *  `LIGHT.z` is how far in front of the picture the cursor stands. */
const LIGHT = { x: 40, y: -160, z: 380 }
/** How much a face's change in light shows, and the most it may — less in
 *  shade than in light: shading a cyan reads as dirt long before it reads as
 *  a shadow. */
const GAIN = 0.9
const MOST = { lit: 0.3, dim: 0.16 }
/** Degrees the mark turns, at the edge of its reach. */
const TILT = { x: 6, y: 7 }
/** How far from the mark the cursor still counts, as a share of its width. */
const REACH = 0.5
/** How long the mark takes to come round after the cursor, ms. */
const EASE = 120

const facing = (n: Name, lx: number, ly: number) => {
  const [nx, ny, nz] = FACE[n]
  const [cx, cy] = SHAPES[n].mid
  const dx = lx - cx
  const dy = ly - cy
  const dz = LIGHT.z
  return (nx * dx + ny * dy + nz * dz) / (Math.hypot(nx, ny, nz) * Math.hypot(dx, dy, dz))
}
const REST = Object.fromEntries((Object.keys(FACE) as Name[]).map((n) => [n, facing(n, LIGHT.x, LIGHT.y)])) as Record<Name, number>

export function Mark() {
  const host = useRef<HTMLDivElement>(null)
  const sheens = useRef<SVGRadialGradientElement[]>([])
  const id = useId().replace(/[^\w-]/g, '')

  useEffect(() => {
    const box = host.current
    if (!box) return
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    const rest = { x: LIGHT.x, y: LIGHT.y, rx: 0, ry: 0, sheen: 0 }
    const now = { ...rest }
    let goal = { ...rest }
    let raf = 0
    let last = 0
    let dead = false

    const apply = () => {
      const s = box.style
      for (const n of Object.keys(FACE) as Name[]) {
        const v = (facing(n, now.x, now.y) - REST[n]) * GAIN
        s.setProperty(`--lit-${n}`, Math.min(MOST.lit, Math.max(0, v)).toFixed(3))
        s.setProperty(`--dim-${n}`, Math.min(MOST.dim, Math.max(0, -v)).toFixed(3))
      }
      s.setProperty('--rx', `${now.rx.toFixed(2)}deg`)
      s.setProperty('--ry', `${now.ry.toFixed(2)}deg`)
      s.setProperty('--sheen', now.sheen.toFixed(3))
      // The flap's shadow falls away from the light, onto the stroke under it.
      const [fx, fy] = SHAPES.fold.mid
      const len = Math.hypot(fx - now.x, fy - now.y, LIGHT.z)
      s.setProperty('--sx', `${(((fx - now.x) / len) * 7).toFixed(2)}px`)
      s.setProperty('--sy', `${(((fy - now.y) / len) * 7).toFixed(2)}px`)
      for (const g of sheens.current) {
        g.setAttribute('cx', now.x.toFixed(1))
        g.setAttribute('cy', now.y.toFixed(1))
      }
    }

    const frame = (t: number) => {
      raf = 0
      const dt = last ? t - last : 16
      last = t
      const k = still.matches ? 1 : 1 - Math.exp(-dt / EASE)
      let moving = false
      for (const key of Object.keys(now) as (keyof typeof now)[]) {
        const d = goal[key] - now[key]
        now[key] += d * k
        if (Math.abs(d) > (key === 'x' || key === 'y' ? 0.2 : 0.002)) moving = true
        else now[key] = goal[key]
      }
      apply()
      if (moving && !dead) raf = requestAnimationFrame(frame)
      else last = 0
    }
    const kick = () => {
      if (!raf && !dead) raf = requestAnimationFrame(frame)
    }

    // How near the cursor is decides how much of it there is: all of it over
    // the mark, none of it `REACH` of the mark's width away, and a smooth
    // fade between — so the light and the tilt have gone out before the
    // cursor gets anywhere an edge could cut them off, and nothing jumps.
    // The window is listened to rather than the slide for the same reason,
    // and a scroll re-reads the last position, because the mark moves under
    // a cursor that does not.
    let pointer: [number, number] | null = null
    const aim = () => {
      if (!pointer) {
        goal = { ...rest }
        kick()
        return
      }
      const [px, py] = pointer
      const r = box.getBoundingClientRect()
      const reach = r.width * REACH
      const dx = Math.max(r.left - px, 0, px - r.right)
      const dy = Math.max(r.top - py, 0, py - r.bottom)
      const f = Math.min(1, Math.hypot(dx, dy) / reach)
      const w = 1 - f * f * (3 - 2 * f)
      const tx = Math.max(-1, Math.min(1, (px - (r.left + r.width / 2)) / (r.width / 2 + reach)))
      const ty = Math.max(-1, Math.min(1, (py - (r.top + r.height / 2)) / (r.height / 2 + reach)))
      const flat = still.matches
      goal = {
        x: rest.x + (((px - r.left) / r.width) * VW - rest.x) * w,
        y: rest.y + (((py - r.top) / r.height) * VH - rest.y) * w,
        rx: flat ? 0 : -ty * TILT.x * w,
        ry: flat ? 0 : tx * TILT.y * w,
        sheen: w,
      }
      kick()
    }
    const move = (e: PointerEvent) => {
      pointer = [e.clientX, e.clientY]
      aim()
    }
    const leave = () => {
      pointer = null
      aim()
    }
    const root = document.documentElement
    addEventListener('pointermove', move, { passive: true })
    addEventListener('pointerdown', move, { passive: true })
    addEventListener('scroll', aim, { passive: true, capture: true })
    root.addEventListener('pointerleave', leave)
    addEventListener('blur', leave)
    apply()

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      removeEventListener('pointermove', move)
      removeEventListener('pointerdown', move)
      removeEventListener('scroll', aim, { capture: true })
      root.removeEventListener('pointerleave', leave)
      removeEventListener('blur', leave)
    }
  }, [])

  /** One layer: a silhouette, the faces drawn on it, the light on each. */
  const layer = (cls: string, base: Name, faces: Name[]) => {
    const g = `${id}${cls}g`
    const sheen = `${id}${cls}s`
    const clip = `${id}${cls}c`
    return (
      <svg className={`part ${cls}`} viewBox={VIEW.join(' ')} aria-hidden="true">
        <defs>
          <linearGradient id={g} gradientUnits="userSpaceOnUse" x1={GRAD.x1} y1={GRAD.y1} x2={GRAD.x2} y2={GRAD.y2}>
            {STOPS.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s['stop-color']} />
            ))}
          </linearGradient>
          <radialGradient
            id={sheen}
            ref={(el) => {
              if (el && !sheens.current.includes(el)) sheens.current.push(el)
            }}
            gradientUnits="userSpaceOnUse"
            cx={LIGHT.x}
            cy={LIGHT.y}
            r="250"
          >
            <stop offset="0" stopColor="#fff" stopOpacity=".55" />
            <stop offset=".45" stopColor="#e8fffb" stopOpacity=".16" />
            <stop offset="1" stopColor="#e8fffb" stopOpacity="0" />
          </radialGradient>
          <clipPath id={clip}>
            <path d={SHAPES[base].d} />
          </clipPath>
        </defs>
        <path d={SHAPES[base].d} fill={`url(#${g})`} />
        {/* The drawing's own faces — every shape that is not a silhouette. */}
        {faces.map((n) =>
          SHAPES[n].fill.startsWith('url') ? null : (
            <path key={n} d={SHAPES[n].d} fill={SHAPES[n].fill} fillOpacity={SHAPES[n].alpha} />
          ),
        )}
        {faces.map((n) => (
          <g key={n}>
            <path d={SHAPES[n].d} fill="#a8f4ff" style={{ opacity: `var(--lit-${n}, 0)` }} />
            <path d={SHAPES[n].d} fill="#00407a" style={{ opacity: `var(--dim-${n}, 0)` }} />
          </g>
        ))}
        <rect
          className="sheen"
          width={VW}
          height={VH}
          fill={`url(#${sheen})`}
          clipPath={`url(#${clip})`}
          style={{ opacity: 'var(--sheen, 0)' }}
        />
      </svg>
    )
  }

  return (
    <div className="mark" ref={host}>
      <div className="tilt">
        {layer('stem', 'stem', ['stem', 'over'])}
        {layer('top', 'top', ['top', 'back'])}
        {layer('flap', 'fold', ['fold'])}
      </div>
    </div>
  )
}
