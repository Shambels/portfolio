import { useEffect, useRef } from 'react'

/**
 * PolarSense's plate on the flat index's stage, alive: its logo — an iceberg
 * of data bars, the part that shows above the line and the far larger part
 * that does not — rendered as ice by OpenArt from Seb's mark and cut by
 * `tools/plate.py`, put in water.
 *
 * - **The sea** is drawn here, not in the picture: a dark body of water from
 *   the gap between the bars down, the submerged bars seen through it and
 *   dimmer and bluer the deeper they go, a lit line where the surface is, a
 *   faint broken reflection of the part above just under it, and caustics.
 * - **The cursor stirs it.** Over the bottom half, the pointer's path is
 *   written into a height field — harder the faster it moves — and a wave
 *   equation carries that outward. Everything under the line is seen through
 *   that surface, so it bends where the water does; the surface line rides
 *   the same field, and the caustics are its curvature, not a texture.
 * - **The iceberg rides it.** A floating body's roll and heave: two lightly
 *   damped oscillators with slow periods of their own (3.8 s and 2.9 s),
 *   shoved by the water around it — harder the rougher it is, and toward the
 *   side with more wave on it — for as long as there are ripples. It answers
 *   at its own pace whatever pushes it, and when the water calms it swings
 *   back through level a few times, each swing smaller, until it settles. Now and then a drop falls somewhere on its own, so the sea
 *   is never quite still.
 *
 * Raw WebGL: one quad, one fragment shader, the field uploaded as a small
 * texture each frame. No three — this is the flat index, and it must not pull
 * in the world's chunk. Without WebGL, with JS off, and under
 * `prefers-reduced-motion` it is a still picture: the ice, and under the line
 * a CSS sea (`.sea`); the reduced-motion canvas draws the sea once, flat.
 */

/** The plate is 900 × 1162. The waterline is the empty gap between the bars —
 *  source row 744, plate row 462.8 (`tools/plate.py`, `polarsense`). */
const W = 900
const H = 1162
export const WATER = 462.8 / H
/** Where it turns: on its centreline, a little under the waterline — an
 *  iceberg's weight is mostly below it. */
const PIVOT: [number, number] = [450 / W, (462.8 + 110) / H]
/** Its waterline, across the plate, where the field is read to rock it. */
const BERG: [number, number] = [66 / W, 836 / W]

/** The height field over the sea: columns across the plate, rows from the
 *  waterline to the plate's foot. */
const GW = 96
const GH = 72

/** The field's range each way, as it is handed to the shader. */
const SCALE = 4.25

const SEA = {
  /** Kept of a wave each step; the rest is the water's viscosity. */
  damp: 0.984,
  /** The pointer's push per plate unit a millisecond, and its cap. */
  push: 1.1,
  most: 2.4,
  /** A stray drop, now and then, and how hard. */
  drip: [1800, 4200] as const,
  dripAmp: 0.35,
  /** How far the field bends the view (uv per unit of slope), and lifts the line. */
  bend: 0.07,
  lift: 0.004,
  /** The ice on the water: a roll and a heave, each a lightly damped
   *  oscillator with its own period (s) and damping ratio, pushed by the
   *  water around it — `side`, the difference in wave energy either side of
   *  its centreline (waves on the right lift the right); `level`, the water's
   *  height under it; `jostle`, the rougher the water the harder it is
   *  shoved, in a direction that wanders — and drawn through a soft cap
   *  (`most`, radians and uv). Slow on purpose: a 3.8 s roll and a 2.9 s
   *  heave, and a light damping, so it takes several swings to settle. */
  tilt: { period: 1.8, zeta: 0.2, side: 0.6, jostle: 0.1, most: 0.06 },
  bob: { period: 1, zeta: 0.1, level: 0.4, jostle: 0.056, most: 0.012 },
  /** How long the ice takes to feel a change in the sea (s). */
  feel: 0.35,
}

const VS = `attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`

const FS = () => `precision highp float;
varying vec2 uv;
uniform sampler2D ice, field;
uniform float water, ang, bob, aspect, bend, lift, still;
uniform vec2 pivot, texel;

float hf(vec2 q){ return (texture2D(field, q).r - .5) * ${SCALE.toFixed(2)}; }

vec4 iceAt(vec2 p){
  vec2 d = p - pivot - vec2(0., bob);
  d.x *= aspect;
  float c = cos(-ang), s = sin(-ang);
  d = vec2(c * d.x - s * d.y, s * d.x + c * d.y);
  d.x /= aspect;
  vec2 q = pivot + d;
  if (q.x < 0. || q.x > 1. || q.y < 0. || q.y > 1.) return vec4(0.);
  vec4 t = texture2D(ice, q);
  return vec4(t.rgb * t.a, t.a);
}

void main(){
  float sx = smoothstep(0., .16, uv.x) * smoothstep(1., .84, uv.x);
  float surf = hf(vec2(uv.x, .5 * texel.y));
  float line = water + surf * lift;
  vec4 top = iceAt(uv);
  if (uv.y < line - .004) { gl_FragColor = top; return; }

  float depth = max(uv.y - line, 0.) / (1. - water);
  vec2 q = vec2(uv.x, max(uv.y - water, 0.) / (1. - water));
  float h = hf(q);
  float hx = hf(q + vec2(texel.x, 0.)) - hf(q - vec2(texel.x, 0.));
  float hy = hf(q + vec2(0., texel.y)) - hf(q - vec2(0., texel.y));
  float lap = hf(q + vec2(texel.x, 0.)) + hf(q - vec2(texel.x, 0.)) + hf(q + vec2(0., texel.y)) + hf(q - vec2(0., texel.y)) - 4. * h;
  vec2 bent = vec2(hx, hy) * bend;

  // The submerged ice, seen through the water: dimmer and bluer with depth.
  vec4 sub = iceAt(uv + bent);
  float att = exp(-depth * 2.2);
  vec3 seen = sub.rgb * mix(vec3(.2, .55, 1.), vec3(.92), att) * (.3 + .6 * att);

  // The part above, broken up in the surface just under it.
  vec2 m = vec2(uv.x, 2. * line - uv.y) + bent * 2.5;
  vec4 refl = iceAt(m) * .2 * (1. - smoothstep(0., .07, uv.y - line));

  // The water itself: deep blue-black, lit just under the surface, fading out
  // at the sides and the foot so the stage never shows a box.
  float body = .9 * sx * (1. - smoothstep(.86, 1., uv.y));
  vec3 sea = mix(vec3(.035, .17, .27), vec3(.008, .05, .1), smoothstep(0., .7, depth));
  sea += vec3(.07, .3, .42) * (1. - smoothstep(0., .12, uv.y - line));
  float caus = clamp(-lap * 6., 0., 1.) * (1. - depth) * (1. - still);
  sea += vec3(.25, .65, .85) * caus * .45;

  // The surface: a thin lit line, and its glow.
  float d = abs(uv.y - line) * 1162.;
  float glow = (exp(-d / 1.1) * .9 + exp(-d / 7.) * .25) * sx;

  vec3 rgb = seen + refl.rgb * body + sea * body * (1. - sub.a * .7) + vec3(.55, .9, 1.) * glow;
  float a = 1. - (1. - body) * (1. - sub.a);
  a = max(a, glow);
  // Above the line but within its glow: the ice over it.
  if (uv.y < line) { rgb = top.rgb + vec3(.55, .9, 1.) * glow; a = max(top.a, glow); }
  gl_FragColor = vec4(rgb, a);
}`

export function Iceberg({ on, plate }: { on: boolean; plate: { light: string } }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const onRef = useRef(on)
  onRef.current = on

  useEffect(() => {
    const cv = canvas.current
    const host = cv?.parentElement
    if (!cv || !host) return
    // WebGL2 where there is one, for a half-float field that filters smoothly;
    // WebGL1 takes the field as bytes, which is coarser in the caustics.
    const opts: WebGLContextAttributes = { premultipliedAlpha: true, alpha: true, antialias: false }
    const gl2 = cv.getContext('webgl2', opts)
    const gl = (gl2 ?? cv.getContext('webgl', opts)) as WebGLRenderingContext | null
    // Anything wrong with WebGL — none, a lost context, a shader this GPU will
    // not compile — leaves the still picture and the CSS sea, which is what
    // the plate is without a script. It never reaches the page: an effect
    // that throws takes the whole route down to its error page.
    if (!gl || gl.isContextLost()) return
    const still = matchMedia('(prefers-reduced-motion: reduce)')

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s
      if (import.meta.env.DEV) console.warn('Iceberg shader:', gl.getShaderInfoLog(s))
      gl.deleteShader(s)
      return null
    }
    const vs = shader(gl.VERTEX_SHADER, VS)
    const fs = shader(gl.FRAGMENT_SHADER, FS())
    const prog = gl.createProgram()
    if (!vs || !fs || !prog) return
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const u = (n: string) => gl.getUniformLocation(prog, n)
    gl.uniform1i(u('ice'), 0)
    gl.uniform1i(u('field'), 1)
    gl.uniform1f(u('water'), WATER)
    gl.uniform2f(u('pivot'), PIVOT[0], PIVOT[1])
    gl.uniform2f(u('texel'), 1 / GW, 1 / GH)
    gl.uniform1f(u('aspect'), W / H)
    gl.uniform1f(u('bend'), SEA.bend)
    gl.uniform1f(u('lift'), SEA.lift)
    const uAng = u('ang')
    const uBob = u('bob')
    const uStill = u('still')

    const texture = (unit: number) => {
      const t = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    }
    const textures = [texture(0), texture(1)]
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)

    // ---- the water
    let cur = new Float32Array(GW * GH)
    let prev = new Float32Array(GW * GH)
    // The field goes up as `0.5 + h / SCALE`, so the shader reads it the same
    // way whichever form it arrives in.
    const bytes = new Uint8Array(GW * GH)
    const halves = new Float32Array(GW * GH)
    const upload = () => {
      gl.activeTexture(gl.TEXTURE1)
      if (gl2) {
        for (let i = 0; i < halves.length; i++) halves[i] = 0.5 + cur[i]! / SCALE
        gl2.texImage2D(gl2.TEXTURE_2D, 0, gl2.R16F, GW, GH, 0, gl2.RED, gl2.FLOAT, halves)
      } else {
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.max(0, Math.min(255, 255 * (0.5 + cur[i]! / SCALE)))
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, GW, GH, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, bytes)
      }
    }
    const step = () => {
      const next = prev
      for (let y = 0; y < GH; y++) {
        for (let x = 0; x < GW; x++) {
          const i = y * GW + x
          const l = x > 0 ? cur[i - 1]! : 0
          const r = x < GW - 1 ? cur[i + 1]! : 0
          // The top row is the surface: free, so it heaves with what is under it.
          const up = y > 0 ? cur[i - GW]! : cur[i]!
          const dn = y < GH - 1 ? cur[i + GW]! : 0
          next[i] = ((l + r + up + dn) / 2 - next[i]!) * SEA.damp
        }
      }
      prev = cur
      cur = next
    }
    /** A push at plate `(x, y)` of `amp`, spread over a cell and a half. */
    const poke = (x: number, y: number, amp: number) => {
      const gx = (x / W) * GW
      const gy = ((y / H - WATER) / (1 - WATER)) * GH
      for (let j = Math.floor(gy - 2); j <= Math.ceil(gy + 2); j++) {
        for (let i = Math.floor(gx - 2); i <= Math.ceil(gx + 2); i++) {
          if (i < 0 || j < 0 || i >= GW || j >= GH) continue
          const d = Math.hypot(i - gx, j - gy)
          if (d > 2) continue
          cur[i + j * GW]! -= amp * (1 - d / 2) ** 2
        }
      }
    }

    // ---- the ice on it
    let ang = 0
    let angV = 0
    let bob = 0
    let bobV = 0
    const [c0, c1] = [Math.floor(BERG[0] * GW), Math.ceil(BERG[1] * GW)]
    const mid = (c0 + c1) / 2
    // What the water near it is doing: how much it is moving on either side
    // of its centreline over the top few rows (the energy of the waves, which
    // does not cancel the way their heights do), and its level under the ice.
    const ROWS = 10
    const x0 = Math.max(0, c0 - 6)
    const x1 = Math.min(GW, c1 + 6)
    let seaE = 0
    let seaSide = 0
    let seaLevel = 0
    // Which way the waves are jostling it, and how: a slow random lean for
    // roll and for heave, each wandering on about the body's own half-period,
    // scaled by how rough the water is — so it rocks as long as there are
    // ripples, and not at all on a flat sea.
    let joA = 0
    let joB = 0
    const wander = (v: number, dt: number, tau: number) =>
      v - (v * dt) / tau + Math.sqrt((2 * dt) / tau) * (Math.random() * 2 - 1) * 1.732
    const rock = (dt: number) => {
      let eL = 0
      let eR = 0
      for (let y = 0; y < ROWS; y++) {
        for (let x = x0; x < x1; x++) {
          const h = cur[y * GW + x]!
          if (x < mid) eL += h * h
          else eR += h * h
        }
      }
      const n = (ROWS * (x1 - x0)) / 2
      eL /= n
      eR /= n
      let level = 0
      for (let x = c0; x < c1; x++) level += cur[x]!
      level /= c1 - c0
      const f = 1 - Math.exp(-dt / SEA.feel)
      seaE += ((eL + eR) / 2 - seaE) * f
      seaSide += (eR - eL - seaSide) * f
      seaLevel += (level - seaLevel) * f
      const rough = Math.sqrt(seaE)
      joA = wander(joA, dt, SEA.tilt.period / 2)
      joB = wander(joB, dt, SEA.bob.period / 2)

      // Two lightly damped oscillators — a floating body's roll and heave —
      // each with a natural period, so whatever pushes it, it answers at its
      // own slow pace and swings back through level a few times, each swing
      // smaller, before it settles.
      const T = SEA.tilt
      const B = SEA.bob
      const wT = (2 * Math.PI) / T.period
      const wB = (2 * Math.PI) / B.period
      const torque = T.side * seaSide + T.jostle * rough * joA
      angV += (-wT * wT * ang - 2 * T.zeta * wT * angV + torque) * dt
      ang += angV * dt
      const heave = -B.level * seaLevel + B.jostle * rough * joB
      bobV += (-wB * wB * bob - 2 * B.zeta * wB * bobV + heave) * dt
      bob += bobV * dt
    }

    // ---- sizing, drawing
    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      gl.viewport(0, 0, cv.width, cv.height)
    }
    size()
    let ready = false
    const draw = () => {
      if (!ready) return
      upload()
      // Drawn through a soft cap, so a wild sea leans it hard but never over.
      gl.uniform1f(uAng, SEA.tilt.most * Math.tanh(ang / SEA.tilt.most))
      gl.uniform1f(uBob, SEA.bob.most * Math.tanh(bob / SEA.bob.most))
      gl.uniform1f(uStill, still.matches ? 1 : 0)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    let raf = 0
    let visible = true
    let last = 0
    let acc = 0
    let nextDrip = performance.now() + 600
    const frame = (now: number) => {
      raf = 0
      const quiet = still.matches
      if (!quiet) {
        const dt = Math.min((now - (last || now)) / 1000, 0.05)
        last = now
        if (now > nextDrip) {
          poke(Math.random() * W, H * (WATER + (1 - WATER) * Math.random() * 0.5), SEA.dripAmp * (0.5 + Math.random()))
          nextDrip = now + SEA.drip[0] + Math.random() * (SEA.drip[1] - SEA.drip[0])
        }
        acc += dt
        while (acc > 1 / 60) {
          step()
          rock(1 / 60)
          acc -= 1 / 60
        }
      } else {
        cur.fill(0)
        prev.fill(0)
        ang = bob = angV = bobV = seaE = seaSide = seaLevel = joA = joB = 0
      }
      draw()
      if (!quiet && onRef.current && visible) raf = requestAnimationFrame(frame)
      else last = 0
    }
    let dead = false
    const kick = () => {
      if (!raf && !dead) raf = requestAnimationFrame(frame)
    }

    const img = new Image()
    img.decoding = 'async'
    img.src = plate.light
    img
      .decode()
      .then(() => {
        if (dead) return
        gl.activeTexture(gl.TEXTURE0)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
        ready = true
        host.dataset.live = ''
        kick()
      })
      .catch(() => {})

    // ---- the pointer, over the water
    let px = 0
    let py = 0
    let pt = 0
    const move = (e: PointerEvent) => {
      if (still.matches) return
      const r = cv.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * W
      const y = ((e.clientY - r.top) / r.height) * H
      const now = performance.now()
      if (pt && y > WATER * H - 8) {
        const dist = Math.hypot(x - px, y - py)
        const speed = dist / Math.max(now - pt, 8)
        const amp = Math.min(speed * SEA.push, SEA.most)
        // Along the path, a cell apart, so a fast stroke is a wake and not dots.
        const n = Math.max(1, Math.ceil(dist / (W / GW)))
        for (let k = 1; k <= n; k++) {
          const t = k / n
          const yy = py + (y - py) * t
          if (yy > WATER * H) poke(px + (x - px) * t, yy, amp / Math.sqrt(n))
        }
      }
      px = x
      py = y
      pt = now
      kick()
    }
    const out = () => {
      pt = 0
    }
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerleave', out)
    cv.addEventListener('pointercancel', out)

    const ro = new ResizeObserver(() => {
      size()
      draw()
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
    cv.addEventListener('berg:arrive', kick)
    // The GPU taken away mid-page: stop, and show the picture again.
    const lost = (e: Event) => {
      e.preventDefault()
      cancelAnimationFrame(raf)
      raf = 0
      ready = false
      delete host.dataset.live
    }
    cv.addEventListener('webglcontextlost', lost)

    return () => {
      dead = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      document.removeEventListener('visibilitychange', vis)
      still.removeEventListener('change', kick)
      cv.removeEventListener('pointermove', move)
      cv.removeEventListener('pointerleave', out)
      cv.removeEventListener('pointercancel', out)
      cv.removeEventListener('berg:arrive', kick)
      delete host.dataset.live
      // Free what this run made, and leave the context alive: React mounts an
      // effect twice in development, and a context lost here is the one the
      // second mount gets back from the same canvas.
      for (const t of textures) gl.deleteTexture(t)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      cv.removeEventListener('webglcontextlost', lost)
    }
  }, [plate.light])

  useEffect(() => {
    if (on) canvas.current?.dispatchEvent(new Event('berg:arrive'))
  }, [on])

  return (
    <>
      <div className="sea" style={{ top: `${WATER * 100}%` }} />
      <canvas ref={canvas} className="berg" />
    </>
  )
}
