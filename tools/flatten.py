"""
The anime look's repaint (`ANIME`, `src/device.ts`): a model's own
basecolour texture reduced to a handful of flat colours, on the same UVs.

    python3 tools/flatten.py

Writes `src/models/{surfer,surfboard,pirate_ship}.flat.png` from the
textures inside their glb files. `Ship.tsx` swaps one in for the model's
own texture in the anime look — the mesh, the rig and every clip stay as
they are, which was Seb's call: repaint first, regenerate only if the
repaint still looks out of place.

How: k-means on the texture's colours (a 40k-pixel sample, so it is quick
and repeatable — fixed seed), every texel snapped to its nearest centre,
then a mode filter over the labels, which removes the speckle that a
generated texture's baked shading leaves and turns it into regions with
edges. Saved as an indexed PNG, which a dozen colours compress to almost
nothing.

Pillow and numpy, nothing else.
"""
import io
import json
import os
import struct

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, '..', 'src', 'models')

# name: (colours, output size). The rider gets the most colours: his face is
# drawn into the texture (the fourth pass), and fewer than fourteen loses it.
#
# The size is the source's own for the rider: his texture is an atlas of
# hundreds of small islands, skin beside wetsuit, and anything smaller or a
# wider filter lets one bleed into the other along every seam.
JOBS = {
    'surfer': (14, 2048, 3),
    'surfboard': (8, 512, 5),
    'pirate_ship': (12, 1024, 5),
}


def basecolour(glb_path):
    b = open(glb_path, 'rb').read()
    length = struct.unpack('<I', b[12:16])[0]
    gltf = json.loads(b[20:20 + length])
    binary = 20 + length + 8
    image = gltf['images'][0]
    view = gltf['bufferViews'][image['bufferView']]
    start = binary + view.get('byteOffset', 0)
    return Image.open(io.BytesIO(b[start:start + view['byteLength']])).convert('RGB')


def kmeans(x, k, iterations=20, seed=0):
    rng = np.random.default_rng(seed)
    centres = x[rng.choice(len(x), k, replace=False)].copy()
    for _ in range(iterations):
        label = ((x[:, None, :] - centres[None]) ** 2).sum(-1).argmin(1)
        for i in range(k):
            members = x[label == i]
            if len(members):
                centres[i] = members.mean(0)
    return centres


def flatten(name, k, size, kernel):
    image = basecolour(os.path.join(MODELS, f'{name}.glb')).resize((size, size), Image.LANCZOS)
    pixels = np.asarray(image).reshape(-1, 3).astype(np.float32)
    sample = pixels[np.random.default_rng(1).choice(len(pixels), 40000, replace=False)]
    centres = kmeans(sample, k)
    labels = np.empty(len(pixels), np.int32)
    for s in range(0, len(pixels), 200000):
        labels[s:s + 200000] = ((pixels[s:s + 200000, None, :] - centres[None]) ** 2).sum(-1).argmin(1)
    regions = Image.fromarray(labels.reshape(size, size).astype(np.uint8), 'L').filter(ImageFilter.ModeFilter(kernel))
    flat = Image.fromarray(centres.astype(np.uint8)[np.asarray(regions)], 'RGB')
    out = os.path.join(MODELS, f'{name}.flat.png')
    flat.quantize(colors=k, method=Image.Quantize.MEDIANCUT).save(out, optimize=True)
    print(f'{name}: {k} colours, {size}², {os.path.getsize(out) // 1024} kB')


if __name__ == '__main__':
    for name, (k, size, kernel) in JOBS.items():
        flatten(name, k, size, kernel)
