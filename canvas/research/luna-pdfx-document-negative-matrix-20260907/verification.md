# Serialized document validator branch matrix - 2026-09-07

This evidence measures the existing `preflightPdfx4` branches. It makes no PDF/X
certification or publication-gate claim. No production source, profile asset, or
gate behavior was changed.

## Matrix and observed result

- 22 explicitly named cases: 1 positive control and 21 negative mutations.
- 2 serializers per case: `classic-xref` (`useObjectStreams:false`) and
  `object-streams` (`useObjectStreams:true`).
- 44 serialized identities executed and reloaded before topology assertions and
  preflight.
- Every negative identity produced its named target code in both serializers.
- The positive control produced none of the 21 target codes. Its report remained
  scoped to observation and was not asserted conformant.
- Input SHA-256 was unchanged across both repeated preflight calls, and ordered
  issue reports matched on repetition.
- The isolation test validated positive, negative, positive validation order.

| Case | Expected target code |
| --- | --- |
| `valid-candidate-control` | none |
| `output-condition-unsupported` | `OUTPUT_CONDITION_UNSUPPORTED` |
| `external-output-profile` | `EXTERNAL_OUTPUT_PROFILE` |
| `icc-channel-count-mismatch` | `ICC_CHANNEL_COUNT_MISMATCH` |
| `output-profile-unreadable` | `OUTPUT_PROFILE_UNREADABLE` |
| `xmp-filter-forbidden` | `XMP_FILTER_FORBIDDEN` |
| `trailer-id-invalid` | `TRAILER_ID_INVALID` |
| `pages-missing` | `PAGES_MISSING` |
| `page-box-invalid` | `PAGE_BOX_INVALID` |
| `media-box-missing` | `MEDIA_BOX_MISSING` |
| `box-outside-crop` | `BOX_OUTSIDE_CROP` |
| `canvas-subset-unsupported` | `CANVAS_SUBSET_UNSUPPORTED` |
| `presentation-forbidden` | `PRESENTATION_FORBIDDEN` |
| `external-resource-forbidden` | `EXTERNAL_RESOURCE_FORBIDDEN` |
| `default-rgb-missing` | `DEFAULT_RGB_MISSING` |
| `default-rgb-profile-unreadable` | `DEFAULT_RGB_PROFILE_UNREADABLE` |
| `transparency-group-invalid` | `TRANSPARENCY_GROUP_INVALID` |
| `transparency-group-profile-unreadable` | `TRANSPARENCY_GROUP_PROFILE_UNREADABLE` |
| `icc-header-invalid` | `ICC_HEADER_INVALID` |
| `icc-version-unsupported` | `ICC_VERSION_UNSUPPORTED` |
| `icc-pcs-invalid` | `ICC_PCS_INVALID` |
| `icc-tag-table-truncated` | `ICC_TAG_TABLE_TRUNCATED` |

The exact fixture construction, mutation, topology assertions, serializers,
reloading, in-memory regeneration, and hash checks are in
`src/exporters/luna-pdfx-document-negative-matrix.test.mjs`.

## Serialized topology checks

Each case mutates the intended catalog, trailer, page, resource, stream, or ICC
bytes, saves with one serializer, reloads with `updateMetadata:false` and
`throwOnInvalidObject:true`, then checks the intended shape before preflight.
Examples include an empty reloaded page tree for `PAGES_MISSING`, an empty trailer
ID array for `TRAILER_ID_INVALID`, a real Flate filter with invalid bytes for both
unreadable profile cases, and raw mutated ICC bytes for the four ICC branches.
The positive candidate has valid Media/Crop/Bleed/Trim boxes, output intent,
source RGB profiles, transparency group, XMP, Info crosswalk, and two non-empty
trailer IDs.

## Retained artifacts and regeneration

The complete machine-readable corpus is retained without redundant binary copies:

- `case-results.json`: all 44 identities, all issue codes/paths, status,
  conformance observation, byte lengths, and SHA-256 hashes.
- `sha256-manifest.json`: all 44 generated identities plus the retained-artifact
  list.
- `valid-candidate-control-classic-xref.pdf`:
  `28d285d8b77401100120aae6c99d72773e17f58b9ddf8e319c37cdff46d5fff8`, 2,662,755
  bytes.
- `output-profile-unreadable-classic-xref.pdf`:
  `9cc2a0a7270db590e3060d7ab5a63c70328c218f00a25a63c5773740fee4e885`, 5,154
  bytes.

The final evidence directory contains 5 files: 44 complete generated identities
are represented in the JSON manifests/results, 2 representative PDFs are retained,
and this report records the recipe and results. Its measured size after cleanup is
2.6M. The 42 other PDFs were generated
by this package in the same new evidence directory, verified against the final
manifest, and removed by exact filename scope. They are recoverable by rerunning
the opt-in generator; no pre-existing or user-owned file was removed.

Default tests regenerate all 44 cases in memory and compare every regenerated
record to `case-results.json`; they do not write the evidence directory.

## Commands and results

Opt-in generator, final run:

```text
LUNA_PDFX_DOCUMENT_NEGATIVE_RETAIN_EVIDENCE=1 node --test src/exporters/luna-pdfx-document-negative-matrix.test.mjs
```

- exit: 0
- log: `/var/folders/vb/g066rwxj3mj405k01t_vjkf80000gn/T/luna-pdfx-document-negative.H0kuAMNyQb`
- tests: 46
- pass: 46
- fail/cancelled/skipped: 0/0/0
- duration: 15,500.008083 ms

Default read-only run after binary cleanup:

```text
node --test src/exporters/luna-pdfx-document-negative-matrix.test.mjs
```

- exit: 0
- log: `/var/folders/vb/g066rwxj3mj405k01t_vjkf80000gn/T/luna-pdfx-document-negative-default.KnWWho0A9N`
- tests: 47
- pass: 47
- fail/cancelled/skipped: 0/0/0
- duration: 16,597.189334 ms
- evidence snapshot before/after: identical

Full focused PDF and service selection, including this matrix:

```text
node --test src/exporters/luna-pdfx-document-negative-matrix.test.mjs src/exporters/pdfx-metadata.test.mjs src/exporters/luna-pdfx-metadata-serialized.test.mjs src/exporters/pdfx-images.test.mjs src/exporters/luna-pdfx-image-matrix.test.mjs src/exporters/luna-pdfx-font-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-serialized-corpus.test.mjs src/exporters/luna-pdfx-graphics-state-matrix.test.mjs src/exporters/luna-pdfx-extgstate-context.test.mjs src/export-service.test.mjs
```

- exit: 0
- log: `/var/folders/vb/g066rwxj3mj405k01t_vjkf80000gn/T/luna-pdfx-document-negative-full.lUw2kt4hde`
- tests: 647
- pass: 647
- fail/cancelled/skipped: 0/0/0
- duration: 27,758.655583 ms

An earlier attempted focused command used `src/exporters/export-service.test.mjs`
instead of the actual `src/export-service.test.mjs`; it still passed 219 tests but
was not used as the acceptance result. The corrected command above is the complete
focused result. No native compiler, device, or GUI work was used.

## Commits

- `349a6c9` - initial serialized branch matrix test.
- `edd28fb` - stabilized compressed valid ICC and raw malformed ICC fixtures.
- `8752b92` - in-memory all-case regeneration and representative-only retention.
- `6a16ed5` - prior gate inventory relocation to `canvas/research`.

No source defect was found or patched. The publication gate remains unchanged and
closed.
