# PDF content-name validation review — 2026-09-07

## Scope and boundary

This package implements the bounded Canvas checked-content-subset name rule;
it is not a general PDF name-policy or PDF/X certification change. The object
envelope rule from root `9ef9885`/local `7104f02` remains unchanged. The new
content rule is applied only by `readPdfContent`:

- raw unescaped bytes must be in the printable range 33..126;
- `#HH` escapes decode to bytes before validation;
- decoded NUL is rejected;
- decoded bytes must pass fatal UTF-8 validation;
- the returned name remains a Latin1 byte-identity string, rather than a
  Unicode-decoded string, so existing resource lookup continues to use the
  serialized byte identity;
- inline dictionaries reject duplicate decoded keys.

This is a checked-subset restriction. It does not claim that every general PDF
name outside this subset is universally invalid, and it does not change the
publication gate or uncovered list.

## Changes

Source commit: `7f2456f`

- `canvas/src/exporters/pdf-content.mjs` validates names at the existing name
  token path with fatal `TextDecoder` validation and retains Latin1 byte identity.
- Dictionary close validates duplicate decoded keys.
- Numeric parsing, string parsing, and the existing name-length ownership were
  not changed.

Test commit: `6b7a468`

- New `canvas/src/exporters/pdf-content-name-validation.test.mjs`.
- Updated new probe
  `canvas/src/exporters/pdfx-name-encoding-independent.test.mjs` to assert the
  post-fix syntax behavior while retaining the object-envelope pre/post split.

Evidence commit: this file, committed separately after the source and test
commits.

## Focused verification

Command, from `canvas/`:

```text
node --test \
  src/exporters/pdf-content-name-validation.test.mjs \
  src/exporters/pdfx-name-encoding-independent.test.mjs \
  src/exporters/pdfx-preflight.test.mjs \
  src/exporters/pdfx-content-matrix.test.mjs \
  src/exporters/pdfx-fonts.test.mjs \
  src/exporters/pdfx-serialized-corpus.test.mjs \
  src/exporters/pdf-serialization-envelope.test.mjs \
  src/exporters/pdfx-serialization-boundary.test.mjs \
  src/export-service.test.mjs
```

Result: **132 passed, 0 failed, 0 cancelled, 0 skipped**, exit 0. The new
content-name test contains 6 cases; the updated independent probe contains 5
cases. Existing preflight, content matrix, font, serialized corpus, envelope,
serialization-boundary, and export-service coverage all remained green.

## Direct parser cases

The direct `readPdfContent` cases establish these observations:

| Case | Result |
| --- | --- |
| Raw control `0x1F`, raw DEL `0x7F`, and raw high byte `0x80` in a name | Rejected through the existing parser error path. |
| Escaped NUL `#00` | Rejected. |
| Overlong UTF-8, surrogate encoding, out-of-range scalar, truncated sequence, and lone continuation | Rejected by fatal UTF-8 validation. |
| Escaped `#C3#A9` | Accepted and returned as byte identity `C3 A9` (Latin1 `Ã©`), not Unicode `é`. |
| Escaped ASCII `#41`, escaped control `#01`, and escaped DEL `#7F` | Accepted when the decoded bytes are otherwise valid; `#00` remains the explicit NUL exception. |
| Inline dictionary keys `/#C3#A9` and `/#c3#a9` | Rejected as duplicate decoded keys. Distinct `#41` and `#42` keys remain valid. |
| Literal text, hex text, and comments containing name-looking bytes | Shielded from name parsing. |

## Serialized raw and Flate cases

Each malformed content fixture was serialized as a classic-xref PDF with
`PDFDocument.save({ useObjectStreams: false })`, once with an uncompressed
content stream and once with a Flate-compressed content stream. The malformed
fixtures were:

- `/#80 Do` (resource name);
- `/#80 BMC EMC` (marked-content tag);
- `/Tag << /#80 1 >> BDC EMC` (inline dictionary key).

Each preflight report retained the stable
`CONTENT_SYNTAX_INVALID_OR_UNSUPPORTED` classification. The observed paths
were `Page[0]/Contents[0]` and the existing separate content/font inspection
path `Page[0]`; no `PDF_SERIALIZATION_*` issue was introduced. Repeating
preflight returned the same ordered report.

The valid serialized binary-image fixture used an 8-byte DeviceGray image
whose raw samples included name-looking bytes (`0x2F`, `0xFF`, `0x23`, `0x80`,
and text-like bytes). Its `/Im Do` content remained valid; the report had no
content syntax issue, no `PDF_SERIALIZATION_*` issue, and no
`IMAGE_DATA_LENGTH_INVALID` issue. The direct stream payload was not parsed as
content names.

## Existing independent probe after the fix

The earlier object-envelope probe still observes valid UTF-8 scalar edge names,
malformed object names, duplicate decoded object keys, and binary stream
shielding at the object-envelope layer. Its content cases now expect the
checked-subset syntax issue for malformed `Do`, `BMC`, and inline `BDC`
dictionary names. This keeps object-envelope and content-token conclusions
separate rather than silently retaining the old bypass expectation.

## Limits and non-claims

- This validates the Canvas checked subset only. It is not a statement that
  all PDF producers must encode every name as UTF-8, nor a complete PDF grammar
  validator.
- The stable preflight code remains `CONTENT_SYNTAX_INVALID_OR_UNSUPPORTED`;
  no new public diagnostic or policy code was added.
- No PDF/X profile gate, conformance result, uncovered entry, capability, image
  validator, font validator, or emitter was changed.
- No native compiler, device, retained binary corpus, or external upload was
  used. Test PDFs were generated in memory and discarded.
