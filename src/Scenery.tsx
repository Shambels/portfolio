import { useMemo } from 'react'
import * as THREE from 'three/webgpu'
import {
  cameraPosition, clamp, cos, dot, float, length, max, mix, mx_fractal_noise_float,
  normalize, oneMinus, positionLocal, positionWorld, pow, reflect, sin, smoothstep, sqrt, time,
  uniform, vec2, vec3,
} from 'three/tsl'
import { SEA_CALM } from './WorldGate'

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

// Low (16 deg) and over the visitor's left shoulder.
//
// It used to be low and ahead, which put its glow and its path across the water
// in the left of every frame — and every landmark in shadow, because the camera
// never turns: it sits at a fixed offset behind the ship looking down world -Z,
// so the only surfaces it can see are the ones facing +Z, and the sun was at
// -Z. A benched rock face and a smooth one were the same flat grey (STATUS.md,
// Phase 4). Swung round to port and behind, it rakes across exactly the faces
// the visitor is looking at, and the shadow sides fall to the right of the
// frame, where they model the shape instead of hiding it.
//
// The cost, and it is the reason this was Seb's call and not a quiet fix: the
// sun disc, its glow and the glitter path on the water are all behind the
// camera now, so none of them is in frame. The warm horizon below is what is
// left of golden hour, and the fill was cut to buy the contrast back.
const SUN = new THREE.Vector3(-0.66, 0.27, 0.7).normalize()

const ZENITH = vec3(0.05, 0.13, 0.32)
const HAZE_COOL = vec3(0.25, 0.35, 0.48)
const HAZE_WARM = vec3(1.0, 0.72, 0.42)
const SUN_TINT = vec3(1.0, 0.85, 0.62)
const CLOUD_LIT = vec3(1.0, 0.86, 0.72)
const CLOUD_DARK = vec3(0.36, 0.34, 0.44)
const DEEP = vec3(0.012, 0.055, 0.085)
const SHALLOW = vec3(0.03, 0.16, 0.19)
// The same white the spray is made of, so a whitecap and the foam the saucer
// tears off the same water are not two different whites.
const FOAM = vec3(0.86, 0.93, 0.97)

// Invariant 6: nothing drifts, ripples or sparkles when motion is not wanted.
const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const T = time.mul(REDUCED ? 0 : 1)

type Vec3 = THREE.Node<'vec3'>
type Vec2 = THREE.Node<'vec2'>
type Float = THREE.Node<'float'>
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

  // Warmth wrapped right round the horizon rather than clamped to the sun's own
  // side. With the sun behind the camera the visitor faces the anti-solar half
  // of the sky, and `pow(toSun, 3)` left that half flatly cool — which a hazy
  // low sun does not do to a real sky either. It still falls off: the frame runs
  // from warm at the left edge to cool at the right, and the water reflects it.
  const haze = mix(HAZE_COOL, HAZE_WARM, pow(dot(dir, sunDir).mul(0.5).add(0.5), 1.8))
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
/** Wave height at a crest with every swell in phase, before the sea state
 *  scales it — the number that turns the sum of the sines into -1..1. */
const HSUM = SWELL.reduce((sum, [, , , amp]) => sum + amp, 0)

/**
 * Sea state — the menu's slider, from a mirror to a gale.
 *
 * `SWELL` above is the *shape* of the water and it does not move; what the
 * slider moves is three scalars laid over it. Amplitude squares, so the calm
 * half of the travel is where the fine control is and the top of it is a step
 * change; frequency and speed are linear and gentle, because a storm is mostly
 * taller and faster water rather than smaller water. All three read exactly 1
 * at `SEA_CALM`, which is where the slider starts — so the default is the sea
 * this world shipped with, to the bit.
 *
 * Two copies of the same three numbers, and deliberately: the uniforms drive
 * the shader, the plain object drives `swell()` below on the CPU, and one
 * function writes both. Anything else is the water and the boat disagreeing
 * again, which is the bug the dev assert underneath already exists to catch.
 *
 * The shader graph is built once (`useMaterials`) and never rebuilt — a uniform
 * is what lets a slider move a sea that has already been compiled.
 */
const uAmp = uniform(1)
const uFreq = uniform(1)
const uSpeed = uniform(1)
/** 0 up to about half travel, then 1 — foam, and the darker water under it, are
 *  a storm's and not a swell's. */
const uStorm = uniform(0)

const SEA = { amp: 1, freq: 1, speed: 1 }
let level = SEA_CALM

/** The slider, 0 (a mirror) to 1 (a gale). Called from `Scenery` on every
 *  render, so it must stay idempotent and cheap. */
export function setSea(next: number) {
  level = next
  SEA.amp = uAmp.value = (next / SEA_CALM) ** 2
  SEA.freq = uFreq.value = 1 + (next - SEA_CALM) * 1.0
  SEA.speed = uSpeed.value = 1 + (next - SEA_CALM) * 1
  const k = Math.min(Math.max((next - 0.45) / 0.55, 0), 1)
  uStorm.value = k * k * (3 - 2 * k)
}

/** Read by `Sound`, which puts the same weather in the mix. */
export const seaLevel = () => level

/** How far the swell's height has been scaled — 1 at `SEA_CALM`. Read by
 *  `Ship`, which exaggerates a hull's heel and has less to exaggerate the
 *  bigger the sea gets. */
export const seaAmp = () => SEA.amp

/**
 * The same three swells on the CPU, as a height and a gradient at a world XZ.
 * `SWELL` above is a set of sine waves, so its height field is the term the
 * shader differentiates to get its normals — one set of numbers, and a hull
 * that rides the sea it can see rather than a second sea that nearly matches.
 *
 * The noise ripple is deliberately not here: it is a slope detail at a scale
 * no hull reacts to, and it is the one term with no cheap CPU twin.
 *
 * `t` is the caller's, not this module's, because the caller is the only one
 * who knows whether it is honouring `prefers-reduced-motion` — pass 0 and the
 * sea is as frozen as the shader's is. It is `clock.elapsedTime` rather than
 * three's `time` node: a different clock, so the phase is off by however long
 * the renderer took to come up. On a flat plane shaded by these normals that
 * offset is not observable, and threading the node's clock back to the CPU is
 * a uniform read per frame to fix nothing.
 *
 * Returns a shared object — read it, do not keep it.
 */
const _swell = { y: 0, dx: 0, dz: 0 }
export function swell(x: number, z: number, t: number) {
  let y = 0
  let dx = 0
  let dz = 0
  for (const [dirX, dirZ, freq, amp, speed] of SWELL) {
    const k = freq * SEA.freq
    const phase = x * dirX * k + z * dirZ * k + t * speed * SEA.speed
    y += Math.sin(phase) * amp * SEA.amp
    const slope = Math.cos(phase) * amp * k * SEA.amp
    dx += slope * dirX
    dz += slope * dirZ
  }
  _swell.y = y
  _swell.dx = dx
  _swell.dz = dz
  return _swell
}

/**
 * The one thing that can go quietly wrong here: `SWELL` gaining a term whose
 * height and slope do not belong to each other, which shades a sea the boat is
 * not riding. Finite differences catch it in dev, once, at import.
 */
if (import.meta.env.DEV) {
  const e = 1e-4
  // Every sea state, not just the default one: the slider scales the height by
  // `amp` and the slope by `amp * freq`, which is one place to drop a factor.
  for (const sea of [SEA_CALM, 1, 0.15]) {
    setSea(sea)
    for (const [x, z, t] of [[3, -7, 0.4], [-11, 22, 9.1]]) {
      const s = swell(x, z, t)
      const dx = (swell(x + e, z, t).y - swell(x - e, z, t).y) / (2 * e)
      const dz = (swell(x, z + e, t).y - swell(x, z - e, t).y) / (2 * e)
      console.assert(
        Math.abs(dx - s.dx) < 1e-4 && Math.abs(dz - s.dz) < 1e-4,
        `swell at ${x},${z}, sea ${sea}: the gradient is not the height's — the water and the boat disagree`,
      )
    }
  }
  setSea(SEA_CALM)
}

/**
 * Normal and crest height at a world XZ. The crest comes out normalised to
 * -1 (trough) .. 1 (peak) *before* the amplitude is applied, so foam sits on
 * the same water at every sea state instead of appearing only once the sea is
 * tall enough to reach a threshold.
 */
function waves(p: Vec2) {
  let h: Float = float(0)
  let dx: Float = float(0)
  let dz: Float = float(0)
  for (const [dirX, dirZ, freq, amp, speed] of SWELL) {
    const phase = p.x.mul(dirX * freq).add(p.y.mul(dirZ * freq)).mul(uFreq)
      .add(T.mul(speed).mul(uSpeed))
    h = h.add(sin(phase).mul(amp))
    const slope = cos(phase).mul(amp * freq).mul(uFreq).mul(uAmp)
    dx = dx.add(slope.mul(dirX))
    dz = dz.add(slope.mul(dirZ))
  }
  const ripple = mx_fractal_noise_float(vec3(p.mul(float(0.6).mul(uFreq)), T.mul(0.25).mul(uSpeed)), 2)
    .mul(float(0.05).mul(sqrt(uAmp)))
  return {
    n: normalize(vec3(dx.add(ripple).negate(), 1, dz.sub(ripple).negate())),
    crest: h.div(HSUM),
  }
}

export function Scenery({ sea }: {
  /** The menu's slider, 0 (a mirror) to 1 (a gale). `SEA_CALM` is where it
   *  starts and is the sea this world shipped with. */
  sea: number
}) {
  // Written during render on purpose, and the one place in this file that is:
  // it is four uniform assignments, it is idempotent, and doing it in an effect
  // would leave the frame between the commit and the effect showing the sea the
  // visitor just moved away from. Nothing reads these until the next frame.
  setSea(sea)
  const { dome, water } = useMaterials()
  return (
    <>
      {/* Sun. Warm and low. */}
      <directionalLight position={[SUN.x * 80, SUN.y * 80, SUN.z * 80]} color="#ffcb92" intensity={3.0} />
      {/* Fill, not a hemisphere light: hemisphere lights contribute nothing
          through the node pipeline, which is what left the landmarks black.
          Cut from 2.8 with the sun swing: it was carrying every visible surface
          on its own, and at that strength it flattens surfaces that now have a
          key light on them. 2.1 rather than the 1.7 this started at — at 1.7 the
          shadow side of the mine crushed to navy. A face toward the visitor now
          reads about a fifth brighter than before, a face away a quarter darker,
          which is the whole point of the swing. */}
      <ambientLight color="#8fa9c9" intensity={2.1} />

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
    const { n, crest } = waves(positionWorld.xz)
    const bounce = reflect(view, n)

    // Grazing angles mirror the sky, steep ones show the water's own colour.
    const fresnel = pow(oneMinus(clamp(dot(n, view.negate()), 0, 1)), 4.5).mul(0.92).add(0.06)
    // Deep in the troughs, lighter on the crests. The normal's own tilt says
    // that on a calm sea; in a storm it saturates — every facet is steep — so
    // the crest height takes over and keeps the banding the surface needs to
    // read as water rather than as a dark sheet.
    const body = mix(DEEP, SHALLOW, max(
      clamp(n.y.sub(0.965).mul(14), 0, 1),
      smoothstep(-0.35, 0.95, crest).mul(uStorm).mul(0.75),
    ))
    const glitter = pow(clamp(dot(bounce, sunDir), 0, 1), 420).mul(2.2)

    // Whitecaps. The top of a crest, broken up by a second noise field so the
    // foam is patches travelling with the water rather than bands drawn across
    // it — and gated on `uStorm`, so the sea the world shipped with has none.
    //
    // This is where the height of a storm lives. The surface is still a flat
    // plane wearing normals (see `SWELL`), so a wave has no silhouette to see;
    // what says "tall" is the foam, the dark troughs, and the boat, which does
    // ride the real height field.
    const breakup = mx_fractal_noise_float(vec3(positionWorld.xz.mul(3.2), T.mul(0.4).mul(uSpeed)), 3)
    const foam = smoothstep(0.55, 0.98, crest).mul(uStorm).mul(smoothstep(0.0, 0.4, breakup))

    // Fade into the horizon's own colour, or the plane ends in a visible edge.
    const far = smoothstep(140, 880, length(positionWorld.xz.sub(cameraPosition.xz))).mul(0.8)
    const horizon = sky(normalize(vec3(view.x, 0.015, view.z)), { lit: false }).mul(0.93)

    water.colorNode = mix(
      mix(
        mix(body, sky(bounce, { disc: 0.3 }), fresnel).add(SUN_TINT.mul(glitter)),
        FOAM,
        foam.mul(0.85),
      ),
      horizon,
      far,
    )
    return { dome, water }
  }, [])
}
