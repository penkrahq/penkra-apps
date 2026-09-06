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
