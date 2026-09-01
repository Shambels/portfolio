import {
  Suspense, createContext, lazy, useCallback, useContext, useEffect, useRef, useState,
  type ReactNode,
} from 'react'
import { useLocation, useNavigate } from 'react-router'
import { SOURCE_LOCALE, STRINGS, isWorldPath, localeOf, slugOf } from './i18n'

/** Invariant 3 and the bundle budget in one line: the canvas is a chunk that is
 *  fetched the first time a route wants it, and after that it never unmounts. */
const Scene = lazy(() => import('./Scene'))

const WorldContext = createContext(false)

/** True when the scene is showing behind this route. A route reads it to decide
 *  whether it is a page or a panel — it never asks whether WebGL exists. */
export const useWorld = () => useContext(WorldContext)

let capable: boolean | undefined

/**
 * Invariant 4: no renderer, no canvas — and the Phase 2 site, which is a
 * complete site, is what is left. A coarse pointer gets the same treatment,
 * because touch is Phase 6 and a world you cannot steer is worse than none.
 */
function canRenderWorld(): boolean {
  if (capable !== undefined) return capable
  if (!window.matchMedia('(pointer: fine)').matches) return (capable = false)
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
  useEffect(() => setDetected(canRenderWorld()), [])

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
    return () => document.documentElement.classList.remove('world')
  }, [active])

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
      // — a cold deep link is the usual case — and home replaces it instead.
      const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0
      const back = pushed.current && idx > 0
      pushed.current = false
      if (back) navigate(-1)
      else navigate(`/${locale}`, { replace: true })
    },
    [locale, navigate],
  )

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

  return (
    <WorldContext.Provider value={active}>
      {mounted && (
        // Decorative by construction: every word in the world is in the DOM
        // beside it (invariant 2), so there is nothing here for a screen reader
        // to lose, and nothing focusable to sit in front of the skip link.
        <div className={active ? 'stage' : 'stage off'} aria-hidden="true">
          <Suspense fallback={null}>
            <Scene
              active={active}
              slug={slug}
              debug={debug}
              onNear={onNear}
              onBackend={setBackend}
            />
          </Suspense>
        </div>
      )}

      {children}

      {active && (
        <p className="hud">
          {STRINGS[locale].worldControls}
          {debug && ` · ${backend}${fps ? ` · ${fps}` : ''}`}
        </p>
      )}
    </WorldContext.Provider>
  )
}
