# Serialized image checker correction evidence

Date: 2026-09-07

This correction is limited to the Canvas writer-subset image checker. It is not PDF/X certification and does not change the profile gate or any capability verdict. The normative reference reviewed was Adobe PDF Reference 1.6, Table 4.39 (image dictionaries) and Table 7.11 (soft-mask image restrictions): https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf.

## Matrix and commands

The new matrix has 38 named cases × 2 serialized variants (`classic-xref` and `object-streams`) = 76 identities. It uses actual `exportPdf` writer output for opaque and alpha PNG XObjects, plus an actual pdf-lib embedded JPEG XObject. Mutations are applied to a loaded object graph, serialized, reloaded, and preflighted. The retained previous image corpus under `research/luna-pdfx-image-matrix-20260907/` was not rewritten.

Evidence generation is explicitly gated:

```text
cd /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas
LUNA_PDFX_IMAGE_CORRECTION_RETAIN_EVIDENCE=1 node --test src/exporters/pdfx-images.test.mjs
```

Exit 0: 79 passed, 0 failed, 0 cancelled, 0 skipped (76 matrix cases plus JPEG provenance, completeness, and gated-evidence tests).

Default mode:

```text
node --test src/exporters/pdfx-images.test.mjs
```

The default test is read-only and verifies the retained hashes, result identities, image issue arrays, and directory snapshot. It is to be run after this retained evidence is present; it does not create evidence.

Default verification exit 0: 80 passed, 0 failed, 0 cancelled, 0 skipped. Regenerated in-memory PDFs are compared by result identity and ordered image-issue outcome; retained on-disk PDFs are checked against their exact SHA256 manifest entries. This avoids treating pdf-lib's regenerated object naming/byte layout as a retained-artifact identity while keeping the actual retained-file check strict.

The complete assigned focused command was:

```text
node --test src/exporters/pdfx-images.test.mjs src/exporters/luna-pdfx-image-matrix.test.mjs src/exporters/luna-pdfx-font-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-serialized-corpus.test.mjs src/export-service.test.mjs
```

Exit 0: 345 passed, 0 failed, 0 cancelled, 0 skipped. No native compiler, device, profile-gate, or capability test was run.

## Implemented classifications

- Ordinary images require positive integer Width/Height, BitsPerComponent, and ColorSpace. Missing/invalid dimensions retain `IMAGE_DIMENSION_INVALID`; missing, nonnumeric, or unsupported bits produce `IMAGE_BITS_INVALID`; missing/malformed ColorSpace produces `IMAGE_COLOR_SPACE_INVALID`.
- Only DeviceRGB and DeviceGray pass the current Canvas subset. Named alternate spaces and nonempty arrays, including ICCBased arrays, produce `IMAGE_COLOR_SPACE_OUTSIDE_SUBSET`.
- ImageMask true produces `IMAGE_MASK_OUTSIDE_SUBSET`; nonboolean values produce `IMAGE_MASK_INVALID`; false/absent remains accepted.
- SMask must resolve to an Image stream. `/None`, dangling references, nonstreams, and wrong subtypes produce `IMAGE_SOFT_MASK_INVALID` at the SMask path. Valid writer alpha masks pass.
- Soft-mask images are recursively checked as DeviceGray with valid bits/dimensions, ImageMask false/absent, no nested Mask/SMask, and no Matte. Invalid child fields can carry both their existing field diagnostic and `IMAGE_SOFT_MASK_INVALID`. Matte produces `IMAGE_MATTE_OUTSIDE_SUBSET` without imposing equal dimensions.
- Raw and Flate image streams are checked against the bounded decoded byte count; mismatches produce `IMAGE_DATA_LENGTH_INVALID`, malformed compression produces `IMAGE_DATA_INVALID`, and DecodeParms produces `IMAGE_DECODE_PARAMS_OUTSIDE_SUBSET`. DCTDecode is accepted without raw scanline decoding. Other filters produce `IMAGE_FILTER_OUTSIDE_SUBSET`; existing global stream-filter diagnostics remain.
- DecodeParms is rejected before any DCT short-circuit with `IMAGE_DECODE_PARAMS_OUTSIDE_SUBSET`.
- Flate streams use a 64 MiB `inflateSync` output bound; expansion overflow and malformed compressed bytes deterministically produce `IMAGE_DATA_INVALID` without unbounded decompression.
- Shared masks are visited once per validation context; self and two-node cycles terminate with `IMAGE_SOFT_MASK_INVALID`. A one-sample DeviceGray mask with dimensions differing from its parent and no Matte passes.
- Visitation is context-sensitive: an image validated as an ordinary XObject is separately validated as a soft mask. Both serialized XObject insertion orders report the exact `IMAGE_SOFT_MASK_INVALID` Gray-space result.
- Soft-mask ImageMask true/nonboolean values retain their `IMAGE_MASK_*` diagnostic and additionally report `IMAGE_SOFT_MASK_INVALID` at `/ImageMask`.

## Evidence findings

The valid writer PNG, valid writer alpha PNG, valid JPEG, raw-valid, independent-dimension, and shared-mask cases have zero image issues. Representative negative paths are retained in `case-results.json`; examples include:

```text
Page[0]/Resources/XObject/Image-7098480789/BitsPerComponent
Page[0]/Resources/XObject/Image-7098480789/ColorSpace
Page[0]/Resources/XObject/Image-7098480789/SMask
Page[0]/Resources/XObject/Image-7098480789/SMask/SMask
Page[0]/Resources/XObject/Image-7098480789/Filter
```

Every case hashes bytes before and after repeated inspection and compares repeated ordered issue arrays. The old image-matrix test was minimally adapted to retain historical issue objects while allowing newly added correction diagnostics; its prior corpus/report remain unchanged.

The correction directory retains 12 representative PDFs: valid writer baseline, valid JPEG, missing BPC, array ColorSpace, self-cycle, and truncated Flate data, each in both serialization variants. No malformed fixture was rendered. No production font, writer, profile, capability, protected, or operations files were changed.

The two valid classic-xref representatives were rendered with `pdftoppm -png -r 72 -f 1 -l 1 -singlefile` and visually inspected:

- `valid-writer-baseline-classic-xref.png` — 375×250 PNG, expected opaque and alpha image blocks visible.
- `valid-jpeg-image-classic-xref.png` — 40×40 PNG, decoded 4×3 color mosaic visible; Poppler emitted no JPEG diagnostic. The embedded image dictionary is 4×3 DeviceRGB, 8 bpc, and the PNG is the 40 pt page at 72 dpi.

The first local JPEG attempt used an invalid hand-authored byte fixture and Poppler reported `Invalid SOS parameters for sequential JPEG`. That attempt remains historical diagnostic context only and is not labeled a valid-positive case. The retained positive fixture was regenerated locally with libjpeg `cjpeg` from a deterministic 4×3 PPM RGB bitmap; its source command and SHA256 are recorded in `jpeg-fixture-provenance.json` and asserted by the test.

The PDF skill's artifact marker command was attempted before generation but is unavailable in this checkout (`MODULE_NOT_FOUND` for `container_tools/mark_artifact_operation_started.mjs`); no upload or external artifact publication occurred. The retained PDFs were generated only by the explicit evidence flag above, and the default test does not create or modify retained evidence.
