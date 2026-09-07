# PDF page-tree preflight guard — 2026-09-07

This is a bounded serialized page-tree validation integration. It is not PDF/X certification and does not open the publication gate.

## Branch and commits

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/pdf-envelope-wiring`
- Branch base before this package: `b6fae6d94d99e4f4cca801a3e82c5d32c6e3055`
- Reviewed root commits applied in order: `c06ac7d` → local `8729e41`; `bd6e52c` → local `13da432`
- Reviewed independent commits applied in order: `4c73239` → local `9228c80`; `d7ef874` → local `9787af5`
- Wiring source commit: `d2003f8`
- Wiring regression commit: `fca4673`
- Evidence commit: pending after this report

`pdfx-preflight.mjs` now calls `inspectPdfPageTree(pdf)` immediately after successful `PDFDocument.load`, before `inspectPdfxSubsetPolicy`, `getPageCount`, or `getPages`. It appends page-tree issues to the existing envelope issues and returns the normal report early when any page-tree issue exists. The gate, `conformant:false`, and uncovered list are unchanged.

## Serialized regression matrix

The retained input is `research/luna-pdfx-document-negative-matrix-20260907/valid-candidate-control-classic-xref.pdf`. The valid baseline and each mutation are reloaded as serialized bytes before preflight. Every report is repeated for deterministic ordering, and each input SHA-256 is unchanged after validation.

Cases:

- valid retained candidate: zero `PDF_PAGE_TREE_INVALID` issues;
- `Count999`;
- `missingParent`;
- `wrongParent`;
- `duplicatechild`;
- `cycle`;
- `malformedKids`.

Every invalid case reports the exact stable code `PDF_PAGE_TREE_INVALID`, with no throw or timeout. Cycle and malformed-`Kids` bytes use same-length raw classic-xref mutations because pdf-lib’s serializer itself traverses those malformed trees and otherwise throws before producing a fixture; the resulting bytes are reloaded successfully before preflight. This is fixture construction only and is not a production finding.

## Commands and results

Commands ran in the worktree `canvas` directory.

| Command | Exit | Result |
|---|---:|---|
| `node --test src/exporters/pdf-page-tree.test.mjs src/exporters/luna-pdf-page-tree-independent.test.mjs src/exporters/pdfx-page-tree-preflight.test.mjs` | 0 | 19 passed, 0 failed, 0 cancelled, 0 skipped |
| `node --test src/exporters/*.test.mjs src/export-service.test.mjs` | 0 | 762 passed, 0 failed, 0 cancelled, 0 skipped; duration 26.967 s |
| `git diff --check` | 0 | clean |

Full-run log: `/tmp/pdf-page-tree-wiring-run-9k7tBX/full-selection.log`.

No native compilers, devices, GUI work, retained binary generation, profile changes, or capability changes were used.

## Scope observations

- Page-tree rejection occurs before recursive/cached page traversal, preventing cyclic or malformed trees from reaching existing page APIs.
- Envelope issues remain present in reports for serialized inputs.
- No validator outside `pdf-page-tree.mjs` and the narrow preflight invocation was changed.
