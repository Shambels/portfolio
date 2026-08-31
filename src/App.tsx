import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three/webgpu'
import { color, mix, normalLocal, positionLocal, sin, time } from 'three/tsl'
import { Canvas, extend, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'

extend(THREE as never)

function Blob() {
  const ref = useRef<THREE.Mesh>(null!)
  const material = useMemo(() => {
    const wave = sin(positionLocal.y.mul(6).add(time.mul(1.5))).mul(0.08)
    const m = new THREE.MeshStandardNodeMaterial()
    m.positionNode = positionLocal.add(normalLocal.mul(wave))
    m.colorNode = mix(color('#12203a'), color('#7dd3fc'), wave.mul(6).add(0.5))
    m.roughness = 0.25
    return m
  }, [])
  useFrame((_, dt) => { ref.current.rotation.y += dt * 0.15 })
  return (
    <mesh ref={ref} material={material}>
      <icosahedronGeometry args={[1, 48]} />
    </mesh>
  )
}

export default function App() {
  const [backend, setBackend] = useState('detecting…')
  return (
    <>
      <Canvas
        camera={{ position: [0, 0, 3.2], fov: 45 }}
        gl={(props) => {
          const r = new THREE.WebGPURenderer(props as never)
          return r.init().then(() => {
            setBackend((r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2')
            return r
          })
        }}
      >
        <color attach="background" args={['#05070d']} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 4, 5]} intensity={2.5} />
        <Blob />
        <OrbitControls enablePan={false} />
      </Canvas>
      <p className="hud">renderer: {backend}</p>
    </>
  )
}
