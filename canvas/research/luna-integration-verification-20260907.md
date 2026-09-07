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

## Retained-library approved integration

The coordinator re-approved the retained-library sequence and independent evidence commit. The
worker-to-combined provenance is:

| Worker commit | Combined commit |
| --- | --- |
| `770520e` | `8d9e556` |
| `24b92a8` | `87e8c7c` |
| `76ec00e` | `2d83a5c` |
| `d80ec1c` | `dda7b87` |
| `501d085` | `f2da477` |
| `7070484` | `a9d428b` |
| `aa50e34` | `c5f49cd` |
| `3623dd3` | `6154216` |
| `ee803d2` | `56146cb` |
| `15497b2` | `9351789` |
| `51ce2a8` | `548a029` |
| `19b9309` | `c33f493` |

All twelve picks were clean and none was an ancestor or patch-equivalent at the time of
integration. Scope remained within the approved retained-library source, tests, and research
records; no protected file, capability, conformance, or native artifact changed. The prior
combined API fixes and the preserved untracked Swift `.build/` tree remain present. The temporary
PDF architectural-limit pick was aborted after its import-only conflict and did not alter this
integrated revision.

The strict integrated selection was run once from `canvas`:

`node scripts/test.mjs src/canvas-imports.test.mjs src/canvas-resolver.test.mjs src/library-publication.test.mjs src/library-publication-service.test.mjs src/library-retention-preparation.test.mjs src/library-storage.test.mjs src/library-retained-imports.test.mjs src/luna-asset-empty-read.test.mjs src/luna-library-storage-protocol.test.mjs src/luna-library-artifact-integration.test.mjs`

Log `/tmp/canvas-luna-library-integrated-20260907.log`; exit `0`, `87` pass, `0` fail,
`0` cancelled, `0` skipped; runner duration `6861.039541 ms`, wrapper duration `7 s`. This
selection includes the malformed LS-002 retention-envelope rejection, authenticated LS-001
unpersisted zero-byte read rejection, same-release alias isolation, nested dependency isolation,
storage validation, materializer, protocol, and artifact assertions.

## Corrected PDF architectural-limit integration

The coordinator approved the corrected PDF-limit sequence. No PDF tests were run between these
corrective commits:

| Worker commit | Combined commit |
| --- | --- |
| `babfac5` | `a9ca58a` |
| `be70e15` | `df322a4` |
| `2f24268` | `94e8d04` |
| `5160404` | `c1a0b4e` |
| `d6a54b7` | `f1b47bb` |
| `13f20d4` | `3f28fc1` |

The first pick had the known import overlap with the approved subset-policy wiring. It was
resolved narrowly by retaining both the `inspectPdfxSubsetPolicy` import/call and all PDF-limit
imports/body checks; no ours/theirs wholesale resolution was used. The authorized uncovered
diagnostic entry and regression were added in `dd555e9`:
`Table C.1: original integer/real spelling of serialized object numbers before parser
normalization`. The `conformant: false` result and closed gate are unchanged. Commit `8af191e`
was not picked.

After the complete six-commit sequence and `dd555e9`, the strict full PDF/service selection was
run once from `canvas` with no cancellation:

`node scripts/test.mjs src/exporters/exporters.test.mjs src/exporters/luna-pdfx-document-negative-matrix.test.mjs src/exporters/luna-pdfx-extgstate-context.test.mjs src/exporters/luna-pdfx-font-matrix.test.mjs src/exporters/luna-pdfx-graphics-state-matrix.test.mjs src/exporters/luna-pdfx-image-matrix.test.mjs src/exporters/luna-pdfx-metadata-serialized.test.mjs src/exporters/pdf-extraction.test.mjs src/exporters/pdf16-writer.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-fonts.test.mjs src/exporters/pdfx-images.test.mjs src/exporters/pdfx-limits.test.mjs src/exporters/pdfx-metadata.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-serialized-corpus.test.mjs src/exporters/pdfx-subset-policy.test.mjs src/export-service.test.mjs`

Log `/tmp/canvas-luna-pdf-full-service-20260907.log`; exit `1`, `711` pass, `1` fail,
`0` cancelled, `0` skipped; runner duration `26550.880541 ms`, wrapper duration `26 s`. The
single failure was `src/exporters/luna-pdfx-graphics-state-matrix.test.mjs:361`, default-mode
retained-evidence verification. The new checker reports
`OBJECT_GRAPH_INVALID` at
`Catalog/Pages/Kids[0]/Resources/ExtGState/State`, while the retained expected non-graphics issue
list does not contain it. This is retained-evidence/spec drift at the exact dangling resource
path; no speculative checker or evidence fix was made. The full run did execute the new raw
integer/real spelling, content-limit, object-limit, and subset-policy checks before this one
assertion failed.

## Loader, publication, and envelope integration

The approved loader/publication batch was applied after the existing PDF/library work at
`e8a2962`, with no equivalent skips and no intermediate tests:

| Worker commit | Combined commit |
| --- | --- |
| `9c26d31` | `08a38f3` |
| `012f0b7` | `fd7e455` |
| `df4d05c` | `3947ba3` |
| `9855b2b` | `624162b` |
| `4f31e0f` | `4af4799` |
| `4831ab3` | `cba51e5` |
| `e7bae5c` | `2e992e5` |
| `bc3b7b3` | `f278550` |
| `2117fdc` | `fc4696f` |
| `4704a8f` | `b1812bc` |
| `768bc6b` | `9228639` |

The approved envelope sequence then applied cleanly, also without intermediate tests:

| Worker commit | Combined commit |
| --- | --- |
| `ccd2a06` | `0bb2a54` |
| `b201169` | `7471e3b` |
| `1284fcc` | `9cf43c4` |
| `5908887` | `0fce58e` |
| `51258ff` | `e2637b1` |
| `f6a1d40` | `faf8cfb` |
| `175f513` | `2f00f5a` |
| `de4569c` | `3d30d85` |
| `9c501cb` | `52e2258` |

The one post-batch strict command covered schema/import/resolver/publication, retention/storage,
materializer, loader, protocol/artifact, and both envelope test files:

`node scripts/test.mjs src/canvas-schema.test.mjs src/canvas-imports.test.mjs src/canvas-resolver.test.mjs src/library-publication.test.mjs src/library-publication-service.test.mjs src/library-retention-preparation.test.mjs src/library-storage.test.mjs src/library-retained-imports.test.mjs src/library-retained-loader.test.mjs src/luna-library-storage-protocol.test.mjs src/luna-library-artifact-integration.test.mjs src/exporters/pdf-serialization-envelope.test.mjs src/exporters/luna-pdf-envelope-independent.test.mjs`

Log `/tmp/canvas-luna-loader-publication-envelope-20260907.log`; exit `0`, `129` pass,
`0` fail, `0` cancelled, `0` skipped; runner duration `16195.991084 ms`, wrapper duration
`16 s`. The required retained-follow identity, source-fallback prevention, publication retention
stripping, storage/materializer isolation, and envelope boundary assertions all passed. No native
lease or Android action was used for this batch.

Per the later helper/evidence approval, the exact two-file envelope receipt was rerun only after
the complete approved sequence; helper classic-xref/direct-length generation-zero scope and the
existing closed gate were unchanged:

`node scripts/test.mjs src/exporters/pdf-serialization-envelope.test.mjs src/exporters/luna-pdf-envelope-independent.test.mjs`

Log `/tmp/canvas-luna-envelope-two-files-20260907.log`; exit `0`, `21` passed, `0` failed,
`0` cancelled, `0` skipped; wrapper duration `1 s` (runner-reported duration `196.643375 ms`).

## Retained operations and import-integrity follow-on

The approved follow-on was applied cleanly after the loader/publication base batch, with no
intermediate tests:

| Worker commit | Combined commit |
| --- | --- |
| `032233c` | `22d5e2f` |
| `5f2e429` | `41c2803` |
| `57748e0` | `151df3b` |
| `c3f1f4e` | `1187aea` |
| `85a1f01` | `6b3e6ba` |
| `9ba6ff0` | `8fe25cc` |
| `cd2e383` | `b2c30b2` |
| `5b0b1e0` | `f590873` |

The source changes are limited to rejecting retention on legacy import records, routing registered
export/extract operations through the consumer-owned retained loader, and requiring string-valued
content and storage hashes before integrity checks. The added test/evidence files contain no
operations wiring beyond that approved seam and no live-document, registry, or native changes.

After the complete sequence, the strict retained operations/imports/schema/storage/loader selection
was run once:

`node scripts/test.mjs src/operations.test.mjs src/operations-retained-imports.test.mjs src/canvas-schema.test.mjs src/canvas-imports.test.mjs src/canvas-resolver.test.mjs src/library-retained-loader.test.mjs src/library-storage.test.mjs src/library-retained-imports.test.mjs`

Log `/tmp/canvas-luna-retained-operations-integrated-20260907.log`; exit `0`, `84` passed,
`0` failed, `0` cancelled, `0` skipped; wrapper duration `1 s` (runner-reported duration
`845.608292 ms`). Legacy-retention rejection, consumer-owned retained export/extract, explicit
string-integrity rejection, loader isolation, storage integrity, and materializer checks passed.

## Asset upload integrity follow-on

The approved asset API sequence applied cleanly after the retained-operations batch, in exact
order and without intermediate tests:

| Worker commit | Combined commit |
| --- | --- |
| `abee97a` | `f8f5efd` |
| `1ab9ecc` | `ab39d67` |
| `280eafc` | `1f40590` |
| `c5460be` | `d2db238` |
| `02d059d` | `0988032` |
| `88aea72` | `8840678` |
| `5284a47` | `49ae866` |
| `97d7a5f` | `4bd20de` |
| `e8c1a4f` | `6733970` |

The integrated source snapshots upload bytes and metadata before the first await, validates exact
hash/size and receipt object shape, rejects malformed metadata and invalid chunk sizes with
`CANVAS_ASSET_UPLOAD_RECEIPT_INVALID`, and preserves the caller path. The approved MIME correction
is retained: a deduplicated backend MIME may differ while requested MIME is still sent at upload
start. No readAsset, storage, backend, schema, capability, or native changes were introduced.

After the complete sequence, the strict six-file selection was run once:

`node scripts/test.mjs src/canvas-api.test.mjs src/luna-asset-upload-integrity.test.mjs src/luna-asset-empty-read.test.mjs src/library-storage.test.mjs src/luna-library-storage-protocol.test.mjs src/operations-retained-imports.test.mjs`

Log `/tmp/canvas-luna-asset-upload-integrated-20260907.log`; exit `0`, `61` passed, `0` failed,
`0` cancelled, `0` skipped; wrapper duration `<1 s` (runner-reported duration `822.123416 ms`).
Upload snapshot/receipt, zero-byte read, storage/protocol, and retained-operation assertions all
passed.

## PDF envelope wiring and page-tree helper batch

The approved PDF batch applied cleanly in exact order after the envelope-helper baseline. The first
three commits wire and test envelope inspection in preflight; the page-tree helper remains
standalone and is not wired:

| Worker commit | Combined commit |
| --- | --- |
| `731643f` | `44e2141` |
| `85eb072` | `7e43ccd` |
| `b6fae6d` | `ca9cc26` |
| `c06ac7d` | `960efd7` |
| `bd6e52c` | `f08d58c` |
| `4c73239` | `5c6137d` |
| `d7ef874` | `265816a` |

No protected files or gate-setting changes were included. The preflight envelope invocation
preserves the existing `conformant: false` behavior and uncovered diagnostics; the page-tree
helper is limited to raw page-tree relationships and its 2048-depth independent coverage.

After all seven commits, the full exporter/service selection was run once using every current
`src/exporters/*.test.mjs` file discovered by `rg --files`, plus `src/export-service.test.mjs`:

`node scripts/test.mjs $(rg --files src/exporters -g "*.test.mjs" | sort) src/export-service.test.mjs`

Log `/tmp/canvas-luna-pdf-exporter-service-integrated-20260907.log`; exit `0`, `755` passed,
`0` failed, `0` cancelled, `0` skipped; wrapper duration `27 s` (runner-reported duration
`26491.738625 ms`). Envelope preflight invocation, graphics projections, page-tree helper,
negative matrix, limits, content, metadata, fonts, images, and service assertions all passed.
No native action occurred.

## Current public-operation integration baseline at `ae57f66`

Before verification, combined was exactly `ae57f6663f0146f81965c6add8b5a4759d209a18` on
`codex/canvas-local-integration-20260906`, with tracked files clean and only the preserved
untracked `canvas/compatibility/mobile-fixtures/swiftui/.build/` directory present.

The strict full JavaScript/Yjs source selection was run at that SHA:

`node scripts/test.mjs src/*.test.mjs src/exporters/*.test.mjs collaboration/pen-yjs-model.test.mjs`

Log `/tmp/canvas-luna-source-full-ae57f66-20260907.log`; exit `0`, `1245` passed, `0` failed,
`0` cancelled, `0` skipped; runner duration `40499.179084 ms`.

The compatibility selection was then run with the mobile export-compilation test explicitly
excluded:

`node scripts/test.mjs $(rg --files compatibility -g "*.test.mjs" -g "!mobile-export-compilation.test.mjs" | sort)`

Log `/tmp/canvas-luna-compat-ae57f66-20260907.log`; exit `0`, `138` passed, `0` failed,
`0` cancelled, `0` skipped; runner duration `31988.508375 ms`, wrapper duration `32 s`.
The browser-fixture lifecycle coverage remained included; no native compilation was run.

The development package build was run at the same SHA:

`npm run build:dev`

Log `/tmp/canvas-luna-build-dev-ae57f66-20260907.log`; exit `0`, wrapper duration `1 s`.
The generated dist was validated in isolation with:

`penkra app test --directory /Users/emmanuelgyekyeatta-penkra/Penkra/canvas-parallel-20260906/combined/canvas/dist`

The App test returned `ok: true` for `com.penkra.canvas` version `0.2.40`, with the declared
document/sharing operations and a ready test tab; its temporary profile was removed. This was
package validation only, not installed Dev1 acceptance and involved no user document mutation.

The production build was run once as the fail-closed gate check:

`npm run build`

Log `/tmp/canvas-luna-build-production-ae57f66-20260907.log`; task exit `1`, wrapper duration
`0 s`. It failed with `CANVAS_CAPABILITY_INCOMPLETE` because the capability tables reported
`39` unverified Swift rows and `37` unverified Kotlin rows (`76` total); no missing, extra, or
invalid rows were reported. This remains an expected closed gate and is not production readiness
or a capability promotion.

## Publication-head reader audit

The integrated head-reader tests exercise valid saved Yjs state and malformed materialized
publication-head values, but do not exercise malformed saved Yjs bytes or malformed update
records. A device-free probe against `readPublishedCanvasLibrary` with `snapshot.state` set to
invalid base64 returned the raw `InvalidCharacterError` (`code=5`, `Invalid character`); two bytes
of malformed Yjs state returned raw `Error` (`Unexpected end of array`). Neither was normalized to
`CANVAS_IMPORT_INTEGRITY`, and restore failure occurs before the reader's `finally` block receives
the model. This is a concrete reader-boundary gap; no production fix was made.

The reader ignores the Account projection field and restores the Yjs state, so the current tests
also lack an explicit valid-state/malformed-projection regression demonstrating that the ignored
projection cannot affect the selected publication. This is a coverage gap rather than a reproduced
acceptance failure in the current implementation.

Caller isolation was independently probed with a valid stored release: after mutating the first
result's release document, publication head, and assets map, a second read returned the original
`frame`, `r1`, and zero assets. No isolation failure was reproduced. The head tests do not currently
assert this mutation-then-reread contract; the observed isolation comes from detached publication
metadata, fresh release JSON, and copied blob bytes. No speculative production fix was made.

## PDF page-tree guard and name-subset follow-on

The approved PDF commits applied cleanly after the publication-head batch and in exact order:

| Worker commit | Combined commit |
| --- | --- |
| `d2003f8` | `5b7c78b` |
| `fca4673` | `c89854f` |
| `9303d7a` | `fcfce57` |
| `f7fc9dd` | `940a8f2` |
| `5416e1c` | `73983eb` |
| `9ef9885` | `be26e5e` |

The page-tree validator now runs immediately after PDF parsing and before recursive semantic PDF
helpers; malformed page trees fail closed with `PDF_PAGE_TREE_INVALID`. The isolated timeout test
terminates its deliberately nonterminating child within its parent bound. Invalid UTF-8 escaped
names are classified `PDF_SERIALIZATION_OUTSIDE_SUBSET` with the writer-subset diagnostic, while
valid UTF-8 names and existing raw-byte identity checks remain intact. `conformant: false` and the
existing uncovered diagnostics are unchanged.

After the complete batch, the full exporter/service selection ran once:

`node scripts/test.mjs $(rg --files src/exporters -g "*.test.mjs" | sort) src/export-service.test.mjs`

Log `/tmp/canvas-luna-pdf-full-exporter-service-be26e5e-20260907.log`; exit `0`, `764` passed,
`0` failed, `0` cancelled, `0` skipped; runner duration `26177.901333 ms`, wrapper duration
`26 s`. Envelope, historical preflight, page-tree, name-subset, limits, content, metadata, font,
image, matrix, and service assertions all passed. No native action occurred.

## PDF content-name and library-retention follow-on

After the iOS dependency closure, the approved PDF sequence was integrated before testing:

| Worker commit | Combined commit |
| --- | --- |
| `dfb85c8` | `d99d737` |
| `5cbd413` | `3b2f35f` |
| `7f2456f` | `1319768` |
| `6b7a468` | `d8c24f3` |
| `f6bf1e7` | `1053e89` |

The sequence consists of the independent pre-fix name-boundary probe/evidence, checked content
name validation, its regression coverage, and final evidence. The full strict selection was:

`node --test canvas/src/exporters/*.test.mjs canvas/src/export-service.test.mjs`

Exit `0`; `775` passed, `0` failed, `0` cancelled, `0` skipped; duration
`26725.362625 ms`. This included the new content-name tests and retained all historical PDF/X
envelope, limits, page-tree, content, metadata, font, image, matrix, and service checks. No gate
or conformance promotion occurred.

The approved library sequence was also integrated before testing:

| Worker commit | Combined commit |
| --- | --- |
| `97206b6` | `81aa870` |
| `e6d1798` | `2c153a4` |
| `9f67b70` | `a030582` |
| `a9b6a43` | `3fc9db3` |
| `0f056ce` | `f248ea7` |
| `3aea0dd` | `35bdb62` |

The strict storage/retention/materializer/loader/protocol selection was:

`node --test canvas/src/library-storage.test.mjs canvas/src/luna-library-storage-protocol.test.mjs canvas/src/library-release-retentions.test.mjs canvas/src/library-retained-imports.test.mjs canvas/src/library-retention-preparation.test.mjs canvas/src/library-retained-loader.test.mjs`

Exit `0`; `56` passed, `0` failed, `0` cancelled, `0` skipped; duration `344.724459 ms`.
This covers optional retention transport, snapshotting, malformed transport rejection, early
stored-root validation before asset reads, retained materializer isolation/closure, loader
identity and source-fallback behavior, and the real asset protocol. The separately unapproved
`5ec6b01` acceptance remains out of combined.

## iOS missing-one closure

The approved missing-one source/evidence sequence was integrated cleanly after the prior iOS
closure:

| Worker commit | Combined commit |
| --- | --- |
| `c1ee11970ff3decac44542af9a842b26f7193ecf` | `e94682c` |
| `a3a9b53b52865f24990ff4393dd84cf9aae9bd4a` | `b8ffa7f` |
| `db558ab5221a96244b70bd35c5cae28eaf7cde54` | `5e46a0a` |
| `bca1cc918f7d57c7ec1d4dba6bc0b3b2edcfeacd` | `02bcf90` |
| `bc3b9e9924c6948edd5822fa804fdbe864188995` | `9750c68` |

All five diffs were limited to the named missing-one harness/scripts or iOS research evidence;
no production, exporter, vendor, manifest, protected, native, or capability files were changed.

The device-free verification command was:

`node --test canvas/compatibility/luna-ios-grid-production.test.mjs canvas/compatibility/luna-ios-grid-capture-20260907.test.mjs canvas/compatibility/luna-ios-grid-missing-five-capture.test.mjs canvas/compatibility/luna-ios-grid-missing-one-capture.test.mjs`

Exit `0`; `26` passed, `0` failed, `0` cancelled, `0` skipped; duration `516.48575 ms`.

Independent structured verification at combined `9750c6869b5762e43800fa88edc79e44838b6f58`:

- Original run02 remains 39 entries: 34 `pass`, 5 `unmeasured`; 106 compared children,
  800,252 positive samples, 0 comparator failures.
- Original missing-five remains 5 entries: 4 `pass`, 1 `unmeasured`; 13 compared children,
  129,688 positive samples, 0 comparator failures.
- Historical missing-one `db558ab` remains one `unmeasured` entry and is not overwritten.
- Fixed missing-one is one measured `pass`, launch exit 0, one launch/first pair, root
  `{x:31,y:251,width:340,height:400}`, crop `{x:93,y:753,width:1020,height:1200}`, registration
  `none`, stable full-frame hashes with captured==before-crop==after-crop, and four children at
  9,976 positive samples each (39,904 total).
- The latest identity union has 39 unique identities and 39 latest passes: 34 retained from
  run02, 4 from missing-five, and 1 from fixed missing-one. Earlier statuses remain preserved
  in their original evidence directories.
- The executable rehash equals
  `56a7893fdc96d9b7b69fa1f37c8fedacbe2477bac479b5ad6eba11a9fcc14065`; the fixed capture
  preflight records the same expected/host SHA. The source SHA is
  `cd9f240225dde9741775febc2cd3d8f4796be683baa895619b4f385580c43b11`; all 15 declared source
  file hashes and byte counts match the retained source files.

The `bca1cc9` test exercises the exported `runPostlaunchAttempt` helper with an injected
postlaunch callback failure and verifies serialized phase/error/receipt/temp-attempt behavior.
That helper test does not execute the complete production runner catch path or prove every
postlaunch failure branch; this remains a bounded test-coverage limitation, not a measured
capture failure.

No native/device action, rebuild, capability promotion, or historical evidence rewrite occurred.

## iOS text receipt harness integration

The approved ten-commit receipt sequence was cherry-picked after the prior baseline at
`347aeda24e8227339adef84271028a59efe04049`, with no conflicts, skips, or additional font/grid
commits. Worker-to-combined mappings are:

| Worker commit | Combined commit |
| --- | --- |
| `4286e9524402464b8db91d06061ad97f459b8837` | `6bd2bb84d581d8884e54a412b707584f9147741d` |
| `c1cc8b19fe9539dfad8f7b64f6cf34d69a62c864` | `08501b1caa50bfd7ddad094867619648ce783025` |
| `08bef3e3f83785f374d29bec490e6b7b34072c1e` | `a87627abb1fa0b8e1de7f15b48bf4207697a3d85` |
| `3f747709d7ee2a3c817fe341b70e95ef44c4af07` | `4f252f46795d27692342d31f902b6a6c3420e6bc` |
| `060e676782830c99a5f751f82834e1a3a6a41822` | `ba95031d3e41729424ccf587954b695008468eba` |
| `ba9c89df6109a4f78a1f86e2ebefd6404e1f89bb` | `63ff095d53779fda4dcf8bf5d8888a706fd5a312` |
| `f65a89c43d853c76651790834a6aa2d27ba0a61f` | `36996a40c3e06dd0fcf9d9d6e5001f4210fec851` |
| `61c990f6937a4317975cc2d79d854cce681fc320` | `c88484dcca601cfed66c235251e44746ed00b242` |
| `1ce9d0434c3ac935bd55ede1605b54328b47231d` | `06ff203b873ce2f8fe51df06df14efe4ae6bb0ab` |
| `3967d70c7a92b72be5b807a874dae63c620184b3` | `f8c2ac97d97a3c496ec4da8f14b8815802b8ad82` |

The integrated selection was run once, entirely device-free, without reference regeneration:

`node scripts/test.mjs compatibility/luna-ios-text-receipt-20260907.test.mjs compatibility/luna-ios-text-receipt-references-20260907.test.mjs src/luna-ios-text-receipt-independent.test.mjs src/exporters/*.test.mjs`

Log: `/tmp/canvas-ios-text-receipt-focused-20260907.log`. Exit `0`; `1,168` passed, `0`
failed, `0` cancelled, `0` skipped; wrapper duration `28,192 ms` (Node-reported duration
`28,132.853916 ms`). The selected receipt tests use injected command adapters only; no `xcrun`,
`simctl`, build, install, capture, or reference-generation process was invoked. The retained
run-01 evidence remains historical at `30/30` mismatches.

Final combined HEAD is `f8c2ac97d97a3c496ec4da8f14b8815802b8ad82`; `git diff --check` passes and
the only untracked path is the preserved `canvas/compatibility/mobile-fixtures/swiftui/.build/`.
No capability or gate change occurred.

## Broad non-native regression baseline

At combined HEAD `35175c7813530635b703564287f0211ca5657706`, the requested source/exporter/Yjs
selection was run from `canvas`:

`node scripts/test.mjs src/*.test.mjs src/exporters/*.test.mjs collaboration/pen-yjs-model.test.mjs`

Log: `/tmp/canvas-source-exporter-yjs-20260907.log`. Exit `0`; `1,733` passed, `0` failed,
`0` cancelled, `0` skipped; runner duration `43,501 ms` (Node-reported test duration
`43,442.259833 ms`).

The compatibility selection was discovered with
`rg --files compatibility -g '*.test.mjs' | rg -v '(^|/)mobile-export-compilation.test.mjs$' | sort`.
It selected `34` files from `35` total, excluding only `mobile-export-compilation.test.mjs`.
The corrected file-only invocation was:

`node scripts/test.mjs <the 34 files emitted by the recorded rg discovery>`

Log: `/tmp/canvas-compatibility-no-mobile-export-compilation-20260907-corrected.log`. Exit `0`;
`164` passed, `0` failed, `0` cancelled, `0` skipped; runner duration `30,724 ms` (Node-reported
test duration `30,648.927 ms`). The excluded native-compilation test was not selected and no
native/compiler process was active during final verification.

An initial shell scalar-argument attempt is retained separately at
`/tmp/canvas-compatibility-no-mobile-export-compilation-20260907.log`; it exited `1` before
loading tests with `CANVAS_TEST_FILE_INVALID`/`ENAMETOOLONG`. It was a command-construction
failure, not a test result; the corrected array invocation above is the compatibility result.

## Full npm test baseline

The single full-suite run was started at combined HEAD
`7571764f6b75c5eff95d0cff6cf1498578cee897` after verifying that the only untracked path was the
preserved `canvas/compatibility/mobile-fixtures/swiftui/.build/` directory:

`npm test`

Log: `/tmp/canvas-full-npm-test-20260907.log`. Exit `0`; `1,899` passed, `0` failed,
`0` cancelled, `0` skipped; wrapper duration `144,994 ms` (Node-reported test duration
`144,694.528583 ms`). The package's strict runner selected source, exporter, all compatibility,
and Yjs test files, including the normal mobile compile gates. Swift test exited `0` in
`23,869 ms`, Swift build exited `0` in `1,294 ms`, and the bounded Android command
`./gradlew --no-daemon --max-workers 2 :app:assembleDebug` exited `0` in `79,138 ms`.

The post-run process check found no `xcodebuild`, `swiftc`, Gradle, `npm test`, or test-runner
process. No source failure, capability edit, Dev install, live document mutation, or separate
build/install/capture was performed.

## Retained-publication and published-retention preparation

After the approved storage-transport batch, the exact preparation sequence was integrated in
the requested order. Worker-to-combined mappings are:

| Worker commit | Combined commit |
| --- | --- |
| `12f8afb8fcb047774685966e785a1e3421c8dd79` | `b2b64a9` |
| `646d27ed8cfdbdf0fe86e49a90bb37b25c26d449` | `1f7f7fd` |
| `658954521de1713277e1be315ada8ff83a3983d0` | `bdbb353` |
| `4f62344a73a7c28a9f062997be0d3130a3033b37` | `ccc8b78` |
| `3ca73cc0a24cdeaa8329851b98826ffa435f9dc0` | `c537dc0` |
| `5ec6b012a1eb9688eec32141aca57d089027929f` | `7a2b368` |
| `79ff5898f49634c29336e0fc45a0a052bd5b20c2` | `fdc68b1` |
| `2837796718e4a8b952163898b7c8f9a06197841b` | `24be01d` |
| `11b685450a0b9ba4ef290f4c20e6c01c72d9026d` | `8283f1a` |
| `5df7bcc07c40222f61ce63e7ff6170798ac4617c` | `898dd27` |

The changes are limited to retained-publication and published-retention pure helpers, tests,
research evidence, and the narrow optional retained-item reader. No public operations/writes,
native, schema, backend, or capability changes were introduced. Alias sorting and canonical
no-import semantic `imports: {}` corrections were integrated before the published-retention
composition commits.

Strict combined command:

`node --test $(rg --files canvas/src -g 'library-*.test.mjs' | sort) canvas/src/canvas-imports.test.mjs canvas/src/canvas-resolver.test.mjs canvas/src/canvas-schema.test.mjs canvas/src/canvas-api.test.mjs canvas/src/luna-library-storage-protocol.test.mjs`

Exit `0`; `161` passed, `0` failed, `0` cancelled, `0` skipped; duration `459.504042 ms`.
This covered library imports, resolver/schema/API, publication head/service, retained-publication
and published-retention composition, storage/retention/materializer/loader, and the real storage
protocol. No native test or build ran.

## Published-retention storage and publication-head transport

The next approved seam batch was applied after the preceding preparation batch, in exact order:

| Worker commit | Combined commit |
| --- | --- |
| `9594dcb103050bb812a9ccf0874aae819a83624e` | `9225f6b8e805ace1b73e68d01d7bc0b26b9136f3` |
| `6f24b2708247551556af06a2fc573466c1982598` | `85e67c626f07d731653a963552e90afaa3fa0dec` |
| `a228b9ebd7014710c2eaaebdc27274759a8de793` | `559ea97c84798b5535edb7d343a274db791409f2` |
| `8e21e83f7ae7cc85286eaafe87fda410c655fe4b` | `967b5e25afbe2aaaab3668fd365655648ab6990a` |
| `e57b2914dbb89331ba00385b3b5ef10c99c12ddc` | `4d93bff5f88d2768b55b83c989248304e20b3215` |
| `233ba52e9582aeec13103c7b1c7847f1ccfb092b` | `e82fdab7fa106790a406c6b303ba77b12ede9a03` |

Scope inspection found only the reviewed `library-storage.mjs` and
`library-publication-head.mjs` source seams, their focused tests, and research evidence. The
batch adds published-retention storage acceptance and forwards optional retained transport from
publication heads. It adds no public registration, operations workflow, native/device work,
backend, manifest, capability, or protected-file changes. The separately reviewed root publish
workflow `4969724` was not integrated.

Strict integrated command (log: `/tmp/luna-library-seam-20260907.log`):

`node --test $(rg --files canvas/src -g 'library-*.test.mjs' | sort) canvas/src/canvas-imports.test.mjs canvas/src/canvas-resolver.test.mjs canvas/src/canvas-schema.test.mjs canvas/src/canvas-api.test.mjs canvas/src/luna-library-storage-protocol.test.mjs`

Exit `0`; `169` passed, `0` failed, `0` cancelled, `0` skipped; duration `517.640958 ms`.
This covered library/head/storage/retention/materializer/loader, import/resolver/schema/API,
published-retention composition, and the real storage protocol tests. No native action ran.

## PDF ExtGState key-boundary and clause-index integration

After the accepted public-operation work, the approved PDF sequence was integrated in exact
order. Worker-to-combined mappings are:

| Worker commit | Combined commit |
| --- | --- |
| `b45bb2c50643532eb9b6e2f9876aaf34a3c2ff28` | `b703d2a` |
| `7abd9a6235e74825fd9a1561b01e3147a963ae42` | `a67514b` |
| `9617fe5fd15a874e7fb95544736b3cbb1bbd323b` | `f3c2f6b` |
| `744d1b32fefd8723b81f7a31e23cdbb02bd46df6` | `eeac29f` |
| `9ecacbdc02287d6b396871b31265fad70d9f597a` | `4e7a6ea` |
| `6fa323a78a10a833df269ea8ad20cc84ef44201b` | `807cd32` |
| `f46d57dfba64360adf6ffb83390cedbdfeb7977b` | `8746dde` |
| `163f95be50f7bc7ad32ea16aed0364af435df41a` | `43bd5a3` |

Scope inspection found only the reviewed excluded-feature boundary test/evidence, the narrow
`pdfx-preflight.mjs` ExtGState key allowlist, its focused boundary test/evidence, and the
clause-index evidence correction. No protected files, manifests, native sources, exporters
other than the preflight seam, or capability/gate wiring changed.

Strict PDF source/service command (log: `/tmp/luna-pdf-extgstate-integrated-20260907.log`):

`node --test canvas/src/exporters/*.test.mjs canvas/src/export-service.test.mjs`

The command completed with `1,158` tests passed, `0` failed, `0` cancelled, and `0` skipped;
logged duration was `31,682.213292 ms`. The integrated log explicitly records that ordinary
writer alpha remains valid under the new allowlist, and that the existing baseline gate remains
asserted. The conformance result remains `false` with the pre-existing uncovered/gate behavior;
this batch does not promote capability or alter the gate. No full `npm test`, native build,
device action, or capture ran.

## iOS text receipt evidence verifier integration

The approved verifier batch was cherry-picked in exact order after combined HEAD
`8ada1065cf1470540ab8052368fde0157d13702f`:

| Worker commit | Combined commit |
| --- | --- |
| `7ae9846bdaeb23972170fb23361fdc76e892441e` | `213b02420723be7b08d61ce67de68b6678a41a4f` |
| `562f2b78a4e29a5548ea8a65cf0830e2e634a594` | `3e90092c37b5c3432900fc840c48b9a00fe01546` |
| `ea7161643718b74e347e889bdb633ecdc44aca56` | `427b4062d17f7e14e33dbda8911316bdf7eb9fa5` |
| `c8863ca1ad779c8b058b96b34166e780678f695d` | `5815da03a41548f888fefa715ea4852d117271c2` |
| `f2a4a293b8830287731042b354daf2ee3cfbcd82` | `966b73222df4039be4b4cee6d5d30a530a40dbc6` |
| `8a963a57e4f3935c87c1d7a3eab783d9d22446ff` | `c180d90eb961a104b0e271ce6bbdc951ff047fff` |

Scope was limited to the new evidence verifier, its independent review evidence, lifecycle
reconciliation/clarification, and portability corrections. No production, native, capability,
gate, protected, or reference-generation changes were included.

The strict file-only validation ran once with no environment overrides:

`node scripts/test.mjs src/luna-ios-text-receipt-evidence-independent.test.mjs src/luna-ios-text-receipt-independent.test.mjs compatibility/luna-ios-text-receipt-20260907.test.mjs compatibility/luna-ios-text-receipt-references-20260907.test.mjs src/exporters/*.test.mjs`

Log: `/tmp/canvas-ios-text-receipt-evidence-focused-20260907.log`. Exit `0`; `1,173` passed,
`0` failed, `0` cancelled, `0` skipped; wrapper duration `30,062 ms` (Node-reported duration
`30,007.214542 ms`). Tests read the ordinary combined-worktree evidence and harness paths; no
environment overrides, native command, device action, or reference regeneration was used.
The retained raw run-01 corpus remains unchanged at `30/30` mismatches.

Final combined HEAD is `c180d90eb961a104b0e271ce6bbdc951ff047fff`; `git diff --check` passes and
the only untracked path remains the preserved `canvas/compatibility/mobile-fixtures/swiftui/.build/`.

## PDF decoded content-resource name integration

The approved narrow PDF batch was cherry-picked in exact order after combined HEAD
`86a351f1d5cd648801c522a1ea922cdfb0f715df`:

| Worker commit | Combined commit |
| --- | --- |
| `4ec701907308774af543122370d0b2499b3bfe7d` | `51d52f12076fdf43936aae0bd3ba0f6f38d77018` |
| `0ca09dcbe5c871055097dcb674f7bd07578c7759` | `2b3e3fb8edfdb91d4bb30f18eec99a99df6d1aa1` |
| `57c11908704f8215079bc48bcc05c953ddb1d08b` | `5baced319adfd92776a5ecdcbd0a1cc735829262` |

Scope was limited to the decoded content-resource-name helper, its focused test, and research
evidence, with the narrow `pdfx-fonts.mjs`/`pdfx-preflight.mjs` integration. No independent bug
reproduction commits, native/build, capability, profile-gate, or protected-file changes were
included. The lowercase pdf-lib object-escape parser limitation remains separate and was not
changed.

Strict focused command (log: `/tmp/canvas-pdf-resource-name-focused-20260907.log`):

`node scripts/test.mjs src/exporters/pdf-resource-name.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-fonts.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdf-serialization-envelope.test.mjs src/exporters/luna-pdf-envelope-independent.test.mjs src/export-service.test.mjs`

Exit `0`; `107` passed, `0` failed, `0` cancelled, `0` skipped; wrapper duration `4,829 ms`
(Node-reported duration `4,779.633041 ms`). Clean writer/profile behavior remains covered by
the selected tests; no native process was active. Historical iOS text evidence remains
unchanged at `30/30` mismatches.

Final combined HEAD is `5baced319adfd92776a5ecdcbd0a1cc735829262`; `git diff --check` passes and
only the preserved `canvas/compatibility/mobile-fixtures/swiftui/.build/` is untracked.

## iOS text receipt offline diagnostic integration

The approved diagnostic-only iOS batch was cherry-picked in exact order after combined HEAD
`c3699614dbd69bc127154328ed123bd068585b2f`:

| Worker commit | Combined commit |
| --- | --- |
| `d1a700cd4020ee5bf369e37eb4849a291de60d47` | `389756dba5afcf7e4930ef0442dca12a3685269d` |
| `df88bf07143d509d00feb738518655d346143bde` | `f6c93b92c3b2be61e6ac297aa3a8a533fb5c5bac` |
| `f2b5dba54bcb4ed46743c0bd71587aad6ac3cbc4` | `de6ff2baf5441c9c17e96e40897236d27423331e` |
| `1cedc3bc2105331244039323e0a846f95245775b` | `d4d68b5667d7261819c9799fedfb829bed3cba42` |

Pre-pick full-stat inspection confirmed that d1 added only the new offline diagnostic script and
compatibility test, df added only the retained offline-diagnostic research tree, f2 narrowed only
that script/test, and 1ced corrected only that diagnostic evidence. No protected, production,
emitter, vendor, manifest, capability, or native paths were changed; no patch-equivalent was
skipped. The unrelated `3967d70` raw rewrite was not picked.

The device-free focused command ran once with default retained paths and no environment overrides:

`node scripts/test.mjs compatibility/luna-ios-text-receipt-offline-diagnostic-20260907.test.mjs src/luna-ios-text-receipt-evidence-independent.test.mjs src/luna-ios-text-receipt-independent.test.mjs compatibility/luna-ios-text-receipt-20260907.test.mjs compatibility/luna-ios-text-receipt-references-20260907.test.mjs`

Log: `/tmp/canvas-ios-text-offline-diagnostic-focused-20260907.log`. Exit `0`; `26` passed,
`0` failed, `0` cancelled, `0` skipped; Node-reported duration `65,538.651625 ms`. The tests
recomputed the retained 30-entry diagnostic in a temporary output directory and read the ordinary
combined-worktree retained run-01/reference paths; no retained artifact was regenerated. The
retained native corpus remains unchanged at `30/30` mismatches. No native/device process was
active before or after the run.

Final combined HEAD before evidence recording is
`d4d68b5667d7261819c9799fedfb829bed3cba42`. `git diff --check` passes; the only untracked path
remains the preserved `canvas/compatibility/mobile-fixtures/swiftui/.build/`.

## PDF lowercase name-escape boundary integration

The approved narrow PDF batch was cherry-picked in exact order after combined HEAD
`94a05c9b18aab8d1d57cb91f0c5fff44ec5a498c`:

| Worker commit | Combined commit |
| --- | --- |
| `f9255ef73af844519a5a495a89237f52352792db` | `f6fe970` |
| `e75e67ba0b5ef21ad068954aa18a0f491fab6885` | `f11f907` |
| `01c20830a3da3e103b665912e65ca9dc40c9a796` | `5198d3c` |

Full-stat and diff inspection showed the reviewed one-line envelope guard, five-test boundary
coverage plus one existing expectation update, and one new research report. No protected,
production-outside-the-envelope, capability, gate, native, or vendor paths changed. The
lowercase pdf-lib escape limitation remains classified as `OUTSIDE_SUBSET`; the conformance
result remains `false` and no gate was unlocked. No independent bug-reproduction commits were
picked.

The strict focused selection ran after all three commits:

`node scripts/test.mjs src/exporters/pdf-serialization-envelope.test.mjs src/exporters/pdf-resource-name-parser-boundary.test.mjs src/exporters/pdf-resource-name.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-fonts.test.mjs src/exporters/pdfx-content-matrix.test.mjs src/exporters/pdfx-serialization-boundary.test.mjs src/export-service.test.mjs`

Log: `/tmp/canvas-pdf-lowercase-name-boundary-focused-20260907.log`. Exit `0`; `107` passed,
`0` failed, `0` cancelled, `0` skipped; Node-reported duration `5,015.319583 ms` (`/usr/bin/time`
real `5.06 s`). The canonical candidate remains zero-issue at the envelope boundary while a
lowercase escaped raw name is rejected with the reviewed outside-subset diagnostic. No reference
regeneration, native build, device action, Dev app test, or capability change ran.

Final combined source/test/evidence integration HEAD is `5198d3c`; a separate evidence-only
commit follows this section.

## PDF lowercase name-escape postfix independent integration

The approved independent postfix batch was cherry-picked in exact order after combined HEAD
`3b3081cdd3e3a71548b7e7d470902061571156fc`:

| Worker commit | Combined commit |
| --- | --- |
| `39de2f881d554cacbd5465396a5d5ca162e1689e` | `a5d79531d8f97d446e13637a91ea1d273d60f846` |
| `4207fdfd9f98b74e603d607106c1810a7ed8baec` | `981e958b1aeab3234592b40333b380aeefef525f` |

Full-stat and diff inspection confirmed one new independent test file followed by one new
research report. The test uses its default `import.meta.url` exporter-directory resolution;
no environment override was supplied. No source, production, gate, capability, native, or
protected files changed, and no historical pre-fix tests or patch-equivalent was picked.

The requested device-free default-path selection ran once:

`node scripts/test.mjs src/exporters/pdf-resource-name-postfix-independent.test.mjs src/exporters/pdf-resource-name.test.mjs src/exporters/pdf-resource-name-parser-boundary.test.mjs src/exporters/pdfx-preflight.test.mjs`

Log: `/tmp/canvas-pdf-resource-name-postfix-focused-20260907.log`. Exit `0`; `67` passed,
`0` failed, `0` cancelled, `0` skipped; Node-reported duration `960.940041 ms` (`/usr/bin/time`
real `1.00 s`). The independent test verified all 56 lookup rows, 48 canonical resource-clean
rows, exact paired/single lowercase guard behavior, and shielding of supported lowercase content
and non-name bytes. No native/device action or artifact regeneration ran.

Final combined source/test/evidence integration HEAD is
`981e958b1aeab3234592b40333b380aeefef525f`; a separate evidence-only commit follows.

## PDF/X export-path matrix integration

The approved PDF envelope-wiring batch was cherry-picked in exact order after combined HEAD
`bcaaa99d57636e6cb0bcf261fe2cf6ab8e1e1139`:

| Worker commit | Combined commit |
| --- | --- |
| `2f0de9c419f4560de872e49335d3b77db791ea95` | `386719c69105548fd0a808783930f4b430812ee2` |
| `93fbf83c348f3f697b5d072559fc1e41d4641a9e` | `1237100857a4612aad04dafd525769f6b00421fe` |

Full-stat and diff inspection confirmed only the 208-line actual `exportPdf` matrix test and its
research evidence. It covers 12 candidate paths and three negative controls, while preserving the
existing closed conformance gate. No production source, native, device, capability, protected, or
gate files changed; no patch-equivalent was skipped.

The strict focused selection ran after both commits:

`node scripts/test.mjs src/exporters/luna-pdfx-export-path-matrix.test.mjs src/exporters/pdfx-preflight.test.mjs src/exporters/pdfx-fonts.test.mjs src/export-service.test.mjs`

Log: `/tmp/canvas-pdfx-export-path-matrix-focused-20260907.log`. Exit `0`; `45` passed,
`0` failed, `0` cancelled, `0` skipped; Node-reported duration `5,793.981625 ms`
(`/usr/bin/time` real `5.84 s`). The 12 candidate paths continued to produce the existing
`CANVAS_PDF_PROFILE_UNVERIFIED` closed-gate result with `conformant:false`; three negative
controls remained rejected at their input-validation boundaries. No native/build/device/Dev
action or artifact regeneration ran.

Final combined source/test/evidence integration HEAD is
`1237100857a4612aad04dafd525769f6b00421fe`; a separate evidence-only commit follows.
