# Library candidate verification

This records implementation evidence, not a replacement plan. The protected Canvas TODO and architecture/operation instructions were not edited.

The isolated libraries branch passed **452 tests**, zero failures/cancellations/skips, exit 0, in 146147 ms. Actual Swift and Compose compilation gates ran. Log: `/tmp/canvas-libraries-full-suite-20260906.log`. Focused resolver/publication/token checks passed 38 tests.

The candidate now checks canonical relative asset paths, MIME metadata, byte hashes, duplicate paths, import namespaces, and public resource dependency identities. Public images must have owned asset descriptors; mutable external image URLs cannot enter a public resource without materialization. Change detection includes private tokens and asset identities used by a public resource, but excludes unrelated private edits.

Publication preparation snapshots document data and asset bytes before asynchronous work, retains accepted dependency release IDs/hashes, and does not mutate the source document. A regression publishes a newer upstream release afterward and verifies that the prepared release still loads its accepted dependency. This is preparation, not a durable publication service: the installed Canvas API does not yet provide the release persistence adapter, and no existing document has been migrated by this branch.

Qualified public tokens resolve source-library bindings with compatible consumer-selected modes. Private source tokens remain available internally to the public token's dependency closure, not as directly qualified public variables. Cascade validation uses actual mode matching rather than aligning unrelated cascade-array indices.

The portability candidate uses the [DTCG Format Module 2025.10](https://www.designtokens.org/tr/2025.10/format/) and validates supported structured colors against [Color Module sections 4.1–4.2](https://www.designtokens.org/tr/2025.10/color/#color-type). Unknown color spaces, invalid component counts/ranges, and malformed fallback hex values are rejected. `none` components and unbounded finite Lab axes/chroma remain supported. This is not a claim of full DTCG conformance: the adapter's supported type list is explicit, and the complete reference/composite contract has not been implemented.
