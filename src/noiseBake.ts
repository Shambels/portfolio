/**
 * One tile of 3D gradient noise, baked to bytes: the table `noise.ts` samples
 * instead of computing Perlin noise per pixel.
 *
 * The function is the one MaterialX's `mx_perlin_noise_float` computes —
 * Perlin's improved noise: a gradient at every lattice point from the same
 * twelve edge directions, a quintic fade between them, and the same 0.982
 * scale on the result. Only the hash that picks a lattice point's gradient
 * differs, which changes where the features fall and nothing about how they
 * look: the same mean, spread and feature size (`docs/STATUS.md`, "Baked
 * noise").
 *
 * Periodic, so the texture can repeat: the lattice wraps at `period` cells,
 * and `size` texels cover it, `size / period` per cell. The value is mapped
 * from [-1, 1] to a byte.
 *
 * Plain arithmetic with no imports, so it runs in the worker and, if a worker
 * cannot be made, on the main thread as it is.
 */
export function bakeNoise(size: number, period: number, seed = 7): Uint8Array {
  const perm = new Uint8Array(512)
  const base = new Uint8Array(256)
  for (let i = 0; i < 256; i++) base[i] = i
  let s = seed >>> 0
  for (let i = 255; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    const j = s % (i + 1)
    const t = base[i]!
    base[i] = base[j]!
    base[j] = t
  }
  for (let i = 0; i < 512; i++) perm[i] = base[i & 255]!

  // Improved noise's sixteen gradients: the twelve cube edges, four of them twice.
  const G = [
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
    0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 1, 1, 0, 0, -1, 1, -1, 1, 0, 0, -1, -1,
  ]
  const P = period
  const grads = new Float32Array(P * P * P * 3)
  for (let z = 0; z < P; z++) for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const h = (perm[perm[perm[x]! + y]! + z]! & 15) * 3
    const i = (x + P * (y + P * z)) * 3
    grads[i] = G[h]!
    grads[i + 1] = G[h + 1]!
    grads[i + 2] = G[h + 2]!
  }

  // Every cell holds the same `S`³ offsets, so the offsets and their fades are
  // a table, and each cell reads its eight corner gradients once.
  const N = size
  const S = N / P
  const o = new Float32Array(S)
  const f = new Float32Array(S)
  for (let i = 0; i < S; i++) {
    const t = i / S
    o[i] = t
    f[i] = t * t * t * (t * (t * 6 - 15) + 10)
  }
  const out = new Uint8Array(N * N * N)
  const c = new Float32Array(24)
  for (let cz = 0; cz < P; cz++) for (let cy = 0; cy < P; cy++) for (let cx = 0; cx < P; cx++) {
    for (let k = 0; k < 8; k++) {
      const i = (((cx + (k & 1)) % P) + P * (((cy + ((k >> 1) & 1)) % P) + P * ((cz + (k >> 2)) % P))) * 3
      c[k * 3] = grads[i]!
      c[k * 3 + 1] = grads[i + 1]!
      c[k * 3 + 2] = grads[i + 2]!
    }
    for (let sz = 0; sz < S; sz++) {
      const z = o[sz]!, w = f[sz]!
      for (let sy = 0; sy < S; sy++) {
        const y = o[sy]!, v = f[sy]!
        let idx = cx * S + N * (cy * S + sy + N * (cz * S + sz))
        for (let sx = 0; sx < S; sx++, idx++) {
          const x = o[sx]!, u = f[sx]!
          const n000 = c[0]! * x + c[1]! * y + c[2]! * z
          const n100 = c[3]! * (x - 1) + c[4]! * y + c[5]! * z
          const n010 = c[6]! * x + c[7]! * (y - 1) + c[8]! * z
          const n110 = c[9]! * (x - 1) + c[10]! * (y - 1) + c[11]! * z
          const n001 = c[12]! * x + c[13]! * y + c[14]! * (z - 1)
          const n101 = c[15]! * (x - 1) + c[16]! * y + c[17]! * (z - 1)
          const n011 = c[18]! * x + c[19]! * (y - 1) + c[20]! * (z - 1)
          const n111 = c[21]! * (x - 1) + c[22]! * (y - 1) + c[23]! * (z - 1)
          const a = n000 + u * (n100 - n000)
          const b = n010 + u * (n110 - n010)
          const d = n001 + u * (n101 - n001)
          const e = n011 + u * (n111 - n011)
          const p = a + v * (b - a)
          const q = d + v * (e - d)
          const val = (p + w * (q - p)) * 0.982
          out[idx] = Math.round(Math.min(1, Math.max(0, val * 0.5 + 0.5)) * 255)
        }
      }
    }
  }
  return out
}
