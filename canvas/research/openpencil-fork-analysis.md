# OpenPencil fork and engine-ownership analysis

**Research date:** 2026-09-04  
**Local subject:** Canvas's vendored OpenPencil engine at commit `4a5e7d557064d941fbac88bd492586db5257ff5f`, built into a 96,164-line `engine.mjs`, with 46 locally described modifications and 13 exports.  
**Upstream comparison point:** `open-pencil/open-pencil` `master` at `cb7ceea61ab1a419374f9af9bde05d033be0881f` (2026-09-03).

This document describes mechanics, architecture, and measurable maintenance surfaces. It does not choose an ownership model.

## 1. Verified local state

Canvas's own [`vendor/open-pencil/README.md`](../penkra-apps/canvas/vendor/open-pencil/README.md) and [`PROVENANCE.json`](../penkra-apps/canvas/vendor/open-pencil/PROVENANCE.json) establish:

* source repository: [open-pencil/open-pencil](https://github.com/open-pencil/open-pencil);
* pinned source commit: `4a5e7d557064d941fbac88bd492586db5257ff5f` (upstream date 2026-08-07, seven commits before the `v0.14.0` tag);
* generated artifact: [`engine.mjs`](../penkra-apps/canvas/vendor/open-pencil/engine.mjs), **96,164 lines**;
* build: Bun tree-shaking of a custom `entry.ts`, browser ESM, with `vue` and `canvaskit-wasm` external;
* local patch count: **46** entries in `localPatches`;
* public seam: **13 symbols** — `computeBounds`, `computeAllLayouts`, `computeDescendantVisualBounds`, `createDefaultEditorState`, `createEditor`, `fontManager`, `getCanvasKit`, `parsePenFile`, `provideEditor`, `SkiaRenderer`, `useCanvas`, `useCanvasInput`, `useTextEdit`;
* explicit dependency exclusion: `expr-eval`;
* copied assets: five Inter font files;
* regeneration procedure: checkout pin, install frozen lockfile, build six packages, build custom entry, copy artifact/assets, reapply patches, update SHA-256, verify exclusions.

The provenance file records *descriptions* of the 46 changes, not source-level unified diff hunks. The changes are embedded in the generated artifact. Therefore Git cannot perform source-aware three-way merges on those modifications, attribute them to original source files/functions, or independently reapply/test each patch.

### Patch domains

The 46 descriptions cross at least these engine concerns:

| Domain | Examples recorded locally |
|---|---|
| Parser/file compatibility | Pencil path viewBox mapping, color alpha, sizing fallbacks, fill-less frames, `.pen` gradients, unsupported node/fill behavior, already-parsed input. |
| Security/runtime | Kiwi interpreter without dynamic `Function`/`unsafe-eval`; bounded WebGL shader runtime. |
| Layout | padding shorthands, text growth, optional post-font layout, layout stroke borders, auto-width text, instance growth, deletion relayout. |
| Rendering | culling, backing-picture behavior, gradients, icons, multi-strokes, blends, shader fills, mesh gradients, notes, gradient strokes, line geometry. |
| Text/fonts | host font manager, persistent face cache, document fonts, overridden-text metric invalidation, exact-font reveal, hidden edit input. |
| Components/instances | library components, override identity/addressing, semantic-icon regeneration, instance sizing. |
| Interaction | hierarchical hit testing, transparent-frame hits, entered-container promotion. |
| Instrumentation/headless | lifecycle timing, renderer/bounds exports, screenshots. |
| Integration seam | public-package subpaths, shared editor/CanvasKit singleton, default editor state. |

This is “invasive” in the literal change-coupling sense: it is not a set of leaf-level branding edits. It changes model import, layout, text measurement, font loading, renderer semantics, hit testing, security policy, instance identity, and the exported API.

## 2. OpenPencil repository, package layout, license, and activity

### License

OpenPencil is **MIT licensed**. The root and package manifests declare MIT, and the repository contains the MIT license text ([license](https://github.com/open-pencil/open-pencil/blob/master/LICENSE), [root manifest](https://github.com/open-pencil/open-pencil/blob/master/package.json)). MIT permits use, copying, modification, merging, publishing, distribution, sublicensing, and sale subject to retaining copyright/license notices.

### Version and activity snapshot

* The tagged package release inspected is **v0.14.0**, tag commit `c29654cd07ac46b53e76c16b18505919f16571be` dated 2026-08-11. The root and workspace package manifests for `scene-graph`, `fig`, `kiwi`, `pen`, `core`, and `vue` declare `0.14.0` at the researched head.
* Upstream head inspected: `cb7ceea61ab1a419374f9af9bde05d033be0881f`, dated 2026-09-03.
* From Canvas's 2026-08-07 pin to that head: **372 commits** total and **133 first-parent commits**.
* Diff from pin to head across the whole repository: **2,189 files changed, 89,100 insertions, 41,288 deletions**. This includes generated/docs/localization/assets and is a repository-churn measure, not all engine code.
* Relevant package diffs over the same interval: `scene-graph` 24 files (+1,490/−215); `core` 224 (+11,788/−1,935); `vue` 276 (+8,204/−2,444); `fig` 37 (+1,718/−281); `kiwi` 16 (+851/−383); `pen` 1 (+2/−2).

These counts were computed from the two exact Git commits. They establish a high current integration velocity; they do not predict future velocity. The public changelog and repository history corroborate frequent package, renderer, text, file-format, and performance work ([changelog](https://github.com/open-pencil/open-pencil/blob/master/CHANGELOG.md), [repository history](https://github.com/open-pencil/open-pencil/commits/master/)).

### Package layout and ownership boundaries

The repository is a Bun workspace. The project's own architecture guide describes these packages ([`AGENTS.md`](https://github.com/open-pencil/open-pencil/blob/master/AGENTS.md)):

| Package | Responsibility | Dependency boundary |
|---|---|---|
| `@open-pencil/scene-graph` | Framework-neutral `SceneGraph`, `SceneNode` types/primitives, parent/child operations, hit testing, copy/snap/undo, variables, components/instances, vector-network types. | Does not depend on Vue, CanvasKit, or Yoga. Current storage is `Map<string, SceneNode>` plus child ids/indices and caches. |
| `@open-pencil/kiwi` | Pure Kiwi schema/runtime/protocol and low-level Figma container/codec/GUID/parse helpers. | SceneGraph-agnostic. |
| `@open-pencil/fig` | `.fig` archive/parser, `NodeChange` ↔ SceneGraph conversion, raw metadata policy, component/instance interpretation. | Peers on `scene-graph` and `kiwi`; format adapter, not renderer. |
| `@open-pencil/pen` | Pencil.dev `.pen` document model/parser and SceneGraph import adapter. | Peers on `scene-graph`; format adapter. |
| `@open-pencil/core` | Layout, CanvasKit renderer, text/fonts, editor core, Figma API, tools, clipboard, vector conversion, IO orchestration, exports. | Depends on scene graph and format packages; deliberately avoids browser-DOM coupling in core. |
| `@open-pencil/vue` | Headless Vue 3 SDK: renderless components/composables for editor shells and embedded surfaces. | Peers on `core`, Vue, and CanvasKit; UI integration layer. |

Additional current packages are `dom-css`, `cli`, `mcp`, `docs`, and `harness`; the six above are the dependency chain used by the local engine build.

## 3. OpenPencil's current engine seams

OpenPencil upstream already contains a real separation between model, format adapters, layout, renderer, editor, and Vue integration. It is not one conceptual module merely because Canvas vendors it as one physical bundle.

### Scene graph seam

`SceneGraph` is exported from `@open-pencil/scene-graph` ([source](https://github.com/open-pencil/open-pencil/blob/master/packages/scene-graph/src/index.ts)). Core operations include `getNode(id)`, `getChildren(id)`, `createNode`, `deleteNode`, `moveNode`, `updateNode`, `getAllNodes`, events via `onNodeEvents`, and mutation scopes such as `withLayoutMutations`. `SceneNode` is a format-neutral discriminated data model.

```ts
import {SceneGraph} from "@open-pencil/scene-graph";

const graph = new SceneGraph();
const page = graph.getPages()[0];
const frame = graph.createNode("FRAME", page.id, {
  name: "Card row",
  layoutMode: "HORIZONTAL",
  itemSpacing: 24,
  width: 800,
  height: 240,
});
```

### Layout seam

`@open-pencil/core/layout` exports `computeLayout(graph, frameId)` and `computeAllLayouts(graph, scopeId?)`. The implementation creates a disposable Yoga tree from `SceneNode` properties, calls `calculateLayout`, applies results back to the graph, and frees the Yoga tree ([layout source](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/layout.ts)). Text measurement is injected through `setTextMeasurer`/`getTextMeasurer`, which is the renderer-independent intrinsic-measure seam.

Current upstream uses `@open-pencil/yoga-layout@3.3.0-grid.3`; `buildGridTree` and `createGridChildNode` adapt scene grid tracks/placement to the Yoga fork ([grid adapter](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/layout/grid.ts)). This is direct prior art for evolving the scene model while keeping Yoga behind an adapter.

```ts
import {computeAllLayouts, setTextMeasurer} from "@open-pencil/core/layout";

setTextMeasurer((node, availableWidth, mode) => {
  // adapter returns intrinsic/resolved text size; renderer is not the caller
  return measureWithParagraph(node, availableWidth, mode);
});
computeAllLayouts(graph, page.id);
```

### Renderer seam

`SkiaRenderer` is a CanvasKit façade over `SceneGraph`; public methods include `renderSceneToCanvas(canvas, graph, pageId)` and editor-state rendering through the pipeline ([renderer](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/canvas/renderer.ts), [pipeline](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/canvas/renderer/pipeline.ts)). Node traversal/render dispatch lives in functions such as `renderNode`, `renderNodeSelf`, `renderShape`, `renderText`, and domain modules for fills, strokes, masks, effects, grids, and overlays ([scene renderer](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/canvas/scene.ts)).

The renderer reads resolved model/layout values; it does not define the serialized node schema. That is a usable stable seam even though `SkiaRenderer` itself remains a large stateful façade.

### Editor/UI seam

`createEditor(options)` assembles an `EditorContext`, graph, undo manager, font resolver, text editor, and domain action modules. It emits typed events such as `render:requested`; Vue subscribes through `provideEditor`, `useCanvas`, `useCanvasInput`, `useTextEdit`, and editor-event composables. Upstream explicitly uses public package/subpath exports rather than package internals ([editor factory](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/editor/create.ts), [architecture guide](https://github.com/open-pencil/open-pencil/blob/master/AGENTS.md)).

## 4. Build-artifact patches versus source fork: maintenance mechanics

### What remains identical

Both models impose these costs because local behavior differs from upstream:

* monitoring upstream changes and security/dependency updates;
* resolving semantic conflicts in parser/model/layout/render/text behavior;
* maintaining compatibility and visual-regression tests;
* validating Canvas's CSP and host integration;
* deciding when to accept, alter, or reject upstream behavior;
* retaining MIT notices and provenance;
* producing/reviewing an updated bundle and shipped assets.

A hard fork does not remove divergence. It changes where and how divergence is represented.

### Costs specific to patching the generated `engine.mjs`

| Observable property | Consequence |
|---|---|
| 46 changes live in one 96,164-line build product | A source module/function boundary is no longer the unit of review, ownership, blame, or test selection. |
| Provenance stores prose descriptions rather than source hunks | Patches cannot be automatically replayed with `git am`, `git rebase`, or a three-way merge. “Reapply” is a manual reconstruction step. |
| Bundle is tree-shaken from six packages | Small entry/export changes can alter symbol retention, ordering, and generated code around unrelated edits, increasing false textual conflicts. |
| Patched artifact is downstream of TypeScript compilation/bundling | TypeScript type checking, package-local lint rules, and source maps cannot validate edits at their natural source location unless the edit is separately recreated in a source checkout. |
| One SHA-256 covers the final output | It proves artifact identity, not which individual patch produced a behavior or whether all 46 were applied correctly. |
| No patch files beside provenance | Independent enable/disable, bisection, dependency ordering, and per-patch regression tests are not represented in version control. |
| Patch domains are cross-cutting | Regeneration must validate parser, CSP, layout, text/fonts, renderer, components, interaction, performance, and headless rendering together. |
| Upstream changed 224 core and 24 scene-graph files in 27 days after the pin | The probability of semantic overlap is nontrivial; raw line-count stability of a generated bundle does not establish compatibility. This is an inference from measured churn and patch domains. |

### Costs specific to a source-level hard fork

| Observable property | Consequence |
|---|---|
| Fork contains full upstream workspace | Repository, build tooling, package publishing or vendoring, CI, lockfiles, and dependency updates become directly owned. |
| Local changes are commits in original TypeScript/source files | Merge/rebase can identify line-level conflicts; `git blame`, `bisect`, code review, types, linting, and unit tests operate at source granularity. |
| Upstream moves quickly | Each synchronization can produce source conflicts across the measured package surface; these must still be understood and tested. |
| Public fork/package names may differ | Import maps/package aliases, notices, release versions, and artifact provenance must be maintained. Private source vendoring avoids publishing but not build ownership. |
| Local APIs can be formalized | Compatibility contracts and migrations become owned product API work rather than incidental bundle exports. |
| Source fork retains unused upstream code unless build remains tree-shaken | Source repository size and dependency graph are larger; shipped runtime can remain the same size if the final entry/build remains tree-shaken. |

### A reproducibility distinction

A responsible source fork can produce the same physical deployment form—a single tree-shaken `engine.mjs`. “Hard fork” and “ship source modules at runtime” are not the same decision. The material difference is whether divergence is maintained as source commits before compilation or as mutations after compilation.

For 46 cross-cutting changes, the minimum factual records needed for deterministic rebuilds are:

1. exact upstream commit and lockfile;
2. machine-applicable source patches or a fork commit range;
3. exact toolchain versions and build command;
4. explicit public entry/exports and externals;
5. copied asset hashes/licenses;
6. generated artifact hash;
7. tests mapped to each behavior/domain;
8. an upstream-sync log recording conflict resolutions and intentionally dropped patches.

The current local state contains items 1, 3, 4, 5 (names), and 6, plus prose for item 2. It does not store machine-applicable source hunks for item 2 in the vendored directory.

## 5. Comparable engine-layer precedents

### Excalidraw

**License:** MIT ([license](https://github.com/excalidraw/excalidraw/blob/master/LICENSE)).  
**Structure:** source-controlled packages separate the element model/geometry from the application and rendering. The canonical model is the `ExcalidrawElement` discriminated union in `@excalidraw/element`; scene data is arrays/maps of these value objects. Geometry generation is cached by `ShapeCache.generateElementShape(element, renderConfig)`, which produces Rough.js drawable shapes. Canvas rendering goes through `renderElement(…)`; SVG export uses a separate static SVG scene path ([shape cache](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/shape.ts), [render seam](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/renderElement.ts), [SVG renderer](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/renderer/staticSvgScene.ts)).

**Named seams:** `ExcalidrawElement`, `ShapeCache.generateElementShape`, `renderElement`, static SVG renderer/export functions.  
**Layout:** no general Yoga/Grid layer; bound text, frames/groups, arrows, and element geometry use application algorithms. It demonstrates model → geometry → multiple render targets, not a three-engine layout abstraction.

### tldraw

**License:** current repository uses the **tldraw license**, which permits development use/modification/bundling but forbids production use without a separate trial/commercial/alternative license; it is not MIT under the researched head ([license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md)).  
**Structure:** `@tldraw/store` is a reactive record database; `StoreSchema`/`createTLStore` define records, validation, and migrations. `Editor` owns commands, selection, tools, history, and queries. Every shape type supplies a `ShapeUtil<TLShape>`.

**Named seams:** `TLRecord`/`TLShape`, `Store`, `StoreSchema`, `createTLStore`, `Editor`, and `ShapeUtil`. Required/custom-shape methods include `getDefaultProps`, `getGeometry`, `component`, and indicator rendering/path; `getGeometry` is reused for bounds/hit testing while `component` returns the React visual ([shape documentation](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/docs/shapes.mdx), [`ShapeUtil`](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/editor/shapes/ShapeUtil.ts), [`Store`](https://github.com/tldraw/tldraw/blob/main/packages/store/src/lib/Store.ts)).

**Layout:** no single generic layout engine seam comparable to Yoga; shape utilities/editor logic compute shape behavior. The stable extension seam is record schema + shape utility, which allows the persistent model and renderer component to evolve independently within a registered shape type.

```ts
class CardUtil extends ShapeUtil<CardShape> {
  static override type = "card";
  getDefaultProps() { return {w: 240, h: 120}; }
  getGeometry(shape: CardShape) {
    return new Rectangle2d({width: shape.props.w, height: shape.props.h, isFilled: true});
  }
  component(shape: CardShape) { return <HTMLContainer>{shape.props.title}</HTMLContainer>; }
  getIndicatorPath(shape: CardShape) {
    const p = new Path2D(); p.rect(0, 0, shape.props.w, shape.props.h); return p;
  }
}
```

### Penpot

**License:** Mozilla Public License 2.0 ([license](https://github.com/penpot/penpot/blob/develop/LICENSE)).  
**Structure:** shared Clojure/ClojureScript data definitions represent files/pages/shapes and are persisted by the backend; the frontend/editor consumes the same data-oriented model. Penpot historically rendered via SVG and now also has a Rust/Skia `render-wasm` engine. Text uses SkParagraph with paragraph-level style and styled leaves ([architecture](https://github.com/penpot/penpot-docs/blob/main/technical-guide/developer/architecture/index.md), [Skia text design](https://github.com/penpot/penpot/blob/develop/render-wasm/docs/texts.md)).

The WASM boundary is an explicit model-to-renderer seam: JavaScript initializes a shape pool and sends identity, hierarchy, geometry, paint, layout, text, and modifier data through exported functions. Named exports include `init_shapes_pool`, `use_shape`, `has_shape`, `set_parent`, `set_children`, `set_shape_selrect`, `set_shape_transform`, `set_shape_opacity`, `set_shape_hidden`, `set_layout_data`, `set_flex_layout_data`, `render`, `render_sync`, `render_sync_shape`, `render_shape_pixels`, `render_shape_pdf`, `render_shape_svg`, and `render_shape_raster` ([WASM entry](https://github.com/penpot/penpot/blob/develop/render-wasm/src/main.rs), [WASM modules](https://github.com/penpot/penpot/tree/develop/render-wasm/src/wasm)). Rust stores renderer-facing `Shape` objects in `ShapesPool` and renders the tree independently of the ClojureScript editor model.

**Named seams:** shared shape maps/schema; CLJS → WASM upload functions; Rust `ShapesPool`, `Shape`, `State`, and render/export entrypoints.  
**Layout:** Penpot owns flex/grid layout data and modifier algorithms in its model/frontend and Rust renderer. This is strong prior art for a stable serialized/upload boundary, with the factual cost that equivalent layout/model semantics exist across language/runtime boundaries.

### Motion Canvas

**License:** MIT ([license](https://github.com/motion-canvas/motion-canvas/blob/main/LICENSE)).  
**Structure:** `@motion-canvas/core` owns scenes, signals, playback, time, and the application renderer/stage; `@motion-canvas/2d` owns the 2-D scene graph and Canvas2D drawing. `Node` owns hierarchy/transforms/caching and provides `render(context)`, protected `draw(context)`, and `drawChildren(context)`. `View2D` is the root; `Scene2D.draw(context)` calls `getView().render(context)` ([repository package map](https://github.com/motion-canvas/motion-canvas), [`Node`](https://github.com/motion-canvas/motion-canvas/blob/main/packages/2d/src/lib/components/Node.ts), [`Scene2D`](https://github.com/motion-canvas/motion-canvas/blob/main/packages/2d/src/lib/scenes/Scene2D.ts)).

**Named seams:** core `Scene`/`GeneratorScene.render`, 2-D `Scene2D`, `View2D`, `Node.render`, `Node.draw`, and app `Stage.render`.  
**Layout:** `Layout` nodes project properties onto hidden DOM elements and read browser-computed Flexbox boxes; properties include `layout`, `direction`, `basis`, `wrap`, `grow`, `shrink`, size/percentages, padding/margin/gap, and alignment ([layout guide](https://github.com/motion-canvas/motion-canvas/blob/main/packages/docs/docs/getting-started/layouts.mdx), [`Layout.ts`](https://github.com/motion-canvas/motion-canvas/blob/main/packages/2d/src/lib/components/Layout.ts)). Thus model and scene scheduling are package-separated, but layout and drawing behavior remain methods/state on 2-D nodes rather than interchangeable engine interfaces.

### Rive

**License:** Rive C++ runtime is MIT ([license](https://github.com/rive-app/rive-cpp/blob/master/LICENSE)).  
**Structure:** `.riv` files deserialize into a generated `Core` object model and hierarchy under `Artboard`; `ArtboardInstance` is the runtime scene instance. Drawable components accept a renderer. Layout components/participants own Yoga nodes and apply style through layout-provider interfaces. Current source contains flex, min/max, wrapping, and grid-track/item adapters around Yoga ([runtime format/hierarchy](https://rive.app/docs/runtimes/advanced-topic/format), [layout source](https://github.com/rive-app/rive-cpp/tree/master/src/layout)).

The rendering boundary is a pure virtual C++ interface:

```cpp
class Renderer {
public:
  virtual void save() = 0;
  virtual void restore() = 0;
  virtual void transform(const Mat2D&) = 0;
  virtual void drawPath(RenderPath*, RenderPaint*) = 0;
  virtual void clipPath(RenderPath*) = 0;
  virtual void drawImage(const RenderImage*, ImageSampler, BlendMode, float opacity) = 0;
  virtual void drawImageMesh(const RenderImage*, ImageSampler,
      rcp<RenderBuffer> vertices, rcp<RenderBuffer> uv,
      rcp<RenderBuffer> indices, uint32_t vertexCount,
      uint32_t indexCount, BlendMode, float opacity) = 0;
  virtual void modulateOpacity(float) = 0;
};
```

This contract is in [`include/rive/renderer.hpp`](https://github.com/rive-app/rive-cpp/blob/master/include/rive/renderer.hpp). `Drawable::draw(Renderer*)` and `Artboard::draw(Renderer*)` traverse scene objects without knowing whether the concrete backend is Rive Renderer, Canvas2D, Skia, or another runtime backend.

**Named seams:** generated `Core`/`Component`/`Artboard` object model; `LayoutNodeProvider`, `LayoutParticipant`, Yoga style appliers; `Drawable::draw(Renderer*)`; abstract `Renderer`; `RenderPath`, `RenderPaint`, `RenderImage`, `RenderBuffer`.

## 6. Cross-project seam comparison

| Project | Canonical scene/model seam | Layout seam | Renderer seam | Model can evolve without immediate renderer rewrite? |
|---|---|---|---|---|
| OpenPencil | `SceneGraph` + `SceneNode` | `computeLayout`/`computeAllLayouts`, disposable Yoga tree, `TextMeasurer` | `SkiaRenderer.renderSceneToCanvas`; `renderNode`/domain functions | Yes, provided new node/property semantics get adapter/render handling or an explicit unsupported policy. |
| Excalidraw | `ExcalidrawElement[]` | Per-feature geometry/layout algorithms | `ShapeCache.generateElementShape` → `renderElement`; separate SVG renderer | Yes at the value-model/geometry/render-function boundaries; no generic layout engine. |
| tldraw | `Store<TLRecord>`, `StoreSchema`, `TLShape` | Shape/editor-specific | `ShapeUtil.component` plus `getGeometry`/indicator | Yes through registered record schema and shape utilities; rendering is React-oriented. |
| Penpot | Shared data-oriented shape records | Flex/grid/modifier engines in CLJS and Rust | Shape upload ABI → Rust `ShapesPool` → Skia render/export calls | Yes across the WASM upload ABI; duplicated semantic implementations raise synchronization cost. |
| Motion Canvas | Signal-backed `Node` tree / `Scene` | `Layout` ↔ browser Flexbox DOM projection | `Node.render/draw`, `Scene2D.draw`, `Stage.render` | Partly; node subclasses often own both state and draw method. |
| Rive | Generated `Core` hierarchy / `Artboard` | `LayoutNodeProvider`/`LayoutParticipant` around Yoga | `Drawable::draw(Renderer*)` and abstract `Renderer` primitives | Yes; this is the clearest backend-neutral renderer interface of the set. |

There is therefore ample prior art for the architectural pattern **model/scene graph → layout adapter → resolved scene → renderer interface**, but projects place the seam at different levels:

* data record to registered shape behavior (tldraw);
* data element to cached geometry to Canvas/SVG (Excalidraw);
* serialized/upload ABI to native render scene (Penpot);
* scene nodes to browser layout and Canvas2D methods (Motion Canvas);
* generated runtime object model to Yoga provider and abstract draw primitives (Rive);
* format-neutral SceneGraph to disposable Yoga tree and CanvasKit façade (OpenPencil).

## 7. Facts specific to Canvas's planned model changes

### Rich text

The local public seam exposes `useTextEdit` and `SkiaRenderer`, but the persisted Canvas text node currently has one uniform style. Adding marks over character ranges is a **scene-model/schema change first**. The renderer can consume normalized runs through SkParagraph; `.pen`/`.fig`/PPTX adapters then each map their native run/leaf structures. The seam precedent is OpenPencil `SceneNode` plus renderer-domain text code, Penpot styled text leaves → SkParagraph, and OOXML `a:r` runs.

### Wrap, min/max, and Grid

These are also model changes. Yoga 3.2.1 already calculates wrap/min/max; current OpenPencil upstream models those properties and maps them in `packages/core/src/layout.ts`. Grid requires either the OpenPencil Yoga fork/adapter or another grid engine. Keeping `computeAllLayouts(graph, scope?)` stable while changing the internal adapter is directly consistent with upstream's existing seam.

### Native PPTX export

Export is a new consumer of the resolved graph, not a CanvasKit renderer feature. OpenPencil current core already depends on `pptxgenjs@^4.0.1`, confirming that a document-export adapter can coexist with CanvasKit without translating the editor runtime into PowerPoint UI nodes ([core manifest](https://github.com/open-pencil/open-pencil/blob/master/packages/core/package.json)). A native export reads model semantics and resolved geometry; unsupported visual effects cross the image-fallback boundary documented in `pptx-capabilities.md`.

## 8. Ownership models as verifiable operating forms

| Form | Source of truth for local behavior | Upstream synchronization mechanism | Shipped form |
|---|---|---|---|
| Current generated-artifact patching | Patched `engine.mjs` + prose provenance | Rebuild then manually reconstruct/reapply 46 behaviors | One ESM bundle |
| Machine-applicable source patch stack | Exact upstream checkout + ordered `.patch` files | Rebase/replay patches; resolve rejected hunks | May still be one ESM bundle |
| Private hard fork | Fork branch commits in original packages | Merge/rebase/cherry-pick upstream | May still be one ESM bundle |
| Extracted independent engine | Canvas-owned scene model/layout/renderer contracts and selectively imported code | Dependency updates or explicit code ports | Canvas-owned packages/bundle |

These forms do not differ in the need to understand divergent behavior. They differ in provenance granularity, merge tooling, type/test coverage, and how much build/release infrastructure is owned.

## 9. Primary sources

* Local Canvas vendor records: [`README.md`](../penkra-apps/canvas/vendor/open-pencil/README.md), [`PROVENANCE.json`](../penkra-apps/canvas/vendor/open-pencil/PROVENANCE.json), and [`entry.ts`](../penkra-apps/canvas/vendor/open-pencil/entry.ts).
* OpenPencil: [repository](https://github.com/open-pencil/open-pencil), [MIT license](https://github.com/open-pencil/open-pencil/blob/master/LICENSE), [workspace manifest](https://github.com/open-pencil/open-pencil/blob/master/package.json), [architecture guide](https://github.com/open-pencil/open-pencil/blob/master/AGENTS.md), [`SceneGraph`](https://github.com/open-pencil/open-pencil/blob/master/packages/scene-graph/src/index.ts), [layout](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/layout.ts), [renderer](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/canvas/renderer.ts), and [editor factory](https://github.com/open-pencil/open-pencil/blob/master/packages/core/src/editor/create.ts).
* Excalidraw: [`ShapeCache`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/shape.ts), [`renderElement`](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/renderElement.ts), and [static SVG renderer](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/renderer/staticSvgScene.ts).
* tldraw: [shape architecture](https://github.com/tldraw/tldraw/blob/main/apps/docs/content/docs/shapes.mdx), [`ShapeUtil`](https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/editor/shapes/ShapeUtil.ts), [`Store`](https://github.com/tldraw/tldraw/blob/main/packages/store/src/lib/Store.ts), and [license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md).
* Penpot: [architecture](https://github.com/penpot/penpot-docs/blob/main/technical-guide/developer/architecture/index.md), [render-wasm](https://github.com/penpot/penpot/tree/develop/render-wasm), [WASM entry](https://github.com/penpot/penpot/blob/develop/render-wasm/src/main.rs), and [SkParagraph text design](https://github.com/penpot/penpot/blob/develop/render-wasm/docs/texts.md).
* Motion Canvas: [repository/package map](https://github.com/motion-canvas/motion-canvas), [`Node`](https://github.com/motion-canvas/motion-canvas/blob/main/packages/2d/src/lib/components/Node.ts), [`Layout`](https://github.com/motion-canvas/motion-canvas/blob/main/packages/2d/src/lib/components/Layout.ts), and [layout guide](https://github.com/motion-canvas/motion-canvas/blob/main/packages/docs/docs/getting-started/layouts.mdx).
* Rive: [runtime format](https://rive.app/docs/runtimes/advanced-topic/format), [`Renderer`](https://github.com/rive-app/rive-cpp/blob/master/include/rive/renderer.hpp), [`Drawable`](https://github.com/rive-app/rive-cpp/blob/master/include/rive/drawable.hpp), and [layout source](https://github.com/rive-app/rive-cpp/tree/master/src/layout).
