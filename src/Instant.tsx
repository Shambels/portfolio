import { useEffect, useRef } from 'react'
import type { Plate } from './content'

/**
 * Memojo's plate on the flat index's stage: an instant camera on a table —
 * the same machine as the giant camera on Memojo's island, leatherette,
 * chrome and brass — that takes a picture when you point it at you.
 *
 * - **Hover the lens** and the flash charges: its window warms over half a
 *   second, then the shutter goes — a burst from the flash, the room lit
 *   white for a moment. (Never the visitor's own camera: a photo app whose
 *   point is privacy does not ask for the webcam to make a joke.)
 * - **A print feeds out of the slot**, square to the camera's face, blank and
 *   grey-green, and develops as it comes: the picture rises out of the
 *   chemistry over a few seconds. It tips off the lip onto the table and
 *   slides onto a small pile.
 * - **The pile sorts itself.** Once there are a few prints, they glide into
 *   stacks by what is in them — people, food, outdoors, places — which is the
 *   app's own trick: albums nobody had to make.
 *
 * The photographs are the case study's own sentences first — a baby laughing
 * in the garden, a ski trip with friends, dinner near the sea, red trees in
 * an autumn forest — and eight more of the same kind, generated on OpenArt
 * and cut by `tools/plate.py` (`photos()`). A 2D canvas over the photograph
 * of the camera, drawing only while something moves. Under reduced motion
 * there is no flash, and a print is simply on the pile, developed, sorted.
 * Without a script the camera sits on an empty table.
 */

// The plate is 900 × 1162, the source's top 1735 rows scaled by 900/1344.
const S = 900 / 1344
const at = (x: number, y: number): [number, number] => [x * S, y * S]

const LENS = { at: at(680, 505), r: 170 * S }
/** The flash window: a box in the plate. */
const FLASH = [at(365, 283), at(508, 382)] as const
/** The print slot's two ends, along its lip — it runs a touch uphill to the
 *  right, because the camera is turned three-quarters to us. */
const SLOT = [at(395, 795), at(935, 725)] as const

/** A print: a mini instant-film sheet, 54 × 86 with the picture square at
 *  the top and the wide margin at the foot. Width in plate units on the
 *  camera's face; the table scales it by how near it lies. */
const PRINT = { w: 190, h: 190 * (86 / 54) * 0.78, margin: 0.07, foot: 0.22 }

/** Which album each photograph belongs in — people, food, outdoors, places —
 *  by its place in the atlas (row-major, 4 × 3). */
const ALBUM = [0, 0, 1, 2, 0, 1, 2, 3, 3, 3, 2, 1]
/** Where each album's stack lies on the table, and where the pile is. */
const STACKS: [number, number][] = [
  [205, 900],
  [455, 875],
  [700, 905],
  [470, 1060],
]
const PILE: [number, number] = [690, 690]

const TIME = {
  charge: 480,
  flash: 260,
  eject: 1500,
  drop: 650,
  develop: 5200,
  sortAfter: 1100,
  sort: 900,
}

/** A pose: where a print is and how it lies — an affine map from the print's
 *  own unit square onto the plate. */
type Pose = [number, number, number, number, number, number]

/** A print lying on the table at `(x, y)`, turned `rot` in the table's plane:
 *  squashed by the table's slope, larger the nearer it lies. */
function onTable(x: number, y: number, rot: number): Pose {
  const near = 0.95 + ((y - 600) / 560) * 0.35
  const w = PRINT.w * near
  const h = PRINT.h * near
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  const tilt = 0.46
  // Unit square → centred print → turned → squashed onto the table.
  const a = w * c
  const b = w * s * tilt
  const cc = -h * s
  const d = h * c * tilt
  return [a, b, cc, d, x - (a + cc) / 2, y - (b + d) / 2]
}

/** A print standing in the slot, `out` of the way out (0..1) — square to the
 *  camera's face: its top edge along the lip, its sides straight down. */
function inSlot(out: number): Pose {
  const [[x0, y0], [x1, y1]] = SLOT
  const len = Math.hypot(x1 - x0, y1 - y0)
  const ux = (x1 - x0) / len
  const uy = (y1 - y0) / len
  const mx = (x0 + x1) / 2
  const my = (y0 + y1) / 2
  const w = PRINT.w
  const h = PRINT.h
  return [w * ux, w * uy, 0, h, mx - (w * ux) / 2, my - (w * uy) / 2 - h * (1 - out)]
}

const mix = (p: Pose, q: Pose, t: number): Pose => p.map((v, i) => v + (q[i]! - v) * t) as Pose
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const clamp = (t: number) => Math.min(Math.max(t, 0), 1)

type Print = {
  photo: number
  born: number
  /** Where it was and where it is going, and when that move began. */
  from: Pose
  to: Pose
  moved: number
  moveFor: number
  lift: number
  landed: boolean
}

export function Instant({ plate }: { on: boolean; plate: Plate }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // The prints outlive the effect: they are the visitor's pictures.
  const prints = useRef<Print[]>([])
  const next = useRef(0)

  useEffect(() => {
    const cv = canvas.current
    const src = plate.photos
    if (!cv || !src) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    const atlas = new Image()
    atlas.decoding = 'async'
    atlas.src = src
    let ready = false
    let dead = false

    let k = 1
    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      k = cv.width / 900
    }
    size()

    let charging = 0
    let fired = -1e9
    let armed = true
    let lastLand = 0
    let sorted = true

    const shoot = (now: number) => {
      fired = now
      armed = false
      const photo = next.current++ % 12
      const list = prints.current
      if (list.length >= 12) list.shift()
      const quiet = still.matches
      const p: Print = {
        photo,
        born: quiet ? now - TIME.develop : now,
        from: inSlot(0),
        to: inSlot(1),
        moved: now,
        moveFor: quiet ? 0 : TIME.eject,
        lift: 0,
        landed: false,
      }
      list.push(p)
      if (quiet) land(p, now)
      kick()
    }

    /** Off the lip, onto the pile. */
    const land = (p: Print, now: number) => {
      const jitter = () => (Math.random() - 0.5) * 60
      p.from = pose(p, now)
      p.to = onTable(PILE[0] + jitter(), PILE[1] + jitter() * 0.6, (Math.random() - 0.5) * 0.9)
      p.moved = now
      p.moveFor = still.matches ? 0 : TIME.drop
      p.lift = 60
      p.landed = true
      lastLand = now
      sorted = false
    }

    /** Into albums: each print onto its album's stack, a little askew. */
    const sort = (now: number) => {
      const counts = [0, 0, 0, 0]
      for (const p of prints.current) {
        if (!p.landed) continue
        const album = ALBUM[p.photo]!
        const n = counts[album]!++
        const [x, y] = STACKS[album]!
        const target = onTable(x + n * 5, y - n * 7, ((p.photo * 37) % 11) / 11 - 0.5 + n * 0.08)
        p.from = pose(p, now)
        p.to = target
        p.moved = now
        p.moveFor = still.matches ? 0 : TIME.sort
        p.lift = 12
      }
      sorted = true
    }

    const pose = (p: Print, now: number): Pose => {
      const t = p.moveFor ? clamp((now - p.moved) / p.moveFor) : 1
      const e = p.landed ? ease(t) : t
      const m = mix(p.from, p.to, e)
      // A drop is an arc: up off the lip, then down onto the table.
      m[5] -= p.lift * Math.sin(Math.PI * t)
      return m
    }

    const drawPrint = (p: Print, now: number) => {
      const m = pose(p, now)
      ctx.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k)
      // Its shadow on whatever it is on.
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 10 * k
      ctx.shadowOffsetY = 4 * k
      ctx.fillStyle = '#efebe2'
      ctx.fillRect(0, 0, 1, 1)
      ctx.shadowColor = 'transparent'
      // The picture square, developing: blank grey-green chemistry at first,
      // the picture rising out of it, a cast that clears last.
      const mg = PRINT.margin
      const side = 1 - 2 * mg
      const sq = (side * PRINT.w) / PRINT.h
      const d = clamp((now - p.born) / TIME.develop)
      ctx.fillStyle = '#34413d'
      ctx.fillRect(mg, mg * (PRINT.w / PRINT.h), side, sq)
      if (ready) {
        ctx.globalAlpha = d ** 1.4
        const col = p.photo % 4
        const row = Math.floor(p.photo / 4)
        ctx.drawImage(atlas, col * 320, row * 320, 320, 320, mg, mg * (PRINT.w / PRINT.h), side, sq)
        ctx.globalAlpha = (1 - d) * 0.35
        ctx.fillStyle = '#7fb3a4'
        ctx.fillRect(mg, mg * (PRINT.w / PRINT.h), side, sq)
        ctx.globalAlpha = 1
      }
    }

    let raf = 0
    const frame = (now: number) => {
      raf = 0
      const quiet = still.matches
      let busy = false

      // The flash charging while the lens is pointed at, then going off.
      if (charging && armed && now - charging > (quiet ? 0 : TIME.charge)) {
        const moving = prints.current.some((p) => !p.landed)
        if (!moving) shoot(now)
      }
      // A print all the way out tips off the lip.
      for (const p of prints.current) {
        if (!p.landed && now - p.moved >= p.moveFor) land(p, now)
      }
      if (!sorted && prints.current.filter((p) => p.landed).length >= 3 && now - lastLand > (quiet ? 0 : TIME.sortAfter)) {
        sort(now)
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)

      // The charge: the flash window warming.
      if (charging && armed && !quiet) {
        const c = clamp((now - charging) / TIME.charge)
        const [[fx0, fy0], [fx1, fy1]] = FLASH
        const g = ctx.createRadialGradient(((fx0 + fx1) / 2) * k, ((fy0 + fy1) / 2) * k, 0, ((fx0 + fx1) / 2) * k, ((fy0 + fy1) / 2) * k, 70 * k)
        g.addColorStop(0, `rgba(255,240,210,${0.55 * c * c})`)
        g.addColorStop(1, 'rgba(255,240,210,0)')
        ctx.globalCompositeOperation = 'lighter'
        ctx.fillStyle = g
        ctx.fillRect(fx0 * k - 60 * k, fy0 * k - 60 * k, (fx1 - fx0 + 120) * k, (fy1 - fy0 + 120) * k)
        ctx.globalCompositeOperation = 'source-over'
        busy = true
      }

      // The prints: those on the table first, then the one in the slot —
      // clipped to below the lip, because the rest of it is still inside.
      for (const p of prints.current) if (p.landed) drawPrint(p, now)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      for (const p of prints.current) {
        if (p.landed) continue
        ctx.save()
        const [[x0, y0], [x1, y1]] = SLOT
        ctx.beginPath()
        ctx.moveTo(x0 * k - 40 * k, (y0 + 1) * k)
        ctx.lineTo(x1 * k + 40 * k, (y1 + 1) * k)
        ctx.lineTo(x1 * k + 40 * k, 1162 * k)
        ctx.lineTo(x0 * k - 40 * k, 1162 * k)
        ctx.clip()
        drawPrint(p, now)
        ctx.restore()
        ctx.setTransform(1, 0, 0, 1, 0, 0)
      }

      // The flash going off: a burst from the window, and the room lit.
      const f = (now - fired) / TIME.flash
      if (f >= 0 && f < 1 && !quiet) {
        const [[fx0, fy0], [fx1, fy1]] = FLASH
        const cx = ((fx0 + fx1) / 2) * k
        const cy = ((fy0 + fy1) / 2) * k
        ctx.globalCompositeOperation = 'lighter'
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, (160 + 900 * f) * k)
        g.addColorStop(0, `rgba(255,253,248,${1 - f * 0.6})`)
        g.addColorStop(0.2, `rgba(255,248,236,${(1 - f) * 0.8})`)
        g.addColorStop(1, 'rgba(255,245,230,0)')
        ctx.fillStyle = g
        ctx.fillRect(0, 0, cv.width, cv.height)
        ctx.fillStyle = `rgba(255,250,240,${(1 - f) ** 2 * 0.45})`
        ctx.fillRect(0, 0, cv.width, cv.height)
        ctx.globalCompositeOperation = 'source-over'
        busy = true
      }

      for (const p of prints.current) {
        if (now - p.moved < p.moveFor || now - p.born < TIME.develop) busy = true
      }
      if (!sorted) busy = true
      if ((busy || (charging && armed)) && !dead) raf = requestAnimationFrame(frame)
    }
    const kick = () => {
      if (!raf && !dead) raf = requestAnimationFrame(frame)
    }

    atlas
      .decode()
      .then(() => {
        if (dead) return
        ready = true
        kick()
      })
      .catch(() => {})

    // ---- the pointer: the lens is the only thing to aim at
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * 900
      const y = ((e.clientY - r.top) / r.height) * 1162
      const onLens = Math.hypot(x - LENS.at[0], y - LENS.at[1]) < LENS.r
      cv.style.cursor = onLens ? 'pointer' : ''
      if (onLens) {
        if (!charging) charging = performance.now()
        kick()
      } else if (charging) {
        charging = 0
        armed = true
        kick()
      }
    }
    const out = () => {
      charging = 0
      armed = true
      kick()
    }
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerdown', move)
    cv.addEventListener('pointerleave', out)
    cv.addEventListener('pointercancel', out)
    const ro = new ResizeObserver(() => {
      size()
      kick()
    })
    ro.observe(cv)
    kick()

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerdown', move)
      cv.removeEventListener('pointerleave', out)
      cv.removeEventListener('pointercancel', out)
    }
  }, [plate])

  return <canvas ref={canvas} className="instant" />
}
