import * as THREE from 'three/webgpu'
import { Canvas, extend } from '@react-three/fiber'
import { Ship } from './Ship'
import { Scenery } from './Scenery'
import { Islands } from './Islands'
import { Landmarks } from './Landmarks'
import { Debug } from './Debug'

extend(THREE as never)

/**
 * The world. Mounted once by `WorldGate` from the root layout and never
 * unmounted (invariant 3) — routes with no world showing set `active` false,
 * which stops the frame loop and the input, and that is the whole difference.
 *
 * Everything here is a function of the URL: `slug` says which landmark is open,
 * `onNear` says which one the visitor has flown into. Nothing in this tree
 * holds "which panel is showing" of its own.
 */
export default function Scene({
  active, slug, debug, onNear, onBackend,
}: {
  active: boolean
  slug: string | null
  debug: boolean
  onNear: (slug: string | null) => void
  onBackend: (backend: string) => void
}) {
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [3.5, 2.2, 4], fov: 45 }}
      gl={(props) => {
        const r = new THREE.WebGPURenderer(props as never)
        return r.init().then(() => {
          onBackend((r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2')
          return r
        })
      }}
    >
      {/* Seen for one frame before the dome draws, and through it if it ever fails. */}
      <color attach="background" args={['#2a3f5f']} />
      <Scenery />
      <Islands />
      <Ship enabled={active} slug={slug} onNear={onNear} />
      <Landmarks near={slug} />
      {debug && <Debug />}
    </Canvas>
  )
}
