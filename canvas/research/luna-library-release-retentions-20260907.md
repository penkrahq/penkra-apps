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
and asset/envelope write failures with no returned receipt.

This is protocol-level fake public Account transport evidence. It does not
claim durable backend persistence, accepted-content-after-revocation policy,
or an implemented publication workflow.
