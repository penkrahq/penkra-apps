# iOS grid run02 integration review — 2026-09-07

Review-only audit for the combined integration lane. No iOS runner, build,
install, device query, recapture, or source change was performed in this
review. The combined worktree was at `1abb19dc0695048de4e35168142b0e895cb535c2`
(`codex/canvas-local-integration-20260906`) and retained the pre-existing
untracked `canvas/compatibility/mobile-fixtures/swiftui/.build/` directory.

## Already integrated evidence-only change

The approved UTF-8 evidence check was inspected and picked:

| worker commit | combined commit | scope |
| --- | --- | --- |
| `b3c826c` | `1abb19d` | only `canvas/research/pdf-name-encoding-verification-20260907.md` |

The diff has no source, test, manifest, capability, protected-document, or
native changes. It is patch-equivalent only to that evidence record; no other
iOS commit was picked.

## Audited worker revisions and proposed minimal order

Worker: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-ios`,
branch `codex/canvas-luna-ios-20260906`.

The relevant exact revisions are:

| short | exact revision | role |
| --- | --- | --- |
| `95d8dc8` | `95d8dc8fcc311ace847a1bed69d6440301fbbbc8` | receipt-hardening tests/runner changes |
| `998313d` | `998313dedffe1ba7e563154f0fd434dc70a1b87d` | bounded production capture runner |
| `39bdc42` | `39bdc42040bf0ba936771522b8f0e230290aa09e` | earlier retained resolved-grid native evidence |
| `04216b2` | `04216b2494eb6de90b0ab46d269c6431aedb1a6a` | receipt-driven crops, root receipt, source hashes, harness |
| `7132c43` | `7132c435a23865fc2abee7922a4a0a73ca8030df` | crop and full-frame hash predicates |
| `0f6a71c` | `0f6a71c1626e1073732a1f7b2471d96fcd45c5f1` | root-receipt log predicate |
| `14a8ef3` | `14a8ef33becd8d3ec04be06207cd5bbfc5b3b8c0` | run02 source/binary/capture evidence |
| `6acfe9c` | `6acfe9c6e7ed24adeb91a7e0a3d605f0841f32b2` | missing-five bounded closure runner/test |
| `9200e7e` | `9200e7ee61c1ed773814c24a48b004ddbf986878` | missing-five capture evidence |

The proposed file-level, dependency-ordered integration set is:

```text
95d8dc8 -> 998313d -> 04216b2 -> 7132c43 -> 0f6a71c
         -> 14a8ef3 -> 6acfe9c -> 9200e7e
```

This is a proposal, not an authorization or a pick. It must be applied as
individual inspected commits in a clean integration attempt, with each
`git show --stat` and protected-scope diff reviewed first. The worker ancestry
of `04216b2` includes older offline diagnostic commits, so ancestry alone does
not establish that all parent commits belong in combined; a file-level patch
application/diff audit is required. `39bdc42` is omitted from this minimal
run02 set because it is historical resolved-grid evidence and is not required
by the run02 source/harness facts audited here. Include it only if a later
review proves an artifact dependency that cannot be carried by `14a8ef3`.

The worker currently has uncommitted missing-one corrections in
`luna-ios`:

```text
canvas/compatibility/luna-ios-grid-missing-one-capture.test.mjs
canvas/scripts/luna-ios-grid-missing-one-capture.mjs
canvas/scripts/luna-ios-grid-receipt-window.mjs
```

Those changes, and the related unapproved missing-one revisions, are excluded
from this proposal. No blanket branch merge and no historical-capture rewrite
is appropriate.

## Run02 artifact and linkage verification

The audited artifact root is
`canvas/research/luna-ios-grid-production-20260907/native-run-02/` in the
worker worktree. Checks were made against structured JSON and retained files,
not README claims.

- `measurements.json` declares and contains 39 identities: 36 matrix cases and
  3 controls, across iPhone Large, iPhone accessibility-extra-extra-large,
  and iPad Large. Status counts are 34 `pass` and 5 `unmeasured`; there are no
  measured mismatches.
- The independent comparator totals for the 34 measured entries are 106
  compared children, 800,252 samples, 0 failures, registration `none`, and
  clipping `not-applied`. Roots are 340x400; scales are 2 or 3; crop sizes are
  680x800 or 1020x1200.
- `binary-facts.json` identifies the executable and records SHA256
  `56a7893fdc96d9b7b69fa1f37c8fedacbe2477bac479b5ad6eba11a9fcc14065` and
  source SHA
  `cd9f240225dde9741775febc2cd3d8f4796be683baa895619b4f385580c43b11`.
  Rehashing the retained executable produced the same binary SHA; its size is
  72,416 bytes.
- `source-hashes.json` records the same source SHA and 15 generated Swift
  files. Rehashing those retained files found 15/15 matches. The retained
  project hash is `project.yml`, 576 bytes,
  `ab2e5b7bb2704b3557601351e5417fb83ecf6af3182f5b8a456c7eeff24d0b96`.
- The run02 command receipt has 181 commands, 16 nonzero launch-command
  results, 0 timeouts, and 0 signals. These are recorded launch failures, not
  hidden cancellation or compiler results. The five unmeasured identities are
  retained explicitly with their launch metadata.

The worker handoff reports visual inspection of all 34 measured crops via the
run02 visual-review contact sheets. This review verified the structured
artifact linkage and comparator counts independently; it does not promote the
worker's visual review into a new measurement.

## Missing-five overlay and selection

The overlay root is
`canvas/research/luna-ios-grid-production-20260907/native-run-02-missing-five/`.
Its `capture-plan.json` selects exactly five iPhone Large identities, with one
launch per case, a 120-second launch bound, and at most three screenshot-pair
attempts. No install or build is authorized by that artifact.

The overlay has 5/5 closure identities and 0 duplicate identities in its own
receipt set. Each identity is also present in the original run02 matrix; this
is an overlay, not a replacement or rewrite:

| identity | original run02 | missing-five closure |
| --- | --- | --- |
| `grid-c100-180-r60-100-normal` | unmeasured | unmeasured; readiness receipt absent after attempt 3 |
| `grid-c100-180-r60-100-reversed` | unmeasured | pass/measured |
| `grid-c100-180-r60-100-only-2-2` | unmeasured | pass/measured |
| `grid-c100-180-r100-60-normal` | unmeasured | pass/measured |
| `grid-c100-180-r100-60-reversed` | unmeasured | pass/measured |

Thus the retained latest accounting is 34 initial measured passes + 4 closure
passes, with one closure identity still unmeasured. The original 34-pass/5-
unmeasured status remains preserved separately. The closure command receipt has
89 commands, 0 nonzero, 0 timeout, 0 signal, and 0 killed results. Its four
measured entries have 13 compared children, 129,688 samples, 0 failures,
registration `none`, and clipping `not-applied`; all four have stable
full-frame hashes and exact captured==before-crop==after-crop equality.

## Source-method audit

The relevant source methods, as present in the audited commits, establish the
following:

- The capture runner queries both `LUNA_GRID_READY` and `LUNA_GRID_ROOT`, and
  matches the root receipt to the exact case ID and nonce.
- `cropRectFromRootReceipt` uses the measured root origin and screen/scale
  dimensions, requiring a 340x400 root, positive integer scale, nonnegative
  integer origin, positive integer dimensions, and an on-screen physical crop.
  It does not use a screen-center approximation.
- `cropPngBytes` decodes CanvasKit pixels, copies RGBA bytes, and re-encodes
  PNG. `validateFullFrameHashes` requires lowercase SHA256 values and exact
  equality of captured, before-crop, and after-crop hashes for both frames.
- The comparator is independently represented in the structured measurements;
  its zero-failure/pass counts above are not inferred from source comments or
  README text.

## Blockers and integration disposition

1. The normal five-case closure still has one unmeasured case because the
   exact case/nonce readiness receipt did not appear after three bounded waits.
   It has no crop or visual verdict. It must not be represented as a pass.
2. The worker's missing-one source is currently dirty and is being corrected;
   it is outside this review and outside the proposed set until separately
   approved.
3. The proposed source commits have worker ancestry that includes historical
   diagnostics. Before any future pick, combined must perform the stated
   individual patch/context audit and stop on overlapping protected or
   unrelated changes. This review did not authorize those picks.
4. No iOS capability promotion, production gate change, exporter change, or
   broad native branch integration follows from these artifacts. Existing
   production status remains distinct from this evidence: run02 is 34 measured
   passes plus 5 unmeasured, and closure improves four of those five only.

No device-free worker tests were rerun in this review because the worker
worktree contains uncommitted missing-one changes; the previously retained
focused worker receipt is 46/46 pass for the corrected run02 harness. No native
lease was requested or used.

## Approved-batch applicability attempt

The newly approved mechanical batch was inspected in order without changing
the combined tree. A no-write patch check for the first commit was:

```text
git show --format= --binary 95d8dc8 | git apply --check --verbose -
```

It stopped with:

```text
Checking patch canvas/compatibility/luna-ios-grid-production.test.mjs...
error: canvas/compatibility/luna-ios-grid-production.test.mjs: No such file or directory
Checking patch canvas/scripts/luna-ios-grid-production.mjs...
error: canvas/scripts/luna-ios-grid-production.mjs: No such file or directory
```

No approved iOS commit was picked and no test was run at a partially applied
revision. The per-commit scope inspection found:

| approved commit | file-level result in combined |
| --- | --- |
| `95d8dc8` | modifies the two absent production harness files above |
| `998313d` | adds the capture runner, which imports the absent production harness |
| `04216b2` | adds capture test/utilities but modifies absent production harness, `GridFixtureHost.swift`, and `source-hashes.json` |
| `7132c43` | modifies capture test/utilities and runner absent because `04216b2` cannot apply |
| `0f6a71c` | modifies the same absent capture test/runner |
| `14a8ef3` | adds run02 artifacts, but was not partially picked after the source stop |
| `6acfe9c` | adds missing-five test/runner, which depends on the absent capture harness |
| `9200e7e` | adds missing-five artifacts, but was not partially picked after the source stop |

The concrete unapproved base needed before `95d8dc8` is the worker harness
lineage that creates its modified files: `70af354` creates both files and
`91c8e33` is the immediate pre-`95d8dc8` content. `04216b2` additionally
modifies source/artifact files created by `6ef72af` and is based through the
worker’s later diagnostic ancestry. These are not silently imported: the
approved set is therefore blocked pending an explicit minimal-base decision
and separate patch-context review. `39bdc42` and the offline diagnostic
commits were not picked. The unapproved missing-one commits `c1ee119`,
`a3a9b53`, and `db558ab`, plus the worker’s current dirty files, remain
excluded.

Combined remains at `2ca6cd9b108eb849c1e799135c9567d9e88be3bd` with only the
pre-existing untracked Swift `.build/` directory. No source, native, device,
capability, or historical-capture mutation occurred in this attempt.

## Recovery and approved-batch result

The bounded recovery authorization was applied only to the concrete missing
prerequisites. The complete worker-to-combined mapping is:

| worker revision | combined revision | scope |
| --- | --- | --- |
| `70af354c2b1e020571086e58b6826dff2d61d7f3` | `ed967902324e616cb4ac46120a8dd9c38a52d061` | named iOS grid harness add |
| `6ef72af1717e61aa7999a4f962f53cb8114602d6` | `26689d3a743791bca240f46381e209fe59bb64df` | named iOS grid research fixture/source/reference adds |
| `91c8e3305e563a88bd2dc43889ddec66decccb1c` | `65db6d17c0fead97312efc963a199724e5474c56` | named harness readiness/geometry correction |
| `95d8dc8fcc311ace847a1bed69d6440301fbbbc8` | `3442feddb23fd04f289289fb7637c3acae988040` | receipt/hash/comparator harness tests |
| `998313dedffe1ba7e563154f0fd434dc70a1b87d` | `f30cfef9bec9a651d75c688efe83c6f46dab1f19` | bounded capture runner |
| `04216b2494eb6de90b0ab46d269c6431aedb1a6a` | `7b013ead85248077269162b00e311cea3c780d74` | receipt-driven root crop/source updates |
| `7132c435a23865fc2abee7922a4a0a73ca8030df` | `d83147ee393c34f392800ddf4ab2496f9999e994` | crop/full-frame hash validation |
| `0f6a71c1626e1073732a1f7b2471d96fcd45c5f1` | `3a64ed34d090934ca425b51358c7506285a35f63` | root receipt predicate |
| `14a8ef33becd8d3ec04be06207cd5bbfc5b3b8c0` | `c5ed367dcc66d6b5c59cea4a819101f0439b8542` | run02 retained evidence |
| `6acfe9c6e7ed24adeb91a7e0a3d605f0841f32b2` | `f5eae4063b749503ef6cfff66b5893c811e70c18` | missing-five runner/test |
| `9200e7ee61c1ed773814c24a48b004ddbf986878` | `ffe7fd155f5ed31217a9380c065c6312f55914b5` | missing-five retained evidence |
| `39bdc42040bf0ba936771522b8f0e230290aa09e` | `4e44f7af806183a014ea3cb7beb9f125993fd678` | required preserved run01 raw-PNG fixture plus related iOS evidence |

`39bdc42` was included only after the integrated capture test was inspected
and proved to read
`native-run-01-corrected/captures/iphone/large/full/grid-c100-180-r60-100-normal-b.png`.
Its complete diff is research evidence under the named iOS grid artifact
root; it contains no production/exporter/vendor/manifest/protected changes.
The omitted offline diagnostic commits and missing-one revisions remain
unpicked.

Post-integration device-free command:

```text
node --test canvas/compatibility/luna-ios-grid-production.test.mjs canvas/compatibility/luna-ios-grid-capture-20260907.test.mjs canvas/compatibility/luna-ios-grid-missing-five-capture.test.mjs canvas/src/exporters/exporters.test.mjs
```

Result: exit 0, 46 passed, 0 failed, 0 cancelled, 0 skipped, duration
`1321.499792 ms`. The 46 consists of 7 capture/hash/source tests, 5
missing-five tests, 6 iOS production harness tests, and 28 exporter tests.

Post-test structured verification at combined `ffe7fd155f5ed31217a9380c065c6312f55914b5`:

- Run02: 39 entries, 34 `pass`, 5 `unmeasured`; 106 compared children,
  800,252 samples, 0 comparator failures.
- Missing-five: 5 entries, 4 `pass`, 1 `unmeasured`; 13 compared children,
  129,688 samples, 0 comparator failures; five unique overlay identities,
  all five originally unmeasured.
- Binary executable rehash equals the recorded
  `56a7893fdc96d9b7b69fa1f37c8fedacbe2477bac479b5ad6eba11a9fcc14065`.
- Source manifest has 15 files, source SHA
  `cd9f240225dde9741775febc2cd3d8f4796be683baa895619b4f385580c43b11`, and
  15/15 file hash/byte matches. `project.yml` is 576 bytes with SHA
  `ab2e5b7bb2704b3557601351e5417fb83ecf6af3182f5b8a456c7eeff24d0b96`.

The final combined worktree has no tracked or staged changes; only the
pre-existing untracked Swift `.build/` directory remains. No native/device
action, capability promotion, production gate change, or historical capture
rewrite occurred.
