# PDF serialization boundary wiring — 2026-09-07

This evidence covers the narrow Canvas writer serialization envelope seam. It is not PDF/X certification and does not change the publication gate.

## Branch and commit chain

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/pdf-envelope-wiring`
- Branch: `codex/canvas-pdf-envelope-wiring-20260907`
- Combined base SHA: `e8a2962ae635adbb0c5c79c3691b726cc16aa3c5`
- Reviewed root commits applied in order: `ccd2a06`, `b201169`, `1284fcc`, `5908887`
- Reviewed independent commits applied in order: `51258ff`, `f6a1d40`, `175f513`, `de4569c`, `9c501cb`
- Wiring source commit: `731643f` (`Wire PDF envelope inspection into preflight`)
- Test/evidence correction commit: pending after this report is updated

The source change is limited to `pdfx-preflight.mjs`: `preflightPdfx4` invokes `inspectCanvasPdfEnvelope` before `PDFDocument.load`; envelope issues are prepended to the semantic report, including the parse-failure fallback. `conformant:false`, the publication gate, and `PDFX_UNCOVERED` are unchanged.

## Boundary cases

`pdfx-serialization-boundary.test.mjs` has five named tests, all passing:

1. `serializePdf16` output and the retained writer candidate both verify as classic-xref envelope bytes.
2. A wrong `startxref` that pdf-lib repairs is still reported before semantic parsing as `PDF_SERIALIZATION_OUTSIDE_SUBSET` with detail `xref-stream-or-offset-outside-subset`; no clean subset claim is produced.
3. Raw `2147483648` reports envelope detail `integer-range`, while raw `2147483648.0` has no envelope issue. The preflight reports remain non-conformant.
4. Literal and hex strings containing fake `endobj`, `startxref`, `trailer`, and binary-looking tokens do not create serialization issues; repeated reports are ordered identically.
5. A real pdf-lib object-stream save reports exactly `PDF_SERIALIZATION_OUTSIDE_SUBSET` in the serialization-code projection, remains `conformant:false`, and repeats deterministically while semantic issues remain available.

No binary corpus was added. The existing retained candidate is read-only input to the test.

## Commands and results

All commands ran in the `canvas` directory of this worktree.

| Command | Exit | Result |
|---|---:|---|
| `bun install --frozen-lockfile` | 0 | 72 locked packages installed; no source/lockfile changes |
| `node --test src/exporters/pdf-serialization-envelope.test.mjs src/exporters/luna-pdf-envelope-independent.test.mjs src/exporters/pdfx-serialization-boundary.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/export-service.test.mjs` | 0 | 69 passed, 0 failed, 0 cancelled, 0 skipped |
| `node --test src/exporters/*.test.mjs src/export-service.test.mjs` | 0 | 742 passed, 0 failed, 0 cancelled, 0 skipped; duration 27.115 s (pre-correction baseline) |
| `node --test src/exporters/luna-pdfx-graphics-state-matrix.test.mjs src/exporters/pdfx-serialization-boundary.test.mjs src/exporters/pdf-serialization-envelope.test.mjs` | 0 | 166 passed, 0 failed, 0 cancelled, 0 skipped |
| `git diff --check` | 0 | clean |

Full-run log: `/tmp/pdf-envelope-wiring-run-AreUns/full-selection.log`.

The full selection initially exposed two historical read-only evidence comparisons because the new envelope marker was absent from retained records. The prior final run passed after narrow acknowledgments. This correction establishes the actual graphics-state projection: ordinary `pdf.save({useObjectStreams:false})` and `pdf.save({useObjectStreams:true})` both retain the PDF 1.7 header, so both serializer records receive exactly `{ code: "PDF_SERIALIZATION_OUTSIDE_SUBSET", object: "file@0", detail: "header-outside-writer-subset" }`. The current matrix records and asserts that projection for both serializers; historical normalization removes only that exact code/path marker, never arbitrary outside-subset issues.

For `dangling-state-resource`, the corrected test explicitly asserts `OBJECT_GRAPH_INVALID` at `Catalog/Pages/Kids[0]/Resources/ExtGState/State` for both serializer records before normalizing that one proven historical addition. Retained PDFs and historical manifests are untouched.

## Gate and scope observations

- No profile asset, emitter, validator policy, capability table, or protected file was changed.
- No object-stream input is called universally invalid; it receives the explicit serialization-subset issue while semantic parsing continues.
- The configured/profile publication gate remains closed and no conformance claim is made.
- No native compiler, device, GUI, upload, or binary-corpus generation was used.
