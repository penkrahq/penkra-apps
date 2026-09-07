# PDF name-escape parser-boundary verification — 2026-09-07

## Scope

This is a narrow serialized-envelope boundary correction. The current `pdf-lib`
parser does not decode lowercase hexadecimal digits in raw PDF name escapes the
same way as the content tokenizer. The envelope therefore rejects a raw name
escape containing `a`–`f` after validating that the two characters are
hexadecimal. This is a writer-subset/parser-boundary restriction, not a claim
that lowercase hexadecimal escapes are invalid in every PDF consumer.

The change does not reject ordinary lowercase name bytes, literal `#` names,
strings, comments, stream payloads, or content-token lowercase escapes. The
existing decoded-name UTF-8 and 127-byte checks remain unchanged. No profile,
publication-gate, uncovered-list, dependency, or resource-helper changes were
made.

## Source and exact behavior

| Item | Result |
| --- | --- |
| Production file | `canvas/src/exporters/pdf-serialization-envelope.mjs` |
| Source location | NAME-token scanner, lines 57–70 at verification time |
| New code | after two-hex validation, `fail("name-lowercase-escape-parser-boundary", position - 1, true)` |
| Machine result | `PDF_SERIALIZATION_OUTSIDE_SUBSET`, clause `6.1`, detail `name-lowercase-escape-parser-boundary` |
| Scope | object/name scanner only; content tokenizer is unchanged |
| Source commit | `f9255ef` |

The `unsupported=true` path is deliberate: malformed/unsupported serialization
is rejected before semantic PDF parsing. It does not rewrite bytes or fork the
dependency. `serializePdf16` continues to emit uppercase escapes.

## Focused fixture coverage

The new test file is
`canvas/src/exporters/pdf-resource-name-parser-boundary.test.mjs` and the
existing envelope expectation was narrowed in
`canvas/src/exporters/pdf-serialization-envelope.test.mjs`.

| Fixture | Observed result |
| --- | --- |
| `/A#4a` in a dictionary key | exact outside-subset boundary issue |
| `/A#4a` as a name value | exact outside-subset boundary issue |
| nested dictionary key | exact outside-subset boundary issue |
| unreachable indirect object key | exact outside-subset boundary issue; envelope scans it |
| uppercase `/A#4A` | accepted |
| `/A#234a` (escape `23`, then literal `4a`) | accepted |
| ordinary `/ordinarylowercase` | accepted |
| literal/hex strings, comments, direct stream bytes containing `/A#4a` | accepted; not tokenized as object names |
| content `/A#4a gs` with canonical object key `/AJ` | accepted by envelope; `readPdfContent` decodes the operand as `AJ` |

The configured candidate regression uses the retained input
`canvas/research/luna-pdfx-document-negative-matrix-20260907/valid-candidate-control-classic-xref.pdf`
(SHA-256
`28d285d8b77401100120aae6c99d72773e17f58b9ddf8e319c37cdff46d5fff8`). It is
loaded with `updateMetadata:false`, receives one ExtGState resource key whose
semantic bytes are `A#4a`, and is serialized with `serializePdf16`.

| Candidate form | Preflight observation |
| --- | --- |
| canonical `/A#234a` key + `/A#234a gs` content | `status=verified-canvas-writer-subset`, `issues=[]`, `conformant=false` |
| one raw dictionary key changed to `/A#4a`, content unchanged | `status=invalid`, `conformant=false`, exactly one serialization issue: `PDF_SERIALIZATION_OUTSIDE_SUBSET` at `file@787`, detail `name-lowercase-escape-parser-boundary` |

The candidate mutation is nonduplicate: only one semantic resource key is
added, so this result is not caused by the raw-envelope duplicate-key check.
The lowered bytes are generated in memory, preserve the canonical byte length,
and have identical ordered reports on repeated preflight. Input bytes remain
unchanged.

## Verification command and counts

Executed from `canvas/`:

```text
bun test src/exporters/pdf-serialization-envelope.test.mjs \
  src/exporters/pdf-resource-name-parser-boundary.test.mjs \
  src/exporters/pdf-resource-name.test.mjs \
  src/exporters/pdfx-preflight.test.mjs \
  src/exporters/pdfx-content-matrix.test.mjs \
  src/exporters/pdfx-serialization-boundary.test.mjs
```

Exit code: `0`.

| Test file | Passed | Failed | Cancelled/skipped |
| --- | ---: | ---: | ---: |
| `pdf-serialization-envelope.test.mjs` | 12 | 0 | 0 |
| `pdf-resource-name-parser-boundary.test.mjs` | 5 | 0 | 0 |
| `pdf-resource-name.test.mjs` | 42 | 0 | 0 |
| `pdfx-preflight.test.mjs` | 16 | 0 | 0 |
| `pdfx-content-matrix.test.mjs` | 13 | 0 | 0 |
| `pdfx-serialization-boundary.test.mjs` | 5 | 0 | 0 |
| **Total** | **93** | **0** | **0** |

The existing lowercase observation in `pdf-resource-name.test.mjs` still
demonstrates the dependency/parser mismatch, while the new envelope marker now
prevents that raw serialization from reaching a clean writer-subset result.
The content tokenizer's lowercase escape behavior remains intentionally
allowed and independently tested.

## Commits and boundaries

| Commit | Contents |
| --- | --- |
| `f9255ef` | production envelope NAME-token boundary fix only |
| `e75e67b` | focused parser-boundary tests and one existing expectation update |
| pending evidence commit | this report only |

No PDF binaries were added by this package. No native compilers, devices,
network services, profile changes, conformance promotion, or publication-gate
changes were used. `conformant:false` remains unchanged.
