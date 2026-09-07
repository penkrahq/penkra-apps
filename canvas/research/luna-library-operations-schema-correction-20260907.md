# Canvas library operation schema correction verification — 2026-09-07

## Separate commits

The approved manifest correction was committed separately as
`1d1ad909d11250c427f3adb5dc0c3ede86efe470`. It removes unsupported public-schema `pattern`
keywords from the four hash properties, retaining string length bounds of 64, and adds one
named factual example to each of `libraries.publish` and `libraries.inspect`.

The structured schema test update was committed separately as
`6252b160ef96631ea53d254ad6e6ae42d2a3f3ec`.

Runtime hex validation in the existing service was unchanged. No version, protected markdown,
operations instruction, skills, native, live-document, or capability change occurred.

## Focused registration receipt

Command:

`node --test canvas/src/library-operations.test.mjs canvas/src/operations.test.mjs`

Exit `0`; `17` passed, `0` failed, `0` cancelled, `0` skipped; duration `910.825333 ms`.
The tests cover the corrected manifest structure/examples, real controller registration,
publish success, omitted and explicit-empty surfaces, conflict no-head, deferred snapshots,
exact inspect output, denied/unpublished sources, and inspect write isolation.

## Build and isolated public validation

Command from `canvas/`:

`npm run build:dev`

Exit `0`; log: `/tmp/luna-build-dev-schema-correction-20260907.log`.

Public package validation:

`penkra app test --directory /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/combined/canvas/dist`

Result was `ok: true`, app ID `com.penkra.canvas`, version `0.2.40`, ready isolated test tab,
and `profileRemoved: true`. Its operation list included `libraries.publish` and
`libraries.inspect`; `libraries.accept` was absent. This validates the isolated package only,
not installed Dev1 acceptance or production readiness.

The prior app-test attempt at the pre-correction revision is retained as a failure distinction:
it rejected unsupported `pattern` keywords and missing named examples. That failed validation
was not counted as successful QA; the corrected rerun above is the only successful public-package
validation receipt.

No native build, app installation, live document write, or capability promotion occurred.
