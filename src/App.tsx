import { useState } from 'react'
import * as THREE from 'three/webgpu'
import { Canvas, extend } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { Ship } from './Ship'

extend(THREE as never)

export default function App() {
  const [backend, setBackend] = useState('detecting…')
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
        <Ship />
        <Grid args={[30, 30]} cellColor="#12203a" sectionColor="#1e3a5f" fadeDistance={22} infiniteGrid />
        <OrbitControls enablePan={false} target={[0, 0.8, 0]} />
      </Canvas>
      <p className="hud">renderer: {backend}</p>
    </>
  )
}
