import { useEffect, useRef, useState } from 'react'
import type { Plate } from './content'
import type { Locale } from './i18n'
import { BOARD, MOVES, POINTS, RACK, RACK_AT, TOTAL } from './scrubble'
import { ANCHORS, H, PLAYED, Still, W, clamp, drawReadout, drawTile, ease, lerp, square, standing, type Face, type Pt } from './Tiles'

/**
 * Scrubble's case study, staged: the index's board and rack beside the prose,
 * and the review the app is for, played by the reading scroll.
 *
 * - **Before the first heading**, the position as the index shows it: a
 *   mid-game board and R E T A I N S… on the rack, in the order drawn.
 * - **The problem** — the move a person finds goes down: TRAINS, 42, number
 *   23. Then the seven squares of the move that was there, outlined in gold.
 * - **What I chose** — TRAINS comes back to the rack; the anchors light, the
 *   squares any move has to touch; and the solver's two passes sweep the
 *   board, across by rows and then down by columns, while the count of legal
 *   moves climbs to 1,755.
 * - **What I rejected** — the rack shuffled through its orderings, the
 *   permutation solver the prose turns down: 5,040 of them, at every square.
 * - **What it cost** — the board cleared and entered again tile by tile, a tap
 *   and a dialog each; then its values turn French, because the tile model had
 *   to become a language's rather than a constant.
 * - **The outcome** — RETAINS: number 1, 94, PEPPERS and a fifty-point bingo.
 *
 * A script, as the sudoku's is: every letter and value is drawn, so every one
 * is right, by `Tiles.tsx`'s own `drawTile` and `drawReadout` — the same
 * position and moves from `scrubble.ts` that `scrubble.check.ts` scores
 * again. The acts follow the page: a section is read from when its heading
 * crosses `LINE` of the window to when the next does. Drawn only when the
 * scroll moves. Under reduced motion, the outcome standing; with no script,
 * the index's position (`Still`) and the outcome's card.
 */
export function Rack({ plate, locale }: { plate: Plate; locale: Locale }) {
  const figure = useRef<HTMLElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const [live, setLive] = useState(false)
  const t = WORDS[locale]

  useEffect(() => {
    const fig = figure.current
    const cv = canvas.current
    const prose = fig?.parentElement?.querySelector<HTMLElement>('.prose')
    const ctx = cv?.getContext('2d')
    const src = plate.base
    if (!fig || !cv || !prose || !ctx || !src) return
    const still = matchMedia('(prefers-reduced-motion: reduce)')
    const fmt = new Intl.NumberFormat(locale)
    const cards = new Map([...fig.querySelectorAll<HTMLElement>('.card')].map((c) => [c.dataset.card!, c]))
    const counters = new Map([...fig.querySelectorAll<HTMLElement>('[data-n]')].map((c) => [c.dataset.n!, c]))
    const base = new Image()
    base.src = src
    let ready = false
    let dead = false

    // ---- where the acts are on the page (as `Backtrack.tsx` reads it)
    const heads = [...prose.querySelectorAll<HTMLElement>(':scope > h2')]
    const end = prose.querySelector<HTMLElement>('.back') ?? prose
    const read = () => {
      const line = innerHeight * LINE
      const reach = line + (document.documentElement.scrollHeight - innerHeight - scrollY)
      const y = (e: Element) => Math.min(e.getBoundingClientRect().top, reach)
      const marks = [...heads.map(y), y(end)]
      // The first heading is often above the line before anything has been
      // scrolled; the first act starts on the first scroll, not half played.
      marks[0] = Math.max(marks[0]!, line - scrollY)
      let act = -1
      for (let k = 0; k < heads.length; k++) if (line >= marks[k]!) act = k
      if (act < 0) return { act, p: 0 }
      const [a, b] = [marks[act]!, marks[act + 1]!]
      return { act, p: b <= a ? 1 : clamp((line - a) / (b - a)) }
    }

    let k = 1
    const size = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = Math.max(1, Math.round(r.width * dpr))
      cv.height = Math.max(1, Math.round(r.height * dpr))
      k = cv.width / W
    }
    size()

    const tile = (f: Face, letter: string, lying: number, glow = 0, value?: number) =>
      drawTile(ctx, k, f, letter, lying, glow, value)
    const lip = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      const [y0, y1] = RACK_AT.lip
      ctx.drawImage(base, 0, (y0 / H) * base.naturalHeight, base.naturalWidth, ((y1 - y0) / H) * base.naturalHeight, 0, y0 * k, cv.width, (y1 - y0) * k)
    }
    const quad = (r: number, c: number, inset: number) => {
      const [tl, tr, bl] = square(r, c, inset)
      const br: Pt = [tr[0] + bl[0] - tl[0], tr[1] + bl[1] - tl[1]]
      ctx.beginPath()
      ctx.moveTo(tl[0] * k, tl[1] * k)
      ctx.lineTo(tr[0] * k, tr[1] * k)
      ctx.lineTo(br[0] * k, br[1] * k)
      ctx.lineTo(bl[0] * k, bl[1] * k)
      ctx.closePath()
    }
    /** The board's tiles: all of them, or the first `n` in the order they
     *  were entered, with French values once `fr` is over a half. */
    const board = (n = ENTERED.length, fr = 0, glow?: Set<string>) => {
      for (const [r, c] of ENTERED.slice(0, n).sort(([a, b], [x, y]) => a - x || b - y)) {
        const l = BOARD[r]![c]!
        // A tile whose French value differs takes the gold edge as it turns.
        const french = fr > 0.5 && FRENCH[l] !== undefined && FRENCH[l] !== POINTS[l]
        tile(square(r, c, 0.06, 0.2), l, 1, glow?.has(`${r},${c}`) || french ? 1 : 0, fr > 0.5 ? FRENCH[l] : undefined)
      }
    }
    /** Move `i` of `MOVES` in play: 0 its tiles on the rack, 1 on the board,
     *  staggered, with the rest of the rack standing. */
    const moveOut = (i: number, u: number, glow = 0) => {
      const placed = PLAYED[i]!
      const flight = placed.map((_, j) => ease(u * (1 + 0.12 * (placed.length - 1)) - 0.12 * j))
      const off = new Set(placed.filter((_, j) => flight[j]! > 0).map((p) => p.slot))
      for (let s = 0; s < 7; s++) if (!off.has(s)) tile(standing(s), RACK[s]!, 0)
      lip()
      placed.forEach((p, j) => {
        const f = flight[j]!
        if (f <= 0) return
        const arc = Math.sin(Math.PI * f) * 70
        tile(
          lerp(standing(p.slot), square(p.r, p.c, 0.06, 0.2), f).map(([x, y]) => [x, y - arc]) as Face,
          p.letter,
          f,
          f >= 1 ? glow : 0,
        )
      })
    }
    const rack = () => {
      for (let s = 0; s < 7; s++) tile(standing(s), RACK[s]!, 0)
      lip()
    }

    let card = 'outcome'
    const show = (name: string) => {
      if (name === card) return
      cards.get(card)?.removeAttribute('data-on')
      cards.get(name)?.setAttribute('data-on', '')
      card = name
    }
    const count = (name: string, n: number) => {
      const el = counters.get(name)
      const s = fmt.format(n)
      if (el && el.textContent !== s) el.textContent = s
    }

    const draw = () => {
      if (!ready) return
      const { act, p } = still.matches ? { act: 4, p: 1 } : read()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.globalAlpha = 1
      if (act < 0) {
        show('outcome')
        board()
        rack()
      } else if (act === 0) {
        // TRAINS, the one a person finds; then the squares of the one that
        // was there.
        show('problem')
        board()
        moveOut(TRAINS, clamp(p / 0.4))
        const shown = clamp((p - 0.4) / 0.08)
        if (shown > 0) drawReadout(ctx, k, MOVES[TRAINS]!, Math.round(MOVES[TRAINS]!.score * ease((p - 0.4) / 0.12)), shown)
        const ghost = clamp((p - 0.6) / 0.15)
        if (ghost > 0) {
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.globalAlpha = ghost
          ctx.strokeStyle = '#e9a851'
          ctx.shadowColor = '#e9a851'
          ctx.shadowBlur = 10 * k
          ctx.lineWidth = 2.4 * k
          ctx.setLineDash([5 * k, 4 * k])
          for (const q of PLAYED[BEST]!) {
            quad(q.r, q.c, 0.1)
            ctx.stroke()
          }
          ctx.setLineDash([])
          ctx.shadowBlur = 0
          ctx.globalAlpha = 1
        }
      } else if (act === 1) {
        // Back to the rack; the anchors; two passes; the count.
        show('chose')
        board()
        moveOut(TRAINS, 1 - clamp(p / 0.12))
        const anchors = clamp((p - 0.12) / 0.1)
        ctx.setTransform(1, 0, 0, 1, 0, 0)
        ctx.fillStyle = '#e9a851'
        ctx.globalAlpha = 0.3 * anchors
        for (const [r, c] of ANCHORS) {
          quad(r, c, 0.12)
          ctx.fill()
        }
        const sweep = clamp((p - 0.24) / 0.66)
        count('found', Math.round(TOTAL * sweep))
        if (sweep > 0 && sweep < 1) {
          // Across by rows for the first half, down by columns for the second.
          const across = sweep < 0.5
          const at = (across ? sweep * 2 : sweep * 2 - 1) * 15
          const line = Math.min(Math.floor(at), 14)
          ctx.globalAlpha = 0.22
          ctx.fillStyle = '#8fd0ff'
          for (let n = 0; n < 15; n++) {
            quad(across ? line : n, across ? n : line, 0.02)
            ctx.fill()
          }
        }
        ctx.globalAlpha = 1
      } else if (act === 2) {
        // The rack through its orderings: 5,040 of them, every one tried at
        // every square — shown as the tiles changing places.
        show('rejected')
        board()
        const u = p * SHUFFLES.length
        const a = SHUFFLES[Math.min(Math.floor(u), SHUFFLES.length - 1)]!
        const b = SHUFFLES[Math.min(Math.floor(u) + 1, SHUFFLES.length - 1)]!
        const f = ease((u % 1) * 1.4)
        count('orders', Math.round(5040 * p))
        for (let j = 0; j < 7; j++) {
          const lift = Math.sin(Math.PI * f) * 34
          const face = lerp(standing(a[j]!), standing(b[j]!), f).map(([x, y]) => [x, y - lift]) as Face
          tile(face, RACK[j]!, 0)
        }
        lip()
      } else if (act === 3) {
        // Entered again, a tap and a dialog a tile; then French values.
        show('cost')
        const n = Math.round(ENTERED.length * clamp((p - 0.06) / 0.6))
        count('taps', n)
        board(n, clamp((p - 0.74) / 0.12))
        if (n > 0 && n < ENTERED.length) {
          const [r, c] = ENTERED[n - 1]!
          ctx.setTransform(1, 0, 0, 1, 0, 0)
          ctx.strokeStyle = '#e9a851'
          ctx.lineWidth = 3 * k
          quad(r, c, -0.06)
          ctx.stroke()
        }
        rack()
      } else {
        // RETAINS.
        show('outcome')
        board()
        const u = clamp(p / 0.45)
        moveOut(BEST, u, clamp((p - 0.45) / 0.1))
        const shown = clamp((p - 0.45) / 0.08)
        if (shown > 0) drawReadout(ctx, k, MOVES[BEST]!, Math.round(MOVES[BEST]!.score * ease((p - 0.45) / 0.2)), shown)
      }
    }

    let raf = 0
    const kick = () => {
      if (!raf && !dead) raf = requestAnimationFrame(() => ((raf = 0), draw()))
    }
    base
      .decode()
      .then(() => {
        if (dead) return
        ready = true
        setLive(true)
        kick()
      })
      .catch(() => {})
    const ro = new ResizeObserver(() => {
      size()
      kick()
    })
    ro.observe(cv)
    addEventListener('scroll', kick, { passive: true })
    addEventListener('resize', kick)
    still.addEventListener('change', kick)
    return () => {
      dead = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      removeEventListener('scroll', kick)
      removeEventListener('resize', kick)
      still.removeEventListener('change', kick)
    }
  }, [plate, locale])

  return (
    <figure className="pinned rackstage" aria-hidden="true" ref={figure}>
      <div className="slot">
        {(Object.keys(t) as (keyof Words)[]).map((key) => (
          <div key={key} className="card" data-card={key} data-on={key === 'outcome' ? '' : undefined}>
            {t[key].map((line, n) => (
              <p key={n} className={n ? 'sub' : undefined}>
                {line.split(/\{(\w+)\}/).map((part, j) => (j % 2 ? <b key={j} data-n={part}>0</b> : part))}
              </p>
            ))}
          </div>
        ))}
      </div>
      <div className="depth">
        <div className="plate">
          {plate.base && <img src={plate.base} alt="" decoding="async" />}
          {!live && <Still />}
          <canvas ref={canvas} className="tiles" />
        </div>
      </div>
    </figure>
  )
}

/** Where on the window a section counts as being read. */
const LINE = 0.6

const TRAINS = MOVES.findIndex((m) => m.word === 'TRAINS')
const BEST = MOVES.findIndex((m) => m.rank === 1)

/** The board's tiles in the order they are entered again — the way a person
 *  sets up a position, word by word as they were played, rather than row by
 *  row. */
const ENTERED: [number, number][] = (() => {
  const words: [number, number, number, 'A' | 'D'][] = [
    [7, 6, 4, 'A'], // HAZY
    [6, 7, 5, 'D'], // PAPER
    [10, 5, 5, 'A'], // SCREW
    [10, 9, 4, 'D'], // WASP
    [13, 7, 6, 'A'], // PEPPER
    [10, 5, 5, 'D'], // SCORE
    [5, 9, 3, 'D'], // FRY
    [14, 1, 5, 'A'], // GLAZE
    [6, 9, 4, 'A'], // RAFT
  ]
  const seen = new Set<string>()
  const out: [number, number][] = []
  for (const [r0, c0, n, d] of words)
    for (let i = 0; i < n; i++) {
      const [r, c] = d === 'A' ? [r0, c0 + i] : [r0 + i, c0]
      if (BOARD[r]![c] === '.' || seen.has(`${r},${c}`)) continue
      seen.add(`${r},${c}`)
      out.push([r, c])
    }
  // Anything the list above missed still gets entered, last.
  for (let r = 0; r < 15; r++)
    for (let c = 0; c < 15; c++) if (BOARD[r]![c] !== '.' && !seen.has(`${r},${c}`)) out.push([r, c])
  return out
})()

/** French Scrabble's values, where they differ from English — the reason the
 *  tile model became language-dependent. */
const FRENCH: Record<string, number> = { M: 2, K: 10, W: 10, X: 10, Y: 10, Z: 10, Q: 8, J: 8 }

/** Slots for the rack's seven letters, ordering after ordering: the first is
 *  the rack as drawn, the last back where it started. Fixed, so the same
 *  scroll shows the same shuffle. */
const SHUFFLES: number[][] = (() => {
  let s = 11
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  const out = [[0, 1, 2, 3, 4, 5, 6]]
  for (let n = 0; n < 14; n++) {
    const next = [...out[out.length - 1]!]
    for (let i = 6; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[next[i], next[j]] = [next[j]!, next[i]!]
    }
    out.push(next)
  }
  out.push([0, 1, 2, 3, 4, 5, 6])
  return out
})()

type Words = Record<'problem' | 'chose' | 'rejected' | 'cost' | 'outcome', readonly [string, string]>

/** French and Dutch are unreviewed, like the prose they follow. */
const WORDS: Record<Locale, Words> = {
  en: {
    problem: ['You played TRAINS, for 42', 'the move that was there scores 94'],
    chose: ['Anchors, cross-checks, a trie — across, then down', '{found} of 1,755 legal moves'],
    rejected: ['Rejected: every permutation of the rack, at every square', 'ordering {orders} of 5,040 — a trie stops at the first dead prefix'],
    cost: ['Entering a position: one tap and one dialog a tile', 'tile {taps} of 33 · and French values: K, W, X, Y, Z are 10'],
    outcome: ['RETAINS · #1 of 1,755 · 94', 'works on five platforms, in two languages — not shipped'],
  },
  fr: {
    problem: ['Vous avez joué TRAINS, pour 42', 'le coup qui était là vaut 94'],
    chose: ['Ancres, contrôles croisés, un trie — en ligne, puis en colonne', '{found} coups légaux sur 1 755'],
    rejected: ['Écarté : toutes les permutations du chevalet, à chaque case', 'ordre {orders} sur 5 040 — un trie s’arrête au premier préfixe mort'],
    cost: ['Saisir une position : un tap et une boîte de dialogue par tuile', 'tuile {taps} sur 33 · et les valeurs françaises : K, W, X, Y, Z valent 10'],
    outcome: ['RETAINS · n° 1 sur 1 755 · 94', 'fonctionne sur cinq plateformes, en deux langues — pas publié'],
  },
  nl: {
    problem: ['Je speelde TRAINS, voor 42', 'de zet die er lag is 94 waard'],
    chose: ['Ankers, kruiscontroles, een trie — horizontaal, dan verticaal', '{found} van 1.755 geldige zetten'],
    rejected: ['Afgewezen: elke permutatie van het rekje, op elk vakje', 'volgorde {orders} van 5.040 — een trie stopt bij het eerste dode prefix'],
    cost: ['Een stelling invoeren: één tik en één dialoog per steen', 'steen {taps} van 33 · en Franse waarden: K, W, X, Y, Z zijn 10'],
    outcome: ['RETAINS · #1 van 1.755 · 94', 'werkt op vijf platformen, in twee talen — niet uitgebracht'],
  },
}

