import { float, mx_fractal_noise_float } from 'three/tsl'
import { off } from './device'

/**
 * Every fractal noise field in the world goes through here, and nothing calls
 * `mx_fractal_noise_float` directly any more.
 *
 * One door, for two reasons. `?debug&off=noise` turns all of them to zero at
 * once, which is how a phone says what the noise costs it — the clouds, the
 * whitecaps, the isle's clumps and grain, the veneer on the landmarks are all
 * per-pixel 3D lookups, and together they are the largest single line in the
 * shader budget (`docs/STATUS.md`, "Measuring"). And it is where a cheaper
 * noise lands when one does — a tiling texture baked once at load and read
 * instead of computed — without touching the forty places that ask for it.
 *
 * Same arguments as the TSL function, same result, same cost: today this is
 * a pass-through.
 */
export const fractal = (...args: Parameters<typeof mx_fractal_noise_float>) =>
  off('noise') ? float(0) : mx_fractal_noise_float(...args)
