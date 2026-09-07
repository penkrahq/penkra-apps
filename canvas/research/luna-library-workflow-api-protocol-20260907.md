# Library workflow API protocol audit — 2026-09-07

This is a read-only protocol audit of the retained-library publication and acceptance workflows. It does not claim backend persistence acceptance, native behavior, or source-deletion acceptance beyond the existing workflow tests. No production, backend, operation, schema, manifest, or user-document files were changed.

## Scope and sources

The audit compared the adapter and workflow behavior with the original host/backend source tree:

- `canvas/src/canvas-api.mjs`: `createCanvasApi.getDocument`, `appendUpdate`, `createSnapshot`, and asset requests.
- `canvas/src/library-accept-workflow.mjs`: publication-head read, retained storage, append fence, inverse operation, and deferred snapshot receipt.
- `canvas/src/library-publication-head.mjs`: publication-head read through `getDocument` and storage release validation.
- `penkra-backend/packages/contracts/src/app-projects.ts`: append/snapshot request and receipt schemas.
- `penkra-backend/apps/server/src/lib/app-project-domain.ts`: durable append, duplicate client-update lookup, sequence fencing, current undo-row replacement, snapshot staleness check, watermark pruning, and ordered update reads.
- `canvas/src/library-workflow-api-protocol.test.mjs`: an isolated fake public Account transport driven only through the real `createCanvasApi` adapter and existing publication/acceptance functions.

The fake transport models the public paths and response shapes used by the adapter. It is not a backend substitute: no network, database, host service, or live Canvas document was used.

## Matrix and observed result

The new test has 3 cases and all passed:

1. Publication-head append plus snapshot and subsequent `acceptCanvasLibrary` through the real adapter. It verifies `expectedSequence`, UUID client update, operation ID and inverse bytes, consumer append receipt, the adapter's `source` → backend `projection` mapping, and the saved consumer/publisher snapshot watermarks.
2. Append/snapshot error and idempotency receipts. It verifies `CANVAS_DOCUMENT_CHANGED` at HTTP 409 for a stale append, `CANVAS_SNAPSHOT_AHEAD` at HTTP 409 for an ahead snapshot, duplicate client-update receipt preservation, current inverse replacement, and successful snapshot receipt.
3. `getDocument` watermark behavior. It verifies the adapter returns the snapshot watermark and only ordered updates with sequence greater than that watermark, while requesting the project and blob inventory through the expected public paths.

The strict focused command was:

```text
node --test canvas/src/library-workflow-api-protocol.test.mjs canvas/src/library-accept-workflow.test.mjs canvas/src/library-published-storage.test.mjs canvas/src/library-published-retention.test.mjs canvas/src/library-publication-head.test.mjs canvas/src/library-publication-head-retentions.test.mjs canvas/src/library-storage.test.mjs canvas/src/library-release-retentions.test.mjs canvas/src/library-retained-imports.test.mjs canvas/src/library-retained-loader.test.mjs canvas/src/library-retention-preparation.test.mjs canvas/src/library-publication.test.mjs canvas/src/library-publication-service.test.mjs canvas/src/canvas-api.test.mjs canvas/src/document-model.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/canvas-schema.test.mjs
```

Result: 142 tests passed, 0 failed, 0 cancelled, 0 skipped; exit code 0. The protocol-only command independently passed 3/3, exit code 0. `git diff --check` passed.

## Contract comparison

- Append requests preserve the public body, including `clientUpdateId`, encoded update, optional `expectedSequence`, and optional `{id,inverseUpdate}` operation. The backend compares the fence against the greater of the latest update sequence and snapshot watermark. The fake implements that same comparison.
- A new non-duplicate append receives `{sequence, duplicate:false, operationId}`. A duplicate `clientUpdateId` returns the existing receipt without appending or changing undo state. A new append clears the current undo row; an operation append stores the new inverse. The test covers both replacement and no-operation clearing.
- Snapshot requests use `throughSequence`, encoded state, and `projection`. The adapter translates workflow `source` to `projection`. An ahead snapshot returns the observed stable 409 code; a valid snapshot returns `{throughSequence}` and advances the watermark while pruning updates at or below it. The test verifies these receipts and the resulting `getDocument` view.
- `getDocument` returns the current snapshot and updates strictly after its watermark. The adapter performs the project request followed by blob inventory and restores the public `snapshot.source` view from backend `snapshot.projection`.
- Acceptance's append uses the captured consumer sequence and stores the inverse operation. After a successful append, snapshot failure is a deferred receipt in the workflow; this behavior remains covered by the existing acceptance test selection and was not changed here.

No concrete protocol deviation was reproduced. No source fix is proposed.

## Limits

The fake does not prove database transactions, access policy, quota enforcement, chunked snapshot transport, or concurrent writer locking. Those are backend responsibilities and remain outside this offline adapter audit. The test also does not rerun native, browser, or user-document workflows.

