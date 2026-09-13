import { useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { GROUND, LANDMARKS, landmarkYaw } from './world'
import { PROP_SETS, type PropSet } from './plateau'

/**
 * `?debug`. Draws the contracts the rest of the scene is written against, so
 * that a landmark which has grown out of its box, or a waypoint that has fallen
 * outside its own radius, is visible rather than inferred:
 *
 *   cyan ring    the proximity radius — where the panel opens
 *   amber box    the blockout box from the frontmatter, which `Landmarks`
 *                asserts the built geometry fits inside
 *   pink dot     the waypoint a deep link spawns at
 *   green rings  the discs the props are to the surfboard, where the model
 *                put them; green loop, the mine's wall — both read off the
 *                loaded model (`plateau.ts`), so they appear when it does
 *
 * Frame stats and the renderer backend are DOM, not geometry — they are in the
 * HUD, next to everything else made of text.
 */
const SEGMENTS = 64
/** Where a prop's rest height is measured from. */
const GROUND_Y = GROUND

/** Wireframe as real line geometry rather than a material flag: the flag's
 *  support varies by backend, and a debug view that is only right on one of the
 *  two renderers is worse than none. */
const WIRE = new THREE.WireframeGeometry(new THREE.BoxGeometry(1, 1, 1))

/** A polygon as a `Line` closed by hand: the WebGPU renderer has no
 *  `LineLoop`, and `<line>` is an SVG element as far as JSX is concerned. */
function loop(w: { x: number; z: number }[], material: THREE.Material): THREE.Line {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute([...w, w[0]!].flatMap((v) => [v.x, 0.1, v.z]), 3))
  return new THREE.Line(g, material)
}

export function Debug() {
  const { ring, line, mark, hit } = useMemo(
    () => ({
      ring: new THREE.MeshBasicNodeMaterial({
        color: '#7dd3fc', transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, depthWrite: false,
      }),
      line: new THREE.LineBasicNodeMaterial({ color: '#e9a851', transparent: true, opacity: 0.55 }),
      mark: new THREE.MeshBasicNodeMaterial({ color: '#f472b6' }),
      hit: new THREE.LineBasicNodeMaterial({ color: '#4ade80', transparent: true, opacity: 0.7 }),
    }),
    [],
  )
  // The props and the wall arrive with the models, one landmark at a time:
  // polled rather than subscribed, because a debug view is not worth an event.
  const [sets, setSets] = useState<PropSet[]>([])
  useFrame(() => { if (PROP_SETS.size !== sets.length) setSets([...PROP_SETS.values()]) })

  return (
    <>
      {sets.map((s) => (
        <group key={s.slug} position={[s.cx, GROUND_Y + 0.05, s.cz]} rotation-y={s.rot}>
          {s.props.map((p) => (
            <mesh key={p.id} material={hit} position={[p.px, p.rest - GROUND_Y, p.pz]} rotation-x={-Math.PI / 2}>
              <ringGeometry args={[p.r - 0.02, p.r, 24]} />
            </mesh>
          ))}
          {s.walls.map((w, i) => <primitive key={i} object={loop(w, hit)} />)}
        </group>
      ))}
      {LANDMARKS.map((l) => (
        <group key={l.slug}>
          <mesh material={ring} position={[l.pos[0], l.pos[1] + 0.06, l.pos[2]]} rotation-x={-Math.PI / 2}>
            <ringGeometry args={[l.radius - 0.09, l.radius, SEGMENTS]} />
          </mesh>
          {/* Turned exactly as `Landmarks` turns its group, or the box lies. */}
          <lineSegments
            geometry={WIRE}
            material={line}
            position={[l.pos[0], l.pos[1] + l.size[1] / 2, l.pos[2]]}
            rotation-y={landmarkYaw(l)}
            scale={l.size}
          />
          <mesh material={mark} position={[l.waypoint[0], l.waypoint[1] + 0.9, l.waypoint[2]]}>
            <sphereGeometry args={[0.16, 12, 8]} />
          </mesh>
        </group>
      ))}
    </>
  )
}
