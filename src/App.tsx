import { useState } from 'react'
import * as THREE from 'three/webgpu'
import { Canvas, extend } from '@react-three/fiber'
import { Grid } from '@react-three/drei'
import { Ship } from './Ship'
import { LANDMARKS } from './world'

extend(THREE as never)

export default function App() {
  const [backend, setBackend] = useState('detecting…')
  const [near, setNear] = useState<string | null>(null)
  return (
    <>
      <Canvas
        camera={{ position: [3.5, 2.2, 4], fov: 45 }}
        gl={(props) => {
          const r = new THREE.WebGPURenderer(props as never)
          return r.init().then(() => {
            setBackend((r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2')
            return r
          })
        }}
      >
        <color attach="background" args={['#05070d']} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[4, 6, 3]} intensity={2.5} />
        <Ship onNear={setNear} />
        {LANDMARKS.map((l) => (
          <mesh key={l.slug} position={[l.pos[0], l.size[1] / 2, l.pos[2]]}>
            <boxGeometry args={l.size} />
            <meshStandardMaterial color={near === l.slug ? '#7dd3fc' : '#3a4557'} />
          </mesh>
        ))}
        <Grid args={[30, 30]} cellColor="#12203a" sectionColor="#1e3a5f" fadeDistance={22} infiniteGrid />
      </Canvas>
      <p className="hud">
        {LANDMARKS.find((l) => l.slug === near)?.label ?? 'WASD / arrows to fly · space to rise · shift to boost'}
        {' · '}renderer: {backend}
      </p>
    </>
  )
}
