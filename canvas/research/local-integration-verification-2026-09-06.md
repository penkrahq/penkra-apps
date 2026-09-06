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
