# Release retention transport verification

Offline protocol evidence for the optional `prepared.retentions` field on
`createLibraryStorage().writeRelease()` / `readRelease()`. This package does
not change `retainItems`, acceptance, publication, operation wiring, or
semantic release hashing.

## Scope

- Retention transport is optional. Legacy writes and reads omit `retentions`
  and preserve the previous return shape.
- Present transport requires exactly one `{alias, retention}` entry for each
  direct `release.document.imports` alias, with no duplicate or extra aliases.
- Retention validation uses the existing pure `buildRetainedCanvasImports`
  path and minimal-retention validator. Stored retention asset bytes are
  persisted with existing content-addressed `writeBytes` / `storeAssets` and
  restored from the publishing document only.
- Malformed transport and stored envelopes fail with
  `CANVAS_IMPORT_INTEGRITY`. Failed writes do not return a release receipt;
  unreferenced uploaded blobs may remain, as with the existing storage
  protocol.

## Verification

Command:

```text
node --test src/library-storage.test.mjs src/library-release-retentions.test.mjs
```

The focused selection covers nested dependency and asset namespaces, legacy
absence, explicit empty transport for a release without imports, exact alias
coverage, duplicate/missing/extra aliases, wrong root identity, item hash and
asset byte corruption/truncation, missing dependency closure, malformed stored
retention metadata, zero-byte backend reads, input mutation across the first
await, detached output bytes, publisher-only reads, unrelated blob retention,
and asset/envelope write failures with no returned receipt. The follow-up
ordering regression also uses a release with its own asset and records the
public transport reads: malformed retention shape and wrong accepted root both
perform the envelope read only, then reject with `CANVAS_IMPORT_INTEGRITY`
before any own-release or retained-asset read.

Follow-up command:

```text
node --test canvas/src/canvas-schema.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/library-storage.test.mjs canvas/src/library-release-retentions.test.mjs canvas/src/library-retention-preparation.test.mjs canvas/src/library-retained-imports.test.mjs canvas/src/library-retained-loader.test.mjs
```

Follow-up result: 72 passed, 0 failed, 0 cancelled, exit 0; `git diff
--check` exit 0. Stored retention shape/exact alias and normalized accepted
root identity validation now runs immediately after release envelope and
release validation, before restoration of either the release's own assets or
retention assets. Legacy envelopes without `retentions` remain unchanged.

This is protocol-level fake public Account transport evidence. It does not
claim durable backend persistence, accepted-content-after-revocation policy,
or an implemented publication workflow.
