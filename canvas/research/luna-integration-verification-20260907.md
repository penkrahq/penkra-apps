# Luna integration verification — 2026-09-07

Evidence only. The owning Canvas TODO, AGENTS files, architecture plans, and operations
instructions were read and left unchanged. No production documents were migrated, no package was
published or installed, and no capability or PDF/X gate was promoted.

## Revision and working-state record

- Worktree: `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/combined`
- Branch at start: `codex/canvas-local-integration-20260906`
- HEAD at start and before this evidence-only commit: `a91f5c6938076c2e57b4f0a8df9b1db165f82d3`
- Initial status: only pre-existing untracked `canvas/compatibility/mobile-fixtures/swiftui/.build/`.
  It was preserved. `git diff --check` was clean before recording this file.
- No approved integration batch was supplied during this run, so no worker commit was cherry-picked.
  Known worker commits were inspected as metadata only and remained non-ancestors of combined HEAD:
  Android translated harness `90488c4` (final worker handoff `f166b17`, `0d5d758`), iOS evidence
  `39bdc42`, and delivery/PDF candidates `0efd381`, `4acbcad`, `9cfc915`.

## Source and compatibility verification

All times below are local MDT; log modification times are retained by the filesystem.

1. Strict non-native source/exporter/Yjs command:

   `node scripts/test.mjs src/*.test.mjs src/exporters/*.test.mjs collaboration/pen-yjs-model.test.mjs`

   Log `/tmp/canvas-luna-strict-20260907.log` (modified `2026-09-07 03:05:13 -0600`).
   Exit `0`; `1060` passed, `0` failed, `0` cancelled, `0` skipped; runner duration
   `37634.433917 ms`; wrapper duration `37 s`.

2. Compatibility command, with filenames resolved by `rg --files` and the mobile compilation test
   explicitly excluded:

   `node scripts/test.mjs $(rg --files compatibility -g '*.test.mjs' -g '!mobile-export-compilation.test.mjs')`

   The resolved set included `compatibility/browser-fixture-lifecycle.test.mjs` and did not include
   `compatibility/mobile-export-compilation.test.mjs`. Log `/tmp/canvas-luna-compat-20260907.log`
   (modified `2026-09-07 03:06:05 -0600`). Exit `0`; `138` passed, `0` failed, `0` cancelled,
   `0` skipped; runner duration `34566.029625 ms`; wrapper duration `34 s`.

   Evidence tests that exercise retained native mismatches continue to distinguish `pass`,
   `mismatch`, and `unmeasured`; their green assertions do not reclassify retained native output
   as product fidelity.

An initial timing-wrapper attempt failed before producing a valid test record because macOS `date`
returned a literal `%3N` and zsh rejected the duration arithmetic. The authoritative strict run
above reran the exact requested command with a portable timer; no test result from the wrapper
attempt is counted.

## Native compiler lease and device scheduling

- iOS worker `agent-3d52bc7b681407f1426ee32b870ffb40`: explicit release received; its fresh
  `xcodebuild -jobs 2` and bundled-font build both exited `0`. No rebuild or device mutation was
  requested. Its iPhone/iPad captures remain iOS-lane-owned.
- Android worker `agent-29aae5111e4ecadf2d26b7f87bd3c53a`: one explicit compiler lease was granted
  for the translated `y=110` control only. Exactly one runner/build occurred:

  `node canvas/scripts/luna-android-grid-production-translated-control-run.mjs`

  Native command: `./gradlew --no-daemon --max-workers 2 :app:assembleDebug`, bounded at
  `180000 ms`. Build log:
  `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-android/canvas/research/luna-android-grid-production-20260907/translated-control-y110/build.log`.
  It records `BUILD SUCCESSFUL in 1m 23s`; Gradle exit `0`, runner exit `0`, observed runner
  elapsed approximately `94 s`. APK: `9267018` bytes, SHA-256
  `7e6c233ed52a35b7f7f0097ce88c0658971f5cf84b31697691a4bf104376c481`.

  Translated captures both passed: 420 dpi/font 1 compared `15601`, mismatched `0`; 320 dpi/font
  2 compared `8752`, mismatched `0`. All three children had positive samples and finite bounds.
  Nonces, equal consecutive full-frame hashes, references/captures, per-child measurements,
  occlusion comparison, and restored settings are retained under
  `canvas/research/luna-android-grid-production-20260907/translated-control-y110/`. Compiled
  Kotlin receipts: `CanvasFlowLayout.kt` 599 bytes,
  `3d037418b4fd296e505a6bd64a44472cfb82d0f651b7f90581149f317d87ea8b`; and
  `GridProductionTranslatedControl.kt` 3987 bytes,
  `e81cc9cf35686e3782b356e33dd940a32f5a1106e66017d28725f9a5c74533f3`.

  Original control results remain unchanged: 420/font 1 passed with zero mismatches; 320/font 2
  retained `131` mismatches. The coordinate evidence records first-child count `14`, bounds
  `x=110 y=84 w=35 h=1`; overlay count `117`, bounds `x=59 y=80 w=33 h=5`; second child `0`.
  The translated pass is only a translated-control/system-clock-occlusion diagnostic, not a
  retroactive original-control pass or broad capability promotion.

  The worker explicitly released the lease after settings restoration. Final check:
  `ps -axo pid,comm,args | rg gradle|Gradle|xcodebuild || true`; output contained only the
  checking shell and `rg`, with no compiler. Emulator `emulator-5554` remained attached; final
  settings were physical density `420`, no density override, font scale `1.0`, boot complete.

## Full suite

After Android release and an empty active-compiler check, the combined worktree ran exactly once:

`npm test`

This invokes the package’s full file set, including `compatibility/mobile-export-compilation.test.mjs`.
Log `/tmp/canvas-luna-full-suite-20260907.log` (modified `2026-09-07 03:14:33 -0600`). Exit
`0`; `1200` passed, `0` failed, `0` cancelled, `0` skipped; runner duration `168705.148375 ms`;
wrapper duration `169 s`.

Native stages in this single run were serialized: Swift test `24460 ms` exit `0`, Swift build
`3444 ms` exit `0`, and Compose `./gradlew --no-daemon --max-workers 2 :app:assembleDebug`
exit `0` in `105442 ms`. No concurrent native compiler was observed, and the post-run process
check was empty apart from its checking shell/`rg` matches.

## Package validation and production gate

- `npm run build:dev` exited `0` in `1 s`; log `/tmp/canvas-luna-build-dev-20260907.log`.
- Read-only public package validation:
  `penkra app test --directory /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/combined/canvas/dist`
  returned `ok: true`, app `com.penkra.canvas`, version `0.2.40`, all 11 operation-help entries,
  tab `ready` in `353 ms`, and `profileRemoved: true`. This is isolated package validation, not
  installed Dev1 acceptance.
- `npm run build` was run once and failed closed as expected; log
  `/tmp/canvas-luna-build-production-20260907.log` (modified `2026-09-07 03:15:57 -0600`).
  `taskExitCode=1`; error code `CANVAS_CAPABILITY_INCOMPLETE` for both Swift and Kotlin. The
  exact unverified property diagnostics are retained in the log. A direct source-table check of
  `unverifiedCapabilityEntries()` returned `76` total: `39` Swift and `37` Kotlin. No row was
  promoted by compilation, focused tests, translated controls, or package validation.

## Final evidence state

At evidence-recording time the combined branch still had only the preserved untracked Swift
`.build/` tree plus this new markdown file. No TODO, AGENTS, architecture, operations, source,
manifest, version, device, production, or publication state was changed. The final commit contains
only this evidence report.
