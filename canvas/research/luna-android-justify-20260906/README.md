# Android Compose justification matrix

Package: `luna-android-justify-20260906`  
Starting/source HEAD preserved: `ad79cac415ef287a6fc77ab4d203b89b724894a3`  
Device: `emulator-5554` / `penkra_api36_pixel8`

The surviving runner completed this package after the worker thread stopped. No completed fixture or capture was restarted. The matrix has 24 fixture identities: horizontal/vertical × start/center/end × gap 0/10 × no/asymmetric padding, each captured at density 420/320 and font scale 1/2.

Result: 96/96 rows accounted for, 96 pass, 0 fail, 0 unrun, and 1,703,664 compared interior pixels with 0 mismatched pixels. Every row has the required structured fields and a unique case/density/font-scale identity in [`measurements.json`](measurements.json). Expected bounds come from the resolved Canvas graph returned by `buildCapabilityVerificationIR`, with fixed root-origin registration; no group displacement is normalized away. Measurement uses the existing 2-channel tolerance and 2-physical-pixel boundary exclusion.

## Portable evidence and provenance

- [`measurements.json`](measurements.json) and all per-capture measurement JSON use evidence-root-relative `referencePath` and `capturePath` values.
- [`measurements-absolute-baseline.json`](measurements-absolute-baseline.json) preserves the original aggregate report before path rewriting. Its SHA-256 is `ff2cb72cbf3f9228a58e9d9e4cbe26307a47583dc20c3f8d971d8b678286853f`.
- [`artifact-manifest.json`](artifact-manifest.json) records the case identities, capture/measurement counts, byte sizes, and SHA-256 for every other evidence file. Capture files were byte-preserved during path rewriting.
- Each case directory contains source JSON, resolved expected bounds, generated Kotlin, Canvas reference PNGs, native capture PNGs, and structured measurement JSON.
- [`visual/contact-horizontal-start.png`](visual/contact-horizontal-start.png), [`contact-horizontal-center.png`](visual/contact-horizontal-center.png), [`contact-horizontal-end.png`](visual/contact-horizontal-end.png), [`contact-vertical-start.png`](visual/contact-vertical-start.png), [`contact-vertical-center.png`](visual/contact-vertical-center.png), and [`contact-vertical-end.png`](visual/contact-vertical-end.png) cover all 96 native captures. All six full-frame sheets were visually inspected; no subset is uninspected.

The runner assembled and installed the APK once per fixture using `./gradlew --no-daemon --max-workers 2 :app:assembleDebug`, launched the activity, stabilized after density/font reconfiguration, and captured all 96 settings. The runner’s `finally` record restored physical density 420 and font scale 1.0 in [`device-settings-restored.json`](device-settings-restored.json). A subsequent adb re-query found no attached emulator, so live post-run settings could not be independently queried after disconnect; no second emulator was started.

## Scoped implementation

`src/exporters/mobile.mjs` only changes Compose Row/Column arrangement emission. Absent/start uses `Arrangement.spacedBy(..., Alignment.Start/Top)`, center uses `CenterHorizontally/CenterVertically`, and end uses `End/Bottom`. Other justify values retain the prior no-overload arrangement. Existing modifier, wrap, grid, absolute, Swift, IR, schema, and capability-table behavior is outside this package.

The focused test [`luna-android-justify-matrix.test.mjs`](../../compatibility/luna-android-justify-matrix.test.mjs) covers all 24 fixture identities, exact overloads on both axes, absent defaults, and unsupported justify preservation. Its final corpus test resolves its evidence directory from `import.meta.url`, validates all 96 identities and portable files, then recomputes bounds/interiors from the retained reference and capture PNGs rather than trusting stored status values. The existing 48-case grid/absolute test remains unchanged and passing.

No capability table was edited or promoted. The official Compose overload reference used for this scoped change is the [AndroidX Arrangement API](https://developer.android.com/reference/kotlin/androidx/compose/foundation/layout/Arrangement).
