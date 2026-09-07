# Accepted retention loader verification

Date: 2026-09-07
Worktree: `canvas-parallel-20260906/library-loading`
Branch: `codex/canvas-library-loading-20260907`
Baseline: `51ce2a8`

This package implements and verifies a production-usable loader seam only. It
does not wire public operations, select releases, authorize source reads, or
claim backend migration/persistence behavior.

## Commits

- `9c26d31` — `feat(canvas): load accepted retention receipts`
- `012f0b7` — `test(canvas): cover accepted retention loader`

## Focused command and result

```text
node --test src/canvas-schema.test.mjs src/canvas-imports.test.mjs \
  src/canvas-resolver.test.mjs src/library-item-content.test.mjs \
  src/library-publication-service.test.mjs src/library-publication.test.mjs \
  src/library-retained-imports.test.mjs src/library-retained-loader.test.mjs \
  src/library-retention-preparation.test.mjs src/library-storage.test.mjs
```

Exit code: `0`  
Tests: `88`  
Passed: `88`  
Failed: `0`  
Cancelled: `0`  
Skipped: `0`

`git diff --check` passed before both commits and the worktree was clean after
the test commit.

## Verified behavior

- `loadRetainedCanvasImports` snapshots the consumer before awaits, requires a
  nonempty consumer document ID, requires a retention descriptor and accepted
  release identity for every nonempty import, and reads receipts only through
  `createLibraryStorage(api).readRetention`.
- Empty imports return `{imports, assets, releases}` without network calls.
- Missing retention returns `CANVAS_IMPORT_RETENTION_REQUIRED`.
- Malformed, corrupt, or truncated storage descriptors return
  `CANVAS_IMPORT_INTEGRITY`; root identity mismatches and follow records without
  accepted IDs also fail closed.
- Fresh receipt loading works after source deletion, while deleting the
  consumer-owned receipt store denies the read. No source resolver/get path is
  used by the loader.
- Two aliases using one accepted receipt receive distinct namespaced asset
  paths.
- Import normalization clones the strict storage-owned descriptor shape
  `{path,sha256,size,mimeType?}`. The canonical validator enforces allowed
  fields, content-addressed path/hash agreement, and nonnegative safe integer
  size; no divergent loader regex is used.

The accepted storage descriptor and retained item self-hashes anchor the
authenticated bundle boundary, but they are not a cryptographic inclusion
proof for omitted content. No Merkle/signature system was added.

## Follow-up: retained follow identity boundary

Date: 2026-09-07
Starting verified commit: `df4d05c`

Implementation and regression commits:

- `9855b2b` — `fix(canvas): require identity for retained imports`
- `4f31e0f` — `test(canvas): cover retained follow identity boundaries`

The schema and normalizer now require a complete nonempty accepted
`releaseId` plus 64-hex `contentHash` whenever `retention` is supplied,
including `updatePolicy: "follow"`. Missing both IDs, only `releaseId`, or
only `contentHash` returns `CANVAS_IMPORT_INTEGRITY` at normalization; schema
validation rejects the same records. A valid retained follow record remains
accepted. A follow record without retention and without IDs remains a valid
discovery input at the normalizer/schema boundary; the retained-only loader
then returns its existing `CANVAS_IMPORT_RETENTION_REQUIRED` error without a
source fallback or source read. Pinned retained records use the same identity
requirement.

Targeted boundary command:

```text
node --test src/canvas-schema.test.mjs src/canvas-imports.test.mjs src/library-retained-loader.test.mjs
```

Exit code: `0`; tests `33`; passed `33`; failed `0`; cancelled `0`; skipped `0`.

Prior focused selection rerun:

```text
node --test src/canvas-schema.test.mjs src/canvas-imports.test.mjs src/canvas-resolver.test.mjs src/library-item-content.test.mjs src/library-publication-service.test.mjs src/library-publication.test.mjs src/library-retained-imports.test.mjs src/library-retained-loader.test.mjs src/library-retention-preparation.test.mjs src/library-storage.test.mjs
```

Exit code: `0`; tests `91`; passed `91`; failed `0`; cancelled `0`; skipped `0`.
`git diff --check` passed. No native/device/browser work, operations wiring,
backend calls, or source document mutation were performed. This evidence is
boundary verification only and does not claim durable backend persistence or
accepted-content-after-revocation implementation beyond the existing loader
contract.
