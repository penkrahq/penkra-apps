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

## Approved library protocol integration

After the initial verification and evidence commit, the coordinator approved exactly this batch from
`codex/canvas-luna-delivery-20260906`, in order: `0efd381`, `4acbcad`, `9cfc915`, `f0c0172`.
Each scope was inspected before picking; no protected file or out-of-scope change was present, and
there were no conflicts. Combined provenance is:

| Worker commit | Combined commit |
| --- | --- |
| `0efd381` | `7c57360` |
| `4acbcad` | `0ed0edc` |
| `9cfc915` | `cd21328` |
| `f0c0172` | `4c28c13` |

`73716f6` was verified as already ancestral and was not picked; duplicate worker commit `3a34182`
was not picked. The newly assigned retained adapter package remains unapproved and was not integrated.

The exact post-pick focused selection was:

`node scripts/test.mjs src/canvas-api.test.mjs src/library-storage.test.mjs src/library-retention-preparation.test.mjs src/luna-library-storage-protocol.test.mjs src/luna-library-artifact-integration.test.mjs`

Log: `/tmp/canvas-luna-approved-library-focused-20260907.log`. Exit `0`; `52` passed, `0` failed,
`0` cancelled, `0` skipped; runner duration `7005.352916 ms`; wrapper duration `7 s`.
This is a later, narrower library/API subset and is distinct from the earlier `1060` strict
source/exporter/Yjs result and `1200` full-suite result; it does not replace either baseline.

## PDF negative-package integration audit (read-only)

No PDF commit was picked. The audited candidate topology is:

- `2696b42`: adds the root-level `research/luna-pdfx-gate-inventory-20260907.md` inventory;
- `6a16ed5`: relocates that inventory to `canvas/research`;
- `349a6c9`: adds the serialized negative matrix test;
- `edd28fb`: stabilizes its ICC fixtures;
- `8752b92`: retains representative-only binaries and in-memory regeneration;
- `2cbe2ed`: adds the final matrix manifests, representative PDFs, and verification report.

The combined worktree has neither inventory path. A read-only `git apply --check` of the relocation
diff returned `1` because its root source file is absent. Therefore the minimal future sequence for
the requested negative-package test/evidence is `349a6c9`, `edd28fb`, `8752b92`, `2cbe2ed`, in that
order. The root-inventory commits `2696b42` and `6a16ed5` are omitted as inappropriate/intermediate
root research history; retaining that inventory later would require the pair together, not the
relocation alone.

The candidate JSON was read directly from `2cbe2ed`: `caseCount=22`,
`serializationVariantCount=2`, `executedResultCount=44`, and `44` unique
`case|serialization` identities. `sha256-manifest.json` reports
`retainedArtifactCount=2`, exactly `valid-candidate-control-classic-xref.pdf` and
`output-profile-unreadable-classic-xref.pdf`. The candidate verification explicitly states that
the positive control is not asserted conformant and that no PDF/X certification or publication-gate
claim is made. The six audited commits touch only research evidence and the named matrix test;
there are no protected files, capability-table/production-gate changes, exporter source changes,
or PDF/X gate changes.

At the orchestration checkpoint, the known-thread poll covered Android
`agent-29aae5111e4ecadf2d26b7f87bd3c53a`, iOS `agent-3d52bc7b681407f1426ee32b870ffb40`, delivery
`agent-eccc4d9408f68469415931f1120a09ca`, and PDF
`agent-93d30227119bd634b15b45d6b3d21f1f`; the exact returned statuses were respectively
`interrupted`, `working`, `interrupted`, and `working` (PDF had one queued turn). The local process
check found no active test or native compiler process. These statuses are telemetry only and do
not authorize a new build or device action.

## Approved PDF negative matrix integration

After the zero-byte LS-001 work, the coordinator approved exactly `349a6c9`, `edd28fb`, `8752b92`,
`2cbe2ed`, in that order. Scope inspection found only the named matrix test and its retained
research evidence; no protected files, production exporter source, capability table, package
metadata, or PDF/X gate changes were present. All picks were conflict-free:

| Worker commit | Combined commit |
| --- | --- |
| `349a6c9` | `b712949` |
| `edd28fb` | `ed7de6b` |
| `8752b92` | `bf46c34` |
| `2cbe2ed` | `e6401ab` |

The default read-only command was:

`node scripts/test.mjs src/exporters/luna-pdfx-document-negative-matrix.test.mjs`

Log `/tmp/canvas-luna-pdf-matrix-default-20260907.log`; exit `0`, `47` pass, `0` fail,
`0` cancelled, `0` skipped; runner duration `17990.061375 ms`, wrapper duration `19 s`.
Before/after file metadata for the retained evidence directory was identical, proving that this
run did not regenerate or rewrite the corpus.

The focused preflight/content/service command was:

`node scripts/test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/export-service.test.mjs`

Log `/tmp/canvas-luna-pdf-preflight-content-service-20260907.log`; exit `0`, `36` pass,
`0` fail, `0` cancelled, `0` skipped; runner duration `4283.237875 ms`, wrapper duration `5 s`.

Independent read-only manifest verification reports `caseCount=22`,
`serializationVariantCount=2`, `executedResultCount=44`, `uniqueIdentityCount=44`,
`generatedCaseCount=44`, and `retainedArtifactCount=2`. Both retained PDFs match their recorded
size and SHA-256 without regeneration:

- `valid-candidate-control-classic-xref.pdf`: `2662755` bytes,
  `28d285d8b77401100120aae6c99d72773e17f58b9ddf8e319c37cdff46d5fff8`;
- `output-profile-unreadable-classic-xref.pdf`: `5154` bytes,
  `9cc2a0a7270db590e3060d7ab5a63c70328c218f00a25a63c5773740fee4e885`.

## Unapproved PDF architectural-limit review

`babfac5`, `be70e15`, and `2f24268` remain unpicked. The candidate has the reported parsed-
dictionary limitation: `inspectPdfNumber` classifies by `stringValue`/`toString()` and can emit
`integer-range` for a parsed real `/Probe 2147483648.0` after pdf-lib normalizes it to
`2147483648`. Its tests do not cover content-stream names longer than 127 bytes; the lexical
scanner consumes slash names without checking their byte length, while object-graph inspection
cannot see names embedded in raw page content.

Other concrete findings remain: the candidate omits Table C.1 minimum nonzero real magnitude,
fractional precision, DeviceN component count, and CID maximum checks; its `1e-50` test only
asserts non-rejection. `String.fromCharCode(...bytes.subarray(...))` can throw on an oversized
numeric token, and the broad catch silently stops later lexical diagnostics. Content-limit scans
also cover page `Contents` only, not Form XObject streams. No source fix was made and the
publication gate remains closed.

The final post-integration revision is `e6401ab52811e378a5ffbfb17428d7be33e16a98`; tracked
state is clean apart from the preserved untracked Swift `.build/`. No compiler lease is held and
the final local process check has no Gradle, xcodebuild, swiftc, or test process. Latest poll
showed Android working with no queued turn, iOS working with no queued turn, delivery idle, and
PDF working with two queued turns; Android native work was not resumed by this lane.

## Independent retained-materializer review (read-only)

The library-runtime review was verified at captured HEAD `501d085ae6cc81b3f75f82a75867565e3eafb65f`
in `/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf`, report
`canvas/research/luna-retained-imports-independent-review-20260907.md`. Its exact focused
command was:

`node --test src/library-retained-imports.test.mjs src/library-retention-preparation.test.mjs`

Result: `17` pass, `0` fail, `0` cancelled, `0` skipped. The report is protocol/materializer
evidence only; it makes no live-persistence claim. No combined source, storage, backend, native,
device, or capability change was made.

The report reproduces four blocking materializer findings:

- **RI-001:** same-release aliases are grouped by release identity, so each alias receives the
  other alias's retained public resources; a `card`-only alias exposed the other alias's `secret`
  variable in its document surface.
- **RI-002:** shared dependency identity groups merge nested accepted items across root aliases; an
  alias retaining only `dep:x` exposed `dep:y` as well.
- **RI-003:** a forged retained item closure with a recomputed self-consistent item hash is
  accepted under an unchanged valid root identity, proving item self-hash is not publication
  binding.
- **RI-004:** merged asset groups are prefixed safely but over-copy other alias assets into each
  alias namespace.

RI-001, RI-002, and RI-004 share global release-identity aggregation; RI-003 is the separate
publication-binding/authentication boundary. The report confirms existing protections for
cross-release hash conflicts, dependency conflicts/cycles, alias validation, and byte mutation
isolation. LS-002 remains the upstream `readRetention` malformed-envelope issue; later per-item
materializer validation does not excuse accepting `root:{}`, `items:[{}]`, and
`requestedItems:[{}]`. LS-001 remains assigned to the zero-byte API/storage path and was not
duplicated. No source fix or unapproved runtime commit was integrated.

## Offline iOS transformation diagnosis (read-only, not integrated)

Diagnostic commits `36052b5` (harness/tests) and `a418c61` (audit artifacts) were inspected but
not picked. The diagnostic test/exporter selection reported `41` pass, `0` fail, `0` cancelled,
`0` skipped. No build, device mutation, recapture, or exporter source change occurred.

The retained evidence establishes a capture-origin mismatch, not an emitter offset: generated
Swift uses a fixed `340x400` root with no outer position/frame (variant source line 13),
`GridFixtureHost.swift:54` places it directly in `WindowGroup`, and the capture runner crop
(`luna-ios-grid-production-capture.mjs:98-103`) centers those dimensions against the full physical
screenshot rather than the WindowGroup safe-area content origin. Generated Swift positions match
`38/38`; dimension-valid native outputs preserve x/width/height with uniform y displacement:
 iPhone `+42 px / +14 pt` and iPad `+7 px / +3.5 pt`. Exact runtime inset values were not retained
and are not claimed.

The three `880x924` anomalies are stale/inconsistent crop outputs. Replaying `sips` from retained
final fullB bytes produced the expected `1020x1200` for both iPhone cases and `680x800` for iPad.
The iPhone Large reversed case has final fullB `1206x2622` with matching recorded/final hash but
an unreproducible `880x924` crop. The iPhone XXL and iPad controls have final fullB
`652x2702`/`904x2702` hashes differing from recorded pre-crop hashes, with stale `880x924` crops.
Runner lines `79-82` hash fullB, while `131-135` invoke `sips` without a pre-crop immutability
check or exact output-dimension assertion.

The proposed minimal future harness changes are: re-read/hash/size-check fullB immediately before
`sips`; write to a unique temporary crop path; assert exact `340*scale x 400*scale` dimensions;
and capture an app-owned root-origin/safe-area receipt for crop origin. No fix was implemented,
and any next native run requires a new integration lease.

## PDF/X subset-policy helper review (read-only, not integrated)

Candidate commits `85f0ea8` (one standalone source file), `a471df7` (one test file), and `ec3f2d8`
(one evidence file) remain unpicked. The helper exports only
`inspectPdfxSubsetPolicy(pdf) -> { issues }` with `{ code, clause, object }`; it is not wired into
the emitter, PDF preflight, conformance result, capability table, or any storage/materializer
path. The reported direct selection passed `24/24` with `0` failures, cancellations, or skips
(`9` new policy tests plus `15` existing preflight tests).

The source statically covers catalog `Perms`, exact catalog metadata identity, four viewer
preference box/clip fields, inline/indirect/unreachable arrays/dictionaries/streams, shared-object
deduplication, cycles, and deterministic missing-reference diagnostics. One concrete policy gap
was found: the implementation checks object `Type` values `OCG`/`OCMD` and `OC`/`HalftoneType`
keys, but never checks the catalog `OCProperties` key itself. Thus a catalog containing
`OCProperties` whose value is an otherwise ordinary or empty dictionary can pass this standalone
policy inspector, despite its comment claiming optional-content dictionary/key coverage. The
existing nine tests likewise omit a catalog `OCProperties` case.

The helper's viewer test also exercises only direct per-page `BleedBox` presence when accepting
BleedBox preferences; inherited/page-tree behavior is not covered. The helper remains a
review-only diagnostic and the PDF/X publication gate remains closed. No source fix, wiring, or
native action was taken.

## PDF/X subset-policy integration

The coordinator subsequently approved `85f0ea8`, `a471df7`, `ec3f2d8` in that order. Combined
provenance is `ea4f227`, `916a62d`, `6991cec`, with no conflicts. The authorized narrow source
integration is `e2f0c46`: `pdfx-preflight.mjs` imports and calls `inspectPdfxSubsetPolicy(pdf)`
only after successful `PDFDocument.load`, appending its issues; it leaves `conformant:false`,
`uncovered`, and the closed publication gate unchanged. Clause corrections are in the helper:
Catalog/Perms `6.15`, HalftoneType `6.13`, OCG/OCMD/OC `6.24`, and metadata `6.10.6`.

The separate test work is `b02dc40` plus fixture/expectation correction `b22b07c`. The final strict
selection was:

`node scripts/test.mjs src/exporters/pdfx-subset-policy.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-metadata.test.mjs src/exporters/luna-pdfx-metadata-serialized.test.mjs src/exporters/pdfx-fonts.test.mjs src/exporters/luna-pdfx-font-matrix.test.mjs src/export-service.test.mjs`

Log `/tmp/canvas-luna-pdf-subset-final-focused-20260907.log`; exit `0`, `210` pass, `0` fail,
`0` cancelled, `0` skipped; runner duration `24737.520375 ms`, wrapper duration `25 s`.
The added preflight-level regression uses the retained generated valid candidate: the baseline
remains `verified-canvas-writer-subset` with `conformant:false`; after adding `Catalog/Perms {}`
the helper issue appears as `CANVAS_SUBSET_UNSUPPORTED`, clause `6.15`, object
`Catalog/Perms`, while `conformant:false` and the exact `uncovered` list remain unchanged.

An earlier post-integration run was not accepted as final: `208` pass, `2` fail, `0` cancelled,
`0` skipped, exit `1`, because the existing helper test still expected the old clause `6.24` and
the regression incorrectly called gated `exportPdf` as though it returned PDF/X bytes. Those
test-only assumptions were corrected; the identical final selection above then passed. No broad
source change or native action occurred.

## Library-runtime final review (read-only)

The exact committed library-runtime review was verified at HEAD
`51ce2a893b7b4df3e5cab7792e84035a89ed230d` on branch
`codex/canvas-library-runtime-20260907`, using task-owned archive
`/tmp/luna-library-final-review-JFGN7N`. Evidence commit `19b9309` adds only
`canvas/research/luna-library-final-independent-review-20260907.md`; it was not integrated as
runtime source. The reviewed source authority is `7070484` and `ee803d2`, with tests `aa50e34`
and `15497b2`. The supplied identifier `LS0027070484` is not a literal in the committed tree.

Exact-revision focused command:

`node --test src/library-storage.test.mjs src/library-retained-imports.test.mjs`

Result: exit `0`, `23` pass, `0` fail, `0` cancelled, `0` skipped. The targeted reproduction
selection also exited `0`, with `7` pass and `0` fail/cancel/skip, covering malformed retention
envelopes, incomplete cross-root item/asset closure, same-release alias isolation, nested
dependency manifests, colliding dependency assets, and duplicate-asset rejection.

The review confirms malformed `readRetention` envelopes reject `CANVAS_IMPORT_INTEGRITY` before
return; cross-root borrowing rejects; same-release item/asset surfaces and nested manifests stay
isolated; redundant/conflicting assets reject; and valid private local closure remains internal.
`readRetention` authenticates through the accepted descriptor, then validates restored size/hash.
No Merkle proof is demanded. No reproducible remaining bug was found in the requested scope, and
no source/native/device/capability/storage schema change was made.

## Independent delivery review blockers

The independent review report was read-only verified from delivery HEAD
`f0c0172c631478efd2ae1bd4028f7728741011df` at
`/Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/luna-pdf/canvas/research/luna-library-storage-independent-review-20260907.md`.
Its SHA-256 is `61fa39091d05c8849e4c0dcc77939157343fa1cac1a80c47360b51343eb89d20`.
The exact Bun focused protocol selection reported `41` pass, `0` fail, `0` skipped, `0`
cancelled; it is an in-memory protocol harness and makes no live-persistence claim.

- **LS-001, reproduced, medium integrity boundary:** `createCanvasApi.readAsset` loops only
  while `offset < asset.size`. A ready receipt for an unpersisted zero-byte blob therefore
  performs no backend read for that asset. The in-memory reproduction returned
  `zeroByteWrite=succeeded`, `backendReadRequests=1` (the nonzero envelope read only), and
  `uploadedZeroAssetPersisted=false`.
- **LS-002, reproduced, medium input validation:** `readRetention` accepted a correctly hashed
  `com.penkra.canvas.stored-library/1` retention envelope with
  `content={root:{},items:[{}],requestedItems:[{}],assets:[]}` and returned the malformed root/items.

Lower-scope observations LS-003 (direct API caller-byte mutation), LS-004 (direct receipt trust),
and LS-005 (stored descriptor MIME mismatch) are retained in the independent report; the storage
wrapper mitigates the first two direct-API gaps on its tested route. No source/backend change was
made, no new compiler lease or native run was started, and no fix is inferred from these findings.
The combined delivery batch remains integrated through `4c28c13`; these findings are blocking
review evidence pending coordinator decision.

## Zero-byte API integration and LS-001 reproduction

The coordinator approved exactly `b1a373b`, `b753993`, `d518d16` in that order. None was an
ancestor or patch-equivalent of the combined revision, and all three cherry-picks were clean:

| Worker commit | Combined commit |
| --- | --- |
| `b1a373b` | `b5d29e9` |
| `b753993` | `84192bf` |
| `d518d16` | `edfd630` |

The additional test-only LS-001 reproduction was committed as `dbe3431`.
`CANVAS_ASSET_UPLOAD_RECEIPT_INVALID` from the earlier approved upload-receipt batch remains
present. The only untracked path after integration is the preserved
`canvas/compatibility/mobile-fixtures/swiftui/.build/` tree.

The strict requested selection was run from `canvas` as:

`node scripts/test.mjs src/canvas-api.test.mjs src/luna-asset-empty-read.test.mjs src/library-storage.test.mjs src/luna-library-storage-protocol.test.mjs`

The first authoring attempt reported `SyntaxError: Identifier 'response' has already been
declared` before loading the new test file: aggregate `38` pass, `1` fail, `0` cancelled, `0`
skipped, exit `1`. The duplicate helper was removed and the identical command was rerun
authoritatively. Log `/tmp/canvas-luna-zero-byte-focused-20260907.log`; exit `0`, `45` pass,
`0` fail, `0` cancelled, `0` skipped; runner duration `403.309792 ms` (portable wrapper
duration under `1 s`).

The added test uses real `createCanvasApi(runtime)` and `createLibraryStorage(api)`. Its fake
authenticated Account transport returns a `ready` receipt for an empty asset without persisting
it, then returns `BLOB_NOT_FOUND` for the storage readback GET at offset `0`. Assertions prove
one exact authenticated GET occurred, the write rejected with `BLOB_NOT_FOUND`, no release
receipt was returned, no upload completion was attempted, and the zero-byte hash was not stored.

## Pending PDF architectural-limit review (not integrated)

The pending chain is `babfac5` (source), `be70e15` (22 boundary tests), `2f24268` (evidence),
with each parent in that order and `babfac5^` matching the combined PDF preflight tree. No PDF
commit was picked. Static review found these concrete scope issues:

- The implementation covers maximum name bytes, content-stream string bytes, q/Q depth,
  indirect-object count, signed integer range, and maximum real range. Adobe PDF Reference 1.6
  Table C.1 also specifies minimum nonzero real magnitude, fractional precision, DeviceN
  component count, and CID maximum; this package defines no checks for those four limits. The
  `1e-50` test only asserts that it is not rejected, so it does not protect the missing minimum
  real-limit behavior.
- `inspectContentNumberSpellings` builds each token with
  `String.fromCharCode(...bytes.subarray(start, end))`. An oversized numeric token can exceed the
  engine's argument limit, raise `RangeError`, and be swallowed by the function's broad catch;
  scanning then stops without a diagnostic for later tokens. The boundary suite has no long-token
  regression for this fail-closed diagnostic gap.
- The lexical and parsed content-limit checks are attached only to page `Contents` streams.
  Form XObject content remains explicitly uncovered/unsupported in the existing preflight, so
  this is not a complete architectural-limit traversal if that scope is ever expanded.

The prior negative document matrix topology remains a separate chain:
`349a6c9 -> edd28fb -> 8752b92 -> 2cbe2ed`; the root inventory pair `2696b42 -> 6a16ed5` is
intermediate research relocation and is omitted from the minimal test/evidence sequence. The
combined branch already contains a different serialized content/resource matrix and corpus
(`dc11fc9`, `3db51b8`, `ee7e269`), so those commits are not silently treated as patch-equivalent
to the pending document-negative package. Its final evidence reports 22 cases x 2 serializers
(44 identities) and exactly 2 retained representative PDFs; no PDF/X gate or capability state
changed. If later approved, the minimal independent sequences are the four-commit document
matrix chain above and the three-commit architectural-limit chain above, in their stated orders.

At the latest active-lane poll: Android `agent-29aae5111e4ecadf2d26b7f87bd3c53a` was
`interrupted` with no queued turn; iOS `agent-3d52bc7b681407f1426ee32b870ffb40` was `working`
with no queued turn; delivery `agent-eccc4d9408f68469415931f1120a09ca` was `working` with no
queued turn; PDF `agent-93d30227119bd634b15b45d6b3d21f1f` was `working` with `2` queued turns.
No Android native task was resumed. No Gradle, xcodebuild, or swiftc lease is held by this lane.
