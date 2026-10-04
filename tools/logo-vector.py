"""The site's mark as geometry: `src/assets/logo/logo-vector.svg`, from numbers.

    python3 tools/logo-vector.py     # stdlib only

A candidate, not yet the mark: `tools/logo.py` and the webps it writes are
still what the site draws. This one is the same figure redrawn rather than
keyed off a JPEG, and what it changes is written here rather than left to be
found by comparing the two:

- **Exact geometry.** The generated source was close to a system and drifted
  off it by a few units — bands from 138 to 144 wide, rounded ends a little
  under half a band. Here every band is `W`, every diagonal 45 degrees, both
  ends true half-circles of `W / 2`, and the gap between the two strokes is
  `G` everywhere it occurs: under the bar and either side of the crossing.
- **Opaque.** `logo.py`'s colour-to-alpha read the source as cyan laid over
  its charcoal ground at about 85% — so the master was translucent all over
  and the page showed through it. The see-through look is now drawn: the
  fold and the crossing are lit faces, the back of the fold a shaded one.
- **One gradient**, cyan at the top-left to blue at the foot, under both
  strokes, instead of a gradient per face; light and shade are tinted
  layers on it (white goes milky over blue and black turns it grey).
- **Each stroke is one silhouette**, so no two shapes of the same fill abut
  and leave a hairline; the faces are laid on top of them.

Same 512 x 686 frame as the master, so it can stand in for it unchanged.

Each shape carries a class — `top` and `stem`, the two silhouettes; `fold`,
`over` and `back`, the faces on them — because the title's slide on /work
(`src/Mark.tsx`) reads its geometry out of this file rather than keeping a
copy, and lights each face on its own. Rename one and that breaks.
"""
import math
W, G = 140, 36
L, T, B = 14, 12, 672          # left, top, bottom of the drawing
X1 = 356                       # the crease's top end; the strip is X1..X1+W
X2 = X1 + W
r = W / 2
k = W * math.sqrt(2)           # a 45-degree band's width along x + y
# Stroke A: the bar, the fold, the strip, the band down to its end.
uA = X2 + (T + W)              # upper edge of band A: x + y = uA (through the strip's top-right)
lA = uA + k
aA = (uA + lA) / 2
# Stroke B: the stem, and the band up to its end.
uB = L + 385                   # upper edge of band B: x + y = uB
lB = uB + k
aB = (uB + lB) / 2
# Its rounded end sits G below the bar, on its own axis.
cBy = T + W + G + r
cB = (aB - cBy, cBy)
# A's end sits on its axis, G clear of band B — any point on the axis is, so
# it goes where the original had it.
cAy = 445
cA = (aA - cAy, cAy)
n = 1 / math.sqrt(2)
def P(*pts): return ' '.join(f'{x:g},{y:g}' for x, y in pts)
f = lambda v: float(f'{v:.2f}')
lA = f(lA); lB = f(lB)
tA_lo = (f(cA[0] + r*n), f(cA[1] + r*n)); tA_up = (f(cA[0] - r*n), f(cA[1] - r*n))
tB_up = (f(cB[0] - r*n), f(cB[1] - r*n)); tB_lo = (f(cB[0] + r*n), f(cB[1] + r*n))

bar = P((L, T), (X1, T), (X1, T + W), (L, T + W))
fold = P((X1, T), (X2, T + W), (X1, T + W))
back = P((X1, T + W), (X2, T + W), (X1, uA - X1))
bandA = f'M{X2},{T+W} L{X2},{lA-X2} L{tA_lo[0]},{tA_lo[1]} A{r},{r} 0 0 1 {tA_up[0]},{tA_up[1]} Z'
stem = P((L, B), (L + W, B), (L + W, lB - L - W), (L, lB - L))
over = P((L, uB - L), (L + W, uB - L - W), (L + W, lB - L - W), (L, lB - L))
bandB = f'M{L+W},{uB-L-W} L{tB_up[0]},{tB_up[1]} A{r},{r} 0 0 1 {tB_lo[0]},{tB_lo[1]} L{L+W},{lB-L-W} Z'

silA = (f'M{L},{T} L{X1},{T} L{X2},{T+W} L{X2},{lA-X2} L{tA_lo[0]},{tA_lo[1]} '
        f'A{r:g},{r:g} 0 0 1 {tA_up[0]},{tA_up[1]} L{X1},{uA-X1} L{X1},{T+W} L{L},{T+W} Z')
silB = (f'M{L},{B} L{L+W},{B} L{L+W},{f(lB-L-W)} L{tB_lo[0]},{tB_lo[1]} '
        f'A{r:g},{r:g} 0 0 0 {tB_up[0]},{tB_up[1]} L{L},{uB-L} Z')
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 686">
  <!-- The mark, redrawn as geometry (see tools/logo-vector.py). Every band
       {W} wide, every diagonal 45 degrees, both ends half-circles, a {G}-unit
       gap between the two strokes, everything opaque. One gradient under
       all of it; the fold and the crossing lit, the back of the fold shaded. -->
  <defs>
    <linearGradient id="g" gradientUnits="userSpaceOnUse" x1="120" y1="{T}" x2="330" y2="{B}">
      <stop offset="0" stop-color="#36eedc"/>
      <stop offset=".55" stop-color="#1cc4e0"/>
      <stop offset="1" stop-color="#087ee0"/>
    </linearGradient>
  </defs>
  <!-- Each stroke is one silhouette, so no two shapes of the same fill
       abut and leave a hairline between them; the faces are laid on top. -->
  <path class="top" fill="url(#g)" d="{silA}"/>
  <path class="stem" fill="url(#g)" d="{silB}"/>
  <!-- Light and shade are tinted, not white and black: white over the blue
       end goes milky, and black turns every blue grey. -->
  <polygon class="fold" fill="#b4fff4" fill-opacity=".34" points="{fold}"/>
  <polygon class="over" fill="#9dfaf0" fill-opacity=".2" points="{over}"/>
  <polygon class="back" fill="#00496e" fill-opacity=".38" points="{back}"/>
</svg>
'''
from pathlib import Path
out = Path(__file__).resolve().parent.parent / 'src/assets/logo/logo-vector.svg'
out.write_text(svg)
print(out, len(svg), 'bytes')
