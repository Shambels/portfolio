/**
 * No test framework (CLAUDE.md). Locale path juggling is the one bit of Phase 2
 * logic that is not obvious by reading, so it leaves a check behind.
 *
 *   node src/i18n/locales.check.ts
 */
import assert from 'node:assert/strict'
import { canonicalPath, isLocale, isWorldPath, localeOf, slugOf, withLocale } from './locales.ts'

assert.equal(isLocale('fr'), true)
assert.equal(isLocale('de'), false)
assert.equal(isLocale(undefined), false)

assert.equal(localeOf('/fr'), 'fr')
assert.equal(localeOf('/fr/work/scrubble'), 'fr')
assert.equal(localeOf('/world'), null)
assert.equal(localeOf('/'), null)

// The language switcher: same page, other locale, root included.
assert.equal(withLocale('/fr/work/scrubble', 'nl'), '/nl/work/scrubble')
assert.equal(withLocale('/fr', 'en'), '/en')
assert.equal(withLocale('/en/work', 'fr'), '/fr/work')
// hreflang for every prerendered path must round-trip through itself.
for (const p of ['/en', '/en/work', '/en/work/polarsense', '/en/404']) {
  assert.equal(withLocale(p, 'en'), p)
}

assert.equal(canonicalPath('/en/work/'), '/en/work')
assert.equal(canonicalPath('/en/'), '/en')
assert.equal(canonicalPath('/'), '/')
assert.equal(canonicalPath('/en/work'), '/en/work')

// Which routes the world shows behind. Phase 3's one piece of routing that is
// not obvious by reading: get it wrong in the permissive direction and the flat
// index has a scene running behind it; wrong the other way and flying into a
// landmark closes the panel it just opened.
assert.equal(isWorldPath('/en'), true)
assert.equal(isWorldPath('/nl/'), true)
assert.equal(isWorldPath('/fr/work/scrubble'), true)
assert.equal(isWorldPath('/en/work'), false) // the flat index the skip link points at
assert.equal(isWorldPath('/en/404'), false)
assert.equal(isWorldPath('/en/work/a/b'), false)
assert.equal(isWorldPath('/de'), false)
assert.equal(isWorldPath('/'), false)
assert.equal(isWorldPath('/world'), false) // retired in Phase 3, and not a locale anyway

// `?read` is the way out, from any world path and only from a world path.
assert.equal(isWorldPath('/en/work/scrubble', '?read'), false)
assert.equal(isWorldPath('/en/work/scrubble', '?read=1&debug'), false)
assert.equal(isWorldPath('/en', '?read'), false)
assert.equal(isWorldPath('/en/work/scrubble', '?debug'), true)
assert.equal(isWorldPath('/en/work/scrubble', ''), true)

assert.equal(slugOf('/en/work/scrubble'), 'scrubble')
assert.equal(slugOf('/fr/work/scrubble/'), 'scrubble')
assert.equal(slugOf('/en/work'), null)
assert.equal(slugOf('/en'), null)
assert.equal(slugOf('/de/work/scrubble'), null)

console.log('locales: ok')
