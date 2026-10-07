/**
 * PolarSense's island is an iceberg: a floating thing, and the one island in
 * this world that moves. Its logo is a bar chart standing in water — a little
 * above the line and most of it below — and `Iceberg.tsx` already puts that
 * logo in water on the index. This is the same idea at the scale of the world:
 * a snowfield with a frozen mountain of columns on it, a ring of bare ice
 * running down into the sea, and a body that heaves and rolls under whatever
 * lands on it.
 *
 * Pure arithmetic, no three, like `plateau.ts`: `berg.check.ts` rides a board
 * onto it in node. What is here:
 *
 * - **The shape.** `BERG_PROFILE` replaces `PROFILE` for the one landmark that
 *   floats (`FLOATS`), and the berg stands `LIFT` higher than a plateau —
 *   an iceberg is a thing that stands out of the water, not a beach that
 *   slips into it. The ring from `ICE_IN` outward is the **ice shore**.
 * - **The pose.** Three lightly damped oscillators — heave, and the surface's
 *   slope along world X and Z — each pulled toward a rest that the rider's
 *   weight moves, kicked by a landing, shoved by a hit on the mountain or a
 *   hull against its side, and drawn through a soft cap. `bergLift` is what
 *   that pose adds to the ground at a point, and it is the only thing the
 *   floor, the mesh and the mountain all read, so the three cannot disagree.
 * - **The glide.** `onIce` says where the board has no grip. What the board
 *   does there is `Ship.tsx`'s, and `glide` below is the arithmetic it uses:
 *   the velocity is kept, the slope pulls, and the input only *turns* him —
 *   with a faint push so a man who stopped on ice can still creep off it.
 *
 * Why oscillators and not a rigid body: a rigid body would need the berg's
 * inertia, its centre of buoyancy and a contact model, and the visitor would
 * see none of them — what they see is that it dips where he lands, harder the
 * harder he landed, and that it rocks back through level a few times before it
 * settles. Two numbers per axis do that, and they are the same two numbers the
 * index's iceberg is made of (`Iceberg.tsx`, `SEA.tilt` and `SEA.bob`).
 */

/** Which landmark shape floats. Keyed on shape like `DECKS` and `RAMPS`. */
export const FLOATS = 'mine'

/** How much higher than a plateau the snowfield stands, in metres. A plateau
 *  is 45 cm out of the water, which is a beach; 80 is a floe you climb onto. */
export const LIFT = 0.35

/**
 * Half the berg from its axis outward, as `Islands.tsx` revolves it:
 * [fraction of radius, height relative to the snowfield]. Flat snow out to
 * `ICE_IN`, a short roll-off onto the ice, then the shore: one straight-ish
 * run of bare ice down to the water at about 0.86 — `GROUND + LIFT` below the
 * snow — and on under it as the shelf a floe has round it, then the wall.
 *
 * Straight rather than the beach's eased curve, because the board glides down
 * it under gravity (`glide`) and a curve that steepens at the waterline is a
 * kicker into the sea.
 */
export const BERG_PROFILE: [number, number][] = [
  [0, 0], [0.47, 0], [0.53, -0.07], [0.78, -0.42], [0.86, -0.8], [0.93, -1.25], [0.97, -2.4], [1, -3.2],
]

/** Where the snow stops and the ice starts, as a fraction of the radius. A
 *  hair inside the roll-off, so the first of the slope is already ice. */
export const ICE_IN = 0.5

/* ---------------------------------------------------------------- the pose */

/** Periods (s) and damping ratios. Slow and lightly damped on purpose, like
 *  the index's berg: it should take several swings to settle. */
const HEAVE = { period: 2.4, zeta: 0.14 }
const TILT = { period: 3.4, zeta: 0.12 }

/** The soft caps: 30 cm of heave and about four degrees of tilt. */
export const MAX_HEAVE = 0.3
export const MAX_TILT = 0.07

/** A rider standing on it: how far his weight sinks it, and how far it leans
 *  toward him at the edge of the snow (as a slope, ~0.7°). */
const SINK = 0.05
const LEAN = 0.012

/** A landing: heave velocity per unit of fall, and tilt velocity per unit of
 *  fall per unit of lever (offset over radius). Sized so a 6 u/s drop is ~20 cm
 *  of heave and, at the snow's edge, ~3° of roll. */
const KICK_H = 0.09
const KICK_T = 0.018

/** A horizontal shove — the board off the mountain, a hull against the side —
 *  as tilt velocity per unit of velocity change, and a little heave with it. */
const SHOVE_T = 0.006
const SHOVE_H = 0.012

/** The swell under it when nobody is there: a slow bob and a slower roll. */
const IDLE = { heave: 0.04, tilt: 0.006 }

export type BergState = {
  h: number; vh: number   // heave, metres, and its rate
  sx: number; vsx: number // slope of the surface along world X (dy/dx), and its rate
  sz: number; vsz: number // and along world Z
}

/** The berg, now. One berg in this world, so one object, written by `Ship`
 *  once a frame and read by the floor, the mesh and the mountain. */
export const BERG: BergState = { h: 0, vh: 0, sx: 0, vsx: 0, sz: 0, vsz: 0 }

/** The cap: linear near rest, flat at `max`. Applied to what is *drawn and
 *  ridden*, not to the state, so a hard landing still swings back through. */
const soft = (v: number, max: number) => max * Math.tanh(v / max)

/** The pose as it is drawn: heave and the two slopes, capped. */
export function pose(b: BergState = BERG): { h: number; sx: number; sz: number } {
  return { h: soft(b.h, MAX_HEAVE), sx: soft(b.sx, MAX_TILT), sz: soft(b.sz, MAX_TILT) }
}

/** What the pose adds to the berg's ground `dx, dz` (world) from its centre:
 *  the lift, the heave, and the tilt. Small-angle, which at four degrees is
 *  out by a quarter of a millimetre at the waterline. */
export function bergLift(dx: number, dz: number, b: BergState = BERG): number {
  return LIFT + soft(b.h, MAX_HEAVE) + soft(b.sx, MAX_TILT) * dx + soft(b.sz, MAX_TILT) * dz
}

/** One damped oscillator a step: semi-implicit Euler, toward `rest`. */
function osc(x: number, v: number, rest: number, period: number, zeta: number, dt: number): [number, number] {
  const w = (2 * Math.PI) / period
  v += (-w * w * (x - rest) - 2 * zeta * w * v) * dt
  return [x + v * dt, v]
}

/**
 * Advance the berg by `dt`. `load` is the rider standing on it, `dx, dz` from
 * its centre over its radius `R`, or null; `t` drives the idle swell, and is
 * held at zero under reduced motion by the caller — which with nothing on the
 * berg is no motion at all.
 */
export function stepBerg(dt: number, t: number, R: number,
  load: { dx: number; dz: number } | null, b: BergState = BERG): void {
  // A clock held at zero is no swell at all, rather than a swell frozen at
  // whatever its phases add up to at t = 0 — a berg left permanently tilted.
  const idle = t > 0 ? 1 : 0
  let rh = idle * IDLE.heave * Math.sin(0.8 * t)
  let rx = idle * IDLE.tilt * Math.sin(0.55 * t + 1)
  let rz = idle * IDLE.tilt * Math.sin(0.43 * t + 2)
  if (load) {
    rh -= SINK
    // The side he is on goes down: a rider at +x makes the surface fall
    // toward +x, which is a negative slope along x.
    rx -= LEAN * (load.dx / (R * ICE_IN))
    rz -= LEAN * (load.dz / (R * ICE_IN))
  }
  ;[b.h, b.vh] = osc(b.h, b.vh, rh, HEAVE.period, HEAVE.zeta, dt)
  ;[b.sx, b.vsx] = osc(b.sx, b.vsx, rx, TILT.period, TILT.zeta, dt)
  ;[b.sz, b.vsz] = osc(b.sz, b.vsz, rz, TILT.period, TILT.zeta, dt)
}

/** Something came down on the berg at `dx, dz` from its centre, falling at
 *  `fall` units a second: it sinks, and it dips toward where it was hit. */
export function kick(dx: number, dz: number, fall: number, R: number, b: BergState = BERG): void {
  if (!(fall > 0)) return
  b.vh -= KICK_H * fall
  b.vsx -= KICK_T * fall * (dx / R)
  b.vsz -= KICK_T * fall * (dz / R)
}

/** Something pushed the berg along `(px, pz)`, in units a second of velocity
 *  it gave up. A push above the waterline rolls the top along the push — the
 *  far side of it goes down — and the berg bobs with it. */
export function shove(px: number, pz: number, b: BergState = BERG): void {
  b.vsx -= SHOVE_T * px
  b.vsz -= SHOVE_T * pz
  b.vh -= SHOVE_H * Math.hypot(px, pz)
}

/* ---------------------------------------------------------------- the ice */

/** Is a point `f` of the way out from the berg's axis (f = distance over the
 *  rim's radius there) on the ice shore? */
export const onIce = (f: number) => f >= ICE_IN

/** The faint push on ice, so a man stopped on it can creep off: units/s² of
 *  shove along the input, and the speed past which it adds nothing. */
export const SKATE = { accel: 1.4, most: 1.1 }
/** What little the ice takes off a glide, per second. */
export const ICE_DRAG = 0.04

/**
 * One frame of a glide, in place. `v` is the board's velocity, `want` the unit
 * direction the input points (or zero), `gx, gz` the ground's slope where he
 * is, and `g` gravity. Momentum is kept — nothing here steers it — the slope
 * pulls him down it, and the input adds only the faint skate, and only while
 * he is slower than `SKATE.most`. Turning is the caller's: on ice the board
 * faces the input and not the velocity.
 */
export function glide(v: { x: number; z: number }, want: { x: number; z: number },
  gx: number, gz: number, g: number, dt: number): void {
  v.x -= g * gx * dt
  v.z -= g * gz * dt
  // The skate is a way off the ice and not a way to steer on it: it only
  // exists below `SKATE.most`, so a glide at any real speed is untouched by
  // anything the visitor presses.
  const speed = Math.hypot(v.x, v.z)
  if ((want.x !== 0 || want.z !== 0) && speed < SKATE.most) {
    v.x += want.x * SKATE.accel * dt
    v.z += want.z * SKATE.accel * dt
    const now = Math.hypot(v.x, v.z)
    if (now > SKATE.most) {
      v.x *= SKATE.most / now
      v.z *= SKATE.most / now
    }
  }
  const k = 1 - ICE_DRAG * dt
  v.x *= k
  v.z *= k
}
