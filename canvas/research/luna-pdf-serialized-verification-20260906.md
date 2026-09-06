# Luna PDF serialized corpus verification — 2026-09-06

Evidence for portable serialized regressions over the existing Canvas content matrix. This verifies serialized parser behavior only; it is not PDF/X certification and does not change or promote the profile gate.

## Scope and changed files

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf`
- Branch: `codex/canvas-luna-pdf-20260906`
- Starting HEAD: `cd8ef6e56c38fc80e23f4b4d3abc88e09e657f68`
- New files only: `canvas/src/exporters/pdfx-serialized-corpus.test.mjs` and this evidence file.
- No production source, prior test, protected prose, profile gate, capability table, or binary corpus was changed.

## Corpus design

Fifteen named fixtures are each serialized in four variants: raw Contents versus Flate-compressed Contents, and classic xref versus `useObjectStreams:true`. Every variant is loaded with `PDFDocument.load`, passed to `preflightPdfx4`, and checked for the expected content issue code and exact issue object path. This is 15 × 2 × 2 = **60 explicit named serialization cases**:

- valid balanced `q/Q` and `BT/ET`;
- invalid `cm` arity and invalid nested `TJ` member;
- unknown operator;
- missing and wrong-type `gs` resources;
- valid Image `Do`;
- serialized Form `Do` outside-subset;
- wrong-type Font `Tf`;
- missing Properties `BDC`;
- balanced marked content across three Contents streams;
- graphics underflow, text nesting, and unclosed marked content.

Each case also hashes the immutable serialized input before and after validation and repeats validation to require identical ordered content issue results. A separate test validates two different serialized PDFs in an interleaved sequence to detect parser-state leakage. All PDFs are generated in memory; no corpus binaries or temp files are created.

## Verification commands and results

New corpus only:

`node --test src/exporters/pdfx-serialized-corpus.test.mjs`

Result: **61 passed, 0 failed, 0 cancelled, 0 skipped**, exit 0. This is the 60 corpus variants plus the independent parser-state-isolation test.

Assigned focused acceptance:

`node --test src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-serialized-corpus.test.mjs src/exporters/pdfx-fonts.test.mjs src/export-service.test.mjs`

Result: **103 passed, 0 failed, 0 cancelled, 0 skipped**, exit 0. Retained output: `/tmp/luna-pdf-serialized-corpus-final-20260906.log`.

`git diff --check`: exit 0.

The focused suite includes the existing extraction, embedded-font, and no-publication regressions. The PDF/X gate remains unchanged: test fixtures assert only bounded content issue codes and paths, and no test claims universal conformance or capability promotion. No native builds, devices, uploads, publication, or document mutations were performed.
