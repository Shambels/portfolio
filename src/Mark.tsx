import { useEffect, useId, useRef, type CSSProperties } from 'react'
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
 * diagonal from opposite corners and meet — as **straight ribbons**, the top
 * one a bar running off to the right and the stem a post running up — and as
 * they land **the ribbon folds into shape**: the corner folds over its
 * crease and sends the ribbon down, band B swings over the stem on its
 * elbow, and band A swings out last. Every angle in the mark, made in front
 * of you (the ribbon, unwound, below). `index.css`, from the first paint and
 * with no script at all.
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
  return { d, fill: a.fill ?? '#fff', alpha: a['fill-opacity'] ?? '1', mid: mid as [number, number], xy: xy as [number, number][] }
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

/**
 * The ribbon, unwound. Each stroke is cut into the pieces it bends at, out of
 * the drawing's own silhouettes (their corners, in the order
 * `tools/logo-vector.py` writes them), so that every angle in the mark can be
 * undone and made again in front of the visitor:
 *
 * - **The corner fold**, top right — a true fold of paper. The bar's end
 *   folds over the 45-degree crease and the ribbon runs down. Undone, the
 *   flap, the strip and the band below it lie mirrored over the crease, a
 *   straight bar running on to the right: the leaf turns 180 degrees about
 *   the crease to fold it (`CREASE`, `REFLECT`).
 * - **The two elbows**, where the strip turns into band A and the stem into
 *   band B — mitred joints, which no single fold of a straight strip makes,
 *   so they are bends: each band swings in the plane about the point where
 *   its axis meets the stroke's (`BEND`), and undone it carries straight on.
 *   Band A meets the strip on the mitre, so straight it would open a notch
 *   on the inside of the elbow; it carries a wedge (`wedge`) that fills the
 *   notch and sits under the strip once it has bent. Band B crosses over the
 *   stem in the drawing, so straight it simply lies along it.
 */
type Pt = [number, number]
const corners = (n: Name) => SHAPES[n].xy as Pt[]
const at = (p: Pt) => p.map((v) => +v.toFixed(2)).join(',')
const poly = (...p: Pt[]) => `M${p.map(at).join(' L')} Z`
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
const R = SHAPES.top.d.match(/A([\d.]+)/)?.[1] ?? '70'
/** `p` turned `deg` about `c` — clockwise on screen, as CSS turns. */
const turn = (p: Pt, c: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180
  const dx = p[0] - c[0]
  const dy = p[1] - c[1]
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)]
}
const heading = (from: Pt, to: Pt) => (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI
/** Where the line through `a` and `b` crosses the vertical at `x`. */
const atX = (a: Pt, b: Pt, x: number): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])]

// Stroke A: bar, corner, strip down, band A down to its end.
const [a0, a1, a2, a3, a4, a5, a6, a7, a8] = corners('top') as [Pt, Pt, Pt, Pt, Pt, Pt, Pt, Pt, Pt]
// Stroke B: stem up, band B up to its end.
const [s0, s1, s2, s3, s4, s5] = corners('stem') as [Pt, Pt, Pt, Pt, Pt, Pt]

/** A bend: the pivot, and how far the band turns from carrying straight on. */
const bend = (along: [Pt, Pt], pivot: Pt, end: Pt) => ({
  pivot,
  deg: heading(pivot, end) - heading(along[0], along[1]),
})
const BEND = {
  // The strip runs down from the corner; the mitre's middle is on both axes.
  a: bend([a7, a6], mid(a6, a3), mid(a4, a5)),
  // The stem runs up; band B's axis is the middle of its two edges, and
  // meets the stem's axis at its pivot.
  b: (() => {
    const axis = (s0[0] + s1[0]) / 2
    const end = mid(s3, s4)
    const dir: Pt = [s4[0] - s5[0], s4[1] - s5[1]]
    const pivot: Pt = [axis, end[1] + ((axis - end[0]) * dir[1]) / dir[0]]
    return bend([s0, s5], pivot, end)
  })(),
}
const PIECE = {
  bar: poly(a0, a1, a2, a8),
  strip: poly(a7, a2, a3, a6),
  bandA: `M${at(a6)} L${at(a3)} L${at(a4)} A${R},${R} 0 0 1 ${at(a5)} Z`,
  wedge: poly(a6, BEND.a.pivot, turn(a6, BEND.a.pivot, BEND.a.deg)),
  stem: poly(s0, s1, atX(s5, s4, s1[0]), s5),
  bandB: `M${at(s5)} L${at(s4)} A${R},${R} 0 0 1 ${at(s3)} L${at(atX(s2, s3, s0[0]))} Z`,
}

// The corner fold: the fold's first two corners are the crease.
const [CA, CB] = SHAPES.fold.xy as [Pt, Pt]
/** Mirroring over the crease, as an SVG matrix — the leaf's other side. */
const REFLECT = (() => {
  const l = Math.hypot(CB[0] - CA[0], CB[1] - CA[1])
  const dx = (CB[0] - CA[0]) / l
  const dy = (CB[1] - CA[1]) / l
  const [a, b, d] = [dx * dx - dy * dy, 2 * dx * dy, dy * dy - dx * dx]
  const e = CA[0] - (a * CA[0] + b * CA[1])
  const f = CA[1] - (b * CA[0] + d * CA[1])
  return `matrix(${[a, b, b, d, e, f].map((v) => +v.toFixed(4)).join(' ')})`
})()
/** The fold's pivot and axis, for CSS: `transform-origin` and `rotate`. */
const CREASE = {
  transformOrigin: `${((CA[0] / VW) * 100).toFixed(3)}% ${((CA[1] / VH) * 100).toFixed(3)}%`,
  '--crease': `${(CB[0] - CA[0]).toFixed(2)} ${(CB[1] - CA[1]).toFixed(2)} 0`,
} as CSSProperties
/** A bend's pivot and angle, for CSS. The band is a drawing of its own, the
 *  size of the mark, so the pivot is a share of the box — not a group inside
 *  one: Chrome draws an animated transform on an SVG group inside a leaf
 *  that is turning in 3D squashed to a sliver. */
const swing = (b: { pivot: Pt; deg: number }) =>
  ({
    transformOrigin: `${((b.pivot[0] / VW) * 100).toFixed(3)}% ${((b.pivot[1] / VH) * 100).toFixed(3)}%`,
    '--bend': `${(-b.deg).toFixed(2)}deg`,
  }) as CSSProperties

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

  /** The drawing's gradient, under `g`, and a sheen for the light. */
  const defs = (k: string) => (
    <defs>
      <linearGradient id={`${id}${k}g`} gradientUnits="userSpaceOnUse" x1={GRAD.x1} y1={GRAD.y1} x2={GRAD.x2} y2={GRAD.y2}>
        {STOPS.map((s) => (
          <stop key={s.offset} offset={s.offset} stopColor={s['stop-color']} />
        ))}
      </linearGradient>
      <radialGradient
        id={`${id}${k}s`}
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
    </defs>
  )

  /** Light and shade for one face, over `d`. */
  const light = (n: Name, d: string) => (
    <>
      <path d={d} fill="#a8f4ff" style={{ opacity: `var(--lit-${n}, 0)` }} />
      <path d={d} fill="#00407a" style={{ opacity: `var(--dim-${n}, 0)` }} />
    </>
  )

  /** One piece of ribbon: its paper, the drawing's faces on it, the light on
   *  both, and the sheen clipped to it. */
  const piece = (k: string, svg: string, d: string, lit: Name, faces: Name[] = [], under?: string) => (
    <>
      {under && <path d={under} fill={`url(#${id}${svg}g)`} />}
      <path d={d} fill={`url(#${id}${svg}g)`} />
      {faces.map((n) => (
        <path key={n} d={SHAPES[n].d} fill={SHAPES[n].fill} fillOpacity={SHAPES[n].alpha} />
      ))}
      {light(lit, d)}
      {faces.map((n) => (n === lit ? null : <g key={n}>{light(n, SHAPES[n].d)}</g>))}
      <clipPath id={`${id}${k}c`}>
        <path d={d} />
      </clipPath>
      <rect
        className="sheen"
        width={VW}
        height={VH}
        fill={`url(#${id}${svg}s)`}
        clipPath={`url(#${id}${k}c)`}
        style={{ opacity: 'var(--sheen, 0)' }}
      />
    </>
  )

  const view = VIEW.join(' ')
  return (
    <div className="mark" ref={host} style={CREASE}>
      <div className="tilt">
        <svg className="stem" viewBox={view} aria-hidden="true">
          {defs('b')}
          {piece('stem', 'b', PIECE.stem, 'stem')}
        </svg>
        <svg className="band-b" viewBox={view} style={swing(BEND.b)} aria-hidden="true">
          {defs('bb')}
          {piece('bandB', 'bb', PIECE.bandB, 'stem', ['over'])}
        </svg>
        <svg className="top" viewBox={view} aria-hidden="true">
          {defs('t')}
          {piece('bar', 't', PIECE.bar, 'top')}
        </svg>
        {/* Everything past the crease is a leaf with two sides: the ribbon as
            drawn — band A on its elbow under the strip, the flap lifted a
            little off them — and its other side, mirrored over the crease and
            straight, turned half round so it faces away until the leaf has
            turned it back. */}
        <div className="lift">
          <div className="leaf" style={CREASE}>
            <svg className="band-a" viewBox={view} style={swing(BEND.a)} aria-hidden="true">
              {defs('ba')}
              {piece('bandA', 'ba', PIECE.bandA, 'top', [], PIECE.wedge)}
            </svg>
            <svg className="body" viewBox={view} aria-hidden="true">
              {defs('a')}
              {piece('strip', 'a', PIECE.strip, 'top', ['back'])}
            </svg>
            <svg className="flap" viewBox={view} aria-hidden="true">
              {defs('f')}
              {piece('fold', 'f', SHAPES.fold.d, 'fold', ['fold'])}
            </svg>
            <svg className="unfolded" viewBox={view} style={CREASE} aria-hidden="true">
              {defs('u')}
              {/* Outlined in its own fill, so the pieces close up into one
                  ribbon rather than showing a hairline at every join. */}
              <g transform={REFLECT} fill={`url(#${id}ug)`} stroke={`url(#${id}ug)`} strokeWidth="1.2">
                <g transform={`rotate(${(-BEND.a.deg).toFixed(2)} ${at(BEND.a.pivot).replace(',', ' ')})`}>
                  <path d={PIECE.wedge} />
                  <path d={PIECE.bandA} />
                </g>
                <path d={PIECE.strip} />
                <path d={SHAPES.fold.d} />
              </g>
            </svg>
          </div>
        </div>
      </div>
    </div>
  )
}
