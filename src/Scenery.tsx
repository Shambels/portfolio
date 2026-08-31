import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import {
  cameraPosition, clamp, cos, dot, float, length, max, mix, mx_fractal_noise_float,
  normalize, oneMinus, positionLocal, positionWorld, pow, reflect, smoothstep, time, vec2, vec3,
} from 'three/tsl'

/**
 * Sky, sun, ocean and clouds. Golden hour, committed — see BUILD-PLAN, "Open
 * questions". All of it is generated: no textures, no models, zero asset bytes.
 *
 * Not `World.tsx`: macOS cannot tell that from `world.ts`, and the import
 * resolves to the landmark data instead. Blank screen, no useful error.
 *
 * One `sky()` builds the graph for the dome, for what the water reflects and for
 * the haze the water fades into, so the horizon matches itself by construction
 * rather than by three hand-tuned colours agreeing.
 */

// Low (15 deg) and off to port: high enough to catch the tops of things, low
// enough that its path across the water runs back toward the camera.
const SUN = new THREE.Vector3(-0.52, 0.26, -0.81).normalize()

const ZENITH = vec3(0.05, 0.13, 0.32)
const HAZE_COOL = vec3(0.25, 0.35, 0.48)
const HAZE_WARM = vec3(1.0, 0.72, 0.42)
const SUN_TINT = vec3(1.0, 0.85, 0.62)
const CLOUD_LIT = vec3(1.0, 0.86, 0.72)
const CLOUD_DARK = vec3(0.36, 0.34, 0.44)
const DEEP = vec3(0.012, 0.055, 0.085)
const SHALLOW = vec3(0.03, 0.16, 0.19)

// Invariant 6: nothing drifts, ripples or sparkles when motion is not wanted.
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const T = time.mul(REDUCED ? 0 : 1)

type Vec3 = ReturnType<typeof vec3>
const sunDir = vec3(SUN.x, SUN.y, SUN.z)

/** Stylised cumulus, drawn on the sky itself — projected to a plane, so no geometry. */
function clouds(dir: Vec3) {
  const p = dir.xz.div(max(dir.y, 0.055)).mul(0.055)
  const n = mx_fractal_noise_float(vec3(p.add(vec2(T.mul(0.004), T.mul(0.002))), T.mul(0.01)), 3)
  const cover = smoothstep(0.22, 0.6, n)
  // Thin out overhead and at the horizon: cumulus live in a band, and a hard
  // edge where the projection blows up would read as a seam.
  const band = smoothstep(0.004, 0.055, dir.y).mul(oneMinus(smoothstep(0.45, 0.95, dir.y)).mul(0.75).add(0.25))
  return { cover: cover.mul(band), shade: smoothstep(0.0, 0.55, n) }
}

/**
 * Colour of the sky in a direction. `lit: false` skips the clouds and the sun
 * disc — the cheap version, used for the water's horizon haze. `disc` dims the
 * sun itself: at full strength, reflected off a thousand wave normals, it turns
 * the sea into a white smear.
 */
function sky(dir: Vec3, { lit = true, disc = 1 } = {}): Vec3 {
  const up = clamp(dir.y, 0, 1)
  const toSun = clamp(dot(dir, sunDir), 0, 1)

  const haze = mix(HAZE_COOL, HAZE_WARM, pow(toSun, 3))
  let col = mix(haze, ZENITH, pow(up, 0.4))
  col = col.add(SUN_TINT.mul(pow(toSun, 9).mul(0.42))) // the glow, always — it is most of the look

  if (!lit) return col

  const c = clouds(dir)
  col = mix(col, mix(CLOUD_DARK, CLOUD_LIT, c.shade.mul(pow(toSun, 0.5).mul(0.6).add(0.4))), c.cover)
  return col.add(SUN_TINT.mul(smoothstep(0.99955, 0.99992, toSun).mul(1.9 * disc)))
}

/**
 * Wave normal at a world XZ. Three crossing swells plus a noise ripple, all in
 * the fragment stage — the surface stays geometrically flat. A displaced mesh
 * costs vertices across 900 units to buy a silhouette the horizon hides anyway.
 */
const SWELL: [number, number, number, number, number][] = [
  // dirX, dirZ, frequency, amplitude, speed
  [0.86, 0.51, 0.55, 0.06, 1.1],
  [-0.42, 0.91, 0.9, 0.03, 1.5],
  [0.98, -0.19, 1.7, 0.012, 2.3],
]
function waveNormal(p: ReturnType<typeof vec2>) {
  let dx = float(0)
  let dz = float(0)
  for (const [dirX, dirZ, freq, amp, speed] of SWELL) {
    const phase = p.x.mul(dirX * freq).add(p.y.mul(dirZ * freq)).add(T.mul(speed))
    const slope = cos(phase).mul(amp * freq)
    dx = dx.add(slope.mul(dirX))
    dz = dz.add(slope.mul(dirZ))
  }
  const ripple = mx_fractal_noise_float(vec3(p.mul(0.6), T.mul(0.25)), 2).mul(0.05)
  return normalize(vec3(dx.add(ripple).negate(), 1, dz.sub(ripple).negate()))
}

export function Scenery() {
  const { dome, water } = useMaterials()
  return (
    <>
      {/* Sun. Warm and low. */}
      <directionalLight position={[SUN.x * 80, SUN.y * 80, SUN.z * 80]} color="#ffcb92" intensity={3.2} />
      {/* Fill, not a hemisphere light: hemisphere lights contribute nothing
          through the node pipeline, which is what left the landmarks black. */}
      <ambientLight color="#8fa9c9" intensity={2.8} />

      <mesh material={dome}>
        <sphereGeometry args={[520, 32, 24]} />
      </mesh>

      <mesh material={water} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[900, 900]} />
      </mesh>
    </>
  )
}

function useMaterials() {
  return useMemo(() => {
    const dome = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false })
    dome.colorNode = sky(normalize(positionLocal))

    const water = new THREE.MeshBasicNodeMaterial()
    const view = normalize(positionWorld.sub(cameraPosition))
    const n = waveNormal(positionWorld.xz)
    const bounce = reflect(view, n)

    // Grazing angles mirror the sky, steep ones show the water's own colour.
    const fresnel = pow(oneMinus(clamp(dot(n, view.negate()), 0, 1)), 4.5).mul(0.92).add(0.06)
    const body = mix(DEEP, SHALLOW, clamp(n.y.sub(0.965).mul(14), 0, 1))
    const glitter = pow(clamp(dot(bounce, sunDir), 0, 1), 420).mul(2.2)

    // Fade into the horizon's own colour, or the plane ends in a visible edge.
    const far = smoothstep(140, 880, length(positionWorld.xz.sub(cameraPosition.xz))).mul(0.8)
    const horizon = sky(normalize(vec3(view.x, 0.015, view.z)), { lit: false }).mul(0.93)

    water.colorNode = mix(
      mix(body, sky(bounce, { disc: 0.3 }), fresnel).add(SUN_TINT.mul(glitter)),
      horizon,
      far,
    )
    return { dome, water }
  }, [])
}
