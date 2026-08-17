# OpenPencil engine seam

Canvas uses a deliberately narrow, tree-shaken engine module generated from
OpenPencil commit `4a5e7d557064d941fbac88bd492586db5257ff5f`, with the narrowly scoped Pencil
compatibility patches recorded in `PROVENANCE.json`. The exported seam is limited to
the editor graph, Yoga layout, scene bounds, `.pen` reader, CanvasKit loader, canvas input,
and text-edit hooks listed in `PROVENANCE.json`.

The published OpenPencil 0.13.2 packages are not runtime dependencies. In
particular, Canvas does not include the OpenPencil calculator/tools surface or
its `expr-eval` dependency.

To regenerate, check out the recorded commit, install its frozen lockfile,
build `scene-graph`, `fig`, `kiwi`, `pen`, `core`, and `vue`, copy `entry.ts` to
the checkout root, then run:

```sh
bun build ./entry.ts --outfile ./engine.mjs --target browser --format esm \
  --external vue --external canvaskit-wasm
```

Copy the result and the five Inter font assets back here, reapply the recorded
local patches, update the SHA-256, then confirm `expr-eval` is absent from the dependency lock and bundle.
The local Kiwi schema interpreter replaces OpenPencil's generated `Function`
decoder so the browser bundle remains compatible with Penkra's no-`unsafe-eval` App CSP.
Large expanded scene graphs bypass whole-scene, whole-subtree, and retained-backing
picture recording. Cached descendant visual bounds let the live viewport culler skip
complete off-screen subtrees without hiding overflowing content. Below 25% zoom,
subpixel descendants and visually dense subtrees are deferred while their visible
containers remain rendered;
normal editing zooms retain the complete scene detail.
The core exports intentionally use public package subpaths so the Vue hooks and
Canvas entry resolve one shared editor and CanvasKit singleton.
