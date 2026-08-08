# OpenPencil engine seam

Canvas uses a deliberately narrow, tree-shaken engine module generated from
OpenPencil commit `4a5e7d557064d941fbac88bd492586db5257ff5f`. The exported seam is limited to
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

Copy the result and the five Inter font assets back here, update the recorded
SHA-256, then confirm `expr-eval` is absent from the dependency lock and bundle.
The core exports intentionally use public package subpaths so the Vue hooks and
Canvas entry resolve one shared editor and CanvasKit singleton.
