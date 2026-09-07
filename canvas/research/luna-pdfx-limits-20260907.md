# PDF/X architectural-limit verification — 2026-09-07

This is a bounded Table C.1 implementation check, not PDF/X certification or a publication-gate change. The source reference is [Adobe PDF Reference 1.6, Appendix C, Table C.1](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf), printed page 920, with the content-string restriction explicitly limited to content streams. The preflight result remains `conformant: false`, and the existing uncovered list and profile gate are unchanged.

## Implementation

Added `src/exporters/pdfx-limits.mjs` and integrated it narrowly into `pdfx-preflight.mjs`:

- PDF names are counted from decoded `PDFName.asBytes()` values at 127 bytes, including dictionary keys and values, direct/indirect objects, and unreachable indirect objects.
- Content strings are checked from parsed content operands at 32,767 decoded bytes, including strings nested inside `TJ`; Info/metadata strings are not scanned by this check.
- q/Q depth uses the existing page-wide state across split Contents streams and reports the first transition to depth 29.
- Indirect-object count has a pure boundary helper at 8,388,607; the preflight count is measured while enumerating the existing object graph and does not allocate millions of fixtures.
- Raw content integer spellings use signed bounds `-2147483648..2147483647`; content real spellings beyond approximately `±3.403e38` are rejected. Content name operands and names nested in content dictionaries are counted from their parser-decoded byte representation at 127 bytes.
- Parsed PDF number objects receive only conservative real-magnitude validation. `pdf-lib` normalizes object-number lexical spelling, so this package intentionally leaves raw object integer spelling and its signed-range distinction uncovered until a byte-aware object scanner exists. No decimal-precision or tiny-real threshold was added.
- New findings use `PDF_ARCHITECTURAL_LIMIT` with clause `6.25`, structured detail, actual value, limit, and a precise object/content path.

## Matrix and results

`src/exporters/pdfx-limits.test.mjs` contains 25 named tests. Every generated serializer fixture is saved and reloaded in both variants:

- `classic-xref` (`useObjectStreams: false`)
- `object-streams` (`useObjectStreams: true`)

Covered cases include exact and one-over object-graph name lengths, UTF-8 multibyte name bytes, indirect/unreachable name keys and values, exact and one-over content names including escaped UTF-8 bytes in direct operands and nested dictionaries, exact and one-over content strings including nested `TJ`, long metadata strings remaining allowed, signed integer minimum/maximum and one-over raw content tokens, parsed-object real magnitude, raw-xref catalog real `2147483648.0`, content real spelling `2147483648.0`, exact and one-over real range, split-stream q/Q depths 28 and 29, and the 8,388,607/8,388,608 pure object-count boundary.

Focused command:

```text
node --test src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/export-service.test.mjs src/exporters/pdfx-limits.test.mjs
```

Result: **67 pass, 0 fail, 0 cancelled, 0 skipped** for the corrected focused selection (the prior 64-test selection was before the three added correction assertions). The corrected limits file: **25 pass, 0 fail, 0 cancelled, 0 skipped**. `git diff --check` passed for the corrected files. Node emitted four pdf-lib warnings for deliberately over-range real fixture serialization; they did not fail or skip tests.

The existing configured exporter regression still exercises the closed profile gate and passes its established expectation (`CANVAS_PDF_PROFILE_UNVERIFIED` with `conformant: false`); no configured PDF/X artifact was published and no gate verdict was promoted.

## Spelling and serialization limitation

`PDFNumber` instances created from JavaScript numeric values can already have normalized spelling before serialization; a caller cannot preserve the distinction between a JavaScript `2147483648` and `2147483648.0` through `PDFNumber.of(...)`. The object helper therefore does not inspect `PDFNumber.stringValue` or infer integer-vs-real from it. The new hand-built raw-xref regression proves that a syntactically valid catalog `/Probe 2147483648.0` loads without an architectural integer-range finding, while the content scanner still reads raw serialized token spelling and rejects integer content tokens one over the signed bound. Raw object integer spelling remains explicitly uncovered until byte-aware scanning is available.

No binary corpus or retained PDF artifacts were created. All fixtures were generated in memory, serialized, reloaded, and passed to `preflightPdfx4`.
