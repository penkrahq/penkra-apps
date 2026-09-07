# PDF name-encoding independent review — 2026-09-07

## Scope

This is an independent, read-only review of the object-name UTF-8 restriction
introduced by root commit `9ef9885` (local cherry-pick `7104f02`) and recorded
by evidence commit `b3c826c` (local cherry-pick `7877070`). It does not change
the tokenizer, preflight source, publication gate, or uncovered list. The
results distinguish the serialized object envelope from content-stream tokens;
they are not a claim of general PDF validity or PDF/X certification.

The ISO 15930-7 §6.6 reference used by the incoming evidence is:
<https://previewnorm.com/iso/ISO%2015930-7-2010%20PDF.pdf>. That text requires
valid UTF-8 after `#` expansion for font and separation names and says other
name objects should follow the PDF Reference rules. The current implementation
deliberately applies the UTF-8 restriction to every serialized object name as a
Canvas writer-subset restriction, reporting `PDF_SERIALIZATION_OUTSIDE_SUBSET`;
this report does not generalize that restriction to all PDFs.

## Exact verification

All fixtures are generated in memory as classic raw-xref PDFs. Object offsets
and the xref offset are computed from the final bytes; no parser repair is used.
The stream-shielding fixture uses a direct `/Length` and puts name-looking
bytes, `endobj`, `startxref`, trailer text, NUL, and `0xff` inside the payload.

Command, from `canvas/`:

```text
node --test src/exporters/pdfx-name-encoding-independent.test.mjs src/exporters/pdf-serialization-envelope.test.mjs
```

Result: **17 passed, 0 failed, 0 cancelled, 0 skipped**, exit 0. The new
independent probe contributed **5 passed** cases; the existing envelope suite
contributed **12 passed** cases. No native compiler, device, or retained binary
corpus was used.

## Object-envelope observations

The independent probe covered each named edge and malformed class:

| Fixture class | Observed result |
| --- | --- |
| Valid U+007F, U+0080, U+07FF, U+0800, U+D7FF, U+E000, U+10FFFF after `#` expansion | Accepted; no envelope issues. |
| Overlong 2-, 3-, and 4-byte sequences | Rejected with `PDF_SERIALIZATION_OUTSIDE_SUBSET`, clause `6.1`, detail `name-utf8-outside-writer-subset`. |
| UTF-8 surrogate encoding, out-of-range scalar, truncated 2/3/4-byte sequence, lone continuation bytes | Same deterministic rejection code/detail and computed object offset. |
| Escaped `#01`, `#7F`, `#20`, `#2F` | Accepted by the current envelope boundary. `#00` remains rejected by the existing `null-name-byte` rule. |
| Duplicate decoded names (`/#C3#A9` and `/#c3#a9`) | Rejected as `PDF_SERIALIZATION_INVALID`, clause `6.1`, detail `dictionary-key-invalid-or-duplicate`. Case of hex digits does not create a distinct decoded key. |
| Binary stream containing fake names and PDF delimiters | Accepted; direct stream bytes are shielded by the declared length and are not tokenized as object syntax. |

The valid edge cases and malformed cases are all real serialized bytes. The
test checks the computed raw object offset for malformed names rather than
relying on error prose.

## Content-token boundary

`canvas/src/exporters/pdf-content.mjs` parses a content name by reading bytes
until a delimiter, validating only the `#HH` escape shape, and converting each
escape with `String.fromCharCode`. It does not perform fatal UTF-8 decoding.
The independent raw fixtures therefore establish this reachable boundary:

| Content fixture | Envelope result | Current content/preflight observation |
| --- | --- | --- |
| `/#FF Do` with no matching resource | No `PDF_SERIALIZATION_*` issue | `CONTENT_RESOURCE_UNRESOLVED` is reported by preflight; the name is parsed and reaches resource lookup. |
| `/#FF BMC EMC` | No `PDF_SERIALIZATION_*` issue | Content parses and state remains balanced; no UTF-8 name issue is emitted. |
| `/#FF << /#80 1 >> BDC EMC` | No `PDF_SERIALIZATION_*` issue | Inline dictionary name is parsed; no UTF-8 name issue is emitted. |

Thus object-envelope validation does not cover names inside content streams,
including resource operands, marked-content tags, or inline dictionary keys.
This is an observed implementation boundary, not a proposed tokenizer change.
The content fixture remains an ordinary malformed-resource probe where
applicable; its unresolved-resource diagnostic is not confused with UTF-8
validation.

## Conclusions and limits

- The incoming object-envelope restriction is deterministic for valid and
  malformed `#`-expanded byte sequences, duplicate decoded keys, and stream
  shielding.
- Content names currently bypass that envelope check and are handled by the
  content tokenizer's byte-to-string path. No production source was changed in
  this review.
- The result is limited to the Canvas writer's serialized envelope boundary and
  the observed content parser/preflight behavior. It is not a claim that all
  PDF names must be UTF-8, that every PDF grammar rule is checked, or that the
  publication gate or PDF/X conformance is open.
- The existing `conformant:false` behavior and uncovered list were unchanged.

## Inputs and commits

- Incoming source under review: `7104f02` (`9ef9885` cherry-picked).
- Incoming historical evidence: `7877070` (`b3c826c` cherry-picked).
- New independent test: `src/exporters/pdfx-name-encoding-independent.test.mjs`.
- New evidence: this file.
- All input bytes in the test are constructed in memory; no retained PDFs were
  created or modified.
