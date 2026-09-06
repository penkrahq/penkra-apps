# Luna PDF content verification — 2026-09-06

Evidence for the bounded PDF content-operand/resource validation package. This is not PDF/X certification and does not promote any capability verdict.

## Scope and protected boundaries

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf`
- Branch: `codex/canvas-luna-pdf-20260906`
- Starting HEAD: `fc5bf629511620a45d02a77fd63162d0ec27a0e1`
- Implementation/test commits: `620ac8a1cece3ac57b5f76297e84bf36ca46703d` (`Complete PDF content operand and resource matrix`), followed by `775fa78b45d7103800eb62330f2f074e90f00799` (`Handle serialized Form and dangling PDF resources`)
- Allowed changed implementation/test files: `canvas/src/exporters/pdfx-preflight.mjs`, `canvas/src/exporters/pdfx-content-matrix.test.mjs`
- This evidence file is the only additional changed file. No TODO, AGENTS, INSTRUCTIONS, SKILL, operations, architecture, design, manifest, lockfile, emission table, PDF writer, font, metadata, profile asset, or capability-table file was changed.

## Before and after defects

Before this package, known operand arity/type checks were present, but named content resources were only checked for presence. A resolved wrong-kind graphics state, font, image/XObject, or marked-content property could therefore pass the named-resource lookup. State transitions also occurred after malformed state operators, and text positioning/show checks were not isolated to valid operand shapes.

After commits `620ac8a` and `775fa78`, resolved resources are checked from serialized bytes through direct, indirect, and inherited page resource dictionaries. `gs`, `Do`, `Tf`, and named `BDC` properties have bounded type/subtype checks; `Do` accepts only image `PDFRawStream`s, retains the existing outside-subset result for serialized Form streams, and rejects plain dictionaries as resource type-invalid. Dangling indirect values are locally treated as unresolved, including pdf-lib's serialized `PDFNull` result. Valid operand shapes are required before state transitions, while state remains shared across separate Contents streams. The accepted operator vocabulary, existing special `TL`/`T*`/`d` distinction, numeric color range behavior, `PDFX_UNCOVERED` entries, and `conformant: false` gate are unchanged.

## Matrix coverage

The new serialized fixture matrix covers all allowed operators with positive forms and malformed arity/type cases, including wrong positions and nested `TJ` members. It also retains literal and hex strings, escaped names, comments, CRLF/tab whitespace, compressed streams, uncompressed streams, unknown-operator rejection, out-of-range-but-finite colors, zero/negative `Tf` sizes, and the special machine distinction for `TL`, `T*`, and `d`.

Resource cases cover direct and indirect resources, inherited page `Resources`, missing categories, unresolved names, dangling indirect references, wrong object kinds, wrong `Type`, image subtype, real serialized Form-stream outside-subset handling, plain-dictionary/Form distinction, and valid generated resources. State cases cover graphics, text, and marked-content balance, underflow, unclosed blocks, nested text objects, text position/show outside `BT`/`ET`, and operator-looking text/comments across 2–3 content streams.

## Commands and results

1. `bun install --frozen-lockfile` in `canvas`: exit 0; 72 packages installed. No dependencies were copied from another worktree.
2. Baseline focused command before changes:
   `node --test src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-fonts.test.mjs src/export-service.test.mjs`
   Result: 29 passed, 0 failed/cancelled/skipped, exit 0.
3. Initial matrix execution retained during development: 8 passed, 3 failed, 0 cancelled/skipped, exit 1. The failures were fixture/test-construction issues: zero-operand operators were incorrectly treated as having a missing operand, a valid `Tf` resource was included in an all-invalid set, and a balanced state fixture omitted `BMC`. They were corrected without weakening implementation assertions.
4. Corrected pre-coordinator matrix-only command: 12 passed, 0 failed/cancelled/skipped, exit 0. After coordinator-requested Form/dangling-reference corrections, the matrix-only command was 13 passed, 0 failed/cancelled/skipped, exit 0.
5. Acceptance command:
   `node --test src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/export-service.test.mjs`
   Final result after coordinator corrections: **42 passed, 0 failed, 0 cancelled, 0 skipped**, exit 0. Retained output: `/tmp/luna-pdf-content-matrix-final-20260906.log`.
6. `git diff --check`: exit 0.

The acceptance run includes normal PDF extraction, embedded-font validation, and the no-publication regression: PDF/X rejection remains `CANVAS_PDF_PROFILE_UNVERIFIED` and leaves the destination absent. The positive exporter regression uses bundled GRACoL2013 CRPC6 printer ICC plus bundled sRGB through `exportPdf`; it reaches the unchanged `CANVAS_PDF_PROFILE_UNVERIFIED` gate with zero content-subset issues, rather than `CANVAS_PDF_PROFILE_INVALID`.

## Unrun and external-state notes

No package case is unrun. Native compilers, devices, full-suite compilation, commercial tools, publication, upload, and live Canvas document mutation were intentionally not performed. No device settings were changed; therefore no device setting restoration was required. Automated tests are not installed Dev1 QA and are not visual proof. The conformance gate remains closed and no capability verdict was promoted.
