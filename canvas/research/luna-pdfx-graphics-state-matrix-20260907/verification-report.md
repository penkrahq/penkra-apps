# Serialized graphics-state context verification

Date: 2026-09-07

This package records the graphics-state observation history and the narrow omitted-`Type` resource-context correction. It does not modify the profile gate, capability tables, or protected files, and it makes no PDF/X certification claim. The pre-production-fix records are retained separately under `historical-pre-production-fix/`.

## Matrix and execution

- 72 explicitly named fixtures × 2 serializers (`classic-xref`, `object-streams`) = 144 serialized identities.
- Every identity was saved, reloaded, passed to `preflightPdfx4`, inspected twice in order, and checked for unchanged input SHA256 bytes.
- Exact dimensions were 200×300 points with valid MediaBox, TrimBox, and BleedBox.
- Matrix fields: `ca`, `CA`, `BM`, `SMask`, `RI`, `TR2`, `TR`, `HT`, `HTP`, `BG`, `BG2`, `UCR`, and `UCR2`.
- Topologies: direct, indirect, inherited, inherited-indirect, shared state across two pages, two states switched twice, and dangling state resource.
- The decisive negative fields (`ca=-0.1`, `CA=1.1`, `BM=Multiply`, dictionary `SMask`) were repeated with Type `ExtGState`, omitted Type, and wrong Type.

Gated generation command:

```text
cd /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas
LUNA_PDFX_GRAPHICS_STATE_RETAIN_EVIDENCE=1 node --test src/exporters/luna-pdfx-graphics-state-matrix.test.mjs
```

Exit 0: 148 passed, 0 failed, 0 cancelled, 0 skipped. The post-fix default read-only matrix command passed 149/149 with 0 failures, cancellations, or skips and wrote no files. The dedicated serialized resource-context command added 29/29 passing tests. The retained directory contains 8 regenerated post-fix PDFs, two current JSON manifests, four Poppler PNG renders, this report, and historical pre-correction and pre-production-fix manifests/reports (648 KB total including historical records).

The full assigned focused command exited 0 with 523 passed, 0 failed, 0 cancelled, and 0 skipped:

```text
node --test src/exporters/pdfx-images.test.mjs src/exporters/luna-pdfx-image-matrix.test.mjs src/exporters/luna-pdfx-font-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-serialized-corpus.test.mjs src/export-service.test.mjs src/exporters/luna-pdfx-graphics-state-matrix.test.mjs src/exporters/luna-pdfx-extgstate-context.test.mjs
```

## Established Type-present observations

For Type `ExtGState`, existing checker codes and paths were asserted. A representative direct-resource path is `1 0 R/Kids[0]/Resources/ExtGState/State/<field>`; `RI` and `TR2` use the existing dictionary path without a field suffix. Observed codes across the 144 identities were:

| Code | Identity count |
| --- | ---: |
| `TRANSPARENCY_ALPHA_INVALID` | 24 |
| `BLEND_MODE_OUTSIDE_SUBSET` | 8 |
| `SOFT_MASK_OUTSIDE_SUBSET` | 6 |
| `RENDERING_INTENT_INVALID` | 4 |
| `TRANSFER_FUNCTION_FORBIDDEN` | 4 |
| `GRAPHICS_STATE_KEY_FORBIDDEN` | 14 |
| `CONTENT_RESOURCE_TYPE_INVALID` | 10 |
| `CONTENT_RESOURCE_UNRESOLVED` | 2 |

The minimal PDF baseline's unrelated issues were retained separately in each result, including missing output intent, missing XMP, invalid trailer ID, missing DefaultRGB, and missing transparency group. No global `conformant` or universal pass assertion was made.

## Omitted-Type resource-context correction

The preexisting broad matrix keeps 15 named fixtures (30 serialized identities) marked `coordinator-review` for null/array alpha values, name-array blend mode, omitted-Type dictionaries, wrong-Type dictionaries, and repeated decisive negatives; those observation records remain unchanged in shape. Corrected topology assertions verify the reloaded dictionary itself: omitted cases have no `/Type`, present cases have `/Type /ExtGState`, and wrong cases have exactly `/Type /Font`.

- The new `luna-pdfx-extgstate-context.test.mjs` serialized 14 explicitly named fixtures through both classic-xref and object-stream writers (29 tests including document-isolation). Valid omitted-Type dictionaries remain free of type errors across direct, indirect, inherited, and shared/repeated resource contexts.
- Omitted-Type `ca=-0.1`, `CA=1.1`, `BM=Multiply`, dictionary `SMask`, and forbidden `TR` now receive the existing field codes at the `gs` location, for example `Page[0]/Contents[0]/gs/ca`, `/CA`, `/BM`, `/SMask`, and `/TR`. Shared pages receive deterministic page-specific paths; repeated `gs` receives one issue per operation.
- Wrong Type still produces exactly the existing `CONTENT_RESOURCE_TYPE_INVALID` at `Page[0]/Contents[0]/gs`; it does not receive omitted-Type field validation.
- Type-present invalid `ca` remains one whole-document issue at its existing dictionary path and does not receive a duplicate `gs`-location field issue.
- null/name-array values were recorded but not assigned a normative verdict.

The prior invalid-fixture results and report are preserved under `historical-pre-correction/`; the immediately pre-production-fix results are preserved under `historical-pre-production-fix/`. They document that the earlier `undefined` default parameter accidentally reinstated `/Type /ExtGState`, and that the pre-fix resource-context traversal bypassed omitted-Type field checks. These are measurement history, not policy decisions.

## Ordinary exporter controls and gate

Four actual ordinary `exportPdf` fixtures were serialized and rendered with Poppler at 72 DPI. All were 150×225 PNGs and were visually inspected:

- alpha 0 fill: blank/transparent control;
- alpha 0.5 fill: green control;
- alpha 1 fill: blue control;
- alpha 0.5 stroke: yellow outline control.

The exact emitted state inventory is retained in `case-results.json`: each control emitted `Type=ExtGState`, with `ca` and `CA` respectively `0`, `0.5`, `1`, and `0.5` as applicable. A fully configured PDF/X-4 `exportPdf` attempt remained fail-closed with observed code `CANVAS_PDF_PROFILE_UNVERIFIED`, `conformant:false`, and no bypassed PDF/X bytes.

The PDF-skill artifact marker command was attempted once before authoring but is unavailable in this checkout (`MODULE_NOT_FOUND` for `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas/container_tools/mark_artifact_operation_started.mjs`); this is retained as an execution diagnostic.
