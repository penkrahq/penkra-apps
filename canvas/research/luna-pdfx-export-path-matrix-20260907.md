# Actual PDF/X export-path matrix — 2026-09-07

## Scope and interpretation

This package exercises the real `exportPdf` PDF/X-4 path with serialized
`serializePdf16` output and the current bundled profile/font inputs. It is
writer-path evidence only. It does not certify PDF/X, change the publication
gate, or claim universal reader support.

`exportPdf` currently performs serialized preflight and intentionally refuses
publication because conformance coverage is incomplete. The observed gate code
for every supported-writer case was the actual current code:

```text
CANVAS_PDF_PROFILE_UNVERIFIED
```

Each error carried:

```text
status: verified-canvas-writer-subset
canvasWriterSubset.verified: true
issues: []
conformant: false
uncovered: non-empty
```

No case expected or asserted a returned PDF/X artifact. The serialized bytes
were generated inside `exportPdf` before the gate rejected publication.

## Inputs and provenance

The test is [luna-pdfx-export-path-matrix.test.mjs](/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/pdf-envelope-wiring/canvas/src/exporters/luna-pdfx-export-path-matrix.test.mjs).
It uses the existing direct exporter-IR contract exercised by the PDF font and
image fixtures, `vectorForNode` for path/polygon vectors, bundled assets, and
the real `exportPdf` implementation.

| Input | Path | SHA-256 |
| --- | --- | --- |
| PDF/X output profile | `canvas/assets/color/GRACoL2013_CRPC6.icc` | `4ebbfad6bc9cfc033fdafdd8ac5df8159208932cb16d9a6596d349ae7ab50443` |
| source RGB profile | `canvas/assets/color/sRGB2014.icc` | `384b832de3412066743b52a75ee906b6fb9fb8d9e09e936fc2c43223815c6e0a` |
| embedded Inter Regular | `canvas/vendor/open-pencil/fonts/Inter-Regular.ttf` | `a414b48aa577ef2c62ebb135341ddeef33ee26a4f5dc9f787f93c1aab08ebb50` |

The alpha-PNG case uses a deterministic valid 2x2 RGBA PNG assembled in memory
with the same small fixture pattern used by the existing image matrix. It is
passed to `exportPdf` through `rasterizeNode`; no PNG or PDF corpus was added.

## Supported-writer cases

All 12 cases reached the same serialized preflight result and the same closed
gate code.

| Case | Actual writer input coverage | Gate result | Preflight issues |
| --- | --- | --- | --- |
| `empty-white-physical-frame` | empty physical page | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `solid-rgb-rectangle` | opaque RGB rectangle | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `gray-black-rectangles` | gray and black rectangles | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `translucent-fill` | native fill with opacity 0.5 | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `translucent-stroke` | native stroke with opacity 0.5 | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `ellipse` | native ellipse fill | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `path-nonzero` | closed nonzero-filled path | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `path-evenodd-hole` | compound even-odd hole path | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `polygon` | native polygon vector | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `exact-embedded-inter-text` | embedded Inter Regular text | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `alpha-png-asset` | real `pdf.embedPng` path via raster callback | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |
| `multipage-differing-physical-size-and-bleed` | two pages with distinct physical sizes and bleed | `CANVAS_PDF_PROFILE_UNVERIFIED` | 0 |

The text case supplied `Inter:400` bytes and did not use a fallback font. The
alpha-PNG case supplied an actual PNG byte stream to the exporter, rather than
simulating an image resource.

## Negative controls

These inputs are accepted by the test harness as exporter inputs but must be
rejected before a PDF/X candidate can proceed:

| Control | Observed code |
| --- | --- |
| invalid glyph `U+10FFFF` | `CANVAS_PDF_GLYPH_MISSING` |
| shaped text whose declared `Inter|Regular` hash differs from embedded bytes | `CANVAS_PDF_FONT_MISMATCH` |
| physical page width `0` | `CANVAS_PDF_PROFILE_INVALID` with `PDF page page must have finite positive dimensions.` |

These are exporter-input validation results, not PDF/X conformance findings.

## Verification

Executed from `canvas/`:

```text
bun test src/exporters/luna-pdfx-export-path-matrix.test.mjs \
  src/exporters/pdfx-preflight.test.mjs \
  src/exporters/pdfx-content-matrix.test.mjs \
  src/exporters/pdfx-fonts.test.mjs \
  src/export-service.test.mjs
```

Exit code: `0`.

| Test file | Passed | Failed | Cancelled/skipped |
| --- | ---: | ---: | ---: |
| `luna-pdfx-export-path-matrix.test.mjs` | 15 | 0 | 0 |
| `pdfx-preflight.test.mjs` | 16 | 0 | 0 |
| `pdfx-content-matrix.test.mjs` | 13 | 0 | 0 |
| `pdfx-fonts.test.mjs` | 6 | 0 | 0 |
| `export-service.test.mjs` | 8 | 0 | 0 |
| **Total** | **58** | **0** | **0** |

The new test has no evidence-generation flag and writes no retained artifacts.
No native compiler, device, profile asset, production source, capability table,
gate, or protected file was changed.

## Commit

| Commit | Contents |
| --- | --- |
| `2f0de9c` | actual PDF/X export-path test matrix and negative controls |
| pending evidence commit | this report only |
