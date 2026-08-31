import { useState } from 'react'
import * as THREE from 'three/webgpu'
import { Canvas, extend } from '@react-three/fiber'
import { Ship } from './Ship'
import { Scenery } from './Scenery'
import { Islands } from './Islands'
import { Landmarks } from './Landmarks'
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
        {/* Seen for one frame before the dome draws, and through it if it ever fails. */}
        <color attach="background" args={['#2a3f5f']} />
        <Scenery />
        <Islands />
        <Ship onNear={setNear} />
        <Landmarks near={near} />
      </Canvas>
      <p className="hud">
        {LANDMARKS.find((l) => l.slug === near)?.label ?? 'WASD / arrows to fly · space to rise · shift to boost'}
        {' · '}renderer: {backend}
      </p>
    </>
  )
}
