# Creating and editing Canvas designs

Use `documents.execute` to inspect or change the contents of one Canvas document. It can create and
edit complete visual compositions, generate or place images, and render exact document nodes for
review. It runs one bounded JavaScript program against a private document clone and commits all
changes atomically. It does not operate the editor UI.

Keep one execution focused on one coherent design intent. A full slide, screen, component, or
focused repair can involve many nodes and still be one intent. Separate unrelated changes so each
result can be reviewed and, while it remains the document head, undone as one unit.

## Start from the document's module

Every Canvas document has a `module`, and it decides what the document is for and which deliverable
exports apply. A generic document may set a deliverable module once while it has no role-bearing
frames. The rest of this file is the same for all four;
what differs per module is which frames are export units, what sizing they need, and what structure
survives the export.

That module-specific part lives in a Skill. Load the one matching the document before doing
substantial work:

| Module | Skill | Produces |
| --- | --- | --- |
| `generic` | use `documents.extract` help | PNG, SVG, or PDF |
| `deck` | `canvas-deck` | A `.pptx` presentation |
| `web` | `canvas-web` | HTML and CSS |
| `mobile` | `canvas-mobile` | SwiftUI or Jetpack Compose source |

`documents.list` reports the module. Skip the Skill only for a change that is plainly local — fixing
a colour, correcting a typo — and load it before adding, removing, or restructuring the frames that
export.

## A productive design loop

1. Inspect the relevant frame and nearby structure before editing an existing design.
2. Decide the visual direction: hierarchy, composition, palette, typography, imagery, and repeated
   patterns.
3. Build or refine one meaningful section at a time.
4. Use `TakeScreenshot` after the change and judge the rendered result, not merely the script result.
5. Correct the underlying layout, hierarchy, sizing, or style when the review exposes a problem.

When creating multiple directions, make their concepts genuinely distinct rather than changing only
colors or spacing.

## Document structure

A document contains top-level nodes. Every node has a stable string `id` and a `type`; other
properties depend on that type. Every inserted node, including every nested child, must already
have a unique nonempty ID. Use descriptive IDs. Never invent a new ID for an existing node.

Common properties include:

| Property | Meaning |
| --- | --- |
| `id` | Stable node identity |
| `type` | Node kind |
| `name` | Human-readable layer name |
| `x`, `y` | Position in the parent when layout does not place the node |
| `width`, `height` | Numeric size or supported layout sizing value |
| `rotation` | Rotation in degrees |
| `opacity` | Opacity from `0` to `1` |
| `enabled` | Whether the node is visible and active |
| `clip` | Legacy frame input; `true` is normalized on read to `overflow: "clip"`, and `false` is omitted |
| `overflow` | Frame viewport behavior: `visible`, `clip`, `scroll-x`, `scroll-y`, or `scroll-both` |
| `flipX`, `flipY` | Horizontal or vertical reflection |
| `theme` | Existing theme override retained with the node |

Useful node types:

| Type | Use |
| --- | --- |
| `frame` | Slides, screens, sections, cards, controls, and auto-layout containers |
| `group` | A visual subtree that should move and transform together |
| `rectangle` | Panels, backgrounds, dividers, bars, and geometric accents |
| `ellipse` | Circles, rings, arcs, avatars, and radial shapes |
| `polygon` | Regular polygons and geometric marks |
| `line` | Straight rules and connectors |
| `path` | Custom vector geometry |
| `text` | Editable text |
| `icon` | Editable icons from supported libraries |
| `ref` | An instance of a reusable component |
| `note`, `context`, `prompt` | Nonvisual design context stored with the document |
| `script` | Existing generated content that should normally be preserved unchanged |

Only `frame` and `group` nodes contain visual `children`. If a rectangle and label form a button,
card, badge, or field, place both inside a frame or group. Overlapping siblings are not a real
component hierarchy and will break when the design moves, copies, or lays out.

`note`, `context`, and `prompt` nodes store a `content` string; a prompt may also retain a `model`
string. They do not render as design layers, so create them only when the user wants that context
stored with the document. A script node depends on an existing `scriptUri` resource and `inputs`;
this operation cannot create that external resource, so preserve existing script nodes rather than
inventing new ones.

Use top-level frames for slides, routes, screens, physical PDF pages, and reusable component definitions. A new document
already contains the `starterFrameId` returned by `documents.create`; update or replace that frame
for the first design instead of leaving it underneath another frame.

## Frames that export

Some top-level frames carry a `role`, and that role is what makes a frame a deliverable export unit —
a slide, route, or mobile screen. `documents.create` stamps the role on the starter frame from the module's
preset. A frame you add yourself has no role unless you set one, and `documents.export` rejects a
frame whose role does not match the export it was asked for.

Most frames have no role, and that is correct: components, scratch work, and nested structure are
not export units. Two rules apply to the ones that do:

- A role-bearing frame is a top-level sibling. It must never contain another role-bearing frame.
- A reusable component must not live inside a role-bearing frame. Keep components at the document
  root and place `ref` instances into slides, routes, and screens.

A roleless frame may declare `physical` and extract as a PDF page. That physical-page behavior is
independent of modules and deliverable roles.

The valid roles, the sizing each one needs, and how to add another are module-specific. They are in
the module's Skill.

## Layout and sizing

Frames support `layout: "horizontal"`, `layout: "vertical"`, and `layout: "none"`. A frame with no
explicit layout defaults to horizontal, so always set `layout: "none"` for free-positioned
composition. Horizontal and vertical layouts arrange their direct children with:

- `gap`: space between children;
- `padding`: one number, `[vertical, horizontal]`, or `[top, right, bottom, left]`;
- `justifyContent`: `"start"`, `"center"`, `"end"`, `"space-between"`, or `"space_around"`;
- `alignItems`: `"start"`, `"center"`, `"end"`, or `"stretch"`;
- `layoutIncludeStroke`: whether an inside stroke participates in layout sizing.

Children can use `width: "fill_container"` or `height: "fill_container"`. Containers can use
`"fit_content"`. Avoid circular sizing—for example, a fit-content parent whose only child fills
the parent on the same axis.

In an auto-layout frame, ordinary child `x` and `y` values do not control placement. Set
`layoutPosition: "absolute"` only when a child deliberately leaves layout flow, such as a badge or
decorative overlay. These values are not CSS: percentages, viewport units, `calc()`, margins,
wrapping, and baseline alignment are unavailable.

Set `overflow` on a frame to mark a scrolling region. `scroll-x`, `scroll-y`, and `scroll-both`
clip the authored viewport and expose measured content and overflow dimensions through `Get`.
Web and mobile exports preserve the direction; static extraction uses the viewport unless its
explicit `scrollContent` option is `full`.

```js
Insert("#container", {
  id: "content-row",
  type: "frame",
  name: "Content row",
  layout: "horizontal",
  width: "fill_container",
  padding: [16, 20],
  gap: 12,
  alignItems: "center",
  fill: "#FFFFFF",
  cornerRadius: 16,
  children: [
    {
      id: "row-marker-wrap",
      type: "frame",
      width: 40,
      height: 40,
      layout: "horizontal",
      justifyContent: "center",
      alignItems: "center",
      fill: "#EEF2FF",
      cornerRadius: 12,
      children: [{
        id: "row-marker",
        type: "icon",
        library: "lucide",
        icon: "sparkles",
        width: 20,
        height: 20,
        fill: "#4F46E5"
      }]
    },
    {
      id: "row-label",
      type: "text",
      content: "Section label",
      textGrowth: "fixed-width",
      width: "fill_container",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 1.25,
      fill: "#18181B"
    }
  ]
});
```

## Typography

Text must have visible `fill`. Use `fontFamily`, `fontSize`, `fontWeight`, `fontStyle`,
`letterSpacing`, `lineHeight`, `textAlign`, and `textAlignVertical` deliberately. `lineHeight` is a
multiplier such as `1.2`, not a pixel measurement.

Set `underline: true` or `strikethrough: true` for those text decorations. Prefer fonts already
used by the document when maintaining an existing design. For new work, use a real font family and
verify the screenshot; font availability and metrics can affect wrapping and layout.

Text sizing is controlled by `textGrowth`:

- `"auto"` uses intrinsic width and height, does not wrap, and ignores explicit width and height;
- `"fixed-width"` requires a width, wraps to it, and grows vertically;
- `"fixed-width-height"` requires both dimensions and does not grow vertically, so content can
  overflow.

Use fixed-width text whenever wrapping matters. In an auto-layout row or column,
`width: "fill_container"` lets fixed-width text take available width. For a single-line button
label, use intrinsic text inside a padded fit-content frame. Never simulate padding with spaces or
invisible characters.

```js
const displayText = {
  id: "display-text",
  type: "text",
  content: "Primary message",
  textGrowth: "fixed-width",
  width: 560,
  fontFamily: "Inter",
  fontSize: 52,
  fontWeight: "700",
  letterSpacing: -1.2,
  lineHeight: 1.05,
  fill: "#F8FAFC"
};
```

## Color, fills, gradients, and images

`fill` accepts a color string, an existing `$variable` reference, a structured paint, or an array
of paints. Solid colors may be written directly (`"#2563EB"`) or as
`{ type: "color", color: "#2563EB", opacity: 0.8 }`.

Use a gradient paint for smooth transitions. Stops use positions from `0` to `1`; gradient centers
and sizes use normalized coordinates.

```js
const linearGradient = {
  type: "gradient",
  gradientType: "linear",
  rotation: 135,
  colors: [
    { color: "#0F172A", position: 0 },
    { color: "#312E81", position: 0.55 },
    { color: "#7C3AED", position: 1 }
  ]
};

const radialGlow = {
  type: "gradient",
  gradientType: "radial",
  center: { x: 0.72, y: 0.22 },
  size: { width: 0.9, height: 0.9 },
  colors: [
    { color: "#A78BFAAA", position: 0 },
    { color: "#A78BFA00", position: 1 }
  ]
};
```

`gradientType` may be `"linear"`, `"radial"`, or `"angular"`. Paints also support `enabled`,
`opacity`, and `blendMode`. Preserve existing shader or mesh-gradient paints when editing content
around them; use ordinary gradients for new work unless the document already provides the advanced
resource needed by those paints.

Image fills use `{ type: "image", url, mode }`, where mode is `"fill"`, `"fit"`, `"stretch"`, or
`"tile"`. Use `G` to import or generate an image and let Canvas create the durable asset path.

## Strokes, shapes, and effects

`stroke` accepts the same color and gradient paint forms as a fill. Configure it with:

- `strokeWidth`: one number or `{ top, right, bottom, left }`;
- `strokeAlignment`: `"inner"`, `"center"`, or `"outer"`;
- `strokeLinecap`: `"round"`, `"square"`, or the default flat cap;
- `strokeLinejoin`: `"round"`, `"bevel"`, or `"miter"`;
- `strokeDashPattern`: numeric dash and gap lengths.

Rectangles and frames use `cornerRadius`, either one number or
`[topLeft, topRight, bottomRight, bottomLeft]`. Ellipses support `innerRadius` from `0` to `1`, plus
`startAngle` and `sweepAngle` in degrees. Polygons use `polygonCount`. Paths use an SVG-compatible
`geometry` string. Set `viewBox: [minX, minY, width, height]` when its source coordinates differ
from the node's rendered `width` and `height`. Use `fillRule: "evenodd"` for paths whose overlapping
subpaths should cut holes; the default is nonzero winding.

`effect` accepts one effect or an array. Use shadows, layer blur, and background blur:

```js
const glassEffects = [
  {
    type: "shadow",
    shadowType: "outer",
    color: "#0F172A24",
    offset: { x: 0, y: 12 },
    blur: 30,
    spread: -4
  },
  { type: "background_blur", radius: 18 }
]
```

Effects can also use `enabled` and `blendMode`. Prefer subtle effects that reinforce depth or focus;
do not use gradients, blur, and shadows as substitutes for hierarchy and composition.

## Icons

Use native `type: "icon"` nodes for interface and symbolic icons. They remain identifiable and
editable. Supply the exact `library` and `icon`, explicit width and height, and a visible fill.
When the identifier is not already known, use `canvas icons search` and copy a returned `library`
and `icon` pair exactly. Do not guess catalog identifiers or approximate available icons with
primitive shapes.
Supported libraries are:

- `lucide`;
- `feather`;
- `Material Symbols Outlined`;
- `Material Symbols Rounded`;
- `Material Symbols Sharp`;
- `phosphor`.

```js
const continueIcon = {
  id: "direction-icon",
  type: "icon",
  library: "Material Symbols Rounded",
  icon: "arrow_forward",
  weight: 500,
  width: 22,
  height: 22,
  fill: "#FFFFFF"
};
```

If an icon does not render, verify its exact library-specific name or choose a known equivalent
from the same library. Do not replace ordinary interface icons with generated raster images.

## Components, typed properties, and slots

A component definition is a source node referenced by a `ref` instance; it needs no editor-status
flag. Component definitions are usually root-level frames outside role-bearing output frames.
Declare customization on the component's `properties`. Scalar and single-value properties arrive
through an instance's `props`; a `slot` property names a descendant frame whose children the
instance owns structurally, and its content arrives through the instance's `slots`.

```js
Insert(null, {
  id: "labeled-component",
  type: "frame",
  name: "Labeled component",
  properties: {
    label: { type: "string", default: "Label" },
    content: {
      type: "slot",
      target: "component-content",
      preferredComponents: ["content-row"],
      minItems: 0,
      maxItems: 4
    }
  },
  layout: "vertical",
  width: "fit_content",
  padding: [12, 18],
  gap: 8,
  justifyContent: "center",
  alignItems: "center",
  fill: "#4F46E5",
  cornerRadius: 12,
  children: [{
    id: "component-label",
    type: "text",
    content: "Label",
    bind: { content: "$props.label" },
    textGrowth: "auto",
    fontFamily: "Inter",
    fontSize: 14,
    fontWeight: "600",
    fill: "#FFFFFF",
    marks: [],
    paragraphs: [{ from: 0, to: 5 }]
  }, {
    id: "component-content",
    type: "frame",
    layout: "vertical",
    children: []
  }]
});

Insert("#instance-container", {
  id: "labeled-instance",
  type: "ref",
  ref: "labeled-component",
  props: { label: "Updated label" },
  slots: {
    content: [{
      id: "instance-detail",
      type: "text",
      content: "Instance-owned detail",
      marks: [],
      paragraphs: [{ from: 0, to: 21 }]
    }]
  }
});
```

Property types are `string`, `number`, `boolean`, `color`, `enum`, `icon`, `node`, and `slot`.
A slot's `target` must identify one descendant frame. `preferredComponents` guides compatible
authoring choices; `minItems` and `maxItems` report non-blocking design-system guidance, matching
the way slot layer limits behave in established design tools. Omitting a slot keeps the
target frame's default children. Supplying an empty array deliberately clears them. Slot content is
ordinary authored Canvas structure with stable node IDs, selection, collaboration, undo, and
ordering—not an opaque JSON prop.

Use `descendants` for a narrow per-instance override of component-owned structure. A key may be one
unique source descendant ID or its exact slash-separated path relative to the component root. Do
not include the component root ID in that path. Canvas canonicalizes a bare ID to the same relative
path before rendering; an unknown path, duplicate equivalent key, unsupported property, or invalid
value fails the execution before it commits.

Every descendant type supports `name`, `x`, `y`, `width`, `height`, `rotation`, and `enabled`.
`fill` is supported only on paintable `frame`, `rectangle`, `ellipse`, `polygon`, `path`, `text`,
`icon`, and `ref` descendants. Text descendants additionally support `content`, `fontFamily`,
`fontSize`, `fontWeight`, `fontStyle`, `lineHeight`, `letterSpacing`, `textAlign`,
`textAlignVertical`, and `textGrowth`; icon descendants additionally support `library`, `icon`, and
`weight`. A frame or group may also replace `children`. This
surface is not text-only: for example, `{ "tab/active-rule": { fill: "#4F46E5" } }` changes a
rectangle inside the instance, and `{ "tab": { fill: "#EEF2FF" } }` changes its source frame.
Properties outside this list are rejected rather than stored without a rendered effect.

The selector walker traverses authored `children` and instance-owned slot content; it does not
expand component-owned descendants into synthetic source nodes. Slot paths contain the explicit
branch marker `$slots`, for example `instance/$slots/content/instance-detail`. Update an instance's
`descendants`, or edit the component source when every instance should change. `Get("*")` reports
authored source paths from the document root, so a component child may appear as
`component-id/row/label`; the corresponding descendant override key is `row/label` because it is
relative to that component and deliberately omits `component-id`.

## What this operation leaves alone

Canvas preserves existing variables, themes, imported resources, advanced content, and unknown
future fields. This operation does not author document-root variables or themes. Keep existing
`$variable` references and update the smallest supported node rather than replacing surrounding
structures.

Preserve approved content, brand decisions, reusable structure, and newer collaborative work.
Prefer the smallest change that achieves the intent: update a property rather than replacing a node,
and replace a node rather than rebuilding its parent.

## Selecting and inspecting

`Get(selector, visitor?, options?)` reads source nodes. Pass either `undefined` or `null` to omit
the visitor while supplying options. Valid selectors are:

- `#node-id` or an unprefixed exact node ID;
- `type:frame` for an exact type;
- `name:Header` for an exact name;
- `parent-id/child-id` for an exact source hierarchy path;
- `*` for every source node.

Selectors are strings. Pass `{ limit: number }` to bound how many matches come back; it defaults to
1,000. Prefer a selector narrow enough that the limit does not matter — an exact ID or source path
when you know the node, a type or name when you are surveying. Operations that require one target
reject zero or multiple matches rather than guessing.

`Get` selects authored source nodes only. A selector such as `Get("#instance *")` does not descend
into a rendered component instance; inspect the reusable source and address later instance changes
through the ref's `descendants` object.

Without a visitor, `Get` returns immutable contexts. Each contains a shallow cloned `node`, shallow
cloned `parent` or `null`, `childCount`, sibling `index`, slash-separated `path`, resolved `bounds`,
and reported `problems`. Scroll frames additionally expose `overflow` with its mode, measured content
dimensions, and overflow on each axis. This shallow default prevents an exact route/frame lookup from accidentally
returning its complete subtree. Pass `{ depth: 1 }` (through `100`) to include that many child
levels, or `{ depth: "all" }` only when the complete subtree is deliberately required. With a
visitor, Canvas invokes it once per match with the same context object described above, whose
`node` is the complete source node rather than a shallow clone, and returns the match count. Return
or print only the fields needed by the caller.

```js
const [frame] = Get("#selected-frame", undefined, { depth: 1 });
Print({ node: frame.node, bounds: frame.bounds, problems: frame.problems });
return frame.path;
```

```js
return Get("type:text", ({ node, parent, bounds }) => {
  Print({ id: node.id, content: node.content, parentId: parent?.id ?? null, bounds });
}, { limit: 200 });
```

Node data reflects the private clone at the time of that `Get`. Resolved bounds and problems come
from pre-execution render inspection. After mutations, use `TakeScreenshot` for visual review and a
following read-only execution when fresh measurements or problem analysis matter.

## Editing operations

`Insert(parent, node, position?)` inserts one supplied tree. Use `null` for the document root;
otherwise provide an exact selector, node, or `Get` context for a containing frame or group.
Position is a zero-based child index and defaults to the end.

Use `Slot(instance, name)` as the structural destination for an instance slot. It can be passed to
`Insert`, `Move`, or `Copy`. `SetSlot(instance, name, nodes)` atomically replaces or clears one
slot's complete authored contents. `ResetSlot(instance, name)` removes that instance override so
the component's default slot content appears again.

```js
Insert(Slot("#labeled-instance", "content"), {
  id: "second-detail",
  type: "text",
  content: "Another detail",
  marks: [],
  paragraphs: [{ from: 0, to: 14 }]
});
Move("#existing-detail", Slot("#labeled-instance", "content"), 0);
SetSlot("#labeled-instance", "content", []);
ResetSlot("#labeled-instance", "content");
```

`Update(target, properties)` changes exactly one source node, preserves omitted properties, and
cannot change its ID. Set a property to `undefined` to remove it. Supplying `children` replaces the
complete child array after validating the new hierarchy and every ID. Prefer ordinary property
updates when the existing child structure should remain intact.

`Replace(target, node)` replaces exactly one source node. If the replacement omits `id`, Canvas
keeps the target ID. Use it only when the node's complete structure is intentionally redefined.

`Delete(target)` removes exactly one subtree. `Move(target, parent, position?)` moves exactly one
subtree to the root or another container. Both preserve the target ID.

`Copy(target, parent, position?, properties?)` clones one subtree and renews every copied ID.
Optional overrides apply to the copied root but cannot replace its ID, children, or slots. Retain returned
IDs instead of rediscovering nodes with broad selectors.

```js
Update("#target-text", { content: "Updated text" });
const copiedId = Copy("#source-item", "#destination-container", undefined, {
  name: "Copied item"
});
Print({ copiedId });
```

## Importing and generating images

`G(target, source, prompt?)` sets the exact target's fill to an image:

- `G(target, "ai", prompt)` generates a low-quality GPT Image 2 asset. A prompt is required, and
  one execution can request at most 20 images.
- `G(target, source)` imports an absolute file path, `file://` URL, HTTP(S) URL, data URL, or an
  already stored relative asset path. A new unresolved relative path is rejected.

Canvas stores the image before commit and replaces a temporary source with a durable document
asset. Give generation prompts concrete art direction: subject, composition, camera or illustration
style, palette, lighting, negative space, and the intended crop. Avoid requesting text inside an
image when editable Canvas text would be clearer.

```js
Insert("#image-container", {
  id: "image-target",
  type: "rectangle",
  name: "Generated image",
  width: 360,
  height: "fill_container",
  cornerRadius: 24
});
G("#image-target", "ai", "Specific subject and setting, intentional composition, defined visual style and palette, clear lighting, useful negative space, exact crop, no text");
TakeScreenshot(["#image-container"]);
return "image-target";
```

Use generated or imported imagery when it materially advances the visual concept. Keep text,
icons, shapes, and gradients native and editable.

## Screenshots and quality review

`TakeScreenshot([target, ...])` renders exact source nodes together after all mutations. It returns
one PNG and reports node IDs and dimensions. It captures document content without editor controls
and does not require an open tab. Call it at most once per execution and include all review targets
in that array.

Review the screenshot for:

- clear hierarchy and a strong focal point;
- intentional spacing, rhythm, alignment, and grouping;
- typography that is readable, consistent, and appropriate to the concept;
- sufficient contrast and a controlled palette;
- content that fits its frame without clipping or accidental overflow;
- imagery and icons that support the message;
- repeated elements that are structurally consistent without becoming monotonous;
- whether the result feels designed for the brief rather than assembled from generic cards.

A successful mutation proves that the document saved, not that the design is good. Use the rendered
result as the evidence for appearance.

`Print(...values)` adds bounded JSON values to `prints` and is limited to 1,000 entries. Return a
small final value when the caller needs a concise result.

## Reading the result

Use the structured result as evidence for what happened:

- `changed` says whether the execution committed a document mutation;
- `sequence` identifies the saved document revision;
- `operationId` identifies the committed mutation for a possible immediate `documents.undo`, or is
  `null` for a read-only execution;
- `touchedNodeIds` lists nodes directly affected by mutation calls;
- `prints` contains values sent through `Print`, while `result` contains the script's returned value;
- `inspection` reports post-execution bounds and problems for at most 50 touched nodes, including
  deletion markers; `inspectionSummary` reports the total, returned count, and whether details were
  truncated; the contexts returned by `Get` during the script use pre-execution inspection;
- `issues` reports problems found while validating or rendering the resulting document;
- `screenshots` describes the rendered PNG returned as image content.

Do not infer visual correctness from `changed`, touched IDs, or an empty script error. Check
`issues` and use a screenshot for appearance.

## Execution limits and recovery

Scripts cannot directly access files, network, Account data, timers, editor DOM, or Penkra runtime
objects. Source code is limited to 100,000 UTF-8 bytes and runs for at most five seconds with a
64 MiB heap and 4 MiB stack. Serialized input, document, and result sizes are also bounded.

Canvas validates and materializes generated images before committing. A read-only program returns
`operationId: null`; a successful mutation returns a durable `operationId`. `documents.undo` can
reverse it only while it remains the exact document head and was authored by the same caller.

If Canvas reports `CANVAS_DOCUMENT_CHANGED`, the document advanced while the script was running.
Re-inspect the affected nodes and decide whether the intended change is still needed; do not replay
stale code blindly. If a one-target operation reports zero or multiple matches, use an exact ID or
source path. If review reveals clipping, misplaced content, or a visually nested label that is not
structurally nested, fix the underlying text growth, layout, sizing, or hierarchy instead of
offsetting the symptom with spaces or arbitrary coordinates.
