import type { CSSProperties } from 'react'
import type { Plate } from './content'
import type { Locale } from './i18n'
import { Still, H, W } from './Switchboard'
import { PLATE, onSheet, sheetMatrix } from './tablo'

/**
 * Tablo's description, staged: the index's board and its sheet beside the
 * prose, and the sheet filled in act by act as the page is read — the way a
 * job goes, from the house to the file.
 *
 * - **Before the first heading**, the plate as the index shows it: the board
 *   on the wall and a blank sheet under it.
 * - **On site** — the plan: the walls, the rooms' names, then every point,
 *   tagged.
 * - **The board, in a photo** — a scan runs down the board, and the label
 *   strips fill in, device by device.
 * - **One model, two drawings** — the single-line diagram draws itself off
 *   the same points: A1 on the plan is A1 on the diagram. All of it but the
 *   bathroom's RCD.
 * - **The checks** — which is what the checker catches: a red ring on the
 *   bathroom, *30 mA required*. The 30 mA RCD draws in above its circuit, and
 *   the ring goes green.
 * - **What comes out** — the title block, filled.
 * - The last two are the team and the beta, in the card over the plate; the
 *   sheet is done by then.
 *
 * No script. The sheet is `Still` from the plate — the very paths the index's
 * canvas strokes, from `sheet()` in `tablo.ts` — with a class per act; the
 * board's labels, the scan and the ring are one more SVG over it. What is
 * written with no animation is the last act, so reduced motion, no scroll
 * timelines and no JS all get the finished sheet.
 */
export function Survey({ plate, locale }: { plate: Plate; locale: Locale }) {
  const t = WORDS[locale]
  const M = sheetMatrix(PLATE.sheet)
  const [fx, fy] = onSheet(2, -1.875) // the bathroom, on the plan
  const devices = PLATE.devices.filter((d) => d.kind !== 'lamp')
  const top = Math.min(...devices.map((d) => d.label[0]![1])) - 6
  const bottom = Math.max(...devices.map((d) => d.box[3])) + 6
  const left = Math.min(...devices.map((d) => d.box[0])) - 6
  const right = PLATE.board[2]
  return (
    <figure className="pinned survey" aria-hidden="true">
      <div className="slot">
        {ACTS.map((key) => (
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
          <Still locale={locale} acts />
          <svg className="marks" viewBox={`0 0 ${W} ${H}`}>
            {/* The scan, down the board. */}
            <rect className="scan" x={left} y={top} width={right - left} height={6} rx={3}
              style={{ '--run': `${bottom - top}px` } as CSSProperties} />
            {devices.map((d, n) => {
              const q = d.label
              const cx = (q[0]![0] + q[1]![0]) / 2
              const cy = (q[0]![1] + q[3]![1]) / 2
              const h = q[3]![1] - q[0]![1]
              return (
                <text key={n} className="read" x={cx} y={cy + h * 0.22} fontSize={h * 0.62} textAnchor="middle"
                  style={{ '--n': n } as CSSProperties}>
                  {LABELS[d.kind === 'main' ? 'main' : d.kind === 'rcd' ? `rcd${d.ref}` : `c${d.ref}`]}
                </text>
              )
            })}
            {/* The checker's ring on the bathroom, red and then green. */}
            <g transform={`matrix(${M.join(' ')})`}>
              <circle className="flag" cx={fx} cy={fy} r={28} />
              <circle className="ok" cx={fx} cy={fy} r={28} />
              <path className="ok tick" d={`M${fx + 16} ${fy - 30}l5 5 10-11`} />
              <text className="flag note" x={fx + 31} y={fy - 22} textAnchor="end">30 mA</text>
            </g>
          </svg>
        </div>
      </div>
    </figure>
  )
}

const ACTS = ['survey', 'photo', 'model', 'check', 'out', 'team', 'end'] as const
type Words = Record<(typeof ACTS)[number], readonly string[]>

const LABELS: Record<string, string> = { main: 'Q1', rcd0: '300 mA', rcd1: '30 mA', c0: 'A', c1: 'B', c2: 'C', c3: 'D' }

/** French first, as the prose is; Dutch and English follow it and are
 *  unreviewed like the rest of the page's translations. */
const WORDS: Record<Locale, Words> = {
  fr: {
    survey: ['Sur place : les pièces, puis les points', 'séjour · cuisine · chambre · salle de bain — 9 points, 4 circuits'],
    photo: ['Le tableau, lu sur une photo', 'Q1 général · Q2 300 mA · Q3–Q5 · Q6 30 mA · Q7 — vérifié avant d’entrer'],
    model: ['Un modèle, dessiné deux fois', 'A1, A2, A3 sur le plan sont A1, A2, A3 sur l’unifilaire'],
    check: ['R-RCD-02 · salle de bain : 30 mA requis', 'D passe derrière son propre différentiel 30 mA — conforme'],
    out: ['Le dossier : PDF · SVG · DXF', 'cartouche rempli · liste des circuits · étiquettes · devis'],
    team: ['Partagé, en lecture seule', 'pour le client et l’organisme de contrôle — en direct, ou figé à une révision'],
    end: ['tablo-app.be · bêta gratuite', 'web · Linux · macOS · Windows — iPhone et Android à venir'],
  },
  en: {
    survey: ['On site: the rooms, then the points', 'living room · kitchen · bedroom · bathroom — 9 points, 4 circuits'],
    photo: ['The board, read off a photo', 'Q1 main · Q2 300 mA · Q3–Q5 · Q6 30 mA · Q7 — checked before it goes in'],
    model: ['One model, drawn twice', 'A1, A2, A3 on the plan are A1, A2, A3 on the single-line diagram'],
    check: ['R-RCD-02 · bathroom: 30 mA required', 'D moves behind its own 30 mA RCD — conforming'],
    out: ['The file: PDF · SVG · DXF', 'title block filled · circuit list · labels · quote'],
    team: ['Shared, read-only', 'for the client and the inspection body — live, or frozen at a revision'],
    end: ['tablo-app.be · free beta', 'web · Linux · macOS · Windows — iPhone and Android to come'],
  },
  nl: {
    survey: ['Ter plaatse: de ruimtes, dan de punten', 'woonkamer · keuken · slaapkamer · badkamer — 9 punten, 4 kringen'],
    photo: ['Het bord, gelezen van een foto', 'Q1 hoofdschakelaar · Q2 300 mA · Q3–Q5 · Q6 30 mA · Q7 — nagekeken voor het erin gaat'],
    model: ['Eén model, twee keer getekend', 'A1, A2, A3 op het plan zijn A1, A2, A3 op het eendraadschema'],
    check: ['R-RCD-02 · badkamer: 30 mA vereist', 'D komt achter zijn eigen differentieel van 30 mA — conform'],
    out: ['Het dossier: pdf · SVG · DXF', 'titelblok ingevuld · kringenlijst · etiketten · offerte'],
    team: ['Gedeeld, alleen lezen', 'voor de klant en het keuringsorganisme — live, of bevroren op een revisie'],
    end: ['tablo-app.be · gratis bèta', 'web · Linux · macOS · Windows — iPhone en Android volgen'],
  },
}
