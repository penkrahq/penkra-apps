# Independent PDF envelope review — 2026-09-07

This is an independent review of root candidate `ccd2a060e1f456d0e45fd1e6b381113001868341` on branch `codex/canvas-pdf-envelope-20260907`. The helper is intentionally a strict serializer-subset check: one classic xref section, direct stream lengths, generation-zero live objects, and no repair. It is not a universal PDF grammar/semantic validator, is not wired to preflight, and makes no PDF/X or conformance claim.

## Isolation and commands

The root worktree was read-only; its pre-existing untracked `canvas/node_modules` was not touched. Exploratory execution used the isolated detached checkout:

`/tmp/pdf-envelope-review-corrected-KlbxPC`

Root baseline command:

```text
node --test src/exporters/pdf-serialization-envelope.test.mjs
```

Result: **10 pass, 0 fail, 0 cancelled, 0 skipped**, exit `0`.

Corrected paired-checkout command, using the test's default sibling implementation URL and default relative retained candidate path:

```text
cd /tmp/pdf-envelope-review-corrected-KlbxPC/canvas
node --test src/exporters/pdf-serialization-envelope.test.mjs \
  src/exporters/luna-pdf-envelope-independent.test.mjs
```

The checkout used a temporary symlink to the root worktree's already-installed `canvas/node_modules`; no dependency files were copied or modified. The first attempt without dependencies exited `1` before test discovery with `ERR_MODULE_NOT_FOUND: pdf-lib`; the rerun with that symlink completed **20 pass, 0 fail, 0 cancelled, 0 skipped**, exit `0` (10 root tests plus 10 independent tests). `PDF_ENVELOPE_SOURCE` and `PDF_ENVELOPE_CANDIDATE` remain optional overrides for isolated review worktrees; after integration the default command above is self-contained. The retained candidate was loaded and re-saved in memory with `PDFDocument.save({ useObjectStreams: false })`; no PDF or corpus was generated or retained by this review.

## Matrix covered

- Actual pdf-lib classic output and the retained valid candidate after classic re-save.
- Correct 20-byte xref records with LF, CR, and CRLF endings.
- Strings and binary streams containing fake `endstream`, `endobj`, `trailer`, and `startxref` delimiters.
- Exact and short direct stream lengths, the legal alternate framing where the separator EOL is the final declared data byte, plus-two framing, indirect lengths, and negative direct lengths.
- Raw object integer/real spelling, including signed integer boundaries and real magnitude boundaries.
- Decoded name-byte limits, escaped bytes, null names, duplicate decoded dictionary keys, and malformed arrays/dictionaries.
- Wrong `startxref`, wrong xref offsets, object identity mismatch, free/generation mismatch, missing references, xref size holes, repeated xref sections, trailing bytes, object streams, and incremental-style trailing data.
- A deterministic 256-input malformed xref mutation loop. All calls returned a boolean result and issue array; all 256 were rejected in under 2 seconds.

## Stream-length observation — no proven serialization defect

Adobe PDF 1.6 section 3.2.7/Table 3.4 ([primary reference](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf), printed pages 37-38) permits stream data to end at the declared `/Length`, with an optional extra EOL before `endstream`. Therefore the previously described “Length+1” case is not established invalid at the serialization layer: the final separator EOL can itself be the last declared stream-data byte.

Fixture payload bytes are:

```text
endstream\nendobj\ntrailer\n\x00\xff
```

The stream dictionary declares `/Length 28` for the 27 bytes shown, while the fixture retains the normal EOL before `endstream`. The helper returns:

```json
{"verified":true,"serialization":"classic-xref","objectCount":2,"issues":[]}
```

The same fixture with `/Length 26` rejects with `expected-endstream`; `/Length 29` rejects with `expected-endstream`. The behavior follows source lines 199-203: after consuming the declared data, the helper accepts an optional CR/LF before `endstream`. This is an observed alternate legal framing, not a proven bug or accepted-malformed finding. Semantic consumers or filters may impose additional constraints, which this envelope checker does not assess. No production fix was made.

## Observed protections and scope limits

Wrong offsets, object identities, missing references, size holes, duplicate decoded keys, invalid number spellings, malformed composites, and unsupported object-stream/incremental forms rejected deterministically. Raw object integer and real spellings remained distinct because this helper scans original bytes. The helper accepted all tested LF/CR/CRLF 20-byte xrefs and both actual classic PDF sources.

These results establish only behavior of the bounded classic serialization envelope. They do not establish universal PDF validity, semantic page/resource validity, PDF/X certification, profile conformance, or safety of unsupported object-stream/incremental formats.

No root source, production implementation, profile gate, native compiler, device, or retained PDF artifact was changed.
