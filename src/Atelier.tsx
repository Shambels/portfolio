import type { CSSProperties } from 'react'
import type { Plate } from './content'
import { CORNERS } from './easel'
import type { Locale } from './i18n'

/**
 * Arts by Sandra's case study, staged: the index's easel beside the prose,
 * and the case study's own argument painted onto its canvas. Three businesses
 * arriving three ways in three languages, funnelled into one form — as three
 * strokes of paint from three corners that run together into one.
 *
 * - **Before the first heading**, the canvas as the index shows it: primed,
 *   with its underdrawing.
 * - **The problem** — three strokes start from three corners, cadmium red,
 *   cadmium yellow and ultramarine: classes, artworks, the studio. Beside
 *   each, the question it keeps bringing, in the language it arrives in. They
 *   do not meet.
 * - **What I chose** — they run on and meet, and from where they meet one
 *   broad stroke — the form — sweeps down the canvas. Wherever paint has
 *   been, the painting under the drawing shows through: the strokes are
 *   windows into `painting.avif`, the same painting the index's easel models
 *   its paint by.
 * - **What I rejected** — two more strokes, viridian and umber, a shop and a
 *   booking calendar, laid down and wiped off.
 * - **What it cost** — "content to complete", pinned to the canvas over a
 *   placeholder hatch: the structure finished, the content not.
 * - **The outcome** — the notes come off. The painting where the funnel ran,
 *   the drawing everywhere else — which is where the project honestly is.
 *
 * No script. The strokes are one SVG over the canvas (`CORNERS` in
 * `easel.ts`, its bounding box — the lean is a few pixels), each drawn in
 * twice: in a mask over the painting, and in colour on top while it is wet.
 * Each stroke's two legs are two animations on two headings' timelines that
 * add (`animation-composition`), as Memojo's prints do. What is written with
 * no animation is the last act, so reduced motion, no scroll timelines and no
 * JS all get the outcome, standing.
 */
export function Atelier({ plate, locale }: { plate: Plate; locale: Locale }) {
  const t = WORDS[locale]
  const xs = CORNERS.map((p) => p[0])
  const ys = CORNERS.map((p) => p[1])
  const box: CSSProperties = {
    left: `${Math.min(...xs) * 100}%`,
    top: `${Math.min(...ys) * 100}%`,
    width: `${(Math.max(...xs) - Math.min(...xs)) * 100}%`,
    height: `${(Math.max(...ys) - Math.min(...ys)) * 100}%`,
  }
  return (
    <figure className="pinned atelier" aria-hidden="true">
      <div className="slot">
        {(['problem', 'chose', 'rejected', 'cost', 'outcome'] as const).map((key) => (
          <div key={key} className={`card ${key}`}>
            {t[key].map((line, n) => (
              <p key={n} className={n ? 'sub' : undefined}>
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>

      <div className="depth">
        <div className="plate">
          {plate.base && <img src={plate.base} alt="" decoding="async" />}
          {plate.sketch && <img className="sketch" src={plate.sketch} alt="" decoding="async" style={box} />}
          <div className="canvas" style={box}>
            <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none">
              <defs>
                {/* Bristle: the edge of a loaded brush, not a vector's. */}
                <filter id="atelier-bristle" x="-10%" y="-10%" width="120%" height="120%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.035 0.09" numOctaves="2" seed="4" />
                  <feDisplacementMap in="SourceGraphic" scale="22" />
                </filter>
                <mask id="atelier-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width={CW} height={CH}>
                  <g filter="url(#atelier-bristle)" className="wet">
                    {STROKES.map((s) => (
                      <path key={s.key} className={`st ${s.key}`} d={s.d} pathLength={1} strokeWidth={s.w} />
                    ))}
                  </g>
                </mask>
                <pattern id="atelier-hatch" width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                  <path d="M0 0v18" />
                </pattern>
              </defs>
              {plate.painting && (
                <image href={plate.painting} width={CW} height={CH} preserveAspectRatio="none" mask="url(#atelier-reveal)" />
              )}
              {/* The same strokes, in colour while they are wet. */}
              <g filter="url(#atelier-bristle)" className="colour">
                {STROKES.filter((s) => s.paint).map((s) => (
                  <path
                    key={s.key}
                    className={`st ${s.key}`}
                    d={s.d}
                    pathLength={1}
                    strokeWidth={s.w * 0.9}
                    stroke={s.paint}
                  />
                ))}
              </g>
              {/* The two that were cut: laid down, and wiped. */}
              <g className="cut" filter="url(#atelier-bristle)">
                {CUT.map((s) => (
                  <path key={s.key} className={`st ${s.key}`} d={s.d} pathLength={1} strokeWidth={s.w} stroke={s.paint} />
                ))}
              </g>
              <rect className="hatch" width={CW} height={CH} fill="url(#atelier-hatch)" />
            </svg>
            {QUESTIONS.map((q) => (
              <p key={q.key} className={`ask ${q.key}`} lang={q.lang} style={{ left: `${q.x}%`, top: `${q.y}%`, rotate: `${q.turn}deg` }}>
                {q.text}
              </p>
            ))}
            {CUT.map((s) => (
              <p key={s.key} className={`ask cutname ${s.key}`} style={{ left: `${s.label[0]}%`, top: `${s.label[1]}%` }}>
                {t[s.key]}
              </p>
            ))}
            {NOTES.map(([x, y, turn], n) => (
              <p key={n} className="note" style={{ left: `${x}%`, top: `${y}%`, rotate: `${turn}deg`, '--n': n } as CSSProperties}>
                content to complete
              </p>
            ))}
          </div>
        </div>
      </div>
    </figure>
  )
}

/** The painting's own proportions: `painting.avif` and `sketch.avif`. */
const CW = 720
const CH = 882

/**
 * On the painting: a jug in the middle, pears and a lemon on a cloth at the
 * foot, a bottle by a window at the right. The three conversations come in
 * from three corners and meet on the table in front of the jug; the form
 * runs from there down through the pears and out at the foot.
 */
const STROKES = [
  { key: 'classes', paint: '#c21d10', w: 64, d: 'M36 58C150 120 118 250 206 320S330 400 356 470' },
  { key: 'artworks', paint: '#f1bd16', w: 64, d: 'M690 52C600 150 668 262 560 330S420 400 370 470' },
  { key: 'rental', paint: '#233199', w: 64, d: 'M40 836C150 760 96 640 196 590S320 520 352 480' },
  { key: 'form', paint: '', w: 150, d: 'M362 470C430 560 300 610 330 690S560 730 690 860' },
]

/** A shop and a booking calendar: viridian and burnt umber, and where each
 *  one's name sits, in percent of the canvas. */
const CUT = [
  { key: 'shop', paint: '#1d6a49', w: 46, d: 'M520 610C600 580 650 640 700 600', label: [74, 64] as const },
  { key: 'calendar', paint: '#5b3421', w: 46, d: 'M30 420C90 380 140 440 210 400', label: [4, 42] as const },
] as const

/** The three questions, in the three languages they arrive in — the same on
 *  every page, because that is the point: Brussels. */
const QUESTIONS = [
  { key: 'classes', lang: 'fr', text: 'Le cours du mardi, c’est à quelle heure ?', x: 3, y: 12, turn: -3 },
  { key: 'artworks', lang: 'en', text: 'Is this piece still for sale?', x: 55, y: 4, turn: 2.5 },
  { key: 'rental', lang: 'nl', text: 'Hoeveel kost het atelier per dag?', x: 6, y: 82, turn: -2 },
]

/** Where the placeholder notes are pinned: x, y in percent, and a turn. */
const NOTES: [number, number, number][] = [
  [8, 22, -4],
  [58, 38, 3],
  [10, 66, 2],
]

type Words = Record<'problem' | 'chose' | 'rejected' | 'cost' | 'outcome', readonly string[]> &
  Record<'shop' | 'calendar', string>

/** French and Dutch are unreviewed, like the prose they follow. */
const WORDS: Record<Locale, Words> = {
  en: {
    problem: ['Three businesses, the same three questions', 'by phone, by Instagram, by word of mouth — in three languages'],
    chose: ['One form, with the subject already decided', 'general · classes · studio · artwork', '/fr/cours-de-dessin · /en/drawing-classes · /nl/tekenlessen'],
    rejected: ['Cut: a site builder, a static site, a shop, a calendar', 'a sale that is a conversation stays one'],
    cost: ['A finished structure, wearing placeholder text', 'French is hers · English and Dutch need a reader'],
    outcome: ['artsbysandra.be · 6 pages × 3 locales · 18 routes', 'one form, standing in for a shop and a booking engine'],
    shop: 'a shop',
    calendar: 'a calendar',
  },
  fr: {
    problem: ['Trois activités, les trois mêmes questions', 'par téléphone, par Instagram, de bouche à oreille — en trois langues'],
    chose: ['Un seul formulaire, le sujet déjà choisi', 'général · cours · atelier · œuvre', '/fr/cours-de-dessin · /en/drawing-classes · /nl/tekenlessen'],
    rejected: ['Écartés : un constructeur de site, un site statique, une boutique, un agenda', 'une vente qui est une conversation le reste'],
    cost: ['Une structure finie, habillée de texte provisoire', 'le français est à elle · l’anglais et le néerlandais attendent un relecteur'],
    outcome: ['artsbysandra.be · 6 pages × 3 langues · 18 routes', 'un formulaire à la place d’une boutique et d’un agenda'],
    shop: 'une boutique',
    calendar: 'un agenda',
  },
  nl: {
    problem: ['Drie zaken, dezelfde drie vragen', 'via de telefoon, via Instagram, via mond-tot-mond — in drie talen'],
    chose: ['Eén formulier, met het onderwerp al gekozen', 'algemeen · lessen · atelier · kunstwerk', '/fr/cours-de-dessin · /en/drawing-classes · /nl/tekenlessen'],
    rejected: ['Geschrapt: een sitebouwer, een statische site, een winkel, een agenda', 'een verkoop die een gesprek is, blijft dat'],
    cost: ['Een afgewerkte structuur, met tijdelijke tekst', 'Frans is van haar · Engels en Nederlands wachten op een lezer'],
    outcome: ['artsbysandra.be · 6 pagina’s × 3 talen · 18 routes', 'één formulier in plaats van een winkel en een boekingssysteem'],
    shop: 'een winkel',
    calendar: 'een agenda',
  },
}
