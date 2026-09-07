# Independent accept-workflow review: prerequisite seam blocked

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

The requested prerequisites were not present in this worktree. The current
`canvas/src/library-storage.mjs` `createLibraryStorage()` result exposes
`retainItems` and `readRetention`, but does not expose
`retainPublishedItems`. The approved `acceptCanvasLibrary()` calls that method
unconditionally at line 41.

An existing isolated commit, `9225f6b8e805ace1b73e68d01d7bc0b26b9136f3`, adds
that method, but it is not an ancestor of this lane and was not cherry-picked
because the task explicitly limited cherry-picks to the accept workflow source
and tests. No production file was edited for this review.

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

No conclusion is drawn about the blocked behavior, hash identities, operation
payloads, inverse replay, or post-deletion loading until the storage seam is
made available in this lane. The precise next prerequisite is the approved
`retainPublishedItems` storage implementation (or an equivalent authorized
base update); silently substituting `retainItems` would not test the requested
acceptance protocol.
