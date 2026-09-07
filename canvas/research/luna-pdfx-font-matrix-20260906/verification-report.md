# Serialized Identity-H TrueType verification — 2026-09-07

## Result

The matrix defines 39 explicitly named cases with no skipped cases:

- A, structure/serialization: 5 cases.
- B, malformed embedding and Identity-H structure: 10 cases.
- C, `W`/`DW` width forms and bounded malformed values: 12 cases.
- D, `Tj`/`TJ`, font state, streams, and page isolation: 10 cases.
- E, page reuse and distinct-document repetition: 2 cases.

Each case ran through both `classic-xref` (`useObjectStreams:false`) and
`object-streams` (`useObjectStreams:true`) serialization variants. The new
matrix file therefore executed 78 serialized case variants plus two evidence /
aggregate tests: **80 pass, 0 fail, 0 cancelled, 0 skipped**.

The focused acceptance command was:

```text
node --test src/exporters/luna-pdfx-font-matrix.test.mjs \
  src/exporters/pdfx-fonts.test.mjs \
  src/exporters/pdfx-content-matrix.test.mjs \
  src/exporters/pdfx-preflight.test.mjs \
  src/exporters/pdfx-serialized-corpus.test.mjs
```

Result: **175 pass, 0 fail, 0 cancelled, 0 skipped**, exit code 0.

## Serialized and metric checks

The baseline is produced through the existing `exportPdf` Canvas fixture with
the bundled `Inter-Regular.ttf`. It is saved and reloaded before any matrix
inspection. Every mutation is saved with the selected serialization variant,
reloaded with `PDFDocument.load`, and then passed to `inspectPdfxFonts`.

Glyph CIDs and expected advance widths are derived at runtime from the decoded
serialized `FontFile2` program using fontkit. No CID or subset-dependent glyph
identifier is hardcoded.

Every variant records SHA-256 before inspection, repeats inspection to verify
ordered diagnostics, and confirms the input bytes are unchanged. The
machine-readable outputs are:

- `case-results.json`: 39 cases, 2 variants, 76 per-variant result records.
- `sha256-manifest.json`: 76 unique serialized input hashes and byte lengths.

The retained representative PDFs cover valid baseline, invalid width, missing
font program, and odd code bytes in both serialization variants:

- `baseline-identity-h-cidfonttype2-*.pdf`
- `w-absent-wrong-dw-*.pdf`
- `missing-fontfile2-*.pdf`
- `tj-odd-code-bytes-*.pdf`

## Aggregate publication gate

The fully configured bundled printer ICC + sRGB export regression rejects with
`CANVAS_PDF_PROFILE_UNVERIFIED`. Its preflight report retains
`conformant:false`, has no `FONT_*` or `TEXT_FONT_*` issues, and retains the
nonempty `uncovered` list. This verifies the existing closed publication gate;
it is not a PDF/X certification claim.

Malformed font cases intentionally report their primary font code followed by
`TEXT_FONT_UNRESOLVED` because the serialized content still references the
font after the helper rejects it. Examples include:

- `FONT_NOT_EMBEDDED` for missing/nonstream `FontFile2`.
- `FONT_PROGRAM_INVALID` for truncated/random programs.
- `FONT_ENCODING_OUTSIDE_SUBSET` and `FONT_CID_MAPPING_OUTSIDE_SUBSET` for
  unsupported Identity-H structure.
- `FONT_WIDTH_TABLE_INVALID` for duplicate, descending, negative, 65536,
  missing-width, nonnumeric, nonarray, and wrong-type width entries.
- `FONT_NOTDEF_USED`, `FONT_GLYPH_MISSING`, and
  `FONT_CODE_LENGTH_INVALID` for text-code cases.

No false acceptance or exception was found, so `pdfx-fonts.mjs` was not
modified.

## Evidence and scope

The test artifact marker required by the installed PDF skill was attempted but
is unavailable in this workspace:

```text
node container_tools/mark_artifact_operation_started.mjs \
  --operation-kind create --expected-output-count 1 --output-format pdf
```

It failed with `MODULE_NOT_FOUND`; no external PDF was delivered. The retained
PDFs are bounded test evidence under this directory.

Test commit: `103de0743cdf19fe491ed32ce1f7998dfd5cba56`.

No production source, PDF emitter, preflight gate, engine bundle, capability
table, protected file, device, or release state was changed.
