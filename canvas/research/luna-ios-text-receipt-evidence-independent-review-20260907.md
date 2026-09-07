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

Result: 5 passed, 0 failed, 0 cancelled, 0 skipped. The verifier is portable:
its defaults resolve `canvas/scripts` and
`canvas/research/luna-ios-text-receipt-20260907` relative to the test module;
the explicit absolute overrides above select the preserved sibling corpus for
this review. With no overrides in this delivery worktree, the absent helper
causes a nonzero `ERR_MODULE_NOT_FOUND` failure rather than a skip, as required.

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
  successful content-size restoration operation each. The additional outer
  lifecycle evidence reconciles this: `build/devices-before-install.json`
  records both assigned devices `Shutdown`; `build/device-setup.log` records
  boot completion, `large` readback, and installation with the recorded app
  hash/size; the inner matrix then observed those already-booted devices;
  `device-restoration.log` records the outer cleanup shutdowns; and
  `build/devices-after-restore.json` records both `Shutdown` afterward.
- The retained lifecycle artifacts therefore support the chronology and the
  structured inner restoration claim. The root's later read-only `simctl`
  observation is current-state evidence only and is not used as historical
  proof.

## Lifecycle interpretation

The shutdown records are outer build/install cleanup, not an inner matrix
contradiction. The pre-install and post-restore device snapshots, setup log,
inner restoration receipt, and cleanup log are retained unchanged; this audit
only verifies their consistency and provenance.

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
