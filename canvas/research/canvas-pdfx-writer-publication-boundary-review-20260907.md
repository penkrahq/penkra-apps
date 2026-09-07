# PDF/X writer publication-boundary review — 2026-09-07

## Scope and revision

This is a read-only review of unintegrated worker commit
`8b4cd1f093fd042bd2a161b3853488ddae036776` against combined HEAD
`251a6012fb70b0f519a11bd9dc338229a0cafa17`. The worker diff is 34 lines in
two paths: a 14-line change in `canvas/src/exporters/pdf.mjs` and a new
27-line research report. It was not cherry-picked. No native, device, full
suite, build, gate, capability, or source action was performed.

The source change replaces the separate `canvasWriterSubset.verified` then
`conformant` checks with one condition requiring both a positive writer-subset
verdict and `report.issues.length === 0`. It leaves the report's deliberate
`conformant:false` unchanged. `git diff --no-ext-diff '8b4cd1f^'
8b4cd1f -- canvas/src/exporters/pdfx-preflight.mjs` is empty: the generic
checker, its issue collection, and its uncovered list are unchanged.

## Caller and public-route inventory

The only production import of this Canvas `exportPdf` is
`canvas/src/export-service.mjs:15`; the production call is
`renderPdfExtraction()` at lines 213–224. The public runtime operation is
`documents.extract` (`canvas/src/operations.mjs:310–323`), whose manifest
input (`canvas/penkra-app.json:397–426`) exposes only document/node/format,
the optional `PDF/X-4` profile, scale, destination, and modes, with
`additionalProperties:false`. `documents.export` deliberately excludes PDF
(`pptx`, `html`, `swift`, `kotlin` only). No public operation accepts a
`PDFDocument`, serialized PDF bytes, serializer, object-graph callback, or
the internal `exportPdf` options object.

Other `exportPdf` references are device-free tests and fixtures importing the
module directly. The vendor Open Pencil `exportPdf` symbols are a separate
vendor implementation and do not call `canvas/src/exporters/pdf.mjs`.

## Generated input routes and checks

### Fonts

The production route supplies only bundled Inter font bytes from
`readBundledPdfFonts()`. `embedFonts()` passes each value through pdf-lib
font embedding and fontkit parsing. Shaped text additionally requires an
exact `textLayout.fontHashes` match to the embedded bytes, a real font face,
an in-range glyph, and a glyph for the source code point. Ordinary text
encoding rejects missing glyphs. Serialized preflight then checks Identity-H
Type0/CIDFontType2 structure, Identity CID mapping, embedded FontFile2,
font-program parsing, width-table ranges, used CIDs, notdef/missing glyphs,
and declared-vs-program widths.

### Raster callback and image bytes

The only callback is `rasterizeNode(id, 300)` inside `drawNode()`. It receives
an ID and resolution, not the PDF object graph, and its result is consumed by
`pdf.embedPng()` before serialization. The production callback is fixed to
`takeDocumentScreenshots()` with the raster policy's expected dimensions,
`maxDimension:8192`, and `failOnDownscale:true`; it returns decoded base64
PNG bytes. There is no callback after serialization or preflight.

Preflight validates generated image XObjects for positive safe-integer
dimensions, a 64 MiB decoded-data ceiling, supported RGB/Gray color spaces,
sample depths, raw/Flate/DCT image filters, exact decoded lengths, and image
mask/soft-mask structure. Invalid callback output therefore fails during
embedding or produces preflight issues before any returned artifact.

### Physical geometry

`exportPdf()` converts `physical.w/h` from inches, millimetres, or the normal
pixel fallback to points; it rejects non-finite/non-positive trim dimensions
and rejects non-finite or negative bleed. It emits MediaBox, CropBox,
BleedBox, and TrimBox. Serialized preflight checks finite ordered boxes,
required MediaBox plus TrimBox-or-ArtBox, containment, and page-tree shape.
The normal public route derives physical values through the Canvas extraction
IR; a direct internal call to `exportPdf()` does not independently run the
Canvas document schema.

### Paint and vectors

The writer maps only recognized fill/stroke colors, alpha, basic rectangle,
ellipse, line, and vector-path operations into pdf-lib calls. Color parsing
accepts transparent, CSS colors, and hexadecimal forms and throws for an
unresolvable color. Vector commands are generated through
`scaledVectorCommands`; there is no raw operator or raw PDF dictionary input.
Preflight checks operator allowlists, operand arity/types, graphics and text
state balance, named resources, ExtGState alpha/blend fields, page color
management, image resources, and the complete indirect object graph.

The normal exporter-IR/capability route rasterizes or omits unsupported
effects, gradients, blend modes, and other properties before this writer.
The internal `exportPdf(ir, options)` function is not a standalone full IR
schema validator: a direct source-level caller can provide unsupported IR
fields that the writer ignores or must handle through its recognized subset.
That is an internal contract boundary, not a public PDF-object injection path.

### Text layout

`textLayout` contributes only recognized shaped glyph IDs, positions, sizes,
font hashes, and semantic runs to generated text operators. It cannot supply
raw PDF operators. The font/glyph/hash checks above run while emitting; the
serialized content checker then validates numeric operands, text state,
resource resolution, string lengths, and architectural numeric limits.
Serialization or preflight failure happens before the service receives bytes.

## Publication ordering and failed path

For PDF extraction, `extractDocumentNode()` calls `renderExtractionNode()`
and awaits `renderPdfExtraction()` before `writeAtomicFile()` at
`canvas/src/export-service.mjs:163–166`. Multi-node PDF extraction renders
all units and calls `writeAtomicFile()` only at lines 147–156. Thus an
`exportPdf()` error, including a failed serialized preflight, occurs before
the destination write. `writeAtomicFile()` itself stages bytes and links the
completed temporary file exclusively. The existing export-service regression
asserts that a PDF/X failure leaves the destination absent.

If the worker change were applied, a PDF/X extraction would write only when
the emitted bytes have `canvasWriterSubset.verified === true` and zero
preflight issues. It would still carry `conformant:false`; no bytes are
published for an issue-bearing or non-positive writer-subset result.

## Findings and concrete gaps

1. No arbitrary PDF object-graph injection was found in the reviewed options
   or callbacks. Fonts and ICC inputs become validated generated streams;
   raster callbacks become pdf-lib image XObjects; physical/paint/textLayout
   values become recognized generated operators and are serialized before the
   unchanged preflight. There is no post-serialization mutation hook.
2. The public manifest description at `canvas/penkra-app.json:405` says the
   PDF/X profile “fails closed until conformance is verified.” That wording
   is inconsistent with `8b4cd1f`, which intentionally allows the narrower
   Canvas-writer-subset result while the report remains `conformant:false`.
   This is a concrete public-contract/documentation mismatch to resolve if
   the source is later approved; it is not a universal-reader limitation.
3. The writer does not and should not claim universal PDF/X acceptance. The
   unchanged `PDFX_UNCOVERED` classes remain concrete emitted-file limits:
   non-Canvas documents, non-pinned profiles/color spaces, non-Identity-H or
   Form-XObject font/text paths, original-byte font/separation-name and
   object-number spelling checks, non-document XMP/incremental-update
   provenance, and optional-content/annotation/form/embedded-file/halftone/
   transfer/PostScript/external-stream features. These are outside the
   Canvas writer surface, not evidence that the audited writer callback routes
   can inject arbitrary objects.
4. No newly emitted-file defect was established by this static review. The
   integrated source remains at combined HEAD
   `251a6012fb70b0f519a11bd9dc338229a0cafa17`; the only untracked path is the
   preserved Swift `.build/` directory.

No source fix, test rerun, artifact regeneration, native/device action, or
capability/gate change was made by this review.
