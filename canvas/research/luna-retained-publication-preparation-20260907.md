# Retained publication preparation evidence

Date: 2026-09-07

This bounded package prepares a new semantic library release from consumer-owned
retention bundles. It does not write storage, append a publication, change the
schema, add public operations, or claim complete durable republication wiring.

## Provenance

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/library-publication-head`
- Branch: `codex/canvas-library-publication-head-20260907`
- Prior retained-republication evidence HEAD: `4c066bd5b1220cccbc200252a58becdf5353bbb5`
- Source commit: `12f8afb8fcb047774685966e785a1e3421c8dd79`
- New source: `canvas/src/library-retained-publication.mjs`
- Test/evidence commit: recorded with this report and the new focused test
- No existing source, schema, storage, native, backend, protected, or prior
  evidence files were modified.

## Focused verification

Command:

```text
node --test canvas/src/library-retained-publication.test.mjs canvas/src/library-retained-imports.test.mjs canvas/src/library-retained-loader.test.mjs canvas/src/library-retention-preparation.test.mjs canvas/src/library-storage.test.mjs canvas/src/library-publication-service.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/library-publication.test.mjs canvas/src/library-publication-head.test.mjs
```

Exit: `0`.

Result: `75` tests, `75` pass, `0` fail, `0` cancelled, `0` skipped. Duration:
`173.969708 ms`.

The new test file contributes `9/9` passing cases.

## Implemented contract

`prepareRetainedLibraryRelease(api, document, options)` snapshots the document,
release identifiers, and owned asset metadata/bytes before the first await. With
imports, it normalizes each import, requires accepted `releaseId` and
`contentHash` plus a retention descriptor, and reads only each retention bundle
through `createLibraryStorage(api).readRetention(options.libraryId, descriptor)`.
It never calls `getDocument`, an upstream release resolver, or an upstream asset
reader, and it does not write blobs.

The read bundles are validated by the existing
`buildRetainedCanvasImports(snapshot, retentionsByAlias)` boundary. This checks
aliases, accepted root identities, requested public items, private local
closure, public cross-document references, dependency closure, cycles, retained
asset bytes, and nested namespaced assets. The helper derives dependencies from
each validated direct retained import root; transitive dependencies are not
flattened.

The semantic document is a detached snapshot with only import `retention`
fields and `library.publication` removed. `updatePolicy`, accepted IDs, and
content hashes remain. `createLibraryRelease` receives exact direct dependency
identities and descriptors for the separately snapshotted own assets. The
returned `assets` map contains detached own bytes, and `retentions` is a stable
alias-sorted detached list of `{alias, retention}` transport bundles.

With no imports (including an omitted `imports` member), the helper performs no
API calls and returns a release with an empty retention list. Existing source
based `prepareLibraryRelease` remains unchanged.

## Evidence cases

The new focused tests cover:

- empty imports and zero API calls;
- one retained component, variable, and paragraph style;
- two-level retained assets with colliding source names, while preserving only
  the direct dependency identity and retained namespaces;
- source deletion/denial after retention setup, with consumer-only reads and no
  upload/write calls;
- missing retention, missing accepted identity, wrong accepted identity,
  private imported references, and cyclic retained closure rejection through
  the existing validators;
- retention locator and publication-head changes leaving the semantic release
  hash unchanged;
- changed accepted content changing the dependency identity and semantic
  release hash;
- caller document, retention locator, asset metadata, and `Uint8Array`
  mutation during an awaited read not changing the prepared result; and
- result mutation not changing caller/source fixtures, plus malformed and
  duplicate own asset rejection before retained reads.

The two-level case retains `shared.png` from both `one` and `two`; the retained
bundle records each source identity with that path, and the existing materializer
keeps the paths distinct by import ancestry. The resulting release dependency
list contains only the direct `lib -> two` identity, not transitive `one`.

## Boundary and non-claims

This helper authenticates and validates consumer-owned transport before creating
the new semantic release. It does not persist returned retention bundles or the
new release, does not update a source publication head, and does not make
upstream data available. Durable republication still requires subsequent storage
transport/writer integration outside this bounded package.
