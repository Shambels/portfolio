import { useEffect, useState, type MouseEvent } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router'
import { STRINGS, type Locale } from '../i18n'

/**
 * One palm frond: the base at the origin, the rachis arcing out along +x and
 * every leaflet falling under its own weight. Generated rather than drawn — 34
 * leaflets on alternating sides, longest at mid-span — and it is the only shape
 * on the page. Both crowns, both sides, near and far, are this one path under a
 * transform, which is why the whole shore is 1.7 kB of geometry.
 */
const FROND =
  'M0 -3Q54 2.2 120 46Q54 7 0 3ZM6 0.1Q12.8 -8.8 13.7 -20Q6.9 -11.1 6 0.1ZM9.5 0.3Q9.2 20.1 16.2 38.6Q16.5 18.8 9.5 0.3ZM12.9 0.5Q23.3 -10.4 26.3 -25.1Q15.9 -14.2 12.9 0.5ZM16.4 0.9Q16.1 25.5 24.9 48.5Q25.1 23.9 16.4 0.9ZM19.8 1.3Q33.6 -10.5 39.3 -27.7Q25.4 -16 19.8 1.3ZM23.3 1.7Q23 30.2 33.2 56.7Q33.4 28.3 23.3 1.7ZM26.7 2.3Q43.8 -9.4 52.3 -28.2Q35.3 -16.5 26.7 2.3ZM30.2 2.9Q30 34.2 41.3 63.3Q41.4 32.1 30.2 2.9ZM33.6 3.6Q53.5 -7.2 65.1 -26.6Q45.2 -15.8 33.6 3.6ZM37.1 4.4Q37 37.6 49.1 68.5Q49.1 35.3 37.1 4.4ZM40.5 5.3Q62.8 -4.1 77.2 -23.3Q55 -14 40.5 5.3ZM44 6.2Q44.1 40.5 56.6 72.4Q56.6 38.1 44 6.2ZM47.5 7.2Q71.3 -0.3 88.4 -18.6Q64.5 -11.1 47.5 7.2ZM50.9 8.3Q51.1 42.9 64 75Q63.8 40.4 50.9 8.3ZM54.4 9.4Q79.2 4.1 98.3 -12.6Q73.5 -7.3 54.4 9.4ZM57.8 10.7Q58.2 44.9 71.1 76.6Q70.7 42.4 57.8 10.7ZM61.3 12Q86.4 8.9 107 -5.8Q81.9 -2.8 61.3 12ZM64.7 13.4Q65.3 46.5 78 77.1Q77.4 44 64.7 13.4ZM68.2 14.9Q92.9 14 114.3 1.5Q89.6 2.4 68.2 14.9ZM71.6 16.4Q72.4 47.9 84.7 76.8Q83.9 45.4 71.6 16.4ZM75.1 18Q98.8 19.1 120.2 9.1Q96.6 8 75.1 18ZM78.5 19.7Q79.5 49 91.2 75.8Q90.2 46.6 78.5 19.7ZM82 21.5Q104 24.3 124.9 16.8Q102.9 13.9 82 21.5ZM85.5 23.3Q86.6 50 97.4 74.3Q96.3 47.7 85.5 23.3ZM88.9 25.3Q108.8 29.4 128.5 24.1Q108.6 20 88.9 25.3ZM92.4 27.3Q93.6 50.9 103.5 72.4Q102.2 48.8 92.4 27.3ZM95.8 29.3Q113.2 34.3 131.1 31.1Q113.7 26.1 95.8 29.3ZM99.3 31.5Q100.6 51.9 109.3 70.3Q108 49.9 99.3 31.5ZM102.7 33.7Q117.4 39.1 133 37.6Q118.3 32.2 102.7 33.7ZM106.2 36Q107.5 52.9 114.9 68.2Q113.6 51.3 106.2 36ZM109.6 38.4Q121.4 43.7 134.3 43.4Q122.5 38.1 109.6 38.4ZM113.1 40.9Q114.3 54.2 120.4 66.2Q119.1 52.8 113.1 40.9ZM116.5 43.4Q125.4 48.1 135.4 48.7Q126.6 43.9 116.5 43.4ZM120 46Q121 55.8 125.6 64.5Q124.6 54.7 120 46Z'

/** A crown is a fan of rotations and scales about one point. The near pair is
 *  bigger and spread wider — those are the fronds hanging over the camera. */
const NEAR: [number, number][] = [[-34, 1.5], [-8, 1.7], [20, 1.75], [48, 1.6], [76, 1.35], [104, 1.05]]
const FAR: [number, number][] = [[-30, 0.8], [-2, 0.95], [26, 0.9], [56, 0.75], [86, 0.6]]

const GULL = 'M-12 0Q-6 -6.5 0 -1.2Q6 -6.5 12 0Q6 -3.6 0 1.6Q-6 -3.6 -12 0Z'

/**
 * The board and the chair below it are one projection, not a drawing: a chaise
 * and a man laid out in metres, a camera 4m behind his left shoulder and a
 * little above him, and the outline is what came back. Which is why nothing
 * here is symmetrical and none of the numbers are round.
 *
 * The board is the one piece measured in the picture rather than the model. A
 * planted board is flat, and how much of its face turns back to the camera is
 * a choice rather than a fact — so only its axis is projected, and the outline
 * is fitted along that axis at the width that reads: 1.95m of it above the
 * sand, a sixth of that across.
 */
const BOARD =
  'M315 316C319 311 335 295 341 284C346 273 347 261 349 250C351 238 353 228 355 217C357 205 358 193 360 181C361 170 362 158 363 146C364 134 365 122 366 111C367 99 368 88 368 77C369 65 370 53 369 41C368 29 365 10 364 4C361 10 352 26 348 38C343 49 341 61 338 72C334 83 332 93 329 105C326 116 324 128 321 139C318 151 316 163 314 174C311 186 309 198 307 209C306 221 304 231 303 242C301 254 298 266 300 278C302 290 312 310 315 316Z'

const crown = (fronds: [number, number][], x = 0, y = 0) =>
  fronds.map(([rot, scale], i) => (
    <use key={i} href="#frond" transform={`translate(${x} ${y}) rotate(${rot}) scale(${scale})`} />
  ))

/** How long the button holds the navigation back, so the shore has time to go
 *  past the camera. The CSS flight is a little longer than this on purpose:
 *  nothing should still be on screen at the cut. */
const FLIGHT = 560

/**
 * The landing page. `/{lang}` is the world seen from a standstill — the same
 * sky and the same water, drawn as a gradient sampled from a rendered frame
 * (`.landing` in `index.css`) — and one button into `/{lang}/world`, which is
 * where the canvas mounts.
 *
 * Nothing here asks what the visitor's hardware can do. The page is CSS and one
 * SVG path, so the shore arrives with no WebGL, with no JavaScript and before
 * the scene chunk has been requested; and the button leads to a route that is a
 * complete page without a renderer. The second link is not a fallback — it is
 * the way past the world for someone who came to read.
 *
 * Pressing the button flies the shore past the camera before the route changes.
 * Every layer scales about one point — the vanishing point on the horizon, at
 * `50vw var(--horizon)` — and the only thing that differs is how fast: the
 * clouds barely move, the crowns overhead sweep out through the top corners,
 * the sand slides down under us. That is a dolly, not a set of separate
 * animations, and it is why the layers stay in register the whole way through.
 */
export default function Home() {
  const locale = useOutletContext<Locale>()
  const t = STRINGS[locale]
  const navigate = useNavigate()
  const world = `/${locale}/world`
  const [leaving, setLeaving] = useState(false)

  // The flight is the only thing between the click and the route. Held here
  // rather than in the handler so that leaving the page cancels it: clicking
  // through to the flat index mid-flight must not drag the visitor into the
  // world half a second later.
  useEffect(() => {
    if (!leaving) return
    const id = setTimeout(() => navigate(world), FLIGHT)
    return () => clearTimeout(id)
  }, [leaving, navigate, world])

  const fly = (e: MouseEvent<HTMLAnchorElement>) => {
    // A modified click belongs to the browser — new tab, new window, download.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
    // Invariant 6. No flight, so no delay: the link goes where it says it goes,
    // immediately, and the CSS below has nothing to play.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    e.preventDefault()
    setLeaving(true)
  }

  return (
    <>
      {/* Invariant 2 in the other direction: there is not a word in here. It is
          prerendered markup, so it is on the page with JavaScript off, and it
          is `aria-hidden` because none of it is content. */}
      <div className={leaving ? 'shore leaving' : 'shore'} aria-hidden="true">
        <div className="sun" />
        <div className="clouds" />
        {/* Two, crossing a minute apart. `translate` and `scale` are separate
            properties from the `transform` the dolly uses, so the flight and the
            wingbeat compose with it instead of fighting it. */}
        <svg className="bird b1" viewBox="-14 -8 28 12">
          <use href="#gull" />
        </svg>
        <svg className="bird b2" viewBox="-14 -8 28 12">
          <use href="#gull" />
        </svg>
        <div className="haze" />
        <div className="glint" />
        <div className="beach" />
        <div className="wash" />
        <div className="wash wash-2" />
        {/*
          Someone got here first: a man in a lounger with a board stuck in the
          sand beside him, and no more of either than the shape. They are
          between us and a sun on the horizon, so what reaches the camera is an
          outline and the two shadows it lays down the beach.

          The geometry is a projection of a chaise, a man and a board built in
          metres, seen from four metres behind his left shoulder and a metre
          above the sand — which is what puts his head over the top of the back,
          his knees up the seat, and the whole chair receding to the left. He is
          facing the way the chair points, which is out and away from us.

          The limbs and the chair's legs are round strokes rather than paths:
          one silhouette in one colour has no edges to give away, so a stroke
          and a fill are the same mark, and a limb is far cheaper as a line. The
          widths are the projected diameters, which is why they all differ.
        */}
        <div className="figures">
          <svg className="lounger" viewBox="0 0 374 362">
            <defs>
              <radialGradient id="cast">
                <stop offset="0%" stopColor="#241c10" stopOpacity="0.5" />
                <stop offset="55%" stopColor="#241c10" stopOpacity="0.26" />
                <stop offset="100%" stopColor="#241c10" stopOpacity="0" />
              </radialGradient>
            </defs>
            {/* Both shadows run the same way, down the frame and to the right:
                away from a sun sitting at 26% of the window, which is where
                `.sun` above puts it. */}
            <g fill="url(#cast)">
              <ellipse cx="105" cy="330" rx="128" ry="30" transform="rotate(8 105 330)" />
              <ellipse cx="348" cy="314" rx="58" ry="12" transform="rotate(13 348 314)" />
            </g>
            <path d={BOARD} fill="currentColor" />
            {/* Four legs, then the seat and the back as two slabs sharing the
                hinge edge — the same two points in both, so they close into one
                shape with no join to draw. */}
            <g fill="none" stroke="currentColor" strokeLinecap="round">
              <path d="M97 304L93 356" strokeWidth="11" />
              <path d="M194 292L197 341" strokeWidth="10" />
              <path d="M12 268L10 311" strokeWidth="9" />
              <path d="M97 260L100 300" strokeWidth="9" />
            </g>
            <path d="M4 266L93 258L203 293L203 303L98 317L4 274Z" fill="currentColor" />
            <path d="M98 306L163 217L279 209L283 219L206 302L101 316Z" fill="currentColor" />
            {/* Him. The near leg is drawn up, the far one out straight — one
                bent knee is the whole difference between lying down and being
                laid out. */}
            <g fill="none" stroke="currentColor" strokeLinecap="round">
              <path d="M142 275L185 218" strokeWidth="61" />
              <path d="M118 273L66 217" strokeWidth="40" />
              <path d="M66 217L47 257" strokeWidth="29" />
              <path d="M47 257L41 244" strokeWidth="22" />
              <path d="M161 269L114 243" strokeWidth="38" />
              <path d="M114 243L72 247" strokeWidth="27" />
              <path d="M72 247L67 235" strokeWidth="20" />
              <path d="M153 229L90 270" strokeWidth="26" />
              <path d="M90 270L75 271" strokeWidth="20" />
              <path d="M210 224L186 260" strokeWidth="24" />
              <path d="M186 260L148 264" strokeWidth="19" />
            </g>
            <circle cx="214" cy="181" r="21" fill="currentColor" />
          </svg>
        </div>
        <svg className="palm palm-far" viewBox="0 0 200 160">
          <defs>
            <g id="frond" fill="currentColor">
              <path d={FROND} />
            </g>
            <path id="gull" d={GULL} fill="#2a2318" />
          </defs>
          <g className="sway">{crown(FAR)}</g>
        </svg>
        <svg className="palm palm-far r" viewBox="0 0 200 160">
          {/* Mirrored inside the viewBox rather than with `scaleX(-1)` on the
              element: the element's own transform is the dolly, and it has to
              scale about the vanishing point, which a flip would move. */}
          <g transform="translate(200 0) scale(-1 1)">
            <g className="sway">{crown(FAR)}</g>
          </g>
        </svg>
        <svg className="palm palm-near" viewBox="0 0 300 200">
          <g className="sway">
            <g className="rim">{crown(NEAR, 6, 74)}</g>
            {crown(NEAR, 6, 74)}
          </g>
        </svg>
        <svg className="palm palm-near r" viewBox="0 0 300 200">
          <g transform="translate(300 0) scale(-1 1)">
            <g className="sway">
              <g className="rim">{crown(NEAR, 6, 74)}</g>
              {crown(NEAR, 6, 74)}
            </g>
          </g>
        </svg>
        <div className="vignette" />
      </div>

      <section className={leaving ? 'hero leaving' : 'hero'}>
        <title>{`${t.name} — ${t.role}`}</title>
        <meta name="description" content={t.bio} />

        <h1>{t.name}</h1>
        <p className="lede">{t.bio}</p>
        {/* A link, not a button: it goes somewhere, it has a URL, and it works
            with the JavaScript that has not loaded yet. */}
        <p>
          <Link to={world} className="enter" onClick={fly}>
            {t.enterWorld}
          </Link>
        </p>
        <p className="instead">
          <Link to={`/${locale}/work`}>{t.enterWorldAlt}</Link>
        </p>
      </section>
    </>
  )
}
