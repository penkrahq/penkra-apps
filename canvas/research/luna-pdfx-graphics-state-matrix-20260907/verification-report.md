# Serialized graphics-state context verification

Date: 2026-09-07

This package is observation-only. It does not modify preflight production code, the profile gate, capability tables, or protected files, and it makes no PDF/X certification claim.

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

Exit 0: 148 passed, 0 failed, 0 cancelled, 0 skipped. The default read-only command passed 149/149 with 0 failures, cancellations, or skips and wrote no files. The retained directory contains 8 PDFs, two JSON manifests, four Poppler PNG renders, and this report (248 KB total).

The full assigned focused command (the existing 345-test focused set plus this matrix) exited 0 with 494 passed, 0 failed, 0 cancelled, and 0 skipped.

## Established Type-present observations

For Type `ExtGState`, existing checker codes and paths were asserted. A representative direct-resource path is `1 0 R/Kids[0]/Resources/ExtGState/State/<field>`; `RI` and `TR2` use the existing dictionary path without a field suffix. Observed codes across the 144 identities were:

| Code | Identity count |
| --- | ---: |
| `TRANSPARENCY_ALPHA_INVALID` | 28 |
| `BLEND_MODE_OUTSIDE_SUBSET` | 10 |
| `SOFT_MASK_OUTSIDE_SUBSET` | 8 |
| `RENDERING_INTENT_INVALID` | 4 |
| `TRANSFER_FUNCTION_FORBIDDEN` | 4 |
| `GRAPHICS_STATE_KEY_FORBIDDEN` | 14 |
| `CONTENT_RESOURCE_TYPE_INVALID` | 10 |
| `CONTENT_RESOURCE_UNRESOLVED` | 2 |

The minimal PDF baseline's unrelated issues were retained separately in each result, including missing output intent, missing XMP, invalid trailer ID, missing DefaultRGB, and missing transparency group. No global `conformant` or universal pass assertion was made.

## Coordinator-review observations

15 named fixtures (30 serialized identities) were marked `coordinator-review`: null/array alpha values, name-array blend mode, omitted-Type dictionaries, wrong-Type dictionaries, and the repeated omitted/wrong-Type decisive negatives. Their observed results were recorded without asserting an intended acceptance or rejection. Examples:

- omitted Type with `ca=-0.1`, `CA=1.1`, `BM=Multiply`, or dictionary `SMask` still received the corresponding whole-document field code under current traversal;
- wrong Type produced the existing `CONTENT_RESOURCE_TYPE_INVALID` at `Page[0]/Contents[0]/gs` and did not receive the Type-present whole-document field check;
- null/name-array values were recorded but not assigned a normative verdict.

These are measurements of current checker coverage, not policy decisions.

## Ordinary exporter controls and gate

Four actual ordinary `exportPdf` fixtures were serialized and rendered with Poppler at 72 DPI. All were 150×225 PNGs and were visually inspected:

- alpha 0 fill: blank/transparent control;
- alpha 0.5 fill: green control;
- alpha 1 fill: blue control;
- alpha 0.5 stroke: yellow outline control.

The exact emitted state inventory is retained in `case-results.json`: each control emitted `Type=ExtGState`, with `ca` and `CA` respectively `0`, `0.5`, `1`, and `0.5` as applicable. A fully configured PDF/X-4 `exportPdf` attempt remained fail-closed with observed code `CANVAS_PDF_PROFILE_UNVERIFIED`, `conformant:false`, and no bypassed PDF/X bytes.

The PDF-skill artifact marker command was attempted once before authoring but is unavailable in this checkout (`MODULE_NOT_FOUND` for `container_tools/mark_artifact_operation_started.mjs`); this is retained as an execution diagnostic.
