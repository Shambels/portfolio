import { Link, useOutletContext } from 'react-router'
import { STRINGS, type Locale } from '../i18n'

/**
 * The landing page. `/{lang}` is the world seen from a standstill — the same
 * sky and the same water, drawn as a gradient sampled from a rendered frame
 * (`.landing` in `index.css`) — and one button into `/{lang}/world`, which is
 * where the canvas mounts.
 *
 * Nothing here asks what the visitor's hardware can do. The page is CSS, so the
 * ocean arrives with no WebGL, with no JavaScript and before the scene chunk
 * has been requested; and the button leads to a route that is a complete page
 * without a renderer. The second link is not a fallback — it is the way past
 * the world for someone who came to read.
 */
export default function Home() {
  const locale = useOutletContext<Locale>()
  const t = STRINGS[locale]

  return (
    <section className="hero">
      <title>{`${t.name} — ${t.role}`}</title>
      <meta name="description" content={t.bio} />

      <h1>{t.name}</h1>
      <p className="lede">{t.bio}</p>
      {/* A link, not a button: it goes somewhere, it has a URL, and it works
          with the JavaScript that has not loaded yet. */}
      <p>
        <Link to={`/${locale}/world`} className="enter">
          {t.enterWorld}
        </Link>
      </p>
      <p className="instead">
        <Link to={`/${locale}/work`}>{t.enterWorldAlt}</Link>
      </p>
    </section>
  )
}
