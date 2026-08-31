import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { mix, mx_fractal_noise_float, positionWorld, smoothstep, vec3 } from 'three/tsl'
import { LANDMARKS } from './world'

/**
 * The ground under each landmark. One `LatheGeometry` per island, revolved from
 * a shared profile and pinched by a per-island rim function so no two
 * coastlines match. Generated like the rest of the world: no heightmap, no
 * model, zero asset bytes.
 *
 * The plateau is deliberately low — see `GROUND` in `src/world.ts`. `Ship`
 * hovers at a fixed altitude over flat ground, so an island tall enough to look
 * dramatic is an island the saucer flies through. Height is a flight-controller
 * change, not a geometry one.
 *
 * Colour bands read world Y, not local: the shoreline then lands on the water
 * plane by construction, whatever height an island is placed at.
 */

// Half an island, from the axis outward. [fraction of radius, height relative
// to the plateau]. Flat out to 0.52 so blockout boxes sit square on it; the
// last two points are the underwater skirt, which the ocean hides but which
// stops the silhouette ending in a cut edge when you fly past at a low angle.
const PROFILE: [number, number][] = [
  [0, 0], [0.52, 0], [0.68, -0.12], [0.8, -0.3], [0.88, -0.55], [0.96, -1.6], [1, -3.2],
]
const SEGMENTS = 48
const SPREAD = 1.9 // island radius as a multiple of the proximity radius

const ROCK = vec3(0.09, 0.12, 0.14)
const WET = vec3(0.36, 0.31, 0.24)
const SAND = vec3(0.84, 0.74, 0.55)
const GRASS = vec3(0.27, 0.34, 0.2)

/** Coastline radius at an angle, as a multiple of the nominal one. Three
 *  detuned harmonics: enough that the eye reads a shape rather than a disc,
 *  few enough that the plateau stays convex and a box never overhangs it. */
function rim(theta: number, seed: number) {
  return (
    1 +
    0.11 * Math.sin(3 * theta + seed) +
    0.06 * Math.sin(5 * theta + seed * 2.3) -
    0.05 * Math.sin(7 * theta + seed * 0.7)
  )
}

function island(radius: number, seed: number) {
  const g = new THREE.LatheGeometry(
    PROFILE.map(([r, y]) => new THREE.Vector2(r * radius, y)),
    SEGMENTS,
  )
  const p = g.attributes.position
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i)
    const z = p.getZ(i)
    const f = rim(Math.atan2(z, x), seed)
    p.setXYZ(i, x * f, p.getY(i), z * f)
  }
  g.computeVertexNormals()
  return g
}

export function Islands() {
  const { geometries, ground } = useMemo(() => {
    const geometries = LANDMARKS.map((l) =>
      island(l.radius * SPREAD, [...l.slug].reduce((h, c) => h + c.charCodeAt(0), 0)),
    )

    const ground = new THREE.MeshStandardNodeMaterial({ roughness: 0.95 })
    const y = positionWorld.y
    // Sea floor, wet rock, beach, then the plateau. The sand band straddles
    // y = 0 so the waterline is where the colour changes, not where a texture
    // seam would be.
    let col = mix(ROCK, WET, smoothstep(-1.2, -0.12, y))
    col = mix(col, SAND, smoothstep(-0.1, 0.08, y))
    col = mix(col, GRASS, smoothstep(0.2, 0.42, y))
    // Without this the plateau is one flat disc of colour and reads as plastic.
    ground.colorNode = col.mul(mx_fractal_noise_float(positionWorld.mul(0.35), 2).mul(0.12).add(1))
    return { geometries, ground }
  }, [])

  return (
    <>
      {LANDMARKS.map((l, i) => (
        <mesh key={l.slug} geometry={geometries[i]} material={ground} position={l.pos} />
      ))}
    </>
  )
}
