"""Every legal move on Scrubble's stage position, ranked — the numbers
`src/scrubble.ts` shows, found the way Scrubble finds them.

    curl -LO https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
    python3 tools/moves.py enable1.txt

ENABLE is the public-domain tournament word list (172,823 words); it is not
kept here, because nothing on the site reads it. This is brute force rather
than Appel & Jacobson — every line, every span that touches a tile, every word
of that length that fits the letters already there and the rack, then every
cross-word it makes checked against the list — because it runs once, on one
board, in five seconds, and the thing it has to be is obviously right.
Scoring is the game's: premiums count only under new tiles, every cross-word
scores, fifty for all seven. `src/scrubble.check.ts` scores the four moves the
stage plays again, in TypeScript, and the two agree.
"""

import collections
import re
import sys

BOARD = [
    '...............',
    '...............',
    '...............',
    '...............',
    '...............',
    '.........F.....',
    '.......P.RAFT..',
    '......HAZY.....',
    '.......P.......',
    '.......E.......',
    '.....SCREW.....',
    '.....C...A.....',
    '.....O...S.....',
    '.....R.PEPPER..',
    '.GLAZE.........',
]
RACK = 'RETAINS'
PTS = dict(zip('ABCDEFGHIJKLMNOPQRSTUVWXYZ', [1, 3, 3, 2, 1, 4, 2, 4, 1, 8, 5, 1, 3, 1, 1, 3, 10, 1, 1, 1, 1, 4, 4, 8, 4, 10]))


def premium(r, c):
    R, C = min(r, 14 - r), min(c, 14 - c)
    a, b = sorted((R, C))
    if a == 0 and b in (0, 7): return ('W', 3)
    if (a == b and 1 <= a <= 4) or (a, b) == (7, 7): return ('W', 2)
    if (a, b) in ((1, 5), (5, 5)): return ('L', 3)
    if (a, b) in ((0, 3), (2, 6), (3, 7), (6, 6)): return ('L', 2)
    return None


def main(path):
    words = [w.strip().upper() for w in open(path) if w.strip()]
    lexicon = set(words)
    joined = collections.defaultdict(list)
    for w in words:
        if len(w) <= 15: joined[len(w)].append(w)
    joined = {n: '\n'.join(v) + '\n' for n, v in joined.items()}
    B = [[ch if ch != '.' else None for ch in row] for row in BOARD]

    def score(cells, new):
        s, mult = 0, 1
        for (r, c), ch in cells:
            v = PTS[ch]
            p = premium(r, c) if (r, c) in new else None
            if p and p[0] == 'L': v *= p[1]
            if p and p[0] == 'W': mult *= p[1]
            s += v
        return s * mult

    def cross(r, c, ch, d):
        dr, dc = (1, 0) if d == 'A' else (0, 1)
        a, b = r, c
        while a - dr >= 0 and b - dc >= 0 and B[a - dr][b - dc]: a, b = a - dr, b - dc
        cells = []
        while a < 15 and b < 15 and (B[a][b] or (a, b) == (r, c)):
            cells.append(((a, b), ch if (a, b) == (r, c) else B[a][b])); a, b = a + dr, b + dc
        return cells if len(cells) > 1 else None

    rack = collections.Counter(RACK)
    out = []
    for d in 'AD':
        for line in range(15):
            cells = [(line, i) if d == 'A' else (i, line) for i in range(15)]
            L = [B[r][c] for r, c in cells]
            for s in range(15):
                if s and L[s - 1]: continue
                for e in range(s + 2, 16):
                    if e < 15 and L[e]: continue
                    span = L[s:e]
                    empty = [i for i, x in enumerate(span) if not x]
                    if not empty or len(empty) > 7: continue
                    touching = any(span) or any(
                        0 <= r + dr < 15 and 0 <= c + dc < 15 and B[r + dr][c + dc]
                        for i in empty for r, c in [cells[s + i]]
                        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                    if not touching: continue
                    pat = ''.join(x or '.' for x in span)
                    for w in re.findall('^' + pat + '$', joined.get(len(pat), ''), re.M):
                        need = collections.Counter(w[i] for i in empty)
                        if any(need[k] > rack[k] for k in need): continue
                        new = {cells[s + i] for i in empty}
                        total = score([(cells[s + i], w[i]) for i in range(len(w))], new)
                        ok = True
                        for i in empty:
                            r, c = cells[s + i]
                            cw = cross(r, c, w[i], d)
                            if cw:
                                if ''.join(ch for _, ch in cw) not in lexicon: ok = False; break
                                total += score(cw, {(r, c)})
                        if not ok: continue
                        out.append((total + (50 if len(empty) == 7 else 0), w, cells[s], d))
    out.sort(key=lambda m: -m[0])
    print(len(out), 'legal moves')
    for m in out[:25]:
        rank = 1 + sum(1 for o in out if o[0] > m[0])
        print(f'#{rank:<3} {m[0]:>3}  {m[1]:<10} {m[2]} {m[3]}')
    for w in ('NITRATES', 'AIRSCREWS', 'TRAINS'):
        m = next(o for o in out if o[1] == w)
        print(f'#{1 + sum(1 for o in out if o[0] > m[0]):<3} {m[0]:>3}  {w}')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'enable1.txt')
