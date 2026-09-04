/** Locale lives in the route. No i18n library — see CLAUDE.md. */
export const LOCALES = ['en', 'fr', 'nl'] as const

export type Locale = (typeof LOCALES)[number]

/** English is the source of truth for content and for every structural field. */
export const SOURCE_LOCALE = 'en' satisfies Locale

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  nl: 'Nederlands',
}

export function isLocale(value: string | undefined): value is Locale {
  return LOCALES.includes(value as Locale)
}

/** First path segment, when it is a locale. `/fr/work` -> `fr`. */
export function localeOf(pathname: string): Locale | null {
  const first = pathname.split('/')[1]
  return isLocale(first) ? first : null
}

/** Prerendering renders `/en/work/` — the URL people get has no trailing
 *  slash, and a canonical that disagrees with it is a canonical worth nothing. */
export function canonicalPath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/'
}

/** Same page, other locale. `/fr/work/scrubble` + `nl` -> `/nl/work/scrubble`. */
export function withLocale(pathname: string, locale: Locale): string {
  const rest = pathname.split('/').slice(2).join('/')
  return rest ? `/${locale}/${rest}` : `/${locale}`
}

/**
 * Where the world is allowed to show through: `/{lang}/world`, and a case study
 * reached by flying to it or by deep link. Everything else — the landing page
 * at `/{lang}`, the flat index the skip link points at, the 404 — is a still
 * surface with nothing moving behind it.
 *
 * `?read` is the way out, and it is a query rather than client state so that it
 * survives a reload, a share and the back button. The flat index links carry
 * it, and so does the panel's "read the case study": choosing to read never
 * leaves a scene running behind the prose.
 */
export function isWorldPath(pathname: string, search = ''): boolean {
  if (new URLSearchParams(search).has('read')) return false
  const [, lang, section, slug, ...rest] = canonicalPath(pathname).split('/')
  if (!isLocale(lang) || rest.length) return false
  return (section === 'world' && !slug) || (section === 'work' && !!slug)
}

/** The case study a world path is showing, if it is showing one. */
export function slugOf(pathname: string): string | null {
  const [, lang, section, slug] = canonicalPath(pathname).split('/')
  return isLocale(lang) && section === 'work' && slug ? slug : null
}
