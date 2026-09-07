# PDF lowercase name-escape guard: postfix independent review

Date: 2026-09-07

This is a separate postfix result. The committed pre-fix report
`luna-pdf-resource-name-fixed-source-independent-20260907.md` was not
rewritten and its historical bytes, hashes, and failures remain unchanged.
No production, dependency, conformance-gate, native, or protected files were
changed.

## Exact source and test provenance

- Review branch: `codex/canvas-library-publication-head-20260907`
- Guard source commit: `f9255ef73af844519a5a495a89237f52352792db`
- Guard test commit: `e75e67ba0b5ef21ad068954aa18a0f491fab6885`
- Sibling fixed-source HEAD observed: `01c20830a3da3e103b665912e65ca9dc40c9a796`
- Exact committed guard archive used for this review:
  `/var/folders/vb/g066rwxj3mj405k01t_vjkf80000gn/T/tmp.XVdQD3xWfq`

The guard diff is one line in `inspectCanvasPdfEnvelope`: a lowercase hex
digit in a name escape produces
`PDF_SERIALIZATION_OUTSIDE_SUBSET` with detail
`name-lowercase-escape-parser-boundary`. This is a Canvas-writer subset
boundary, not a claim that lowercase PDF name escapes are universally invalid.

The independent test defaults its import root to the test directory via
`fileURLToPath(new URL(".", import.meta.url))` and preserves the explicit
`PDF_RESOURCE_NAME_IMPORT_ROOT` override used for the isolated committed
archive.

## Results

Command against the exact `f9255ef` archive:

```text
PDF_RESOURCE_NAME_IMPORT_ROOT=/var/folders/vb/g066rwxj3mj405k01t_vjkf80000gn/T/tmp.XVdQD3xWfq/canvas/src/exporters node --test src/exporters/pdf-resource-name-postfix-independent.test.mjs
exit 0; tests 4; pass 4; fail 0; cancelled 0; skipped 0
```

The sibling committed postfix suite was also run read-only:

```text
node --test canvas/src/exporters/pdf-resource-name-parser-boundary.test.mjs
exit 0; tests 5; pass 5; fail 0; cancelled 0; skipped 0
```

The new guard test covers:

- Raw paired `/A#4a` + `/AJ` and raw single `/A#4a` fixtures, both rejected by
  the envelope with exactly code
  `PDF_SERIALIZATION_OUTSIDE_SUBSET` and detail
  `name-lowercase-escape-parser-boundary`.
- Canonical 56 lookup rows (28 operator/name probes × raw/Flate), all selecting
  the actual decoded-byte resource; the canonical 48 non-lowercase rows remain
  resource-issue clean. This is lookup evidence, not full PDF/X acceptance.
- Uppercase canonical dictionary keys for lowercase content escapes, ordinary
  lowercase object-name letters, comments, literal strings, hex strings, and
  binary Flate stream bytes. These shielded cases remain envelope-accepted.

## Raw fixture facts

The postfix test's paired raw fixture is 704 bytes with SHA-256
`cb34ae4d62d7f0a0422eed187fb3634cf82f78c4cc1897d6b3a5b9fb3b787d59`.
Its content is `/A#234a gs`; its dictionary preserves `/A#4a` and `/AJ` raw
spellings. The single raw fixture is 613 bytes with SHA-256
`4b6fe2c6f3f558c75f57ff35eed6fdd889f777969e8d8920f818c2a45dabe7b0` and
contains only `/A#4a`. Both are rejected at the guard boundary before any
resource-selection result can be treated as an accepted document.

The content spelling `/A#234a` is still supported where it is a literal hash
escape (`A#4a` after decoding); uppercase canonical dictionary spellings and
the ordinary lowercase-byte cases remain supported. The separate lower-case
raw-object guard behavior is therefore precise and bounded.
