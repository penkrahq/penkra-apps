# Decoded-byte content resource lookup evidence

Date: 2026-09-07

This is a bounded writer-subset resource-name regression record. It does not
certify PDF/X, change the profile gate, or change the uncovered list.

## Change set

- Source fix: `4ec701907308774af543122370d0b2499b3bfe7d`
  (`fix(pdf): preserve decoded content resource names`).
- Serialized matrix tests: `0ca09dcbe5c871055097dcb674f7bd07578c7759`
  (`test(pdf): cover decoded content resource names`).
- Source parent before this package: `6fa323a`.
- Working tree after the evidence commit is expected to be clean.

The helper `src/exporters/pdf-resource-name.mjs` requires a `PDFDict`, converts
the Latin-1 byte-identity string returned by `readPdfContent` to bytes, and
compares those bytes directly with every key's `asBytes()`. It returns the raw
dictionary value, leaving reference resolution to the existing caller.

## Serialized matrix

`src/exporters/pdf-resource-name.test.mjs` executes 42 named tests:

| Group | Count | Coverage |
| --- | ---: | --- |
| Direct helper byte-identity test | 1 | Literal hash, repeated hash, UTF-8 byte identity, escaped slash, and paired decoy |
| Dynamic content-resource matrix | 40 | `gs`, `Do`, `Tf`, and `BDC` × literal-hash, repeated-hash, UTF-8, escaped-slash, and paired-decoy names × raw and Flate content streams |
| Lowercase `#hh` observation | 1 | Correct classic-xref bytes, parser/content-name boundary, repeated preflight and input hash |

All 42 passed. Every serialized case was loaded with pdf-lib before
preflight. Each case checked the decoded operand, repeated ordered issues, and
unchanged input SHA-256. The paired-decoy cases make the old `PDFName.of`
reparse observable: the resource whose key bytes are `A#42` is distinct from
the decoy whose key bytes are `AB`.

The content-resource sites are now:

- `pdfx-preflight.mjs`: dynamic `gs`, `Do`, `Tf`, and `BDC` category lookup.
- `pdfx-fonts.mjs`: dynamic `Tf` font lookup and `Do` XObject lookup.
- `pdfx-images.mjs`: no dynamic content-name lookup exists; it enumerates all
  XObject dictionary entries and uses their actual keys for diagnostics. Its
  remaining `PDFName.of` calls are fixed dictionary-field access (`Subtype`,
  `Width`, `ColorSpace`, and similar), so no helper call was added there.

## Lowercase hexadecimal observation

The test uses a hand-built classic xref with byte-correct offsets and the raw
name `/A#2fslash` in both the resource dictionary and content stream. The
content lexer decodes the operand to the Latin-1 byte identity string
`A/slash`, while the current pdf-lib raw-name parser retains the dictionary key
bytes as `A#2fslash` (lowercase `f` is not decoded by that parser). The
resulting preflight observation is:

```text
CONTENT_RESOURCE_UNRESOLVED
object: Page[0]/Contents[0]/gs
```

This is recorded as a dependency parser boundary, not as a new content-name
rejection rule. No dependency code was changed and no PDF bytes were
canonicalized.

## Focused verification

Command, from `canvas`:

```text
bun test src/exporters/pdf-resource-name.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/exporters/pdfx-images.test.mjs src/exporters/pdfx-serialization-boundary.test.mjs src/export-service.test.mjs
```

Result: exit 0; 170 passed, 0 failed, 0 skipped, 0 cancelled across 7
files. The focused run retained the existing closed publication behavior and
existing serialization outside-subset behavior; it did not assert global
conformance.

`git diff --check`: exit 0. No profile, gate, capability, native, or retained
PDF artifact was changed by this package.
