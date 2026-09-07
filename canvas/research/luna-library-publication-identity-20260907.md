# Library publication identity review — 2026-09-07

## Scope

This bounded review started from `df4d05c5e27acf1bc74e7b85849c0d071de640bc` in
worktree `library-publication-identity` on branch
`codex/canvas-library-publication-identity-20260907`. It addresses only the
publication-service seam. No Canvas import loader, storage/read API, schema,
operation, native target, capability table, or protected file was changed.

Retention is consumer-local transport metadata, not dependency semantic
identity. Before this change, `prepareLibraryRelease` passed normalized import
records (including `retention`) to `loadCanvasImports`, whose resolver receives
that record, and then copied the same retention descriptor into the published
document. Both behaviors could alter resolver inputs and the release
`contentHash`.

## Narrow implementation

`canvas/src/library-publication-service.mjs` now normalizes the original import
records before stripping transport metadata. A retained `follow` record without
both accepted `releaseId` and `contentHash` fails with
`CANVAS_IMPORT_INTEGRITY` before the resolver is invoked. A separate snapshot
with `retention` removed is passed to the existing `loadCanvasImports` path.
The published document retains `documentId`, `updatePolicy`, and accepted or
resolved release identity, but never embeds `retention`. `canvas-imports.mjs`
is unchanged, so general import loading behavior is unchanged.

## Focused verification

Command, run from the repository root after both source and test commits:

```text
node --test canvas/src/library-publication-service.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/library-publication.test.mjs
```

Result: **21 passed, 0 failed, 0 cancelled, 0 skipped**, exit 0, duration
86.845792 ms.

The new service cases verify that:

- the same authored document and selected dependency have identical release
  `contentHash` with and without a valid retention descriptor;
- resolver records contain no retention descriptor;
- the original caller document is unchanged;
- the dependency identity remains exactly the selected
  `libraryId`/`releaseId`/`contentHash`;
- imports without retention continue through the existing path; and
- a retained follow import missing accepted identity is rejected before source
  resolution (`resolverCalls === 0`).

No source-release fallback is introduced: accepted identities remain on the
retention-free resolver record, and the existing loader performs its normal
exact identity check.

## Commits

- Source: `e7bae5c` — `fix(canvas): isolate retention from publication identity`
- Tests: `bc3b7b3` — `test(canvas): cover publication retention isolation`
- Evidence: this file, committed separately after the final focused run.

This is review evidence for the bounded publication seam, not a broad library
compliance or capability-promotion claim. No cherry-pick was performed.
