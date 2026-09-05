# Yoga and Skia Paragraph / CanvasKit capability reference

**Research date:** 2026-09-04  
**Version baseline:** released `yoga-layout` **3.2.1**; Yoga `main` at commit `48182a319d98fda6f5cdc23f15348c53580f5e90` (2026-09-01) where explicitly noted; `canvaskit-wasm` **0.42.0**; Skia `main` headers and CanvasKit bindings as of the research date.

## Part A — Yoga

### 1. What Yoga 3.2.1 is

Yoga is an embeddable C++ flexbox layout engine with C, Java/Kotlin, and JavaScript bindings. The latest published npm package remains **3.2.1**, and the upstream release page identifies 3.2.1 as the latest release ([Yoga repository/releases](https://github.com/facebook/yoga), [npm package](https://www.npmjs.com/package/yoga-layout/v/3.2.1)). Its core operation is `YGNodeCalculateLayout(node, ownerWidth, ownerHeight, ownerDirection)`; JavaScript exposes `node.calculateLayout(width, height, direction)`.

Yoga implements a deliberately bounded subset of CSS box/flex layout. It does not parse CSS, perform text shaping, paint, hit-test, or own application nodes. An application creates a parallel Yoga node tree, sets styles and optional measure/baseline callbacks, calculates layout, then reads computed boxes.

### 2. Exact released style surface: C and JavaScript names

The authoritative C declarations are in [`yoga/YGNodeStyle.h` at v3.2.1](https://github.com/facebook/yoga/blob/v3.2.1/yoga/YGNodeStyle.h); the JS wrapper type is [`javascript/src/wrapAssembly.ts` at v3.2.1](https://github.com/facebook/yoga/blob/v3.2.1/javascript/src/wrapAssembly.ts). `Get…` counterparts exist for all values unless noted.

| Property/family | C API | JavaScript API | Values / notes |
|---|---|---|---|
| `direction` | `YGNodeStyleSetDirection` | `setDirection` | `Inherit`, `LTR`, `RTL`. |
| `flex-direction` | `YGNodeStyleSetFlexDirection` | `setFlexDirection` | `Column`, `ColumnReverse`, `Row`, `RowReverse`. |
| `justify-content` | `YGNodeStyleSetJustifyContent` | `setJustifyContent` | `FlexStart`, `Center`, `FlexEnd`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly`. |
| `align-content` | `YGNodeStyleSetAlignContent` | `setAlignContent` | `Auto`, `FlexStart`, `Center`, `FlexEnd`, `Stretch`, `Baseline`, `SpaceBetween`, `SpaceAround`, `SpaceEvenly`; applicability follows Flexbox rules. |
| `align-items` | `YGNodeStyleSetAlignItems` | `setAlignItems` | Same `YGAlign` enum. |
| `align-self` | `YGNodeStyleSetAlignSelf` | `setAlignSelf` | Same `YGAlign` enum; `Auto` inherits container behavior. |
| `position` | `YGNodeStyleSetPositionType` | `setPositionType` | `Static`, `Relative`, `Absolute`. Static was added in Yoga 3.0; default behavior depends on web-default configuration. |
| offsets (`left`, `top`, `right`, `bottom`, logical `start/end`, aggregate edges) | `YGNodeStyleSetPosition`, `…Percent`, `…Auto`, keyed by `YGEdge` | `setPosition`, `setPositionPercent`, `setPositionAuto` | Point, percent, or auto values. |
| `flex-wrap` | `YGNodeStyleSetFlexWrap` | `setFlexWrap` | `NoWrap`, `Wrap`, `WrapReverse`. **Implemented.** |
| `overflow` | `YGNodeStyleSetOverflow` | `setOverflow` | `Visible`, `Hidden`, `Scroll`; Yoga computes layout/overflow state but does not clip or scroll pixels. |
| `display` | `YGNodeStyleSetDisplay` | `setDisplay` | Released 3.2.1: `Flex`, `None`, `Contents`. No released `Grid`. |
| `flex` shorthand | `YGNodeStyleSetFlex` | `setFlex` | Yoga-specific shorthand semantics documented by upstream. |
| `flex-grow` | `YGNodeStyleSetFlexGrow` | `setFlexGrow` | Float. |
| `flex-shrink` | `YGNodeStyleSetFlexShrink` | `setFlexShrink` | Float. |
| `flex-basis` | `YGNodeStyleSetFlexBasis`, `…Percent`, `…Auto` | `setFlexBasis`, `setFlexBasisPercent`, `setFlexBasisAuto` | Point, percent, auto. |
| margin | `YGNodeStyleSetMargin`, `…Percent`, `…Auto`, keyed by `YGEdge` | `setMargin`, `setMarginPercent`, `setMarginAuto` | Physical/logical/aggregate edges; auto margin supported. |
| padding | `YGNodeStyleSetPadding`, `…Percent`, keyed by `YGEdge` | `setPadding`, `setPaddingPercent` | No auto padding. |
| border width | `YGNodeStyleSetBorder`, keyed by `YGEdge` | `setBorder` | Float width only; Yoga does not paint border style/color. |
| `gap`, `row-gap`, `column-gap` | `YGNodeStyleSetGap`, `YGNodeStyleSetGapPercent`, keyed by `YGGutterAll`, `YGGutterRow`, `YGGutterColumn` | `setGap`, `setGapPercent`, keyed by `Gutter.All/Row/Column` | **Implemented.** Percentage gap support landed after initial gap support and is present in 3.2.1. |
| `box-sizing` | `YGNodeStyleSetBoxSizing` | `setBoxSizing` | `BorderBox` or `ContentBox`; 3.2.1 public API. |
| width | `YGNodeStyleSetWidth`, `…Percent`, `…Auto` | `setWidth`, `setWidthPercent`, `setWidthAuto` | Point, percent, auto. |
| height | `YGNodeStyleSetHeight`, `…Percent`, `…Auto` | `setHeight`, `setHeightPercent`, `setHeightAuto` | Point, percent, auto. |
| `min-width` | `YGNodeStyleSetMinWidth`, `…Percent` | `setMinWidth`, `setMinWidthPercent` | **Implemented.** Point or percent. |
| `min-height` | `YGNodeStyleSetMinHeight`, `…Percent` | `setMinHeight`, `setMinHeightPercent` | **Implemented.** |
| `max-width` | `YGNodeStyleSetMaxWidth`, `…Percent` | `setMaxWidth`, `setMaxWidthPercent` | **Implemented.** |
| `max-height` | `YGNodeStyleSetMaxHeight`, `…Percent` | `setMaxHeight`, `setMaxHeightPercent` | **Implemented.** |
| `aspect-ratio` | `YGNodeStyleSetAspectRatio` | `setAspectRatio` | **Implemented.** Positive width/height ratio; affects an otherwise unresolved dimension and interacts with min/max constraints. |

The JS convenience wrapper accepts points as numbers, percentages as strings such as `"50%"`, and `"auto"` where valid. C uses `YGValue` getters and separate point/percent/auto setters.

#### Post-3.2.1 API present on upstream `main`, but not in the released npm baseline

At commit `48182a3`, `YGNodeStyle.h` adds intrinsic/stretch setters for `flex-basis`, `width`, `height`, and every min/max dimension: `YGNodeStyleSet{Property}MaxContent`, `…FitContent`, and `…Stretch` (with `width`/`height` retaining `…Auto`). It also adds `YGNodeStyleSetJustifyItems`/`GetJustifyItems` and `YGNodeStyleSetJustifySelf`/`GetJustifySelf`. Grid syntax adds the setters listed in §5. These declarations are visible in the current [upstream style header](https://github.com/facebook/yoga/blob/main/yoga/YGNodeStyle.h); they are not present in the 3.2.1 header/package.

### 3. Node/configuration and measurement APIs relevant to a design engine

| Concern | C API | JS API |
|---|---|---|
| Create/free | `YGNodeNew`, `YGNodeNewWithConfig`, `YGNodeFree`, `YGNodeFreeRecursive` | `Yoga.Node.create(config?)`, `free()`, `freeRecursive()` |
| Tree | `YGNodeInsertChild`, `YGNodeRemoveChild`, `YGNodeGetChild`, `YGNodeGetChildCount` | `insertChild`, `removeChild`, `getChild`, `getChildCount` |
| Intrinsic measurement | `YGNodeSetMeasureFunc`; callback returns `YGSize` under `YGMeasureModeUndefined/Exactly/AtMost` | `setMeasureFunc((width, widthMode, height, heightMode) => ({width,height}))` |
| Baseline | `YGNodeSetBaselineFunc`, `YGNodeSetIsReferenceBaseline` | JS 3.2.1 exposes `setIsReferenceBaseline`; the bundled JS surface does not expose a general baseline callback in the same way as C |
| Dirtying | `YGNodeMarkDirty`, `YGNodeSetDirtiedFunc` | `markDirty`, `setDirtiedFunc` |
| Calculation | `YGNodeCalculateLayout` | `calculateLayout` |
| Read results | `YGNodeLayoutGetLeft/Top/Right/Bottom/Width/Height`, computed margin/padding/border, direction, overflow | `getComputedLayout`, `getComputedLeft/Top/Width/Height`, `getComputedMargin/Padding/Border` |
| Pixel rounding | `YGConfigSetPointScaleFactor` | `config.setPointScaleFactor` |
| Defaults/compatibility | `YGConfigSetUseWebDefaults`, `YGConfigSetErrata`, experimental-feature APIs | `setUseWebDefaults`, `setErrata`, `setExperimentalFeatureEnabled` |
| Containing block | `YGNodeSetAlwaysFormsContainingBlock` | `setAlwaysFormsContainingBlock` |

Example with the capabilities missing from the current Canvas model:

```ts
import Yoga from "yoga-layout";

const root = Yoga.Node.create();
root.setWidth(800);
root.setMaxHeight(600);
root.setFlexDirection(Yoga.FLEX_DIRECTION_ROW);
root.setFlexWrap(Yoga.WRAP_WRAP);
root.setGap(Yoga.GUTTER_ROW, 16);
root.setGap(Yoga.GUTTER_COLUMN, 24);

const card = Yoga.Node.create();
card.setFlexBasis("30%");
card.setMinWidth(180);
card.setMaxWidth(320);
card.setAspectRatio(4 / 3);
root.insertChild(card, 0);

const badge = Yoga.Node.create();
badge.setPositionType(Yoga.POSITION_TYPE_ABSOLUTE);
badge.setPosition(Yoga.EDGE_TOP, 8);
badge.setPosition(Yoga.EDGE_RIGHT, 8);
card.insertChild(badge, 0);

root.calculateLayout(800, 600, Yoga.DIRECTION_LTR);
console.log(card.getComputedLayout());
root.freeRecursive();
```

### 4. Direct confirmations

* `flexWrap`: **yes**, `YGNodeStyleSetFlexWrap` / JS `setFlexWrap`; no-wrap, wrap, wrap-reverse.
* `minWidth`, `maxWidth`, `minHeight`, `maxHeight`: **yes**, point and percent setters in C and JS.
* `aspectRatio`: **yes**, `YGNodeStyleSetAspectRatio` / `setAspectRatio`.
* `gap`, `rowGap`, `columnGap`: **yes**. One API is keyed by `YGGutterAll`, `YGGutterRow`, or `YGGutterColumn`; these correspond to the three properties.
* relative/absolute position: **yes**, plus static; `YGNodeStyleSetPositionType` / `setPositionType` and edge offsets.
* percentages: **yes** for flex-basis, offsets, margin, padding, gap, width/height, and min/max sizes. Yoga's percentage resolution follows its supported layout model; it is not a general CSS unit system.

### 5. Grid status — released Yoga versus current `main`

**Released Yoga 3.2.1 has no CSS Grid implementation and no grid API.** Its `YGDisplay` has `Flex`, `None`, and `Contents`; the upstream product describes itself as a flexbox engine ([v3.2.1 header](https://github.com/facebook/yoga/blob/v3.2.1/yoga/YGEnums.h), [repository](https://github.com/facebook/yoga)).

There is an important post-release qualification. On 2026-03-05, Yoga merged **“CSS Grid 1/9: Grid style types and public API”** as commit [`07524851`](https://github.com/facebook/yoga/commit/07524851f54b53af647fb3801d03a95334d6e1ee). Current `main` therefore contains:

* `Display::Grid` / `YGDisplayGrid`;
* grid item setters for column/row start/end and `span`/`auto`;
* grid container setters for explicit/auto row and column track arrays;
* track types `Auto`, `Points`, `Percent`, `Fr`, and `Minmax`;
* `justify-items` and `justify-self` additions.

That commit explicitly identifies itself as **part 1 of 9** and adds foundational types/public APIs. The actual **“CSS Grid 2/9: Grid layout algorithm”** remains a separate upstream pull request in the staged series ([Yoga pull requests](https://github.com/facebook/yoga/pulls)). Inspection of current `main` finds grid style storage but no grid track-sizing/layout implementation in `yoga/algorithm`; normal released package `yoga-layout@3.2.1` predates even the syntax. Consequently, neither 3.2.1 nor the researched `main` commit provides a production, published CSS Grid calculation path.

### 6. What a grid layer on released Yoga must do

A grid implementation above Yoga 3.2.1 cannot be expressed by setting hidden Yoga properties. It must implement the missing Grid algorithms externally and feed resolved results into Yoga or bypass Yoga for that container. At minimum it must:

1. Parse/model explicit and implicit track lists, line indices, spans, auto placement, `fr`, fixed and percentage tracks, and `minmax()`/intrinsic tracks.
2. Measure children to obtain min-content/max-content contributions. Yoga measure callbacks return sizes under constraints but do not provide the CSS Grid multi-pass contribution/track-sizing algorithm.
3. Run grid item placement, create implicit tracks, resolve spanning contributions, distribute free space/fractions, apply row/column gaps, and align the grid and items.
4. Resolve percentage tracks and cyclic intrinsic dependencies against definite/indefinite container sizes.
5. Lay out each item with its grid-area containing block, including stretch/alignment and absolute-position rules.
6. Write final child boxes either as absolute positions/sizes in a Yoga subtree or directly into the application's computed-layout cache. If children continue to use Yoga internally, calculate each child's subtree under the grid-area constraints.
7. Own invalidation/caching because changing content or one track can affect every track and spanning item.

The upstream nine-part Grid work is direct evidence of this scope: data structures/API, layout algorithm, tests, bindings, benchmarks, fixture generation, and playground support are separate workstreams ([part 1 commit](https://github.com/facebook/yoga/commit/07524851f54b53af647fb3801d03a95334d6e1ee), [open series](https://github.com/facebook/yoga/pulls)).

There is concrete downstream fork prior art. **OpenPencil currently aliases `yoga-layout` to `@open-pencil/yoga-layout@3.3.0-grid.3`** in both its root and core package manifests ([root manifest](https://github.com/open-pencil/open-pencil/blob/master/package.json), [core manifest](https://github.com/open-pencil/open-pencil/blob/master/packages/core/package.json)). npm records that fork version as published on 2026-04-13. Its core maps scene-grid tracks into Yoga, calls `setDisplay(Display.Grid)`, sets template tracks, inserts grid children, calculates the tree, and applies computed boxes through the same layout seam ([OpenPencil layout source](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/layout.ts), [grid adapter](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/layout/grid.ts)). Rive's current C++ runtime is a second downstream example: its layout layer owns Yoga nodes and grid-track adapters (`GridTrackList`, grid item placement) while keeping layout participants in the Rive scene model ([Rive layout source](https://github.com/rive-app/rive-cpp/tree/master/src/layout)). These are downstream integrations/forks, not capabilities of `yoga-layout@3.2.1`.

A separate-engine precedent is **Taffy**, whose own engine implements both Flexbox and CSS Grid and added Grid in 0.3.0; it is not a Yoga extension ([Taffy changelog](https://github.com/DioxusLabs/taffy/blob/main/CHANGELOG.md)).

## Part B — Skia Paragraph and CanvasKit

### 7. Layers and version boundary

`modules/skparagraph` is Skia's paragraph shaping/layout module. CanvasKit binds selected SkParagraph types through Emscripten. The CanvasKit quickstart states that the npm TypeScript definitions are the complete JS API reference and demonstrates multiple `TextStyle` runs using `pushStyle`, `addText`, and `pop` ([Skia CanvasKit quickstart](https://skia.org/docs/user/modules/quickstart/)).

The current published package is **`canvaskit-wasm@0.42.0`** ([npm](https://www.npmjs.com/package/canvaskit-wasm/v/0.42.0)). Its authoritative JS contract is [`modules/canvaskit/npm_build/types/index.d.ts`](https://github.com/google/skia/blob/main/modules/canvaskit/npm_build/types/index.d.ts); the implementation bridge is [`paragraph_bindings.cpp`](https://github.com/google/skia/blob/main/modules/canvaskit/paragraph_bindings.cpp). Full native APIs are declared in [`ParagraphBuilder.h`](https://github.com/google/skia/blob/main/modules/skparagraph/include/ParagraphBuilder.h), [`ParagraphStyle.h`](https://github.com/google/skia/blob/main/modules/skparagraph/include/ParagraphStyle.h), [`TextStyle.h`](https://github.com/google/skia/blob/main/modules/skparagraph/include/TextStyle.h), and [`Paragraph.h`](https://github.com/google/skia/blob/main/modules/skparagraph/include/Paragraph.h).

### 8. Builder and run model

CanvasKit exposes three factory routes:

```ts
CanvasKit.ParagraphBuilder.Make(style, fontManager)
CanvasKit.ParagraphBuilder.MakeFromFontProvider(style, fontProvider)
CanvasKit.ParagraphBuilder.MakeFromFontCollection(style, fontCollection)
```

`ParagraphBuilder` methods in 0.42.0 are:

* `addText(str)` — appends text using the top style on the stack.
* `pushStyle(textStyle)` — pushes a run style.
* `pushPaintStyle(textStyle, foregroundPaint, backgroundPaint)` — pushes a style with full `Paint` objects overriding style colors.
* `pop()` — pops one style.
* `addPlaceholder(width?, height?, alignment?, baseline?, offset?)` — inserts an inline object slot.
* `build()` — returns a `Paragraph`.
* `reset()` and `getText()`.
* Client segmentation injection: `setWordsUtf8/Utf16`, `setGraphemeBreaksUtf8/Utf16`, `setLineBreaksUtf8/Utf16`. These are relevant when the build requires client ICU (`ParagraphBuilder.RequiresClientICU()`).

Example with overlapping logical marks normalized to contiguous runs:

```ts
const ps = new CanvasKit.ParagraphStyle({
  textAlign: CanvasKit.TextAlign.Left,
  textDirection: CanvasKit.TextDirection.LTR,
  maxLines: 3,
  ellipsis: "…",
  textStyle: {fontFamilies: ["Inter"], fontSize: 32, color: CanvasKit.BLACK},
});

const b = CanvasKit.ParagraphBuilder.Make(ps, fontMgr);
b.addText("YOU RUN ");
b.pushStyle(new CanvasKit.TextStyle({
  fontFamilies: ["Inter"], fontSize: 32,
  fontStyle: {weight: CanvasKit.FontWeight.Bold},
  color: CanvasKit.Color(11, 71, 120, 1),
  letterSpacing: -0.5,
}));
b.addText("THE SCHOOL");
b.pop();
const p = b.build();
p.layout(620); // line breaking occurs here against a pixel width
canvas.drawParagraph(p, 40, 40);
```

SkParagraph stores styled blocks/runs produced by this stack. An editor's mark model can remain range-based; before building, intersect mark boundaries to produce non-overlapping spans and emit one `pushStyle/addText/pop` sequence per effective style span.

### 9. Exact CanvasKit `ParagraphStyle` properties

`canvaskit-wasm@0.42.0` exposes:

| Property | Function |
|---|---|
| `textStyle?: TextStyle` | Default run style. |
| `textAlign?: TextAlign` | `Left`, `Right`, `Center`, `Justify`, `Start`, `End`. |
| `textDirection?: TextDirection` | `LTR` or `RTL`; affects logical start/end and bidi. |
| `maxLines?: number` | Visible-line limit. |
| `ellipsis?: string` | Ellipsis string used when text exceeds the line limit/available width. |
| `heightMultiplier?: number` | Paragraph line-height multiplier. |
| `textHeightBehavior?: TextHeightBehavior` | Controls application of first-ascent/last-descent behavior. |
| `strutStyle?: StrutStyle` | Minimum/forced line metrics: families, size/style, height, leading, half-leading, force height. |
| `disableHinting?: boolean` | Disables paragraph font hinting. |
| `replaceTabCharacters?: boolean` | Replaces tabs according to SkParagraph behavior. |
| `applyRoundingHack?: boolean` | CanvasKit binding for SkParagraph compatibility rounding. |

Full native `ParagraphStyle` additionally has controls that are not all surfaced in the simple CanvasKit object, including `setFakeMissingFontStyles`, `setLetterSpacingByCSSSpec`, and `setRenderSoftHyphens` on current Skia `main` ([header](https://github.com/google/skia/blob/main/modules/skparagraph/include/ParagraphStyle.h)).

### 10. Exact CanvasKit per-run `TextStyle` properties

The 0.42.0 TypeScript interface contains exactly these fields:

| Property | Meaning |
|---|---|
| `color?: InputColor` | Simple glyph color. |
| `foregroundColor?: InputColor` | Foreground color path; `pushPaintStyle` is required for a full `Paint` shader/filter/stroke. |
| `backgroundColor?: InputColor` | Run background rectangle color; `pushPaintStyle` accepts a full background `Paint`. |
| `fontFamilies?: string[]` | Ordered fallback families. |
| `fontSize?: number` | Size in Skia layout units/pixels under the canvas transform. |
| `fontStyle?: FontStyle` | `weight`, `width`, `slant`. |
| `fontFeatures?: TextFontFeatures[]` | OpenType feature `name`/`value` pairs, e.g. `{name: "liga", value: 0}`. |
| `fontVariations?: TextFontVariations[]` | Variable-font axis `axis`/`value` pairs, e.g. `{axis: "wght", value: 650}`. |
| `letterSpacing?: number` | Added letter spacing in layout units. |
| `wordSpacing?: number` | Added spacing at words. |
| `heightMultiplier?: number` | Run line-height multiplier. |
| `halfLeading?: boolean` | Splits leading around the glyph box. |
| `locale?: string` | Locale used for shaping/fallback behavior. |
| `textBaseline?: TextBaseline` | Alphabetic or ideographic baseline selection. |
| `decoration?: number` | Bitmask: no decoration, underline, overline, line-through; constants may be combined. |
| `decorationColor?: InputColor` | Decoration color. |
| `decorationStyle?: DecorationStyle` | Solid, double, dotted, dashed, wavy. |
| `decorationThickness?: number` | Thickness multiplier. |
| `shadows?: TextShadow[]` | Each shadow contains `color`, `offset: [x,y]`, and `blurRadius`. Multiple shadows are allowed. |

Full native `TextStyle` additionally exposes `setBaselineShift`, direct `setTypeface`, `setDecorationMode`, font edging, subpixel positioning, hinting, and generalized `SkFontArguments`; these are not direct fields on the 0.42.0 JS `TextStyle` interface. CanvasKit maps `fontVariations` into native variation coordinates and provides foreground/background `Paint` only through `pushPaintStyle`. The mapping is visible in [`paragraph_bindings.cpp`](https://github.com/google/skia/blob/main/modules/canvaskit/paragraph_bindings.cpp).

### 11. Line breaking, ellipsis, alignment, direction, features, paints, shadows

* **Line breaking:** `paragraph.layout(width)` shapes and wraps against the supplied width. Hard newlines are honored; Unicode line/grapheme/word services come from the compiled Unicode backend or client-provided break arrays. `getMinIntrinsicWidth`, `getMaxIntrinsicWidth`, `getLongestLine`, and `getHeight` expose measurements.
* **Ellipsis/max lines:** `ParagraphStyle.maxLines` and `ellipsis`; `didExceedMaxLines()` reports truncation. Ellipsis is a paragraph concern, not a per-run mark.
* **Alignment/direction:** `textAlign` and `textDirection` are paragraph properties. Per-run bidi levels arise from Unicode text; CanvasKit does not expose a per-run `direction` field in `TextStyle`.
* **Decoration:** per-run decoration bitmask, style, color, and thickness are exposed.
* **Letter/word spacing:** both are per-run `TextStyle` fields.
* **Features/variations:** both are exposed per run through tag/value arrays.
* **Foreground/background:** simple run colors are exposed; arbitrary `Paint` instances use `pushPaintStyle`.
* **Shadows:** multiple per-run text shadows are exposed.

### 12. Hit testing and editor geometry in CanvasKit 0.42.0

| API | Result and editor use |
|---|---|
| `getGlyphPositionAtCoordinate(dx, dy)` | `PositionWithAffinity {pos, affinity}`; primary pointer-to-caret mapping. |
| `getClosestGlyphInfoAtCoordinate(dx, dy)` | `GlyphInfo` containing UTF-16 grapheme range, layout bounds, direction, ellipsis flag. |
| `getGlyphInfoAt(index)` | Glyph/grapheme information at a UTF-16 offset on visible lines. |
| `getLineNumberAt(index)` | Visible line containing a UTF-16 offset, or `-1`. |
| `getRectsForRange(start, end, hStyle, wStyle)` | Direction-tagged selection rectangles for `[start,end)`; height styles: `Tight`, `Max`, line-spacing middle/top/bottom, `Strut`; width styles: `Tight`, `Max`. |
| `getRectsForPlaceholders()` | Inline-object rectangles. |
| `getWordBoundary(offset)` | Word range around an offset. |
| `getLineMetrics()` / `getLineMetricsAt(line)` | UTF-16 indices, whitespace/newline ends, hard-break flag, ascent/descent/height/width/left/baseline/line number. |
| `getNumberOfLines()` | Visible line count. |
| `getShapedLines()` | Line/run/glyph information for advanced inspection. |
| `getAlphabeticBaseline()`, `getIdeographicBaseline()` | Baseline metrics. |
| `unresolvedCodepoints()` | Code points not matched by supplied fonts. |

CanvasKit indices in these editor-facing methods are documented as **UTF-16 offsets**, matching JavaScript string indexing, but a robust editor must still treat grapheme clusters as indivisible caret units. Selection rectangle direction supports mixed bidi text. The exact binding conversions and glyph-info fields are implemented in [`paragraph_bindings.cpp`](https://github.com/google/skia/blob/main/modules/canvaskit/paragraph_bindings.cpp).

Full native `Paragraph` exposes additional low-level methods not present as equivalent 0.42.0 JS methods, including mutable `updateTextAlign`, range font-size/foreground/background updates, visitor callbacks, line path extraction, glyph-cluster APIs in native indices, font-at-index queries, and a font inventory ([`Paragraph.h`](https://github.com/google/skia/blob/main/modules/skparagraph/include/Paragraph.h)). Rebuilding a paragraph after text/style edits remains the portable CanvasKit path.

### 13. Bullets and list markers

SkParagraph has **no semantic bullet/list model**: no list container, list item, marker style, numbering counter, hanging-indent object, or marker callback appears in `ParagraphBuilder`, `ParagraphStyle`, `TextStyle`, or `Paragraph`. A search of the authoritative headers and CanvasKit types yields no text-list API.

A CanvasKit editor must therefore implement list semantics above SkParagraph and render them by one of three mechanisms:

1. prepend marker text (`•`, `1.`, etc.) in dedicated styled runs and insert tabs/spaces;
2. reserve horizontal space with `addPlaceholder` and draw the marker separately; or
3. lay out marker and body as separate paragraphs/boxes.

Mechanisms 2–3 are required when the marker must hang outside the body, align independently, use a picture/icon, or maintain stable body alignment across multi-line items. Numbering and nesting belong in the document model; SkParagraph only shapes the resulting marker/body text and geometry.

### 14. CanvasKit versus full Skia: concise boundary

| Capability | Full SkParagraph | CanvasKit 0.42.0 |
|---|---|---|
| Multiple styled runs | Yes | Yes: style stack. |
| Font family/style/size/locale | Yes | Yes. |
| OpenType features | Yes | Yes. |
| Variable font axes | Yes through font arguments | Yes through `fontVariations`. |
| Baseline shift | Yes (`TextStyle::setBaselineShift`) | Not a `TextStyle` field. |
| Arbitrary run foreground/background paint | Yes | Yes through `pushPaintStyle`; simple colors through fields. |
| Decoration mode/edging/hinting/subpixel controls | Yes | Only the subset listed in JS types; paragraph-level disable hinting exists. |
| Line wrap, bidi, alignment, max lines, ellipsis | Yes | Yes. |
| Placeholders | Yes | Yes. |
| Selection/caret/word/line geometry | Yes | Core editor APIs are exposed. |
| Incremental range mutation | Native update methods exist for a limited property set | Not exposed as the normal JS editing surface; rebuild. |
| Native bullet/list semantics | No | No. |

## Primary sources

* Meta, Yoga 3.2.1: [`YGNodeStyle.h`](https://github.com/facebook/yoga/blob/v3.2.1/yoga/YGNodeStyle.h), [`YGEnums.h`](https://github.com/facebook/yoga/blob/v3.2.1/yoga/YGEnums.h), [JavaScript wrapper](https://github.com/facebook/yoga/blob/v3.2.1/javascript/src/wrapAssembly.ts), and [documentation](https://www.yogalayout.dev/).
* Meta, current Grid staging: [CSS Grid 1/9 commit](https://github.com/facebook/yoga/commit/07524851f54b53af647fb3801d03a95334d6e1ee) and [upstream pull-request list](https://github.com/facebook/yoga/pulls).
* Google Skia: [CanvasKit quickstart](https://skia.org/docs/user/modules/quickstart/), [CanvasKit TypeScript definitions](https://github.com/google/skia/blob/main/modules/canvaskit/npm_build/types/index.d.ts), [paragraph bindings](https://github.com/google/skia/blob/main/modules/canvaskit/paragraph_bindings.cpp), [`ParagraphBuilder.h`](https://github.com/google/skia/blob/main/modules/skparagraph/include/ParagraphBuilder.h), [`ParagraphStyle.h`](https://github.com/google/skia/blob/main/modules/skparagraph/include/ParagraphStyle.h), [`TextStyle.h`](https://github.com/google/skia/blob/main/modules/skparagraph/include/TextStyle.h), and [`Paragraph.h`](https://github.com/google/skia/blob/main/modules/skparagraph/include/Paragraph.h).
* DioxusLabs, [Taffy changelog](https://github.com/DioxusLabs/taffy/blob/main/CHANGELOG.md) (separate flex/grid engine, not a Yoga extension).
