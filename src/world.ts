/** World layout. One source of truth — Phase 3 moves it into MDX frontmatter. */
export type Landmark = {
  slug: string
  label: string
  pos: [number, number, number] // ground centre
  size: [number, number, number] // blockout box, true scale
  radius: number // proximity trigger, XZ
}

export const LANDMARKS: Landmark[] = [
  { slug: 'polarsense', label: 'PolarSense — the mine', pos: [-14, 0, -8], size: [5, 3.5, 5], radius: 5 },
  { slug: 'arts-by-sandra', label: 'Arts by Sandra — the easel', pos: [12, 0, -5], size: [2, 3, 2], radius: 4 },
  { slug: 'scrubble', label: 'Scrubble — the board', pos: [0, 0, 14], size: [6, 0.4, 6], radius: 5 },
]

/** Nearest landmark whose radius contains (x, z), or null. Pure — easy to check. */
export function landmarkAt(x: number, z: number): Landmark | null {
  let best: Landmark | null = null
  let bestD = Infinity
  for (const l of LANDMARKS) {
    const dx = x - l.pos[0]
    const dz = z - l.pos[2]
    const d = dx * dx + dz * dz
    if (d < l.radius * l.radius && d < bestD) { bestD = d; best = l }
  }
  return best
}
