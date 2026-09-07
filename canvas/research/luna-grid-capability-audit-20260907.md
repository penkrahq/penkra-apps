# Grid capability audit — 2026-09-07

This is a device-free audit of the current combined mobile emitter and the retained iOS and Android grid evidence. It does not promote a capability verdict or claim broad mobile-layout conformance.

## Result

The bounded recommendation is limited to `properties.gridTemplateColumns` for finite numeric track arrays whose resolved geometry is emitted as fixed native geometry. The current mobile writer does not read or interpolate `gridTemplateColumns`: the resolver/graph supplies geometry, Swift uses a top-leading `ZStack`, and Compose keeps children in paint order and emits each child with resolved offset/size geometry. There is no native grid reflow in this path.

The recommendation does not include `properties.layout`, `gridTemplateRows`, padding, or any wider mobile capability path. The retained cases exercise those properties as fixture context only.

## Schema and resolver boundary

The public Canvas schema defines a dimension as a finite number, `fill_container`, or `fit_content`.

- Finite numeric arrays were resolved in the explicit audit probe, including the retained positive values, zero, negative, decimal, empty, and single-track arrays. The resulting child coordinates and positive sizes were finite.
- `fill_container` and `fit_content` are schema-valid values, but the current resolver/graph rejects them with `Invalid grid track ...`; they are not accepted evidence for this row.
- `1fr`, `auto`, and `minmax(...)` are not schema-valid `gridTemplateColumns` values. Although the vendored Open Pencil source has internal FR/AUTO track concepts, those are not exposed by this Canvas schema, and `minmax(...)` is not a public valid shape.

Therefore the missing schema-valid shapes for the bounded row are the two keyword forms `fill_container` and `fit_content`; they need a separately judged resolver/emission seam. CSS-like FR/AUTO/minmax forms are schema-invalid rather than untested valid shapes.

## Retained native coverage

The explicit runner verified the following retained material:

- iOS `native-run-02` contains 39 unique case/device/content-size identities: 34 measured passes and five retained `unmeasured` launch failures. `native-run-02-missing-five` contributes four corrected passes and one repeated unmeasured identity; `native-run-02-missing-one-fixed` contributes one corrected pass. Overlaying only those known correction identities produces a unique 39-entry union with 39 passes. The original five `simctl launch failed` records remain in `native-run-02`.
- The iOS fixture has 12 matrix cases plus three separate controls. It covers columns `[100,180]` and `[180,100]`, rows `[60,100]` and `[100,60]`, normal and reversed paint/source order, and sparse column-2/row-2 placement. The separate control covers four-sided padding and a final absolute overlay. The fixture has no explicit column-span or row-span fields; span coverage is absent, not inferred.
- Android has 12 production cases × density 320/420 × font scale 1/2: 48 unique measurements, all `pass`, all with positive compared samples and zero mismatched pixels. Its matrix likewise covers the two column orders, two row orders, source-order/reversed-order and sparse column-2/row-2 placement. Padding and absolute overlay are in the separate control, not the 48-case matrix.
- Android's original control at 320/font-scale 2 remains `fail` with exactly 131 mismatched pixels. The translated-y110 control is a separate diagnostic and passes with zero mismatches; it is not a replacement for the original failure.

## Source and artifact identity

The iOS generated-source receipt is `cd9f240225dde9741775febc2cd3d8f4796be683baa895619b4f385580c43b11`. The current explicit `buildGridSources()` output matched the retained receipt, and all 15 retained Swift source files matched their recorded byte counts and SHA-256 values. The retained iOS binary facts also carry the same source hash; this is a generated-source/binary receipt comparison, not a whole-file hash claim about unrelated mobile code.

For Android, the retained artifact manifest checked 286/286 files by byte count and SHA-256. The explicit current generator output for all 12 cases matched each retained `generated/exact` Kotlin source record. This validates the retained generated-source/artifact corpus; it does not constitute a new compile or a fresh device run. Temporary build-project paths in historical compiled-artifact receipts are not treated as portable source identity.

## Commands and evidence

Default integrated test, with no sibling-worktree requirement:

```text
node --test canvas/src/luna-grid-capability-audit.test.mjs
```

Result: 2 tests, 2 passed, 0 failed, 0 skipped, 0 cancelled.

The retained corpus is intentionally outside autodiscovered tests. The explicit runner requires all four roots and was run as:

```text
CANVAS_GRID_COMBINED_CANVAS_ROOT=<combined>/canvas \
CANVAS_GRID_IOS_EVIDENCE_ROOT=<combined>/canvas/research/luna-ios-grid-production-20260907 \
CANVAS_GRID_ANDROID_CANVAS_ROOT=<luna-android>/canvas \
CANVAS_GRID_ANDROID_EVIDENCE_ROOT=<luna-android>/canvas/research/luna-android-grid-production-20260907 \
node canvas/scripts/luna-grid-capability-audit.mjs
```

Result: iOS 15 source files, 36 primary entries, six correction entries, 39 unique union entries, 39 final passes; Android 286 manifest files, 48 measurements, 12 generated cases, original control `fail/131`, translated control `pass/0`.

The retained evidence roots are unchanged. No build, device, capture, regeneration, source, capability-table, or native action was performed for this audit.
