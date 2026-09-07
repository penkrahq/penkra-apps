# Consumer library acceptance workflow verification

This package verifies the pure/public-runtime `acceptCanvasLibrary` workflow.
It does not add operation registration, backend endpoints, schema fields, or
source/publication fallback.

## Foundation

The approved publication-head foundation was applied with the narrow service
test resolution requested by the coordinator. `0c8ae91` contributed its new
publication-head files unchanged and only the test named
`publication preparation excludes the current publication head from release
identity`; the two unrelated service-test hunks were not imported.

## Workflow contract covered

- Input is cloned before any await; consumer Yjs and the exact nonnegative
  safe-integer sequence are restored before publisher reads.
- The current publisher head is read through `readPublishedCanvasLibrary`.
  `retainPublishedItems` receives that selected release and reauthorizes it
  through the explicit publication-reader callback, with no upstream/source
  resolver.
- Existing aliases bound to another source fail with
  `CANVAS_IMPORT_ALIAS_CONFLICT`; same-source updates preserve the existing
  policy unless explicitly overridden.
- Proposed retained imports are fully loaded and cross-reference/public-item
  checked before Yjs append. Schema validation also runs before append.
- Append carries one forward update, inverse update, expected sequence, and
  operation ID. A malformed append receipt returns
  `CANVAS_LIBRARY_ACCEPT_COMMIT_UNKNOWN` with identity and operation ID and is
  never retried.
- A post-append snapshot failure returns the committed receipt with
  `CANVAS_LIBRARY_SNAPSHOT_DEFERRED`; the model is destroyed in `finally`.

## Test evidence

The new 9-case matrix covers publication acceptance with nested retained
assets, source deletion followed by consumer-only loading, exact publisher
head rereads, default/explicit same-source policies, alias conflicts, private
or broken existing references, root denial before consumer upload, input and
receipt isolation, upload/readback/append failures, malformed append receipts,
deferred snapshots, inverse undo, concurrent consumer edits, invalid request
fields, and unsafe sequence values.

All storage/account behavior is exercised with an in-memory fake public asset
and Yjs transport. This is workflow/protocol evidence, not durable backend or
operation-host acceptance evidence.

Focused workflow command:

```text
node --test canvas/src/library-accept-workflow.test.mjs
```

Result: 9 passed, 0 failed, 0 cancelled, exit 0.

Foundation command:

```text
node --test canvas/src/canvas-schema.test.mjs canvas/src/library-publication-service.test.mjs canvas/src/library-publication-head.test.mjs canvas/src/library-publication-head-retentions.test.mjs canvas/src/library-publication.test.mjs canvas/src/library-storage.test.mjs canvas/src/library-release-retentions.test.mjs
```

Result: 56 passed, 0 failed, 0 cancelled, exit 0.

Full strict library/API/import/Yjs selection additionally included
`canvas-api.test.mjs`, `document-model.test.mjs`, all retained/publication/
storage tests, the workflow test, and the existing artifact integration test:
150 passed, 0 failed, 0 cancelled, exit 0. `git diff --check` exited 0.
