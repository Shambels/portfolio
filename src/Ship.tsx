import { Suspense, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { color, normalLocal, positionLocal, sin, time, uniform, uv } from 'three/tsl'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useInput } from './useInput'
import { steer, swing } from './camera'
import { swell } from './Scenery'
import {
  BEACH, FOOT_DROP, WALK_SPEED, altitude, ashore, carried, follow,
} from './beach'
import { GROUND, SPLASH, VIEW, ground, landmarkAt, landmarkOf, offshore } from './world'
import type { ShipModel } from './WorldGate'
import surferUrl from './models/surfer.glb?url'
import surfboardUrl from './models/surfboard.glb?url'

// Saucer silhouette, rotated around Y. [radius, height]
const PROFILE: [number, number][] = [
  [0, 0.10], [0.34, 0.09], [0.68, 0.05], [1, 0],
  [0.68, -0.07], [0.34, -0.10], [0, -0.09],
]
const LIGHTS = 8

/**
 * The running light both hulls wear: the saucer's ring of eight, the boat's two
 * at the transom and one at the masthead. One material, at module scope — this
 * module is in the canvas chunk, so nothing constructs it until the world
 * mounts, and the pulse is the same pulse either way.
 */
const LAMP = new THREE.MeshStandardNodeMaterial({ color: '#0b1220' })
LAMP.emissiveNode = color('#7dd3fc').mul(sin(time.mul(4)).mul(0.4).add(0.6))

const SPEED = 7.5     // units/sec
const BOOST = 2.4     // Shift multiplier. Same ACCEL ramps in and out of it.
const ACCEL = 7       // higher = twitchier
const LIFT = 2.6      // ceiling above hover altitude, held with Space
const CLIMB = 4       // altitude catch-up rate, both directions
const TURN = 9        // yaw catch-up rate
const BANK = 0.5      // max lean, radians. Flip the sign to lean the other way.
const PITCH = 0.32    // max nose-up on acceleration, radians

// The boat. 2.7 units of hull, which puts it between the saucer and the
// smallest landmark: big enough to read at the camera's distance, small enough
// that its mooring circle does not swallow the island it is moored to.
// Beamier than a real boat of this length, on purpose: the camera sits behind
// the ship and never turns, so the view you get almost all the time is the one
// from astern — a boat's narrowest. At a true beam the hull was the same width
// as its own sail and the two read as one slab.
const HULL = { beam: 0.5, len: 1.35, draft: 0.18, freeboard: 0.2 }
// The chop is 15 cm of water at its steepest, so a hull heeling by its true
// slope heels four degrees and reads as dead flat. That part of the water is a
// flat plane wearing normals — the sea it is heeling to is painted on — so this
// is a lie told on top of a lie, and the only honest way to judge it is to look.
//
// The rollers get no such multiplier. Their face is twenty degrees of real
// displaced geometry, and a hull leaning three times that is a hull upside down.
const WAVE_TILT = 3
const HEEL = 0.6 // radians, about 34 degrees — a big sea, not a capsize

// The surfer. Same controller, same water, a lighter thing on it: 2 units of
// board, no keel, and the whole reason for a third craft is that it leaves the
// surface. Faster round a turn and quicker off a crest, which is what a board
// is; the numbers are below, beside the boat's, so the difference between the
// two floating craft is one table rather than a branch per constant.
//
// The board is `src/models/surfboard.glb` since the third rider, and these
// are measured off it by `tools/surfer.py` rather than built here: the keel
// sits on the waterline, the deck under the two pads is at 0.10 forward and
// 0.11 aft, the fins reach 0.16 below. `deckY` went with the geometry it
// described — the one thing that still needs a deck height is the leash, and
// its three points are written out below where it is built. 2.0 by 0.63.

const soft = (v: number, m: number) => m * Math.tanh(v / m)

// The hull in the water, which since the rollers arrived is a real thing that
// happens rather than a height with a lag on it. One vertical spring toward the
// surface, damped against the surface's *own* vertical speed — so a hull sitting
// on water that is rising is not fighting it — and gravity instead of the spring
// the moment the water drops away faster than the hull can follow.
//
// That is the whole of the jump, and it is why speed is what buys one: the
// surface is sampled under the hull each frame, so what the spring sees is
// dh/dt + v·grad h. Standing still, a roller lifts you. Meeting one at fourteen
// units a second, it throws you.
const BUOY_K = 70    // spring, per second squared. sqrt is the bob rate, ~1.3 Hz.
const BUOY_C = 15    // damping toward the water's own vertical speed
const GRAV = 9       // stylised, like the spray's: real gravity makes a twitch
const SKIN = 0.06    // how far clear of the surface counts as airborne
const SINK = 0.3     // deepest a landing may drive the hull under the surface
const SURF_MAX = 11  // cap on the surface's apparent vertical speed, units/sec
// Leaving the water is an event, not just the frame the spring stopped pushing,
// and it is where the height of a jump is bought. The buoyancy alone tops out at
// about three metres of air off the biggest roller at full sail, which is a hop
// off something taller than the mast; `POP` multiplies the hull's upward speed
// as it goes, which takes the same jump to five. It is a lie, and it is the same
// lie the spray's gravity is: what the visitor is judging is the arc, and the
// arc is not improved by being correct.
//
// `POP_MIN` keeps it off the small stuff — a hull drifting over a crest in a
// calm sea separates from the water at a few centimetres a second and should
// not be launched for it.
const POP = 1.45
const POP_MIN = 1.5
// And a cap on the whole of it, which also catches the case `POP` does not: a
// crest crossed in a single frame, or the fade at an island's edge taken at full
// sail, is a *step* in the surface, and a spring that chases a step launches
// whatever is sitting on it. Ten units a second is 5.5 of air under gravity, and
// nothing goes higher whatever the water does. Falling is not capped; only being
// thrown.
const LAUNCH = 10
// The landing. Impacts run to about eight units a second, so `SPLASH_FULL` is
// where the ring of foam and the burst of spray are at full strength, and
// `LAND_SQUASH` is what the same impact puts into the bounce spring — the hull
// visibly compressing is half of what makes a landing land.
const SPLASH_FULL = 7
const SPLASH_MIN = 1.2 // below this it is a hull settling, not a hull landing
const LAND_SQUASH = 0.5
const WET = 9        // how fast the hull starts heeling to a wave again
const DRY = 14       // and stops, once it is off one. Faster: it left in an instant.

/** How hard each craft turns, and how fast it goes — the flight controller's
 *  share of the difference. The saucer and the boat are 1 and `TURN`, which is
 *  what they have always been. */
const AGILITY: Record<ShipModel, { speed: number; turn: number }> = {
  saucer: { speed: 1, turn: TURN },
  boat: { speed: 1, turn: TURN },
  // Not much quicker in a straight line — the sea is the same sea and the
  // landmarks are where they are — but nearly twice as sharp into a turn. A
  // board turns by leaning, and a board that turned like a hull would be a hull.
  surfer: { speed: 1.18, turn: 16 },
}

/**
 * And the water's share: the numbers the buoyancy, the crest and the landing
 * read, per floating craft. The boat's column is every constant above,
 * unchanged and still commented where it is defined — a third craft is not a
 * reason to renumber the second.
 *
 * The surfer is the light one, and every entry says that in its own units: it
 * bobs faster (`buoyK`) and is damped less (`buoyC`), it leaves a crest half
 * again as hard and leaves much smaller ones (`pop`, `popMin`), it leans
 * further into a wave face (`tilt`, `heel`), it cannot be driven under (`sink`
 * — a board rides on the surface where a hull sits in it), and it lands with
 * less to compress (`squash`).
 */
const CRAFT_WATER = {
  boat: {
    buoyK: BUOY_K, buoyC: BUOY_C, pop: POP, popMin: POP_MIN, launch: LAUNCH,
    tilt: WAVE_TILT, heel: HEEL, sink: SINK, squash: LAND_SQUASH,
  },
  surfer: {
    buoyK: 105, buoyC: 11, pop: 1.95, popMin: 1, launch: 12,
    tilt: 4.6, heel: 0.95, sink: 0.12, squash: 0.34,
  },
}

/* ----------------------------------------------------------- coming ashore
 *
 * Every other craft in this world stops at a coastline. `offshore` pushes a
 * hull back onto the water, which is right for a boat — it has nowhere to go
 * once the water runs out — and which made the isle a wall with a beach painted
 * on it. The surfer is the one craft that is wrong for: a man standing on a
 * plank he can pick up is the only vehicle here that is portable.
 *
 * So he crosses. The board comes up under his arm, he walks, and walking back
 * into the sea puts him on it again. `RIDE.land` is the whole of it — 0 riding,
 * 1 on foot — and it runs both ways, so putting the board down is picking it up
 * backwards and the return needed no code of its own.
 *
 * **The vertical of it lives in `src/beach.ts`**, with the constants it reads,
 * because `beach.check.ts` walks a real approach over the real isle with it and
 * node cannot load this file. What stays here is everything a check could have
 * no opinion about: the speed, the pose, the board and the walk cycle. The
 * split earned itself the first time it ran — see `isles.ts`.
 */
/**
 * How high he jumps, in units a second of launch — the same number in the water
 * and on the sand, because it is the same pair of legs.
 *
 * In the water it is added to the buoyancy spring's own velocity, so a jump
 * taken off a crest is a bigger jump than one taken in a trough and neither
 * needed a rule: the sea is already moving him. It is capped by the craft's
 * `launch` like everything else that throws a hull upward.
 */
const JUMP = 5.2
/**
 * And the gravity the land hop falls under. Stylised like `GRAV` and a shade
 * heavier, because a hop with no water under it has nothing to catch it and the
 * failure mode here is a float that reads as a moon jump: 5.2 up against 14
 * down is 0.97 units of air — about three quarters of his own height — and
 * 0.74 s of it. The same launch into the water's own `GRAV` of 9 goes half as
 * high again, which is right: a board pops.
 */
const HOP_G = 14
/* ------------------------------------------------------------------ the gait
 *
 * **The duty factor is where the distance comes from, and it is the whole idea
 * here.** `duty` is the fraction of the cycle a foot spends on the ground. The
 * body advances at the same speed the whole time, so a foot that is down for
 * less of it has to cover more ground between one footfall and the next: the
 * step is `stride / duty`, and *lowering duty lengthens the step without moving
 * a leg any further*. That is not a trick, it is what running is — a walk keeps
 * a foot down more than half the time (both are down at the overlap), a run
 * keeps one down less than half (neither is, in between: that gap is flight).
 *
 * It replaces a cadence and a cap, which had the failure this is written
 * against: the stride hit its ceiling at walking speed and everything past it
 * went into the *rate*, so at boost the legs span at five steps a second and
 * the feet slid a third of the way — a man running on a treadmill someone was
 * pulling. Now the rate is not chosen at all. It falls out of the one thing
 * that has to be true:
 *
 *     the planted foot travels backward at exactly the speed the body
 *     travels forward
 *
 * which pins the cycle at `pace · duty / (2 · stride)` and makes sliding
 * impossible by construction rather than acceptable under a cap. `CYCLE_MAX` is
 * a guard on a division and not a design.
 *
 * So going faster is a longer step and a lower duty, and the legs go round
 * *slower* at a sprint than they used to at a jog: with the second rider's
 * strides, 1.71 units a step at 3.8 steps a second, against 0.76 at 5.0; with
 * the third's, 1.38 and 0.72 — see `STAND` for why they shortened.
 *
 * The stride moves between the two more than it did — 0.40 to 0.48, where
 * the second rider had 0.39 to 0.41 — because Seb wanted the run's step
 * visibly longer than the walk's, and it is bought with `RUN_SINK`: a runner
 * carries his hips a few centimetres lower, which is where the reach for
 * the longer step comes from. Most of the difference is still the duty.
 */
const WALK_DUTY = 0.46
const RUN_DUTY = 0.24
const WALK_STRIDE = 0.40
const RUN_STRIDE = 0.48
/** How high the swinging foot lifts at a full stride. A runner picks his knees
 *  up and a walker does not, and it is most of what separates them from behind,
 *  which is the only angle this world has on him. */
const WALK_LIFT = 0.12
const RUN_LIFT = 0.22
/**
 * The foot rolls. A sole held flat through the whole stance is a leg that
 * can only reach as far as a straight line from the hip to the ankle, and
 * that line is what bent the knees: at the ends of a 0.40 stride it is
 * 31 degrees off vertical, and a hip that must stay within it stays low.
 * A real step lands heel first, toes up, and leaves toes last, heel high,
 * and the ankle rides up by the foot's own lever at both ends — 5 cm at the
 * strike, 10 at toe-off — which is reach the hips can spend on standing
 * taller. `HEEL_PITCH` is the toes going with it. Seb: the knees were still
 * bent too much walking, and more so running.
 */
const HEEL_ON = 0.05
const HEEL_OFF = 0.10
const HEEL_PITCH = 0.45
/** Cycles a second, as a guard on the division above and nothing else — the
 *  rate is derived, and this only ever catches a stride driven to nothing. */
const CYCLE_MAX = 3.4
const TAU = Math.PI * 2
/**
 * How high the walking foot may be picked up or set down against the plane his
 * hips are on. Still asymmetric, and no longer for the old reason: with both
 * legs the same length he *could* reach further down, but a walk already runs
 * its legs at 96% at the end of a stride and a hollow met there is the one
 * place the solver would clamp. Two centimetres down and eighteen up, and the
 * cost of the small number is a foot that floats a little on a steep descent —
 * which is the one nobody sees, because the whole body is descending with it.
 */
const TERRAIN_UP = 0.18
const TERRAIN_DOWN = -0.02
/**
 * And the dip through the middle of the change, where he is bent over the board
 * with both hands on it.
 */
const PICK = 0.20
/**
 * How much taller than the surf crouch he stands to walk, and it is the whole
 * of why the legs stopped reading as knees. The model's stance is a deep crouch
 * — that is what a surfer's is — and a man who gets off his board and keeps it
 * is a man walking on his knees.
 *
 * `BOB` is the other half and it is not decoration: **the pelvis vaults over
 * the stance leg.** It is lowest at footfall and at toe-off, highest over the
 * middle of the step, and low again through flight — which is what a hip does,
 * and which is also exactly where the reach is needed. The leg is longest when
 * the foot is furthest out, and that is when the hips are lowest; it is
 * shortest when the foot is under him, and that is when they are highest, so
 * the leg can be straight there without being over-extended anywhere else.
 *
 * That phasing is why it is driven by the *stance* rather than by the cycle. A
 * plain twice-a-stride sinusoid is the same thing when duty is a half and is
 * wrong the moment it is not: at a run's 0.24 the cycle's high point lands
 * inside the stance, near the back of it, and puts the hips up exactly where
 * the leg is stretched — 114% of its own length, which is a foot that slides.
 *
 * 5 cm at both, since the third rider — it was 6.5 walking and 8 running, a
 * couple of centimetres more than a real person, and the cut is what bought
 * him height (below). At 14 cm the stride goes to 0.49 and he bounces like a
 * cartoon.
 *
 * `STAND` is most of the man now. The third rider's legs are 0.79 of reach
 * against the second's 0.68, and his third stance — off Seb's photograph —
 * has the seat down at knee height, 0.47 in board space, so standing up is
 * 37 cm of hips and not 12. Height alone was not it, either: the first two
 * tries left him walking bent over a board he was carrying, because the
 * stance's fold and turn lived in the hips bone's rest rotation and nothing
 * took them out — `ride()` does now, with `stand`, read off the file.
 *
 * The height, the stride, the bob and the heel are one budget, and the
 * sweep in `rigOf` is the ledger: the hips `BOB` over the stance foot at
 * mid-stance, and the leg longest there and with the feet apart at the ends
 * of the stance, less what the heel gives back at those ends. 0.45 with a
 * 0.40 stride and 4 cm of bob is 98.3% of these legs at a walk, with the
 * knee at mid-stance twelve degrees off straight on the flat; the run's 0.48
 * stride is paid for by `RUN_SINK`, 98.3% with 7 cm of bob and the knee at
 * twenty-two. Seb asked for slightly straighter twice, and this is where the
 * 1.5% margin for the pelvis's own sway runs out. The sweep no longer charges `TERRAIN_DOWN`: a
 * 2 cm downhill step at the top of the vault is a straight leg with the sole
 * six millimetres short of the sand, which is the float on a descent the
 * note above already accepts, and it was costing 2.5% of the leg on every
 * flat step to insure against. Seb asked for the steps back after a pass at
 * 0.33 (short and quick, to stand him taller) read as mincing: 0.87 a step
 * walking, which is what the second rider had, and 2.0 running, which is
 * longer than he ever had.
 */
const STAND = 0.45
const WALK_BOB = 0.04
const RUN_BOB = 0.07
/** And how much lower a runner carries his hips than a walker — what buys the
 *  run its longer step under the same reach. */
const RUN_SINK = 0.04
/**
 * Standing. A man who has stopped walking is not a man walking at zero: his
 * feet come under him (the stride already goes to nothing with the pace), his
 * hips come up until his legs are straight, the vault stops, and his feet
 * are a little apart. `STILL` is the extra height and `SPREAD` the extra
 * width, both scaled by how stopped he is; the bob is scaled by the rest.
 * The height is the one the reach allows with the feet together and no
 * vault: 0.30 + 0.45 + 0.03 is 98% of the leg on the flat, which is a knee
 * a shade off straight. Seb: the standing knees were bent too much.
 */
const STILL = 0.03
const SPREAD = 0.05

/**
 * And the land's, which is the saucer's alone. It flies `hover` over the water
 * and `hover - GROUND` over a landmark's flat top — the frames that shipped —
 * and this much more over anything standing higher than a plateau, which is the
 * isle and nothing else. Ramped in over the first `CLEAR_IN` metres of it, so
 * the beach is a climb rather than a step, and worth having at all because a
 * ridge is steeper than the hull is wide: 90 cm of clearance measured under the
 * centre of a disc two metres across is no clearance whatever on the uphill
 * side, which is what flying over the isle had been showing.
 */
const CLEAR = 1.4
const CLEAR_IN = 2.5
/**
 * And where the ground is read. Not one sample under the middle of the hull but
 * five: four at arm's length round it, which is the rim the ridge was coming up
 * through, and one a third of a second along the ship's own velocity — the same
 * third of a second the follow below lags by, so the climb starts as the slope
 * arrives instead of once it is already inside it.
 */
const FEEL = 2.2
const FEELERS = 4
const LOOK = 0.35

/**
 * How high the saucer wants to be above the plateau datum at an XZ, given the
 * velocity it is carrying. Zero at sea and zero over a landmark's flat top:
 * `ground()` is sea level everywhere but the isle, so every frame those two
 * ever had is arithmetically unchanged.
 */
function clearance(x: number, z: number, vx: number, vz: number) {
  let land = Math.max(0, ground(x, z) - GROUND)
  for (let i = 0; i < FEELERS; i++) {
    const a = (i / FEELERS) * Math.PI * 2
    land = Math.max(land, ground(x + Math.cos(a) * FEEL, z + Math.sin(a) * FEEL) - GROUND)
  }
  land = Math.max(land, ground(x + vx * LOOK, z + vz * LOOK) - GROUND)
  return land + CLEAR * THREE.MathUtils.smoothstep(land, 0, CLEAR_IN)
}

/** Saturating limit: `soft(v, m)` is v for small v and never leaves ±m. */
// The camera's two lags. Its height follows slowly, so the chop never moves it;
// its aim follows quickly, so a hull that has just been thrown three metres in
// the air is still in the middle of the frame. The gap between them is the
// tilt, and the tilt is what a jump looks like from behind.
const CAM_RISE = 1.8
const CAM_AIM = 4

// The bounce. One spring driven by the ship's own acceleration — horizontal,
// vertical and any mix — read back as lean, pitch and suspension travel. The
// hull reacts; the flight path stays exactly as damped as it was, so changing
// how bouncy it looks never makes it harder to steer.
const SPRING = 55     // stiffness. sqrt(SPRING) is the wobble rate, ~1.2 Hz.
const DAMP = 8        // below 2*sqrt(SPRING) = overshoot. That overshoot is the bounce.
const LEAN = 0.55     // spring travel -> radians of roll / pitch. ~20 deg on a full reversal.
const SQUASH = 0.35   // spring travel -> metres of vertical give. ~0.12 m starting a climb.
// The altitude target is a step, so its derivative spikes by whatever the frame
// rate is. Capping the drive keeps the bounce bounded and the same at 30 or 144.
const JOLT = 60       // units/sec^2
/** Where the camera sits relative to the hull: `z` astern of it and `y` above,
 *  in the hull's own frame rather than the world's — the camera comes round
 *  behind the heading now, so +z is "behind" whichever way the ship is pointed
 *  rather than a fixed world direction. Its x is zero and `camYaw`'s arithmetic
 *  in the frame loop assumes it. Neither number changes when the camera turns,
 *  which is why the pitch below, and everything derived from it, is untouched. */
export const CAM_OFFSET = new THREE.Vector3(0, 2.4, 7.2) // flat enough to keep the horizon in frame
/**
 * Where the horizon lands, and the reason the number below is not decoration.
 *
 * The camera sits `CAM_OFFSET` behind the hull and `hover` above it — 1.5 up
 * over 7.2 back, so it looks down 11.77deg. It yaws, and that is exactly why
 * this still holds: swinging round behind the hull changes the bearing and not
 * the 7.2 or the 1.5, so the pitch, and the horizon it puts on the screen, are
 * the same at every heading. Only a change to the offset itself moves it. A perspective
 * frame is linear in tangents, so the horizon sits at tan(11.77) / tan(22.5) =
 * 0.503 of the half-height above centre, which is 24.85% of the way down the
 * frame. `--horizon` in `index.css` is that number, `SKY_TOP` in `Scenery.tsx`
 * is the sine of what is left above it, and the gradient behind the canvas is
 * the frame the canvas draws. Change the offset and all three move — which is
 * what the assert below is for, because two of the three are in other files and
 * one of them is CSS, where nothing can reach in and check.
 */
const HORIZON = 0.2485

if (import.meta.env.DEV) {
  const drop = CAM_OFFSET.y - 0.9 // the default `hover`; see the prop below
  const at = (1 - Math.tan(Math.atan(drop / CAM_OFFSET.z)) / Math.tan((45 / 2) * (Math.PI / 180))) / 2
  console.assert(
    Math.abs(at - HORIZON) < 0.002,
    `the camera puts the horizon at ${(at * 100).toFixed(2)}% of the frame, not ${(HORIZON * 100).toFixed(2)}% — ` +
      'update `--horizon` in index.css and `SKY_TOP` in Scenery.tsx to match, or the landing page steps at the cut',
  )
}

const CAM_LAG = 3.5

/**
 * How far below the hull the camera aims, in world units. Zero everywhere the
 * panel is a column beside the world, and Phase 6's one change to the framing
 * where it is a sheet across the bottom of a phone: a ship the camera centres
 * in the viewport is a ship centred behind that sheet, and the visitor cannot
 * see the thing they are steering.
 *
 * Aiming low tips the camera down, which lifts the ship — about 18% of the
 * screen at this distance and field of view — into the band above the panel,
 * and brings the landmarks it is flying at up with it. `CAM_OFFSET` is
 * untouched, so no approach distance and no proximity radius moves; what
 * changes is where the frame is pointed, and it costs sky at the top.
 */
const AIM_DOWN = window.matchMedia('(pointer: coarse)').matches ? 1.15 : 0

/**
 * Where the hull is this frame, and how fast. Written once per frame, read by
 * `Particles`, which spawns spray under the saucer and so has to know both —
 * the position to put it, and the velocity to trail it.
 *
 * A module-level object rather than a ref, because a ref means lifting the
 * ship's state into `Scene` and threading it through a component that has no
 * other interest in it. `CAM_OFFSET` above is exported for the same kind of
 * reason. Nothing writes to this but the frame loop below.
 */
export const SHIP = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), sea: 0 }

/**
 * The same hull, as the vec2 the landmarks' shaders measure an approach from.
 * They used to recover it by subtracting a constant `CAM_OFFSET` from the
 * camera, which stopped being a constant the moment the camera started turning
 * with the ship. One uniform, written in the same block of the frame loop as
 * `SHIP` above, and it is a smaller thing to read than the subtraction was.
 */
export const SHIP_XZ = uniform(new THREE.Vector2())

/**
 * What the rider is riding, as thirteen numbers a frame — eight about the hull
 * under him and five about not being on it. `Surfer` reads them and nothing
 * else does, which is why they are module-local where `SHIP` above is
 * exported — same reason, one file smaller.
 *
 * They are the whole interface between the physics and the man on the board.
 * There is no clip, no state machine and no animation graph: every joint below
 * is a sum of these, so the rider is *reacting* rather than playing back, and a
 * jump he has never taken before still lands. The walk is the same claim on
 * land: the phase is distance travelled, not a clip, so he cannot walk faster
 * than he is moving and he cannot moonwalk out of a stop.
 *
 * The last three are the important ones and they are the reason the first pass
 * read as a figurine with joints. The rider is a child of `body`, so the hull's
 * bank and its pitch are *already* applied to him by the scene graph — which
 * means a board heeled thirty degrees to a wave face rolled the man thirty
 * degrees with it, head and all. That is not what a person does. A person keeps
 * his head where the horizon is and spends the difference in his ankles, his
 * knees and his hips.
 *
 * So the hull's attitude arrives split in two. `tilt` and `slope` are the
 * water's share and `ride` takes nearly all of it back out; `bank` is the
 * craft's own lean into a turn, which is a decision the visitor made and which
 * he should mostly *go with* — a rider who stood upright through a carve would
 * read as a passenger. Nearly all of one and a third of the other, out of the
 * same joints. `heave` is the same idea one derivative up: the sea pushing the
 * deck at him, which a standing person meets by getting shorter.
 *
 * `turn`, `push`, `tilt`, `slope` and `heave` are signed; the rest are not. The
 * eight are smoothed here rather than at the joints, because a body's own lag is
 * one lag and not seventeen — and here that lag is doing real work: the board
 * snaps to the wave and the man arrives a tenth of a second later, which is
 * most of what absorbing a shock looks like from outside.
 */
const RIDE = {
  speed: 0, // 0 at rest, 1 at cruise. Boost pushes it past 1; nothing clamps it down.
  turn: -0, // -1 to 1, the heading's rate. Positive is round toward his open side.
  air: 0,   // 1 with the board clear of the water
  slam: 0,  // a landing, decaying. Set by the impact, spent over about a third of a second.
  push: 0,  // -1 to 1: leaning back under acceleration, forward under the brake
  tilt: 0,  // radians: how far the water has the deck heeled across, the turn's bank excluded
  slope: 0, // radians: and how far it has it pitched fore and aft
  bank: 0,  // radians: and how far the *craft's* own lean into a turn has it over
  heave: 0, // -1 to 1: the deck's vertical acceleration, over `SHOCK`
  // And the five that are only about being off it — see `beach.ts`. They are
  // zero on every frame he is riding, which is every frame the world had
  // before the beach, so the pose above is untouched by their arrival.
  land: 0,   // 0 on the board, 1 on foot, ramped over `BEACH` seconds
  step: 0,   // the walk cycle's phase, radians — advanced by distance, not time
  stride: 0, // and its swing, in board units, about the point under each hip
  gait: 0,   // 0 walking, 1 running — see the gait block above `WALK_DUTY`
  duty: 0,   // and the fraction of the cycle a foot is on the ground
  rise: 0,   // the ground's slope along his heading, and across it: what puts
  cant: 0,   // one foot higher than the other on a hillside
}
/** What `RIDE.heave` is 1 at, units/sec^2. A hull settling onto calm water runs
 *  a few of these; a roller taken at full sail is well over it and clamps. */
const SHOCK = 25
/** The yaw rate a full carve reaches, radians/sec — what `RIDE.turn` is 1 at. */
const CARVE = 2.2
/** How fast the body answers a change in any of the eight. A person is not a
 *  spring here: this is reaction time, and 9 is about 110 ms of it. */
const REACT = 9

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Invariant 6: the ship still responds, it just does not oscillate about it.
const DAMPING = REDUCED ? 2 * Math.sqrt(SPRING) : DAMP

/**
 * How the camera comes round behind the hull.
 *
 * It chases `yaw` — the heading, not the roll — and it spends the chase out of
 * *distance travelled* rather than out of the clock. Changing direction is not
 * by itself a reason to move the camera: the hull swings round under it and
 * the frame holds still, and the camera only comes round as the craft actually
 * gets somewhere in the new direction. Turn on the spot, lean on a coastline,
 * slide off a roller — the view stays where it was.
 *
 * The cap is still the part that matters, and it is per unit now: steering is
 * measured against where the camera points, so a held sideways push turns the
 * ship, which turns the camera, which re-aims the push. That loop is what a
 * sustained sideways hold is *for* — it carves a circle rather than sliding
 * across the frame — and 0.09 rad a unit makes that circle 11 units in radius
 * at *every* speed, cruise and boost alike, where a per-second cap made it 8
 * at cruise and 20 under boost.
 *
 * `CAM_SWING_SPIN` is the one number still in seconds and it is a ceiling, not
 * a lag. 0.09 a unit at full boost is 1.6 rad/s, which is a world revolving
 * about the hull; below cruise speed it never binds.
 *
 * Invariant 6: a rotating world is the one thing on this page that can make
 * somebody ill, so a visitor who asked for less motion gets a camera that still
 * ends up astern and takes four times as long about it.
 */
const CAM_SWING = REDUCED ? 0.048 : 0.18     // per unit advanced: e-folds over 5.6
const CAM_SWING_MAX = REDUCED ? 0.022 : 0.09 // rad per unit advanced
const CAM_SWING_SPIN = REDUCED ? 0.22 : 0.9  // rad/sec, whatever the speed

const _target = new THREE.Vector3()
const _cam = new THREE.Vector3()
const _accel = new THREE.Vector3()

export function Ship({ hover = 0.9, enabled, model, slug, onNear }: {
  hover?: number
  /** False on every route with no world showing. The ship stops reading keys. */
  enabled: boolean
  /** Which craft the visitor picked in the menu. One flight controller for all
   *  three: anything that floats is the same ship with its altitude pinned to
   *  the sea, a coastline it cannot cross, and a bigger circle to call arrival.
   *  What separates the boat from the surfer is `AGILITY` and `CRAFT_WATER`. */
  model: ShipModel
  /** The case study the URL is showing — the URL is the state, and this is the
   *  ship's copy of it. Null on the home page. */
  slug: string | null
  onNear: (slug: string | null) => void
}) {
  const rig = useRef<THREE.Group>(null!)   // position + yaw
  const body = useRef<THREE.Group>(null!)  // bob + roll
  const vel = useRef(new THREE.Vector3())
  // Pointed the way the camera looks, not the way it sits: the camera is astern
  // of the heading now, so a hull spawned at yaw 0 would put the camera on the
  // far side of the world, looking back at an empty sea. Pi is the heading the
  // ship has held on every frame anyone has ever flown — forward is -z — so
  // this is the frame the landing page already cuts to, with the stern of the
  // craft in it rather than its bow, and the first press of W no longer spins
  // the hull through 180deg to start moving.
  const yaw = useRef(Math.PI)
  const near = useRef<string | null>(null)
  const alt = useRef(hover)
  const altVel = useRef(0)
  // What the craft is standing on, as a world Y rather than an offset: the one
  // value the camera follows for every craft. For a hull it is the buoyancy
  // spring's, written by it and by gravity; for the saucer it is the ground
  // under it, lagged by `FOLLOW`. One value and not two because it is the same
  // question — how high is the thing the craft is riding — and the camera
  // should not have to ask it twice.
  const hull = useRef(0)
  const hullVel = useRef(0)
  const lastSurface = useRef(0)
  const wet = useRef(1)   // 1 in the water, 0 in the air, smoothed between
  const flew = useRef(false) // last frame's answer, so leaving and landing are events
  // Where the camera is round the hull, chasing `yaw` — see `CAM_SWING`. Its
  // own value rather than `yaw` read late, because the lag between the two *is*
  // the turn, and steering is measured against this one.
  const camYaw = useRef(Math.PI)
  const lastYaw = useRef(Math.PI) // last frame's heading, for `RIDE.turn`
  const camY = useRef(0)  // the camera's lagged share of the hull's rise
  const aimY = useRef(0)  // and the faster one it points at
  const reset = useRef(true) // next frame: sit the hull on the water, do not fall to it
  const beached = useRef(0)  // 0 riding, 1 walking — `ashore` in `beach.ts`
  const groundY = useRef(0)  // the sand under his feet — `follow` in `beach.ts`
  const hop = useRef(0)      // how far off the sand a jump has him, and how fast
  const hopVel = useRef(0)
  const held = useRef(false)
  const overSand = useRef(false)  // in the air off the water, above the sand // last frame's Space, so a jump is a press
  const lastVel = useRef(new THREE.Vector3()) // for acceleration; velocity is damped, not raw input
  const spring = useRef(new THREE.Vector3())
  const springVel = useRef(new THREE.Vector3())
  // True on the first frame as well as after a deep link: the camera starts
  // wherever `Scene` parked it, and a lag of 3.5 turns that into a second of
  // swooping into position — which is a camera move the visitor did not ask
  // for, over the cut from a page whose horizon was already in the right place.
  const snap = useRef(true) // next frame: place the camera, do not chase it
  const input = useInput(enabled)
  // Everything below asks "does it float", not "is it the boat" — the surfer
  // does the same thing in the same water, with its own column of numbers.
  const floats = model !== 'saucer'
  const agile = AGILITY[model]
  const water = model === 'surfer' ? CRAFT_WATER.surfer : CRAFT_WATER.boat

  /**
   * Deep link, or a click in the world's own project list: put the ship beside
   * the landmark the URL names, facing it. A layout effect, so it lands before
   * the first frame and the very next proximity read already agrees with the
   * URL it came from — otherwise the panel a visitor followed a link to read
   * closes itself one frame later.
   *
   * Skipped when the ship is the reason the URL says what it says: a proximity
   * push must never yank the ship back to the waypoint it just flew past. The
   * reverse — the URL going home while the ship is still parked — leaves it
   * parked, because closing a panel is not a request to be moved.
   */
  useLayoutEffect(() => {
    const l = landmarkOf(slug)
    if (!l || near.current === l.slug) return
    rig.current.position.set(l.waypoint[0], 0, l.waypoint[2])
    // Every waypoint is inside its own island, which is fine for something that
    // flies and is dry land for something that floats. The same push that keeps
    // the boat off a coast puts the deep link on the water — onto the mooring
    // circle exactly, which `world.ts` asserts is inside the circle that opens
    // the panel. `floats` is read here and deliberately not a dependency: this
    // effect answers the URL changing, and changing a setting in the menu is
    // not a reason to pick the ship up and move it. True for the surfer too:
    // both floating craft are held off the same coastline.
    if (floats) offshore(rig.current.position)
    // From where it actually ended up, not from the waypoint it was aimed at.
    const p = rig.current.position
    yaw.current = Math.atan2(l.pos[0] - p.x, l.pos[2] - p.z)
    rig.current.rotation.y = yaw.current
    vel.current.set(0, 0, 0)
    lastVel.current.set(0, 0, 0)
    spring.current.set(0, 0, 0)
    springVel.current.set(0, 0, 0)
    reset.current = true
    // A deep link is a teleport and not a walk: every waypoint is out at sea,
    // so arriving at one is arriving on the board, however he left.
    beached.current = 0
    near.current = l.slug
    snap.current = true
    // `floats` is read above and is deliberately not a dependency — see the
    // note beside it. Nothing here goes stale: the effect only runs on a URL
    // change, and at that point it is whatever this render says it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useFrame((state, delta) => {
    // Floored as well as capped: a backgrounded tab returns with a huge delta, and
    // two frames inside one clock tick give delta 0 — which the acceleration
    // divides by, and one NaN frame hides the ship for the rest of the session.
    const dt = THREE.MathUtils.clamp(delta, 1 / 240, 0.05)
    const g = rig.current

    // Coming ashore, and it is read before anything else because it decides how
    // fast he is going: the speed below is his on the board or his on foot, and
    // this is the ramp between them. Last frame's position, deliberately —
    // nothing here is worth reordering the frame for.
    const walks = model === 'surfer'
    // How long the change ashore has, when it has to be quicker than the
    // beach's own second and a quarter: a hull in the air over the sand lands
    // when its arc meets it, and the pickup has to be done by then — so it is
    // given the time the fall has left, out of last frame's arc.
    const groundHere = ground(g.position.x, g.position.z)
    const drop = Math.max(hull.current - (groundHere - FOOT_DROP), 0)
    const within = walks && flew.current
      ? (hullVel.current + Math.sqrt(hullVel.current * hullVel.current + 2 * GRAV * drop)) / GRAV
      : BEACH
    beached.current = walks ? ashore(beached.current, groundHere, dt, REDUCED, within) : 0
    const afoot = beached.current
    if (afoot <= 0) overSand.current = false

    // Space. The saucer's is a *held* climb to a ceiling — one damped value,
    // nothing to time and nothing to land on — and this is the opposite: an
    // edge, once, and then a ballistic arc. So they read the same key and only
    // one of them reads it this way, which is what `held` is for.
    //
    // The surfer alone, and the argument is not that he is the newest craft: a
    // person can jump and a hull cannot. It is the one craft in this world that
    // is a body rather than a boat.
    const jump = walks && input.ascend && !held.current
    held.current = input.ascend

    // Movement is measured against where the camera points, not against the
    // world: forward is into the screen and right is right, at every heading,
    // which is the whole reason the camera turns at all. It is the loop the
    // fixed camera was avoiding — steer left, the ship turns, the camera comes
    // round, and left is somewhere else — and `CAM_SWING_MAX` is what bounds
    // it. Held sideways it carves; tapped, it turns and settles.
    //
    // The hull's own frame. Up here rather than beside the bounce spring it also
    // serves, because the sea below reads a wave's slope in it first.
    const sy = Math.sin(yaw.current) // `sin` is TSL's, imported above
    const cy = Math.cos(yaw.current)

    // Last frame's bearing, deliberately: the camera has not turned yet this
    // frame, and steering against a camera that moves inside the same tick is
    // the loop above with the lag taken out of it.
    steer(input.move.x, input.move.y, camYaw.current, _target)
    _target.y = 0
    _target.multiplyScalar((input.boost ? SPEED * BOOST : SPEED) *
      (agile.speed + (WALK_SPEED - agile.speed) * afoot))
    vel.current.lerp(_target, 1 - Math.exp(-ACCEL * dt))
    g.position.addScaledVector(vel.current, dt)
    // A hull cannot climb a beach. Pushed back onto the mooring circle rather
    // than stopped dead, so a boat leaning on a coast keeps whatever part of its
    // motion runs along it and slides round the island instead of sticking.
    // The isles are not a wall for the surfer — he walks up them — and they are
    // for everything else. The landmark islands still are for both: see the
    // note on `offshore`.
    if (floats) offshore(g.position, !walks)

    if (vel.current.lengthSq() > 0.0025) {
      const want = Math.atan2(vel.current.x, vel.current.z)
      const diff = Math.atan2(Math.sin(want - yaw.current), Math.cos(want - yaw.current))
      yaw.current += diff * (1 - Math.exp(-agile.turn * dt))
    }
    g.rotation.y = yaw.current

    /**
 * How fast the saucer's altitude answers the ground under it. Ten metres of
 * ridge arriving at cruise is a step as far as a hovercraft is concerned, and
 * one that answered a step instantly would be a cut. At 3.2 the climb lags the
 * beach by about a third of a second, which reads as a machine holding its
 * height — and it is a lag and not a spring, because the one thing worse than
 * flying through a hill is bouncing over it.
 */
const FOLLOW = 3.2

/**
 * Except upward, where a third of a second is three metres. A slope met at boost
 * is ten metres a second of terrain arriving, and a lag that answered it at
 * `FOLLOW` put the hull inside the hill and let it out again on the far side.
 * So: up quickly, down at its own pace. Still a lag and not a spring, and still
 * nothing to bounce on — the asymmetry only ever removes overshoot, because the
 * fast direction is the one that runs away from the ground.
 */
const RISE = 10

// Space climbs to hover + LIFT and holds there; releasing sinks back. One
    // damped value, so there is no jump arc to time and nothing to land on.
    // The boat's is pinned to sea level: it floats, so there is nowhere to climb
    // to and nothing for Space to do. `WorldGate`'s hint stops naming the key
    // rather than leaving it in the sentence doing nothing.
    const wasAlt = alt.current
    const wantAlt = floats ? 0 : input.ascend ? hover + LIFT : hover
    alt.current += (wantAlt - alt.current) * (1 - Math.exp(-CLIMB * dt))
    const climbVel = (alt.current - wasAlt) / dt

    // The sea under the ship, and this one is read for both hulls: the boat
    // rides it, and the saucer hovers *over* it — which was the same as hovering
    // over zero until the rollers made the water move. `SHIP.sea` publishes it
    // for the spray, which spawns on the surface rather than at sea level, and
    // for the wind, which opens with height above the water and not above the
    // origin.
    //
    // `Scenery` owns the waves and the shader reads the same ones, so this is
    // the water the visitor can see rather than a second sea that nearly
    // matches — and now that the rollers are displaced geometry, "nearly" would
    // be visible.
    const s = swell(g.position.x, g.position.z, REDUCED ? 0 : state.clock.elapsedTime)
    SHIP.sea = s.y
    // The splash's clock is wall time, not the physics' clamped `dt`: it is a
    // thing the visitor watches fade rather than a thing that is integrated, and
    // on a slideshow it should still be gone in a second.
    if (SPLASH.age < 9) SPLASH.age += Math.min(delta, 0.25)

    // What the craft is riding: the sea for anything that floats, and for the
    // saucer the land, which until the isle arrived was always sea level.
    //
    // `clearance` is built on the isle's own height function — the same one its
    // mesh is built from (`src/isles.ts`), so the saucer clears the geometry the
    // visitor can see rather than a second island that nearly matches. Measured
    // *above the plateau the three project islands sit on*, not above the water,
    // which is what keeps the sea and a landmark's flat top exactly as they
    // shipped. Only ground higher than a plateau moves it, and the only ground
    // higher than a plateau is the isle — where it now buys the extra `CLEAR`
    // as well, read over the hull's rim and a little way ahead of it.
    let ride = 0
    let roll = 0
    let heel = 0
    let vertAccel = (climbVel - altVel.current) / dt
    if (!floats) {
      const land = clearance(g.position.x, g.position.z, vel.current.x, vel.current.z)
      // A deep link, or the first frame: arrive at that height rather than
      // climbing to it from the sea, exactly as a hull arrives floating.
      if (reset.current) {
        reset.current = false
        hull.current = land
      }
      hull.current += (land - hull.current) *
        (REDUCED ? 1 : 1 - Math.exp(-(land > hull.current ? RISE : FOLLOW) * dt))
      ride = hull.current
    }
    if (floats) {
      const surface = s.y
      if (reset.current) {
        // A deep link puts the hull down beside a landmark. It arrives floating,
        // not falling from wherever the last one was.
        reset.current = false
        hull.current = surface
        groundY.current = ground(g.position.x, g.position.z)
        hop.current = hopVel.current = 0
        hullVel.current = 0
        lastSurface.current = surface
        wet.current = 1
        camY.current = aimY.current = surface
      }
      // How fast the water under the hull is moving: dh/dt plus the hull's own
      // run up the face, because the sample follows the hull. The second term is
      // what turns speed into height. Capped, or a frame that crosses a crest
      // reads as an impulse.
      const surfVel = THREE.MathUtils.clamp((surface - lastSurface.current) / dt, -SURF_MAX, SURF_MAX)
      lastSurface.current = surface

      const flying = hull.current > surface + SKIN
      // Off the top of a crest: the kick that turns a hop into a jump.
      if (flying && !flew.current && hullVel.current > water.popMin) {
        hullVel.current = Math.min(hullVel.current * water.pop, water.launch)
      }
      // And back into it. The impact is last frame's fall, before the spring
      // has had a chance to answer it — which is the number a splash is the
      // size of, and the number the hull compresses by.
      if (!flying && flew.current && -hullVel.current > SPLASH_MIN && afoot < 0.5) {
        const impact = Math.min(-hullVel.current, water.launch)
        SPLASH.x = g.position.x
        SPLASH.z = g.position.z
        SPLASH.force = Math.min(impact / SPLASH_FULL, 1)
        SPLASH.age = 0
        springVel.current.y += impact * water.squash
        // The same impact the hull compresses by, and the rider absorbs it in
        // his knees. Set rather than accumulated: a second landing during the
        // first is one landing, not a rider driven through the deck.
        RIDE.slam = SPLASH.force
      }
      flew.current = flying

      // And the jump. Added to the spring's own velocity rather than replacing
      // it, so one taken off the face of a roller is a bigger jump than one
      // taken in a trough and nothing had to say so — the sea is already moving
      // him. `flew` goes with it so `POP` does not compound it next frame:
      // that kick is what a *crest* gives you, and this is what his legs do.
      if (jump && !flying && afoot < 0.5) {
        hullVel.current = Math.min(hullVel.current + JUMP, water.launch)
        flew.current = true
      }

      const wasVel = hullVel.current
      hullVel.current += dt * (flying
        ? -GRAV
        : (surface - hull.current) * water.buoyK - (hullVel.current - surfVel) * water.buoyC)
      hullVel.current = Math.min(hullVel.current, water.launch)
      hull.current += hullVel.current * dt
      // A hull landing at six units a second would otherwise be a metre under
      // before the spring caught it, which on displaced water is a hull that
      // disappeared. It stops at the draft it has, and the spring floats it back.
      if (hull.current < surface - water.sink) {
        hull.current = surface - water.sink
        hullVel.current = Math.max(hullVel.current, 0)
      }
      // The landing, the wave face and the drop off a crest all reach the body
      // through the bounce spring below rather than through a case of their own:
      // that spring is already the thing that turns vertical acceleration into
      // squash, and `JOLT` already bounds it.
      vertAccel = (hullVel.current - wasVel) / dt
      ride = hull.current

      wet.current += ((flying ? 0 : 1) - wet.current) * (1 - Math.exp(-(flying ? DRY : WET) * dt))
      // Flip either sign if the hull leans into the wave rather than over it —
      // this is the pair of numbers a screenshot settles and arithmetic does not.
      // The chop's slope is exaggerated and the roller's is not: one is 15 cm of
      // painted water, the other is a thirty-degree face you can see.
      roll = soft((s.dx * cy - s.dz * sy) * water.tilt + (s.rx * cy - s.rz * sy), water.heel) * wet.current
      heel = soft(-((s.dx * sy + s.dz * cy) * water.tilt + (s.rx * sy + s.rz * cy)), water.heel) * wet.current

      // And the beach. The buoyancy above keeps running underneath — the water
      // is still there and he is going back to it — so this is a blend and not
      // a branch, and coming off it needs no state at all. Crossing the
      // waterline is not a step because both sides of it are near zero there:
      // the ground is zero at the coast by construction (`isles.check.ts`
      // asserts it) and the swell is damped to the chop by `shoal`.
      if (afoot > 0) {
        groundY.current = follow(groundY.current, ground(g.position.x, g.position.z), dt)

        // The hop, and this is the only place in the world that integrates
        // gravity for something that is not water. Landing is spent the way the
        // hull's is — into the bounce spring, and into his knees — because it
        // is the same landing and the rider should not have to know which
        // surface he came down on.
        if (jump && afoot > 0.5 && hop.current <= 0) hopVel.current = JUMP
        if (hop.current > 0 || hopVel.current !== 0) {
          hopVel.current -= HOP_G * dt
          hop.current += hopVel.current * dt
          if (hop.current <= 0) {
            springVel.current.y += -hopVel.current * water.squash
            RIDE.slam = Math.min(-hopVel.current / SPLASH_FULL, 1)
            hop.current = 0
            hopVel.current = 0
          }
        }

        // And the altitude. A floor and not a fade — see `WALK_LAND` — so the
        // ground wins the frame it is higher, which is the first frame of the
        // change and not the last. The ramp beside it only ever runs the other
        // way, walking back down into a sea that is by then the higher of the
        // two, and it is what hands him to the swell over a quarter of a second
        // instead of dropping him onto it.
        //
        // `FOOT_DROP` follows the *board* and not `ashore`: his soles are on
        // the deck while the deck is on the sand, and on the sand once the
        // board is in his arms. Same curve as the board's own lift, or he walks
        // 16 cm above the thing he is standing on.
        const sand = groundY.current - FOOT_DROP * carried(afoot) + hop.current
        // Coming down out of a jump onto the sand: the arc ends here, on his
        // knees and into the bounce spring the way a hop's does, and the
        // hull's own fall under him — on to a sea that is under the island —
        // is no longer his. Landing is a thing that happens once.
        if (flying && overSand.current && ride <= sand) {
          springVel.current.y += -hullVel.current * water.squash
          RIDE.slam = Math.min(-hullVel.current / SPLASH_FULL, 1)
          hullVel.current = 0
        }
        overSand.current = flying && ride > sand
        ride = altitude(ride, sand, afoot, flying)
        // A man walking does not heel to a wave, and the deck is not throwing
        // him anywhere: what is left of the water fades out of all three.
        roll *= 1 - afoot
        heel *= 1 - afoot
        vertAccel *= 1 - afoot
      }
    }

    // Acceleration this frame, all three axes at once — so a diagonal that also
    // climbs bounces once, in the direction it actually changed.
    _accel.subVectors(vel.current, lastVel.current).divideScalar(dt)
    _accel.y = vertAccel
    _accel.clampLength(0, JOLT)
    lastVel.current.copy(vel.current)
    altVel.current = climbVel

    springVel.current.addScaledVector(_accel, dt)
      .addScaledVector(spring.current, -SPRING * dt)
      .addScaledVector(springVel.current, -DAMPING * dt)
    spring.current.addScaledVector(springVel.current, dt)

    // Read the spring in the ship's own frame: sideways travel leans it, travel
    // along the heading pitches the nose, vertical travel is suspension give.
    const lateral = spring.current.x * cy - spring.current.z * sy
    const along = spring.current.x * sy + spring.current.z * cy

    // The hull's attitude is two things added together and the rider owes them
    // different answers, so they are named here and summed a few lines down
    // rather than written straight into the rotation. `bank` and `nose` are
    // what the *craft* is doing — the bounce spring's lean, which is a decision
    // the visitor made — and `roll` and `heel` are what the *water* is doing to
    // it. He leans with the first and stands up against the second.
    const bank = THREE.MathUtils.clamp(-lateral * LEAN, -BANK, BANK)
    const nose = THREE.MathUtils.clamp(-along * LEAN, -PITCH, PITCH)

    // And the rider's eight, read off the same frame the hull was just built
    // from. Written for every craft rather than only for the surfer: they are
    // facts about the hull, the branch would save four multiplies, and a value
    // that only updates while you are looking at it is a value that jumps the
    // moment you switch craft in the menu.
    const spin = Math.atan2(Math.sin(yaw.current - lastYaw.current),
      Math.cos(yaw.current - lastYaw.current)) / dt
    lastYaw.current = yaw.current
    const react = 1 - Math.exp(-REACT * dt)
    RIDE.turn += (THREE.MathUtils.clamp(spin / CARVE, -1, 1) - RIDE.turn) * react
    RIDE.speed += (vel.current.length() / SPEED - RIDE.speed) * react
    RIDE.push += (THREE.MathUtils.clamp(-along * 2.2, -1, 1) - RIDE.push) * react
    // Airborne, and the two modes measure it differently — the hull off the
    // surface, or the hop off the sand. One number out of it, because what the
    // rider does about it is the same thing.
    // Off the ground on land: a hop, or a jump off the water that has not
    // come down yet — `overSand` is that second one, so that a man crossing
    // the coast in the air stays a man in the air rather than a man walking
    // at a height.
    const aloft = Math.max(Math.min(hop.current / 0.3, 1), overSand.current ? 1 : 0)
    RIDE.air += ((1 - wet.current) * (1 - afoot) + aloft * afoot - RIDE.air) * react
    // Spent over about a third of a second, and linearly: a landing is a thing
    // that finishes, where an exponential leaves the knees half bent forever.
    RIDE.slam = Math.max(0, RIDE.slam - dt * 3.2)
    RIDE.tilt += (roll - RIDE.tilt) * react
    RIDE.slope += (heel - RIDE.slope) * react
    RIDE.bank += (bank - RIDE.bank) * react
    RIDE.heave += (THREE.MathUtils.clamp(vertAccel / SHOCK, -1, 1) - RIDE.heave) * react

    // And the walk's five. The phase is advanced by *distance* and not by time,
    // so a rider who stops stops mid-step, and boost is a longer stride at the
    // same cadence — which is the one thing about a run that a fixed frequency
    // always gets wrong. Not smoothed through `react` like the eight above:
    // these are not a body's answer to the hull, they are where his feet are.
    RIDE.land = afoot
    const pace = Math.hypot(vel.current.x, vel.current.z)
    // Walking or running, and everything about the gait follows from it. The
    // band starts just above his own cruise and is done at twice it, which is
    // most of the way into boost — so a visitor who never presses shift never
    // sees the run, and one who holds it is running by the time he is up to
    // speed rather than the moment he presses.
    const cruise = SPEED * WALK_SPEED
    RIDE.gait = THREE.MathUtils.smoothstep(pace, cruise * 1.15, cruise * 2.1)
    RIDE.duty = WALK_DUTY + (RUN_DUTY - WALK_DUTY) * RIDE.gait
    // The swing shrinks below cruise so a creep is short steps rather than slow
    // giant ones; above it, it is the gait's.
    RIDE.stride = Math.max(0.06, (WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * RIDE.gait) *
      Math.min(pace / cruise, 1))
    // And the rate, which is derived and not chosen: this is the number that
    // makes the planted foot travel backward at exactly the speed the body
    // travels forward. See the gait block above `WALK_DUTY`.
    RIDE.step = (RIDE.step + TAU * dt * afoot * (1 - aloft) *
      Math.min((pace * RIDE.duty) / (2 * RIDE.stride), CYCLE_MAX)) % TAU
    // The hillside, in the hull's own frame: the ground a stride ahead against
    // the ground a stride behind, and the same across him. It is what puts the
    // uphill foot higher instead of both of them in the slope, and it is four
    // height queries that only happen while he is on one.
    if (afoot > 0.01) {
      const e = 0.6
      const gx = g.position.x
      const gz = g.position.z
      RIDE.rise = (afoot * (ground(gx + sy * e, gz + cy * e) -
        ground(gx - sy * e, gz - cy * e))) / (2 * e)
      RIDE.cant = (afoot * (ground(gx + cy * e, gz - sy * e) -
        ground(gx - cy * e, gz + sy * e))) / (2 * e)
    } else RIDE.rise = RIDE.cant = 0

    body.current.rotation.z = bank + roll
    body.current.rotation.x = nose + heel
    body.current.position.y =
      alt.current + ride - spring.current.y * SQUASH +
      // The saucer's idle hover. The boat already has one and it is the sea's.
      (REDUCED || floats ? 0 : Math.sin(state.clock.elapsedTime * 1.2) * 0.05)

    // The rig carries XZ and the body carries altitude, so the hull's world
    // position is one from each. Published here, after both have settled.
    SHIP.pos.set(g.position.x, body.current.position.y, g.position.z)
    SHIP.vel.copy(vel.current)
    // And the map's share of the same frame: XZ and heading, no altitude. The
    // arrow is drawn from `yaw`, not from the body's roll, so a hull leaning
    // into a wave does not swing the map.
    VIEW.x = g.position.x
    VIEW.z = g.position.z
    VIEW.yaw = yaw.current
    SHIP_XZ.value.set(g.position.x, g.position.z)

    // Proximity is an event, not a state: it pushes a URL and the URL is what
    // everything else reads back (invariant 3 — nothing here remounts a tree).
    const hit = landmarkAt(g.position.x, g.position.z, floats)?.slug ?? null
    if (hit !== near.current) { near.current = hit; onNear(hit) }

    // A camera that bobs with the chop is a camera nobody wants, and that is
    // still true — but a hull that rides a roller and leaves it goes three
    // metres up, and a camera that ignored *that* would lose the thing the
    // visitor is steering off the top of the frame. So it follows a heavily
    // lagged copy: a second of time constant filters the chop out entirely and
    // still keeps most of a jump in shot. Aim and position use the same value,
    // so the boat holds its place in the frame and the horizon is what moves.
    camY.current += (ride - camY.current) * (1 - Math.exp(-CAM_RISE * dt))
    aimY.current += (ride - aimY.current) * (1 - Math.exp(-CAM_AIM * dt))

    // Round behind the heading, capped so the loop steering closes cannot spin.
    // On a snap it is simply astern already: a deep link arrives facing the
    // landmark it named, and the camera has no swing to make.
    // How far the craft advanced *along its heading* this frame, which is what
    // the swing is spent out of — see `CAM_SWING`. Projected rather than the
    // raw speed, and floored at zero, so being pushed sideways out of a
    // shoreline or sliding down a roller does not turn the frame.
    const ds = Math.max(0,
      vel.current.x * Math.sin(yaw.current) + vel.current.z * Math.cos(yaw.current)) * dt
    camYaw.current = snap.current
      ? yaw.current
      : swing(camYaw.current, yaw.current, ds, dt, CAM_SWING, CAM_SWING_MAX, CAM_SWING_SPIN)
    // `CAM_OFFSET.z` is a distance astern of the hull's heading rather than a
    // world +z, and `.x` is zero — see the note on it. The height is the same
    // number it always was, so the pitch and the horizon do not move.
    _cam.set(
      g.position.x - Math.sin(camYaw.current) * CAM_OFFSET.z,
      g.position.y + CAM_OFFSET.y,
      g.position.z - Math.cos(camYaw.current) * CAM_OFFSET.z,
    )
    // Rise with the ship, or the ceiling puts it out of frame. `- hover` is the
    // hull's own altitude coming back out, and it is subtracted for every craft
    // rather than the saucer alone: without it the camera sat 2.4 over a boat
    // and 1.5 over a saucer, which is 18.4deg of pitch against 11.8deg and put
    // the horizon a tenth of the way down the frame instead of a quarter. The
    // craft is remembered between visits, so that was a different world every
    // time somebody who had once picked the boat came back to the landing page.
    // `alt` is the hover and the climb, `camY` the lagged copy of whatever the
    // craft is riding — the sea for a hull, the ground for the saucer. A hull
    // holds `alt` at zero and the saucer held `camY` at zero until the isle
    // gave it a hill to climb, so this sum is what both of them always were.
    _cam.y += alt.current + camY.current - hover
    if (snap.current) {
      snap.current = false
      camY.current = aimY.current = ride
      state.camera.position.copy(_cam)
    } else state.camera.position.lerp(_cam, 1 - Math.exp(-CAM_LAG * dt))
    state.camera.lookAt(
      g.position.x,
      g.position.y + alt.current + aimY.current - AIM_DOWN,
      g.position.z,
    )
  })

  return (
    <group ref={rig}>
      <group ref={body} position-y={hover}>
        {/* All three stay mounted and one of them is drawn. Toggling
            `visible` costs a culled node; unmounting would hand back a
            question about who disposes geometry the renderer no longer has,
            for a tree that is two meshes deep. */}
        <Saucer visible={model === 'saucer'} />
        <Boat visible={model === 'boat'} />
        <Surfer visible={model === 'surfer'} />
      </group>
    </group>
  )
}

/** The Phase 0 character: a hovering saucer, revolved from `PROFILE`. */
function Saucer({ visible }: { visible: boolean }) {
  const { hull, dome, glass, beam } = useMemo(() => {
    const hull = new THREE.MeshStandardNodeMaterial({ color: '#cfd8e3', roughness: 0.35, metalness: 0.6 })

    const glass = new THREE.MeshPhysicalNodeMaterial({
      color: '#8ee8ff', roughness: 0.05, transmission: 0.9, thickness: 0.3, transparent: true,
    })

    const beam = new THREE.MeshBasicNodeMaterial({
      color: new THREE.Color('#7dd3fc'), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    // Brightest where it leaves the hull, fading toward the ground.
    beam.opacityNode = positionLocal.y.add(0.35).div(0.7).clamp().mul(0.3)

    const dome = new THREE.SphereGeometry(0.36, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    return { hull, dome, glass, beam }
  }, [])


  return (
    <group visible={visible}>
      <mesh material={hull}>
        <latheGeometry args={[PROFILE.map(([x, y]) => new THREE.Vector2(x, y)), 48]} />
      </mesh>

      <mesh material={glass} geometry={dome} position-y={0.08} />

      {Array.from({ length: LIGHTS }, (_, i) => {
        const a = (i / LIGHTS) * Math.PI * 2
        return (
          <mesh key={i} material={LAMP} position={[Math.cos(a) * 0.78, -0.045, Math.sin(a) * 0.78]}>
            <sphereGeometry args={[0.07, 12, 8]} />
          </mesh>
        )
      })}

      {/* Apex sits under the hull, base spreads toward the ground. No rotation needed. */}
      <mesh material={beam} position-y={-0.45}>
        <coneGeometry args={[0.6, 0.7, 32, 1, true]} />
      </mesh>
    </group>
  )
}

/**
 * The other one: a small single-masted boat, sitting in the water rather than
 * over it. Procedural like the saucer — CLAUDE.md's rule is that the character
 * stays that way, and a hull is two solids of revolution and six sticks, which
 * is less than the export pipeline it would otherwise need.
 *
 * The waterline is this group's y = 0, so `Ship` puts the group on the swell
 * and the hull's own numbers decide how much of it is wet.
 */
function Boat({ visible }: { visible: boolean }) {
  const { hullGeo, deckGeo, hull, timber, canvas } = useMemo(() => {
    // A hull is the bottom of a squashed sphere: round in section, pointed in
    // plan once `pinch` has been at it, and the one shape that gets there
    // without a loft and a list of ribs. Scaled to draft + freeboard and then
    // lifted, so the rim is above the water and the keel is below it.
    const hullGeo = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)
    hullGeo.scale(HULL.beam, HULL.draft + HULL.freeboard, HULL.len)
    hullGeo.translate(0, HULL.freeboard, 0)
    pinch(hullGeo)

    // The deck starts as the same unit circle in XZ and gets the same pinch, so
    // the two rims agree by construction rather than by two sets of numbers
    // being kept in step. Dropped below the rim, which leaves the hull standing
    // proud of it as a bulwark — which is why the hull is double-sided: from the
    // camera you are looking down into that well at the back of it.
    const deckGeo = new THREE.CircleGeometry(1, 24)
    deckGeo.rotateX(-Math.PI / 2)
    deckGeo.scale(HULL.beam, 1, HULL.len)
    pinch(deckGeo)
    deckGeo.translate(0, HULL.freeboard - 0.08, 0)

    const hull = new THREE.MeshStandardNodeMaterial({
      color: '#7a5233', roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide,
    })
    const timber = new THREE.MeshStandardNodeMaterial({ color: '#b98d5c', roughness: 0.8 })
    // Pale, and the brightest thing in the frame after the sun's own glow: the
    // sea is nearly black at this hour and a dark sail would lose the boat.
    const canvas = new THREE.MeshStandardNodeMaterial({
      color: '#efe2c9', roughness: 0.9, side: THREE.DoubleSide,
    })
    return { hullGeo, deckGeo, hull, timber, canvas }
  }, [])

  return (
    <group visible={visible}>
      <mesh geometry={hullGeo} material={hull} />
      <mesh geometry={deckGeo} material={timber} />

      {/* Cabin, aft. Narrow enough to sit inside the hull's beam at that station. */}
      <mesh material={timber} position={[0, HULL.freeboard + 0.03, -0.78]}>
        <boxGeometry args={[0.36, 0.18, 0.5]} />
      </mesh>

      <mesh material={timber} position={[0, 0.95, 0.12]}>
        <cylinderGeometry args={[0.028, 0.038, 1.85, 8]} />
      </mesh>

      {/* The sail: an open cylinder wall, 64 degrees of it. A flat plane reads as
          a sheet of card at this size; an arc reads as canvas with wind in it,
          and costs the same fourteen segments either way. The radius and the arc
          put its chord back at the mast and its belly 11 cm forward. */}
      <mesh material={canvas} position={[0, 1.06, -0.49]}>
        <cylinderGeometry args={[0.75, 0.75, 1.12, 14, 1, true, -0.56, 1.12]} />
      </mesh>

      {/* Yard and boom, across the top and foot of it. */}
      <mesh material={timber} position={[0, 1.65, 0.12]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.022, 0.022, 0.92, 6]} />
      </mesh>
      <mesh material={timber} position={[0, 0.47, 0.12]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.02, 0.02, 0.86, 6]} />
      </mesh>

      {/* Bowsprit, forward and a little up. */}
      <mesh material={timber} position={[0, 0.27, 1.14]} rotation-x={Math.PI / 2 - 0.28}>
        <cylinderGeometry args={[0.018, 0.028, 0.8, 6]} />
      </mesh>

      {/* Rudder, hung off the transom and mostly under water. */}
      <mesh material={timber} position={[0, -0.05, -1.36]}>
        <boxGeometry args={[0.045, 0.34, 0.16]} />
      </mesh>

      {/* Running lights, on the same pulse as the saucer's — the bloom pass
          picks up emissive only, so this is the boat's share of it. */}
      {[-1, 1].map((side) => (
        <mesh key={side} material={LAMP} position={[side * 0.22, HULL.freeboard + 0.19, -0.95]}>
          <sphereGeometry args={[0.055, 10, 8]} />
        </mesh>
      ))}
      <mesh material={LAMP} position={[0, 1.9, 0.12]}>
        <sphereGeometry args={[0.04, 10, 8]} />
      </mesh>
    </group>
  )
}


/** The wake strip: where it starts behind the tail, how long, and how wide at
 *  each end. Read by the geometry that draws it and by the fade in `FOAM`. */
const WAKE = { gap: 0.85, len: 1.9, near: 0.26, far: 0.72 }

/**
 * How much of a wake there is, 0 to 1 — the board's speed, smoothed. At module
 * scope for the same reason `LAMP` is: this module is the canvas chunk, so
 * nothing here is constructed until the world mounts, and one uniform written
 * by one frame loop is not state a component should be holding.
 */
const WAKE_SPEED = uniform(0)

/**
 * Foam, not neon. `Post` blooms the emissive buffer at threshold zero, so what
 * a material declares here is exactly how much halo it gets: this peaks at 0.6
 * against the lamp's 1, and only at full speed. It is the surfer's whole share
 * of the bloom, and was again once the third rider went unlit — the second
 * one's rim light and ribbon glow claimed a slice of it for a pass.
 *
 * Two fades, and the second is not optional: bloom reads the emissive buffer
 * and not the alpha, so a strip that stops dead at its own rails blooms as a
 * rectangle with corners however transparent it is. Along the length from
 * `positionLocal`, across it from `uv` — which is the only one of the two that
 * survives the taper baked into the geometry.
 */
const FOAM = new THREE.MeshStandardNodeMaterial({
  color: '#0b1220', transparent: true, depthWrite: false, side: THREE.DoubleSide,
})
const WAKE_ALONG = positionLocal.z.add(WAKE.gap + WAKE.len).div(WAKE.len).clamp()
const WAKE_ACROSS = uv().x.mul(2).sub(1).abs().oneMinus().pow(1.5)
FOAM.emissiveNode = color('#cfeaff').mul(WAKE_ALONG.mul(WAKE_ACROSS).mul(0.6)).mul(WAKE_SPEED)
FOAM.opacityNode = WAKE_ALONG.mul(WAKE_ACROSS).mul(0.55).mul(WAKE_SPEED)

/**
 * And the third one: somebody on a board. Both are model files now — the only
 * two any craft in this world has — and `tools/surfer.py` is the reason and
 * the argument for it. The board was built here for as long as the rider was
 * metaballs: two solids of revolution, a grid for the pad, three extruded
 * foils. Both came back from the same generator in the third pass, and a
 * modelled rider on a procedural board was two drawing styles on one craft.
 * What is still built here is what is built *between* them: the leash from
 * the plug to his ankle, and the wake, which is the sea's and not the board's.
 *
 * The stance is read off what the camera can see. It sits astern and never
 * yaws, so the visitor spends the whole session looking at this thing's back:
 * the rider is crouched, hands low and near him, one carried on forward of the
 * front knee and one aft of the back one — the trim a surfer holds between
 * turns, and a shape that still reads from directly behind.
 *
 * That is the *rest* pose and since the rig it is only where he starts, which
 * is also why the arms came down out of the wide pose the model first shipped
 * with. Width held permanently is a photograph; width that arrives when the
 * board changes direction is a rider. `ride()` below is where it arrives.
 *
 * The waterline is this group's y = 0, same as the boat, so `Ship` puts the
 * group on the swell and the board's own numbers decide what is wet. What the
 * rider stands on is the board's own deck, and his soles are placed against
 * it in Blender — on its two pads, which is half a metre further aft than the
 * second rider stood, and the one thing about the stance that moved.
 */
/**
 * Where the board goes when nobody is standing on it: on its rail against his
 * right side, its top rail at the armpit, its nose swung out and up.
 *
 * The swing is not decoration and it is the only number here chosen against the
 * camera rather than against the man. The camera sits astern and never yaws, so
 * a board carried along the heading is a board seen end-on — 2 units of it
 * reduced to an ellipse hidden behind its own rider. A quarter of a radian of
 * yaw and an eighth of pitch put it diagonally across the frame, which is both
 * where it reads and how anybody actually carries one.
 *
 * His right is -x: the model faces +z (`GAZE` in `tools/surfer.py`), so the
 * trailing arm at x -0.09 is his right one, and it is the arm that holds the
 * board — see `hold()`, and the trailing arm's numbers in `ride()`.
 *
 * The roll is a quarter turn and a tenth more. The quarter turn's sign is the
 * one that puts the deck against his ribs and the fin outboard, clear of his
 * leg; the tenth (`CARRY_LEAN`) swings the bottom rail out from under his
 * hip, so the underside runs along an arm that hangs from a shoulder and
 * not from the ribs. It is what the arm needs to lie flat on the board,
 * and it is also what a carried board does: the top rail is pinned in the
 * armpit and the rest of it hangs off the forearm.
 *
 * Since the third rider the offset is on the *man* and not in the craft's
 * frame, and `Rider` places the board, not `Surfer`: a board parked at a
 * fixed point in the craft while the man bobbed and swayed beside it was a
 * board floating next to him, which is what Seb saw. It hung off the pelvis
 * first, and that clipped the arm: the pelvis turns with the stride and the
 * shoulders turn against it, so a board on the pelvis and an arm on the
 * chest moved against each other by a hand's width every step. It hangs off
 * the **chest** now, from the trailing shoulder — the same bone the arm
 * hangs from — so the two go everywhere together. `CARRY_POS` is the board's
 * origin from that shoulder, in the frame he stands up into: x his left, y
 * up his trunk, z the way he faces — and the file puts that origin on the
 * *underside*, at the middle of a board that is 0.095 thick there, which is
 * the number every distance below is measured from. 0.535 down and 0.13
 * out puts the top rail 0.225 under the shoulder joint — a hand under the
 * armpit — with the deck on his ribs and the underside 0.13 outboard of the
 * joint; the arm that lies on that underside is `hold()`'s.
 *
 * `Rider` writes the board's transform into `CARRY` each frame, after `ride`
 * has moved the chest, and `Surfer` — which owns the board's group — reads
 * it, the way `RIDE` already crosses between the two. Before the rider has
 * loaded nothing writes it, and the board sits on the water.
 */
const CARRY_POS = new THREE.Vector3(-0.13, -0.535, 0.0)
/** How far the bottom rail swings out from vertical, radians. See `CARRY_ROT`. */
const CARRY_LEAN = 0.17
const CARRY = { pos: new THREE.Vector3(), rot: new THREE.Quaternion() }
/** The nose swung out, radians — the number chosen against the camera. */
const CARRY_YAW = -0.44
const CARRY_ROT = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.20, CARRY_YAW, -Math.PI / 2 - CARRY_LEAN, 'YXZ'))
/** The carrying arm's share of the stride swings it about the board's
 *  *normal*, so the hand slides along the face instead of into it: this is
 *  the z bend that goes with each unit of x bend to make that axis. */
const HOLD_ALONG = -Math.tan(CARRY_YAW)
const CARRY_REST = new THREE.Quaternion()
/** A hand's width of arc through the middle of the lift, so the board leaves
 *  the sand rather than sliding up out of it. */
const LIFT_ARC = 0.12

function Surfer({ visible }: { visible: boolean }) {
  // The board alone, so it can be picked up. The rider is its sibling and not
  // its child: he is what walks away with it, and a man parented to the thing
  // he is carrying is a man who cannot put it down.
  const board = useRef<THREE.Group>(null!)
  const leash = useRef<THREE.Group>(null!)
  const kit = useMemo(() => {
    // The leash: a cord from the plug at the tail to a cuff on the back
    // ankle. Both ends are constants — the plug is on the board and the ankle
    // is fixed to the deck (`tools/surfer.py` puts the sole there and the rig
    // never moves it) — so the curve is built once, with the slack lying on
    // the deck between them the way a leash lies when nobody is pulling it.
    // The cuff goes round the back shin a hand above the ankle, at the shin's
    // own angle, which in this stance is well out over the rail. The three
    // numbers are the back ankle, the back knee and the deck heights `tools/
    // surfer.py` prints; the back foot is on the tail pad now, so the run is
    // short and the slack rides over the pad's kick rather than lying flat.
    const ankle = new THREE.Vector3(-0.07, 0.189, -0.78)
    const shin = new THREE.Vector3(-0.383, 0.437, -0.684).sub(ankle).normalize()
    const cuffAt = ankle.clone().addScaledVector(shin, 0.045)
    const cuffGeo = new THREE.TorusGeometry(0.050, 0.009, 6, 18)
    cuffGeo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), shin))
    cuffGeo.translate(cuffAt.x, cuffAt.y, cuffAt.z)
    const leashGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.00, 0.125, -0.99),
      new THREE.Vector3(-0.02, 0.160, -0.91),
      new THREE.Vector3(-0.05, 0.150, -0.85),
      cuffAt.clone().add(new THREE.Vector3(0, -0.03, -0.042)),
    ]), 16, 0.006, 5, false)

    // The wake: one strip of water behind the tail, widening and fading aft.
    // It is the surfer's share of the bloom — the other two craft carry running
    // lights and this one carries the only thing a board leaves behind.
    const wakeGeo = new THREE.PlaneGeometry(1, 1, 1, 10)
    wakeGeo.rotateX(-Math.PI / 2)
    wakeGeo.scale(1, 1, WAKE.len)
    wakeGeo.translate(0, 0, -(WAKE.gap + WAKE.len / 2))
    const w = wakeGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < w.count; i++) {
      const t = (-WAKE.gap - w.getZ(i)) / WAKE.len // 0 at the tail, 1 at the end
      w.setX(i, w.getX(i) * (WAKE.near + (WAKE.far - WAKE.near) * t))
    }

    // The board's colours are in its file now, and so is what it is made of:
    // the resin, the pad and the fins that used to be three node materials
    // here are one basecolour, drawn the way the rider is. What is left is
    // the leash — urethane cord — and the cuff, the one neon thing on it.
    const cord = new THREE.MeshStandardNodeMaterial({ color: '#14171d', roughness: 0.35 })
    const cuff = new THREE.MeshStandardNodeMaterial({ color: '#a8ec2b', roughness: 0.7 })

    return { wakeGeo, leashGeo, cuffGeo, cord, cuff }
  }, [])

  // One number a frame, and only while this craft is the one being drawn. The
  // wake is a thing the board does, not a thing it wears: at rest there is
  // nothing behind it, and it is the only cue in open water that says how fast
  // you are actually going now that the plume belongs to the saucer.
  useFrame(() => {
    if (!visible) return
    // The wake goes before the board does, and that ordering is the point: it
    // is water the board left behind, so it has to be gone by the time the
    // board is in the air. It fades over the first sand rather than over the
    // whole change of mode.
    WAKE_SPEED.value += (Math.min(SHIP.vel.length() / SPEED, 1) *
      (1 - THREE.MathUtils.smoothstep(RIDE.land, 0.02, 0.28)) - WAKE_SPEED.value) * 0.12

    // The board goes where `Rider` put it, off his pelvis — see `CARRY_POS`.
    // The leash is drawn only while both its ends are where it was built for
    // — the plug on a board on the water and the cuff on an ankle on its deck.
    board.current.position.copy(CARRY.pos)
    board.current.quaternion.copy(CARRY.rot)
    leash.current.visible = carried(RIDE.land) < 0.02
  })

  return (
    <group visible={visible}>
      {/* Everything the board is, in one group, because all of it is picked
          up together — hull, pads, fins and the leash. */}
      <group ref={board}>
        {/* The board itself. Its own `Suspense`, so that the leash and the
            wake — geometry this file builds — are there the frame the surfer
            is chosen, and the two files arrive when they arrive. */}
        <Suspense fallback={null}>
          <Surfboard />
        </Suspense>

        {/* The leash, and the cuff it ends in. In the board's group because it
            is the board's: when he picks the board up the whole thing goes with
            it, and `useFrame` above hides it for the walk — a leash trailing
            from a carried board to nothing is worse than no leash. */}
        <group ref={leash}>
          <mesh geometry={kit.leashGeo} material={kit.cord} />
          <mesh geometry={kit.cuffGeo} material={kit.cuff} />
        </group>
      </group>

      {/* And the man. Outside the group above, because he is the one who
          carries it. */}
      <Suspense fallback={null}>
        <Rider visible={visible} />
      </Suspense>

      {/* The wake stays on the water, where it belongs: it is the sea's mark
          and not a thing the board wears. */}
      <mesh geometry={kit.wakeGeo} material={FOAM} position-y={0.015} />
    </group>
  )
}

/**
 * The rider, and the only character in this world that comes out of a file —
 * and since the third pass, his board with him. `tools/surfer.py` argues the
 * case; the short version is that every other craft here is a hull — a solid
 * of revolution with things bolted to it, which is what code is good at — and
 * a person is one skin over a skeleton, which is what eleven cylinders and
 * eight spheres could not close a shoulder seam on.
 *
 * One mesh, and — unlike every landmark, which is flattened with its transform
 * baked in — its node hierarchy is kept, because the hierarchy is the skeleton
 * and flattening it would be throwing the rig away. The material is where the
 * two pipelines part: a landmark asks for its material by name prefix and gets
 * TSL, and this asks for nothing — the colour is a basecolour texture in the
 * file, and the file's own UVs say where it goes. It is a wetsuit with a face
 * above it and a board with a graphic on it, and no prefix was going to say
 * either.
 *
 * How the rider is lit: like the rest of the world, and it took three passes
 * to get there. The second rider was drawn — toon steps, a sunward rim, a
 * neoprene glint — because his colour was painted flat into COLOR_0 and the
 * sun is ahead of the ship, so the visitor got his shadow side with no edge
 * of its own. The third rider shipped unlit first, on the reasoning that a
 * generator's basecolour already has its shading in it; and Seb's eye said
 * what the reasoning missed, which is that a black wetsuit with no light on
 * it does not sit in a world that has one. So: `MeshStandardNodeMaterial`
 * with the texture, under the same sun and the same fill as every hull and
 * every island, roughness a little under a hull's because neoprene is wet.
 * The ink outline stays — it is the one thing that kept the shadow side
 * legible on every rider, and it costs the bloom nothing.
 *
 * One material a file, built from the one the loader made: the loader's own
 * `MeshStandardMaterial` is what carries the texture, colour space set, and
 * the swap keeps that and drops the rest. The cast is the narrow one at a
 * library boundary that CLAUDE.md allows — `map` is on every material the
 * loader can produce for a textured primitive and on none of the types.
 */
const lit = (loaded: THREE.Material): THREE.MeshStandardNodeMaterial => {
  const map = (loaded as THREE.Material & { map?: THREE.Texture | null }).map ?? null
  if (import.meta.env.DEV && !map) throw new Error(`${loaded.name}: no basecolour — rebuild it with tools/surfer.py`)
  return new THREE.MeshStandardNodeMaterial({ map, roughness: 0.55, metalness: 0 })
}

/**
 * The outline: the same geometry again, inside out, grown a centimetre along
 * its own normals. Back faces only, so what survives the depth test is the
 * sliver that pokes out past the silhouette of the real mesh — a line that is
 * thick where the surface turns away and absent where it faces you, which is
 * how an inked drawing weights its own outline.
 *
 * A centimetre is chosen against the model and not against the screen: the
 * camera sits at a fixed distance astern and never dollies, so a fixed offset
 * in metres is a near-enough-fixed offset in pixels, and the alternative —
 * scaling the push by view depth — is arithmetic for a problem this world does
 * not have. It is `MeshBasicNodeMaterial` because an outline is not lit, and it
 * declares no emissive, so it costs nothing at the bloom.
 *
 * It skins for free, and that is not luck. `NodeMaterial.setupPosition` runs
 * the skinning node *before* it reads `positionNode`, and the skinning node
 * assigns into `positionLocal` and `normalLocal` themselves — so the two names
 * below are already the deformed position and the deformed normal by the time
 * this expression is built, and the outline follows every bone the rider has.
 */
const OUTLINE = new THREE.MeshBasicNodeMaterial({ color: '#0a0d14', side: THREE.BackSide })
OUTLINE.positionNode = positionLocal.add(normalLocal.mul(0.011))

/* ------------------------------------------------------------ the rider moves
 *
 * Seventeen bones out of `tools/surfer.py`, bent every frame from `RIDE`.
 *
 * The problem this solves is that a man welded to his board reads as a figurine
 * of a surfer. Everything under him already moved — the sea, the bank, the
 * three metres of air off a roller — and he held one crouch through all of it,
 * which is the one thing in the world that could be *more* wrong the better the
 * water got.
 *
 * What it is not: there is no clip and no animation mixer in the file, and the
 * glb carries no animation either. Every angle below is a sum of the numbers
 * in `RIDE`, so what the rider does is a response and not a playback —
 * he leans into a carve because the heading is turning, he folds on a landing
 * because the hull just took an impact, and a wave nobody has ridden before is
 * ridden correctly the first time. It also means the rest pose is the shipped
 * model exactly: with no input, every sum is zero and every bone is where
 * Blender put it, to the vertex.
 *
 * Two halves, and they are not the same mechanism.
 *
 * *The upper body is forward kinematics.* Hips, spine, chest, neck, head and
 * both arms are told how far to rotate about board space's own axes — x across
 * the deck, y up, z out the nose — and their children come along. That is the
 * right model for a limb whose end is in the air: an arm counterweighting a
 * turn does not have a target, it has a swing.
 *
 * *The legs are inverse kinematics,* because a foot is not in the air. It is on
 * the deck, and it stays there: `Ship.tsx` builds the board and
 * `tools/surfer.py` puts the soles against it, so both ankles are constants in
 * board space and the only honest way to move the hips is to solve the knees
 * for them. Two bones and a fixed target is the case with a closed form — one
 * triangle, no iteration, no solver — and what it buys is that every drop of
 * the hips, every lean over the rail and every landing compression comes out as
 * a leg that bends, rather than as a rider sliding through his own board.
 */

const _v = new THREE.Vector3()
const _hip = new THREE.Vector3()
const _to = new THREE.Vector3()
const _pole = new THREE.Vector3()
const _knee = new THREE.Vector3()
const _foot = new THREE.Vector3()
const _aim = new THREE.Vector3()
/** Where a walking knee points, against the outward one a surf crouch has. See
 *  `aim` in `reach`. Straight ahead: the solver re-squares it against the leg's
 *  own line every frame, so it does not have to be perpendicular here. */
const WALK_POLE = new THREE.Vector3(0, 0, 1)
const _dir = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _qt = new THREE.Quaternion()
const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const _qi = new THREE.Quaternion()
const _qs = new THREE.Quaternion()
const _qb2 = new THREE.Quaternion()
const _qf = new THREE.Quaternion()
const _qp = new THREE.Quaternion()
const _qu = new THREE.Quaternion() // the trunk's motion on foot, and its inverse, a frame
const _qun = new THREE.Quaternion()
const _bx = new THREE.Vector3()
const _by = new THREE.Vector3()
const _bz = new THREE.Vector3()
const _qc = new THREE.Quaternion()
const _ZERO = new THREE.Vector3()
const _I = new THREE.Quaternion()
const _mat = new THREE.Matrix4()
const _step = new THREE.Matrix4()
const _AX = new THREE.Vector3(1, 0, 0)
const _AY = new THREE.Vector3(0, 1, 0)
const _AZ = new THREE.Vector3(0, 0, 1)
const _ONE = new THREE.Vector3(1, 1, 1)
const _scale = new THREE.Vector3()

/**
 * A node's rest transform in the *model's* frame — board space, the same frame
 * `tools/surfer.py` is written in.
 *
 * Composed up the chain from local transforms rather than read off
 * `matrixWorld`, and that is the whole point: `matrixWorld` also carries the
 * ship's heading, its bank and the swell it is sitting on, none of which is a
 * fact about the rider. This is the same numbers Blender exported, whatever the
 * hull is doing this frame.
 */
function restOf(o: THREE.Object3D, root: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  out.identity()
  for (let n: THREE.Object3D | null = o; n && n !== root; n = n.parent) {
    out.premultiply(_step.compose(n.position, n.quaternion, n.scale))
  }
  return out
}

/**
 * One bone, plus what it takes to rotate it about a board-space axis.
 *
 * A bone's `quaternion` is relative to its parent, and every angle in `ride()`
 * is written in board space, because "roll toward the inside of the turn" is a
 * sentence about the world and not about a femur. Converting an axis costs one
 * rotation by the parent's rest orientation inverted, and it is done once here
 * rather than three times a frame.
 *
 * The parent's *rest* orientation and not its current one, which is an
 * approximation and a deliberate one: a bone whose parent has already moved
 * turns about an axis a few degrees stale. At these amplitudes that is
 * invisible, and the alternative is a matrix update between every joint.
 */
type Joint = {
  bone: THREE.Bone
  rest: THREE.Quaternion
  ax: THREE.Vector3
  ay: THREE.Vector3
  az: THREE.Vector3
  from: THREE.Quaternion // the parent's rest rotation, board space
  into: THREE.Quaternion // and its inverse: board space -> the parent's frame
}

function jointOf(bone: THREE.Bone, root: THREE.Object3D): Joint {
  const parent = new THREE.Quaternion()
  restOf(bone.parent!, root, _mat).decompose(_v, parent, _scale)
  // Every axis below is rotated and not transformed, and the hips' offset in
  // `ride` is a distance in metres. Both assume the chain above a bone is a
  // rotation, which is what `tools/surfer.py` exports and what glTF's y-up
  // conversion leaves it as. A scale anywhere in it would quietly shrink the
  // whole pose instead of failing.
  console.assert(
    import.meta.env.PROD || Math.abs(_scale.x - 1) + Math.abs(_scale.y - 1) + Math.abs(_scale.z - 1) < 1e-4,
    `surfer.glb: \`${bone.name}\` sits under a scale of ${_scale.toArray()} — the rig assumes none`,
  )
  const from = parent.clone()
  parent.invert()
  return {
    bone,
    rest: bone.quaternion.clone(),
    ax: _AX.clone().applyQuaternion(parent),
    ay: _AY.clone().applyQuaternion(parent),
    az: _AZ.clone().applyQuaternion(parent),
    from,
    into: parent,
  }
}

/** A rotation whose Y is `dir` and whose Z is as much of `front` as is square
 *  to it — the bone convention, and how a limb's twist is decided rather than
 *  left to the shortest rotation. */
function frameQ(dir: THREE.Vector3, front: THREE.Vector3): THREE.Quaternion {
  const y = dir.clone().normalize()
  const z = front.clone().addScaledVector(y, -front.dot(y))
  if (z.lengthSq() < 1e-8) z.crossVectors(y, _AX)
  z.normalize()
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(y, z), y, z))
}

/**
 * A base to bend from other than the rest pose: the rest pose turned by
 * `q`, a rotation given in board space. It is how the walk stands him up —
 * the whole trunk, then the head back to the horizon, then the arms down to
 * his sides — with rotations that are read off the file rather than written
 * down, and `bend` and `fold` lay the frame's own numbers on top.
 *
 * What it means, exactly: the bone's rest orientation is turned by `q` in
 * board space *and then carried by whatever its parent has done since rest*.
 * For the hips, whose parent never moves, that is just `q`. For anything
 * below them it is why the rotations in `rigOf` are solved as "what `q`
 * makes the rest into the wanted thing once the chain above is where the
 * walk puts it", and not as the difference between two world orientations.
 */
function based(j: Joint, q: THREE.Quaternion, out: THREE.Quaternion): THREE.Quaternion {
  return out.copy(j.into).multiply(q).multiply(j.from).multiply(j.rest)
}

/**
 * Rotate a joint about board space's x, y and z, on top of its rest pose.
 *
 * `j.ax` and its siblings are board space's axes in the parent's *rest*
 * frame, and a rotation about them is carried by whatever the parent has
 * done since — which was a fair approximation while the parent only ever
 * moved a few degrees, and stopped being one when the walk started standing
 * the trunk up out of a stance turned 66° to the wave: below the hips, on
 * foot, "about z" had become mostly "about x". `carried` is the trunk's
 * motion since rest, and with it the axes are turned back first, so that
 * what the parent then does to them lands them on board space exactly.
 */
function bend(j: Joint, x: number, y: number, z: number, base: THREE.Quaternion = j.rest,
  carried?: THREE.Quaternion): void {
  let ax = j.ax, ay = j.ay, az = j.az
  if (carried) {
    ax = _bx.copy(_AX).applyQuaternion(carried).applyQuaternion(j.into)
    ay = _by.copy(_AY).applyQuaternion(carried).applyQuaternion(j.into)
    az = _bz.copy(_AZ).applyQuaternion(carried).applyQuaternion(j.into)
  }
  _q.setFromAxisAngle(ax, x)
  _q.multiply(_qt.setFromAxisAngle(ay, y))
  _q.multiply(_qt.setFromAxisAngle(az, z))
  j.bone.quaternion.copy(base).premultiply(_q)
}

/**
 * Fold a joint further the way it is already folded. An elbow has one axis and
 * it is not one of board space's: it is the normal of the plane the arm is bent
 * in, which `rigOf` reads off the rest pose. One number opens and closes the
 * arm, and it stays anatomy rather than becoming a hinge in the wrong plane.
 */
function fold(j: Joint, axis: THREE.Vector3, angle: number, base: THREE.Quaternion = j.rest): void {
  j.bone.quaternion.copy(base).premultiply(_q.setFromAxisAngle(axis, angle))
}

/** An arm: three joints and the plane its elbow and wrist fold in. */
type Arm = {
  upper: Joint
  fore: Joint
  hand: Joint
  elbow: THREE.Vector3 // the fold axis, in the upper arm's frame
  wrist: THREE.Vector3 // the same axis, in the forearm's
  side: number         // +1 for the leading arm, -1 for the trailing one
  hangUp: THREE.Quaternion   // what stands the upper arm down at his side, once the trunk is up
  hangFore: THREE.Quaternion // and the forearm straight below it
}

/**
 * The carrying arm, on foot. Three numbers and a solve — see `hold()`.
 *
 * The board is 0.095 thick and its top rail is a hand under the armpit, so
 * an arm hanging from a shoulder joint that sits *inboard* of the underside
 * cannot lie along it: the upper arm has to go out over the rail and the
 * forearm has to come back in onto the underside, and the bend between them
 * is what the thickness costs. Measured on the standing rig against the
 * board's own mesh, not eyeballed: `HOLD_OUT` abducts the upper arm 28°,
 * which passes the rail's outer corner with the arm's own radius to spare
 * and puts the elbow 0.074 off the underside — its own radius; `HOLD_FOLD`
 * bends the elbow 23°, of which the frontal part brings the wrist in to
 * 0.054 — the forearm pressing — and the rest runs the forearm along the
 * face toward the nose, which is where `HOLD_SWING` points the elbow: the
 * tip swung 42° from the board's tail toward outboard, so one fold does
 * both. The palm is then `hold()`'s: it faces the underside, the fingers
 * run on down it and `HOLD_FLEX` presses the hand flat.
 *
 * The bend was 47° and the wrist 8 cm off the board before this, with the
 * palm facing aft; Seb's ninth look.
 */
const HOLD_OUT = 0.49
const HOLD_FOLD = 0.40
const HOLD_SWING = 0.73
/** The wrist bent toward the board, radians: a forearm is thicker than a
 *  hand, so a hand that continued the forearm's line would hover. */
const HOLD_FLEX = 0.45
/** How much of the pronation the forearm bone takes; the wrist takes the
 *  rest. All of it on one joint is a twisted elbow or a twisted wrist. */
const HOLD_TWIST = 0.5

/**
 * A leg, as the triangle the solver needs. `ankle` is where the sole is in
 * board space and it never changes — that is the constraint the whole thing
 * exists to honour.
 */
type Leg = {
  thigh: THREE.Bone
  shin: THREE.Bone
  foot: THREE.Bone
  at: THREE.Vector3     // the hip joint, inside the hips bone's own frame
  ankle: THREE.Vector3  // the sole, in board space, fixed
  up: number            // thigh length
  low: number           // shin length
  pole: THREE.Vector3   // which way the knee points, in board space
  /**
   * Where this foot swings about when he is walking: the point under its own
   * hip. Read off the model rather than written down, and it is also the place
   * along the board where the leg is asking least — which is what makes a
   * stride possible at all on the short one. The two hips are 12 cm apart along
   * the board, so the feet come out staggered by that much, which is what a
   * walking stance is.
   */
  sweep: number
  d1: THREE.Vector3     // hip -> knee at rest, normalised
  d2: THREE.Vector3     // knee -> ankle at rest, normalised
  q1: THREE.Quaternion  // and the three rest orientations, in board space
  walk: THREE.Quaternion // the foot's rest orientation with its yaw taken out
  q2: THREE.Quaternion
  q3: THREE.Quaternion
}

type Rig = {
  root: THREE.Object3D    // the model's root, the frame `restOf` composes in
  hips: Joint
  hipsHome: THREE.Vector3   // the hips bone's rest position, in its parent's frame
  hipsInto: THREE.Quaternion // board space -> that frame, for the offset below
  hipsFrom: THREE.Matrix4   // the hips bone's parent, in board space. Constant.
  hipsTurn: THREE.Quaternion // and that parent's rotation alone
  stand: THREE.Quaternion   // from the hips bone's rest orientation to upright, facing forward
  carryAt: THREE.Vector3    // the carried board's centre, in the chest bone's own frame
  carryRot: THREE.Quaternion // and its orientation there — see `CARRY_POS`
  gaze: THREE.Quaternion    // half of the turn that levels the head once the trunk is upright
  spine: Joint
  chest: Joint
  neck: Joint
  head: Joint
  arms: Arm[]
  legs: Leg[]
}

function rigOf(scene: THREE.Object3D): Rig {
  const bone = (name: string) => {
    const b = scene.getObjectByName(name) as THREE.Bone | undefined
    if (!b) throw new Error(`surfer.glb: no bone \`${name}\` — rebuild it with tools/surfer.py`)
    return b
  }
  const at = (name: string) => new THREE.Vector3().setFromMatrixPosition(restOf(bone(name), scene, _mat))
  const spin = (name: string) => {
    const q = new THREE.Quaternion()
    restOf(bone(name), scene, _mat).decompose(_v, q, _scale)
    return q
  }

  const hips = jointOf(bone('hips'), scene)
  const hipsRest = spin('hips')
  const stand = (() => {
    // The trunk line and the facing, both in the hips bone's own frame; the
    // rotation that puts that frame's Y up and its Z forward is the stand.
    const into = hipsRest.clone().invert()
    const up = at('neck').sub(at('hips')).normalize().applyQuaternion(into)
    const front = _AZ.clone().addScaledVector(up, -up.z).normalize()
    const frame = new THREE.Matrix4().makeBasis(_v.crossVectors(up, front).clone(), up, front)
    return new THREE.Quaternion().setFromRotationMatrix(frame).invert().multiply(into)
  })()
  const standInv = stand.clone().invert()
  const hipsFrom = restOf(hips.bone.parent!, scene, new THREE.Matrix4())
  const hipsTurn = new THREE.Quaternion()
  hipsFrom.decompose(_v, hipsTurn, _scale)

  const arm = (tag: string, side: number): Arm => {
    const upper = jointOf(bone(`${tag}_upper`), scene)
    const fore = jointOf(bone(`${tag}_fore`), scene)
    const hand = jointOf(bone(`${tag}_hand`), scene)
    // The plane the arm is already bent in. A nearly straight arm makes a short
    // cross product but never a zero one — the rider's are both bent — and the
    // fallback is there because a rig is a file and files change.
    const a = new THREE.Vector3().subVectors(at(`${tag}_fore`), at(`${tag}_upper`)).normalize()
    const b = new THREE.Vector3().subVectors(at(`${tag}_hand`), at(`${tag}_fore`)).normalize()
    const axis = new THREE.Vector3().crossVectors(a, b)
    if (axis.lengthSq() < 1e-8) axis.crossVectors(b, _AY)
    axis.normalize()
    // Down to his side for the walk. The stance's arms are a surfer's — one
    // down the line, one aft over the tail — and once the trunk is stood up
    // and turned to face the way he walks they are a man in a T. So, in the
    // frame the trunk will be in: the upper arm to straight down, and the
    // forearm to straight below it; `ride()` then folds the elbow and swings
    // the arm as it always did, from hanging.
    //
    // As frames and not as directions, because a direction leaves the twist
    // of the arm to the shortest rotation, and the twist is the elbow's
    // hinge. The leading arm's elbow is sent to point straight back, where it
    // pointed in the A-pose the skin was weighted in, so it folds forward and
    // the palm faces his thigh as it did there. The trailing arm's is sent
    // to point down the board's *tail*, swung `HOLD_SWING` toward outboard:
    // that arm goes out over the board under it and folds *in* onto the
    // board's underside, and a fold about a tip that lies in the board's
    // plane runs along the face while one about a tip that points outboard
    // comes in onto it, so the swing between the two sets how much of the
    // fold is each. It was tried as a twist in `ride()`, on top of the
    // abduction, and `bend` applies its z before its y, so the abducted
    // elbow swung forward instead. The hinge is set here, once, and the
    // abduction and the fold in `ride()` then do what they say. The tail
    // rather than straight back because the board is yawed a quarter
    // radian, and a forearm sent straight forward runs into a face that is
    // swinging in to meet it.
    const tip = at(`${tag}_fore`).sub(at(`${tag}_upper`))
    const reach = at(`${tag}_hand`).sub(at(`${tag}_upper`)).normalize()
    tip.addScaledVector(reach, -tip.dot(reach))
    if (tip.lengthSq() < 1e-6) tip.crossVectors(axis, a)
    const down = _AY.clone().negate().applyQuaternion(standInv)
    const back = _AZ.clone().negate().applyQuaternion(standInv)
    const outboard = _AX.clone().multiplyScalar(side).applyQuaternion(standInv) // +x is his left
    const tail = _AZ.clone().negate().applyQuaternion(CARRY_ROT).applyQuaternion(standInv)
    const hinge = side > 0 ? back
      : tail.multiplyScalar(Math.cos(HOLD_SWING)).addScaledVector(outboard, Math.sin(HOLD_SWING)).normalize()
    const hangUp = frameQ(down, hinge).multiply(frameQ(a, tip).invert())
    const undo = hangUp.clone().invert()
    const hangFore = frameQ(down.clone().applyQuaternion(undo), hinge.clone().applyQuaternion(undo))
      .multiply(frameQ(b, tip).invert())
    return {
      upper, fore, hand, side,
      elbow: axis.clone().applyQuaternion(spin(`${tag}_upper`).invert()),
      wrist: axis.clone().applyQuaternion(spin(`${tag}_fore`).invert()),
      hangUp, hangFore,
    }
  }

  const leg = (tag: string): Leg => {
    const hip = at(`${tag}_thigh`)
    const knee = at(`${tag}_shin`)
    const ankle = at(`${tag}_foot`)
    const span = new THREE.Vector3().subVectors(ankle, hip).normalize()
    const pole = new THREE.Vector3().subVectors(knee, hip)
    pole.addScaledVector(span, -pole.dot(span)).normalize()
    return {
      thigh: bone(`${tag}_thigh`), shin: bone(`${tag}_shin`), foot: bone(`${tag}_foot`),
      at: bone(`${tag}_thigh`).position.clone(),
      ankle, pole, sweep: hip.z,
      up: hip.distanceTo(knee),
      low: knee.distanceTo(ankle),
      d1: new THREE.Vector3().subVectors(knee, hip).normalize(),
      d2: new THREE.Vector3().subVectors(ankle, knee).normalize(),
      q1: spin(`${tag}_thigh`), q2: spin(`${tag}_shin`), q3: spin(`${tag}_foot`),
      // The foot bone runs along the foot, and since the third stance both
      // feet are turned to the toe side on the board. A stride wants them
      // pointing where he is going, so this is the same sole flat on the same
      // ground, yawed back to straight — the pitch and the roll are kept.
      walk: (() => {
        const q = spin(`${tag}_foot`)
        const along = _AY.clone().applyQuaternion(q)
        return new THREE.Quaternion().setFromAxisAngle(_AY, -Math.atan2(along.x, along.z)).multiply(q)
      })(),
    }
  }

  const rig: Rig = {
    root: scene,
    hips,
    hipsHome: hips.bone.position.clone(),
    hipsInto: hipsTurn.clone().invert(),
    // How the trunk is set into the crouch, read off the file so the walk can
    // take exactly that back out. Every bone `tools/surfer.py` exports runs
    // along its local Y with its local Z the way it faces — the hips' Z is
    // the way the trunk faces, the head's Z is the gaze — so "standing up,
    // facing the way he walks" is the identity rotation for the hips, and
    // the whole of the stance's turn to the wave, its fold and its lean is
    // one quaternion, not three angles — and "upright" is the *trunk*
    // vertical, pelvis to the base of the neck, not the hips bone alone: the
    // stance folds at the waist, and a pelvis stood up to the identity under
    // a chest that leans is a man walking stooped, while a pelvis tucked
    // under a vertical trunk is a man standing.
    stand,
    // The carry, expressed in the chest bone's frame once and for all: the
    // trailing shoulder's rest position in that frame, plus `CARRY_POS` and
    // `CARRY_ROT` turned back out of the frame he stands up into. `stand`
    // is the trunk's motion on foot, so the chest's frame on foot is about
    // `stand` times its rest — the spine's own small bends aside.
    carryAt: (() => {
      const chest = restOf(bone('chest'), scene, new THREE.Matrix4())
      const o = CARRY_POS.clone().applyQuaternion(standInv)
      return at('armB_upper').add(o).applyMatrix4(chest.invert())
    })(),
    carryRot: spin('chest').invert().multiply(standInv).multiply(CARRY_ROT),
    // And the head, which is turned down the line relative to that trunk:
    // once the trunk is upright it is looking that far off to the side. Half
    // of the turn back, to lay on the neck and again on the head — see
    // `based` for the order of the two factors.
    gaze: new THREE.Quaternion().slerp(
      standInv.clone().multiply(spin('head').invert()), 0.5),
    hipsFrom, hipsTurn,
    spine: jointOf(bone('spine'), scene),
    chest: jointOf(bone('chest'), scene),
    neck: jointOf(bone('neck'), scene),
    head: jointOf(bone('head'), scene),
    arms: [arm('armF', 1), arm('armB', -1)],
    legs: [leg('legF'), leg('legB')],
  }

  /**
   * The one claim the whole rig rests on, checked against the file it was just
   * read from: solve the legs with the hips exactly where Blender left them and
   * every bone must come back to the rest rotation it already has.
   *
   * It is the closed form's own identity — the triangle that produced `pole`
   * has to be the triangle `reach` reconstructs from it — so a failure here is
   * a real one: a leg chain renamed, a bone that stopped being connected to its
   * parent, a scale in the export. All three would otherwise show up as a rider
   * whose legs are subtly, permanently in the wrong place, which is exactly the
   * kind of wrong nobody spots in a screenshot.
   */
  if (import.meta.env.DEV) {
    for (const l of rig.legs) {
      const was = [l.thigh, l.shin, l.foot].map((b) => b.quaternion.clone())
      reach(l, restOf(l.thigh.parent!, scene, new THREE.Matrix4()), spin('hips'))
      const off = Math.max(...[l.thigh, l.shin, l.foot]
        .map((b, i) => b.quaternion.angleTo(was[i])))
      console.assert(off < 1e-3, `surfer.glb: the ${l.thigh.name} chain solves ` +
        `${(off * 180 / Math.PI).toFixed(2)}deg off its own rest pose`)
      ;[l.thigh, l.shin, l.foot].forEach((b, i) => b.quaternion.copy(was[i]))
    }
    /**
     * And the second claim, which is the walk's: every foot the solver is ever
     * handed on land has to be somewhere the leg can actually reach.
     *
     * It is a real check and not a formality. Both legs are the same length now
     * (`tools/surfer.py` has that story), but `RUN_STRIDE`, `RUN_DUTY`,
     * `RUN_LIFT`, the bob and `TERRAIN_DOWN` are still sized against a
     * measurement of *this* file: re-sculpt the pose, move a knee, change a
     * bone, and the number that was 95% moves with it. Past `reach`'s own clamp
     * the leg simply goes straight and the foot stops where it is told to stop,
     * which on screen is a man skating — a thing that reads as a bug in the
     * walk rather than as a limit of the rig, and so is exactly the kind of
     * wrong nobody diagnoses.
     *
     * It sweeps both gaits, each with its own stride, duty, lift, bob and
     * stand, and the heel's lift at the ends — the hips wherever the vault
     * has them at that moment rather than at some worst case picked by hand,
     * because with a duty under a half the reach and the bob no longer peak
     * together, and assuming they do is how the first version of this got
     * 114%.
     *
     * The threshold leaves 1.5% for what this sweep does not model: the pelvis
     * turning with the stride and the sway under it, which together move a hip
     * joint by about a centimetre — 1.3% of these legs. It was 3% on the
     * second rider and `STAND` was raised into it for the third; past the
     * clamp `reach` straightens the leg and holds the foot, so the cost of
     * a miss is a foot that slides a centimetre, not a fold.
     */
    // Both gaits, since the heel: it is no longer obvious which is the harder
    // one, and the two are one expression with the gait's numbers in it.
    const gaits = [
      { name: 'walk', duty: WALK_DUTY, stride: WALK_STRIDE, lift: WALK_LIFT, bob: WALK_BOB, stand: STAND },
      { name: 'run', duty: RUN_DUTY, stride: RUN_STRIDE, lift: RUN_LIFT, bob: RUN_BOB, stand: STAND - RUN_SINK },
    ]
    for (const l of rig.legs) {
      const hip = new THREE.Vector3().setFromMatrixPosition(restOf(l.thigh, scene, _mat))
      for (const g of gaits) {
        let worst = 0
        for (let k = 0; k < 720; k++) {
          const u = k / 720
          const other = (u + 0.5) % 1
          const swung = u < g.duty ? 0 : (u - g.duty) / (1 - g.duty)
          const t = (u / g.duty) * 2 - 1
          const vault = (v: number) => (v < g.duty ? Math.sin((Math.PI * v) / g.duty) : 0)
          const heel = u < g.duty
            ? (t < 0 ? HEEL_ON : HEEL_OFF) * t * t
            : HEEL_OFF * (1 - swung) * (1 - swung) + HEEL_ON * swung * swung
          worst = Math.max(worst, _v.set(
            l.ankle.x,
            l.ankle.y + heel + (u < g.duty ? 0 : Math.sin(Math.PI * swung) * g.lift),
            u < g.duty
              ? l.sweep + g.stride - 2 * g.stride * (u / g.duty)
              : l.sweep - g.stride + 2 * g.stride * (swung * swung * (3 - 2 * swung)),
          ).distanceTo(_hip.copy(hip).setY(hip.y + g.stand +
            g.bob * (1.5 * Math.max(vault(u), vault(other)) - 0.5))) / (l.up + l.low))
        }
        console.assert(worst < 0.985,
          `surfer.glb: the ${l.thigh.name} chain reaches ${(worst * 100).toFixed(1)}% of its ` +
          `own length at a ${g.name} — the stride is longer than the leg, and the foot will slide. ` +
          'Shorten the stride, deepen the bob, lower STAND, or raise the duty.')
      }
    }
  }
  return rig
}

/**
 * Two bones to a fixed foot, in closed form.
 *
 * The hip has moved and the ankle has not, so the knee is wherever it has to be
 * to make the two lengths meet — one intersection of two spheres, which is a
 * circle, and `pole` picks the point on it. Taking the rest knee's own offset
 * as the pole is what makes this exact at rest: with the hips home the triangle
 * solves back to the pose Blender sculpted, to the last decimal, so the rider
 * standing still is the model and not an approximation of it.
 *
 * The reach is clamped short of straight. A leg at full extension has no plane
 * left to bend in and the knee snaps to wherever the pole happens to point,
 * which is the classic pop; a millimetre of slack costs nothing and there is no
 * pop.
 *
 * `ankle` defaults to the sole on the deck, which is the constraint the whole
 * thing exists to honour and the only one it had until the beach: on the board
 * a foot does not move. Walking, it does — and it is still a fixed target, just
 * a different one each frame, so the solver did not change and neither did what
 * it guarantees. The foot is wherever `ride()` puts it and the knees are what
 * pay for it.
 *
 * `aim` is the other half of that, and without it the walk was bow-legged. Both
 * knees in the sculpted stance point *outward* — a surf crouch is a wide
 * stance, and taking the rest knee's own offset as the pole is what makes the
 * riding solve exact. A walking knee points forward. So the pole is swung round
 * with him, and the exactness is kept where it matters: on the board, `aim` is
 * `leg.pole` to the last decimal.
 */
function reach(leg: Leg, from: THREE.Matrix4, turn: THREE.Quaternion,
  ankle: THREE.Vector3 = leg.ankle, aim: THREE.Vector3 = leg.pole,
  foot: THREE.Quaternion = leg.q3): void {
  const hip = _hip.copy(leg.at).applyMatrix4(from)
  const to = _to.subVectors(ankle, hip)
  const span = THREE.MathUtils.clamp(
    to.length(), Math.abs(leg.up - leg.low) + 1e-3, leg.up + leg.low - 1e-3)
  to.normalize()

  const along = (span * span + leg.up * leg.up - leg.low * leg.low) / (2 * span)
  const out = Math.sqrt(Math.max(leg.up * leg.up - along * along, 0))
  const pole = _pole.copy(aim)
  pole.addScaledVector(to, -pole.dot(to))
  if (pole.lengthSq() < 1e-8) pole.set(0, 1, 0).addScaledVector(to, -to.y)
  pole.normalize()
  const knee = _knee.copy(hip).addScaledVector(to, along).addScaledVector(pole, out)

  // Each bone: the rotation that takes its rest direction to its new one, laid
  // on its rest orientation, then expressed in whatever its parent now is.
  _qa.setFromUnitVectors(leg.d1, _dir.subVectors(knee, hip).normalize()).multiply(leg.q1)
  leg.thigh.quaternion.copy(_qa).premultiply(_qi.copy(turn).invert())
  _qb.setFromUnitVectors(leg.d2, _dir.subVectors(ankle, knee).normalize()).multiply(leg.q2)
  leg.shin.quaternion.copy(_qb).premultiply(_qi.copy(_qa).invert())
  // And the foot keeps the board-space orientation it was sculpted with, which
  // is flat on the deck — or the one the walk hands it, which is the same
  // sole pointed where he is going. Everything above it has moved; a sole
  // has not.
  leg.foot.quaternion.copy(foot).premultiply(_qi.copy(_qb).invert())
}

/**
 * The pose, and every number in it is an amplitude rather than an angle: what
 * arrives is `RIDE`, and what leaves is seventeen sums.
 *
 * The shape of it is two ideas, and the first one is the load-bearing one.
 *
 * **The legs work and the torso does not.** A surfer is a suspension unit with
 * a person balanced on top: the board goes where the water sends it, the head
 * stays where the horizon is, and everything between them is spent. The rider
 * is a child of `body`, so the hull's heel to a wave face is applied to him by
 * the scene graph before a single bone moves — the whole man, head included,
 * which is exactly the figurine the rig was supposed to stop being. The `tilt`
 * and `slope` terms below rotate that straight back *out* of him, most of it at
 * the hips and a diminishing share at each joint up the spine, so a rider
 * standing upright over a heeled board is not a pose. It is a subtraction.
 *
 * And it pays for itself twice, because both ankles are nailed to the deck: the
 * pelvis cannot rotate without one hip rising and the other dropping, which is
 * one leg extending and one folding, with no line of code saying so. That is
 * the whole reason the legs are worth a solver.
 *
 * `heave` is the same idea one derivative up — a deck accelerating upward at a
 * standing man makes him shorter — and it is what keeps the knees working in
 * ordinary chop instead of only on a landing.
 *
 * **The second idea is that what is left is graduated.** What the rider
 * *chooses* — leaning into a carve, looking through it — is a stack of
 * counter-rotations: the hips go with the turn, the chest goes less far, the
 * head goes further and rolls back to level the eyes, and the arms go the other
 * way to pay for all of it. Rotate them by the same amount and you get a plank
 * on a turntable. These are about half the first pass's amplitudes: with the
 * legs carrying the sea, a torso that also swings reads as loose rather than as
 * balanced.
 *
 * The idle layer is the last of it and it is smaller than it looks: breath, a
 * weight shift, a drift of the head, the hands riding the air. Four sines at
 * rates that share no common multiple, so a visitor parked on flat water never
 * sees it repeat. Invariant 6 switches all four off — `idle` is the only place
 * `REDUCED` reaches in here, because everything else is a response to something
 * the visitor did and stopping *those* would be a rider who ignores the sea.
 */
const _gy = new THREE.Vector3()
const _gx = new THREE.Vector3()
const _gz = new THREE.Vector3()
const _gn = new THREE.Vector3()
const _gp = new THREE.Vector3()
const _gX = new THREE.Vector3()
const _gY = new THREE.Vector3()
const _gZ = new THREE.Vector3()
const _qg = new THREE.Quaternion()
const _qh = new THREE.Quaternion()
const _qw = new THREE.Quaternion()

/**
 * The carrying hand, laid on the board.
 *
 * `ride()` puts the arm where `HOLD_OUT` and `HOLD_FOLD` say and hands it
 * here; this is the palm. It cannot be an angle in `ride()`, because the
 * palm has to face the *board*, and where the board's underside faces is a
 * fact about the chest and `CARRY_ROT` together, not about the wrist. So it
 * is solved: the underside's normal is read off the chest as it stands this
 * frame, the forearm's line off the forearm, and the hand is set to run on
 * down that line — bent `HOLD_FLEX` toward the board — with its palm square
 * to the normal.
 *
 * The twist that takes is a pronation, and a real one happens along the
 * forearm, between an elbow that does not turn and a wrist that does. There
 * is one forearm bone, so `HOLD_TWIST` of the angle goes on it and the rest
 * lands at the wrist when the hand is set — about 13° each, which neither
 * joint shows.
 *
 * `t` is `RIDE.land`. At 0 nothing here runs and the arm is the stance's, to
 * the bone; through the pickup it blends, so the hand turns to the board as
 * the board comes up to the hand.
 */
function hold(r: Rig, a: Arm, t: number): void {
  if (t <= 0) return
  // The underside's normal, out toward the arm, in the frame the bones are read in.
  restOf(r.chest.bone, r.root, _mat).decompose(_v, _qg, _scale)
  _gn.set(0, -1, 0).applyQuaternion(_qg.multiply(r.carryRot))
  // The forearm's line, and the palm as the fold left it.
  restOf(a.fore.bone, r.root, _mat).decompose(_v, _qf, _scale)
  _gy.copy(_AY).applyQuaternion(_qf)
  restOf(a.hand.bone, r.root, _mat).decompose(_v, _qh, _scale)
  _gx.copy(_AX).applyQuaternion(_qh)
  // The pronation: from where the palm faces to the board, about the forearm.
  _gz.copy(_gn).negate()
  _gz.addScaledVector(_gy, -_gz.dot(_gy)).normalize()
  _gp.copy(_gx).addScaledVector(_gy, -_gx.dot(_gy)).normalize()
  const psi = Math.atan2(_gy.dot(_bx.copy(_gp).cross(_gz)), _gp.dot(_gz))
  a.fore.bone.quaternion.multiply(_qt.setFromAxisAngle(_AY, HOLD_TWIST * psi * t))
  // The hand: along the forearm as it is now, tipped toward the board, palm on it.
  restOf(a.fore.bone, r.root, _mat).decompose(_v, _qf, _scale)
  _gy.copy(_AY).applyQuaternion(_qf)
  _gp.copy(_gn).addScaledVector(_gy, -_gn.dot(_gy)).normalize()
  _gY.copy(_gy).multiplyScalar(Math.cos(HOLD_FLEX)).addScaledVector(_gp, -Math.sin(HOLD_FLEX)).normalize()
  _gX.copy(_gn).negate()
  _gX.addScaledVector(_gY, -_gX.dot(_gY)).normalize()
  _gZ.copy(_gX).cross(_gY)
  _qw.setFromRotationMatrix(_mat.makeBasis(_gX, _gY, _gZ)).premultiply(_qf.invert())
  a.hand.bone.quaternion.slerp(_qw, t)
}

function ride(r: Rig, t: number): void {
  // On foot none of the sea reaches him: the board is under his arm and what is
  // under his feet is sand. `afloat` scales out every term the water drives and
  // `onFoot` scales in the walk, so the pose above is arithmetically the pose
  // that shipped on every frame he is riding.
  //
  // `pick` is the dip through the middle of the change — one sine over the
  // whole ramp, which is why putting the board down needed no code of its own:
  // it is picking it up, backwards. `swing` and `wobble` are the walk cycle's
  // two phases, and everything below reads one or the other.
  const onFoot = RIDE.land
  const afloat = 1 - onFoot
  const pick = Math.sin(Math.PI * onFoot)
  const step = RIDE.step
  const gait = RIDE.gait
  const duty = RIDE.duty
  /** Where a foot is in its own cycle, 0 at footfall. */
  const place = (i: number) => (step / TAU + i * 0.5) % 1
  /** The hip vaulting over that foot: nothing at footfall and at toe-off,
   *  everything over the middle of the step, nothing through flight. */
  const vault = (u: number) => (u < duty ? Math.sin((Math.PI * u) / duty) : 0)
  const swing = Math.cos(step) * onFoot  // +1 with his left foot forward
  const wobble = Math.sin(step) * onFoot // +1 at his left foot's mid-swing
  const s = Math.min(RIDE.speed, 1)
  const c = RIDE.turn
  /** How stopped he is, on foot: 1 standing, 0 at a walk or anything faster.
   *  `RIDE.speed` is against the riding cruise, so a full walk is `WALK_SPEED`
   *  of it. See `STILL`. */
  const stillness = 1 - THREE.MathUtils.clamp(RIDE.speed / WALK_SPEED, 0, 1)
  const still = stillness * onFoot
  // Not scaled by `afloat`, unlike everything else the sea drives: since the
  // hop, being off the ground is something that happens on land too, and
  // `RIDE.air` already knows which one it is measuring.
  const air = RIDE.air
  const slam = RIDE.slam
  // What the sea is doing to the deck, and what the rider is about to undo. On
  // the water only: airborne there is nothing to brace against, and a man
  // holding himself level against a board that is no longer on anything is a
  // man doing arithmetic.
  const grip = (1 - RIDE.air) * afloat
  const tilt = RIDE.tilt * grip
  const slope = RIDE.slope * grip
  const heave = RIDE.heave * grip
  // The craft's own lean gets the opposite treatment and a third of the gain:
  // enough that he is visibly more upright than his board through a carve,
  // nowhere near enough to look like he is not in it.
  const bank = RIDE.bank * grip
  const idle = REDUCED ? 0 : 1
  const breath = Math.sin(t * 1.7) * idle
  const sway = Math.sin(t * 1.19) * idle
  const drift = Math.sin(t * 0.71) * idle
  const flutter = Math.sin(t * 1.43) * idle

  // The hips, and they carry the ride. Two thirds of the wave's heel comes back
  // out here — the joint with the most travel under it and the one a person
  // actually uses — and the rest is spread up the spine below. What is left of
  // `turn` is small on purpose: the lean into a carve is now the only thing
  // this joint does that is a decision rather than a reflex.
  bend(r.hips,
    -0.58 * slope + 0.13 * heave + 0.10 * slam + 0.03 * breath
      // Bending over the board, and then the forward lean of a man moving —
      // which a runner does a good deal more of than a walker. Both are on top
      // of standing up first: the rest pose is a surf crouch with the trunk
      // pitched `lean` into it, and a man walking with his trunk still bent
      // over a board he is carrying under his arm was the crouch Seb saw
      // after `STAND` had already doubled. The whole of it comes out through
      // the pelvis, and the neck and head below put the gaze back where it
      // was, so he stands up and keeps looking at the horizon.
      + 0.55 * pick + (0.10 + 0.26 * gait) * onFoot * s,
    // The pelvis turns with the stride: the hip on the forward leg goes
    // forward, which is a negative rotation about y for his left.
    0.10 * c - 0.10 * swing,
    -0.58 * tilt - 0.18 * bank - 0.04 * wobble,
    // Standing up. The stance is a man folded over his front thigh and turned
    // to the wave; a man walking is neither, and the difference is the hips
    // bone's whole rest orientation, taken back to the identity — upright,
    // facing the way he walks — as far as he is on foot. Under everything
    // above, so that the water's terms bend the crouch and the walk's terms
    // bend the man standing in it.
    based(r.hips, _qu.slerpQuaternions(_I, r.stand, onFoot), _qb2))
  // What every joint below the hips has been carried by — see `bend`.
  _qun.copy(_qu).invert()
  // And the drop, which is everything that asks a person to get low: the deck
  // coming up at him, a landing, the wave's heel (which costs the legs slack
  // before it costs them anything else), a hard carve, then just going fast.
  r.hips.bone.position.copy(r.hipsHome).add(_v.set(
    // And on foot, the weight shifting over the standing leg.
    0.060 * c + 0.012 * sway - 0.025 * wobble,
    -0.075 * heave - 0.100 * slam - 0.050 * Math.abs(tilt) - 0.045 * s * Math.abs(c)
      - 0.020 * s + 0.030 * air + 0.006 * breath
      // Standing up out of the crouch, dipping through the middle of the
      // change to reach the board, and the pelvis vaulting over whichever leg
      // is carrying him — see `STAND`. The 1.5 and the 0.5 put the low point
      // at footfall and the high point over the stance, which is where the
      // reach wants them.
      + (STAND - RUN_SINK * gait) * onFoot + STILL * still - PICK * pick
      // No vault standing: the bob is scaled by however much of `onFoot` is
      // not `still`, which is what frees the reach the extra height spends.
      + (WALK_BOB + (RUN_BOB - WALK_BOB) * gait) * (onFoot - still) *
        (1.5 * Math.max(vault(place(0)), vault(place(1))) - 0.5),
    -0.035 * RIDE.push + 0.010 * drift,
  ).applyQuaternion(r.hipsInto))

  // The rest of the subtraction, thinning as it goes up. By the head it sums to
  // 0.58 + 0.18 + 0.11 + 0.03 + 0.05 = 0.95 of the *water's* heel taken back out
  // — most of it and not all of it. A rider who cancelled the deck exactly would
  // be a gimbal, and one who cancelled more than it would be falling off the
  // high rail; the twentieth left over is the wave still reaching him. Against
  // `bank` the same joints sum to 0.34, which is the other half of the idea: a
  // third of the carve resisted, two thirds ridden.
  // The walk's own share up the spine is the counter-rotation: the shoulders
  // turn against the pelvis, which turned with the stride. Same graduation as
  // everything else here — and it is the difference between a man walking and a
  // man being slid along the ground.
  bend(r.spine,
    -0.18 * slope + 0.05 * heave + 0.10 * slam + 0.05 * s + 0.030 * breath + 0.28 * pick,
    0.07 * c + 0.06 * swing,
    -0.18 * tilt - 0.07 * bank, r.spine.rest, _qun)
  bend(r.chest,
    -0.11 * slope + 0.06 * slam + 0.040 * breath + 0.16 * pick,
    0.08 * c + 0.10 * swing,
    -0.11 * tilt - 0.05 * bank, r.chest.rest, _qun)
  // With the trunk stood up the head is still turned down the line, which
  // on the sand is a man walking with his head over his shoulder; `gaze` is
  // half of the way back, once here and once below.
  bend(r.neck, -0.03 * slope + 0.03 * slam - 0.04 * air + 0.22 * pick,
    0.06 * c, -0.03 * tilt - 0.02 * bank,
    based(r.neck, _qs.slerpQuaternions(_I, r.gaze, onFoot), _qb2), _qun)
  // The head leads the turn and levels itself against everything else. It is
  // the cue that most reliably reads as alive at this size, and it is the one
  // joint whose share of `turn` was not cut.
  bend(r.head,
    // He looks at the board he is reaching for, and nowhere else does his gaze
    // leave the horizon: that is the whole of what `pick` buys up here.
    -0.05 * slope + 0.05 * slam - 0.10 * air + 0.04 * drift + 0.20 * pick,
    0.22 * c + 0.05 * drift,
    -0.05 * tilt - 0.02 * bank + 0.03 * sway,
    based(r.head, _qs.slerpQuaternions(_I, r.gaze, onFoot), _qb2), _qun)

  for (const a of r.arms) {
    /**
     * One arm goes up in a turn, and which one is the whole point.
     *
     * It is the arm on the *outside* of the circle. Turning to the visitor's
     * right, the rider throws up his left; turning left, his right. That is not
     * a stylistic choice — it is where the counterweight has to be, out over
     * the water the board is turning away from, while the inside hand drops
     * toward the face.
     *
     * `side` is +1 for the leading arm, which is his left, because the model
     * faces its open side. The camera sits astern looking down +z, so the
     * visitor's right is the world's -x, and a turn that way runs the heading
     * negative — which makes `-c * side` positive for exactly the arm that
     * should rise, on both sides, with one expression and no branch. Clamped at
     * zero so the other arm gets nothing from it and is left to the small
     * shared roll below, which drops it.
     *
     * The rest pose is arms-down now (see `tools/surfer.py`), so this is a
     * gesture rather than a nudge to a pose that was already up: 0.55 is about
     * thirty-five degrees of shoulder, with the elbow folding and the arm
     * swinging forward as it goes, which is the difference between throwing an
     * arm up and levitating one.
     *
     * What carries `side` on its own is what is symmetrical — both arms rise in
     * the air, both drop on a landing. The `tilt` and `slope` terms do not:
     * they are the arms' own small share of the levelling, on top of what they
     * have already inherited from the chest. There is deliberately no `bank`
     * term; the chest has already handed them two thirds of the carve, and a
     * fourth counter-rotation on the end of the longest lever in the silhouette
     * was the single thing that read as flailing.
     *
     * The x term is negated against the other two and that is not a typo: one
     * arm reaches forward and the other aft, so a pitch about the deck's own x
     * axis raises one and drops the other, and it has to be the mirror of the
     * roll beside it or airborne comes out as one arm up and one arm down.
     */
    const up = Math.max(0, -c * a.side) * afloat
    /**
     * And on foot the two arms stop being a pair, which is the one place the
     * walk needed a branch.
     *
     * The leading arm is his left, and so is the leading leg — `armF` at x 0.22
     * and `legF` at x 0.05, both on the +x side, because the model faces +z and
     * his right is -x. So it swings *against* its own leg: forward when that
     * foot is back. A positive rotation about the deck's x takes a hanging arm
     * aft, and `swing` is +1 with his left foot forward, so the sign is right
     * with no minus in front of it.
     *
     * The trailing arm is holding a board. It does not swing — 8% of it, which
     * is a body absorbing the stride rather than an arm doing nothing — and it
     * needs no pose of its own for the carry: the rest pose already hangs the
     * elbow at the board's outer rail. See `CARRY_POS`.
     *
     * `pick` is the one thing both arms do together, and it is the move the
     * whole transition exists to show: both hands reach down and forward, to
     * the board on the ground in front of his feet.
     */
    const led = a.side > 0
    bend(a.upper,
      -0.10 * air * a.side + 0.05 * RIDE.push - 0.10 * slope
        // The swing. It used to sit on a bias that brought the leading hand
        // back from 0.40 forward of its shoulder; since the third stance the
        // arm is handed to the walk already hanging (`hangUp`), and the bias
        // went.
        // The free arm's swing is the one thing here that grows most with the
        // gait: a walker's hand travels a hand's breadth and a runner's goes
        // from hip to chest. The other arm is holding a board and keeps a tenth
        // of it, which is a body absorbing the stride rather than an arm doing
        // nothing.
        // A hand's breadth at a walk: it was twice this and read as
        // marching. The trailing arm is holding a board and keeps a tenth.
        + (led ? (0.25 + 0.30 * gait) * swing
               : -(0.05 + 0.04 * gait) * swing) - 0.65 * pick,
      0.05 * c * a.side - 0.10 * up * a.side,
      -0.10 * c - 0.08 * tilt
        + a.side * (0.55 * up + 0.20 * air - 0.10 * slam + 0.05 * flutter)
        // And out: the trailing arm away from his side, over the board that
        // is under it. The leading arm hangs where `hangUp` left it, at his
        // side. Positive about z is toward +x, his left, so the trailing
        // arm's is negative.
        // The hold, first half: the trailing upper arm out over the top
        // rail, `HOLD_OUT` — just far enough that the elbow sits on the
        // underside with its own radius to spare. The fold below is the
        // second half and `hold()` the third.
        + onFoot * (led ? -0.04 : -HOLD_OUT)
        // And the carrying arm's swing, turned along the face: see `HOLD_ALONG`.
        - (led ? 0 : HOLD_ALONG * (0.05 + 0.04 * gait) * swing),
      // From hanging, not from the stance: see `hangUp` in `rigOf`.
      based(a.upper, _qs.slerpQuaternions(_I, a.hangUp, onFoot), _qb2), _qun)
    fold(a.fore, a.elbow,
      0.30 * up + 0.06 * Math.abs(c) + 0.20 * slam + 0.16 * air + 0.03 * flutter
        // And a runner's elbow is bent where a walker's hangs. It is the
        // clearest single cue that this is a run, from directly behind, which
        // is the only angle this world ever has on him.
        + 0.45 * pick + onFoot * (led ? 0.30 + 0.14 * Math.abs(swing) + 0.55 * gait
                                      // Second half: the trailing forearm folds
                                      // in onto the underside and along it
                                      // toward the nose (`HOLD_SWING`), to a
                                      // wrist that presses on it a little
                                      // above the bottom rail. No gait term:
                                      // a runner's free elbow bends, and his
                                      // carrying one is holding a board.
                                      : HOLD_FOLD),
      based(a.fore, _qs.slerpQuaternions(_I, a.hangFore, onFoot), _qb2))
    fold(a.hand, a.wrist, 0.10 * up + 0.14 * slam + 0.20 * pick)
    if (!led) hold(r, a, onFoot)
  }

  // And the legs answer wherever the hips ended up. `hipsFrom` is constant —
  // the chain above the hips bone never moves — so this is the one matrix the
  // frame composes, and both legs read it.
  _mat.multiplyMatrices(r.hipsFrom,
    _step.compose(r.hips.bone.position, r.hips.bone.quaternion, _ONE))
  _qt.copy(r.hipsTurn).multiply(r.hips.bone.quaternion)
  for (let i = 0; i < r.legs.length; i++) {
    const l = r.legs[i]
    let target = l.ankle
    let aim = l.pole
    let pitch = 0
    if (onFoot > 0) {
      /**
       * The walk, and it is the same mechanism the riding legs already were: a
       * fixed ankle and a solver. The only thing that changed is that the fixed
       * point moves — the sole is still exactly where it is told, and every
       * consequence of putting it there still comes out as a knee.
       *
       * Three terms and none of them is a curve anybody drew. The stride is a
       * cosine, half a cycle out of phase between the two feet, about the point
       * under that foot's own hip (`sweep`). The lift is the half of the cycle
       * where the foot is travelling forward, scaled down with the stride so a
       * creep does not high-step. And the slope is the hillside `Ship` read,
       * which is what puts the uphill foot higher instead of both feet in the
       * ground — clamped hard downhill, because the short leg has nothing left
       * to reach down with.
       *
       * There is no vertical drop here and that is the load-bearing decision:
       * the 16 cm of board that stopped being under him is taken out of the
       * craft's altitude instead. See `FOOT_DROP`.
       *
       * Then all of it is lerped back to the deck stance, which is what makes
       * stepping off the board a movement rather than a swap — and what makes
       * the riding pose bit-for-bit what it was, since at `onFoot` 0 none of
       * this runs at all.
       */
      const u = place(i)
      const a = RIDE.stride
      // Stance, then swing. The stance is *linear* and that is the whole of
      // why nothing slides: the foot crosses 2a of board space in `duty` of a
      // cycle, and the cycle was set above to make that exactly the distance
      // the body covers in the same time. The swing is a smoothstep back to
      // the front with the knee coming up, and it is the only half of this
      // that is a curve somebody drew.
      const swung = u < duty ? 0 : (u - duty) / (1 - duty)
      const z = u < duty
        ? l.sweep + a - 2 * a * (u / duty)
        : l.sweep - a + 2 * a * (swung * swung * (3 - 2 * swung))
      // The roll of the foot — see `HEEL_ON`. `t` runs -1 at the strike to +1
      // at toe-off through the stance; the swing carries the toe-off heel
      // out and the strike heel in, so the ankle's height is continuous
      // round the cycle. Not standing: a stopped man's soles are flat.
      const t = (u / duty) * 2 - 1
      const heel = (1 - stillness) * (u < duty
        ? (t < 0 ? HEEL_ON : HEEL_OFF) * t * t
        : HEEL_OFF * (1 - swung) * (1 - swung) + HEEL_ON * swung * swung)
      pitch = (1 - stillness) * HEEL_PITCH * (u < duty ? (t < 0 ? -0.5 : 1) * t * t : 0)
      target = _foot.set(
        // A little wider standing than striding — see `SPREAD`.
        l.ankle.x + Math.sign(l.ankle.x) * SPREAD * stillness,
        l.ankle.y + heel +
          (u < duty ? 0 : Math.sin(Math.PI * swung) *
            (WALK_LIFT + (RUN_LIFT - WALK_LIFT) * gait)) +
          // Both feet come up in a jump. Nothing else has to happen for it to
          // read: the hips are already rising with `air` above, so this is the
          // difference between a man jumping and a man being lifted.
          0.14 * air +
          THREE.MathUtils.clamp(RIDE.rise * z + RIDE.cant * l.ankle.x,
            TERRAIN_DOWN, TERRAIN_UP),
        z,
      ).lerp(l.ankle, afloat)
      aim = _aim.copy(l.pole).lerp(WALK_POLE, onFoot)
    }
    // The walking foot, and its pitch through the step: toes down leaving
    // the ground, up meeting it, about board space's x — nothing standing.
    _qf.slerpQuaternions(l.q3, l.walk, onFoot)
    if (pitch !== 0) _qf.premultiply(_qp.setFromAxisAngle(_AX, pitch * onFoot))
    reach(l, _mat, _qt, target, aim, _qf)
  }
}

function Rider({ visible }: { visible: boolean }) {
  const { scene } = useGLTF(surferUrl)
  const rig = useMemo(() => {
    const mesh = scene.getObjectByProperty('isSkinnedMesh', true) as THREE.SkinnedMesh | undefined
    if (!mesh) throw new Error('surfer.glb: not skinned — rebuild it with tools/surfer.py')
    mesh.material = lit(mesh.material as THREE.Material)
    // The outline is the same geometry and the *same skeleton*, not a copy of
    // either: one set of bone matrices, computed once, read by both draws. It
    // is added beside the rider rather than under it so the two share a parent
    // and therefore a bind matrix, and `renderOrder` keeps the intent the two
    // JSX meshes used to carry — the outline first, the rider over it.
    if (!scene.getObjectByName('outline')) {
      const edge = new THREE.SkinnedMesh(mesh.geometry, OUTLINE)
      edge.name = 'outline'
      edge.position.copy(mesh.position)
      edge.quaternion.copy(mesh.quaternion)
      edge.scale.copy(mesh.scale)
      edge.bind(mesh.skeleton, mesh.bindMatrix)
      edge.renderOrder = -1
      // A bounding sphere measured in the rest pose is a sphere a posed rider
      // can leave, and a culled rider is a rider who vanishes at the edge of
      // the frame. He is one small object that is always in shot; the cull is
      // not worth the bug.
      edge.frustumCulled = mesh.frustumCulled = false
      mesh.parent!.add(edge)
    }
    return rigOf(scene)
  }, [scene])

  useFrame((state) => {
    if (!visible) return
    ride(rig, state.clock.elapsedTime)
    // And the board comes up with him. It lags the crouch deliberately — the
    // dip in `ride()` is him reaching for it, and a board that started rising
    // with his hips would be one he never touched. One eased number for the
    // whole of it, so the reverse is the same movement backwards: he sets it
    // down, steps on, and rides away. Where it goes is `carryAt` in the
    // chest's own frame, read off the bone *after* `ride` has moved it, so
    // it carries every bob and sway and turn of the walk — with the arm.
    const t = carried(RIDE.land)
    restOf(rig.chest.bone, scene, _mat).decompose(_hip, _qc, _scale)
    _v.copy(rig.carryAt).applyMatrix4(_mat)
    CARRY.pos.lerpVectors(_ZERO, _v, t)
    CARRY.pos.y += LIFT_ARC * Math.sin(Math.PI * t)
    CARRY.rot.slerpQuaternions(CARRY_REST, _qc.multiply(rig.carryRot), t)
  })

  return <primitive object={scene} />
}

/**
 * The board, out of its file, drawn the way the rider is: the texture lit
 * and the same ink outline round it, one mesh grown a centimetre along its
 * normals and drawn inside out. Nothing moves on it, so no skeleton and no
 * `useFrame` — `Surfer` moves the group it sits in.
 */
function Surfboard() {
  const { scene } = useGLTF(surfboardUrl)
  const board = useMemo(() => {
    const mesh = scene.getObjectByProperty('isMesh', true) as THREE.Mesh | undefined
    if (!mesh) throw new Error('surfboard.glb: no mesh — rebuild it with tools/surfer.py')
    mesh.material = lit(mesh.material as THREE.Material)
    if (!scene.getObjectByName('outline')) {
      const edge = new THREE.Mesh(mesh.geometry, OUTLINE)
      edge.name = 'outline'
      edge.position.copy(mesh.position)
      edge.quaternion.copy(mesh.quaternion)
      edge.scale.copy(mesh.scale)
      edge.renderOrder = -1
      mesh.parent!.add(edge)
    }
    return scene
  }, [scene])
  return <primitive object={board} />
}

/**
 * Narrow the forward sections to a stem and the after ones a little, in place.
 * An ellipsoid's plan view is an ellipse, which is a rowing boat; this is what
 * makes it a bow. Applied to the hull and to the deck, which start as the same
 * circle, so both rims come out the same shape.
 */
function pinch(g: THREE.BufferGeometry) {
  const p = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) {
    const t = p.getZ(i) / HULL.len // -1 at the transom, +1 at the stem
    p.setX(i, p.getX(i) * (1 - (t > 0 ? 0.72 : 0.18) * t * t))
  }
  g.computeVertexNormals()
}
