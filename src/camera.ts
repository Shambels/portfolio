/**
 * The follow camera's two pieces of arithmetic: where a push on the screen
 * points in the world, and how far round the hull the camera is allowed to come
 * this frame.
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
 * the short way round, capped at `max` radians a second.
 *
 * The cap is the load-bearing part. A held sideways push holds the heading a
 * quarter turn off the camera, so an uncapped chase would rotate at `rate`
 * times that — around a rad and a half a second, which is a spin. Capped, the
 * same push carves: the camera comes round at `max`, the heading stays ahead of
 * it by whatever the push says, and the ship draws a circle of `speed / max`.
 */
export function swing(camYaw: number, yaw: number, dt: number, rate: number, max: number): number {
  const err = Math.atan2(Math.sin(yaw - camYaw), Math.cos(yaw - camYaw))
  const step = err * (1 - Math.exp(-rate * dt))
  const cap = max * dt
  return camYaw + (step > cap ? cap : step < -cap ? -cap : step)
}
