import * as THREE from 'three/webgpu'
import { Canvas, extend } from '@react-three/fiber'
import { Ship } from './Ship'
import { Scenery } from './Scenery'
import { Islands } from './Islands'
import { Isle } from './Isle'
import { Landmarks } from './Landmarks'
import { Particles } from './Particles'
import { Sound } from './Sound'
import { Debug } from './Debug'
import { Post } from './Post'
import type { Sea, ShipModel } from './WorldGate'

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
  active, model, sea, slug, debug, sound, onNear, onBackend,
}: {
  active: boolean
  /** Which hull the menu is showing. Passed through rather than read from the
   *  world's context: this tree is inside the canvas and reads the URL and its
   *  props, nothing else. */
  model: ShipModel
  /** Which of the two seas the menu is on. Handed to `Scenery`, which owns the
   *  waves and ramps the rollers in and out of the shader and the hull. */
  sea: Sea
  slug: string | null
  debug: boolean
  /** The HUD's toggle. Off by default, and the click that turns it on is also
   *  the gesture the browser's autoplay policy is waiting for. */
  sound: boolean
  onNear: (slug: string | null) => void
  onBackend: (backend: string) => void
}) {
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      // `Ship` snaps it into place on its first frame, astern of the spawn
      // and before anything is drawn, so the first frame is the settled frame
      // — it used to start off to one side and lerp in, which read as a
      // camera move over the cut from the landing page. This is only the
      // offset it will have; see `CAM_OFFSET` and `spawn` in `Ship.tsx`.
      camera={{ position: [0, 2.4, 7.2], fov: 45 }}
      gl={(props) => {
        const r = new THREE.WebGPURenderer(props as never)
        return r.init().then(() => {
          onBackend((r.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2')
          return r
        })
      }}
    >
      {/* Seen for one frame before the dome draws, and through it if it ever fails.
          One colour standing in for a whole frame, so it is the middle of the
          palette rather than either end of it — see `.stage` in `index.css`. */}
      <color attach="background" args={['#106e80']} />
      <Scenery sea={sea} />
      <Islands />
      {/* The isle carries no project, so nothing here is passed to it and
          nothing is read back: it is ground, trees and a coastline. */}
      <Isle />
      <Ship enabled={active} model={model} slug={slug} onNear={onNear} />
      {/* Reads the ship's position, so it is mounted after it. */}
      <Particles />
      <Landmarks near={slug} />
      {/* Reads the ship too, and rides this frame loop rather than one of its own. */}
      <Sound on={sound && active} />
      <Post />
      {debug && <Debug />}
    </Canvas>
  )
}
