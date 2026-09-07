# PDF/X writer publication-path verification — 2026-09-07

## Scope

Coordinator commit `8b4cd1f` was cherry-picked as `ff1a53f` into this isolated
branch. Its only production change removes the universal `conformant` gate from
`exportPdf`; it still requires `canvasWriterSubset.verified === true` and zero
preflight issues. The standalone `preflightPdfx4` report remains
`conformant:false` with its existing limitations.

This report verifies returned writer artifacts and service publication. It is
not a PDF/X certification claim and does not change profiles, checkers,
capabilities, or the uncovered list.

## Actual 12-case export matrix

The test [luna-pdfx-export-path-matrix.test.mjs](/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/pdf-envelope-wiring/canvas/src/exporters/luna-pdfx-export-path-matrix.test.mjs)
calls the real `exportPdf` PDF/X-4 path with bundled GRACoL2013 CRPC6 and
sRGB2014 profiles. Every case returned a `Uint8Array` with `%PDF-1.6`, reparsed
successfully, and independently re-preflighted with:

```text
status=verified-canvas-writer-subset
canvasWriterSubset.verified=true
issues=[]
conformant=false
```

| Case | Returned pages and shape assertions |
| --- | --- |
| `empty-white-physical-frame` | 1 page; 180 x 120 pt trim/media; no font/image resources |
| `solid-rgb-rectangle` | 1 page; 180 x 120 pt; native rectangle content, no image |
| `gray-black-rectangles` | 1 page; 180 x 120 pt; two native rectangle paints, no image |
| `translucent-fill` | 1 page; 180 x 120 pt; native fill with serialized ExtGState, no image |
| `translucent-stroke` | 1 page; 180 x 120 pt; native stroke with serialized ExtGState, no image |
| `ellipse` | 1 page; 180 x 120 pt; native curve content, no image |
| `path-nonzero` | 1 page; 180 x 120 pt; native `f` path operator, no image |
| `path-evenodd-hole` | 1 page; 180 x 120 pt; native `f*` path operator, no image |
| `polygon` | 1 page; 180 x 120 pt; native `f` path operator, no image |
| `exact-embedded-inter-text` | 1 page; 180 x 90 pt; `BT`/`Tj`, embedded Inter `FontFile2` |
| `alpha-png-asset` | 1 page; 180 x 120 pt; 2 image XObjects (color + `SMask`) and `Do` |
| `multipage-differing-physical-size-and-bleed` | 2 pages: 150 x 105 pt trim with 3 pt bleed, then 240 x 180 pt trim with 9 pt bleed; native geometry on both |

The alpha image is generated in memory and sent through the actual
`pdf.embedPng` path. No PDF or PNG corpus was retained.

The three negative controls remain pre-publication input checks:

| Control | Exact observed code |
| --- | --- |
| missing glyph `U+10FFFF` | `CANVAS_PDF_GLYPH_MISSING` |
| shaped text hash differs from embedded Inter bytes | `CANVAS_PDF_FONT_MISMATCH` |
| physical width `0` | `CANVAS_PDF_PROFILE_INVALID` |

## Existing gate controls updated

The following controls now inspect returned bytes rather than expecting the old
universal gate error:

- `pdfx-preflight.test.mjs`: header, one-page geometry, zero issues, subset
  verification, and `conformant:false`.
- `pdfx-content-matrix.test.mjs`: returned PDF and zero content issues.
- `luna-pdfx-font-matrix.test.mjs`: returned PDF, embedded FontFile2, zero
  issues, and `conformant:false`.
- `luna-pdfx-graphics-state-matrix.test.mjs`: returned PDF and serialized
  transparency ExtGState controls.
- `luna-pdfx-metadata-serialized.test.mjs`: returned PDF, Metadata wiring,
  zero issues, and `conformant:false`.
- `luna-pdfx-image-matrix.test.mjs`: returned PDF, two image XObjects, and
  alpha `SMask`.
- `export-service.test.mjs`: real PDF/X file publication, `%PDF-1.6` header,
  page boxes, preflight zero issues/subset verification, and actual output
  profile `deviceClass=prtr`, `channels=4`, `issues=[]`.

The service still rejects an occupied destination with
`CANVAS_EXPORT_EXISTS` and preserves its contents. An invalid extraction
profile (`PDF/X-3`) rejects with `CANVAS_PDF_PROFILE_UNKNOWN` before writing;
the destination remains absent.

## Focused verification

The final bounded commands were run from `canvas/`:

```text
bun test src/exporters/luna-pdfx-export-path-matrix.test.mjs
bun test src/exporters/luna-pdfx-font-matrix.test.mjs
bun test src/exporters/luna-pdfx-graphics-state-matrix.test.mjs
bun test src/exporters/luna-pdfx-metadata-serialized.test.mjs
bun test src/exporters/luna-pdfx-image-matrix.test.mjs
bun test src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/export-service.test.mjs
```

| Selection | Passed | Failed | Cancelled/skipped |
| --- | ---: | ---: | ---: |
| Actual export path matrix | 15 | 0 | 0 |
| Font matrix | 81 | 0 | 0 |
| Graphics-state matrix | 150 | 0 | 0 |
| Metadata matrix | 72 | 0 | 0 |
| Image matrix | 81 | 0 | 0 |
| Preflight/content/service | 37 | 0 | 0 |
| **Total** | **436** | **0** | **0** |

No native compiler, device, App operation, profile mutation, capability change,
or retained binary artifact was used.

## Commits

| Commit | Contents |
| --- | --- |
| `ff1a53f` | cherry-picked coordinator writer-gate change (`8b4cd1f`) |
| `a321e40` | returned-artifact and service test corrections |
| pending evidence commit | this report |
