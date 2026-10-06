"""
The anime look's repaint: a model's own basecolour texture reduced to a
handful of flat colours, on the same UVs, written back into the model.

    python3 tools/flatten.py

Rewrites `src/models/{surfer,surfboard,pirate_ship}.glb` in place: the
generator's JPEG out, a small indexed PNG of the same texture in flat fills
in. The mesh, the rig and every clip stay byte for byte as they were, which
was Seb's call: repaint first, regenerate only if the repaint still looks
out of place.

Run it after `tools/surfer.py` or `tools/pirate_ship.py`, which write the
glb with the generator's texture. Run twice, it flattens a texture that is
already flat, which changes nothing that matters.

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


def read_glb(path):
    b = open(path, 'rb').read()
    length = struct.unpack('<I', b[12:16])[0]
    gltf = json.loads(b[20:20 + length])
    bin_start = 20 + length + 8
    bin_length = struct.unpack('<I', b[20 + length:24 + length])[0]
    return gltf, bytearray(b[bin_start:bin_start + bin_length])


def basecolour(gltf, binary):
    view = gltf['bufferViews'][gltf['images'][0]['bufferView']]
    start = view.get('byteOffset', 0)
    return Image.open(io.BytesIO(bytes(binary[start:start + view['byteLength']]))).convert('RGB')


def write_glb(path, gltf, binary, image_bytes):
    """The same glb with image 0's bytes replaced.

    The embedded buffer (buffer 0) is rebuilt from the pieces that point into
    it — plain buffer views, and the compressed streams that
    EXT_meshopt_compression keeps in buffer 0 for views that nominally live in
    the uncompressed fallback buffer — each copied across unchanged except the
    image, and every offset moved to where its piece now starts, 4-aligned.
    """
    image_view = gltf['images'][0]['bufferView']
    pieces = []  # (old offset, length, owner dict, is_image)
    for i, v in enumerate(gltf['bufferViews']):
        ext = v.get('extensions', {}).get('EXT_meshopt_compression')
        if ext is not None and ext.get('buffer', 0) == 0:
            pieces.append((ext.get('byteOffset', 0), ext['byteLength'], ext, False))
        elif ext is None and v.get('buffer', 0) == 0:
            pieces.append((v.get('byteOffset', 0), v['byteLength'], v, i == image_view))
    out = bytearray()
    for offset, length, owner, is_image in sorted(pieces, key=lambda p: p[0]):
        while len(out) % 4:
            out.append(0)
        data = image_bytes if is_image else bytes(binary[offset:offset + length])
        owner['byteOffset'] = len(out)
        owner['byteLength'] = len(data)
        out += data
    while len(out) % 4:
        out.append(0)
    gltf['buffers'][0]['byteLength'] = len(out)
    gltf['images'][0]['mimeType'] = 'image/png'
    gltf['images'][0].pop('name', None)

    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(out)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js)
        f.write(struct.pack('<II', len(out), 0x004E4942) + out)


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
    path = os.path.join(MODELS, f'{name}.glb')
    gltf, binary = read_glb(path)
    before = os.path.getsize(path)
    image = basecolour(gltf, binary).resize((size, size), Image.LANCZOS)
    pixels = np.asarray(image).reshape(-1, 3).astype(np.float32)
    sample = pixels[np.random.default_rng(1).choice(len(pixels), 40000, replace=False)]
    centres = kmeans(sample, k)
    labels = np.empty(len(pixels), np.int32)
    for s in range(0, len(pixels), 200000):
        labels[s:s + 200000] = ((pixels[s:s + 200000, None, :] - centres[None]) ** 2).sum(-1).argmin(1)
    regions = Image.fromarray(labels.reshape(size, size).astype(np.uint8), 'L').filter(ImageFilter.ModeFilter(kernel))
    flat = Image.fromarray(centres.astype(np.uint8)[np.asarray(regions)], 'RGB')
    png = io.BytesIO()
    flat.quantize(colors=k, method=Image.Quantize.MEDIANCUT).save(png, format='PNG', optimize=True)
    write_glb(path, gltf, binary, png.getvalue())
    print(f'{name}: {k} colours, {size}², {before // 1024} kB -> {os.path.getsize(path) // 1024} kB')


if __name__ == '__main__':
    for name, (k, size, kernel) in JOBS.items():
        flatten(name, k, size, kernel)
