# Serialized XMP/Info wiring verification

Date: 2026-09-07

This is serialized metadata wiring evidence only. It does not certify PDF/X and does not alter the closed publication gate.

- Named cases: 34 explicitly named cases.
- Case names: valid-writer-xmp, missing-metadata, wrong-metadata-type, wrong-metadata-subtype, metadata-nonstream, malformed-xml, invalid-utf8, duplicate-scalar-property, duplicate-title-x-default, missing-required-DocumentID, missing-required-VersionID, missing-required-RenditionClass, missing-required-CreateDate, missing-required-ModifyDate, missing-required-MetadataDate, missing-required-title, info-crosswalk-Title, info-crosswalk-Author, info-crosswalk-Subject, info-crosswalk-Keywords, info-crosswalk-Creator, info-crosswalk-Producer, info-crosswalk-CreationDate, info-crosswalk-ModDate, info-crosswalk-Trapped, info-crosswalk-GTS_PDFXVersion, invalid-leap-date, offset-equivalent-timestamps, nonmatching-timestamps, dtd-entity-declaration, wrong-namespace-familiar-prefix, alternate-prefix-observation, oversized-xmp-packet, legacy-pdfx-conformance
- Serialized identities: 68 (34 cases x classic-xref/object-streams).
- Retained PDFs: 6
- Gated generation result: 71 passed, 0 failed, 0 cancelled, 0 skipped
- Default read-only result: 72 passed, 0 failed, 0 cancelled, 0 skipped
- Marker command: unavailable; MODULE_NOT_FOUND for /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas/container_tools/mark_artifact_operation_started.mjs
- All cases were saved, reloaded, preflighted twice, and checked for unchanged input SHA256 and deterministic issue order.
- Actual ordinary exportPdf bytes supplied the baseline; the candidate fixture then wired bundled GRACoL2013 CRPC6 output intent and writer-shaped XMP/Info fields.
- Expected metadata codes were observed in all serialized variants; no missing expected code or production defect was found.

- Complete focused PDF/service command: 600 passed, 0 failed, 0 cancelled, 0 skipped; unrun cases: 0.

## Observed metadata codes

Across the 68 serialized identities, each expected code was observed deterministically:

| Code | Identity count |
| --- | ---: |
| `XMP_MISSING` | 4 |
| `XMP_STREAM_TYPE_INVALID` | 4 |
| `XMP_XML_INVALID` | 8 |
| `XMP_DUPLICATE_PROPERTY` | 4 |
| `XMP_REQUIRED_PROPERTY_MISSING` | 14 |
| `INFO_XMP_MISMATCH` | 32 |
| `XMP_DATE_INVALID_OR_UNSUPPORTED` | 2 |
| `XMP_PROPERTY_UNSUPPORTED` | 2 |
| `XMP_PDFX_IDENTIFICATION_INVALID` | 2 |
| `XMP_REQUIRED_PREFIX` | 2 |
| `LEGACY_PDFX_CONFORMANCE_FORBIDDEN` | 2 |

The valid writer-shaped XMP and offset-equivalent timestamp cases had no metadata issues. All diagnostics came from `preflightPdfx4` after serialization and reload; no direct-only helper assertion was used. No expected code was missing, so no production defect or minimal reproduction was opened.

## Case names and wiring

`valid-writer-xmp`, `missing-metadata`, `wrong-metadata-type`, `wrong-metadata-subtype`, `metadata-nonstream`, `malformed-xml`, `invalid-utf8`, `duplicate-scalar-property`, `duplicate-title-x-default`, `missing-required-DocumentID`, `missing-required-VersionID`, `missing-required-RenditionClass`, `missing-required-CreateDate`, `missing-required-ModifyDate`, `missing-required-MetadataDate`, `missing-required-title`, `info-crosswalk-Title`, `info-crosswalk-Author`, `info-crosswalk-Subject`, `info-crosswalk-Keywords`, `info-crosswalk-Creator`, `info-crosswalk-Producer`, `info-crosswalk-CreationDate`, `info-crosswalk-ModDate`, `info-crosswalk-Trapped`, `info-crosswalk-GTS_PDFXVersion`, `invalid-leap-date`, `offset-equivalent-timestamps`, `nonmatching-timestamps`, `dtd-entity-declaration`, `wrong-namespace-familiar-prefix`, `alternate-prefix-observation`, `oversized-xmp-packet`, `legacy-pdfx-conformance`.

The baseline began as actual ordinary `exportPdf` bytes. The candidate fixture then wired the bundled GRACoL2013 CRPC6 output intent and writer-shaped XMP/Info fields using the existing preflight fixture construction pattern. Every mutation was saved with both serializer settings, reloaded, topology-checked, preflighted twice, and checked for unchanged input SHA256 and identical ordered issues.

The six retained PDFs are listed with SHA256 in `sha256-manifest.json`: valid writer XMP, missing Metadata, malformed XML, Title crosswalk mismatch, invalid leap date, and oversized packet. Default tests verify every retained hash and write no files.

The fully configured `exportPdf` PDF/X-4 attempt remains fail-closed with `CANVAS_PDF_PROFILE_UNVERIFIED`/`conformant:false` as observed; no configured PDF/X bytes were published or treated as certified.

The required artifact-marker command was attempted immediately before authoring but is unavailable in this checkout: `MODULE_NOT_FOUND` for `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas/container_tools/mark_artifact_operation_started.mjs`.
