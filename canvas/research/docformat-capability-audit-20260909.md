# Document-format capability audit — 2026-09-09

Baseline `509edd8`; scope: PPTX, standalone SVG, ordinary PDF/PNG extraction, and PDF/X-4.

## Capability result

- PPTX: 115 native, 12 raster, 16 ignore, 0 unverified.
- SVG: 128 native, 5 raster, 10 ignore, 0 unverified.
- PDF is DEC3's roleless N-node extraction artifact. It is not a module target and therefore has no role/capability table. Its static lowering registry contains executable shader paint, backdrop blur, and a live scrolling viewport. The IR additionally applies value-sensitive bounded lowerings for conic/mesh gradients, gradient-stop alpha, and tiled/repeated image paint. All other resolved node primitives pass directly to the PDF writer.
- PNG is a rendered-subtree artifact; native/editable capability verdicts are meaningless. Its contract is exact requested scale, subtree bounds, transparency, and artifact count.

`mergeCapabilityRows` rejects every duplicate membership, including same-verdict shadowing. The duplicate structural `properties.style` and SVG `properties.stroke.width` memberships were removed.

## Promoted and measured rows

PPTX promotions: `nodes.icon`, `properties.icon`, `properties.library`, `properties.weight`, `properties.flipX`, `properties.flipY`, `properties.decorative`, `properties.fill.image`, transformed linear/radial gradients, `properties.effect.blur`, stroke cap/join/dash, line height, and horizontal/vertical text alignment. Native ordered multi-paint arrays become ordered slide objects. Rectangular image paint uses DrawingML crop/contain sizing; image paint on ellipse/path masks is a bounded raster scope because rectangular `blipFill` cannot preserve the authored mask and stroke.

SVG promotions: native icons, image paint, linear/radial and transformed gradients, blur/shadow/spread filters, blend, inherited clipping, flips, stroke cap/join/dash, links, overflow clipping, ARIA landmark/link/heading semantics, paragraph alignment/style/list, line height, alignment and text growth. Ordered multi-paints emit ordered SVG geometry. Object-bounding-box image patterns use normalized image coordinates. Radial transforms scale and rotate about the authored asymmetric center.

PDF extraction adds source PNG/JPEG XObjects with fit/fill/stretch geometry, native clipping for ellipse/path/polygon/rounded masks, preserved mask strokes, center-relative rotation/flips, native icon paths, PDF stroke dash/cap/join operators, nonuniform rotated radial shadings, standard blend states, and renderer-shaped text placement. Rich text preserves safe links as annotations, per-run language markers, underline/strikethrough, and list markers. Unsafe links fail with a typed error. PDF remains roleless: neither document module nor frame role affects node selection, artifact count, geometry or lowering.

`compatibility/docformat-native-features.test.mjs` inspects serialized SVG/OOXML/PDF objects and renders them with installed Chrome, LibreOffice and Poppler. It covers nonzero-position masked image paint, asymmetric radial transforms, ordered multi-paint, PPTX mask fallback, DrawingML crop/contain/stretch behavior, native icon geometry, transformed PDF paths, clipping/strokes, text semantics, and source-image XObjects. `src/pencil-icon-provider.test.mjs` verifies exporter vector geometry for lucide, Feather, all three Material Symbols families, and Phosphor. The existing 20-case vector matrix renders paths/polygons at 1x and 2x in Chrome and Poppler and forbids image fallback.

## Retained format limits and non-emitting concepts

PPTX raster: blend/compositing isolation, arbitrary clipping, backdrop blur, shadow spread, angular/mesh gradients, executable shaders, scrolling viewport, inside/outside stroke, word spacing, and deterministic text-growth behavior. PresentationML has no interoperable primitive preserving the complete Canvas result. PPTX ignores static-export prototype flows, print guides, and heading/landmark/link-purpose semantics absent from ordinary slide shapes.

SVG raster: backdrop blur, angular gradient, mesh gradient, executable shader, and inside/outside stroke alignment in the portable SVG 1.1 profile. SVG ignores prototype flows, speaker notes, and PDF-only/authoring guides.

PDF's static and value-sensitive raster lowerings are listed above. Prototype-flow and document-role concepts never enter roleless extraction; they are not PDF rows and are not silently classified as node capabilities. Ordinary PDF can contain safe link annotations; the narrower PDF/X-4 writer subset rejects annotations and therefore fails closed if linked text is present.

## Extraction and forced raster

`src/luna-extraction-artifact-matrix.test.mjs` covers 12 translated roleless roots in PNG/SVG/PDF (36 single artifacts), three-node directory extraction in each format, a three-page exact-file PDF, physical mm/bleed boxes, and PDF/X output. PNG asserts exact 2x dimensions and marker/path bounds; SVG renders in Chrome; PDF renders in Poppler and native paths have no image XObject.

`export: "image"` remains an unconditional root/node override before any lowering decision. `src/exporter-ir.test.mjs` verifies complete-frame and roleless-node rasterization while default export never forces rasterization.

## PDF/X-4 closure

The Canvas writer emits a closed `%PDF-1.6` classic-xref envelope with hash-pinned GRACoL2013 CRPC6 output intent, sRGB2014 source/default RGB, transparency group, embedded fonts/images, XMP/Info/ID crosswalk, page boxes, and bounded resource/content graphs. `preflightPdfx4` now returns `conformant: true` only when every serialized envelope, object graph, metadata, ICC, page-tree, font, image, graphics-state, name, numeric/token, architectural-limit, content-state and excluded-feature check passes. `exportPdf` refuses PDF/X publication unless both aggregate conformance and the Canvas-writer-subset gate are true.

There are zero uncovered checks inside the closed Canvas writer envelope (`PDFX_UNCOVERED` is empty). Arbitrary third-party PDFs, alternative profiles/color spaces/fonts/serializers, incremental updates, forms, annotations, optional content, external resources and other non-writer constructs are rejected as outside the envelope rather than treated as unvalidated permitted input.

The focused PDF/X run covers 533 tests, including 12 real `exportPdf` candidates, three export-time rejection controls, both classic/object-stream negative fixtures where applicable, and serialized metadata/font/image/graphics/resource/token matrices. The wider PDF/X suite covers 1,091 tests; after gate closure its only initial failures were stale assertions that aggregate conformance must remain false, and the updated focused rerun passed 533/533.
