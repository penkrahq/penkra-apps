# iOS resolved grid native-run-02

This is the fresh run using the receipt-driven PNG byte crop. The prior
`native-run-01` and offline audits were not modified.

## Build

The single compiler invocation was:

`xcodebuild -project CanvasGridEvidence.xcodeproj -scheme CanvasGridEvidence -sdk iphonesimulator -configuration Debug -jobs 2`

It exited `0` with `** BUILD SUCCEEDED **`. The exact command, temporary
project directory, source hash, and full log are retained in
`build-command.txt` and `xcodebuild.log`. The generated source hash is
`cd9f240225dde9741775febc2cd3d8f4796be683baa895619b4f385580c43b11`; the
built executable hash is recorded in `binary-facts.json`.

## Matrix result

All 39 identities are present: 36 matrix entries plus three controls.

- 34 measured: 34 comparator passes, 0 measured mismatches.
- 5 unmeasured: the first five iPhone Large cases, each after three bounded
  `simctl launch` failures.
- No entry was hidden or replaced by an earlier run.

The measured entries all have exact case/nonce ready and root receipts,
two identical screenshot hashes, four-way full-frame hash validation, a
receipt-derived integer crop, exact authored dimensions, and comparator
results. iPhone crops are `1020x1200` at scale 3; iPad crops are `680x800`
at scale 2. Root receipts reported `(31,251)` on iPhone and `(202,370)` on
iPad, with screen/scale facts retained in each measurement.

The five launch failures retain UUID/nonce attempt directories, exact launch
commands and exit codes in `commands.json`, and zero-byte failure logs. The
simctl failures exposed no stdout/stderr; `launch-failure-summary.json`
records that limitation explicitly rather than inventing an error message.

## Visual review and restoration

The 34 measured native crops were visually inspected as the three compact
sheets in `visual-review/`; `manifest.json` maps every tile to its exact
case/state/path. The white roots, colored children, sparse placements, and
the control overlay are visible; no screenshot was accepted solely from
appearance.

Both assigned devices were shutdown initially and are shutdown finally.
The initial shutdown-state content-size queries returned `unknown`; after
boot the observed setting was `large`, which was restored before shutdown.
The full restoration command results are retained in `restoration.json` and
final device facts in `device-state.json`.

No Android device was changed. No exporter, IR, font, or capability change
was made, and no capability was promoted.
