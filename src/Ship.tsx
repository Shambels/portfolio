import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { color, positionLocal, sin, time } from 'three/tsl'
import { useFrame } from '@react-three/fiber'
import { useInput } from './useInput'
import { swell } from './Scenery'
import { landmarkAt, landmarkOf, offshore } from './world'
import type { ShipModel } from './WorldGate'

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
const BUOY = 6        // how fast the hull catches the swell. Lower = more wallow.
// The swell is 12 cm of water at its steepest, so a hull heeling by its true
// slope heels three degrees and reads as dead flat. The water is a flat plane
// wearing wave normals — the sea it is heeling to is painted on — so this is a
// lie told on top of a lie, and the only honest way to judge it is to look.
const WAVE_TILT = 3

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
/** Camera offset from the ship, in world space — the camera does not turn with
 *  yaw. Exported because `Landmarks` measures the visitor's approach from the
 *  ship rather than from the camera, and this is the difference between them. */
export const CAM_OFFSET = new THREE.Vector3(0, 2.4, 7.2) // flat enough to keep the horizon in frame
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
export const SHIP = { pos: new THREE.Vector3(), vel: new THREE.Vector3() }

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Invariant 6: the ship still responds, it just does not oscillate about it.
const DAMPING = REDUCED ? 2 * Math.sqrt(SPRING) : DAMP

const _target = new THREE.Vector3()
const _cam = new THREE.Vector3()
const _accel = new THREE.Vector3()

export function Ship({ hover = 0.9, enabled, model, slug, onNear }: {
  hover?: number
  /** False on every route with no world showing. The ship stops reading keys. */
  enabled: boolean
  /** Which hull the visitor picked in the menu. One flight controller either
   *  way: a boat is the same ship with its altitude pinned to the sea, a
   *  coastline it cannot cross, and a bigger circle to call arrival. */
  model: ShipModel
  /** The case study the URL is showing — the URL is the state, and this is the
   *  ship's copy of it. Null on the home page. */
  slug: string | null
  onNear: (slug: string | null) => void
}) {
  const rig = useRef<THREE.Group>(null!)   // position + yaw
  const body = useRef<THREE.Group>(null!)  // bob + roll
  const vel = useRef(new THREE.Vector3())
  const yaw = useRef(0)
  const near = useRef<string | null>(null)
  const alt = useRef(hover)
  const altVel = useRef(0)
  const lastVel = useRef(new THREE.Vector3()) // for acceleration; velocity is damped, not raw input
  const spring = useRef(new THREE.Vector3())
  const springVel = useRef(new THREE.Vector3())
  const snap = useRef(false) // next frame: place the camera, do not chase it
  const heave = useRef(0)    // the boat's lagged ride on the swell
  const input = useInput(enabled)
  const boat = model === 'boat'

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
    // the panel. `boat` is read here and deliberately not a dependency: this
    // effect answers the URL changing, and changing a setting in the menu is
    // not a reason to pick the ship up and move it.
    if (boat) offshore(rig.current.position)
    // From where it actually ended up, not from the waypoint it was aimed at.
    const p = rig.current.position
    yaw.current = Math.atan2(l.pos[0] - p.x, l.pos[2] - p.z)
    rig.current.rotation.y = yaw.current
    vel.current.set(0, 0, 0)
    lastVel.current.set(0, 0, 0)
    spring.current.set(0, 0, 0)
    springVel.current.set(0, 0, 0)
    heave.current = 0
    near.current = l.slug
    snap.current = true
    // `boat` is read above and is deliberately not a dependency — see the note
    // beside it. Nothing here goes stale: the effect only runs on a URL change,
    // and at that point `boat` is whatever this render says it is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useFrame((state, delta) => {
    // Floored as well as capped: a backgrounded tab returns with a huge delta, and
    // two frames inside one clock tick give delta 0 — which the acceleration
    // divides by, and one NaN frame hides the ship for the rest of the session.
    const dt = THREE.MathUtils.clamp(delta, 1 / 240, 0.05)
    const g = rig.current

    // Movement is world-relative because the camera offset is fixed: rotating the
    // offset with yaw while steering relative to the camera is a spin feedback loop.
    // ponytail: camera-relative steering would need `look`, and nothing has
    // asked for it — the camera is behind the ship, so world-relative reads the
    // same. Revisit if Phase 6's touch controls want a swipe-to-turn.
    _target.set(input.move.x, 0, -input.move.y).multiplyScalar(input.boost ? SPEED * BOOST : SPEED)
    vel.current.lerp(_target, 1 - Math.exp(-ACCEL * dt))
    g.position.addScaledVector(vel.current, dt)
    // A hull cannot climb a beach. Pushed back onto the mooring circle rather
    // than stopped dead, so a boat leaning on a coast keeps whatever part of its
    // motion runs along it and slides round the island instead of sticking.
    if (boat) offshore(g.position)

    if (vel.current.lengthSq() > 0.0025) {
      const want = Math.atan2(vel.current.x, vel.current.z)
      const diff = Math.atan2(Math.sin(want - yaw.current), Math.cos(want - yaw.current))
      yaw.current += diff * (1 - Math.exp(-TURN * dt))
    }
    g.rotation.y = yaw.current

    // Space climbs to hover + LIFT and holds there; releasing sinks back. One
    // damped value, so there is no jump arc to time and nothing to land on.
    // The boat's is pinned to sea level: it floats, so there is nowhere to climb
    // to and nothing for Space to do. `WorldGate`'s hint stops naming the key
    // rather than leaving it in the sentence doing nothing.
    const wasAlt = alt.current
    const wantAlt = boat ? 0 : input.ascend ? hover + LIFT : hover
    alt.current += (wantAlt - alt.current) * (1 - Math.exp(-CLIMB * dt))
    const climbVel = (alt.current - wasAlt) / dt

    // Acceleration this frame, all three axes at once — so a diagonal that also
    // climbs bounces once, in the direction it actually changed.
    _accel.subVectors(vel.current, lastVel.current).divideScalar(dt)
    _accel.y = (climbVel - altVel.current) / dt
    _accel.clampLength(0, JOLT)
    lastVel.current.copy(vel.current)
    altVel.current = climbVel

    springVel.current.addScaledVector(_accel, dt)
      .addScaledVector(spring.current, -SPRING * dt)
      .addScaledVector(springVel.current, -DAMPING * dt)
    spring.current.addScaledVector(springVel.current, dt)

    // Read the spring in the ship's own frame: sideways travel leans it, travel
    // along the heading pitches the nose, vertical travel is suspension give.
    const sy = Math.sin(yaw.current) // `sin` is TSL's, imported above
    const cy = Math.cos(yaw.current)
    const lateral = spring.current.x * cy - spring.current.z * sy
    const along = spring.current.x * sy + spring.current.z * cy

    // The sea, for the hull that is in it. `Scenery` owns the three swells and
    // the shader reads the same ones, so this is the water the visitor can see
    // rather than a second sea that nearly matches. The lag on the height is
    // the whole of the buoyancy; the gradient is read in the boat's own frame,
    // so a swell taken on the bow pitches it and one on the beam rolls it.
    //
    // Both terms are zero for the saucer, which is over the water, not in it.
    let ride = 0
    let roll = 0
    let heel = 0
    if (boat) {
      const s = swell(g.position.x, g.position.z, REDUCED ? 0 : state.clock.elapsedTime)
      heave.current += (s.y - heave.current) * (1 - Math.exp(-BUOY * dt))
      ride = heave.current
      // Flip either sign if the hull leans into the wave rather than over it —
      // this is the pair of numbers a screenshot settles and arithmetic does not.
      roll = (s.dx * cy - s.dz * sy) * WAVE_TILT
      heel = -(s.dx * sy + s.dz * cy) * WAVE_TILT
    }

    body.current.rotation.z = THREE.MathUtils.clamp(-lateral * LEAN, -BANK, BANK) + roll
    body.current.rotation.x = THREE.MathUtils.clamp(-along * LEAN, -PITCH, PITCH) + heel
    body.current.position.y =
      alt.current + ride - spring.current.y * SQUASH +
      // The saucer's idle hover. The boat already has one and it is the sea's.
      (REDUCED || boat ? 0 : Math.sin(state.clock.elapsedTime * 1.2) * 0.05)

    // The rig carries XZ and the body carries altitude, so the hull's world
    // position is one from each. Published here, after both have settled.
    SHIP.pos.set(g.position.x, body.current.position.y, g.position.z)
    SHIP.vel.copy(vel.current)

    // Proximity is an event, not a state: it pushes a URL and the URL is what
    // everything else reads back (invariant 3 — nothing here remounts a tree).
    const hit = landmarkAt(g.position.x, g.position.z, boat)?.slug ?? null
    if (hit !== near.current) { near.current = hit; onNear(hit) }

    _cam.copy(g.position).add(CAM_OFFSET)
    // Rise with the ship, or the ceiling puts it out of frame. The boat's `alt`
    // never leaves zero, and its ride on the swell is deliberately left out of
    // this: a camera that bobs with the sea is a camera nobody wants.
    _cam.y += alt.current - (boat ? 0 : hover)
    if (snap.current) { snap.current = false; state.camera.position.copy(_cam) }
    else state.camera.position.lerp(_cam, 1 - Math.exp(-CAM_LAG * dt))
    state.camera.lookAt(g.position.x, g.position.y + alt.current - AIM_DOWN, g.position.z)
  })

  return (
    <group ref={rig}>
      <group ref={body} position-y={hover}>
        {/* Both hulls stay mounted and one of them is drawn. Toggling
            `visible` costs a culled node; unmounting would hand back a
            question about who disposes geometry the renderer no longer has,
            for a tree that is two meshes deep. */}
        <Saucer visible={!boat} />
        <Boat visible={boat} />
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
