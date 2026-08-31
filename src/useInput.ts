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
  look: Vector2 // ponytail: unwired. Follow camera is fixed-offset until Phase 3.
  interact: boolean
}

const MOVE: Record<string, [number, number]> = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
}
const INTERACT = ['Space', 'KeyE', 'Enter']

export function useInput(): Input {
  const input = useRef<Input>({ move: new Vector2(), look: new Vector2(), interact: false })

  useEffect(() => {
    const held = new Set<string>()

    const apply = () => {
      const m = input.current.move.set(0, 0)
      for (const code of held) {
        const d = MOVE[code]
        if (d) m.set(m.x + d[0], m.y + d[1])
      }
      if (m.lengthSq() > 1) m.normalize()
      input.current.interact = INTERACT.some((c) => held.has(c))
    }

    const down = (e: KeyboardEvent) => {
      if (!MOVE[e.code] && !INTERACT.includes(e.code)) return
      e.preventDefault() // stop Space/arrows scrolling the page under the canvas
      held.add(e.code)
      apply()
    }
    const up = (e: KeyboardEvent) => { held.delete(e.code); apply() }
    // Alt-tab while holding W would otherwise leave the ship flying forever.
    const clear = () => { held.clear(); apply() }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  return input.current
}
