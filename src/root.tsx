import { useLayoutEffect, type ReactNode } from 'react'
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from 'react-router'
import { STRINGS, canonicalPath, localeOf } from './i18n'
import { WorldGate } from './WorldGate'
import stylesheet from './index.css?url'

export const links = () => [
  { rel: 'stylesheet', href: stylesheet },
  { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
]

export function Layout({ children }: { children: ReactNode }) {
  const pathname = canonicalPath(useLocation().pathname)
  const locale = localeOf(pathname) ?? 'en'
  // The landing page borrows the world's layout — full viewport, pinned chrome,
  // no scroll — and paints the ocean the world renders. The class is written
  // here rather than toggled in an effect the way `.world` is, because it has
  // to be in the prerendered document: `/{lang}` is the ocean with JavaScript
  // off (invariant 4), and a class that arrives after hydration would flash the
  // flat page's background first.
  const landing = pathname === `/${locale}`
  return (
    <html lang={locale} className={landing ? 'landing' : undefined}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body>
        {/* Invariant 3: the one <Canvas> in the site lives inside this, above
            every route, and navigation never unmounts it. */}
        <WorldGate>{children}</WorldGate>
        <Reflow />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

/**
 * Lays the new page out before `ScrollRestoration` scrolls it — its sibling
 * before it, so its layout effect runs first. Without it, every case study
 * Firefox opened from the index arrived at its bottom, though the router's
 * `scrollTo(0, 0)` was made and landed on 0. A console snippet that read
 * `scrollY` before the call made the bug go away, and this is that read. The
 * likely story: Firefox takes the call against the index it has not laid out
 * again yet, which snaps (`index.css`), then re-snaps the case study to the
 * one snap point it still has, the footer's end. Chrome showed none of it.
 */
function Reflow() {
  const { key } = useLocation()
  useLayoutEffect(() => {
    void document.documentElement.scrollHeight
  }, [key])
  return null
}

export default function Root() {
  return <Outlet />
}

/** Only reachable for a path the router cannot match at all — nginx serves the
 *  prerendered 404 for real bad URLs. Kept plain on purpose. */
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
