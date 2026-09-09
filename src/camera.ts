/**
 * The follow camera's two pieces of arithmetic: where a push on the screen
 * points in the world, and how far round the hull the camera comes
 * for the distance the craft has travelled.
 *
 * Its own module for the same reason `stick.ts` is one — it imports nothing, so
 * `camera.check.ts` runs it under plain node, and both of these are wrong in
 * ways a screenshot cannot show. `steer` with a sign flipped is a world that
 * steers into itself, and `swing` without its cap is the feedback loop the
 * fixed camera existed to avoid: steering is measured against the camera, the
 * camera chases the heading, and the heading chases the steering.
 */

/**
 * The camera's own bearing, as a direction: `yaw` is measured the way the ship
 * measures it — atan2(x, z), so zero looks down +z — and the camera looks along
 * it from `CAM_OFFSET.z` behind.
 */
export const forwardX = (yaw: number) => Math.sin(yaw)
export const forwardZ = (yaw: number) => Math.cos(yaw)

/**
 * A push on the screen, in world XZ. `y` is into the frame and `x` is to the
 * right of it, both measured against `camYaw` rather than the world — which is
 * the whole point of turning the camera at all.
 *
 * Writes into `out` because this runs every frame; a `Vector3` is an `out`, and
 * this module stays free of three by never saying so.
 */
export function steer(x: number, y: number, camYaw: number, out: { x: number; z: number }) {
  const s = Math.sin(camYaw)
  const c = Math.cos(camYaw)
  out.x = y * s - x * c
  out.z = y * c + x * s
  return out
}

/**
 * Where the camera's bearing goes this frame: a lagged chase of the heading,
 * the short way round — spent out of the distance the craft covers rather than
 * out of the clock.
 *
 * `ds` is how far the craft advanced *along its heading* this frame. That is
 * the whole idea: a change of direction is not itself a reason to move the
 * camera. Turn on the spot, get shoved along a coastline, drift sideways off a
 * roller, and the camera stays where it was; go somewhere, and it comes round
 * as you go. `rate` and `max` are therefore per *unit travelled*, not per
 * second, which makes the sustained carve a fixed radius — `1 / max` — at
 * cruise and at boost alike, instead of a circle that opens out with speed.
 *
 * `spin` is the one thing still measured in seconds, and it is a ceiling and
 * not a lag: `max` per unit at full boost is over two radians a second, which
 * is a world spinning about the hull. Below cruise it never binds.
 */
export function swing(
  camYaw: number,
  yaw: number,
  ds: number,
  dt: number,
  rate: number,
  max: number,
  spin: number,
): number {
  const err = Math.atan2(Math.sin(yaw - camYaw), Math.cos(yaw - camYaw))
  const step = err * (1 - Math.exp(-rate * ds))
  const perUnit = max * ds
  const perSec = spin * dt
  const cap = perUnit < perSec ? perUnit : perSec
  return camYaw + (step > cap ? cap : step < -cap ? -cap : step)
}
