import { Link, Outlet, useLocation, useParams } from 'react-router'
import { CONTACT, LOCALES, SITE_URL, SOURCE_LOCALE, STRINGS, canonicalPath, isLocale, withLocale } from '../i18n'
import { Menu } from '../Menu'
import { useWorld } from '../WorldGate'
import NotFound from './not-found'
import logo24 from '../assets/logo/logo-24.webp?no-inline'
import logo29 from '../assets/logo/logo-29.webp?no-inline'
import logo48 from '../assets/logo/logo-48.webp?no-inline'
import logo58 from '../assets/logo/logo-58.webp?no-inline'
import logo72 from '../assets/logo/logo-72.webp?no-inline'
import logo87 from '../assets/logo/logo-87.webp?no-inline'

/** The mark at the widths `tools/logo.py` writes — 24 and 29 CSS pixels (2rem
 *  and 2.4rem tall, `.brand` in `index.css`) at 1x, 2x and 3x; over the world
 *  it is drawn smaller, in a tile, and `sizes` says so. `?no-inline`, or Vite
 *  turns the four under 4 kB into base64 inside this chunk — the first route's —
 *  and every visitor downloads all four instead of the one their screen wants. */
const LOGO = `${logo24} 24w, ${logo29} 29w, ${logo48} 48w, ${logo58} 58w, ${logo72} 72w, ${logo87} 87w`

/**
 * The chrome every page shares, and the only place the locale is validated.
 * Children read it with `useOutletContext<Locale>()` rather than re-checking.
 */
export default function LocaleLayout() {
  const { lang } = useParams()
  const pathname = canonicalPath(useLocation().pathname)
  const { active: world, reading } = useWorld()
  if (!isLocale(lang)) return <NotFound />
  const t = STRINGS[lang]

  return (
    <>
      {/* React 19 hoists these into <head>. */}
      <link rel="canonical" href={SITE_URL + pathname} />
      {LOCALES.map((l) => (
        <link key={l} rel="alternate" hrefLang={l} href={SITE_URL + withLocale(pathname, l)} />
      ))}
      <link rel="alternate" hrefLang="x-default" href={SITE_URL + withLocale(pathname, SOURCE_LOCALE)} />

      {/* Invariant 5, first in the tab order. With the world showing there is no
          "content" further down the page to skip to — the panel is the page —
          so it goes to the flat index, which is what a visitor in a hurry
          actually wants and is a route with nothing moving behind it. */}
      {world ? (
        <Link className="skip" to={`/${lang}/work`}>
          {t.skipToContent}
        </Link>
      ) : (
        <a className="skip" href="#content">
          {t.skipToContent}
        </a>
      )}

      {/* The mark, top left, and the way back to the landing page — on the
          flat index and over the world, the two places with no other way to
          the front door but the menu. Not on a case study the world opened:
          that corner is its arrow's. Hashed and fingerprinted by Vite, so it
          caches forever and costs the first route nothing but a request. */}
      {(world || pathname === `/${lang}/work`) && (
        <Link className="brand" to={`/${lang}`} aria-label={`${t.name} — ${t.navHome}`}>
          <img
            srcSet={LOGO}
            sizes={world ? '18px' : '(min-width: 40rem) 29px, 24px'}
            src={logo29}
            alt=""
            width={29}
            height={39}
          />
        </Link>
      )}

      {/* The two ways out of a case study the world opened, and the only chrome
          on this site that exists for one state rather than for every route.
          They do the same thing and say so differently — an arrow in one corner
          of the top edge, a cross in the other.

          `replace`, not a push: `reading` is only ever set by the panel's own
          link, so the world is one entry back and returning to it should not
          leave a third. `viewTransition` runs the same animation the other way
          — the same `<main>`, the same name, the box travelling back into the
          corner it came out of. */}
      {reading && (
        <Link
          className="leave prev"
          to={`/${lang}/work/${reading}`}
          replace
          viewTransition
          aria-label={t.backToWorld}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path
              d="M13 8H3.5m0 0L8 3.5M3.5 8 8 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
      )}

      {/* What is left of the header, and second in the tab order where the
          header was: one button in the top right, and the wordmark's link, the
          work index, the languages and the world's sound behind it. The row
          around it is what lets the cross stand beside the square without
          either of them being told how wide the other one is. */}
      <div className="topbar">
        {reading && (
          <Link
            className="leave"
            to={`/${lang}/work/${reading}`}
            replace
            viewTransition
            aria-label={t.closeStudy}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path
                d="M4 4 12 12M12 4 4 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Link>
        )}
        <Menu />
      </div>

      <main id="content">
        <Outlet context={lang} />
      </main>

      <footer className="bar foot">
        <p>
          <strong>{t.name}</strong> — {t.role}
        </p>
        <p className="contact">
          <a href={`mailto:${CONTACT.email}`}>{CONTACT.email}</a>
          <a href={CONTACT.github} target="_blank" rel="me noreferrer">
            GitHub
          </a>
        </p>
      </footer>
    </>
  )
}
