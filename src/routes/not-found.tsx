import { Link, useParams } from 'react-router'
import { STRINGS, isLocale } from '../i18n'

/** Prerendered at `/{lang}/404`; `npm run build` copies the English one to
 *  `404.html`, which is what Cloudflare Pages serves for an unmatched path. */
export default function NotFound() {
  const { lang } = useParams()
  const locale = isLocale(lang) ? lang : 'en'
  const t = STRINGS[locale]

  return (
    <section className="intro">
      <title>{`${t.notFoundTitle} — ${t.name}`}</title>
      <meta name="robots" content="noindex" />
      <h1>{t.notFoundTitle}</h1>
      <p className="lede">{t.notFoundBody}</p>
      <p>
        <Link to={`/${locale}/work`}>{t.backToWork}</Link>
      </p>
    </section>
  )
}
