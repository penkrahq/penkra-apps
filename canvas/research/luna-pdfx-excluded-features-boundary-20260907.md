# PDF/X excluded-feature boundary evidence

Date: 2026-09-07

This evidence records the bounded behavior of `preflightPdfx4` on actual
serialized bytes. It is not a PDF/X certification or a conformance result.
The production checker, publication gate, profile assets, and retained
protected reports were not changed.

## Source and command

- Worktree: `canvas-parallel-20260906/pdf-envelope-wiring`
- Branch: `codex/canvas-pdf-envelope-wiring-20260907`
- Source snapshot inspected: `f6bf1e78bfe80fac505c8b8c017d14962b0754c1`
- Test: `canvas/src/exporters/pdfx-excluded-features-boundary.test.mjs`
- Command: `cd canvas && node --test src/exporters/pdfx-excluded-features-boundary.test.mjs`
- Exit code: `0`
- Result: `148` passed, `0` failed, `0` cancelled, `0` skipped, `0` todo
- Related focused command: `cd canvas && node --test src/exporters/pdfx-excluded-features-boundary.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-serialization-boundary.test.mjs src/exporters/pdfx-images.test.mjs`
- Related focused result: `246` passed, `0` failed, `0` cancelled, `0` skipped, `0` todo; exit code `0`
- Generated PDFs: all in memory; no binary corpus was retained.

Every fixture creates a 200 x 300 point one-page PDF with TrimBox and
BleedBox, serializes it through `serializePdf16`, reloads it with pdf-lib for
topology checks where applicable, and passes the serialized bytes to
`preflightPdfx4`. Each case is preflighted twice. The test asserts the input
SHA-256 is unchanged before and after both calls and that ordered issue arrays
are identical. Raw and Flate-compressed page Contents are separate named
identities.

The intentionally minimal baseline is structurally valid classic
`serializePdf16` output, but is not a configured PDF/X candidate. Its
unrelated semantic findings are:

`OUTPUT_INTENT_COUNT` at `Catalog/OutputIntents`, `XMP_MISSING` at
`Catalog/Metadata`, `TRAILER_ID_INVALID` at `trailer/ID`,
`DEFAULT_RGB_MISSING` at `Page[0]/Resources/ColorSpace/DefaultRGB`, and
`TRANSPARENCY_GROUP_INVALID` at `Page[0]/Group`. The matrix compares only the
feature-specific projections below and makes no global-pass assertion.

## Serialized identity counts

| Family | Identity formula | Cases |
| --- | --- | ---: |
| Six graph keys | 6 keys x 11 value/topology variants x 2 Contents encodings | 132 |
| BX/EX content | 4 source forms x 2 Contents encodings | 8 |
| Image filters | 3 image forms x 2 Contents encodings | 6 |
| Named feature cases |  | **146** |
| Aggregate count/state tests | exact membership and cross-document state isolation | 2 |
| Node test total |  | **148** |

Graph keys were `Annots`, `EmbeddedFiles`, `AcroForm`, `XFA`,
`AlternatePresentations`, and `OCProperties`. Each key covered: absent,
direct nonempty dictionary, indirect nonempty dictionary, reachable nested
dictionary, unreachable indirect dictionary, empty array, empty dictionary,
`null`, `false`, numeric zero, and an empty string.

## Graph-key observations

For every key and both raw/Flate content variants, these nonempty cases
produced exactly one exclusion:

```text
code:   CANVAS_SUBSET_UNSUPPORTED
clause: 6.1
object: <catalog-ref>/<Key>
        <catalog-ref>/Holder/<Key>       (reachable nested)
        <unreachable-ref>/<Key>          (unreachable indirect)
```

The serialized runs used `2 0 R` for the catalog path and an independently
serialized indirect path for unreachable objects; the test asserts the exact
resolved path rather than merely checking a truthy code. This confirms that
the current whole-object traversal sees direct, indirect, reachable nested,
and unreachable graph dictionaries.

The following were observed without inventing a rejection policy:

| Serialized value | Current feature projection |
| --- | --- |
| absent | no `CANVAS_SUBSET_UNSUPPORTED` |
| empty array | no `CANVAS_SUBSET_UNSUPPORTED` (the source explicitly exempts empty arrays) |
| PDF `null` | no `CANVAS_SUBSET_UNSUPPORTED` after reload |
| empty dictionary | one `CANVAS_SUBSET_UNSUPPORTED` at the key path |
| PDF `false`, numeric zero, empty string | one `CANVAS_SUBSET_UNSUPPORTED` at the key path |

These are measured checker observations, not claims that every such value is
valid or invalid under ISO or under a future product policy. No expected
nonempty-key exclusion bypass was found; no production correction was made.

## BX/EX content observations

Raw and Flate variants produced the same ordered issues and paths:

| Named source | Observed issues |
| --- | --- |
| `BX q Q EX` | `CONTENT_OPERATOR_OUTSIDE_SUBSET` / clause `6.1` at `Page[0]/Contents[0]/BX` and `/EX` |
| `BX Unknown EX` | the same BX/EX issues plus `CONTENT_OPERATOR_OUTSIDE_SUBSET` / clause `6.1` at `/Unknown` |
| `BX` | one `CONTENT_OPERATOR_OUTSIDE_SUBSET` / clause `6.1` at `/BX` |
| `EX` | one `CONTENT_OPERATOR_OUTSIDE_SUBSET` / clause `6.1` at `/EX` |

The matched known-operator case confirms that the q/Q pair does not alter
graphics-state balance. BX/EX are currently handled as ordinary outside-subset
operators; there is no special compatibility-region acceptance.

## JPEG2000 image observations

Each image is an actual serialized 1 x 1 DeviceRGB, 8-bit image stream with
three sample bytes. The ordinary raw image baseline produced no image or
XObject issue. The JPX cases produced exactly:

```text
code:   IMAGE_FILTER_OUTSIDE_SUBSET
clause: 6.8
object: Page[0]/Resources/XObject/Used/Filter
        Page[0]/Resources/XObject/Unused/Filter
```

The `Unused` case is still reachable through the page resource XObject
dictionary and was rejected even when page Contents did not invoke it. Raw
and Flate page Contents produced identical ordered observations. This is the
current image-subset filter boundary; it is not a JPEG2000 decoder or a
universal PDF/JPEG2000 validity claim.

## State and immutability

The negative XFA graph fixture and absent-XFA control were preflighted in both
orders. The control remained free of the feature issue after the negative,
while the negative retained its one exact issue. All 146 named cases repeated
with the same ordered issue projection, and all input hashes remained unchanged.

## Scope conclusion

The current checker has deterministic serialized coverage for the requested
nonempty graph exclusions, BX/EX operator boundaries, and JPX image-filter
boundary. Its generic graph issues retain source clause `6.1`, and the JPX
image issue retains source clause `6.8`; this evidence preserves those exact
observations without remapping or changing production code. Empty arrays and
PDF `null` are observed as non-issues and remain available for any separately
authorized policy decision.
