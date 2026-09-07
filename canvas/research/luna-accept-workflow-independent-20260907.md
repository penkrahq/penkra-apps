# Independent accept-workflow review and no-op correction

Date: 2026-09-07

This review was scoped to in-memory fake Account/Yjs protocol behavior. It did
not use a live API, mutate a real Canvas document, use native tooling, or make
a capability claim.

## Provenance

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/library-publication-head`
- Branch: `codex/canvas-library-publication-head-20260907`
- Approved accept source cherry-picked from `d8f0c45` as local
  `3815df5c1f66381070f58d83a31633d4bebf0950`
- Approved boundary tests cherry-picked from `45d2727` as local
  `fc1f6b2c72d56ca9e13dcd6d597aa101f4d0a77c`
- Independent probe: `canvas/src/library-accept-workflow-independent.test.mjs`
- Narrow source correction: `canvas/src/library-accept-workflow.mjs` (local
  source commit recorded at handoff)

The requested prerequisites were not present in this worktree. The current
`canvas/src/library-storage.mjs` `createLibraryStorage()` result exposes
`retainItems` and `readRetention`, but does not expose
`retainPublishedItems`. The approved `acceptCanvasLibrary()` calls that method
unconditionally at line 41.

An existing isolated commit, `9225f6b8e805ace1b73e68d01d7bc0b26b9136f3`, adds
that method. After the initial reproduction, the approved equivalent
`9594dcb` was cherry-picked as local `cb7d9a4`, together with its isolated test
`6f24b27` (`263c8e4`) and evidence `a228b9e` (`cda3964`). No new production
change was authored in this review.

## Concrete reproduction

The independent fake Account first creates a real nested retained publication,
then calls the real `publishCanvasLibrary()`. That publish succeeds and writes
the publisher release/head through the fake persisted Yjs/blob protocol. The
first real accept call then fails at the exact boundary:

```text
TypeError: createLibraryStorage(...).retainPublishedItems is not a function
    at acceptCanvasLibrary (.../canvas/src/library-accept-workflow.mjs:41:55)
```

This occurs before consumer retention upload, consumer append, snapshot, or
acceptance receipt. It is therefore not a fixture-only source-read failure.

The approved source test reproduces the same issue. Command:

```text
node --test canvas/src/library-accept-workflow.test.mjs
```

Result: exit `1`; `2` passed, `7` failed, `0` cancelled, `0` skipped. The seven
failures all reach the missing method; the two passing cases reject before
publication selection or before the missing call.

The independent probe command was:

```text
node --test canvas/src/library-accept-workflow-independent.test.mjs
```

At this baseline it produced `1` pass and `5` failures. The pass is publisher
permission denial before consumer upload. The five failures reach the same
missing storage method after real publisher publication. The independent
source contains the remaining real-protocol cases so they can run unchanged
once the approved storage prerequisite is present.

## Blocked acceptance matrix

The following cases could not execute past the missing method: nested retained
assets after publisher/upstream deletion; same-source alias update and policy
preservation; other-source alias conflict after a valid selection; removed or
private accepted item rejection; consumer upload/readback failure; consumer
CAS conflict; malformed durable append receipt; snapshot-deferred replay;
exact inverse undo; caller mutation across awaits; and acceptance followed by a
fresh retained loader with upstream reads unavailable.

The publisher-denied, asset-free case did execute and preserved the required
boundary: publisher denial occurred before consumer upload or append.

## Post-prerequisite verification

After the approved storage seam was added, the independent test initially
passed `6/6` with `0` failures, cancellations, or skips. The review then kept a
dedicated exact repeat of the same release, same items, and same policy. Before
the correction, that valid repeat reached
`createDocumentOperationUpdates()` and threw `Canvas operation did not produce
an undoable update.` This was a concrete workflow defect, not a fixture
substitution.

The narrow correction imports `isDeepStrictEqual` from `node:util` and compares
the fully reauthorized, retained-loaded, schema-validated proposed consumer
with the original materialized consumer. An unchanged result returns
`accepted:true`, `changed:false`, the detached identity/retention, and the
captured sequence, without operation ID, append, snapshot, or fabricated undo.
Changed receipts now explicitly contain `changed:true`. No general
document-model no-op policy was changed.

After that correction, the independent test passed `7/7` with `0` failures,
cancellations, or skips. It exercised real `publishCanvasLibrary()` ->
`acceptCanvasLibrary()` -> fresh `loadRetainedCanvasImports()` using persisted
fake Account/Yjs state. The successful cases covered nested asset loading after
publisher deletion, asset-free publisher denial, removed/private public-item
rejection before append, upload/readback failure, consumer CAS conflict using a
real Yjs edit, malformed durable append as
`CANVAS_LIBRARY_ACCEPT_COMMIT_UNKNOWN`, deferred snapshot, exact inverse undo,
caller/source snapshot isolation, exact same-release no-op reacceptance with
detached receipt data, same-source policy preservation, alias conflict, and
newest-head selection while prior immutable bytes remained.

Final independent command:

```text
node --test canvas/src/library-accept-workflow-independent.test.mjs
```

Exit `0`; `7` passed, `0` failed, `0` cancelled, `0` skipped; duration
`312.457458 ms`.

The broader pure focus was:

```text
node --test canvas/src/library-accept-workflow-independent.test.mjs canvas/src/library-accept-workflow.test.mjs canvas/src/library-published-storage.test.mjs canvas/src/library-publish-workflow-independent.test.mjs canvas/src/library-publish-workflow.test.mjs canvas/src/library-publication-head-retentions.test.mjs canvas/src/library-publication-head.test.mjs canvas/src/library-release-retentions.test.mjs canvas/src/library-retained-publication.test.mjs canvas/src/library-published-retention.test.mjs canvas/src/library-published-retention-independent.test.mjs canvas/src/library-retained-imports.test.mjs canvas/src/library-retained-loader.test.mjs canvas/src/library-retention-preparation.test.mjs canvas/src/library-storage.test.mjs canvas/src/library-publication-service.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/library-publication.test.mjs
```

Exit `0`; `128` passed, `0` failed, `0` cancelled, `0` skipped; duration
`406.105958 ms`.

The initial missing-method result remains retained as branch-mismatch evidence
only; it is superseded for acceptance conclusions by the post-prerequisite
run. The no-op source defect was corrected narrowly and covered by the exact
repeat regression. No additional concrete defect remains from the exercised
acceptance workflow.
