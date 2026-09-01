import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import { useFrame, useThree } from '@react-three/fiber'
import { emissive, mrt, output, pass, renderOutput } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { fxaa } from 'three/addons/tsl/display/FXAANode.js'

/**
 * Phase 4's post-processing. Two effects, and neither of them is a look.
 *
 * **FXAA**, because rendering through a target is what costs the anti-aliasing
 * the plain canvas got for free, and this world is nothing but hard silhouettes
 * — a gantry, an easel, a rock face — against a smooth gradient sky. Without it
 * post-processing would be a net loss.
 *
 * **Bloom off the emissive buffer only.** "Bloom is not a personality"
 * (BUILD-PLAN, Phase 4), and the way it becomes one is a luminance threshold:
 * everything the sun hits hard enough starts to glow and the frame turns to
 * soup. Here the pass renders `emissive` to its own MRT target and blooms that
 * at threshold zero, so only what a material declares as emitting can bloom.
 * That is exactly two things — the ship's pulsing lamp, and the ore in the
 * mine's veins, which is what lets PolarSense's schema read from outside the
 * adit. The sky, the sun's glow, the glitter on the water and every lit surface
 * are `output` and cannot reach the bloom however bright they get.
 *
 * The chain runs on both backends: TSL compiles the one graph to WGSL and to
 * GLSL, and MRT is native to WebGL2. One look is worth more than a few frames.
 *
 * Order is not free. Bloom belongs in linear HDR, before tone mapping; FXAA
 * wants sRGB, after it. Hence `outputColorTransform = false` and an explicit
 * `renderOutput` between the two.
 */
export function Post() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)

  const pipeline = useMemo(() => {
    const scenePass = pass(scene, camera)
    scenePass.setMRT(mrt({ output, emissive }))

    // Strength and radius, not threshold: threshold is zero on purpose, and how
    // bright a thing glows is the emissive value its material already chose.
    // The lamp peaks near 1 and the ore sits at 0.14, so the same two numbers
    // give the ship a halo and the veins a wash.
    const glow = bloom(scenePass.getTextureNode('emissive'), 1.1, 0.7, 0)

    // Narrow cast at a library boundary: r3f types `gl` as a WebGLRenderer, and
    // `Scene.tsx` hands it a WebGPURenderer.
    const p = new THREE.RenderPipeline(gl as unknown as THREE.Renderer)
    p.outputColorTransform = false
    p.outputNode = fxaa(renderOutput(scenePass.getTextureNode('output').add(glow)))
    return p
  }, [gl, scene, camera])

  useEffect(() => () => pipeline.dispose(), [pipeline])

  // Priority > 0 is what takes the render away from r3f. `frameloop` still
  // decides whether this runs at all, so a route with no world costs nothing.
  useFrame(() => pipeline.render(), 1)

  return null
}
