# Independent PDF envelope review — 2026-09-07

This is an independent review of root candidate `ccd2a060e1f456d0e45fd1e6b381113001868341` on branch `codex/canvas-pdf-envelope-20260907`. The helper is intentionally a strict serializer-subset check: one classic xref section, direct stream lengths, generation-zero live objects, and no repair. It is not a universal PDF grammar/semantic validator, is not wired to preflight, and makes no PDF/X or conformance claim.

## Isolation and commands

The root worktree was read-only; its pre-existing untracked `canvas/node_modules` was not touched. Exploratory execution used the isolated detached checkout:

```text
/tmp/pdf-envelope-review-WMmVCA
```

Root baseline command:

```text
node --test src/exporters/pdf-serialization-envelope.test.mjs
```

Result: **10 pass, 0 fail, 0 cancelled, 0 skipped**, exit `0`.

Independent command, with the exact root helper supplied externally:

```text
PDF_ENVELOPE_SOURCE=/tmp/pdf-envelope-review-WMmVCA/canvas/src/exporters/pdf-serialization-envelope.mjs \
PDF_ENVELOPE_CANDIDATE=/tmp/pdf-envelope-review-WMmVCA/canvas/research/pdfx-image-correction-20260907/valid-writer-baseline-classic-xref.pdf \
node --test src/exporters/luna-pdf-envelope-independent.test.mjs
```

Result in luna-pdf: **10 pass, 0 fail, 0 cancelled, 0 skipped**, exit `0`.

The same test was staged beside the root implementation in the isolated checkout and rerun with the same result: **10 pass, 0 fail, 0 cancelled, 0 skipped**, exit `0`. The retained candidate was loaded and re-saved in memory with `PDFDocument.save({ useObjectStreams: false })`; no PDF or corpus was generated or retained by this review.

## Matrix covered

- Actual pdf-lib classic output and the retained valid candidate after classic re-save.
- Correct 20-byte xref records with LF, CR, and CRLF endings.
- Strings and binary streams containing fake `endstream`, `endobj`, `trailer`, and `startxref` delimiters.
- Exact, short, overlong, indirect, and negative direct stream lengths.
- Raw object integer/real spelling, including signed integer boundaries and real magnitude boundaries.
- Decoded name-byte limits, escaped bytes, null names, duplicate decoded dictionary keys, and malformed arrays/dictionaries.
- Wrong `startxref`, wrong xref offsets, object identity mismatch, free/generation mismatch, missing references, xref size holes, repeated xref sections, trailing bytes, object streams, and incremental-style trailing data.
- A deterministic 256-input malformed xref mutation loop. All calls returned a boolean result and issue array; all 256 were rejected in under 2 seconds.

## Concrete finding

### Accepted direct stream length mismatch

The helper accepts a one-byte-overlong direct stream length when the extra byte is the separator EOL immediately before `endstream`.

Fixture payload bytes are:

```text
endstream\nendobj\ntrailer\n\x00\xff
```

The stream dictionary declares `/Length 28` for the 27-byte payload, while the fixture retains the normal EOL before `endstream`. `inspectCanvasPdfEnvelope` returns:

```json
{"verified":true,"serialization":"classic-xref","objectCount":2,"issues":[]}
```

The same fixture with `/Length 26` rejects with `expected-endstream`; `/Length 29` also rejects with `expected-endstream`. The behavior follows source lines 199-203: the declared length is consumed, then one optional CR/LF is skipped before `endstream`. This is a concrete accepted length mismatch under the helper's own valid-fixture convention. No production fix was made; root owns the policy and implementation decision.

## Observed protections and scope limits

Wrong offsets, object identities, missing references, size holes, duplicate decoded keys, invalid number spellings, malformed composites, and unsupported object-stream/incremental forms rejected deterministically. Raw object integer and real spellings remained distinct because this helper scans original bytes. The helper accepted all tested LF/CR/CRLF 20-byte xrefs and both actual classic PDF sources.

These results establish only behavior of the bounded classic serialization envelope. They do not establish universal PDF validity, semantic page/resource validity, PDF/X certification, profile conformance, or safety of unsupported object-stream/incremental formats.

No root source, production implementation, profile gate, native compiler, device, or retained PDF artifact was changed.
