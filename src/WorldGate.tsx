import {
  Suspense, createContext, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { SOURCE_LOCALE, STRINGS, isWorldPath, localeOf, slugOf } from './i18n'

/** Invariant 3 and the bundle budget in one line: the canvas is a chunk that is
 *  fetched the first time a route wants it, and after that it never unmounts. */
const Scene = lazy(() => import('./Scene'))

/** The world's index, and the reason `/{lang}/world` no longer shows its panel.
 *  Its own chunk, for the same reason the canvas is one: the flat site never
 *  needs it. */
const MiniMap = lazy(() => import('./MiniMap'))

/** Which hull the visitor is steering. Declared here rather than in `Ship`
 *  because the menu is what sets it and the menu is in the first-route chunk —
 *  a value import from anything inside the canvas would drag the canvas in
 *  with it. `Ship` imports it back as a type, which compiles to nothing. */
export type ShipModel = 'saucer' | 'boat' | 'surfer'

/**
 * Which sea the world is on. Two states and not a dial: `calm` is the chop this
 * world has always had, and `agitated` is that same chop with a train of
 * rollers under it — taller than the ship, far apart, and made of real
 * displaced geometry rather than a normal (`Scenery`).
 *
 * Declared here for the same reason `ShipModel` is: the menu sets it, the menu
 * is in the first-route chunk, and a value import from anything inside the
 * canvas would drag the canvas in with it.
 */
export type Sea = 'calm' | 'agitated'

/** What the chrome above the routes needs to know about the world: whether it
 *  is showing, and the three settings it has. */
export type World = {
  active: boolean
  sound: boolean
  toggleSound: () => void
  model: ShipModel
  setModel: (model: ShipModel) => void
  sea: Sea
  setSea: (sea: Sea) => void
}

const WorldContext = createContext<World>({
  active: false, sound: false, toggleSound: () => {}, model: 'surfer', setModel: () => {},
  sea: 'agitated', setSea: () => {},
})

/** Where the two remembered choices live. Namespaced, because this origin is
 *  the whole site and one day something else will want a key. */
const MODEL_KEY = 'pinchs.ship'
const SEA_KEY = 'pinchs.sea'

/** `active` is true when the scene is showing behind this route — a route reads
 *  it to decide whether it is a page or a panel, and never asks whether WebGL
 *  exists. `sound` rides along because the menu that toggles it is chrome, and
 *  chrome is rendered by the layout, not by the world. */
export const useWorld = () => useContext(WorldContext)

let capable: boolean | undefined

/**
 * Invariant 4: no renderer, no canvas — and the Phase 2 site, which is a
 * complete site, is what is left.
 *
 * A coarse pointer used to fail here too, because touch could not steer. Phase
 * 6 gave it a thumb stick (`src/stick.ts`), so the renderer is the only
 * question left and a phone is asked exactly what a laptop is.
 */
function canRenderWorld(): boolean {
  if (capable !== undefined) return capable
  // WebGL2, not `navigator.gpu`, even though `WebGPURenderer` prefers WebGPU:
  // the property existing is not the adapter working, and three's own fallback
  // when it does not is WebGL2. So the honest question is the one three ends up
  // asking. Every browser shipping WebGPU ships WebGL2 too.
  const gl = document.createElement('canvas').getContext('webgl2')
  gl?.getExtension('WEBGL_lose_context')?.loseContext() // probing is not a reason to hold a context
  return (capable = !!gl)
}

export function WorldGate({ children }: { children: ReactNode }) {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()

  // Detected after mount, never during prerender: the server has no GPU and no
  // opinion about the visitor's pointer.
  const [detected, setDetected] = useState(false)
  // Which controls the HUD names. Not the mount test — that is the renderer's
  // question above — and not a width either: a coarse pointer is exactly the
  // visitor whose fingers the hint is about.
  const [touch, setTouch] = useState(false)
  // Unlike the sound below, this one is remembered: nothing in the platform
  // refuses to give a returning visitor the hull they picked. Read in the same
  // effect as the rest of the after-mount detection, and before the canvas can
  // mount — `active` needs `detected`, which is set here — so there is no frame
  // of the wrong ship to see.
  const [model, setModel] = useState<ShipModel>('surfer')
  // And the weather, for the same reason: a visitor who left the sea running and
  // came back to a millpond would have to go and find the setting again. Sound
  // is the one setting that cannot be remembered, and the note beside it says
  // why.
  const [sea, setSea] = useState<Sea>('agitated')
  useEffect(() => {
    setDetected(canRenderWorld())
    setTouch(window.matchMedia('(pointer: coarse)').matches)
    // Reading it can throw outright where site data is blocked by policy, and
    // this effect is also what decides whether there is a world at all.
    try {
      const stored = localStorage.getItem(MODEL_KEY)
      // Named rather than cast: this is a string from the visitor's own disk,
      // and an old or hand-edited one must not become a `ShipModel` the switch
      // below has no case for.
      if (stored === 'saucer' || stored === 'boat') setModel(stored)
      // Anything else — nothing stored, or the number an earlier version of
      // this site wrote here when the setting was a slider — is the default
      // sea, which is the agitated one.
      if (localStorage.getItem(SEA_KEY) === 'calm') setSea('calm')
    } catch { /* no stored answer is a fine answer */ }
  }, [])

  const chooseModel = useCallback((m: ShipModel) => {
    setModel(m)
    try {
      localStorage.setItem(MODEL_KEY, m)
    } catch { /* as above: the setting still works, it just does not last */ }
  }, [])

  const chooseSea = useCallback((v: Sea) => {
    setSea(v)
    try {
      localStorage.setItem(SEA_KEY, v)
    } catch { /* as above */ }
  }, [])

  const active = detected && isWorldPath(pathname, search)
  const locale = localeOf(pathname) ?? SOURCE_LOCALE
  const slug = active ? slugOf(pathname) : null
  const debug = new URLSearchParams(search).has('debug')

  // Sticky. Routes with no world hide the canvas and stop its frame loop; they
  // do not unmount it, so flying, altitude and camera survive a round trip
  // through the flat index.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { if (active) setMounted(true) }, [active])

  useEffect(() => {
    document.documentElement.classList.toggle('world', active)
    // Roaming: the world is showing and no landmark is open, which is the one
    // state with no panel — the map is the index there. A class rather than a
    // branch inside the route, so the prerendered document, the visitor with
    // JavaScript off and the one with no renderer all still get the whole page.
    document.documentElement.classList.toggle('roam', active && !slug)
    return () => document.documentElement.classList.remove('world', 'roam')
  }, [active, slug])

  const pushed = useRef(false)
  const onNear = useCallback(
    (hit: string | null) => {
      if (hit) {
        pushed.current = true
        navigate(`/${locale}/work/${hit}`)
        return
      }
      // Walking away pops back, so a lap of the world does not leave a history
      // of panels behind it. `idx` is React Router's own history cursor: if it
      // is missing, or this is the first entry, there is nothing of ours to pop
      // — a cold deep link is the usual case — and `/{lang}/world` replaces it
      // instead. Not `/{lang}`: that is the landing page now, and flying away
      // from a landmark is not a reason to leave the world.
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
      const back = pushed.current && idx > 0
      pushed.current = false
      if (back) navigate(-1)
      else navigate(`/${locale}/world`, { replace: true })
    },
    [locale, navigate],
  )

  // Off every time the site is loaded, and deliberately not remembered: a
  // returning visitor cannot be given sound before they have clicked anything —
  // the autoplay policy would refuse it — so a stored "on" would only ever be a
  // toggle that lies about its own state.
  const [sound, setSound] = useState(false)

  const [backend, setBackend] = useState('detecting…')
  const [fps, setFps] = useState('')
  useEffect(() => {
    if (!debug || !mounted) return
    let frames = 0
    let last = performance.now()
    let raf = requestAnimationFrame(function tick() {
      frames++
      const now = performance.now()
      if (now - last >= 500) {
        setFps(`${Math.round((frames * 1000) / (now - last))} fps`)
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [debug, mounted])

  const world = useMemo<World>(
    () => ({
      active, sound, toggleSound: () => setSound((s) => !s),
      model, setModel: chooseModel, sea, setSea: chooseSea,
    }),
    [active, sound, model, chooseModel, sea, chooseSea],
  )

  return (
    <WorldContext.Provider value={world}>
      {mounted && (
        // Decorative by construction: every word in the world is in the DOM
        // beside it (invariant 2), so there is nothing here for a screen reader
        // to lose, and nothing focusable to sit in front of the skip link.
        <div className={active ? 'stage' : 'stage off'} aria-hidden="true">
          <Suspense fallback={null}>
            <Scene
              active={active}
              model={model}
              sea={sea}
              slug={slug}
              debug={debug}
              sound={sound}
              onNear={onNear}
              onBackend={setBackend}
            />
          </Suspense>
        </div>
      )}

      {children}

      {/* Names the controls, and nothing more — the sound moved into the menu,
          so the world has no focusable element of its own and this line eats no
          pointer events at all. */}
      {/* Bottom right, and the only focusable thing the world puts on the
          screen: a top view with a letter per project and the ship's arrow on
          it. Invariant 5 — with the panel gone, these letters are the keyboard
          path to a landmark, and the menu's work index is the other one.

          Up at a landmark too, which is what the panel moving to the left
          bought: a column down one side and a map in the other corner no longer
          want the same space. Where the panel is a sheet instead — a narrow
          window, and touch — one rule in `index.css` hides it. */}
      {active && (
        <Suspense fallback={null}>
          <MiniMap locale={locale} slug={slug} />
        </Suspense>
      )}

      {active && (
        <p className="hud">
          {/* Six sentences: two per craft, because neither floating craft has a
              rise and the phone has no shift. Naming a key that does nothing is
              worse than a shorter hint. */}
          {model === 'saucer'
            ? touch ? STRINGS[locale].worldControlsTouch : STRINGS[locale].worldControls
            : model === 'boat'
              ? touch ? STRINGS[locale].worldControlsBoatTouch : STRINGS[locale].worldControlsBoat
              : touch ? STRINGS[locale].worldControlsSurferTouch : STRINGS[locale].worldControlsSurfer}
          {debug && ` · ${backend}${fps ? ` · ${fps}` : ''}`}
        </p>
      )}
    </WorldContext.Provider>
  )
}
