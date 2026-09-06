# Open vector path join verification — 2026-09-06

This is ordinary PDF extraction/rendering evidence only. It is not PDF/X certification, does not change the profile gate, and does not promote a capability verdict.

## Source change

Commit `010deb8` changes only the OpenPencil `drawNodeStroke` centerline path selection: a vector with zero regions uses the existing connected `vectorPaths` when available; all other cases retain the existing per-segment `vectorStroke` path. The generated `engine.source.mjs` and `PROVENANCE.json` were regenerated only by `bun run build:engine`.

The first build attempt exited 1 because the vendor worktree had no installed `tsdown` package (`ERR_MODULE_NOT_FOUND`). `bun install --frozen-lockfile` was run in the vendor source worktree, and the mandated build then exited 0 with engine SHA-256 `2a218ac2d18f32d34b6dc81a0871c09893660d3cf813d9019974fe0877bfd4b1`.

## Before/after extraction matrix

The pre-fix files remain in `baseline-before-open-path-join-fix/`, including the three honest `open-stroked-path` mismatches at 72/144/216 dpi. The post-fix rerender is in `after-open-path-join-fix/`.

| Matrix | Comparisons | Pass | Mismatch | Error | Boundary/tolerance |
| --- | ---: | ---: | ---: | ---: | --- |
| Baseline before renderer fix | 24 | 21 | 3 | 0 | 2 raster pixels / 2 channels |
| After renderer fix | 24 | 24 | 0 | 0 | 2 raster pixels / 2 channels |

Every post-fix case reports `boundaryPhysicalPixels: 2`, `boundaryRasterPixels: 2`, `channelTolerance: 2`, no registration, and uniform-interior comparison. The PDF page invariant remains one 300×220 point page with no Image XObjects for every fixture. The ordered 8-page extraction check remains 8 pages in authored order, all single-page correspondences match, and the intentional distinct-image count is 7 because rectangle path and rectangle polygon render identically.

Post-fix manifest: `after-open-path-join-fix/manifest.json`.

## Direct Canvas/PDF join controls

The focused regression test is `compatibility/luna-open-path-joins.test.mjs`; it exports native vectors, renders each PDF through Poppler at 72 dpi, compares against an actual CanvasKit PNG with the unchanged 2-pixel/2-channel rule, and retains four control artifacts under `open-path-joins/`:

- `open-L-V-chain/` — connected `M0 0L100 50L0 100` centerline join.
- `disconnected-two-subpaths/` — two independent subpaths plus a midpoint background probe proving no accidental connection.
- `cubic-to-line-join/` — one connected cubic-to-line open chain.
- `closed-ring-control/` — even-odd filled closed ring control on the existing closed-vector path.

The repeat-render test produced byte-stable Canvas PNGs. The direct join suite result was **5 passed, 0 failed, 0 cancelled, 0 skipped**, exit 0. The retained control manifest records the exact geometry, page dimensions, Poppler DPI/command basis, and comparison measurements in each control directory.

## Commands and evidence

- `node scripts/luna-pdf-extraction-matrix.mjs --output-dir research/luna-pdf-extraction-20260906/after-open-path-join-fix` — exit 0; 24/24 pass, 0 mismatch, 0 error.
- `CANVAS_PDF_EXTRACTION_EVIDENCE_DIR=research/luna-pdf-extraction-20260906/after-open-path-join-fix node --test compatibility/luna-pdf-extraction-matrix.test.mjs` — **2 passed, 0 failed/cancelled/skipped**, exit 0.
- `CANVAS_OPEN_PATH_JOIN_EVIDENCE_DIR=research/luna-pdf-extraction-20260906/open-path-joins node --test compatibility/luna-open-path-joins.test.mjs` — **5 passed, 0 failed/cancelled/skipped**, exit 0.
- Focused Canvas/PDF regression command `CANVAS_PDF_EXTRACTION_EVIDENCE_DIR=research/luna-pdf-extraction-20260906/after-open-path-join-fix node --test src/openpencil-engine.test.mjs compatibility/pdf-vector-render.test.mjs compatibility/vector-fidelity.test.mjs compatibility/luna-open-path-joins.test.mjs compatibility/luna-pdf-extraction-matrix.test.mjs` — **68 passed, 0 failed/cancelled/skipped**, exit 0.
- Poppler used for all native renders: `pdftoppm version 26.08.0`.
- Baseline retained subtree: `baseline-before-open-path-join-fix/` (8,208 KiB on disk).
- Post-fix retained subtree: `after-open-path-join-fix/` (8,204 KiB on disk).
- Direct control artifacts: `open-path-joins/` (68 KiB on disk).

## Vendor quality gates

- `bun run check` in `vendor/open-pencil/source` — exit 1 at `lint:structure`/`lint`; 57 repository diagnostics were reported in unrelated existing source and test files. The changed `scene.ts` had no diagnostic at the added selector line.
- Focused `bunx oxlint -c oxlint.json --type-aware --type-check packages/core/src/canvas/scene.ts` — exit 1 with 6 existing diagnostics in `scene.ts` (complexity, nullability/type annotations, and unrelated type checks); no new diagnostic was reported for the one-line path selection.
- `bun run test:unit` in `vendor/open-pencil/source` — exit 1: 2,355 passed, 1 skipped, 100 failed, 2 errors across 2,456 tests. The failures were fixture/import, headless-window/Tauri, network font-provider, and related pre-existing environment cases; no renderer join test failed.

The aggregate vendor quality results are retained as failures, not represented as green. No native compiler, device, process cleanup, or profile-gate operation was used.

The existing pre-fix extraction captures were not overwritten or deleted. The comparison threshold was not loosened, no PDF/X/profile claim is made, and no native device/compiler gate was run.
