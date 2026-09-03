/**
 * The thumb stick, as pure numbers: how far a finger has been dragged from
 * where it went down, in client pixels, becomes the same `move` vector the
 * keyboard writes.
 *
 * Its own module, importing nothing, so `stick.check.ts` runs it under plain
 * node — `useInput.ts` pulls in three and React and could not be checked that
 * way. The y flip below is exactly the kind of thing that is wrong in one
 * direction and invisible in a screenshot.
 */

/**
 * Pixels of drag for full deflection. Deliberately a constant rather than a
 * fraction of the viewport: a thumb is the same size on a phone and on a
 * tablet, and about 72px is its comfortable travel without moving the hand.
 */
export const STICK = 72

/**
 * Past this multiple of it, the ship boosts. The gesture teaches itself,
 * because pushing further has already made the ship faster before it makes it
 * boost — there is nothing to discover, only more of what you were doing.
 */
export const BOOST_AT = 1.7

/**
 * Under this many pixels the finger is resting, not steering. Without it a
 * still thumb creeps the ship a few percent, which does not read as a light
 * touch — it reads as the world being broken.
 */
const DEAD = 8

export type Stick = { x: number; y: number; boost: boolean }

/**
 * `dx`, `dy` are client pixels from the touch's origin. Screen y grows
 * downward and `move.y` is forward, hence the sign. The result is clamped to
 * length 1, so a thumb dragged off the edge of the screen is full speed and
 * not more.
 */
export function stick(dx: number, dy: number): Stick {
  const len = Math.hypot(dx, dy)
  if (len < DEAD) return { x: 0, y: 0, boost: false }
  const scale = Math.min(len, STICK) / STICK / len
  return { x: dx * scale, y: -dy * scale, boost: len > STICK * BOOST_AT }
}
