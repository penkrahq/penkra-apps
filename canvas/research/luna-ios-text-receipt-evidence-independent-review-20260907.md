# iOS text receipt evidence audit

This is an offline integrity audit of the retained corpus at
`../luna-ios/canvas/research/luna-ios-text-receipt-20260907`, produced by source
root `3967d70c7a92b72be5b807a874dae63c620184b3`. It does not promote any native
comparison status and did not invoke a simulator, compiler, GUI, or device.

## Commands and results

The portable harness review was run against the exact source-root scripts:

```text
CANVAS_IOS_TEXT_RECEIPT_HARNESS_ROOT=/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-ios/canvas/scripts \
node --test canvas/src/luna-ios-text-receipt-independent.test.mjs
```

Result: 5 passed, 0 failed, 0 cancelled, 0 skipped.

The retained-corpus verifier was run with explicit roots:

```text
CANVAS_IOS_TEXT_RECEIPT_HARNESS_ROOT=/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-ios/canvas/scripts \
CANVAS_IOS_TEXT_RECEIPT_EVIDENCE_ROOT=/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-ios/canvas/research/luna-ios-text-receipt-20260907 \
node --test canvas/src/luna-ios-text-receipt-evidence-independent.test.mjs
```

Result: 4 passed, 0 failed, 0 cancelled, 0 skipped. The verifier is portable:
it has no sibling-worktree default and requires explicit corpus and harness
roots.

## Verified evidence

- The declared Cartesian matrix is exactly 10 cases (`case-01`, `02`, `03`,
  `04`, `06`, `07`, `08`, `10`, `11`, `12`) across `iphone/large`,
  `iphone/accessibility-extra-extra-large`, and `ipad/large`: 30 unique result
  identities and 30 unique reference identities. Excluded cases are exactly
  `case-05` and `case-09`.
- All 30 native results are `phase: measured`, with the historical status
  distribution unchanged at `mismatch: 30`. Each has one retained attempt;
  no status, mask, registration, tolerance, or historical capture was edited.
- Every retained reference PNG exists and matches its recorded byte count,
  encoded SHA-256, decoded dimensions, decoded pixel SHA-256, and positive
  alpha/non-white sample counts. Reference dimensions are 1020x540 for iPhone
  scale 3 and 680x360 for iPad scale 2.
- The retained source-hash manifest reconciles every generated Swift file,
  `project.yml`, `SimulatorHost/App.swift`, and both exact Inter font files.
  Aggregate source hash: `8414b755ebc486a55afd09ff11800ec54861b101c9a36e2d0c69ee240f7a3d9d`.
  The retained build source hash manifest and post-build receipt match it.
  The retained app executable matches the recorded
  `f165066876c517db81291155d42ca9a776578fa1434beb825241f8a19cd12c44` and
  72,424-byte size; bundled Inter files match their declared hashes and sizes.
- The fixture and IR hashes in all reference records match the retained
  `fixture.json` and `ir.json` bytes. The reference records identify
  `Inter-Regular`/`Inter-Bold`; every native receipt repeats those exact
  PostScript identities.
- All 30 receipt roots are finite, authored 340x180, on-screen within their
  recorded screen bounds, and use the declared scale. Full A/B PNGs exist,
  have matching actual bytes and decoded pixels, and their actual dimensions
  equal recorded screen points multiplied by scale. Crops exist at exactly
  340x180 authored dimensions multiplied by scale; crop A/B bytes match.
- All 30 comparisons report finite positive `comparedPixels`; all retain
  `mismatch` and the recorded zero registration plus two-pixel boundary
  tolerance. This is sample-count/hash integrity only, not visual pass proof.
- Structured restoration snapshots record both assigned devices as initially
  `Booted`, initially observed `large`, `bootedByRunner: false`, and one
  successful content-size restoration operation each. The audit cannot
  independently read current simulator state without prohibited native action.

## Concrete limitation retained as evidence

`native-run-01/device-restoration.log` contains two `xcrun simctl shutdown`
records, one for each device, while `native-run-01/restoration.json` and
`run-receipt.json` say both devices were already booted and record no shutdown,
only content-size restoration. This contradiction means the corpus supports
the structured receipt claim that the observed setting was restored, but does
not support an unqualified independent claim about final device power state.
The historical log was not changed or deleted.

## Scope review

For commit `3967d70`, `git diff-tree --root --name-only -r 3967d70` reported no
paths outside `canvas/research/luna-ios-text-receipt-20260907`; its 126 binary
additions were all under that retained evidence directory. There were zero
binary additions outside the scoped evidence tree and no changed AGENTS,
INSTRUCTIONS, TODO, SKILL, operations, architecture, manifest, or lockfile
paths. The iOS worktree also had two pre-existing unrelated untracked files;
they were not touched.

The new independent verifier is in
`canvas/src/luna-ios-text-receipt-evidence-independent.test.mjs`.
