import type { CSSProperties } from 'react'
import type { Plate } from './content'
import type { Locale } from './i18n'

/**
 * Memojo's case study, staged: the index's instant camera on its table,
 * beside the prose, and the reading scroll is the app working through the
 * gallery it was handed.
 *
 * - **Before the first heading** the flash goes and twelve prints come out
 *   from under the camera and land anyhow on the table — the camera roll, a
 *   list in one direction that nobody sorted.
 * - **Search the way you actually remember** — the case study's four
 *   sentences type themselves into a search box, and the print each one
 *   finds lights up where it lies on the table.
 * - **Albums that were already there** — the prints glide into four stacks
 *   by what is in them, labelled, while the index fills.
 * - **A diary** — the stacks deal out into two rows, in the order the
 *   pictures were taken, dated.
 * - **Phone to phone** — two phones are on the table; the other prints go
 *   back to their albums, and one album goes to the first phone and across
 *   to the second, over a dashed line with nothing in the middle of it.
 * - **Private** — aeroplane mode goes on, nothing is uploaded, and the one
 *   honest caveat: it is not a backup.
 * - **What is here** — the phones go, the album comes home: the table as the
 *   index left it, sorted, with the app's facts in the box above.
 *
 * No script. Every heading of the prose is a named view timeline (`--s1`…,
 * "the study" in `index.css`), and every print is one element carrying six
 * animations — one per move, each on its own heading's timeline — that
 * *add* (`animation-composition`): a move is the difference between where the
 * print is and where it goes next, so however far the page is scrolled the
 * moves already made sum to where the print should be. What is written here
 * with no animation at all is the last act: without scroll timelines, under
 * reduced motion and with JS off, the prints lie in their four albums.
 *
 * The prints lie on a plane tilted into the photograph (`.table`), so they
 * move, turn and shrink in the table's own space; the words are this page's,
 * per locale, because the queries are the prose's own. Decoration: the prose
 * beside it says all of it in words.
 */
export function Darkroom({ plate, locale }: { plate: Plate; locale: Locale }) {
  const t = WORDS[locale]
  return (
    <figure
      className="pinned darkroom"
      aria-hidden="true"
      style={{ '--atlas': plate.photos ? `url(${plate.photos})` : 'none' } as CSSProperties}
    >
      <div className="slot">
        <div className="card search">
          <p className="field">
            <span className="glass" />
            {t.queries.map((q, j) => (
              <span key={q} className="q" style={{ '--j': j, '--n': q.length } as CSSProperties}>
                {q}
              </span>
            ))}
          </p>
          <p className="found">
            {FOUND.map((photo, j) => (
              <span key={photo} className="hit" style={{ '--j': j } as CSSProperties}>
                <span className="thumb" style={atlas(photo)} />
                {t.found}
              </span>
            ))}
          </p>
        </div>
        <div className="card index">
          <p>{t.indexing}</p>
          <p className="meter">
            <span />
          </p>
        </div>
        <div className="card diary">
          <p>{t.diary}</p>
        </div>
        <div className="card send">
          <p>{t.sending}</p>
          <p className="meter">
            <span />
          </p>
        </div>
        <div className="card private">
          <p className="plane">
            <span className="switch" />
            {t.airplane}
          </p>
          <p className="zero">{t.uploaded}</p>
          <p className="caveat">{t.backup}</p>
        </div>
        <div className="card facts">
          <p>{t.facts}</p>
          <p className="caveat">{t.backup}</p>
        </div>
      </div>

      <div className="depth">
        <div className="plate">
          {plate.base && <img src={plate.base} alt="" decoding="async" />}
          <div className="flash" />
          <div className="tabletop">
            <div className="table">
              {t.albums.map((name, a) => (
                <span key={name} className="label album" style={spot(STACK_X[a]!, STACK_Y + 150)}>
                  {name}
                </span>
              ))}
              {DIARY.map(([photo, date], k) => {
                const [x, y] = diaryAt(k)
                return (
                  <span key={photo} className="label date" style={spot(x, y + 106)}>
                    {date}
                  </span>
                )
              })}
              <span className="phone" style={spot(PHONES[0][0], PHONES[0][1])} />
              <span className="phone" style={spot(PHONES[1][0], PHONES[1][1])} />
              <span className="label os" style={spot(PHONES[0][0], PHONES[0][1] + 250)}>
                Android
              </span>
              <span className="label os" style={spot(PHONES[1][0], PHONES[1][1] + 250)}>
                iPhone
              </span>
              <span className="wifi" style={spot((PHONES[0][0] + PHONES[1][0]) / 2, PHONES[0][1])} />
              <span className="label air" style={spot((PHONES[0][0] + PHONES[1][0]) / 2, PHONES[0][1] - 70)}>
                {t.wifi}
              </span>
              {PRINTS.map((p) => (
                <span key={p.photo} className="print" style={p.style}>
                  <span className="photo" style={atlas(p.photo)} />
                  {p.query !== undefined && <span className="ring" style={{ '--q': p.query } as CSSProperties} />}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </figure>
  )
}

/**
 * The atlas is `tools/plate.py`'s `photos()`: twelve pictures, 4 × 3, the
 * case study's four sentences first — a baby laughing in the garden, a ski
 * trip with friends, dinner near the sea, red trees in an autumn forest —
 * then a dog, a birthday cake, a boat on a lake, a street at night, a beach,
 * bicycles, a snowman and a coffee. `Instant.tsx` sorts the same twelve.
 */
const atlas = (photo: number): CSSProperties => ({
  backgroundPosition: `${((photo % 4) * 100) / 3}% ${(Math.floor(photo / 4) * 100) / 2}%`,
})

/** Which photograph each query finds: the first four, in the prose's order. */
const FOUND = [0, 1, 2, 3] as const

/** People, food, outdoors, places — `Instant.tsx`'s `ALBUM`, by atlas order. */
const ALBUM = [0, 0, 1, 2, 0, 1, 2, 3, 3, 3, 2, 1] as const
/** The album that is sent across: outdoors — the trees, the lake, the snowman. */
const SENT = 2

/*
 * The table's own plane: 900 across (the plate's width at its near edge) and
 * 1650 deep, 0 at the camera and 1650 at the viewer. `index.css` tilts it.
 */
const STACK_X = [150, 350, 550, 750] as const
const STACK_Y = 470
/** Where they land out of the camera: the roll, unsorted. x, y, turn. */
const SCATTER: [number, number, number][] = [
  [180, 820, -14],
  [430, 760, 9],
  [690, 800, -20],
  [300, 1010, 24],
  [560, 980, -6],
  [790, 1060, 15],
  [150, 1200, 7],
  [420, 1230, -25],
  [660, 1250, 12],
  [250, 1420, -9],
  [520, 1440, 18],
  [760, 1400, -16],
]
/** Where they come from: the slot, under the camera, at the table's far edge. */
const SLOT: [number, number] = [450, 60]

/** The order they were taken in, and when — day and month, which reads the
 *  same in all three languages. The diary deals them out in this order. */
const DIARY: [number, string][] = [
  [10, '12.01'],
  [1, '08.02'],
  [5, '21.03'],
  [0, '04.05'],
  [4, '16.06'],
  [8, '27.07'],
  [2, '09.08'],
  [9, '02.09'],
  [6, '14.09'],
  [3, '18.10'],
  [11, '22.11'],
  [7, '20.12'],
]
const diaryAt = (k: number): [number, number] => [100 + (k % 6) * 140, k < 6 ? 880 : 1200]
const DIARY_SCALE = 0.72

const PHONES: [[number, number], [number, number]] = [
  [230, 1230],
  [670, 1230],
]
const PHONE_SCALE = 0.6

/** A place on the table, for the things that are not prints. */
const spot = (x: number, y: number): CSSProperties => ({ '--x': x, '--y': y }) as CSSProperties

const len = (v: number) => `calc(${v.toFixed(1)} * var(--u))`
const move = (dx: number, dy: number) => `${len(dx)} ${len(dy)}`

/**
 * Every print's six moves, as the differences between the places it passes
 * through. The print itself sits where it ends — in its album — and each
 * animation adds one leg of the trip; `index.css` has which heading plays
 * which leg.
 */
const PRINTS = Array.from({ length: 12 }, (_, photo) => {
  const album = ALBUM[photo]!
  const k = ALBUM.slice(0, photo).filter((a) => a === album).length
  const stack: [number, number] = [STACK_X[album]! + k * 6 - 6, STACK_Y - k * 12]
  const rest = [-5, 4, -2][k]!
  const [sx, sy, sr] = SCATTER[photo]!
  const d = DIARY.findIndex(([p]) => p === photo)
  const [dx, dy] = diaryAt(d)
  const sent = album === SENT
  const [ax, ay] = PHONES[0]
  const [bx, by] = PHONES[1]
  const onPhone = (x: number, y: number): [number, number] => [x + (k - 1) * 26, y + (k - 1) * 70]
  const [pax, pay] = onPhone(ax, ay)
  const [pbx, pby] = onPhone(bx, by)
  // Where it is on the fourth heading: its album, or the first phone.
  const [fx, fy] = sent ? [pax, pay] : stack
  const style = {
    '--x': stack[0],
    '--y': stack[1],
    '--r': `${rest}deg`,
    '--i': photo,
    '--d': d,
    '--k': k,
    // Out of the slot, onto the table.
    '--t0': move(SLOT[0] - sx, SLOT[1] - sy),
    '--r0': `${-sr}deg`,
    // Into its album.
    '--t2': move(sx - stack[0], sy - stack[1]),
    '--r2': `${sr - rest}deg`,
    // Dealt into the diary.
    '--t3': move(dx - stack[0], dy - stack[1]),
    '--r3': `${-rest}deg`,
    '--s3': DIARY_SCALE,
    // Home to its album, or onto the first phone.
    '--t4': move(fx - dx, fy - dy),
    '--r4': sent ? '0deg' : `${rest}deg`,
    '--s4': sent ? PHONE_SCALE / DIARY_SCALE : 1 / DIARY_SCALE,
    // Across to the second phone.
    '--t5': sent ? move(pbx - pax, pby - pay) : move(0, 0),
    // And home.
    '--t6': sent ? move(stack[0] - pbx, stack[1] - pby) : move(0, 0),
    '--r6': sent ? `${rest}deg` : '0deg',
    '--s6': sent ? 1 / PHONE_SCALE : 1,
  } as CSSProperties
  return { photo, style, query: photo < 4 ? photo : undefined }
})

type Words = {
  /** The case study's own four sentences, as its prose has them. */
  queries: readonly [string, string, string, string]
  found: string
  indexing: string
  albums: readonly [string, string, string, string]
  diary: string
  sending: string
  wifi: string
  airplane: string
  uploaded: string
  backup: string
  facts: string
}

/**
 * What the stage says, per locale. Not UI chrome — the queries are the
 * prose's own lines — so it lives beside the stage rather than in
 * `src/i18n`. French and Dutch are unreviewed, like the prose they follow.
 */
const WORDS: Record<Locale, Words> = {
  en: {
    queries: ['baby laughing in the garden', 'ski trip with friends', 'dinner near the sea', 'red trees in autumn forest'],
    found: '1 of 11,000 photos',
    indexing: 'Indexing on the phone · while it charges',
    albums: ['People', 'Food', 'Outdoors', 'Places'],
    diary: 'Diary · in the order you took them',
    sending: '“Outdoors” → the other phone · 3 photos',
    wifi: 'local Wi-Fi · no server',
    airplane: 'Aeroplane mode',
    uploaded: '↑ 0 bytes uploaded',
    backup: 'Not a backup',
    facts: 'Free · Android and iPhone · no account',
  },
  fr: {
    queries: ['bébé qui rit dans le jardin', 'séjour au ski entre amis', 'dîner au bord de la mer', "arbres rouges dans une forêt d'automne"],
    found: '1 sur 11 000 photos',
    indexing: 'Indexation sur le téléphone · pendant la charge',
    albums: ['Personnes', 'Repas', 'Plein air', 'Lieux'],
    diary: 'Journal · dans l’ordre où vous les avez prises',
    sending: '« Plein air » → l’autre téléphone · 3 photos',
    wifi: 'Wi-Fi local · aucun serveur',
    airplane: 'Mode avion',
    uploaded: '↑ 0 octet envoyé',
    backup: 'Pas une sauvegarde',
    facts: 'Gratuit · Android et iPhone · sans compte',
  },
  nl: {
    queries: ['baby die lacht in de tuin', 'skireis met vrienden', 'diner aan zee', 'rode bomen in een herfstbos'],
    found: '1 van 11.000 foto’s',
    indexing: 'Indexeren op de telefoon · tijdens het laden',
    albums: ['Mensen', 'Eten', 'Buiten', 'Plekken'],
    diary: 'Dagboek · in de volgorde waarin je ze nam',
    sending: '“Buiten” → de andere telefoon · 3 foto’s',
    wifi: 'lokale wifi · geen server',
    airplane: 'Vliegtuigmodus',
    uploaded: '↑ 0 bytes geüpload',
    backup: 'Geen back-up',
    facts: 'Gratis · Android en iPhone · geen account',
  },
}
