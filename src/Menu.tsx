import { useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router'
import { LOCALES, SOURCE_LOCALE, STRINGS, canonicalPath, localeOf, withLocale } from './i18n'
import { type ShipModel, useWorld } from './WorldGate'

/**
 * The site's only top chrome, on every route: one square in the top right, and
 * everything the header used to carry behind it — home, the work index, the
 * three languages, and the world's sound when there is a world to hear.
 *
 * `<details>`, not a button and a piece of state. The disclosure is the
 * platform's, so it opens, closes, and takes the keyboard with JavaScript off —
 * which is the only reason the language switcher still works there (invariant
 * 4). The two effects add what the element does not do by itself: Escape, and a
 * click somewhere else.
 *
 * It is rendered by the locale layout, straight after the skip link, which is
 * where the header was and what keeps the skip link first in the tab order
 * (invariant 5). The sound comes from `useWorld()` rather than from props: it
 * is the world's one setting, and the menu is the only thing that touches it.
 */
export function Menu() {
  const { active: world, sound, toggleSound, model, setModel } = useWorld()
  const pathname = canonicalPath(useLocation().pathname)
  const lang = localeOf(pathname) ?? SOURCE_LOCALE
  const t = STRINGS[lang]
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !el.open) return
      el.open = false
      el.querySelector('summary')?.focus() // Escape must not lose the keyboard
    }
    const away = (e: PointerEvent) => {
      if (el.open && e.target instanceof Node && !el.contains(e.target)) el.open = false
    }
    window.addEventListener('keydown', key)
    window.addEventListener('pointerdown', away)
    return () => {
      window.removeEventListener('keydown', key)
      window.removeEventListener('pointerdown', away)
    }
  }, [])

  // A link in here navigates without unmounting anything, so closing the menu
  // is this one line rather than a handler on each of the six links.
  useEffect(() => { if (ref.current) ref.current.open = false }, [pathname])

  const here = (path: string) => (pathname === path ? 'page' : undefined)

  return (
    <details className="menu" ref={ref}>
      {/* The label is the word, not the two glyphs: `aria-label` names the
          control, and the locale code beside the lines is there so the language
          switcher is not invisible now that it is behind a click. */}
      <summary aria-label={t.menu}>
        <span aria-hidden="true">{lang.toUpperCase()}</span>
      </summary>

      <nav aria-label={t.menu}>
        <Link to={`/${lang}`} aria-current={here(`/${lang}`)}>
          {t.navHome}
        </Link>
        <Link to={`/${lang}/work`} aria-current={here(`/${lang}/work`)}>
          {t.navWork}
        </Link>

        <p className="label">{t.languages}</p>
        <p className="langs">
          {LOCALES.map((l) =>
            l === lang ? (
              <span key={l} aria-current="true">
                {l.toUpperCase()}
              </span>
            ) : (
              <Link key={l} to={withLocale(pathname, l)} hrefLang={l}>
                {l.toUpperCase()}
              </Link>
            ),
          )}
        </p>

        {/* The world's two settings. A native `<select>` rather than a pair of
            radios or a second toggle: two options today, and a list that grows
            costs nothing here, while the keyboard, the screen reader and the
            phone's own picker all come with it.

            Off every time the site is loaded (see `WorldGate`) is the sound, and
            the click that turns it on is the gesture the autoplay policy is
            waiting for — which works here exactly as it did in the HUD. */}
        {world && (
          <>
            <p className="label" id="menu-craft">
              {t.model}
            </p>
            <select
              className="craft"
              aria-labelledby="menu-craft"
              value={model}
              onChange={(e) => setModel(e.target.value as ShipModel)}
            >
              <option value="saucer">{t.modelSaucer}</option>
              <option value="boat">{t.modelBoat}</option>
            </select>

            <button type="button" className="sound" aria-pressed={sound} onClick={toggleSound}>
              {t.sound}
            </button>
          </>
        )}
      </nav>
    </details>
  )
}
