import { useMemo, useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { abs, atan, fract, mix, oneMinus, positionLocal, positionWorld, smoothstep, vec3 } from 'three/tsl'
import { fractal } from './noise'
import { band, toon } from './toon'
import { ISLAND_SPREAD, LANDMARKS, type Landmark } from './world'
import { GROUND, PROFILE, rim, seedOf } from './plateau'
import { BERG_PROFILE, FLOATS, LIFT, pose } from './berg'

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
const GRASS = vec3(0.38, 0.52, 0.2)

// The iceberg's: snow on top, the ice shore, and the ice under the water.
// Read off the berg's own Y and not the world's, because the berg heaves and
// the snow line has to go up and down with it rather than sit on the sea.
// The snow is over white on purpose: the sun is low and behind every landmark,
// so a flat top sits in the half-tone, and at 0.9 it read as lavender felt.
const SNOW = vec3(1.08, 1.1, 1.14)
const ICE_HI = vec3(0.5, 0.86, 0.97)
const ICE_LO = vec3(0.2, 0.68, 0.88)
const ICE_DEEP = vec3(0.08, 0.42, 0.62)

function island(radius: number, seed: number, profile: [number, number][] = PROFILE) {
  const g = new THREE.LatheGeometry(
    // Handed over bottom-up. A lathe winds its faces by the order of its
    // points, and top-down — the way `PROFILE` is written, axis first — winds
    // every face into the island: the top faced the sea floor and was culled,
    // so all three project islands drew only the insides of their own skirts,
    // and their landmarks stood on the water. Found when the iceberg's snow
    // would not show; `docs/STATUS.md`, "PolarSense is an iceberg".
    [...profile].reverse().map(([r, y]) => new THREE.Vector2(r * radius, y)),
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
  const { geometries, ground, berg } = useMemo(() => {
    const geometries = LANDMARKS.map((l) => island(l.radius * ISLAND_SPREAD, seedOf(l.slug)))

    // Sea floor, wet rock, beach, then the plateau, as edges and cel-lit
    // (`toon.ts`). The sand band straddles y = 0 so the waterline is where
    // the colour changes, and a short noise moves each edge by a hand's
    // width so it reads as brushwork rather than a contour.
    const y = positionWorld.y
    const brush = fractal(positionWorld.mul(0.9), 1)
    const ground = new THREE.MeshBasicNodeMaterial()
    let col = mix(ROCK, WET, band(-0.6, y, 0.2))
    col = mix(col, SAND, band(-0.02, y.add(brush.mul(0.05)), 0.02))
    col = mix(col, GRASS, band(0.3, y.add(brush.mul(0.08)), 0.02))
    ground.colorNode = toon(col)

    // The berg. Snow to the roll-off, then the shore, which is the thing the
    // visitor has to be able to tell apart at a glance — it is where the board
    // stops gripping — so it is ice-blue and glassy against the snow's white,
    // with long streaks around it like a floe's surface polished by the sea,
    // and a sky-lit band along its top edge. Then the ice going down into the
    // water, darker and bluer with depth: the bulk of an iceberg is under the
    // line, and this is the top of it showing through.
    const ly = positionLocal.y
    const lb = fractal(positionLocal.mul(0.9), 1)
    const water = -(GROUND + LIFT)
    const theta = atan(positionLocal.z, positionLocal.x)
    const r = positionLocal.xz.length()
    const streak = oneMinus(smoothstep(0.0, 0.08, abs(fract(r.mul(1.7).add(theta.mul(0.6).sin().mul(0.4))).sub(0.5))))
    let ice = mix(ICE_LO, ICE_HI, smoothstep(water, -0.05, ly))
    ice = mix(ice, ICE_HI.add(0.08), streak.mul(0.35))
    ice = mix(ICE_DEEP, ice, band(water - 0.2, ly, 0.08))
    const berg = new THREE.MeshBasicNodeMaterial()
    berg.colorNode = toon(mix(ice, SNOW, band(-0.035, ly.add(lb.mul(0.025)), 0.008)))
    const bi = LANDMARKS.findIndex((l) => l.landmark === FLOATS)
    if (bi >= 0) {
      const l = LANDMARKS[bi]!
      geometries[bi] = island(l.radius * ISLAND_SPREAD, seedOf(l.slug), BERG_PROFILE)
    }
    return { geometries, ground, berg }
  }, [])

  return (
    <>
      {LANDMARKS.map((l, i) =>
        l.landmark === FLOATS ? (
          <Afloat key={l.slug} l={l}>
            <mesh geometry={geometries[i]} material={berg} />
          </Afloat>
        ) : (
          <mesh key={l.slug} geometry={geometries[i]} material={ground} position={l.pos} />
        ),
      )}
    </>
  )
}

/**
 * What floats rides the berg's pose (`src/berg.ts`): lifted `LIFT` above a
 * plateau, heaved and tilted. The island under the mountain and the mountain
 * on it are each wrapped in one of these, so they move as one body — and the
 * floor the board rides is `bergLift`, the same three numbers, so the board
 * stays on what is drawn. Small-angle: the tilt is a rotation by the slope.
 */
export function Afloat({ l, children }: { l: Landmark; children: ReactNode }) {
  const g = useRef<THREE.Group>(null)
  useFrame(() => {
    const o = g.current
    if (!o) return
    const p = pose()
    o.position.set(l.pos[0], l.pos[1] + LIFT + p.h, l.pos[2])
    // A slope of sx along x is a turn about z by sx; along z, about x by -sz.
    o.rotation.set(-p.sz, 0, p.sx)
  })
  return (
    <group ref={g} position={[l.pos[0], l.pos[1] + LIFT, l.pos[2]]}>
      {children}
    </group>
  )
}
