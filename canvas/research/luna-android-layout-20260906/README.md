# Android fixed-layout constraint matrix

Date: 2026-09-06  
Worktree: `codex/canvas-luna-android-20260906`  
Required starting HEAD: `fc5bf629511620a45d02a77fd63162d0ec27a0e1`

This package covers the twelve requested nontext Canvas layouts at density 420 and 320, each at font scales 1.0 and 2.0: 48 native captures and 48 structured measurement rows. Each source document is canonical Canvas schema and each expected bound is taken from `buildCapabilityVerificationIR(...).outputs[0].nodes`; no independent Yoga calculation is used. Root registration is fixed at `(0, 0)` so container translations remain observable.

## Result

| Cases | Result at all four settings | Finding |
| --- | --- | --- |
| 01–06 | 24/24 pass | horizontal/vertical padding, gap, alignment, and start justification |
| 07 | 0/4 pass | native Row does not apply requested center justification |
| 08 | 0/4 pass | native Row does not apply requested end justification |
| 09 | 0/4 pass | native LazyVerticalGrid placement does not match explicit Canvas tracks |
| 10 | 0/4 pass | authored 96×96 ellipse size is retained, but grid-cell placement differs |
| 11 | 0/4 pass | native FlowRow wrapping/spacing differs from resolved Canvas bounds |
| 12 | 4/4 pass | absolute child is emitted as an overlay and does not consume Row flow space |

Totals: 48/48 accounted for, 28 pass, 20 fail, 0 unrun. Font scale did not change the nontext geometry result pattern. The authoritative rows are in [`measurements.json`](measurements.json), with one measurement JSON beside each case capture.

## Evidence

- [`case-01`–`case-12`](.) contain source JSON, resolved expected bounds, generated `CanvasFlowLayout.kt`/`MobileFixture.kt`, Canvas references, native captures, and per-setting measurements.
- [`visual/contact-420-font-1.png`](visual/contact-420-font-1.png), [`visual/contact-420-font-2.png`](visual/contact-420-font-2.png), [`visual/contact-320-font-1.png`](visual/contact-320-font-1.png), and [`visual/contact-320-font-2.png`](visual/contact-320-font-2.png) are contact sheets covering every distinct capture; all were visually inspected.
- [`build-case-01.log`](build-case-01.log) through [`build-case-12.log`](build-case-12.log) record the individual `:app:assembleDebug` builds.
- Device records are [`device-settings-initial.json`](device-settings-initial.json) and [`device-settings-restored.json`](device-settings-restored.json).

The runner used the attached `emulator-5554` (`penkra_api36_pixel8`), one build at a time, `./gradlew --no-daemon --max-workers 2 :app:assembleDebug`, APK install, explicit activity launch, and a stabilization wait before screencap. Initial settings were physical density 420 and font scale 1.0; both were restored to those values after capture. No emulator wipe, document mutation, capability-table edit, install/publish action, or capability promotion was performed.

The measurement channel uses exact connected-color regions with the existing two-channel step tolerance (2) and excludes the existing two-physical-pixel boundary. No threshold or mask was changed. The case12 overlay wrapper has no authored padding, so these captures verify its resolved local coordinates without claiming behavior for an overlay parent with padding; any such padding shift remains a separate follow-up question.

## Source change and regression coverage

`src/exporters/mobile.mjs` contains the exact permitted Compose geometry changes: absolute descendants of flow containers are separated into an overlay using their existing IR local coordinates, and the grid emitter now uses `modifier = overlays.length ? "Modifier" : modifier`. Thus an ordinary grid retains its authored size/padding/background/clipping modifier chain. The focused structural test asserts this for case09 and also checks the authorized `wrapContentSize(Alignment.TopStart)` lowering for case10 and overlay separation for case12.

The first grid captures were generated before the modifier correction and are not used as final evidence. Cases09/10 were regenerated after the correction; all nongrid measurements were retained independently. Captures affected by the initial transient white scrim were discarded and rerun after explicit activity launch and stabilization.

Focused verification commands:

```text
node --test src/exporters/exporters.test.mjs                 # 28 pass, 0 fail
node --test compatibility/luna-android-layout-matrix.test.mjs # 3 pass, 0 fail
node --check scripts/luna-android-layout-generate.mjs
node --check scripts/luna-android-layout-run.mjs
```

The tracked shared generated fixture was restored after the run, and the worker-created `.kotlin` cache was removed before handoff.
