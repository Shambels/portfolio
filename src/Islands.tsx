import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { mix, mx_fractal_noise_float, positionWorld, smoothstep, vec3 } from 'three/tsl'
import { ISLAND_SPREAD, LANDMARKS } from './world'
import { PROFILE, rim, seedOf } from './plateau'

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

// The profile and the rim are `plateau.ts`'s since the surfer started riding
// up the beach: the mesh here and the floor under his board have to be one
// island, and node has to be able to load the floor. `PROFILE` is half an
// island from the axis outward, flat to 0.52 with an underwater skirt that
// stops the silhouette ending in a cut edge when you fly past at a low angle.
const SEGMENTS = 48

const ROCK = vec3(0.09, 0.12, 0.14)
const WET = vec3(0.36, 0.31, 0.24)
const SAND = vec3(0.84, 0.74, 0.55)
const GRASS = vec3(0.27, 0.34, 0.2)

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
    const geometries = LANDMARKS.map((l) => island(l.radius * ISLAND_SPREAD, seedOf(l.slug)))

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
