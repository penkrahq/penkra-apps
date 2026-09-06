# Luna four-format batch verification — 2026-09-06

Evidence only. No exporter, service, runtime, manifest, operations, protected, device, or native
compiler files were edited.

## Commands and commits

- Starting state: branch `codex/canvas-luna-delivery-20260906`, clean at
  `6ef07c0991a255bfd8da7d779f3a1cd43b680cd5`.
- Source fix commit: `18440bf` — missing `output` guards now set
  `CANVAS_EXPORT_OUTPUT_NAME` while retaining the existing rejection/message and public shape.
- Prior resolver matrix after the source fix: 7 passed, 0 failed/cancelled/skipped, exit 0.
- Final command:
  `node --test src/export-delivery.test.mjs src/export-delivery-contract-matrix.test.mjs src/export-four-format-batch.test.mjs src/export-bundle.test.mjs src/export-service.test.mjs src/export-publication-matrix.test.mjs`
  — exit 0; 38 passed, 0 failed/cancelled/skipped, 4.87 seconds.
- Final log: `/tmp/canvas-luna-four-format-batch-final-20260906.log`.
- `git diff --check` — exit 0 before test/evidence commit.

## Four-format result

- PPTX/deck/slide: 40 top-level `.pptx` artifacts generated in an owned temporary parent. Each
  was parsed through the existing OOXML helpers; `School 1` through `School 40` text remained
  editable DrawingML, no binding placeholders or `<p:pic>` replacement occurred, marker geometry
  was present, and all 40 marker positions were distinct.
- HTML/web/route: 40 top-level bundle directories generated with explicit `School N` names.
  Each `slide.html` contains its distinct school text, resolved authored text width
  `100 + index`, marker `20×20` geometry, and no binding placeholders.
- Swift/mobile/ios: 40-set exact template remains blocked before publication by
  `CANVAS_CAPABILITY_UNVERIFIED`; observed rows are `root.axes` and `properties.layout`. The
  named gate regression confirms the destination parent is absent and no artifacts exist.
- Kotlin/mobile/android: 40-set exact template remains blocked before publication by
  `CANVAS_CAPABILITY_UNVERIFIED`; observed rows are `root.axes` and `properties.layout`. The
  named gate regression confirms the destination parent is absent and no artifacts exist.

Actual artifact outcome: **80 generated, 80 capability-blocked/unrun**, with 80 distinct generated
top-level artifacts and no mobile destination artifacts. Mobile artifact acceptance remains blocked;
no capability override or verification-only bypass was used.

## Contract coverage

The prior resolver matrix now covers undefined, null, and numeric missing-output values with
`CANVAS_EXPORT_OUTPUT_NAME`, plus all prior literal-path, four mapping, path, control, reserved,
Unicode boundary, collision, frozen-input, traversal, and no-mutation cases. The four-format test
also runs one missing-frame collision-preflight case per format; every case returns
`CANVAS_EXPORT_COLLISION` before rendering and leaves its destination parent absent.

The exact forty-set template was preserved: module/role pairs are deck/slide, web/route,
mobile/ios, and mobile/android; dimensions are 800×450; layout is horizontal with gap 10; text is
`schoolName` with bound width `cardWidth`; marker is 20×20. No exporter defect was diagnosed because
mobile emission did not begin past the production capability gate. No device settings changed.
