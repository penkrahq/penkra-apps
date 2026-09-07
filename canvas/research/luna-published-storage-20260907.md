# Published-library storage acceptance verification

This evidence covers the bounded `createLibraryStorage().retainPublishedItems`
adapter. The method accepts only an explicitly supplied `readPublication`
reader; it does not resolve a source publication, select a latest release, or
grant new upstream access.

## Implementation boundary

- Release and requested items are cloned before the first await.
- The root publication is reauthorized on every call with exactly
  `{documentId, releaseId, contentHash}` and the selected release must match
  all three fields.
- `preparePublishedLibraryRetention` consumes the selected publication and
  its already-retained dependency closures. No B/source reader is used while
  C accepts published A.
- Minimal retention assets use the existing content-addressed `storeAssets`
  and the existing retention envelope format. The method returns no receipt
  until asset upload/readback and envelope upload/readback succeed.

## Focused matrix

The new five-case matrix verifies: A accepting B then publishing; C accepting
published A after B is unavailable; C materializing the retained closure after
A and B are deleted; exact one-call root reauthorization; missing reader and
root denial before any C upload; wrong selected identity; missing retained
transport; private requested item; corrupted accepted asset; input mutation
across the publication-reader await; and asset, envelope, and readback
failures with unrelated C blobs preserved and no retention receipt.

The fake transport implements the public upload/read asset protocol with
per-document stores. It is protocol evidence only, not durable backend,
revocation-persistence, publication-operation, or source-deletion acceptance
evidence.

Command:

```text
node --test canvas/src/library-published-storage.test.mjs canvas/src/library-storage.test.mjs canvas/src/library-release-retentions.test.mjs canvas/src/library-published-retention.test.mjs canvas/src/library-retained-imports.test.mjs canvas/src/library-retention-preparation.test.mjs
```

Result: 47 passed, 0 failed, 0 cancelled, exit 0. The complete focused
library/protocol selection is recorded in the final handoff after the broader
schema/import/loader selection.
