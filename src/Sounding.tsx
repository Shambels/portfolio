import type { CSSProperties } from 'react'
import type { Plate } from './content'
import { Iceberg, PIVOT } from './Iceberg'

/**
 * PolarSense's case study, staged: the index's iceberg beside the prose, and
 * the reading scroll takes a sounding of it.
 *
 * The logo is a bar chart of columns, a little of it above the line and most
 * of it under — and a parquet file keeps its schema in the footer, at the
 * *end*. So the line goes straight down past every row group to the lowest
 * tip of the berg, the footer lights, and the column names come back up to
 * the surface and into the editor's completion list. Nothing on the way down
 * is read, which is the whole product.
 *
 * Five acts, one per heading of the case study, and no script: every heading
 * of the prose is a named view timeline (`--s1`…`--s5`, `index.css`, "the
 * study"), and each act here plays as its heading rises from the foot of the
 * window to the middle of it — then holds while the section is read, and runs
 * backwards when it is scrolled back up.
 *
 * 1. The problem — the editor, and autocomplete stopped at the quote mark.
 *    This one is on the page's own first scroll rather than its heading,
 *    which is already in the window when the page opens: the page opens on
 *    the plate as the index showed it, and the editor comes in as you start.
 * 2. What I chose — the sounding, the footer, the names rising, the list full.
 * 3. What I rejected — a kernel starting up, struck through; it stays for
 *    the whole section and goes when the next heading comes.
 * 4. What it cost — a column that is a guess, and the preview's caveat.
 * 5. The outcome — the file grows to four million rows; what is read does not.
 *
 * What is written here is the last act's picture, so without scroll-driven
 * animations (Firefox, still), with `prefers-reduced-motion`, and with JS off
 * the stage is simply the outcome. The iceberg is `Iceberg.tsx`, the index's
 * own, still stirred by the cursor; whatever is fixed to the ice rides its
 * roll and heave off the `--ang` and `--bob` it publishes. Decoration: the
 * prose beside it says all of this in words.
 */
export function Sounding({ plate }: { plate: Plate }) {
  const ride = {
    transformOrigin: `${PIVOT[0] * 900}px ${PIVOT[1] * 1162}px`,
  } as CSSProperties
  return (
    <figure className="pinned sounding" aria-hidden="true">
      <div className="editor">
        <code className="code">
          df.filter(pl.col(<span className="str">"re</span>
          <span className="caret" />
        </code>
        <div className="pop">
          <p className="none">No suggestions</p>
          <div className="list">
            <div>
              {COLUMNS.map(([name, ty], i) => (
                <p key={name} className={i ? 'row' : 'row hi'} style={{ '--i': i } as CSSProperties}>
                  <span>{name}</span>
                  <span className="ty">{ty}</span>
                </p>
              ))}
              <div className="more">
                <div>
                  <p className="row guess">
                    <span>…pivot</span>
                    <span className="ty">guess</span>
                  </p>
                </div>
              </div>
              <p className="src">
                <span>sales.parquet ·</span>
                <span className="rows">
                  {ROWS.map((n, i) => (
                    <span key={n} className={`n n${i}`}>
                      {n}
                    </span>
                  ))}
                </span>
                <span>rows · footer only</span>
                <span className="caveat">transforms not applied</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="depth">
        <div className="plate">
          {plate.light && <img className="light" src={plate.light} alt="" decoding="async" />}
          <Iceberg on plate={plate} />
          <svg className="sonar" viewBox="0 0 900 1162">
            {/* Fixed to the ice: rocks with it. */}
            <g className="ride" style={ride}>
              <text className="unread" x="52" y="990">
                row groups
              </text>
              <text className="unread" x="52" y="1026">
                never read
              </text>
              <path className="line" d="M452 470V1022" pathLength={1} />
              <path className="lead" d="M452 1008l-9 14 9 14 9-14z" />
              <g className="footer">
                <rect x="406" y="1030" width="92" height="64" rx="14" />
                <path d="M512 1036h8v24h-8M512 1066h8v24h-8" />
                <text x="532" y="1056">
                  footer
                </text>
                <text className="fine" x="532" y="1088">
                  2 byte ranges
                </text>
              </g>
            </g>
            {/* Loose in the water: the names coming up. */}
            {COLUMNS.map(([name], i) => (
              <text key={name} className="rise" x={432 + i * 20} y="1004" style={{ '--i': i } as CSSProperties}>
                {name}
              </text>
            ))}
          </svg>
          <div className="kernel">
            <div>
              <code>$ python -c "import polars as pl; …"</code>
              <code>starting kernel…</code>
              <code className="no">runs nothing</code>
            </div>
          </div>
        </div>
      </div>
    </figure>
  )
}

/** The case study's own illustrative `sales.parquet`, as the index's
 *  signature has it — nothing here is read from a real schema. */
const COLUMNS = [
  ['region', 'str'],
  ['revenue', 'f64'],
  ['returned', 'bool'],
] as const

/** The last act's count, in the steps it takes to get there. */
const ROWS = ['200', '40,000', '400,000', '4,000,000'] as const
