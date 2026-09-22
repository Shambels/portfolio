/**
 * What kind of machine this is, for the two or three places that have to draw
 * the same world more cheaply on one.
 *
 * `PHONE` is a primary pointer that is a finger and a screen with no hover —
 * a phone or a tablet, and not a laptop with a touchscreen, which reports
 * `hover: hover` and has the GPU to go with it. It is deliberately not a
 * width: the world is the same world in landscape, and a narrow window on a
 * desktop is still a desktop.
 *
 * It is a static read, like `REDUCED` in `Scenery.tsx` and `Ship.tsx`: the
 * materials and the canvas are built once, so a tier that could change under
 * them would be a promise this world does not keep. A visitor who plugs a
 * mouse into a tablet gets the tier they loaded with.
 *
 * What it changes is only ever the *cost* of a frame, never what is in it:
 * every landmark, every craft, the sound, the spray and the whole of the
 * behaviour are the same on both. The list of what it does change is in
 * `docs/STATUS.md`, "The phone tier".
 */
export const PHONE = window.matchMedia('(hover: none) and (pointer: coarse)').matches

/**
 * How many octaves a noise field gets. Two numbers, and the second is what a
 * phone uses — an octave is a whole 3D noise lookup per pixel, and the ones
 * dropped here are the finest, which is the detail a 400-point-wide screen
 * held at arm's length cannot resolve anyway.
 */
export const octaves = (desktop: number, phone: number) => (PHONE ? phone : desktop)
