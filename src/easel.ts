// Arts by Sandra's plate, as arithmetic: where the canvas, the six blobs and
// the rag are in the 900 × 1162 plate `tools/plate.py` writes, and the
// projective map between the plate and the canvas's own square — the canvas
// leans a hair in the photograph, and the paint has to land where the pointer
// is. Pure, no DOM, so `easel.check.ts` runs in node. (Not `studio.ts`: macOS
// cannot tell that from `Studio.tsx` in an import.)

// The plate is 900 × 1162, cropped from row 57 of the 1344-wide source and
// scaled by 900/1344 (`tools/plate.py`, `arts-by-sandra`).
export const W = 900
export const H = 1162
const S = 900 / 1344
const at = (x: number, y: number): [number, number] => [(x * S) / W, ((y - 57) * S) / H]

/** The canvas's corners in the plate, TL TR BR BL — `CANVAS` in `plate.py`. */
export const CORNERS = [at(194, 102), at(1148, 101), at(1156, 1282), at(184, 1280)] as const

/** The blobs on the palette — where, and the pigment each one loads. The
 *  colours are the paints', not the photograph's: a blob in shadow is not
 *  the colour it puts on a canvas. */
export const BLOBS = [
  { at: at(320, 1450), paint: '#c21d10' }, // cadmium red
  { at: at(430, 1428), paint: '#f1bd16' }, // cadmium yellow
  { at: at(550, 1417), paint: '#233199' }, // ultramarine
  { at: at(668, 1415), paint: '#1d6a49' }, // viridian
  { at: at(782, 1417), paint: '#f3eee4' }, // titanium white
  { at: at(900, 1435), paint: '#5b3421' }, // burnt umber
]
export const BLOB_R = (48 * S) / W
/** The rag over the palette's right edge, as a box in the plate. */
export const RAG = [at(960, 1505), at(1320, 1792)] as const

/** The paint layer's resolution — the canvas's own proportions. */
export const PW = 576
export const PH = 706


/** The unit square onto four corners — a projective map, so the canvas's
 *  slight lean in the photograph is honoured — and its inverse. */
export function square(c: readonly (readonly [number, number])[]) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = c as [[number, number], [number, number], [number, number], [number, number]]
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  const g = (sx * dy2 - dx2 * sy) / den
  const h = (dx1 * sy - sx * dy1) / den
  // Row-major: [a b c; d e f; g h 1] maps (u, v, 1) to (x, y, w).
  const m = [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1]
  const [a, b, cc, d, e, f, gg, hh, i] = m as [number, number, number, number, number, number, number, number, number]
  const A = e * i - f * hh
  const B = -(d * i - f * gg)
  const C = d * hh - e * gg
  const det = a * A + b * B + cc * C
  const inv = [
    A / det, -(b * i - cc * hh) / det, (b * f - cc * e) / det,
    B / det, (a * i - cc * gg) / det, -(a * f - cc * d) / det,
    C / det, -(a * hh - b * gg) / det, (a * e - b * d) / det,
  ]
  return inv
}
export const INV = square(CORNERS)
export const toCanvas = (x: number, y: number): [number, number] => {
  const [a, b, c, d, e, f, g, h, i] = INV as [number, number, number, number, number, number, number, number, number]
  const w = g * x + h * y + i
  return [(a * x + b * y + c) / w, (d * x + e * y + f) / w]
}
