import { Link, Outlet, useLocation, useParams } from 'react-router'
import { CONTACT, LOCALES, SITE_URL, SOURCE_LOCALE, STRINGS, canonicalPath, isLocale, withLocale } from '../i18n'
import { Menu } from '../Menu'
import { useWorld } from '../WorldGate'
import NotFound from './not-found'

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
          <a href={CONTACT.github} rel="me noreferrer">
            GitHub
          </a>
        </p>
        <p className="fine">{t.footerNote}</p>
      </footer>
    </>
  )
}
