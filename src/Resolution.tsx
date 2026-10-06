import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { PHONE, off } from './device'

/**
 * The pixel ratio, following the frame rate.
 *
 * The world starts at the most it will draw — 1.5 on a computer, 1.25 on a
 * phone, never more than the display has (`Scene.tsx`, `dpr`) — and stays
 * there on every device measured so far: all of them hold their refresh rate
 * at the spawn (`docs/STATUS.md`, "Measuring"). This is for the device and the
 * view that do not. A slower frame should be a softer one, not a stutter.
 *
 * Frames are counted a second at a time. The refresh rate is the best second
 * seen, and never taken for less than 60. Two seconds in a row under 80% of it and the ratio steps down a
 * quarter of its range; five in a row back at it and, if it had stepped down,
 * the ratio steps up again. The thresholds are the refresh rate's, so a
 * 120 Hz laptop keeps its 120 the same way a phone keeps its 60.
 *
 * Every step resizes `Post`'s render targets, and a ratio that hunts up and
 * down is worse than one a little low: after four changes of direction it
 * settles at the lowest it went and stops listening.
 *
 * Not drei's `PerformanceMonitor`: it counts a rise at the top of its range as
 * a change of direction, so on a device that is already fine it gives up
 * after ten seconds and never steps down when the view gets heavier.
 *
 * `?debug&off=adapt` holds the ratio, so measurements compare like with like.
 */
const [LO, HI] = PHONE ? [0.75, 1.25] : [1, 1.5]
const STEP = (HI - LO) / 4
const SLOW = 0.8 // of the refresh rate
const DOWN_AFTER = 2 // seconds under it
const UP_AFTER = 5 // seconds back at the refresh rate
const TURNS = 4

export function Resolution() {
  if (off('adapt')) return null
  return <Controller />
}

function Controller() {
  const setDpr = useThree((s) => s.setDpr)
  const s = useRef({
    level: HI, lowest: HI, start: 0, frames: 0, refresh: 0,
    slow: 0, fast: 0, last: 0 as -1 | 0 | 1, turns: 0, done: false,
  })

  const set = (level: number) => {
    const st = s.current
    st.level = level
    st.lowest = Math.min(st.lowest, level)
    setDpr(Math.min(window.devicePixelRatio, level))
  }

  useFrame(() => {
    const st = s.current
    if (st.done) return
    const now = performance.now()
    if (!st.start) st.start = now
    st.frames++
    const span = now - st.start
    if (span < 1000) return
    // A second that took far longer than one is a backgrounded tab or a
    // stall while something loaded, not a frame rate: it says nothing.
    const fps = span < 1500 ? (st.frames * 1000) / span : -1
    st.start = now
    st.frames = 0
    if (fps < 0) return
    // Never assumed under 60: a device that cannot reach its refresh rate at
    // all is exactly the one this is for.
    st.refresh = Math.max(st.refresh, 60, Math.round(fps))

    if (fps < st.refresh * SLOW) { st.slow++; st.fast = 0 } else if (fps >= st.refresh * 0.95) { st.fast++; st.slow = 0 } else { st.slow = st.fast = 0 }

    const move = (dir: -1 | 1) => {
      if (st.last && dir !== st.last && ++st.turns >= TURNS) {
        st.done = true
        set(st.lowest)
        return
      }
      st.last = dir
      st.slow = st.fast = 0
      set(Math.min(HI, Math.max(LO, st.level + dir * STEP)))
    }
    if (st.slow >= DOWN_AFTER && st.level > LO) move(-1)
    else if (st.fast >= UP_AFTER && st.level < HI) move(1)
  })

  return null
}
