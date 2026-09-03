import { useEffect, useRef } from 'react'
import { Vector2 } from 'three'
import { stick } from './stick'

/**
 * Invariant 8: all input goes through here. Keyboard and touch feed it; gamepad
 * could later. Nothing downstream reads `keydown` or `pointerdown` directly —
 * the flight controller, the spray and the sound never learn which one it was.
 *
 * Returns a stable object mutated in place — reading it never re-renders.
 */
export type Input = {
  move: Vector2 // x = strafe, y = forward. Length <= 1.
  look: Vector2 // ponytail: still unwired — the camera sits behind the ship, so
  //             world-relative steering reads the same, on a thumb as on a key.
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
 * The canvas layer, and the touch equivalent of the selector above: a drag is
 * only a drag if it started on the world. A finger that goes down on the panel
 * is scrolling the case study, and one on the header is following a link.
 *
 * `.stage.off` takes its pointer events away on every route with no world
 * showing, so this cannot match there either.
 */
const STAGE = '.stage'

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

    // The thumb stick's contribution, written by the pointer handlers below and
    // summed with the keyboard's in `apply`. They never both happen, but adding
    // them costs nothing and needs no rule about which one wins.
    const thumb = { x: 0, y: 0, boost: false }
    /** The finger that is steering, and where it went down. */
    let drag: { id: number; x: number; y: number } | null = null
    /** A second finger, anywhere on the world. It is Space. */
    let lift: number | null = null

    const apply = () => {
      const m = input.current.move.set(thumb.x, thumb.y)
      for (const code of held) {
        const d = MOVE[code]
        if (d) m.set(m.x + d[0], m.y + d[1])
      }
      if (m.lengthSq() > 1) m.normalize()
      input.current.ascend = lift !== null || ASCEND.some((c) => held.has(c))
      input.current.boost = thumb.boost || BOOST.some((c) => held.has(c))
      input.current.interact = INTERACT.some((c) => held.has(c))
    }

    // Alt-tab while holding W would otherwise leave the ship flying forever —
    // and so would navigating away mid-press, which is why this is the cleanup.
    // A finger is lost the same way: the phone rings, `pointercancel` may or may
    // not arrive, and a stuck thumb is a ship that never stops.
    const clear = () => {
      held.clear()
      drag = null
      lift = null
      thumb.x = 0
      thumb.y = 0
      thumb.boost = false
      apply()
    }

    if (!enabled) { clear(); return }

    const down = (e: KeyboardEvent) => {
      if (!MOVE[e.code] && !KEYS.includes(e.code)) return
      if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return
      e.preventDefault() // stop Space/arrows scrolling the page under the canvas
      held.add(e.code)
      apply()
    }
    const up = (e: KeyboardEvent) => { held.delete(e.code); apply() }

    // Touch (Phase 6). The mouse is excluded on purpose: it has a keyboard next
    // to it, and a click-drag over the world would then fight the flat site's
    // text selection for no gain. `touch-action: none` on `.stage` is what stops
    // the browser panning and double-tap-zooming under all of this.
    const pointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return
      if (!(e.target instanceof Element) || !e.target.closest(STAGE)) return
      if (drag === null) { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; return }
      if (lift === null && e.pointerId !== drag.id) { lift = e.pointerId; apply() }
    }

    // On `window`, not on the stage: once the drag has started, the finger is
    // allowed to slide over the panel and keep steering. Which is also why the
    // stick is measured from where the finger went down rather than from the
    // middle of the screen — there is no ring drawn anywhere to aim at.
    const pointerMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const s = stick(e.clientX - drag.x, e.clientY - drag.y)
      thumb.x = s.x
      thumb.y = s.y
      thumb.boost = s.boost
      apply()
    }

    const pointerUp = (e: PointerEvent) => {
      if (lift === e.pointerId) lift = null
      else if (drag?.id === e.pointerId) {
        drag = null
        thumb.x = 0
        thumb.y = 0
        thumb.boost = false
      } else return
      apply()
    }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    window.addEventListener('pointerdown', pointerDown)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerUp)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
      window.removeEventListener('pointerdown', pointerDown)
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerUp)
      clear()
    }
  }, [enabled])

  return input.current
}
