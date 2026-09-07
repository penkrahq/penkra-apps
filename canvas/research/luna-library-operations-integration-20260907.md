# Canvas library operation wiring verification — 2026-09-07

## Source and test commits

The approved source/manifest wiring was committed separately as
`19da172b279a06fe3ae65bdefe680f7593ff8aeb`. It adds only `libraries.publish` and
`libraries.inspect` registrations and their manifest declarations. `libraries.accept` remains
absent. No version, operations markdown, INSTRUCTIONS, skills, TODO, native, live-document,
manifest-publication, or capability change was made beyond those two operation declarations.

The registration tests were committed separately as
`484ea8916bb8506ee55464f0e5f8ee74322ec2a3`.

## Strict JavaScript receipt

Command:

`node --test $(rg --files canvas/src -g 'library-*.test.mjs' | sort) canvas/src/canvas-api.test.mjs canvas/src/canvas-imports.test.mjs canvas/src/canvas-resolver.test.mjs canvas/src/canvas-schema.test.mjs canvas/src/luna-library-storage-protocol.test.mjs canvas/src/operations.test.mjs canvas/src/operations-retained-imports.test.mjs collaboration/pen-yjs-model.test.mjs`

Log: `/tmp/luna-library-operations-integrated-20260907.log`.

Exit `0`; `200` passed, `0` failed, `0` cancelled, `0` skipped; duration `1354.941834 ms`.
The focused registration tests themselves passed `17/17`; they use the real controller module and
a fake Account transport to cover publish success with omitted public items, explicit empty
surface, revision conflict with no head, deferred snapshot, exact inspect output, denied and
unpublished source, and inspect write isolation. Manifest handler coverage and output schema
structure also passed.

## Build and public package validation

`npm run build:dev` was run from `canvas/`, exited `0`, and logged to
`/tmp/luna-build-dev-20260907.log`. It used the package's existing
`CANVAS_DEV_BUILD_WITH_UNVERIFIED_CAPABILITIES=1` development build mode. No tracked build or
source files changed.

The isolated public validation command was:

`penkra app test --directory /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/combined/canvas/dist`

It stopped at Penkra schema-profile validation with these exact errors:

- `operations[6].output: output $.properties.publication.properties.contentHash.pattern is not supported by the Penkra schema profile.`
- `operations[6].output: output $.properties.publication.properties.storage.properties.sha256.pattern is not supported by the Penkra schema profile.`
- `operations[6].examples: examples must contain at least one named operation example.`
- `operations[7].output: output $.properties.publication.properties.contentHash.pattern is not supported by the Penkra schema profile.`
- `operations[7].output: output $.properties.items.items.properties.contentHash.pattern is not supported by the Penkra schema profile.`
- `operations[7].examples: examples must contain at least one named operation example.`

The dispatcher returned validation errors without exposing a numeric exit code. No schema
workaround was guessed or applied because the task explicitly requires stopping on an unexpected
SDK/schema requirement. No app installation, Dev1 replacement, live document write, native build,
or capability promotion occurred.
