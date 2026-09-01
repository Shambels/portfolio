import { useEffect, useRef } from 'react'
import { Vector2 } from 'three'

/**
 * Invariant 8: all input goes through here. Keyboard and gamepad feed it now,
 * touch feeds it later (Phase 6). Nothing downstream reads `keydown` directly.
 *
 * Returns a stable object mutated in place — reading it never re-renders.
 */
export type Input = {
  move: Vector2 // x = strafe, y = forward. Length <= 1.
  look: Vector2 // ponytail: still unwired — the camera sits behind the ship, so
  //             world-relative steering reads the same. Phase 6 may want it.
  ascend: boolean // held: climb to the ceiling. Released: sink back to hover.
  boost: boolean // held: fly faster.
  interact: boolean
}

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
}
const ASCEND = ['Space']
const BOOST = ['ShiftLeft', 'ShiftRight']
const INTERACT = ['KeyE', 'Enter']
const KEYS = [...ASCEND, ...BOOST, ...INTERACT]

/** Anything that already does something with a key press. The world listens on
 *  `window`, so without this a focused link would fly the ship instead of
 *  following itself, and Space would never reach a button. */
const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[contenteditable],[tabindex]'

/**
 * `enabled` is false wherever the world is not showing — the canvas stays
 * mounted across every route (invariant 3), and a mounted canvas that keeps
 * swallowing arrow keys is a flat page you cannot scroll.
 */
export function useInput(enabled = true): Input {
  const input = useRef<Input>({
    move: new Vector2(), look: new Vector2(), ascend: false, boost: false, interact: false,
  })

  useEffect(() => {
    const held = new Set<string>()

    const apply = () => {
      const m = input.current.move.set(0, 0)
      for (const code of held) {
        const d = MOVE[code]
        if (d) m.set(m.x + d[0], m.y + d[1])
      }
      if (m.lengthSq() > 1) m.normalize()
      input.current.ascend = ASCEND.some((c) => held.has(c))
      input.current.boost = BOOST.some((c) => held.has(c))
      input.current.interact = INTERACT.some((c) => held.has(c))
    }

    // Alt-tab while holding W would otherwise leave the ship flying forever —
    // and so would navigating away mid-press, which is why this is the cleanup.
    const clear = () => { held.clear(); apply() }

    if (!enabled) { clear(); return }

    const down = (e: KeyboardEvent) => {
      if (!MOVE[e.code] && !KEYS.includes(e.code)) return
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
      e.preventDefault() // stop Space/arrows scrolling the page under the canvas
      held.add(e.code)
      apply()
    }
    const up = (e: KeyboardEvent) => { held.delete(e.code); apply() }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      clear()
    }
  }, [enabled])

  return input.current
}
