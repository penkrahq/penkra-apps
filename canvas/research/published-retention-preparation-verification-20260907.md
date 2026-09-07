# Published retained-content acceptance preparation

Source `5ec6b01`; tests `79ff589`.

`preparePublishedLibraryRetention` prepares a minimal consumer retention from an authenticated publishing release, owned assets, and accepted dependency retentions. Its caller must authorize the publishing source before calling; this pure function grants no access and performs no persistence or network requests. Root public-item validation remains enforced. Private local closure may accompany a public item but is not promoted to an independently accepted item.

The existing retention traversal now supports an explicit retained-item reader for dependencies. Returned identities, kinds, IDs and canonical item hashes are checked; a missing or invalid retained item never falls back to source resolution. Existing source-based callers retain their behavior when that reader is absent.

The package snapshots input, validates alias-scoped retained public references, indexes exact release/item identities and release/path asset identities, and copies only the closure required by the requested root items. All output bytes are detached. No full upstream source document is reconstructed or persisted.

Strict command from `canvas`:

```sh
node scripts/test.mjs src/library-published-retention.test.mjs src/library-retention-preparation.test.mjs src/library-retained-imports.test.mjs src/library-storage.test.mjs src/library-publication.test.mjs src/library-publication-service.test.mjs src/canvas-imports.test.mjs src/library-item-content.test.mjs
```

Result: exit 0, 63 passed, zero failed/cancelled/skipped. Cases include source-independent two-level retained closure, malformed/missing/duplicate transport, changed asset bytes, private-reference rejection, caller/output isolation and wrong retained-reader identities with no fallback. These are pure adapter tests, not installed-App or live persistence acceptance. No protected files, capabilities, backend, public operation or native runtime changed. Canvas TODO remains the planning authority.
