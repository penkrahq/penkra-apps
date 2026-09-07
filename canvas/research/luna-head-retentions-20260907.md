# Publication-head retained transport integration evidence

Date: 2026-09-07

This bounded change preserves optional retained transport while reading a
published library head. It does not add operations, backend behavior, append
logic, native work, or capability promotion.

## Provenance

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/library-publication-head`
- Branch: `codex/canvas-library-publication-head-20260907`
- Prior HEAD before the storage-chain cherry-picks: `3ca73cc0a24cdeaa8329851b98826ffa435f9dc0`
- Approved storage-chain commits cherry-picked cleanly as local commits:
  `177c9f6`, `e231e2e`, `a582adf`, `b5d3990`, `647862f`, `a9c8ea3`
- Head-reader source change: recorded in the separate source commit for this
  package
- New test: `canvas/src/library-publication-head-retentions.test.mjs`
- No existing storage, schema, publication, native, backend, protected, or
  prior evidence file was edited by this package.

## Scoped verification

Command:

```text
node --test canvas/src/library-publication-head-retentions.test.mjs canvas/src/library-publication-head.test.mjs canvas/src/library-release-retentions.test.mjs canvas/src/library-retained-publication.test.mjs canvas/src/library-published-retention.test.mjs canvas/src/library-published-retention-independent.test.mjs canvas/src/library-retained-imports.test.mjs canvas/src/library-retained-loader.test.mjs canvas/src/library-retention-preparation.test.mjs canvas/src/library-storage.test.mjs canvas/src/library-publication-service.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/library-publication.test.mjs
```

Result: exit `0`, `96` passed, `0` failed, `0` cancelled, `0` skipped;
duration `276.30425 ms`.

## Head-to-consumer composition

The new test creates a real Yjs document payload containing a publication head
for publisher `publisher`, writes a release envelope with nested retained
transport through `createLibraryStorage.writeRelease`, and reads it back through
`readPublishedCanvasLibrary`. The returned retained bundle is then passed to
`preparePublishedLibraryRetention`, and the resulting publisher retention is
materialized for a final consumer with `buildRetainedCanvasImports`.

The fixture has publisher -> UI -> theme closure, including UI-owned `logo.png`
and theme's public `accent` variable. The final materialized asset path is
`imports/publisher/imports/ui/logo.png`. The acceptance path receives no source
resolver, source getter, or A/B asset reader. The fake transport exposes only
publisher storage for head reading; every observed storage call is publisher
scoped.

## Head-reader behavior

`readPublishedCanvasLibrary` still returns the existing
`{release, assets, publication}` shape for legacy stored releases without
retentions. When `stored.readRelease` has an own `retentions` field, the reader
now adds a structured clone of that field to the result. Absent remains absent.

Tests verify that changed head release identity, a tampered release envelope,
and tampered retained asset bytes reject with `CANVAS_IMPORT_INTEGRITY` without
fallback. Mutating a returned release, retained bytes, or publication head does
not mutate persisted bytes or the next fresh reader result.

## Review result

The narrow reader seam preserves optional retained transport exactly when
present and keeps legacy absence unchanged. The pure composition demonstrates
head/Yjs -> stored release -> retained transport -> published-retention
acceptance -> final retained import materialization. No live authorization,
durable republication, backend integration, or broad capability claim is made.
