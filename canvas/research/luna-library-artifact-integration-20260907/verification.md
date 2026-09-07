# Published-library artifact integration

Date: 2026-09-07

This is bounded regression evidence, not an overall conformance claim. The
release registry used here is an in-memory reader for this test. Durable
release storage, accepted-content-after-revocation persistence, and backend
publication were not tested or implemented.

## Integration seam

The end-to-end artifact cases pass the original consumer document to the
public export service. Loaded release imports are carried as
`request.imports` for PPTX/HTML and as `options.imports` for SVG/PDF
extraction, matching the wiring in `src/operations.mjs`. The flattened
`resolveCanvasDocument` result is used only by resolver assertions and is not
the artifact input.

## Results

Focused command (exit 0):

```text
node --test src/export-service.test.mjs src/export-bundle.test.mjs src/export-publication-matrix.test.mjs src/canvas-imports.test.mjs src/canvas-resolver.test.mjs src/library-publication.test.mjs src/library-publication-service.test.mjs src/library-item-content.test.mjs src/luna-library-artifact-integration.test.mjs
```

Totals: 65 passed, 0 failed, 0 cancelled, 0 skipped.

The new integration matrix recorded:

- release selection: v1 remains selected after v2 publication; explicit v2 changes resolved colors;
- qualified public variable, paragraph style, and component resolution across light/dark source modes;
- consumer-local token/style identity remains local; source and consumer remain unchanged on success and failure;
- private direct reference, missing public item, and wrong content hash failures with stable codes `CANVAS_LIBRARY_ITEM_PRIVATE` and `CANVAS_LIBRARY_INTEGRITY`;
- PPTX semantic XML contains `Library card`, `Qualified style`, both library colors, and no `<p:pic>` fallback;
- HTML route bundle contains original slash-qualified IDs and ordinal raster references with real PNG signatures; browser rendering was exercised with the existing isolated Chrome helper and color samples for light, dark, and local content;
- roleless SVG contains native rectangle/vector color records and also contains rasterized text images (`hasImage: true`); this is recorded behavior, not a claim of all-vector text;
- roleless PDF has one page, zero image XObjects, extracted `Qualified style`, `Library card`, and `Local style` text, and `Inter-Regular` embedded (`emb=yes` from `pdffonts`);
- collision preflight leaves the destination absent; iOS and Android remain honest `CANVAS_CAPABILITY_UNVERIFIED` gates with no destination artifact.

## Web raster-name defect and fix

Historical pre-fix reproduction: exporting the original consumer plus
`request.imports` for HTML failed before publication with
`CANVAS_EXPORT_NAME_INVALID` at `route-card/card-label`, because the web
exporter validated an internal slash-qualified IR node ID as a bundle path.

The authorized minimal fix maps each IR raster ID to deterministic internal
names `assets/raster-${index + 1}.png`. Original IDs remain in the IR,
report, and HTML element IDs. The focused regression adds
`route-a/b-c` and `route-a-b/c`, which both collapse to the same string if
slashes are replaced with hyphens; the published bundle has distinct ordinal
PNG references and valid PNG signatures. An unrelated pre-existing sentinel
file remains byte-identical.

## Retained corpus

Opt-in command (exit 0):

```text
node scripts/luna-library-artifact-generate.mjs --output=/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-delivery/canvas/research/luna-library-artifact-integration-20260907/corpus
```

The generator retained 8 representative artifact files under `corpus/` and
removed its temporary build directory in `finally`. The complete hash and
byte manifest is [corpus/manifest.json](corpus/manifest.json). Retained
artifacts are `library.pptx`, `library.html`, `styles.css`,
`assets/raster-1.png`, `assets/raster-2.png`, `assets/raster-3.png`,
`library.svg`, and `library.pdf`.

Independent retained-file inspection found PPTX text/colors and no picture
fallback, HTML original IDs plus four ordinal asset references, SVG viewBox
`0 0 420 240` with native rectangles and embedded raster text, and a one-page
PDF with extracted text, zero image XObjects, and embedded Inter.

No mobile compiler/device work, Canvas document mutation, host release, or
durable-library persistence claim was made.
