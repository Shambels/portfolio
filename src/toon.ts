import {
  BRDF_Lambert, abs, cameraPosition, clamp, diffuseColor, dot, modelPosition, modelScale,
  normalLocal, normalView, normalWorld, normalize, oneMinus, positionLocal, positionViewDirection,
  positionWorld, smoothstep, vec3,
} from 'three/tsl'
import * as THREE from 'three/webgpu'
import { ANIME } from './device'
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

/* ------------------------------------------------------- everything else lit
 *
 * The isle's materials call `toon()` themselves. Everything else in the world
 * — the landmarks, the hulls, the rider, the board, the stair, the fall — is
 * a `MeshStandardNodeMaterial`, forty-odd of them, many with colour, emissive
 * and opacity graphs of their own that should survive untouched. So under
 * `?look=anime` the materials stay what they are and only their light changes:
 * `CelLightingModel` replaces the physically based one on the class, and
 * every standard or physical material built after this module loads lights
 * itself in bands. Same numbers as `toon()` — three tones, the violet fill,
 * the warm rim — read off the scene's own two lights, so the ore still glows,
 * the lens still flashes and the proximity tint still lands.
 */

/** The fill toward violet: `SHADE` over the ambient's own colour, per channel. */
const VIOLET = vec3(1.36, 0.87, 1.1)

/** The surface's own colour over π, as three's Lambert has it. */
const lambert = () => BRDF_Lambert({ diffuseColor: diffuseColor.rgb }) as unknown as THREE.Node<'vec3'>

class CelLightingModel extends THREE.LightingModel {
  direct({ lightDirection, lightColor, reflectedLight }: THREE.LightingModelDirectInput) {
    const ndl = normalView.dot(lightDirection as THREE.Node<'vec3'>)
    const t = band(0.01, ndl, 0.03).mul(0.55).add(band(0.45, ndl, 0.03).mul(0.45))
    const edge = oneMinus(clamp(normalView.dot(positionViewDirection), 0, 1))
    const rim = band(0.72, edge, 0.03).mul(band(0.2, ndl, 0.05)).mul(0.12)
    const light = lightColor as THREE.Node<'vec3'>
    ;(reflectedLight.directDiffuse as THREE.Node<'vec3'>).addAssign(light.mul(t).mul(lambert()).add(light.mul(rim)))
  }

  indirect(builder: THREE.NodeBuilder) {
    const { irradiance, reflectedLight } = (builder as unknown as {
      context: { irradiance: THREE.Node<'vec3'>; reflectedLight: { indirectDiffuse: THREE.Node<'vec3'> } }
    }).context
    reflectedLight.indirectDiffuse.addAssign(irradiance.mul(VIOLET).mul(lambert()))
  }
}

if (ANIME) {
  const cel = () => new CelLightingModel()
  ;(THREE.MeshStandardNodeMaterial.prototype as unknown as { setupLightingModel: () => THREE.LightingModel }).setupLightingModel = cel
  ;(THREE.MeshPhysicalNodeMaterial.prototype as unknown as { setupLightingModel: () => THREE.LightingModel }).setupLightingModel = cel
}

/* -------------------------------------------------------------------- ink
 *
 * The outline, for everything that does not draw its own. The rider and the
 * board already have one (`OUTLINE` in `Ship.tsx`); this is the same
 * inverted hull — the mesh again, inside out, pushed out along its normals —
 * with the push grown with distance, so a landmark sixty metres off is inked
 * as thick on screen as the board under your feet.
 */
export const INK = new THREE.MeshBasicNodeMaterial({ color: '#0a0d14', side: THREE.BackSide })
INK.positionNode = positionLocal.add(
  normalLocal.mul(cameraPosition.distance(modelPosition).mul(0.0016).div(modelScale.x)),
)
