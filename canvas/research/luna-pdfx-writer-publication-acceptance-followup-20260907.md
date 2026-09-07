# PDF/X writer output-shape follow-up — 2026-09-07

## Scope

This is a narrow test/evidence correction after `a321e40`. It does not change
production code, profiles, the publication gate, capabilities, or the
standalone validator's `conformant:false` result. The matrix still exercises
the real `exportPdf` PDF/X-4 path with the bundled GRACoL2013 CRPC6 and sRGB2014
profiles; it does not substitute hand-built PDFs.

The prior report's phrase “gate coverage must remain incomplete” was corrected
in the test to “standalone checker limitations remain recorded.” This wording
describes the standalone preflight report and makes no claim that the writer's
publication gate is closed or open beyond the observed returned-artifact
behavior.

## Newly enforced serialized-output checks

The test commit `d909a7d` adds checks to
`src/exporters/luna-pdfx-export-path-matrix.test.mjs`:

- `translucent-fill` parses the page content with `readPdfContent`, resolves
  every used `gs` operand through the serialized page `Resources.ExtGState`
  dictionary using byte-identity resource lookup, and requires a used state
  with `/ca` exactly `0.5`.
- `translucent-stroke` requires a parsed `S` stroke operator and a used
  ExtGState with `/CA` exactly `0.5`.
- `ellipse` requires an actual parsed cubic `c` operator and retains the
  no-image assertion.
- `path-evenodd-hole` requires the parsed `f*` operator rather than a text
  regular expression.
- `exact-embedded-inter-text` hashes decoded embedded `FontFile2` bytes and
  requires the exact bundled Inter-Regular SHA-256:
  `a414b48aa577ef2c62ebb135341ddeef33ee26a4f5dc9f787f93c1aab08ebb50`.

All existing page-box, page-count, native/no-image, alpha PNG image/soft-mask,
and negative-control assertions remain in place.

## Verification

Command, run from `canvas/`:

```text
bun test src/exporters/luna-pdfx-export-path-matrix.test.mjs src/export-service.test.mjs src/exporters/luna-pdfx-font-matrix.test.mjs
```

Observed result:

| Selection | Passed | Failed | Cancelled/skipped |
| --- | ---: | ---: | ---: |
| Actual export-path matrix, including 12 positive and 3 negative cases | 15 | 0 | 0 |
| `export-service.test.mjs` | 8 | 0 | 0 |
| Serialized font matrix | 81 | 0 | 0 |
| **Total** | **104** | **0** | **0** |

Each positive writer case returned `Uint8Array`, began `%PDF-1.6`, reparsed,
and produced `status=verified-canvas-writer-subset`,
`canvasWriterSubset.verified=true`, `issues=[]`, and `conformant=false` from
standalone preflight. The service case published the actual PDF/X file and
retained destination-collision and invalid-profile no-artifact controls.

No native compiler, device, profile mutation, capability change, or retained
binary corpus was used. The follow-up test has no evidence-writing behavior.

## Commits

| Commit | Contents |
| --- | --- |
| `ff1a53f` | Cherry-picked coordinator writer-gate change; production source baseline |
| `a321e40` | Returned-artifact/service test conversion |
| `8dfc416` | Historical writer-publication evidence report |
| `d909a7d` | Serialized alpha, geometry, operator, and exact-font assertions |
| pending | This follow-up evidence report |
