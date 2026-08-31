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
