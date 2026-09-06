# Ordinary PDF extraction rendering verification — 2026-09-06

This evidence covers ordinary roleless PDF extraction through the public `extractDocumentNode` service boundary and native Poppler rendering. It is not PDF/X certification, does not alter the profile gate, and does not promote any capability verdict.

## Matrix and method

The exact eight independent 300×220 roleless generic frames use `layout: "none"` and `#E8EEF4` page backgrounds. The cases are `rectangle-path`, `rectangle-polygon`, `ring-evenodd`, `ring-nonzero`, `cubic-ring-evenodd`, `open-stroked-path`, `alpha-behind-green`, and `transparent-child-frame`. No fonts or images are used. Each ordinary PDF is created at the public extraction boundary with no profile and has one 300×220 point page and no Image XObjects.

Each PDF is rendered with installed Poppler `pdftoppm` at 72, 144, and 216 dpi and compared with CanvasKit screenshot references at scales 1, 2, and 3. All 24 comparisons use the unchanged 2-raster-pixel boundary, 2-channel tolerance, 2-pixel uniform-neighborhood radius, and no registration/shift. Coordinator review caught and corrected an erroneous scale multiplier in the boundary calculation; the comparator regression places a 3-channel mismatch at raster coordinate (5,5) in a scale-3 synthetic image and confirms it is counted outside the fixed 2-pixel boundary.

Retained artifact root: `research/luna-pdf-extraction-20260906/`.

- 8 ordinary single-unit PDFs: 7,172,162 bytes
- 24 Canvas reference PNGs: 81,573 bytes
- 24 native Poppler PNGs: 54,344 bytes
- 8 multi-node Poppler page PNGs: 7,441 bytes
- 1 ordered 8-page PDF: 898,568 bytes
- manifest: 48,735 bytes
- total retained tree: 8,267,420 bytes (7.884 MiB)

The 64 PDF/PNG artifact hashes were captured before and after the boundary correction and were byte-identical. The correction changed only measurement metadata and recomputed measurements; references/captures were not regenerated.

## Explicit 24-case status

| Fixture | 72 dpi | 144 dpi | 216 dpi |
| --- | --- | --- | --- |
| rectangle-path | pass | pass | pass |
| rectangle-polygon | pass | pass | pass |
| ring-evenodd | pass | pass | pass |
| ring-nonzero | pass | pass | pass |
| cubic-ring-evenodd | pass | pass | pass |
| open-stroked-path | mismatch: 4 px / 12 channels / max 106 | mismatch: 18 px / 54 channels / max 214 | mismatch: 54 px / 162 channels / max 214 |
| alpha-behind-green | pass | pass | pass |
| transparent-child-frame | pass | pass | pass |

Final single-unit counts: **24 comparisons, 21 pass, 3 mismatch, 0 error**. The three mismatches are retained honestly for coordinator-owned source review; no tolerance or boundary was widened to make them pass. The visual inspections covered all 24 native PNGs individually. The transparent-child-frame captures show the white back rectangle and ring over white, not a black transparent-container fill.

## Ordered multi-node extraction

The final public `extractDocumentNodes` call produced one 8-page PDF in authored order `page-1` through `page-8`; all pages are 300×220 points. Each rendered multi-node page pixel hash matches its corresponding single-unit 72 dpi render. The multi-node output has 7 distinct pixel hashes because rectangle path/polygon are intentionally visually identical; it is not treated as an eight-unique-image requirement. The ordered correspondence check passed.

## Commands and results

- Generation: `node scripts/luna-pdf-extraction-matrix.mjs --output-dir research/luna-pdf-extraction-20260906` — exit 0.
- Threshold correction recomputation: `node scripts/luna-pdf-extraction-matrix.mjs --recompute --output-dir research/luna-pdf-extraction-20260906` — exit 0; retained-artifact hash comparison exit 0.
- Retained evidence and comparator test: `CANVAS_PDF_EXTRACTION_EVIDENCE_DIR=research/luna-pdf-extraction-20260906 node --test compatibility/luna-pdf-extraction-matrix.test.mjs compatibility/pdf-vector-render.test.mjs` — **3 passed, 0 failed/cancelled/skipped**, exit 0.
- Full focused regression: `node --test src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-serialized-corpus.test.mjs src/exporters/pdfx-fonts.test.mjs src/export-service.test.mjs compatibility/luna-pdf-extraction-matrix.test.mjs compatibility/pdf-vector-render.test.mjs` with the retained evidence directory — **106 passed, 0 failed/cancelled/skipped**, exit 0.
- Retained focused log: `/tmp/luna-pdf-extraction-focused-final-20260906.log`.
- `git diff --check`: exit 0.

No native devices, profile gate changes, capability promotion, production edits, protected-file edits, PDF/X claims, or broader conformance claims were made.
