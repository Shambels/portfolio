import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { color, positionLocal, sin, time } from 'three/tsl'
import { useFrame } from '@react-three/fiber'
import { useInput } from './useInput'
import { landmarkAt, landmarkOf } from './world'

// Saucer silhouette, rotated around Y. [radius, height]
const PROFILE: [number, number][] = [
  [0, 0.10], [0.34, 0.09], [0.68, 0.05], [1, 0],
  [0.68, -0.07], [0.34, -0.10], [0, -0.09],
]
const LIGHTS = 8

const SPEED = 7.5     // units/sec
const BOOST = 2.4     // Shift multiplier. Same ACCEL ramps in and out of it.
const ACCEL = 7       // higher = twitchier
const LIFT = 2.6      // ceiling above hover altitude, held with Space
const CLIMB = 4       // altitude catch-up rate, both directions
const TURN = 9        // yaw catch-up rate
const BANK = 0.5      // max lean, radians. Flip the sign to lean the other way.
const PITCH = 0.32    // max nose-up on acceleration, radians

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
const CAM_OFFSET = new THREE.Vector3(0, 2.4, 7.2) // flat enough to keep the horizon in frame
const CAM_LAG = 3.5

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
// Invariant 6: the ship still responds, it just does not oscillate about it.
const DAMPING = REDUCED ? 2 * Math.sqrt(SPRING) : DAMP

const _target = new THREE.Vector3()
const _cam = new THREE.Vector3()
const _accel = new THREE.Vector3()

export function Ship({ hover = 0.9, enabled, slug, onNear }: {
  hover?: number
  /** False on every route with no world showing. The ship stops reading keys. */
  enabled: boolean
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
  const input = useInput(enabled)

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
    yaw.current = Math.atan2(l.pos[0] - l.waypoint[0], l.pos[2] - l.waypoint[2])
    rig.current.rotation.y = yaw.current
    vel.current.set(0, 0, 0)
    lastVel.current.set(0, 0, 0)
    spring.current.set(0, 0, 0)
    springVel.current.set(0, 0, 0)
    near.current = l.slug
    snap.current = true
  }, [slug])

  const { hull, dome, glass, lamp, beam } = useMemo(() => {
    const hull = new THREE.MeshStandardNodeMaterial({ color: '#cfd8e3', roughness: 0.35, metalness: 0.6 })

    const glass = new THREE.MeshPhysicalNodeMaterial({
      color: '#8ee8ff', roughness: 0.05, transmission: 0.9, thickness: 0.3, transparent: true,
    })

    const lamp = new THREE.MeshStandardNodeMaterial({ color: '#0b1220' })
    lamp.emissiveNode = color('#7dd3fc').mul(sin(time.mul(4)).mul(0.4).add(0.6))

    const beam = new THREE.MeshBasicNodeMaterial({
      color: new THREE.Color('#7dd3fc'), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    // Brightest where it leaves the hull, fading toward the ground.
    beam.opacityNode = positionLocal.y.add(0.35).div(0.7).clamp().mul(0.3)

    const dome = new THREE.SphereGeometry(0.36, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    return { hull, dome, glass, lamp, beam }
  }, [])

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

    if (vel.current.lengthSq() > 0.0025) {
      const want = Math.atan2(vel.current.x, vel.current.z)
      const diff = Math.atan2(Math.sin(want - yaw.current), Math.cos(want - yaw.current))
      yaw.current += diff * (1 - Math.exp(-TURN * dt))
    }
    g.rotation.y = yaw.current

    // Space climbs to hover + LIFT and holds there; releasing sinks back. One
    // damped value, so there is no jump arc to time and nothing to land on.
    const wasAlt = alt.current
    alt.current += ((input.ascend ? hover + LIFT : hover) - alt.current) * (1 - Math.exp(-CLIMB * dt))
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

    body.current.rotation.z = THREE.MathUtils.clamp(-lateral * LEAN, -BANK, BANK)
    body.current.rotation.x = THREE.MathUtils.clamp(-along * LEAN, -PITCH, PITCH)
    body.current.position.y =
      alt.current - spring.current.y * SQUASH +
      (REDUCED ? 0 : Math.sin(state.clock.elapsedTime * 1.2) * 0.05)

    // Proximity is an event, not a state: it pushes a URL and the URL is what
    // everything else reads back (invariant 3 — nothing here remounts a tree).
    const hit = landmarkAt(g.position.x, g.position.z)?.slug ?? null
    if (hit !== near.current) { near.current = hit; onNear(hit) }

    _cam.copy(g.position).add(CAM_OFFSET)
    _cam.y += alt.current - hover // rise with the ship, or the ceiling puts it out of frame
    if (snap.current) { snap.current = false; state.camera.position.copy(_cam) }
    else state.camera.position.lerp(_cam, 1 - Math.exp(-CAM_LAG * dt))
    state.camera.lookAt(g.position.x, g.position.y + alt.current, g.position.z)
  })

  return (
    <group ref={rig}>
      <group ref={body} position-y={hover}>
        <mesh material={hull}>
          <latheGeometry args={[PROFILE.map(([x, y]) => new THREE.Vector2(x, y)), 48]} />
        </mesh>

        <mesh material={glass} geometry={dome} position-y={0.08} />

        {Array.from({ length: LIGHTS }, (_, i) => {
          const a = (i / LIGHTS) * Math.PI * 2
          return (
            <mesh key={i} material={lamp} position={[Math.cos(a) * 0.78, -0.045, Math.sin(a) * 0.78]}>
              <sphereGeometry args={[0.07, 12, 8]} />
            </mesh>
          )
        })}

        {/* Apex sits under the hull, base spreads toward the ground. No rotation needed. */}
        <mesh material={beam} position-y={-0.45}>
          <coneGeometry args={[0.6, 0.7, 32, 1, true]} />
        </mesh>
      </group>
    </group>
  )
}
