#!/usr/bin/env python3
"""
The ship.

    python3 tools/pirate_ship.py                 # tools/pirate_ship.glb -> src/models/pirate_ship.glb
    python3 tools/pirate_ship.py --no-pack       # ...skipping the meshopt pass
    python3 tools/pirate_ship.py --texture 2048  # ...at half the generator's basecolour

Where the geometry came from: Tripo, the same generator the rider and his board
came from, and like theirs the source is kept in `tools/` beside this script so
the next pass has something to open. There is no bpy in here and nothing is
sculpted: the model arrived finished, and the only question this script answers
is what to throw away.

CLAUDE.md says the character stays procedural and that anything else wanting a
model file has to argue for one first. This is the second thing to win that
argument, after the surfer, and the argument is written up in `docs/STATUS.md`,
"The boat is a ship" — not here, because it is a decision about the world and
not about a pipeline.

What this throws away, and why:

  * The metallicRoughness map — 15.6 MB of PNG, two thirds of the whole file.
    `lit()` in `src/Ship.tsx` builds a `MeshStandardNodeMaterial` out of the
    loader's material and keeps exactly one thing off it: `map`. Roughness and
    metalness are numbers in code, here as for every other model in this world.
    So this was 15.6 MB the browser would fetch, decode and never sample.
  * The normal map, 0.57 MB. Nothing in this world reads one.
  * `KHR_materials_specular` and `KHR_materials_volume`, for the same reason:
    the node material does not look at either.
  * Three quarters of the basecolour's edge, 4096 down to 1024. The two were put
    side by side at the size the world actually draws this ship and nothing told
    them apart, so the larger one is 500 kB spent on a difference no visitor can
    see. `--texture 2048` is there for when that judgement is revisited.

What it keeps: all 117,342 triangles. That is Seb's call and it is the reason
this file is over budget rather than under it — the same call, for the same
reason, as the rider's third pass.

What it does *not* do is take its own pictures. The rider's script renders a
flex pose because a rig can be wrong in ways a rest pose hides; nothing here has
a bone in it, so the two sheets that shipped with it were taken with a throwaway
three.js harness instead — the renderer the site itself uses, which is the only
one that agrees with `lit()` about what this model looks like:
`asset_history/pirate-ship-views.png` and `asset_history/pirate-ship-waterline.png`.

Sizes, in order: 21.65 MB in, 6.22 once the maps are gone, 4.67 after the
resize, 1.15 out of gltfpack — 1.00 gzipped, which is what the visitor pays.
"""

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "tools" / "pirate_ship.glb"
OUT = ROOT / "src" / "models" / "pirate_ship.glb"

# Pinned, and fetched through npx or into a cache of their own, so that nothing
# here is added to package.json — the same bargain surfer.py struck for gltfpack.
GLTF_TRANSFORM = "4.5.0"
GLTFPACK = ("npx", "--yes", "gltfpack@0.24.0")
# The same five flags the rider is packed with: meshopt, keep node and mesh
# names, and leave positions and texcoords as floats rather than quantised.
PACK_FLAGS = ("-cc", "-kn", "-km", "-vpf", "-vtf")

CACHE = Path.home() / ".cache" / "pinchs-gltf-transform"

# The one part of this that is not Python, and the reason it exists: dropping a
# texture *slot* is not something the gltf-transform CLI can be asked to do.
# Every command it ships either keeps a map or prunes one that nothing
# references, and these three are referenced — by a material this site throws
# away and rebuilds. So: twenty lines of its SDK saying which maps are never
# sampled, after which `prune` can see that the images are orphans.
STRIP_JS = """
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);

for (const m of doc.getRoot().listMaterials()) {
  m.setMetallicRoughnessTexture(null);
  m.setNormalTexture(null);
  m.setOcclusionTexture(null);
  m.setEmissiveTexture(null);
  for (const ext of ['KHR_materials_specular', 'KHR_materials_volume',
                     'KHR_materials_transmission', 'KHR_materials_ior']) {
    if (m.getExtension(ext)) m.setExtension(ext, null);
  }
}

await doc.transform(dedup(), prune());

const left = doc.getRoot().listTextures();
if (left.length !== 1) {
  throw new Error(`expected the basecolour and nothing else, found ${left.length}`);
}
await io.write(process.argv[3], doc);
"""


def run(cmd, what):
    done = subprocess.run(cmd, capture_output=True, text=True)
    if done.returncode != 0:
        sys.exit(f"[ship] {what} failed:\n{done.stdout.strip()}\n{done.stderr.strip()}")
    return done


def node_deps():
    """The three gltf-transform packages, in a cache of their own outside the
    project. Never in the project's node_modules: CLAUDE.md's one hard rule is
    that this script's shell must not install there."""
    if shutil.which("npm") is None:
        sys.exit("[ship] no npm — install Node and rerun")
    CACHE.mkdir(parents=True, exist_ok=True)
    if not (CACHE / "node_modules" / "@gltf-transform" / "functions").is_dir():
        print(f"[ship] fetching gltf-transform {GLTF_TRANSFORM} into {CACHE}")
        run(["npm", "install", "--silent", "--no-audit", "--no-fund", "--prefix", str(CACHE),
             *[f"@gltf-transform/{p}@{GLTF_TRANSFORM}" for p in ("core", "extensions", "functions")]],
            "npm install")
    js = CACHE / "strip.mjs"
    js.write_text(STRIP_JS)
    return js


def mb(path):
    return f"{path.stat().st_size / 1_048_576:.2f} MB"


def main():
    if not SRC.is_file():
        sys.exit(f"[ship] no {SRC.relative_to(ROOT)} — the generated source belongs in tools/")

    edge = "1024"
    if "--texture" in sys.argv:
        edge = sys.argv[sys.argv.index("--texture") + 1]

    strip_js = node_deps()
    stage = ROOT / "tools" / ".pirate_ship.stage.glb"
    print(f"[ship] {SRC.name}: {mb(SRC)}")

    run(["node", str(strip_js), str(SRC), str(stage)], "stripping the unread maps")
    print(f"[ship] maps dropped:  {mb(stage)}")

    cli = CACHE / "node_modules" / ".bin" / "gltf-transform"
    if not cli.is_file():
        run(["npm", "install", "--silent", "--no-audit", "--no-fund", "--prefix", str(CACHE),
             f"@gltf-transform/cli@{GLTF_TRANSFORM}"], "npm install (cli)")
    run([str(cli), "resize", str(stage), str(stage), "--width", edge, "--height", edge],
        f"resizing the basecolour to {edge}")
    print(f"[ship] basecolour {edge}: {mb(stage)}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    if "--no-pack" in sys.argv:
        shutil.copyfile(stage, OUT)
        print(f"[ship] --no-pack: {OUT.relative_to(ROOT)} left uncompressed, {mb(OUT)}")
    elif shutil.which("npx") is None:
        shutil.copyfile(stage, OUT)
        print(f"[ship] no npx: {OUT.relative_to(ROOT)} left uncompressed — install Node and rerun")
    else:
        run([*GLTFPACK, "-i", str(stage), "-o", str(OUT), *PACK_FLAGS], "gltfpack")
        print(f"[ship] packed:        {mb(OUT)}  ->  {OUT.relative_to(ROOT)}")

    stage.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
