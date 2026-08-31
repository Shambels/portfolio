import { useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { color, positionLocal, sin, time } from 'three/tsl'
import { useFrame } from '@react-three/fiber'
import { useInput } from './useInput'
import { landmarkAt } from './world'

// Saucer silhouette, rotated around Y. [radius, height]
const PROFILE: [number, number][] = [
  [0, 0.10], [0.34, 0.09], [0.68, 0.05], [1, 0],
  [0.68, -0.07], [0.34, -0.10], [0, -0.09],
]
const LIGHTS = 8

const SPEED = 4.5     // units/sec
const ACCEL = 6       // higher = twitchier
const TURN = 9        // yaw catch-up rate
const BANK = 0.45     // max lean, radians. Flip the sign to lean the other way.
const CAM_OFFSET = new THREE.Vector3(0, 3.4, 6.5)
const CAM_LAG = 3.5

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const _target = new THREE.Vector3()
const _cam = new THREE.Vector3()

export function Ship({ hover = 0.9, onNear }: { hover?: number; onNear?: (slug: string | null) => void }) {
  const rig = useRef<THREE.Group>(null!)   // position + yaw
  const body = useRef<THREE.Group>(null!)  // bob + roll
  const vel = useRef(new THREE.Vector3())
  const yaw = useRef(0)
  const roll = useRef(0)
  const near = useRef<string | null>(null)
  const input = useInput()

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
    const dt = Math.min(delta, 0.05) // a backgrounded tab returns with a huge delta
    const g = rig.current

    // Movement is world-relative because the camera offset is fixed: rotating the
    // offset with yaw while steering relative to the camera is a spin feedback loop.
    // ponytail: camera-relative steering arrives with `look` in Phase 3.
    _target.set(input.move.x, 0, -input.move.y).multiplyScalar(SPEED)
    vel.current.lerp(_target, 1 - Math.exp(-ACCEL * dt))
    g.position.addScaledVector(vel.current, dt)

    if (vel.current.lengthSq() > 0.0025) {
      const want = Math.atan2(vel.current.x, vel.current.z)
      const diff = Math.atan2(Math.sin(want - yaw.current), Math.cos(want - yaw.current))
      const step = diff * (1 - Math.exp(-TURN * dt))
      yaw.current += step
      roll.current = THREE.MathUtils.lerp(
        roll.current,
        THREE.MathUtils.clamp((-step / dt) * 0.08, -BANK, BANK),
        0.2,
      )
    } else {
      roll.current = THREE.MathUtils.lerp(roll.current, 0, 0.15)
    }
    g.rotation.y = yaw.current

    body.current.rotation.z = roll.current
    body.current.position.y = REDUCED ? hover : hover + Math.sin(state.clock.elapsedTime * 1.2) * 0.05

    const hit = landmarkAt(g.position.x, g.position.z)?.slug ?? null
    if (hit !== near.current) { near.current = hit; onNear?.(hit) }

    _cam.copy(g.position).add(CAM_OFFSET)
    state.camera.position.lerp(_cam, 1 - Math.exp(-CAM_LAG * dt))
    state.camera.lookAt(g.position.x, g.position.y + hover, g.position.z)
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
