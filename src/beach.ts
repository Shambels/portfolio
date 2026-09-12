/**
 * Coming ashore: the arithmetic of it, and none of the choreography.
 *
 * Its own module for the reason `isles.ts` is its own module — `Ship.tsx`
 * imports three and TSL and node can load neither, so anything worth an assert
 * has to live somewhere node can reach. What is here is the **vertical**, which
 * is the part that had the bug: the ramp between riding and walking, the sand
 * under his feet, and where the craft's origin goes given both. The pose, the
 * board and the walk cycle stay in `Ship.tsx`, because a check in node can have
 * no opinion about those and it can have a very exact one about this.
 *
 * `src/beach.check.ts` rides a real approach onto the real isle with it.
 */

/** Smoothstep. `isles.ts` carries its own for the same reason: this file is
 *  deliberately three-free, and `THREE.MathUtils` is not. */
const S = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1)
  return t * t * (3 - 2 * t)
}

/**
 * Where the change of mode starts and finishes, in metres of ground above the
 * water — the first metre of sand above the waterline.
 *
 * `ground()` is sea level everywhere but the isle, so every craft that is not
 * the surfer and every frame that is not on that beach reads this and gets
 * zero: the whole feature is arithmetically invisible to the rest of the world.
 * It is also why crossing the waterline is not a step, because both sides of it
 * are near zero there — `isles.check.ts` asserts the ground is zero at the
 * coastline to a millionth, and `shoal()` damps the rollers to nothing.
 */
export const WALK_IN = 0.06
export const WALK_FULL = 0.34

/** Seconds the change of mode takes, and it is the same both ways: a straight
 *  ramp rather than an exponential, because a change of mode is a thing that
 *  finishes. */
export const BEACH = 1.25

/**
 * His speed on foot, as a multiple of `SPEED`, against `AGILITY.surfer.speed` on
 * the board. It went up with the stride and not instead of it: 2.4 units a
 * second against a 76 cm step is three paces a second, which is a walk, and the
 * step is what makes it cover ground rather than the feet going round faster.
 * 70 m of island is half a minute, and boost is a run.
 */
export const WALK_SPEED = 0.36

/**
 * How fast the sand under his feet *drops* away, and there is deliberately no
 * number for the other direction.
 *
 * The saucer's ground following is a pair of rates (`RISE` against `FOLLOW`)
 * because it is a machine two metres across holding a height over a hill. A
 * sole is on the ground: there is nothing to smooth going up, the height field
 * is smooth already (`isles.check.ts` holds that), and any lag at all is a foot
 * inside the hill — which matters here more than anywhere, because the change
 * of mode *starts at riding speed*. He crosses the waterline at nine units a
 * second and the beach climbs 1.25 m over the next three.
 *
 * So: up exactly, down lagged. The lag is only ever for the direction where the
 * ground falling out from under him is a step off a ledge, and the clipping is
 * zero by construction rather than small by tuning.
 */
export const WALK_FOLLOW = 14

/**
 * How much of the change of mode the *handover back to the water* gets, against
 * the whole of it the choreography gets. A fifth — a quarter of a second.
 *
 * There is deliberately no matching number for the way in, and that asymmetry
 * is the fix for the first version's one real bug. Going ashore the ground
 * simply wins, from the first frame, because `altitude` is a floor and not a
 * fade: `ashore` is a second and a quarter of a man getting off a board, and a
 * height eased in over the same second and a quarter had him doing all of it
 * inside the hill and surfacing when the animation ended. Coming off the beach
 * there is nothing to clip through, so that direction can be a fade, and this
 * is it.
 */
export const WALK_LAND = 0.2

/**
 * How far he drops when the board stops being under him, and it is the model's
 * own measurement rather than the deck's.
 *
 * It was `deckY`, about 16 cm, on the reasoning that his soles sit on the deck.
 * They do — but the *lowest* thing on him is the underside of a foot, and
 * `tools/surfer.py` reports that in board space: 0.11 on the second rider,
 * 0.097 on the third, whose board is thinner. Dropping the craft by the deck's
 * 16 put five centimetres of foot through the sand, which is exactly what it
 * looked like. So: the measurement, less a centimetre so that a sole on a
 * downhill step still clears, which is 0.09.
 *
 * Applied to the *craft* and not to his ankles, and that part has not changed:
 * moving his feet down in board space is a thing his legs have to pay for, and
 * dropping what they stand on is free.
 */
export const FOOT_DROP = 0.09

/**
 * How far the board is out of his hands — 0 under his feet, 1 under his arm.
 *
 * `Surfer` poses the board with it and `altitude` spends `FOOT_DROP` by it, and
 * they have to be the same curve or he walks 16 cm above his own board, or
 * through the sand under it. That is why it is a function and not a smoothstep
 * written down twice. It lags the crouch deliberately: the dip in `ride()` is
 * him reaching for the board, and a board that started rising with his hips
 * would be one he never touched.
 */
export const carried = (land: number) => S(0.32, 0.94, land)

/**
 * The ramp. 0 on the board, 1 on foot, moved at a constant rate toward whatever
 * the ground under him says it should be.
 *
 * Invariant 6: a visitor who asked for less motion gets the change of mode and
 * not the second and a quarter of choreography in front of it.
 */
export function ashore(was: number, groundH: number, dt: number, instant = false,
  within = BEACH): number {
  const want = S(WALK_IN, WALK_FULL, groundH)
  if (instant) return want
  // `within` is how long he has: `BEACH` on his feet, and less than that when
  // he is in the air over the sand and the ground is coming up at him — the
  // whole change then fits inside the fall, and he lands already on foot.
  const step = dt / Math.max(Math.min(within, BEACH), 1e-3)
  return was + Math.min(Math.max(want - was, -step), step)
}

/** The sand under his feet: exactly the ground going up, lagged coming down. */
export function follow(was: number, groundH: number, dt: number): number {
  return groundH > was
    ? groundH
    : was + (groundH - was) * (1 - Math.exp(-WALK_FOLLOW * dt))
}

/**
 * Where the craft's origin goes: the higher of the sand and the water, with a
 * ramp that only ever runs one way.
 *
 * `sand` is the lagged ground less whatever `FOOT_DROP` the board has given
 * back, plus any hop. `water` is whatever the buoyancy spring was going to do
 * this frame — he is going back to it, so it keeps running underneath.
 *
 * Going ashore the ground is the higher of the two and wins outright, on the
 * first frame of the change and not the last. Coming off, the water is the
 * higher and the ramp is what hands him to it over a quarter of a second
 * instead of dropping him onto it.
 */
export function altitude(water: number, sand: number, land: number, airborne = false): number {
  // In the air there is nothing to hand him to: the arc is the arc, and the
  // sand is a floor under it. Without this, a hull mid-jump crossing the
  // coast was the "water" the ramp pulled him down out of — a man yanked out
  // of the sky onto the beach over a fifth of a second.
  if (airborne) return Math.max(sand, water)
  return Math.max(sand, water + (sand - water) * S(0, WALK_LAND, land))
}
