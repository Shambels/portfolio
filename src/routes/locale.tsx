import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router'
import { CONTACT, LOCALES, SITE_URL, SOURCE_LOCALE, STRINGS, canonicalPath, isLocale, withLocale } from '../i18n'
import NotFound from './not-found'

/**
 * The chrome every page shares, and the only place the locale is validated.
 * Children read it with `useOutletContext<Locale>()` rather than re-checking.
 */
export default function LocaleLayout() {
  const { lang } = useParams()
  const pathname = canonicalPath(useLocation().pathname)
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

      <a className="skip" href="#content">
        {t.skipToContent}
      </a>

      <header className="bar">
        <Link to={`/${lang}`} className="wordmark">
          {t.name}
        </Link>
        <nav aria-label={t.navWork}>
          <NavLink to={`/${lang}/work`}>{t.navWork}</NavLink>
        </nav>
        <nav aria-label={t.languages} className="langs">
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
        </nav>
      </header>

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
