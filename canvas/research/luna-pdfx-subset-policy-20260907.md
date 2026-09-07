# PDF/X Canvas-writer subset policy diagnostic

This review-only helper is in `canvas/src/exporters/pdfx-subset-policy.mjs` (source commit
`85f0ea8`). It accepts a `pdf-lib` `PDFDocument` and returns `{ issues }`, where every issue has
`{ code, clause, object }`. It does not wire into the PDF emitter, conformance flag, capabilities,
or any preflight path.

The Canvas-writer subset restrictions are explicitly narrower than universal ISO prohibitions:
catalog `Perms`, additional metadata streams beyond the exact catalog `Metadata` object, `OCG`/
`OCMD`/`OC` optional-content entries, and any `HalftoneType` are reported as
`CANVAS_SUBSET_UNSUPPORTED` under the relevant subset clauses. Exact catalog metadata may be an
inline or shared indirect object. The independent clause 6.21 viewer-preference rule accepts
`MediaBox`, and accepts `BleedBox` only when every page has one, for all four area/clip keys.

Traversal resolves inline and indirect arrays/dictionaries/streams, includes unreachable indirect
objects, deduplicates object identities, and tolerates cycles. A missing or malformed indirect
reference produces deterministic `OBJECT_GRAPH_INVALID` instead of escaping as an exception.
Absent entries and empty dictionaries are distinguished.

Focused verification:

```text
node --test canvas/src/exporters/pdfx-subset-policy.test.mjs
```

The focused policy suite passed 9/9. It includes raw and object-stream serialized round trips,
positive and negative exclusion fixtures, shared references, unreachable objects, cycles,
malformed references, all four `MediaBox` preferences, all-page and missing-page `BleedBox`, and
wrong preference types/names. No native build, device action, dependency, emitter, schema, storage,
materializer, capability, or protected-file change was made.
