import {
  abs, cameraPosition, clamp, dot, normalWorld, normalize, oneMinus, positionWorld,
  smoothstep, vec3,
} from 'three/tsl'
import type * as THREE from 'three/webgpu'
import { SUN } from './Scenery'

/**
 * The anime look's light (`?look=anime`, `device.ts`). One function every
 * cel-shaded material ends in, in place of `MeshStandardNodeMaterial`'s
 * physically based lighting.
 *
 * Three tones, not a gradient: shadow, a half-tone just past the terminator,
 * and full sun. The steps are a few hundredths of N·L wide, so they read as
 * edges and still do not crawl. What they add up to is the same sun and the
 * same fill the scene's two lights gave a matte surface — `Scenery.tsx`'s
 * 3.0 of #ffcb92 and 2.1 of #8fa9c9, divided through by π the way three's
 * Lambert does — so a surface in full sun is as bright as it was. The shadow
 * is not: it is pulled toward violet. A darker copy of the surface's own colour
 * reads as dim; a shadow that changes hue reads as a drawing.
 *
 * And a rim: a narrow band of warm light round the silhouette, on the sun's
 * side only, which is what separates a shape from what is behind it when the
 * bands inside it are flat.
 *
 * No PBR, no specular, no environment: `MeshBasicNodeMaterial` plus this, and
 * the lights in the scene are not read at all.
 */

type Vec3 = THREE.Node<'vec3'>
type Float = THREE.Node<'float'>

const L = vec3(SUN.x, SUN.y, SUN.z)
/** Fill, in shadow: the ambient's 2.1 × #8fa9c9 / π, pulled toward violet. */
const SHADE = vec3(0.25, 0.23, 0.43)
/** What full sun adds on top of the fill: 3.0 × #ffcb92 / π. */
const SUNLIGHT = vec3(0.955, 0.57, 0.275)
const RIM = vec3(1.0, 0.62, 0.32)

/** A hard step at `edge` that is `w` wide either side — a band edge, drawn. */
export const band = (edge: number, x: Float, w = 0.04): Float => smoothstep(edge - w, edge + w, x)

/**
 * How lit a surface is, in the three tones: 0 shadow, 0.55 half-tone, 1 sun.
 * `twoSided` for a leaf, which is lit through from whichever side the sun is on.
 */
export function lit({ twoSided = false } = {}): Float {
  const d = dot(normalWorld, L)
  const ndl = twoSided ? abs(d) : d
  return band(0.01, ndl, 0.03).mul(0.55).add(band(0.45, ndl, 0.03).mul(0.45))
}

/**
 * A surface of colour `albedo`, cel-lit. `sunlit` is the colour it turns in the
 * sun, when that is not simply the same colour brighter — a frond is lime where
 * the light comes through it and bottle green where it does not.
 */
export function toon(albedo: Vec3, { twoSided = false, sunlit }: { twoSided?: boolean; sunlit?: Vec3 } = {}): Vec3 {
  const t = lit({ twoSided })
  const shadow = albedo.mul(SHADE)
  const sun = (sunlit ?? albedo).mul(SHADE.add(SUNLIGHT))
  const facing = dot(normalWorld, normalize(cameraPosition.sub(positionWorld)))
  const edge = oneMinus(clamp(twoSided ? abs(facing) : facing, 0, 1))
  const rim = band(0.72, edge, 0.03).mul(band(0.2, dot(normalWorld, L), 0.05)).mul(0.35)
  return shadow.add(sun.sub(shadow).mul(t)).add(RIM.mul(rim))
}
