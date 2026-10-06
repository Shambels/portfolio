import { useEffect, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { useFrame, useThree } from '@react-three/fiber'
import { OFF_LIST, PHONE, POST, PROFILE, off } from './device'
import { STATS, pushFrame } from './stats'

/**
 * `?debug`'s numbers: frame times, GPU time, draw calls and triangles, written
 * to `STATS` for the HUD. Mounted beside `Debug`, and like it, never without
 * `?debug`.
 *
 * Frame time is measured between frames rather than across this one, so it is
 * what the visitor gets — the CPU, the GPU and whatever the browser did in
 * between — and not what any one of them thinks it spent.
 *
 * The renderer's own counters reset at the top of every animation frame,
 * before r3f has drawn anything, so read from here they would always be zero.
 * Here they are reset by hand instead, at the top of r3f's frame and after
 * this has read them: what is read is exactly one whole frame, every pass of
 * `Post` included.
 *
 * GPU time is the timestamp queries `Scene` turns on under `PROFILE`. One
 * resolve in flight at a time; the value printed is the last frame that
 * resolved, which is at most a frame or two old.
 */
export function Profiler() {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGPURenderer
  const last = useRef(0)
  const pending = useRef(false)

  useEffect(() => {
    gl.info.autoReset = false
    gl.info.reset()
    STATS.tier = PHONE ? 'phone' : 'desktop'
    STATS.off = OFF_LIST
    STATS.frame = `${POST ? 'post' : off('msaa') ? 'direct' : 'direct + msaa'}`
    return () => {
      gl.info.autoReset = true
      STATS.live = false
    }
  }, [gl])

  // Before everything else in the frame, `Post` and the spray included.
  // Negative, because a positive priority would take the render away from
  // r3f — and with `?off=post` there would be nothing left to give it back.
  useFrame(() => {
    const now = performance.now()
    if (last.current) pushFrame(now - last.current)
    last.current = now

    const { render, compute } = gl.info
    STATS.calls = render.drawCalls
    STATS.triangles = render.triangles
    STATS.computes = compute.frameCalls
    gl.info.reset()

    STATS.dpr = gl.getPixelRatio()
    STATS.width = gl.domElement.width
    STATS.height = gl.domElement.height

    const timed = PROFILE && (gl.backend as { trackTimestamp?: boolean }).trackTimestamp
    if (timed && !pending.current) {
      pending.current = true
      Promise.all([gl.resolveTimestampsAsync('render'), gl.resolveTimestampsAsync('compute')])
        .then(([r, c]) => {
          if (typeof r === 'number') STATS.gpu = r + (typeof c === 'number' ? c : 0)
        })
        .catch(() => {})
        .finally(() => { pending.current = false })
    }
  }, -1)

  return null
}
