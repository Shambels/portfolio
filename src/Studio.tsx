import { useEffect, useRef } from 'react'
import type { Plate } from './content'

/**
 * Arts by Sandra's plate on the flat index's stage: an easel with a blank
 * primed canvas, and a palette of six oils with a rag over its edge — Sandra
 * teaches drawing and painting, and this is the one stage the visitor makes
 * something on.
 *
 * - **The canvas carries an underdrawing**, a pencil-and-charcoal sketch of a
 *   still life, multiplied onto the canvas the scene already lights.
 * - **The palette loads the brush.** Pointing at a blob picks up that colour —
 *   cadmium red, cadmium yellow, ultramarine, viridian, titanium white, burnt
 *   umber — and a full load of it; the cursor becomes a dab of it.
 * - **The canvas takes paint.** Moving over it lays down bristle strokes in
 *   the loaded colour, thinning as the brush runs dry, and each stroke is
 *   modelled by the finished painting hidden under the sketch: dark where the
 *   painting is dark, catching light where it is lit, with a sheen off the
 *   ridges of the paint. So the still life comes out of the canvas in
 *   whatever colours the visitor paints it with.
 * - **The rag wipes it.** The paint stays until then — across the swipe away
 *   and back — because it is the visitor's.
 *
 * Nothing moves on its own, so there is nothing for reduced motion to stop
 * but the wipe, which is instant under it. Raw WebGL, as the iceberg: one
 * quad, the canvas found in the plate by its four corners. Without it, and
 * with JS off, the sketch sits on the canvas as an image (`.sketch`).
 */

import { BLOBS, BLOB_R, CORNERS, INV, PH, PW, RAG, toCanvas, W, H } from './easel'

const BRUSH = {
  /** Bristle width in paint-layer pixels, and the spacing of its dabs. */
  size: 52,
  step: 1.8,
  /** How far a full load goes (paint-layer px) before the brush is dry. */
  reach: 2600,
  /** What is left on a dry brush — enough to scumble. */
  dry: 0.18,
}

const VS = `attribute vec2 p;varying vec2 uv;void main(){uv=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}`

const FS = `precision highp float;
varying vec2 uv;
uniform sampler2D scene, sketch, painting, paint;
uniform mat3 inv;
uniform vec2 texel;

float lum(vec3 c){ return dot(c, vec3(.3, .59, .11)); }

void main(){
  vec4 s = texture2D(scene, uv);
  vec3 col = s.rgb;
  vec3 q = inv * vec3(uv, 1.);
  vec2 c = q.xy / q.z;
  if (c.x > 0. && c.x < 1. && c.y > 0. && c.y < 1.) {
    // How the lamp falls on this bit of canvas, from the primed canvas itself.
    float lamp = clamp(lum(s.rgb) / .82, .35, 1.15);
    col *= mix(vec3(1.), texture2D(sketch, c).rgb, .8);

    vec4 p = texture2D(paint, c);
    if (p.a > .002) {
      float l = lum(texture2D(painting, c).rgb);
      // The hidden painting's value, in the loaded colour: deep in its
      // shadows, the colour itself in its half-tones, lifting toward white in
      // its lights.
      vec3 pc = p.rgb * (.16 + 1.3 * l);
      pc = mix(pc, vec3(1., .985, .95), smoothstep(.6, 1., l) * .5);
      // Impasto: the ridges of the stroke and of the painting's own
      // brushwork, lit from the lamp's side.
      float ax = texture2D(paint, c + vec2(texel.x, 0.)).a - texture2D(paint, c - vec2(texel.x, 0.)).a;
      float ay = texture2D(paint, c + vec2(0., texel.y)).a - texture2D(paint, c - vec2(0., texel.y)).a;
      float lx = lum(texture2D(painting, c + vec2(texel.x, 0.)).rgb) - lum(texture2D(painting, c - vec2(texel.x, 0.)).rgb);
      float ly = lum(texture2D(painting, c + vec2(0., texel.y)).rgb) - lum(texture2D(painting, c - vec2(0., texel.y)).rgb);
      vec3 n = normalize(vec3(-(ax * .35 + lx * 2.4), -(ay * .35 + ly * 2.4), 1.));
      float sheen = pow(max(dot(n, normalize(vec3(-.55, -.6, .9))), 0.), 28.) * .22;
      col = mix(col, pc * lamp, p.a) + sheen * p.a * lamp;
    }
  }
  gl_FragColor = vec4(col * s.a, s.a);
}`

/** One dab of the brush: bristles along its length, ragged at both ends,
 *  each its own weight — drawn once, white, and tinted per colour. */
function bristles(): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  let seed = 11
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  // A filbert's footprint: a soft body of paint, rounded at both ends…
  const body = g.createRadialGradient(32, 32, 4, 32, 32, 26)
  body.addColorStop(0, 'rgba(255,255,255,.55)')
  body.addColorStop(0.7, 'rgba(255,255,255,.35)')
  body.addColorStop(1, 'rgba(255,255,255,0)')
  g.save()
  g.translate(32, 32)
  g.scale(1, 0.72)
  g.translate(-32, -32)
  g.fillStyle = body
  g.fillRect(0, 0, 64, 64)
  g.restore()
  // …and the bristles' tracks through it, each its own weight and length.
  g.lineCap = 'round'
  for (let n = 0; n < 90; n++) {
    const y = 14 + rnd() * 36
    const across = 1 - Math.abs(y - 32) / 18
    const half = 10 + 14 * Math.sqrt(Math.max(across, 0)) * (0.7 + rnd() * 0.3)
    g.strokeStyle = `rgba(255,255,255,${(0.2 + rnd() * 0.8) * Math.max(across, 0.15)})`
    g.lineWidth = 0.5 + rnd() * 1.4
    g.beginPath()
    g.moveTo(32 - half, y)
    g.lineTo(32 + half, y + (rnd() - 0.5) * 1.5)
    g.stroke()
  }
  return c
}

const cursorFor = (paint: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='26' height='26'><circle cx='13' cy='13' r='8' fill='${paint}' stroke='white' stroke-opacity='.85' stroke-width='1.5'/></svg>`,
  )}") 13 13, crosshair`

export function Studio({ plate }: { on: boolean; plate: Plate }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  // The paint outlives the effect — it is the visitor's, and the effect may
  // run again (a resize of the dev server, React's double mount) without it
  // being wiped. Only the rag clears it.
  const layer = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = canvas.current
    const host = cv?.parentElement
    const { base, painting, sketch } = plate
    if (!cv || !host || !base || !painting || !sketch) return
    const opts: WebGLContextAttributes = { premultipliedAlpha: true, alpha: true, antialias: false }
    const gl = (cv.getContext('webgl2', opts) ?? cv.getContext('webgl', opts)) as WebGLRenderingContext | null
    if (!gl || gl.isContextLost()) return
    const still = matchMedia('(prefers-reduced-motion: reduce)')

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (gl.getShaderParameter(s, gl.COMPILE_STATUS)) return s
      if (import.meta.env.DEV) console.warn('Studio shader:', gl.getShaderInfoLog(s))
      gl.deleteShader(s)
      return null
    }
    const vs = shader(gl.VERTEX_SHADER, VS)
    const fs = shader(gl.FRAGMENT_SHADER, FS)
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
    ;['scene', 'sketch', 'painting', 'paint'].forEach((n, i) => gl.uniform1i(u(n), i))
    // GLSL's mat3 is column-major; INV is row-major.
    const [a, b, c, d, e, f, g, h, i] = INV as [number, number, number, number, number, number, number, number, number]
    gl.uniformMatrix3fv(u('inv'), false, [a, d, g, b, e, h, c, f, i])
    gl.uniform2f(u('texel'), 1 / PW, 1 / PH)

    const textures = [0, 1, 2, 3].map((unit) => {
      const t = gl.createTexture()
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, t)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      return t
    })

    // ---- the paint
    if (!layer.current) {
      layer.current = document.createElement('canvas')
      layer.current.width = PW
      layer.current.height = PH
    }
    const paintLayer = layer.current
    const pctx = paintLayer.getContext('2d')!
    const dab = bristles()
    const tinted = document.createElement('canvas')
    tinted.width = tinted.height = 64
    const tctx = tinted.getContext('2d')!
    let loaded = BLOBS[5]!.paint
    let load = 0.7
    const tint = (paint: string) => {
      tctx.globalCompositeOperation = 'copy'
      tctx.drawImage(dab, 0, 0)
      tctx.globalCompositeOperation = 'source-in'
      tctx.fillStyle = paint
      tctx.fillRect(0, 0, 64, 64)
    }
    tint(loaded)

    let dirty = true
    const stroke = (x0: number, y0: number, x1: number, y1: number, speed: number) => {
      const dx = x1 - x0
      const dy = y1 - y0
      const len = Math.hypot(dx, dy)
      if (len < 0.5) return
      const angle = Math.atan2(dy, dx)
      // A fast stroke is a thinner, drier one — the brush skims.
      const size = BRUSH.size * (1 - Math.min(speed, 3) * 0.12)
      const n = Math.ceil(len / BRUSH.step)
      for (let k = 1; k <= n; k++) {
        const t = k / n
        load = Math.max(BRUSH.dry, load - BRUSH.step / BRUSH.reach)
        pctx.globalAlpha = 0.04 + 0.2 * load
        pctx.save()
        pctx.translate(x0 + dx * t, y0 + dy * t)
        pctx.rotate(angle)
        pctx.drawImage(tinted, -size / 2, -size / 2, size, size)
        pctx.restore()
      }
      dirty = true
    }

    // ---- drawing, on demand: nothing here moves unless the visitor does
    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      gl.viewport(0, 0, cv.width, cv.height)
    }
    size()
    let ready = 0
    let raf = 0
    let dead = false
    let wipeFrom = 0
    const frame = (now: number) => {
      raf = 0
      if (ready < 3) return
      if (wipeFrom) {
        const t = still.matches ? 1 : Math.min((now - wipeFrom) / 520, 1)
        // Wiped from the rag's side, a band sweeping across and lifting the paint.
        pctx.save()
        pctx.globalCompositeOperation = 'destination-out'
        pctx.globalAlpha = 1
        const x = PW * (1 - t)
        const gr = pctx.createLinearGradient(x, 0, x + PW * 0.25, 0)
        gr.addColorStop(0, 'rgba(0,0,0,0)')
        gr.addColorStop(1, 'rgba(0,0,0,1)')
        pctx.fillStyle = gr
        pctx.fillRect(0, 0, PW, PH)
        pctx.restore()
        dirty = true
        if (t >= 1) {
          pctx.clearRect(0, 0, PW, PH)
          wipeFrom = 0
        }
      }
      if (dirty) {
        gl.activeTexture(gl.TEXTURE3)
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, paintLayer)
        dirty = false
      }
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
      if (wipeFrom) kick()
    }
    const kick = () => {
      if (!raf && !dead) raf = requestAnimationFrame(frame)
    }

    ;[base, sketch, painting].forEach((src, unit) => {
      const img = new Image()
      img.decoding = 'async'
      img.src = src
      img
        .decode()
        .then(() => {
          if (dead) return
          gl.activeTexture(gl.TEXTURE0 + unit)
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
          ready++
          if (ready === 3) {
            host.dataset.live = ''
            kick()
          }
        })
        .catch(() => {})
    })

    // ---- the pointer: palette, rag, canvas
    let last: [number, number] | null = null
    let lastT = 0
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width
      const y = (e.clientY - r.top) / r.height
      const now = performance.now()
      const blob = BLOBS.find((b) => Math.hypot((x - b.at[0]) * W, (y - b.at[1]) * H) < BLOB_R * W)
      if (blob) {
        if (blob.paint !== loaded) tint((loaded = blob.paint))
        load = 1
        cv.style.cursor = cursorFor(loaded)
        last = null
        return
      }
      if (x > RAG[0][0] && x < RAG[1][0] && y > RAG[0][1] && y < RAG[1][1]) {
        if (!wipeFrom) wipeFrom = now
        cv.style.cursor = 'grab'
        last = null
        kick()
        return
      }
      const [cx, cy] = toCanvas(x, y)
      if (cx < 0 || cx > 1 || cy < 0 || cy > 1) {
        cv.style.cursor = ''
        last = null
        return
      }
      cv.style.cursor = cursorFor(loaded)
      const px = cx * PW
      const py = cy * PH
      if (last && now - lastT < 120) {
        const speed = Math.hypot(px - last[0], py - last[1]) / Math.max(now - lastT, 4)
        stroke(last[0], last[1], px, py, speed)
        kick()
      }
      last = [px, py]
      lastT = now
    }
    const out = () => {
      last = null
    }
    cv.addEventListener('pointermove', move)
    cv.addEventListener('pointerdown', move)
    cv.addEventListener('pointerleave', out)
    cv.addEventListener('pointercancel', out)
    const lost = (e: Event) => {
      e.preventDefault()
      dead = true
      delete host.dataset.live
    }
    cv.addEventListener('webglcontextlost', lost)
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
      cv.removeEventListener('pointerleave', out)
      cv.removeEventListener('pointercancel', out)
      cv.removeEventListener('webglcontextlost', lost)
      delete host.dataset.live
      for (const t of textures) gl.deleteTexture(t)
      gl.deleteBuffer(buf)
      gl.deleteProgram(prog)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [plate])

  // Without WebGL or a script: the sketch on the canvas, as a picture. Placed
  // on the canvas's bounding box — the lean in the photograph is a few pixels.
  const xs = CORNERS.map((p) => p[0])
  const ys = CORNERS.map((p) => p[1])
  const box = {
    left: `${Math.min(...xs) * 100}%`,
    top: `${Math.min(...ys) * 100}%`,
    width: `${(Math.max(...xs) - Math.min(...xs)) * 100}%`,
    height: `${(Math.max(...ys) - Math.min(...ys)) * 100}%`,
  }
  return (
    <>
      {plate.sketch && <img className="sketch" src={plate.sketch} alt="" decoding="async" style={box} />}
      <canvas ref={canvas} className="studio" />
    </>
  )
}
