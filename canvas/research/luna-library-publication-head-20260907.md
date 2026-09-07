# Published library head foundation — 2026-09-07

## Revision and scope

The requested isolated worktree was created at:

```text
/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/library-publication-head
```

It is branch `codex/canvas-library-publication-head-20260907`, based on the
verified combined HEAD `44b1c55dee74480e879ad5546370d48e60fe7fe8`. The combined
worktree had a pre-existing untracked `canvas/compatibility/mobile-fixtures/swiftui/.build/`; it was not touched. The strict shared
`validateLibraryStorageDescriptor` dependency was present at the base.

No combined worktree, native target, operation, manifest, capability table,
storage/read API, or protected document was changed.

## Implementation

The canonical schema now permits an optional `document.library.publication`
object while retaining the existing `library.public` list. Its required
`releaseId`, lower-case 64-hex `contentHash`, and strict storage descriptor are
validated; unknown fields and type coercions fail schema validation.

`prepareLibraryRelease` removes only the cloned snapshot's publication head
before hashing. The caller and public list remain unchanged, and the head is
excluded from prepared release identity.

`library-publication-head.mjs` provides:

- `createLibraryPublicationHead(release, storage)`, which validates the release,
  reuses the strict storage descriptor validator, and returns detached release
  identity plus storage metadata;
- `readPublishedCanvasLibrary(api, libraryId)`, which reads the source through
  `getDocument`, restores/materializes it with model destruction in `finally`,
  requires a publication head, reads exactly that storage descriptor through a
  fresh `createLibraryStorage(api)` adapter, and requires exact library/release/
  content identity. It performs no mutable-source fallback or blob-list/date/
  sequence selection.

Absent heads return `CANVAS_LIBRARY_UNPUBLISHED`; malformed heads, tampered
bytes, and stored-release identity mismatches return `CANVAS_IMPORT_INTEGRITY`.
Underlying source access-denial errors propagate unchanged.

## Verification

Final post-commit focused command:

```text
node --test canvas/src/canvas-schema.test.mjs canvas/src/library-publication-service.test.mjs canvas/src/library-publication-head.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/library-publication.test.mjs canvas/src/library-storage.test.mjs
```

Exit `0`; **58 passed, 0 failed, 0 cancelled, 0 skipped**; duration
`158.955542 ms`.

Coverage includes strict optional-head schema shape, unknown fields and hash
type coercion, detached head creation, valid fresh-adapter reads, source
denial, unpublished sources, malformed/tampered/wrong-identity heads, source
edits that do not change the head, and publication-service content-hash
invariance with caller immutability. No live backend or publication writer was
claimed.

## Commits

- Source: `aa15eab` — `feat(canvas): add published library head reader`
- Tests: `0c8ae91` — `test(canvas): verify published library head identity`
- Evidence: this file, committed separately.

No cherry-pick or direct integration edit was performed. Handoff is sent only
to root New Deck.
