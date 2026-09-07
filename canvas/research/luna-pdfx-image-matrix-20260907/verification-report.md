# Serialized image-resource checker probe

Date: 2026-09-07

This is a serialized probe of the current Canvas writer image boundary. It is not PDF/X certification, an ISO verdict, or a production-policy decision. No production source or profile gate was changed.

## Corpus and commands

The ordinary baseline was produced by the current `exportPdf` writer with two real 2×2 PNG inputs: an opaque RGB PNG and an RGBA PNG with transparent pixels. `pdf.embedPng` therefore created both image XObjects and the alpha image's real SMask. The returned ordinary bytes were then reloaded and reserialized with fixed metadata dates solely to make retained evidence hashes stable across runs; image resources and stream data remain writer-generated. All mutations were applied to that serialized object graph, saved, reloaded, and inspected.

The explicit evidence-generation command was:

```text
cd /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas
LUNA_PDFX_IMAGE_MATRIX_RETAIN_EVIDENCE=1 node --test src/exporters/luna-pdfx-image-matrix.test.mjs
```

Exit 0: 80 passed, 0 failed, 0 cancelled, 0 skipped. The default command was:

```text
cd /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas
node --test src/exporters/luna-pdfx-image-matrix.test.mjs
```

Exit 0: 81 passed, 0 failed, 0 cancelled, 0 skipped. Default mode recomputed all 76 serialized identities, verified retained hashes and inspector results, and confirmed the evidence-directory snapshot was unchanged. It does not create or write evidence.

The final focused command ran the image matrix together with the existing font, content, preflight, and serialized-corpus suites:

```text
node --test src/exporters/luna-pdfx-image-matrix.test.mjs src/exporters/luna-pdfx-font-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-serialized-corpus.test.mjs
```

Exit 0: 257 passed, 0 failed, 0 cancelled, 0 skipped. No compiler or device build was started.

The matrix has 38 named cases × 2 serialization variants = 76 result identities. `case-results.json` retains every result and SHA-256. `sha256-manifest.json` distinguishes 76 generated identities from 12 actual retained PDFs (six representative cases × two serializers). Valid ordinary baseline PNG renders are retained for both serializers of the RGB and transparent baselines; all four were visually inspected and match.

## Ordinary baseline findings

The ordinary baseline remains `conformant: false`. Its exact unrelated/helper findings, present for both serializers, are:

```text
PDF_VERSION_UNSUPPORTED: header
OUTPUT_INTENT_COUNT: Catalog/OutputIntents
XMP_MISSING: Catalog/Metadata
TRAILER_ID_INVALID: trailer/ID
DEFAULT_RGB_MISSING: Page[0]/Resources/ColorSpace/DefaultRGB
TRANSPARENCY_GROUP_INVALID: Page[0]/Group
```

These are not image-resource acceptance claims. Valid image baselines have no `IMAGE_*` issue.

## Current checker classifications

The mandated existing diagnostics were asserted after serialization and reload for both variants:

- missing, zero, negative, fractional, and string Width/Height: `IMAGE_DIMENSION_INVALID` at the corresponding image dictionary field;
- BitsPerComponent 0, 3, and string: `IMAGE_BITS_INVALID` at `BitsPerComponent`;
- DeviceCMYK and unknown named ColorSpace: `IMAGE_COLOR_SPACE_OUTSIDE_SUBSET` at `ColorSpace`;
- unknown Filter name: existing helper traversal reports `STREAM_FILTER_FORBIDDEN` at the image stream object.

The following cases intentionally remain `coordinator-review` because the current implementation does not add an image-specific diagnostic: missing or 16-bit BitsPerComponent, missing/DeviceGray/number/empty-array/valid-ICCBased ColorSpace, ImageMask absent/false/true with RGB, SMask absent/None/dangling/nonstream/valid alpha, absent/FlateDecode Filter, and truncated image stream data. Their exact serialized issue arrays are in `case-results.json`; they were not asserted as accepted or rejected.

## PDF/X gate probe

The test independently invoked the fully configured PDF/X writer with bundled printer output intent and sRGB source profile. It returned no PDF artifact and raised the existing `CANVAS_PDF_PROFILE_UNVERIFIED` error. The attached preflight report had `conformant: false`, seven uncovered entries, and exact `issues: []` for the valid image resources. This is recorded as a closed-gate result, not as a configured PDF/X artifact or certification.

## Integrity and visual evidence

Every matrix case hashes serialized input before and after repeated inspection; the bytes remain unchanged and repeated ordered issue objects are equal. A valid → invalid-dimension → valid sequence confirms no image-parser state leak. The test asserts two image XObjects after every reload and never renders malformed fixtures.

Retained files:

- `valid-rgb-baseline-{classic-xref,object-streams}.pdf` and `.png`;
- `transparent-baseline-{classic-xref,object-streams}.pdf` and `.png`;
- `invalid-dimensions-width-zero-{classic-xref,object-streams}.pdf`;
- `bits-missing-{classic-xref,object-streams}.pdf`;
- `array-colorspace-empty-{classic-xref,object-streams}.pdf`;
- `truncated-image-stream-{classic-xref,object-streams}.pdf`.

The PDF artifact-operation marker was unavailable in this environment (`MODULE_NOT_FOUND`); no substitute marker or production bypass was used. No devices or native builds were used.
