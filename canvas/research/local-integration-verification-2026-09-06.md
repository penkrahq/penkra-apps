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

- Pre-rounded-change combined suite: 446 passed, zero failed/cancelled/skipped, exit 0, 97752 ms; `/tmp/canvas-local-combined-suite-final-20260906.log`.
- Rounded container clipping now uses the authored independent corner geometry in SwiftUI and Compose. Actual simulator/application builds succeeded (`/tmp/canvas-rounded-clipping-swift-build-20260906.log`, `/tmp/canvas-rounded-clipping-compose-build-20260906.log`).
- Retained rounded-clipping captures cover iPhone at 3x, iPad at 2x, and Android at 420 and 320 dpi. All four were visually inspected. Pixel controls verify corner artwork is excluded only when clipping is enabled, while interior artwork remains. These are bounded geometry controls, not full renderer-difference certification. Android density was restored to its physical 420 dpi afterward.
- The four retained-capture tests and 27 exporter tests pass with zero cancellations. No capability verdict was promoted. Group clipping remains distinct from frame clipping in the Canvas renderer and is not established by these frame-only controls.
- The iPad typography baseline-offset experiment still produces the same six mismatched pixels. It is not a verified fix and is not integrated.
