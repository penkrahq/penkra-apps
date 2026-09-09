# Canvas Architecture revision 4 — implementation and gate evidence

> Evidence ledger, not an executable plan. Consolidated unclosed gates are reconciled into the
> ignored Canvas `TODO.md`, which is the App's only planning authority.

Date: 2026-09-04

> **Current-status note (2026-09-09):** The fail-closed counts below are historical evidence from
> the dated run, not the present capability state. The completion pass now has zero unverified
> deliverable rows; see `research/unverified-capabilities.md`. Mobile rows are closed from retained
> simulator/emulator evidence or concrete representation limits, and PDF/X-4 is the gated
> roleless-extraction profile rather than a module capability row.

## Code-review correction pass

Protected on branch `codex/canvas-architecture-rev4`:

- baseline implementation commit: `cfd5e98`;
- fail-closed review fixes commit: `d9b8b2e`.
- settled paragraph/mark/axis/variable/deleted-reading-order semantics: `29024c8`.
- historical handshake/manifests work in `8365aba`, `382a5cf`, `ebb07e7`, `003cc0f` and `6f31230`
  was subsequently deleted after the clean-cut decision; the hashes remain provenance, not product
  behavior.
- measured exporter capabilities and verification-only artifact seam: `aa2d2a9`.
- complete M1 range remapping and nested canonical schema: `7e3d256`, `f4bab4b`, `af3e6d3`.
- print-profile deltas and declared-only physical export sizes: `4ba9375`.

The capability-table default is `{ verdict: null, status: "unverified" }`, and any unverified status
blocks regardless of a provisional verdict. The generated inventory is 143 paths. Local
OOXML/LibreOffice, PDF/veraPDF, Chrome and SVG artifacts resolved or conservatively classified every
locally measurable row. The 2026-09-04 product decision marks all 36 flow rows `ignore`, because
Canvas exports static designs. Production still fails closed on 104 entries: 52 iOS rows, 51 Android
rows, and the PDF/X-4 profile gate. The
complete enumeration is `research/unverified-capabilities.md`. A symbol-gated verification IR lets
tests generate an explicitly named candidate artifact without exposing a JSON-operation bypass.

Other corrections in `d9b8b2e`:

- corrected start-boundary mark stickiness and tested both boundaries for all eleven declared mark
  kinds;
- replaced the loose `{value}` array sniff with a closed cascade-entry shape, so marks are never
  interpreted as variants;
- made nested component prop scope lexical;
- remapped expanded notes targets and typed flow sources;
- removed filename sanitisation and routed generated asset names through the rejecting validator;
- compute consequences from all evaluated nodes before raster-scope descendants are removed;
- wired root, role and relationship capability paths into IR evaluation;
- statically reject mutual component recursion and fully validate typed flow paths;
- clip same-type marks at write time and reject overlapping stored ranges;
- remap M1 rich-text ranges when `$name` becomes `${name}`;
- resolve and consume named `paragraphStyles`;
- fail rather than crop effect rasters, guess raster PPI, derive slide physical size, or silently
  downscale an 8192-pixel export.

The later clean-cut decision removed census-driven and sequence-fenced migration entirely. There is
no registered corpus, manifest, or automatic open-path migration. Migration is an explicit
one-document copy run; ambiguous legacy content takes a best-effort outcome recorded in its prose
Markdown report.

This is an evidence ledger. A stage is marked **closed** only when the exact §17 gate was run. Code
existing for later stages is recorded even when an earlier or environment-dependent gate remains
open. No unsupported mechanism has been invented to make a gate appear green.

## Stage 1 — Canvas unblock — open

Implemented lazy inspection and screenshot loading, projection-only reads, streamed visitor `Get`,
explicit selector validation, structural mutation tracking, and removal of the double whole-document
JSON comparison in `src/operations.mjs`, `src/script-runtime.mjs`, `src/document-inspection.mjs` and
`src/canvas-api.mjs`.

Measured on the installed app:

- SchoolBase Admin: visitor `Get("*", callback, { limit: 10000 })` traversed all 2,063 nodes in
  approximately 10.5 seconds.
- An unknown selector (`bogus:frame`) failed and named itself.
- Atferd `Print(1)` still exceeded the host's 30-second operation deadline on the deployed build.
  Backend and Canvas client now both support 8 MiB snapshot ranges (`003cc0f`), and backend tests
  pass, but that server change is not deployed in the connected Penkra instance.

The exact Stage 1 gate is therefore not closed. The remaining fix is a deployed server transport
change; further controller-side inspection optimisations do not remove the transfer floor.

## Stage 2 — surviving research gates — closed

Evidence and exact commands are in `penkra-apps/canvas/compatibility/stage-2-gates.md`.

- Q17: Node cannot read browser IndexedDB. Bundled/document-owned font bytes are reachable; an
  arbitrary browser-cached face is not.
- Q18: the controller successfully wrote an arbitrary absolute temporary path.
- The earlier version-handshake spike was deleted with the speculative protocol; it is not a gate or
  shipped behavior.
- The PptxGenJS-plus-raw-OOXML fixture survived ZIP injection and LibreOffice round-trip in
  `src/ooxml-package.test.mjs`.
- The pinned Swift 6.2.3/Xcode 26.2 fixture compiles, and the pinned Gradle 8.13/AGP 8.12.0/Kotlin
  2.0.21/Compose BOM 2025.06.01 fixture assembles.

## Stage 3 — fork and interpolation — closed

The owned fork is active through `src/openpencil-engine.mjs` importing
`vendor/open-pencil/engine.source.mjs`. Upstream commit
`4a5e7d557064d941fbac88bd492586db5257ff5f` and the source artifact SHA-256 are pinned in
`vendor/open-pencil/PROVENANCE.json`. The patch ledger now contains 47 entries because rich-text
CanvasKit run support was added after the original 46-patch reconstruction.

The later 2026-09-04 product decision deletes Pencil file compatibility completely. The `.pen`
picker, drag/drop importer, downloader, parser seam, format corpus, differential oracle and
format-only fixtures are removed. The owned scene/layout/renderer fork remains; its active seam now
adapts an already-materialized Canvas object through `createCanvasSceneGraph`. The canonical schema
drops the obsolete OpenPencil format marker. Migration of stored Canvas documents is unaffected
because it never reads Pencil files. Interpolation tests prove multiple `${…}` references and
preserve `$18.40` as literal text.

## Stage 4 — schema and base resolver — implementation complete

Implemented:

- one machine-readable nested schema for root fields, nodes, physical sizes, marks, paragraphs,
  imports, flows, axes, variables and component properties; recursive structural validation and the
  143-path capability inventory are generated from it, with cross-field constraints layered as
  semantic validators;
- axes, condition AST, typed bindings, variable interpolation, ref expansion, consequences and
  namespace handling in `src/canvas-resolver.mjs`;
- every M1–M8 and M10–M18 best-effort transform, with no version discriminator, manifest, sequence
  fence, owner-open route, or automatic migration path.

Opening a document returns its stored projection only. The canonical schema, validator, resolver and
generated inventory gates pass locally. By the dated product decision, all 36 flow paths are
`ignore`: Canvas exports static designs and exporter IR emits an empty `flows` array.

## Stage 5 — rich text core — partially closed

Implemented and measured:

- `[from,to)` UTF-16 validation, paragraph partitioning, mark flattening and boundary stickiness;
- character-level Y.Text collaboration; the two-client test preserves both concurrent edits and
  mark boundaries;
- Canvas marks feed OpenPencil/CanvasKit style runs (weight, italic, underline, strikethrough,
  family, size, letter/word spacing, language and solid fill);
- editor text and formatting changes persist back to Canvas marks, retaining nonvisual hyperlinks;
- new text nodes receive valid empty/nonempty mark and paragraph structures;
- run language is consistently lowered from the schema's `lang` mark into exporter IR `language`.

Paragraph split and merge policy is now settled and implemented: a split inherits the source
paragraph style; deleting a newline keeps the second paragraph's style. Marks use one `inclusive`
policy (default true, false for link and lang), and same-type writes clip existing ranges.

## Stage 6 — components and deliberate copy migration — implementation complete

Typed properties, AST conditions, lexical namespaces, recursively pinned cross-document imports,
asset namespacing and inline ref expansion are implemented. The deliberate migration pipeline reads
one source projection, applies all transforms best-effort, validates and creates a copy, transfers
assets, verifies the copied projection, writes a per-document prose Markdown report, and then renames
the untouched original as superseded. Failed copies go to recoverable Trash. M4 materializes refs;
M5 deletes editor chrome; ambiguous M10/M11 cases never block. No production migration was run.

## Stage 7 — exporter IR — implementation complete, constants resolved

`src/exporter-ir.mjs` emits resolved and semantic projections with parent/z-order, clipping,
isolation, physical units, sRGB, text runs/paragraphs, active capability paths, consequences and
raster scope. Tests prove exact tree reconstruction, leaf mesh rasterisation, backdrop widening and
isolation-boundary/subsumption behaviour.

Effect outsets now match the renderer's sigma=`radius/2` convention and Skia's three-sigma kernel
support, including asymmetric shadow offsets and spread. PPI/scale variants are explicit for slide,
page, web, iOS and Android roles, and oversized renders fail rather than silently downscale. Primary
sources and derivations are in `research/export-constants-and-flow-prior-art.md`.

## Stage 8 — deck export — implementation present, gate open

`src/exporters/pptx.mjs` emits editable text runs, paragraphs/lists, native shapes, gradients,
shadows, notes, alt text and embedded raw font parts. Unsupported active paths are
rasterised through the capability table. A real installed-app export produced editable `a:t` runs,
native `roundRect`, slide background, `descr` alt text and embedded Inter; LibreOffice round-trip
retained the `.fntdata` parts. The disposable QA Canvas document and temporary directory were moved
to recoverable Trash.

The exact gate requires PowerPoint rendering, Q20 line-break measurement on the real decks, and a
reopen on a machine without the font installed. No PowerPoint/no-font runner exists locally, so none
of those measurements is claimed. `p:transition` is also not emitted: §17 requires it, but §7.7
explicitly defers the transition payload vocabulary. Hyperlinks are implemented; inventing a
transition payload is not.

## Stage 9 — layout exposure — closed

The fork exposes wrap, independent row/column gaps, min/max constraints, grid tracks and placement
through Yoga. `src/layout-exposure.test.mjs` measures resolved grid geometry; the same nodes lower to
native PPTX shapes rather than a grid container artifact.

## Stage 10 — print export — partially closed

`src/exporters/pdf.mjs` emits physical pages, embedded fonts, sRGB output intent, PDF/A-3b metadata,
and a tagged PDF/UA-1 structure tree with parent tree, language, headings, paragraphs, figures, alt
text and artifacts. Pinned veraPDF 1.30.2 reports PASS for PDF/A-3b and PDF/UA-1. A4 is declared as
210 × 297 mm.

PDF/X-4 remains deliberately build-blocked (`CANVAS_PDF_PROFILE_UNVERIFIED`) because no PDF/X
preflight tool or validated package is available. The exporter therefore cannot be mislabeled, but
the §17 “each profile” gate is not closed. Declared trim and bleed now emit MediaBox, CropBox,
BleedBox and TrimBox; fold marks are constrained to the bleed band. Artifact inspection confirms the
box geometry, but it is not PDF/X-4 conformance evidence.

## Stage 11 — web export — responsive/static contract measured

`src/exporters/web.mjs` emits hierarchical semantic HTML/CSS rather than a flat absolute scene. An
actual Google Chrome CDP test verifies grid tracks, media-query changes at 360/900/1280 px,
`prefers-color-scheme`, hover state, document language and the accessibility heading/name/level.
Root-frame layout, paint and semantics are included; responsive rules override base styles.

The six flow rows are explicitly ignored by the static-export product decision. Component-binding
combinations still need the full corpus matrix, so the exact stage gate is open.

## Stage 12 — SwiftUI export — implementation present, gate open

The exporter emits hierarchical `ZStack`/`HStack`/`VStack`, `LazyVGrid`, a bundled `FlowLayout`,
styled rich text, dynamic fonts and accessibility labels/headings in document tree order. Generated source
compiles in the pinned fixture and semantic-source assertions pass.

The required UI/accessibility snapshots at two devices × two dynamic-type sizes are not present;
compilation is not claimed as fidelity. Flow navigation is intentionally outside static export.

## Stage 13 — Compose export — implementation present, gate open

The exporter emits hierarchical `Box`/`Row`/`Column`, `LazyVerticalGrid`, `FlowRow`, annotated rich
text and accessibility semantics in document tree order. Generated source assembles in the pinned Gradle
fixture and semantic-source assertions pass.

The required UI/accessibility snapshots at two devices × two font scales are not present. Flow
navigation is intentionally outside static export.

## Stage 14 — PNG and SVG export — locally closed

The shipped operation and plan both use `documents.export-image`. A requested-scale PNG and an SVG
subtree were generated from a disposable Canvas copy and the local operation test repeats both. The
SVG table is total across all 143 paths: measured vector/text/accessibility constructs are native and
every unsupported construct is explicitly raster or ignore. US-8 passes. This closes the local Stage
14 gate without claiming the global bundle can build while earlier tables remain unverified.

## Final QA matrix

- Canvas full suite: 298/298 PASS after deleting the retired Pencil-format corpus and replacing its
  sizing/round-trip coverage with native Canvas fixtures. The pinned SwiftUI and Compose builds,
  Chrome semantic/accessibility run, veraPDF checks and OOXML round-trip all ran in this pass.
- Canvas production build: FAIL CLOSED with `CANVAS_CAPABILITY_INCOMPLETE` on 104 unverified
  entries; no production bundle was emitted.
- Packaged Canvas app validation: PASS, 11 public operations.
- Final rebuilt Canvas app sideload: PASS.
- Backend: 46 files / 216 tests PASS; contracts and server typechecks PASS.
- Host monorepo: 11/11 typecheck/build tasks PASS.
- Pinned mobile fixture compiles: PASS.
- Chrome semantic/responsive/accessibility test: PASS.
- veraPDF PDF/A-3b and PDF/UA-1: PASS.
- LibreOffice PPTX package round-trip: PASS.

## Unclosed gates, consolidated

These are not “implementation is probably fine” claims. They are the exact missing evidence or
architecture input:

1. Stage 1: deployed large-projection transport that returns Atferd `Print(1)` within 30 seconds.
2. Stage 6: production migration is a separately authorized one-document-at-a-time action; no
   automatic or corpus-wide migration gate remains.

## Pencil file-compatibility deletion verification — 2026-09-04

- The product UI no longer exposes picker import, drag/drop import or `.pen` download.
- The active engine bundle exports `createCanvasSceneGraph` for an already-materialized Canvas
  object and contains no `parsePenFile` function. Its rebuilt SHA-256 is recorded in
  `vendor/open-pencil/PROVENANCE.json`.
- The OpenPencil core IO registry no longer registers a `pen` format adapter, and the Canvas render
  adapter no longer decodes library assets as nested Pencil documents.
- Pencil format fixtures, format corpus/oracles and their differential tests are deleted. Fixed and
  fill-width sizing plus normalized Yjs round-trips are covered by native Canvas object fixtures.
- Stored-document migration remains independent of Pencil parsing: it restores the stored Canvas
  projection/Yjs state, applies the M1–M18 transforms, validates and writes a copy.
- `npm test`: 298/298 passed. `npm run build:dev`: passed. `npm run build`: failed closed, as
  intended, on 52 iOS rows, 51 Android rows and the unverified PDF/X-4 profile.
3. Stage 5: the four visible editor checks—Enter split, newline merge, mark inclusivity and
   same-type clipping—require this Thread's Canvas pane to remain visibly frontmost during the pass.
4. Stage 8: PowerPoint runner, no-font machine and Q20 measurement. Flow transitions are ignored.
5. Stage 10: PDF/X-4 implementation/preflight; bleed, fold and page-box lowering is implemented.
6. Stages 11–13: run the full component corpus and mobile UI/accessibility snapshot runners. The 103
   mobile rows remain fail-closed pending those snapshots.

## Canvas editor UI QA visibility constraint

Ownership is necessary but not sufficient. A retained ready tab owned by the caller returns only a
bare document accessibility node when its pane is not the visible shell pane. The same result was
observed for caller-owned Canvas and Explorer tabs, so this is not App-specific. There is no agent
focus/activate operation. The operating manual says semantic observation and element actions can
address retained tabs while another tab is visible, but observed behavior supplies no usable tree in
that state. The four checks remain assigned here and require the user to keep this Thread's Canvas
pane frontmost for the duration of one pass.

## Repository safety

- Unrelated existing changes under `penkra-apps/explorer/` were preserved.
- No Canvas document was permanently deleted. QA documents were moved to recoverable Trash.
- No app was published and no external messages or effects occurred.
