import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { LANDMARKS } from './world'

/**
 * `?debug`. Draws the contracts the rest of the scene is written against, so
 * that a landmark which has grown out of its box, or a waypoint that has fallen
 * outside its own radius, is visible rather than inferred:
 *
 *   cyan ring    the proximity radius — where the panel opens
 *   amber box    the blockout box from the frontmatter, which `Landmarks`
 *                asserts the built geometry fits inside
 *   pink dot     the waypoint a deep link spawns at
 *
 * Frame stats and the renderer backend are DOM, not geometry — they are in the
 * HUD, next to everything else made of text.
 */
const SEGMENTS = 64

/** Wireframe as real line geometry rather than a material flag: the flag's
 *  support varies by backend, and a debug view that is only right on one of the
 *  two renderers is worse than none. */
const WIRE = new THREE.WireframeGeometry(new THREE.BoxGeometry(1, 1, 1))

export function Debug() {
  const { ring, line, mark } = useMemo(
    () => ({
      ring: new THREE.MeshBasicNodeMaterial({
        color: '#7dd3fc', transparent: true, opacity: 0.5,
        side: THREE.DoubleSide, depthWrite: false,
      }),
      line: new THREE.LineBasicNodeMaterial({ color: '#e9a851', transparent: true, opacity: 0.55 }),
      mark: new THREE.MeshBasicNodeMaterial({ color: '#f472b6' }),
    }),
    [],
  )

  return (
    <>
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
            rotation-y={Math.atan2(-l.pos[0], -l.pos[2])}
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
