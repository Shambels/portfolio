import type { ReactNode } from 'react'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from 'react-router'
import { STRINGS, localeOf } from './i18n'
import stylesheet from './index.css?url'

export const links = () => [
  { rel: 'stylesheet', href: stylesheet },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
]

export function Layout({ children }: { children: ReactNode }) {
  const locale = localeOf(useLocation().pathname) ?? 'en'
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function Root() {
  return <Outlet />
}

/** Only reachable for a path the router cannot match at all — Cloudflare serves
 *  the prerendered 404 for real bad URLs. Kept plain on purpose. */
export function ErrorBoundary() {
  const t = STRINGS[localeOf(useLocation().pathname) ?? 'en']
  return (
    <main id="content">
      <meta name="robots" content="noindex" />
      <h1>{t.notFoundTitle}</h1>
      <p>{t.notFoundBody}</p>
      <p>
        <a href="/en/work">{t.backToWork}</a>
      </p>
    </main>
  )
}
