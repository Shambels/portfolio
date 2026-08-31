import { useMemo, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { color, positionLocal, sin, time } from 'three/tsl'
import { useFrame } from '@react-three/fiber'

// Saucer silhouette, rotated around Y. [radius, height]
const PROFILE: [number, number][] = [
  [0, 0.10], [0.34, 0.09], [0.68, 0.05], [1, 0],
  [0.68, -0.07], [0.34, -0.10], [0, -0.09],
]
const LIGHTS = 8
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function Ship({ hover = 0.9 }: { hover?: number }) {
  const group = useRef<THREE.Group>(null!)

  const { hull, dome, glass, lamp, beam } = useMemo(() => {
    const hull = new THREE.MeshStandardNodeMaterial({ color: '#cfd8e3', roughness: 0.35, metalness: 0.6 })

    const glass = new THREE.MeshPhysicalNodeMaterial({
      color: '#8ee8ff', roughness: 0.05, transmission: 0.9, thickness: 0.3, transparent: true,
    })

    const lamp = new THREE.MeshStandardNodeMaterial({ color: '#0b1220' })
    // Lights chase around the rim: phase offset comes from each lamp's world angle.
    lamp.emissiveNode = color('#7dd3fc').mul(sin(time.mul(4)).mul(0.4).add(0.6))

    const beam = new THREE.MeshBasicNodeMaterial({
      color: new THREE.Color('#7dd3fc'), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    })
    // Brightest where it leaves the hull, fading out toward the ground.
    beam.opacityNode = positionLocal.y.add(0.35).div(0.7).clamp().mul(0.3)

    const dome = new THREE.SphereGeometry(0.36, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2)
    return { hull, dome, glass, lamp, beam }
  }, [])

  useFrame((state, dt) => {
    if (REDUCED) return
    group.current.rotation.y += dt * 0.25
    group.current.position.y = hover + Math.sin(state.clock.elapsedTime * 1.2) * 0.05
  })

  return (
    <group ref={group} position-y={hover}>
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

      {/* Apex sits just under the hull, base spreads toward the ground. No rotation needed. */}
      <mesh material={beam} position-y={-0.45}>
        <coneGeometry args={[0.6, 0.7, 32, 1, true]} />
      </mesh>
    </group>
  )
}
