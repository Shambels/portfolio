/** The query string the world was loaded with. Read once, like everything in
 *  this file: the materials are built from it and never rebuilt. */
const PARAMS = new URLSearchParams(window.location.search)

/**
 * `?tier=phone` or `?tier=desktop`: either tier on any machine, so the phone
 * tier can be looked at on a laptop and the desktop one timed on a phone.
 * Anything else, or nothing, is the media query below.
 */
const TIER = PARAMS.get('tier')

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
export const PHONE =
  TIER === 'phone' ? true : TIER === 'desktop' ? false : window.matchMedia('(hover: none) and (pointer: coarse)').matches

/**
 * How many octaves a noise field gets. Two numbers, and the second is what a
 * phone uses — an octave is a whole 3D noise lookup per pixel, and the ones
 * dropped here are the finest, which is the detail a 400-point-wide screen
 * held at arm's length cannot resolve anyway.
 */
export const octaves = (desktop: number, phone: number) => (PHONE ? phone : desktop)

/**
 * `?debug` as the page was loaded. The HUD reads `?debug` from the router and
 * follows it; this is for the one thing that has to be decided before the
 * first frame — the renderer's GPU timestamp queries, which cost a little on
 * every pass and are only worth paying for while somebody is reading them.
 */
export const PROFILE = PARAMS.has('debug')

/** The parts of the world `?off=` can take out, one at a time or several. */
export type Part = 'post' | 'dome' | 'water' | 'noise' | 'adapt' | 'msaa' | 'isle' | 'islands' | 'landmarks' | 'rider' | 'spray'

/**
 * `?debug&off=post,noise`: the world with those parts taken out, so a phone
 * can say what each of them costs it. The difference in frame time with and
 * without a part *is* that part's cost — the one measurement a profiler on a
 * laptop cannot make for a phone. `docs/STATUS.md`, "Measuring".
 *
 *   post       render straight to the canvas: no bloom, no FXAA, no HDR targets
 *   dome       the sky dome, whose shader covers half of most frames
 *   water      the sea surface
 *   noise      every fractal noise field returns zero (`noise.ts`)
 *   msaa       no 4× MSAA on the canvas where there is no `Post` (`POST`)
 *   adapt      the pixel ratio stays put instead of following the frame
 *              rate (`Resolution.tsx`), so runs compare at one ratio
 *   isle       the home isle, its palms, stair and fall
 *   islands    the project islands under the landmarks
 *   landmarks  the five landmarks
 *   rider      the surfer's body (the board and the behaviour stay)
 *   spray      the GPU particles, compute and draw
 *
 * Hidden rather than unmounted wherever something else reads the part, so
 * that what is measured is the drawing and not a different world. A
 * diagnostic, and nothing a visitor reaches: without `?debug` it is ignored.
 */
const OFF = new Set(PROFILE ? (PARAMS.get('off') ?? '').split(',').map((s) => s.trim()) : [])
export const off = (part: Part) => OFF.has(part)
/**
 * `?debug&turn`: spawn on the water facing the isle instead of on its beach
 * facing out to sea — the one view of the isle a screenshot can get without
 * flying there. A diagnostic, ignored without `?debug`.
 */
export const TURN = PROFILE && PARAMS.has('turn')

/** For the readout: what this load took out, as typed. */
export const OFF_LIST = [...OFF].filter(Boolean)

/**
 * Whether the frame goes through `Post` — bloom off the emissive buffer, then
 * FXAA — or straight to the canvas (`Direct`).
 *
 * Straight to the canvas on a phone. The post chain renders the scene into
 * two half-float targets and reads them back, and memory bandwidth is the one
 * thing a phone's tiled GPU is worst at: taking it out was a third of the
 * iPhone SE's frame (`docs/STATUS.md`, "Measuring"). What it loses is the
 * glow round the saucer's lamp and the ore, which on a screen that size is a
 * few pixels; the edges keep their anti-aliasing from the canvas's own 4×
 * MSAA instead (`Scene.tsx`), which a tiled GPU resolves on the chip almost
 * for free — the opposite of a desktop GPU, which is why a computer keeps FXAA.
 *
 * `?debug&post` puts the chain back on a phone, to compare; `?debug&off=post`
 * takes it off a computer.
 */
export const POST = !off('post') && (!PHONE || (PROFILE && PARAMS.has('post')))

