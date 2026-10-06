import * as THREE from 'three/webgpu'
import { float, mx_fractal_noise_float, texture3D } from 'three/tsl'
import { off } from './device'
import { bakeNoise } from './noiseBake'

/**
 * Every fractal noise field in the world goes through `fractal()`, and
 * nothing calls `mx_fractal_noise_float` directly.
 *
 * It used to compute the noise: MaterialX's Perlin noise, eight hashed
 * gradients and a quintic blend per octave per pixel. On every device
 * measured that was the largest single cost in the frame — 56% of the
 * MacBook's GPU time, 38% of the iPhone's (`docs/STATUS.md`, "Measuring").
 *
 * Now it reads it. One tile of the same noise is baked into a small 3D
 * texture at load (`noiseBake.ts`, in a worker), and an octave is one
 * filtered texture read instead of a noise evaluation. Same octaves, same
 * lacunarity of 2 and gain of ½, same range; the fields keep their size,
 * spread and motion, and only the exact placement of their features moves.
 *
 * The tile is `PERIOD` noise units across and repeats beyond that. In world
 * terms that is never less than the scale it is read at: 10 m on the
 * whitecaps (`* 3.2`), 34 m on the isle's grain, more everywhere else — and
 * every field that moves, moves through the tile's third axis, so a repeat on
 * the water is never the same foam twice in a row.
 *
 * `?debug&off=baked` puts the computed noise back, for comparing the two on
 * a device; `off=noise` turns both to zero.
 */

/** Texels along each side of the tile. 128³ bytes is 2 MB of GPU memory. */
const SIZE = 128
/** Noise lattice cells across the tile — four texels to a cell, which a
 *  trilinear read follows closely enough that a field's thresholds land
 *  where the computed noise put them. */
const PERIOD = 32

const texture = new THREE.Data3DTexture(new Uint8Array(SIZE * SIZE * SIZE).fill(128), SIZE, SIZE, SIZE)
texture.format = THREE.RedFormat
texture.type = THREE.UnsignedByteType
texture.minFilter = texture.magFilter = THREE.LinearFilter
texture.wrapS = texture.wrapT = texture.wrapR = THREE.RepeatWrapping
texture.generateMipmaps = false
texture.unpackAlignment = 1
texture.needsUpdate = true

function fill(bytes: Uint8Array) {
  texture.image.data = bytes
  texture.needsUpdate = true
}

// Until the bytes arrive the texture is mid-grey, which reads as zero: a field
// with no noise in it, for the fraction of a second before the models are in
// anyway.
if (!off('baked') && !off('noise')) {
  try {
    const worker = new Worker(new URL('./noise.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Uint8Array>) => {
      fill(e.data)
      worker.terminate()
    }
    worker.onerror = () => {
      worker.terminate()
      fill(bakeNoise(SIZE, PERIOD))
    }
    worker.postMessage({ size: SIZE, period: PERIOD })
  } catch {
    fill(bakeNoise(SIZE, PERIOD))
  }
}

/**
 * Fractal noise at `p`, `octaves` deep: the same field `mx_fractal_noise_float`
 * gives with its defaults, centred on zero, roughly ±1 and mostly within ±0.5.
 *
 * Read at level 0 — the tile has no mips — which is also what lets it run in
 * the vertex stage, where the isle's `blotch` is.
 */
export function fractal(p: THREE.Node, octaves: number): THREE.Node<'float'> {
  if (off('noise')) return float(0)
  if (off('baked')) return mx_fractal_noise_float(p, octaves)

  // Σ aᵢ·(2tᵢ − 1) = Σ 2aᵢ·tᵢ − Σ aᵢ, with aᵢ = ½ⁱ: the texture holds the noise
  // as a byte, and the constant comes out once rather than once an octave.
  let q = (p as THREE.Node<'vec3'>).div(PERIOD)
  let sum: THREE.Node<'float'> = float(0)
  let amp = 1
  let bias = 0
  for (let i = 0; i < octaves; i++) {
    sum = sum.add(texture3D(texture, q, 0).r.mul(2 * amp))
    bias += amp
    amp *= 0.5
    q = q.mul(2)
  }
  return sum.sub(bias)
}
