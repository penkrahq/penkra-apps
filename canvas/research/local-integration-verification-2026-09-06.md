# Local integration verification

Evidence only; the owning Canvas TODO remains the planning authority and was not edited.

The isolated combined branch starts from preserved baseline `5ea92fc` and integrates delivery `a8cf125`, migration safeguards `81416f5`, and mobile clipping fixtures `3c0dd51`. The original dirty checkout was not reset or replaced.

- Full combined suite: 440 passed, zero failed/cancelled/skipped, exit 0, 118467 ms. Log: `/tmp/canvas-local-combined-suite-20260906.log`.
- Actual Swift compilation: test 27441 ms plus bundled-font build 1697 ms, exit 0. Compose compilation also completed within the passing suite.
- Development build: exit 0. Log: `/tmp/canvas-local-combined-dev-build-20260906.log`.
- Production build: exit 1, capability-totality gate remains closed. No unverified rows were promoted by integration.
- Subsequent extraction destination preflight regression: 8 export-service tests passed, zero failed/cancelled/skipped. Occupied destinations are rejected before node resolution/rendering and existing bytes are preserved.
- Migration report filename collision preserves the pre-existing file and does not rename the source. Seven focused migration tests passed.
- Batch fixture verifies forty distinct editable PPTX artifacts after independent binding resolution and layout. Parent/child destination collisions are rejected in either order before writes; destination binding-template expansion is not supported.

Mobile clipping compilation/fixtures are integrated without a native capability promotion; structural coverage alone is not visual proof. PDF/X and library working changes have not been folded into this combined baseline merely because their focused tests passed.

## Subsequent measured checks

- Combined suite including rounded clipping: **450 passed**, zero failed/cancelled/skipped, exit 0, 113516 ms; `/tmp/canvas-rounded-combined-suite-20260906.log`. Swift test/build and Compose assembly gates actually completed.

- Pre-rounded-change combined suite: 446 passed, zero failed/cancelled/skipped, exit 0, 97752 ms; `/tmp/canvas-local-combined-suite-final-20260906.log`.
- Rounded container clipping now uses the authored independent corner geometry in SwiftUI and Compose. Actual simulator/application builds succeeded (`/tmp/canvas-rounded-clipping-swift-build-20260906.log`, `/tmp/canvas-rounded-clipping-compose-build-20260906.log`).
- Retained rounded-clipping captures cover iPhone at 3x, iPad at 2x, and Android at 420 and 320 dpi. All four were visually inspected. Pixel controls verify corner artwork is excluded only when clipping is enabled, while interior artwork remains. These are bounded geometry controls, not full renderer-difference certification. Android density was restored to its physical 420 dpi afterward.
- The four retained-capture tests and 27 exporter tests pass with zero cancellations. No capability verdict was promoted. Group clipping remains distinct from frame clipping in the Canvas renderer and is not established by these frame-only controls.
- The iPad typography baseline-offset experiment still produces the same six mismatched pixels. It is not a verified fix and is not integrated.

## PDF candidate integration and host validation

PDF candidate changes from `1090dfe` are integrated as `dd5bdf9`, retaining a closed conformance publication gate. The serializer now actually emits PDF 1.6 with valid cross-reference offsets; Info and XMP timestamps use the same second precision. A clean generated-subset result explicitly cannot authorize PDF/X publication. The configured text regression additionally checks emitted text-line operands, and missing-profile calls are diagnosed as invalid input.

- First PDF-integrated suite: 453 passed, one failed, zero cancelled/skipped, exit 1. The compatibility test still supplied no source/output profile and expected the old unconditional error. Expanding it to a configured text candidate exposed missing `TL`/`T*` subset handling; bounded operand checks and negative cases were added.
- Corrected full suite: **455 passed**, zero failed/cancelled/skipped, exit 0, 97886 ms. Log: `/tmp/canvas-pdfx-combined-corrected-suite-20260906.log`.
- Development build: exit 0, `/tmp/canvas-pdfx-combined-corrected-dev-build-20260906.log`.
- Public `penkra app test` on the combined `canvas/dist` returned `ok: true`, Canvas version `0.2.40`, all eleven operation-help entries, isolated tab ready in 520 ms, and `profileRemoved: true` at 2026-09-06T02:38:26Z. This is package/runtime validation, not installed Dev1 acceptance, installation, or publication.
- Production build remains exit 1 with 39 Swift and 37 Kotlin unverified rows; `/tmp/canvas-pdfx-combined-production-20260906.log`.
- The unchanged GRACoL2013 CRPC6 asset matches SHA-256 `4ebbfad6bc9cfc033fdafdd8ac5df8159208932cb16d9a6596d349ae7ab50443`. It is a specific printing-condition candidate, not a universally correct printer setting. No PDF/X artifact has been published.

## Default printing-condition decision

On 2026-09-06 the user selected the default/simple path rather than supplying a printer ICC profile. PDF/X-4 extraction therefore uses the already bundled GRACoL2013 CRPC6 condition automatically; no upload or subscription is required. This is a named default for premium coated paper, not a claim that all printers use that condition. The conformance publication gate remains closed independently of this choice. Ordinary PDF extraction continues to use its existing sRGB path.

## Serialized content-check hardening

Known PDF operator names now require their correct operand arity and types, using the graphics, text and marked-content definitions in the [Adobe PDF 1.6 Reference](https://opensource.adobe.com/dc-acrobat-sdk-docs/pdfstandards/pdfreference1.6.pdf). Negative fixtures cover malformed transforms, paths, colors, text arrays and marked content. Page-level checks retain state across the Contents array and reject graphics/text/marked-content underflow or unclosed blocks and missing named font, image, graphics-state or property resources. These are additional subset checks, not complete PDF/X conformance; the publication gate is unchanged.

The integrated full suite passed **461 tests**, zero failures/cancellations/skips, exit 0, in 128737 ms (`/tmp/canvas-pdf-content-checks-suite-20260906.log`). Actual Swift and Compose compilation gates completed. The default-profile extraction regression also confirms that rejection leaves no destination file.

The development build passed (`/tmp/canvas-pdf-content-checks-dev-build-20260906.log`). A subsequent transparency-group regression closes another partial-check gap: the blending profile must match the pinned sRGB source bytes and three-channel declaration, rather than merely being an ICCBased stream. The resulting focused PDF/extraction suite passed 22 tests, zero failures/cancellations/skips; the 461-test full run predates that additional regression.

Font and Separation/DeviceN colorant names are now checked as decoded UTF-8 bytes under [ISO 15930-7:2010 clause 6.6](https://previewnorm.com/iso/ISO%2015930-7-2010%20PDF.pdf). Negative serialized fixtures reject Latin-1-only, overlong and surrogate encodings; escaped valid UTF-8 is accepted. The parser normalizes original name spelling, so original-byte escaping remains explicitly uncovered. This does not open the conformance gate. The focused PDF/font/extraction run passed 29 tests with zero failures/cancellations/skips.

## Mobile alignment candidate

Authored top-level text alignment now reaches SwiftUI multiline alignment plus its authored frame anchor, and Compose TextStyle. SwiftUI justification is explicitly rejected by this candidate rather than silently becoming leading alignment. Per-paragraph overrides and justification through another native text implementation are not established here.

Actual Swift simulator build succeeded; Compose assembled in 51 seconds. Logs: `/tmp/canvas-text-alignment-swift-build-20260906.log` and `/tmp/canvas-text-alignment-compose-build-20260906.log`. Retained iPhone Large, iPad Large, and Android 420 dpi captures were visually inspected and pass bounded six-line ink-anchor checks. These do not certify full text fidelity. iPhone accessibility XXL visibly truncates this fixed-height fixture; that capture is retained as failing text-growth evidence, and XXL was restored after the Large capture. No capability row was promoted.

The alignment-integrated full suite passed **459 tests**, zero failed/cancelled/skipped, exit 0, in 147733 ms (`/tmp/canvas-alignment-combined-suite-20260906.log`). Its development build passed (`/tmp/canvas-alignment-combined-dev-build-20260906.log`). The separate libraries branch passed 452 tests but is not integrated: release persistence and compatibility remain absent from the installed API. A fresh public `documents.list --limit 500` returned 17 accessible documents (16 owner, one editor); no document content was changed or migrated by that inventory check.

## Reviewed Luna delivery and PDF integration

Delivery commits `9a6d994`, `f0751b9`, and `8a69944` were reviewed and integrated as `3818a2c`, `289e3b9`, and `b504dfd`. The independent delivery run passed 24 tests before integration and again afterward, with zero failures, cancellations, or skips. The replacement fixtures preserve original inodes by renaming originals before creating replacement entries; this removes inode-reuse nondeterminism from the tests without changing production receipt semantics. Filename validation rejects DEL, preserves explicit collision codes, and tests multibyte UTF-8 limits.

PDF commits `620ac8a`, `775fa78`, and `cd8ef6e` were reviewed and integrated as `dc11fc9`, `3db51b8`, and `9760b07`. Actual Form streams remain outside the supported subset; ordinary dictionaries cannot masquerade as image XObjects, and dangling resource references are unresolved. The independent integrated preflight/content/font/export-service run passed 42 tests with zero failures, cancellations, or skips.

At 2026-09-06T08:06Z, `node --test src/*.test.mjs src/exporters/*.test.mjs` passed **406 tests**, zero failures, cancellations, or skips, exit 0, in 13497 ms. This is the source-test subset, not the full suite: compatibility/mobile compilation and installed application QA were not run by this command. No mobile capability verdict was promoted, and the PDF/X publication gate remains closed.

Subsequent integrated delivery/PDF focused checks passed 129 tests with zero failures/cancellations/skips. The four-format batch check then passed 38 tests: it generated forty PPTX and forty HTML artifacts, while the original forty-set Swift and Kotlin templates were rejected by the unverified capability gate with no destination artifacts. Passing gate-regression tests are not successful mobile artifact generation.

Android commits `bb9b5da` and `baef1e6` were integrated as `26ac7db` and `85cebfc`. The retained native matrix has 28 passes and 20 failures across 48 measured entries; justification, explicit grid placement, and wrapping failures remain recorded. Independent focused tests passed 31/31 before and after integration. A 320-dpi contact sheet was additionally inspected by the coordinator. No native capability promotion follows from these tests.

iOS commits `04dc8df`, `0ba51fb`, and `aa1f18c` were integrated with portable evidence paths and prose assertions removed. The combined evidence/exporter tests passed 56/56, zero failures/cancellations/skips. The corrected-font-host matrix still has 36 visual mismatches; these tests verify retained evidence and bounded decorations, not full text fidelity. Pre-font-registration failures are preserved separately. Exact mobile font-catalog verification is distinct from this synthetic-style fixture.

At 2026-09-06T08:41Z, before integrating the open-vector-join renderer fix, the coordinator independently ran the vendor `bun run check` on unchanged tracked vendor source after `bunx bun@1.3.10 install --frozen-lockfile`. Package builds completed, then `lint:structure` failed with 57 errors and five warnings across 1802 files; exit 1. No tracked vendor source changed. This establishes a failing baseline quality gate, not an exemption or a passing full vendor check.

At 2026-09-06T08:52Z, exact-font-catalog evidence commits `dc87f9b` and `5ccbb11` were integrated as `e79d959` and `e542393`. Independent combined font-catalog/evidence/exporter checks passed 37 tests, zero failures/cancellations/skips, exit 0. The retained 30 native captures all remain mismatches. Missing italic faces reject explicitly, and regular bytes mislabeled as italic are rejected; neither result establishes italic fidelity. The coordinator visually compared iPad regular reference/native captures and requested deterministic line-band and runtime font metrics before any baseline-offset or typography source change.

The HTML browser corpus regeneration check independently passed, but its live runner review found mismatch exit-status and unconfirmed child-termination reporting defects. That package remains pending correction rather than integrated on the strength of the successful retained 120-entry run. Five open-path join tests also passed independently in the PDF worktree; a same-renderer cache regression and baseline vendor-unit failure classification remain under review before renderer integration.

## September 7 integrated verification

The corrected HTML browser runner and retained corpus checks have since been integrated, including bounded waits, mismatch failure status, and observed process termination. The open-vector-join renderer correction, same-renderer cache regression, and vendor baseline comparison are also integrated through `52274ed`. The vendor baseline remains failing; its comparison is not a claim of a green vendor suite.

At that integrated revision, full `npm test` completed with **616 passed, zero failed, cancelled, or skipped**, exit 0, in 154061 ms. The Swift test/build and Compose assembly gates actually completed. On September 7 at approximately 06:47 UTC, `npm run build:dev` exited 0. `npm run build` exited 1 with `CANVAS_CAPABILITY_INCOMPLETE`: 39 Swift and 37 Kotlin rows remain unverified. These results do not establish mobile visual fidelity, PDF/X conformance, installed Dev1 acceptance, or publication.

The full run above predates the subsequent iOS numeric-metrics evidence integration (`a735199`, `f0d7b5d`, `dd89a88`, `90a1742`). That package recomputes retained PNG hashes, ink histograms and bounds for all thirty exact-catalog pairs and regenerates twelve Canvas text layouts. Its retained visual mismatches remain mismatches; no baseline offset, Dynamic Type policy, or capability verdict changed.

The integrated metrics, evidence, mobile-font and exporter focused command then passed **41 tests**, zero failures/cancellations/skips, exit 0, in 8791 ms. This command recomputed the retained numeric image measurements rather than merely trusting reported pass/fail fields.

Compose justification commits `ad79cac`, `061fb9d`, and `cc8184d` were integrated as `54c3a6f`, `a706334`, and `5c8dfdf`. The Row/Column arrangement correction retains 96 measured passes across twenty-four fixtures and four density/font-scale combinations. The independent integrated matrix/exporter command passed **35 tests**, zero failures/cancellations/skips, exit 0, in 25136 ms. It verifies retained artifact hashes, recomputes absolute bounds and interior pixels, and rejects a twelve-pixel shifted group. Default measurement is now read-only; explicit capture commands alone write evidence. The coordinator additionally inspected the horizontal end-aligned, asymmetric-padding, 320-dpi, font-scale-two native capture. No broad layout capability promotion follows.

The serialized font matrix and its review corrections were integrated through `c7d2a8a`. The corrected cases use distinct embedded Regular/Bold font resources, exercise graphics-state restoration, retain all 39-by-two case identities, and separate explicit evidence generation from default read-only verification. The independent combined font/preflight/content/serialized-corpus command passed **176 tests**, zero failures/cancellations/skips, exit 0, in 8888 ms. Historical evidence is preserved beside the corrected corpus. PDF/X publication remains closed.

After those integrations, the development build exited 0 and public `penkra app test` returned `ok: true` for `com.penkra.canvas` version `0.2.40` at 2026-09-07T07:00:35Z. All eleven operation-help entries were present; the isolated tab became ready in 543 ms, and `profileRemoved` was true. No installation, version bump, registry publication, or installed Dev1 acceptance is implied by that package validation.

The subsequent full `npm test` on this combined revision **failed**: 714 tests, 713 passed, zero reported failed, one cancelled, zero skipped, exit **1**, in 343600 ms. Swift test and build completed (117496 ms and 3541 ms); Compose timed out at 180000 ms during native-library stripping and exited 143 after abort. The strict wrapper correctly converted cancellation into a failing process status. This result supersedes the earlier 616-test green run for the newer integrated revision; focused passes do not turn it into a passing full run.

At approximately 07:10 UTC, `df -h /private/var` reported only 504 MiB available on the data volume. This is an observed resource constraint, not proof of the timeout's cause. New heavy worker runs were paused. The coordinator removed only the regenerable `combined/canvas/vendor/open-pencil/source/node_modules` installed for the completed vendor baseline check, after confirming no tracked files or matching active compiler command. A Finder-created `.DS_Store` initially prevented removal of the final empty directories; that exact file and directories were then removed. Dependencies can be restored from the pinned lockfile. Source, captures, reports, and the existing untracked Swift `.build` directory were preserved. A subsequent disk check reported 7.2 GiB available; not all of that change is attributed to this one removal. Heavy compiler work was then serialized for a focused Compose retry.

The coordinator initially passed a Node name-filter flag to `scripts/test.mjs`, which accepts filenames only. That incorrect invocation started an extra Node child with the flag treated as a filename. After verifying its PID, parent, process group and command, the coordinator terminated only that child (PID 14069); the wrapper then exited 1. This attempt reported one pass, one failure, and one cancellation. Its Gradle log reached `BUILD SUCCESSFUL in 2m 41s`, but the Compose test still timed out before clean process completion, so this is not a passing compile gate. A new guard rejects flag-shaped filenames with `CANVAS_TEST_ARGUMENT_INVALID` before executing fixtures. All five runner regressions pass, including a sentinel proving the rejected invocation never executes its fixture. The correctly filtered follow-up uses Node's own CLI, not flags passed to the strict wrapper.
