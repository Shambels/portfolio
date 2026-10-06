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
import { Direct, Post } from './Post'
import { PHONE, POST, PROFILE, off } from './device'
import { Profiler } from './Profiler'
import { Resolution } from './Resolution'
import { Ink } from './Ink'
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
      // Capped under the display's own ratio. Every pixel here runs a long
      // shader into two HDR targets and through the bloom and FXAA after them,
      // so a 2x display paid four times what a 1x one does. 1.5 is 44% fewer
      // pixels than 2; what it costs is a little softness, and the palm fronds
      // are where it shows. A 1x screen is untouched. `docs/STATUS.md`,
      // "Frame cost".
      //
      // A phone gets 1.25, because its panel is three times a CSS pixel and a
      // hand's length away: the same ratio that is visible on a laptop at
      // arm's length is not on a 400-point screen, and the GPU under it is a
      // fraction of the one it is being asked to feed. `docs/STATUS.md`, "The
      // phone tier".
      dpr={[1, PHONE ? 1.25 : 1.5]}
      gl={(props) => {
        // No MSAA. r3f asks for `antialias: true` by default, and a
        // WebGPURenderer passes its sample count on to every `pass()` that does
        // not name one — so `Post`'s scene pass was rendering four samples into
        // both of its half-float targets, and then running FXAA over the
        // resolve. Two anti-aliasers, and the one nobody had chosen was the
        // expensive one: four times the colour, emissive and depth storage, at
        // the canvas's full pixel ratio. `Post` says FXAA is what this world
        // uses, and now it is the only one.
        //
        // Except where there is no `Post` (`POST` in `device.ts` — a phone):
        // there the canvas is the only target, and 4× MSAA on a tiled GPU is
        // resolved on the chip, which is the cheapest anti-aliasing a phone has.
        // `trackTimestamp` under `?debug` only: GPU timestamp queries are
        // what `Profiler` reads GPU time from, and they cost a little on
        // every pass. Where the device has none (WebGL2, most phones today)
        // three turns them back off and the readout says so.
        const r = new THREE.WebGPURenderer({ ...props, antialias: !POST && !off('msaa'), trackTimestamp: PROFILE } as never)
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
      {/* The `visible` groups are `?debug&off=…` (`device.ts`): hidden rather
          than unmounted, so what is timed without them is the drawing and
          not a world with less in it. Always true otherwise. */}
      <group visible={!off('islands')}>
        <Islands />
      </group>
      {/* The isle carries no project, so nothing here is passed to it and
          nothing is read back: it is ground, trees and a coastline. */}
      {/* `Ink` outlines what is under it in the anime look (`Ink.tsx`), and
          is a plain group otherwise. */}
      <group visible={!off('isle')}>
        <Ink>
          <Isle />
        </Ink>
      </group>
      <Ink>
        <Ship enabled={active} model={model} slug={slug} onNear={onNear} />
      </Ink>
      {/* Reads the ship's position, so it is mounted after it. The one part
          `off` unmounts: nothing reads the spray back, and most of what it
          costs is its compute pass, which hiding would not stop. */}
      {!off('spray') && <Particles />}
      <group visible={!off('landmarks')}>
        <Ink>
          <Landmarks near={slug} />
        </Ink>
      </group>
      {/* Reads the ship too, and rides this frame loop rather than one of its own. */}
      <Sound on={sound && active} />
      {/* The chain on a computer, a plain render on a phone (`POST`). */}
      {POST ? <Post /> : <Direct />}
      {/* Lowers the pixel ratio when the frame rate falls; holds otherwise. */}
      <Resolution />
      {debug && <Debug />}
      {debug && <Profiler />}
    </Canvas>
  )
}
