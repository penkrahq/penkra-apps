# Independent publication-workflow review

Date: 2026-09-07

This is a bounded, in-memory protocol review of the approved publication
workflow. It does not claim live API registration, durable backend deployment,
native behavior, or a general publication capability.

## Provenance and scope

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/library-publication-head`
- Branch: `codex/canvas-library-publication-head-20260907`
- Workflow source cherry-picked from `4969724` as local commit
  `521c22d34e5c0f921f243e7367a6281fbb565b4a`
- Boundary tests cherry-picked from `6c0d77e` as local commit
  `2f61dc767376e0bf10acb6c40d2a97c845bf5980`
- Independent test added: `canvas/src/library-publish-workflow-independent.test.mjs`
- This report is the only other file added for this review. No production
  source was edited, and no device, native compiler, live API, or real
  document write was used.

The independent test uses the real Yjs document model, publication-head reader,
library-storage adapters, retained-publication preparation, published-retention
acceptance, and retained-import materializer. Its fake Account transport only
permits the publisher project (`publisher`) after fixture setup. No upstream
`A`, `ui`, or `theme` getter is available to the workflow under test.

## Verification command

```text
node --test canvas/src/library-publish-workflow-independent.test.mjs canvas/src/library-publish-workflow.test.mjs canvas/src/library-publication-head-retentions.test.mjs canvas/src/library-publication-head.test.mjs canvas/src/library-release-retentions.test.mjs canvas/src/library-retained-publication.test.mjs canvas/src/library-published-retention.test.mjs canvas/src/library-published-retention-independent.test.mjs canvas/src/library-retained-imports.test.mjs canvas/src/library-retained-loader.test.mjs canvas/src/library-retention-preparation.test.mjs canvas/src/library-storage.test.mjs canvas/src/library-publication-service.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/library-publication.test.mjs
```

Exit `0`; `107` passed, `0` failed, `0` cancelled, `0` skipped; duration
`312.336209 ms`. The six independent workflow tests were all passing (`6/6`).

## Protocol coverage

The fixture begins with a Yjs source head for `publisher` containing an
accepted, standalone retained transport descriptor for A's public `hero`.
The retained closure is A -> ui -> theme, including ui's `logo.png` asset and
the theme `accent` variable. The publisher also owns `source.png` as a normal
non-library asset.

The workflow then:

1. reads and snapshots the publisher source document;
2. validates the explicit public manifest and source document;
3. reads and hash-checks only the publisher-owned `source.png`;
4. prepares a semantic release from retained copies, without upstream reads;
5. writes and reads back the immutable release through the real storage
   adapter;
6. appends a Yjs update with `expectedSequence: 0`, a UUID
   `clientUpdateId`, and an operation UUID with forward and inverse updates;
7. attaches the publication head only in that update; and
8. snapshots the post-append state.

The test replays the exact append update and inverse update against Yjs. The
forward replay exposes the new publication head; applying the inverse restores
the complete initial materialized document. A fresh head read returns the
retained transport, which is passed through published-retention acceptance and
then `buildRetainedCanvasImports`. Final assets include
`imports/publisher/imports/a/imports/ui/logo.png` and
`imports/publisher/source.png`. All workflow transport calls are publisher
scoped.

Additional exercised boundaries are:

- revision conflict: append rejects, no snapshot occurs, and no head is
  attached;
- snapshot failure: append remains durable and the result is
  `published: true` with deferred snapshot status;
- malformed append receipt: an accepted durable update yields
  `CANVAS_LIBRARY_PUBLICATION_COMMIT_UNKNOWN` with operation/publication
  context, rather than being reported as absent;
- caller request and fetched-source mutation across an awaited asset read:
  the selected publication remains based on the initial snapshots;
- explicit `publicItems: []`: an intentional empty public manifest is
  published;
- two successive publications: the earlier immutable release bytes remain
  intact while a fresh source head selects only the newest release;
- missing API methods, invalid public shape, denied source asset, and
  tampered source asset: each fails before append.

The observed error codes for those negative boundaries are respectively
`CANVAS_LIBRARY_STORAGE_REQUIRED`, `CANVAS_SCHEMA_INVALID`,
`CANVAS_LIBRARY_ACCESS_DENIED`, and `CANVAS_IMPORT_INTEGRITY` where asserted.

## Findings

No concrete production defect was reproduced by the independent protocol
review. The two initial failures were fixture/test expectation errors, not
workflow defects: the first used a release-envelope descriptor where the
workflow requires a standalone retained transport descriptor; the second
expected a component-shaped theme public item although the fixture used a
variable. The test also correctly accounts for generated `contentHash` fields
in the returned public manifest.

The fake transport demonstrates the required source/retained boundary: after
retained setup, upstream A/ui/theme resolution and asset reads are unavailable,
while publisher reads and writes remain available. No fallback to an upstream
source release is therefore needed for the tested accepted content.

This evidence covers pure protocol composition and failure classification only.
It does not establish live authorization, public service registration, backend
durability under real concurrency, or a broad native/Canvas capability claim.
