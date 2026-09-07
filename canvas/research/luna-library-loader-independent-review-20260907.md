# Independent retained-library loader review

This is a read-only review of the exact committed loader revision `df4d05c` on its delivery line,
with source `9c26d31` and tests `012f0b7`. The revision was archived into the task-owned temporary
directory `/tmp/luna-library-loader-review-W8uxK1`; this `luna-android` worktree was not edited
except for this evidence note. The supplied source identifier was reviewed as the stated external
fixture identity; the committed authority is the exact revision and commit chain above.

## Focused exact-revision tests

```text
node --test src/canvas-schema.test.mjs src/canvas-imports.test.mjs \
  src/library-storage.test.mjs src/library-retained-imports.test.mjs \
  src/library-retained-loader.test.mjs src/library-publication-service.test.mjs
```

Exit `0`: 56 passed, 0 failed, 0 cancelled, 0 skipped.

The loader-specific probe command was:

```text
node --test --test-name-pattern='fresh loader reads accepted receipts from consumer storage after source deletion|missing retention, malformed descriptor, follow without accepted IDs, and root mismatch fail before source fallback|corrupt and truncated accepted descriptors fail at consumer storage, and consumer revocation denies reads' src/library-retained-loader.test.mjs
```

Exit `0`: 3 passed, 0 failed, 0 cancelled, 0 skipped. These probes cover source deletion with
consumer-only reads, missing descriptor, malformed descriptor, wrong-root identity, missing
accepted follow IDs, tampered/truncated descriptor bytes, and consumer denial.

## Findings

- `loadRetainedCanvasImports` snapshots the consumer before awaiting any receipt read, returns an
  empty `{ imports, assets, releases }` shape without storage I/O for empty imports, requires a
  valid retention descriptor and accepted release ID/content hash, and reads every receipt through
  `createLibraryStorage(api).readRetention(consumerId, descriptor)`. It does not resolve a source
  release or fall back to a latest publication.
- Mixed aliases remain independently namespaced (`imports/<alias>/...`), including aliases selecting
  the same receipt. The retained materializer tests also preserve nested dependency public manifests
  and local-resource closure boundaries.
- Publication-service compatibility probe: `normalizeImportRecord` preserves a valid `retention`
  descriptor. `prepareLibraryRelease` passes that normalized field to `resolveRelease` and carries it
  into the prepared release document import. With the same source/dependency fixture, the resolver
  input changed from `{documentId, updatePolicy}` to the same object plus `retention`, and the prepared
  content hash changed from
  `681eceeef5cb8659669d4c086800e4bfb8ab08ecddd26f179abb761e3125e914` to
  `81cd18399871d54f8e8916b965bfa56941d87df7ab8e36d3dac20f45629432ac`. This is a concrete
  compatibility/acceptance consideration for integration review, not a source change or a claim
  that the field is incorrect; strict external resolvers must tolerate the normalized descriptor,
  and publication identity now intentionally or unintentionally includes it.
- Retained bytes are authenticated by the accepted storage descriptor followed by restored size/hash
  validation. This review does not require a Merkle proof and makes no live-persistence claim.

No loader source, schema, backend, native/device, dependency, capability, or protected file was
changed. The only worktree change is this evidence-only review note.

## Follow-retention boundary reproduction

An additional exact-revision probe used a valid storage descriptor with
`{ documentId: "source", updatePolicy: "follow", retention }` but no `releaseId` or `contentHash`.
At `df4d05c`, `validateCanvasDocument` returned `{ valid: true, errors: [] }`, and
`normalizeImportRecord` returned the follow record with its retention descriptor and neither
accepted identity field. `loadRetainedCanvasImports` then rejected with
`CANVAS_IMPORT_INTEGRITY` (`Import ui has no accepted release identity.`) before calling either
`readAsset` or `resolveLibraryRelease` (observed call list: `[]`). This is the concrete schema/
normalizer boundary gap for integration review; no source edit was made here.
