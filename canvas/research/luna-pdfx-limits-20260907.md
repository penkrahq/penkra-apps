# PDF/X architectural-limit verification — 2026-09-07

This is a bounded Table C.1 implementation check, not PDF/X certification or a publication-gate change. The source reference is [Adobe PDF Reference 1.6, Appendix C, Table C.1](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf), printed page 920, with the content-string restriction explicitly limited to content streams. The preflight result remains `conformant: false`, and the existing uncovered list and profile gate are unchanged.

## Implementation

Added `src/exporters/pdfx-limits.mjs` and integrated it narrowly into `pdfx-preflight.mjs`:

- PDF names are counted from decoded `PDFName.asBytes()` values at 127 bytes, including dictionary keys and values, direct/indirect objects, and unreachable indirect objects.
- Content strings are checked from parsed content operands at 32,767 decoded bytes, including strings nested inside `TJ`; Info/metadata strings are not scanned by this check.
- q/Q depth uses the existing page-wide state across split Contents streams and reports the first transition to depth 29.
- Indirect-object count has a pure boundary helper at 8,388,607; the preflight count is measured while enumerating the existing object graph and does not allocate millions of fixtures.
- PDF integer objects and raw content integer spellings use signed bounds `-2147483648..2147483647`.
- Raw content numeric spelling is scanned separately because `readPdfContent` intentionally exposes numeric values without lexical spelling. Thus `2147483648.0` is treated as a real, while `2147483648` is treated as an integer. Reals beyond approximately `±3.403e38` are rejected. No decimal-precision or tiny-real threshold was added.
- New findings use `PDF_ARCHITECTURAL_LIMIT` with clause `6.25`, structured detail, actual value, limit, and a precise object/content path.

## Matrix and results

`src/exporters/pdfx-limits.test.mjs` contains 22 named tests. Every serialized fixture is saved and reloaded in both variants:

- `classic-xref` (`useObjectStreams: false`)
- `object-streams` (`useObjectStreams: true`)

Covered cases include exact and one-over name lengths, UTF-8 multibyte name bytes, indirect/unreachable name keys and values, exact and one-over content strings including nested `TJ`, long metadata strings remaining allowed, signed integer minimum/maximum and one-over content/object values, real spelling `2147483648.0`, exact and one-over real range, split-stream q/Q depths 28 and 29, and the 8,388,607/8,388,608 pure object-count boundary.

Focused command:

```text
node --test src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/export-service.test.mjs src/exporters/pdfx-limits.test.mjs
```

Result: **64 pass, 0 fail, 0 cancelled, 0 skipped**. The new limits file alone: **22 pass, 0 fail, 0 cancelled, 0 skipped**. `git diff --check` passed.

The existing configured exporter regression still exercises the closed profile gate and passes its established expectation (`CANVAS_PDF_PROFILE_UNVERIFIED` with `conformant: false`); no configured PDF/X artifact was published and no gate verdict was promoted.

## Spelling and serialization limitation

`PDFNumber` instances created from JavaScript numeric values can already have normalized spelling before serialization; for example, a caller cannot preserve the distinction between a JavaScript `2147483648` and `2147483648.0` through `PDFNumber.of(...)`. The object helper therefore uses `PDFNumber.stringValue` when the parser retains it, while the content scanner reads raw serialized token spelling. The explicit real-spelling regression uses serialized content token `2147483648.0`. This package does not claim lexical distinction for a programmatic object whose producer has already normalized the spelling.

No binary corpus or retained PDF artifacts were created. All fixtures were generated in memory, serialized, reloaded, and passed to `preflightPdfx4`.
