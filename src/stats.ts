/**
 * What `Profiler` measures, kept here for the HUD to print.
 *
 * Its own file, with nothing imported, because the two ends of it live in
 * different chunks: `Profiler` is inside the canvas, in the lazy world chunk,
 * and the HUD is `WorldGate`, in the first route's. A shared object in a
 * module that pulls in no three is the cheapest bridge there is, and it costs
 * the first route a few hundred bytes rather than the renderer.
 *
 * Written every frame, read twice a second: nothing here is React state, so a
 * frame costs no render.
 */

/** How many frame times the summary is over — four seconds at 60 fps. */
const WINDOW = 240

export const STATS = {
  /** Set while a `Profiler` is mounted and has seen at least one frame. */
  live: false,
  /** Frame-to-frame times in ms, a ring. */
  frames: new Float32Array(WINDOW),
  next: 0,
  count: 0,
  /** GPU time of the last resolved frame, ms, render plus compute. `null` where
   *  the backend has no timestamp queries — WebGL2, and Safari for now. */
  gpu: null as number | null,
  /** The last whole frame, every pass of it: the scene, bloom's mips, FXAA. */
  calls: 0,
  triangles: 0,
  computes: 0,
  /** Drawing buffer, in device pixels, and the ratio that made it. */
  width: 0,
  height: 0,
  dpr: 0,
  tier: '',
  off: [] as string[],
}

export function pushFrame(ms: number) {
  STATS.frames[STATS.next] = ms
  STATS.next = (STATS.next + 1) % WINDOW
  STATS.count = Math.min(STATS.count + 1, WINDOW)
  STATS.live = true
}

/**
 * The window, summarised: the median frame, and the mean of the slowest 1% —
 * the number that is a stutter. An average hides exactly the frames that are
 * felt, so there is no average here.
 */
export function summary() {
  const n = STATS.count
  if (n === 0) return null
  const sorted = Array.from(STATS.frames.subarray(0, n)).sort((a, b) => a - b)
  const median = sorted[Math.floor(n / 2)]!
  const tail = sorted.slice(Math.floor(n * 0.99))
  const worst = tail.reduce((s, v) => s + v, 0) / tail.length
  return { median, worst, fps: 1000 / median }
}
