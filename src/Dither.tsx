import { useEffect, useRef } from 'react'

/**
 * The title's slide on the flat index's stage, live: the mark, ordered-dithered
 * wherever the cursor is. The project plates beside it each answer the pointer
 * in their own project's terms; the mark is the site's, and a site that is
 * mostly a renderer answers in a renderer's oldest trick — a Bayer matrix.
 *
 * Under the cursor the mark breaks into cells, and the closer to the cursor the
 * fewer colours each channel is allowed: four levels at the edge of the field,
 * three, then two — pure 1-bit-per-channel, where its cyan turns to a cyan and
 * white and blue weave — and at the very middle the cells double in size. Even
 * the edge between the dithered and the clean mark is dithered: a cell turns
 * once the field's strength there passes the matrix's own threshold for it.
 *
 * A cell does not change, it **flips**: edge-on and back like a tile on a
 * split-flap board, the old face going away darkening and the new one coming
 * round, each cell a beat behind its neighbours by its own threshold, so a
 * moving cursor sends a ripple through the grid. Behind it the field fades
 * over a third of a second, so it leaves a wake; a still cursor is a still
 * picture once the last flip lands. No idle motion.
 *
 * **The fly-in** is CSS, not this canvas: the mark's two strokes are the same
 * picture twice, each clipped to its half of the gap between them (`.part` in
 * `index.css` — the boundary is the middle of that gap, so neither clip ever
 * crosses a stroke), and each flies in along the mark's own diagonal from
 * opposite corners, whenever the slide comes on stage — on load, and every
 * time the page is scrolled back up to the title. CSS, so it plays from the
 * first paint and with no script at all. The handover to this canvas is CSS
 * too, on the same clock as the flight: an animation event fires only once a
 * delay is over, which is too late for a slide that waits before it flies.
 *
 * Under reduced motion nothing flies and nothing flips, and there is no wake:
 * the field is where the cursor is and nowhere else. Without a script it is
 * the two halves, at rest after their flight.
 */

/** Bayer's 8 × 8 index matrix, as thresholds in (0, 1). */
const BAYER = (() => {
  const m = new Float32Array(64)
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      // Bit-interleave x ^ y and y, reversed: the classic recursive layout.
      let v = 0
      for (let b = 0, xy = x ^ y, yy = y; b < 3; b++, xy >>= 1, yy >>= 1) v = (v << 2) | ((xy & 1) << 1) | (yy & 1)
      m[y * 8 + x] = (v + 0.5) / 64
    }
  return m
})()

/** A cell, in CSS pixels; the middle of the field uses two by two of them. */
const CELL = 4
/** The field's spread, as a fraction of the mark's width. */
const SPREAD = 0.17
/** How long the wake takes to fall to 1/e, ms. */
const WAKE = 340
/** A flip, edge-on and back, ms — and the most a cell waits for its turn. */
const FLIP = 280
const RIPPLE = 90

export function Dither({ src }: { src: string }) {
  const host = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const box = host.current
    const cv = canvas.current
    if (!box || !cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    const img = new Image()
    img.decoding = 'async'
    img.src = src
    let ready = false
    let dead = false

    // The mark at the canvas's own resolution, and the frame drawn from it.
    let w = 0
    let h = 0
    let c = 1
    let cols = 0
    let rows = 0
    let mark = new Uint32Array(0)
    let out: ImageData | null = null
    let heat = new Float32Array(0)
    // Per cell: the face it shows (`face`, with `plain` for the mark itself),
    // the face it is flipping away from, and when that flip began.
    let face = new Uint32Array(0)
    let plain = new Uint8Array(0)
    let was = new Uint32Array(0)
    let wasPlain = new Uint8Array(0)
    let flipped = new Float64Array(0)

    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      w = Math.max(1, Math.round(r.width * dpr))
      h = Math.max(1, Math.round(r.height * dpr))
      cv.width = w
      cv.height = h
      c = Math.max(2, Math.round(CELL * dpr))
      cols = Math.ceil(w / c)
      rows = Math.ceil(h / c)
      const n = cols * rows
      heat = new Float32Array(n)
      face = new Uint32Array(n)
      plain = new Uint8Array(n).fill(1)
      was = new Uint32Array(n)
      wasPlain = new Uint8Array(n).fill(1)
      flipped = new Float64Array(n).fill(-1e9)
      if (!ready) return
      ctx.clearRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      mark = new Uint32Array(ctx.getImageData(0, 0, w, h).data.buffer)
      out = ctx.createImageData(w, h)
    }

    // Packing a colour the platform's own way round, so nothing here assumes
    // which end of a word is red.
    const px = new Uint8ClampedArray(4)
    const px32 = new Uint32Array(px.buffer)
    const pack = (r: number, g: number, b: number, al: number) => {
      px[0] = r
      px[1] = g
      px[2] = b
      px[3] = al
      return px32[0]!
    }
    const unpack = (v: number) => {
      px32[0] = v
      return px
    }

    /** Where the cursor is, in cells — or nowhere. */
    let at: [number, number] | null = null
    let last = 0

    /** The face a cell should show for the field as it is: 0 and `true` for
     *  the clean mark, otherwise its dithered colour (0 is a hole). */
    const target = (i: number, j: number): [number, boolean] => {
      const f = heat[j * cols + i]!
      const coarse = f > 0.82
      const bi = coarse ? i >> 1 : i
      const bj = coarse ? j >> 1 : j
      const t = BAYER[(bj & 7) * 8 + (bi & 7)]!
      if (f <= t * 0.6) return [0, true]
      // One sample for the cell (or its block of four), every channel
      // quantised against the matrix — fewer levels the hotter. Coverage is a
      // cut at half, not dithered: the mark is about 85% opaque all over, and
      // dithering that punches holes in it. Each cell keeps its translucency.
      const span = coarse ? c * 2 : c
      const sx = Math.min(w - 1, (coarse ? (i & ~1) * c : i * c) + (span >> 1))
      const sy = Math.min(h - 1, (coarse ? (j & ~1) * c : j * c) + (span >> 1))
      const s = unpack(mark[sy * w + sx]!)
      const r = s[0]!
      const g = s[1]!
      const b = s[2]!
      const al = s[3]!
      if (al <= 127) return [0, false]
      const steps = f > 0.62 ? 1 : f > 0.34 ? 2 : 3
      const q = (n: number) => (Math.min(steps, Math.floor((n / 255) * steps + t)) / steps) * 255
      return [pack(q(r), q(g), q(b), al), false]
    }

    /** A face as one flat colour, darkened by how edge-on it is — what a cell
     *  shows in the middle of a flip. The clean mark is its cell's centre. */
    const flat = (i: number, j: number, v: number, isPlain: boolean, lit: number) => {
      if (isPlain) v = mark[Math.min(h - 1, j * c + (c >> 1)) * w + Math.min(w - 1, i * c + (c >> 1))]!
      if (!v) return 0
      const s = unpack(v)
      return pack(s[0]! * lit, s[1]! * lit, s[2]! * lit, s[3]!)
    }

    /** Settles every cell's face against the field, and draws. True while a
     *  flip is still in the air. */
    const draw = (now: number) => {
      if (!out) return false
      const o = new Uint32Array(out.data.buffer)
      const quiet = still.matches
      let busy = false
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const n = j * cols + i
          const [v, isPlain] = target(i, j)
          if (v !== face[n] || (isPlain ? 1 : 0) !== plain[n]) {
            const p = (now - flipped[n]!) / FLIP
            // Going away still (or not yet started): only the face it is
            // coming round to changes. Otherwise a new flip, from what it
            // shows now.
            if (!(p < 0.5)) {
              was[n] = face[n]!
              wasPlain[n] = plain[n]!
              const t = BAYER[(j & 7) * 8 + (i & 7)]!
              flipped[n] = quiet ? -1e9 : now + t * RIPPLE
            }
            face[n] = v
            plain[n] = isPlain ? 1 : 0
          }
          const x0 = i * c
          const y0 = j * c
          const x1 = Math.min(x0 + c, w)
          const y1 = Math.min(y0 + c, h)
          const p = (now - flipped[n]!) / FLIP
          if (p < 1) {
            busy = true
            // Edge-on at the half: the first half is the old face narrowing,
            // the second the new one widening, both squeezed about the cell's
            // own middle.
            const back = p < 0.5
            const s = p < 0 ? 1 : Math.abs(Math.cos(Math.PI * p))
            const col = back
              ? flat(i, j, was[n]!, wasPlain[n] === 1, 0.45 + 0.55 * s)
              : flat(i, j, face[n]!, plain[n] === 1, 0.45 + 0.55 * s)
            const half = ((x1 - x0) * s) / 2
            const mid = (x0 + x1) / 2
            const l = Math.round(mid - half)
            const r = Math.round(mid + half)
            for (let y = y0; y < y1; y++) {
              o.fill(0, y * w + x0, y * w + x1)
              if (r > l) o.fill(col, y * w + l, y * w + r)
            }
          } else if (plain[n]) {
            for (let y = y0; y < y1; y++) o.set(mark.subarray(y * w + x0, y * w + x1), y * w + x0)
          } else {
            for (let y = y0; y < y1; y++) o.fill(face[n]!, y * w + x0, y * w + x1)
          }
        }
      }
      ctx.putImageData(out, 0, 0)
      return busy
    }

    let raf = 0
    const frame = (now: number) => {
      raf = 0
      const dt = last ? now - last : 16
      last = now
      const keep = still.matches ? 0 : Math.exp(-dt / WAKE)
      const sig = cols * SPREAD
      const k = 1 / (2 * sig * sig)
      let moving = false
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const n = j * cols + i
          const prev = heat[n]!
          let g = 0
          if (at) {
            const dx = i + 0.5 - at[0]
            const dy = j + 0.5 - at[1]
            g = Math.exp(-(dx * dx + dy * dy) * k)
          }
          let v = Math.max(prev * keep, g)
          if (v < 0.01) v = 0
          if (Math.abs(v - prev) > 0.002) moving = true
          heat[n] = v
        }
      }
      const flipping = draw(now)
      if ((moving || flipping) && !dead) raf = requestAnimationFrame(frame)
      else last = 0
    }
    const kick = () => {
      if (!raf && !dead && ready) raf = requestAnimationFrame(frame)
    }

    img
      .decode()
      .then(() => {
        if (dead) return
        ready = true
        size()
        draw(performance.now())
        box.dataset.live = ''
      })
      .catch(() => {})

    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      at = [((e.clientX - r.left) / r.width) * cols, ((e.clientY - r.top) / r.height) * rows]
      kick()
    }
    const leave = () => {
      at = null
      kick()
    }
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerdown', move)
    cv.addEventListener('pointerleave', leave)
    cv.addEventListener('pointercancel', leave)
    const ro = new ResizeObserver(() => {
      size()
      draw(performance.now())
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
      delete box.dataset.live
    }
  }, [src])

  return (
    <div className="mark" ref={host}>
      <img className="part top" src={src} alt="" decoding="async" />
      <img className="part stem" src={src} alt="" decoding="async" />
      <canvas ref={canvas} />
    </div>
  )
}
