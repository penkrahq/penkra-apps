# iOS text receipt harness independent review — 2026-09-07

This is a device-free review of luna-ios receipt harness commit `3f747709d7ee2a3c817fe341b70e95ef44c4af07` and its receipt-harness predecessors `4286e95`, `c1cc8b1`, and `08bef3e`. No simulator, `xcrun`, compiler, native build, device setting, or user document was used. The iOS worktree was not modified.

## Files reviewed

The review read the receipt runner, command adapter, matrix, fixture/font catalog, comparator, and compatibility test in the preserved luna-ios worktree:

- `canvas/scripts/luna-ios-text-receipt-20260907.mjs`
- `canvas/scripts/luna-ios-text-receipt-20260907-runner.mjs`
- `canvas/scripts/luna-ios-text-fixture.mjs`
- `canvas/scripts/luna-ios-text-font-catalog.mjs`
- `canvas/scripts/luna-ios-text-verify.mjs`
- `canvas/compatibility/luna-ios-text-receipt-20260907.test.mjs`

The current adapter has one `xcrun simctl` boundary. Its content-size call is exactly `simctl ui <udid> content_size <value>` and its launch is exactly `simctl launch --terminate-running-process <udid> com.penkra.canvas.qa.textreceipt ...`; there is no duplicate content-size argument and no `--console` attached launch. The matrix uses `requireFreshEvidenceRoot`, snapshots state/content size before mutation, reads content size back after each set, and restores observed size plus shuts down only devices it booted. The comparator call is positional as `compare(referencePath, cropPath, device.scale)`.

## Independent probes

New test-only probes are in `canvas/src/luna-ios-text-receipt-independent.test.mjs` and import the absolute preserved harness modules.

The probes cover:

- all generated source-hash entries, including generated Swift, helper, host, project, and exact font bytes;
- committed project source paths and the referenced sibling exact-font directory/files;
- real `measureCapture` result translation: identical PNG → `pass`, changed PNG beyond the two-channel tolerance → `mismatch`, both with positive compared pixels;
- raw `full-a.png`/`full-b.png` byte preservation after receipt-derived cropping;
- launch, query, screenshot, crop, comparator, and pre-launch filesystem failures never producing `pass`;
- matrix cleanup after boot, bootstatus, initial observation, setting, readback, and case-runner failures, including restoration records and runner-owned shutdown;
- occupied evidence roots and exact adapter argv/non-attached launch behavior.

## Results

The preserved compatibility test was run exactly as permitted:

```text
node --test /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-ios/canvas/compatibility/luna-ios-text-receipt-20260907.test.mjs
```

Result: 12 passed, 0 failed, 0 cancelled, 0 skipped; exit code 0.

The independent probes were run with:

```text
node --test canvas/src/luna-ios-text-receipt-independent.test.mjs
```

Result: 5 passed, 0 failed, 0 cancelled, 0 skipped; exit code 0.

`git diff --check` passed. The library-loading worktree is clean after the test commit.

## Findings and limits

No concrete lifecycle, receipt-validation, argv, comparator, provenance-hash, or raw-PNG preservation defect was reproduced at this revision. Wrong runtime font receipts and malformed root receipts remain unmeasured in the existing compatibility matrix; they cannot reach screenshot comparison as a pass. Query errors are retained in receipt logs and do not satisfy the exact case/nonce READY+ROOT pair.

The matrix calls `listDevices()` before entering its restoration `try/finally`. In the tested failure mode, list failure occurs before any device mutation, so no restoration is required. All post-list lifecycle failures tested after snapshots are created entered the restoration block. Restoration failures are recorded per operation; an infrastructure failure while writing the restoration record would still propagate as an infrastructure failure rather than fabricate success.

One portability boundary remains explicit: `prepareTextReceiptEvidence(destination)` writes `project.yml` with the relative font path `../luna-ios-text-20260906/exact-font-catalog/Fonts`. The probe verified that path and both exact font hashes at the committed retained corpus root. An arbitrary temporary preparation destination is not a self-contained compilable project unless that expected sibling corpus is present; this review did not treat the source-only temporary generation test as native build proof.

This audit does not establish typography fidelity, simulator correctness, compiler success, or restored device state from a native run. Those require the separately authorized native gate.

