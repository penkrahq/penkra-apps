# Editing a Canvas document

Use `documents.execute` when the requested result depends on the contents of one existing Canvas
document: inspecting its hierarchy, creating or changing nodes, generating or attaching an image,
or rendering exact document nodes for review. The operation runs one bounded JavaScript program
against a private clone and commits the complete result atomically. It does not open or control the
editor UI.

One execution should represent one coherent design intent. A complete screen, component, or focused
repair may involve many nodes and still be one intent. Separate unrelated changes so each result can
be inspected, reviewed, and—while it remains the document head—undone as one unit.

## The document model

Canvas preserves the Pencil `.pen` document model and targets Pencil 2.17 behavior. A document has
top-level nodes. Every node has a stable string `id` and a `type`; other properties depend on that
type. IDs are the durable identity used by selection, hierarchy, references, collaboration, later
edits, and agent results. Unlike Pencil's MCP authoring surface, Canvas requires every inserted node
in a supplied tree to already have a unique, nonempty ID. Use descriptive IDs and never manufacture
an ID for a node that already exists.

Only `frame` and `group` nodes are containers in the Pencil model. Put visual children in their
`children` arrays. A rectangle cannot contain a label, so an input, button, badge, card, or row that
contains text must be a frame (or group) with text and other content as real children. Placing a text
node beside a rectangle at overlapping coordinates only makes it look nested: moving, copying,
laying out, or selecting the apparent control will expose the broken hierarchy.

Use top-level frames for screens, sections, and reusable component definitions. A reusable
definition is a frame with `reusable: true`; an instance is a `ref` node whose `ref` is the
definition's ID. Instance-specific values belong in the ref's `descendants` overrides, keyed by the
definition descendant ID. Do not duplicate a component merely to change a label or icon. The script
selector walker traverses source `children`; it does not expand a ref into synthetic children.
Therefore `Get` cannot select a rendered instance descendant. Inspect or update the ref itself and
its `descendants` property, or edit the reusable source node when the change should affect every
instance.

Canvas preserves document variables, themes, imported component libraries, unknown fields, and
unsupported future node data. `documents.execute` currently has no document-root variable or theme
authoring API. Preserve those fields and existing `$variable` references. Do not replace a whole
document or component merely to change a supported node property.

## Layout and sizing

Frames may use `layout: "horizontal"`, `layout: "vertical"`, or `layout: "none"`. Auto-layout
frames use `gap`, `padding`, and alignment properties to place their direct children. A child can use
`width: "fill_container"` or `height: "fill_container"` to consume available space, and containers
can use `fit_content`. These are Pencil layout values, not CSS: percentages, margins, flex-wrap,
baseline alignment, and CSS declarations are not supported. In an auto-layout frame, ordinary
child `x` and `y` values do not control placement; use `layoutPositioning: "absolute"` only when the
child deliberately leaves the layout flow.

Text sizing is explicit and is the most important distinction for reliable authoring:

- `textGrowth: "auto"` gives the text its intrinsic width and height. Explicit width and height are
  ignored, and the text does not wrap.
- `textGrowth: "fixed-width"` requires a width, wraps to that width, and grows in height to fit the
  content. In an auto-layout row or column, use `width: "fill_container"` when the text should take
  the remaining width and wrap responsively.
- `textGrowth: "fixed-width-height"` requires width and height. It wraps horizontally but does not
  grow vertically, so content can overflow when the height is insufficient.

If wrapping matters, never rely on the current string happening to fit. Give the text fixed-width
growth and a real width constraint. If a button label should remain on one line, use intrinsic text
inside a fit-content or sufficiently constrained frame; do not simulate padding with spaces or
invisible characters.

Use native `type: "icon"` nodes for library icons rather than converting them to paths. Supply the
exact `library` and `icon`, plus explicit width, height, and fill. Supported libraries are `lucide`,
`feather`, `Material Symbols Outlined`, `Material Symbols Rounded`, `Material Symbols Sharp`, and
`phosphor`. Canvas keeps the semantic icon identity so the editor can render and later edit it.

## Selecting and inspecting

`Get(selector, visitor?, options?)` reads source nodes. Valid selectors are:

- `#node-id` or an unprefixed exact node ID;
- `type:frame` for an exact type;
- `name:Header` for an exact name;
- `parent-id/child-id` for an exact source hierarchy path;
- `*` for every source node.

The default and maximum result limit is 1,000. Narrow the selector or pass
`{ limit: number }`; a limit must be an integer from 1 through 1,000. Operations that require one
target reject zero or multiple matches rather than guessing.

Without a visitor, `Get` returns immutable contexts. Each context contains a cloned `node`, its
cloned `parent` or `null`, sibling `index`, slash-separated `path`, resolved `bounds`, and reported
`problems`. With a visitor, Canvas invokes it once per context and returns the match count. The node
and hierarchy reflect the private document clone at the time of that `Get`. Resolved bounds and
problems come from the pre-execution render inspection; after mutations, use `TakeScreenshot` for
visual verification and a following read-only execution when fresh resolved measurements or
problem analysis matter.

Examples:

```js
const [screen] = Get("#settings-screen");
Print({ node: screen.node, bounds: screen.bounds, problems: screen.problems });
return screen.path;
```

```js
return Get("type:text", ({ node, parent, bounds }) => {
  Print({ id: node.id, content: node.content, parentId: parent?.id ?? null, bounds });
}, { limit: 200 });
```

## Changing nodes

`Insert(parent, node, position?)` inserts one supplied node tree. Pass `null` for the document root;
otherwise pass an exact selector, node, or Get context for the containing frame or group. Position
is a zero-based child index and defaults to the end. Every inserted descendant must have a unique
stable ID. A newly created Canvas document already contains the `starterFrameId` returned by
`documents.create`; replace or update it for the first screen rather than inserting a second frame
on top of it.

`Update(target, properties)` changes properties on exactly one source node. It preserves omitted
properties and cannot change the node ID. Set a property to `undefined` to remove it. Update the
smallest semantic node that owns the change.

`Replace(target, node)` replaces exactly one source node. If the replacement omits `id`, Canvas
keeps the target ID. Use replacement only when the node's complete structure is intentionally being
redefined; `Update` is safer for ordinary property changes because it preserves children and
unrecognized fields.

`Delete(target)` removes exactly one source subtree. `Move(target, parent, position?)` moves one
source subtree to the document root or a new container. Both preserve the target ID in the touched
node report; neither guesses among duplicate matches.

`Copy(target, parent, position?, properties?)` clones one source subtree and renews every ID in the
copy. Optional property overrides apply to the copied root but cannot replace its ID or children.
Use the returned new root ID for later calls in the same execution.

Mutation calls return an ID or node as documented by their behavior, so retain those values instead
of re-discovering a node by a broad name or type selector:

```js
const cardId = Insert("#content", {
  id: "security-card",
  type: "frame",
  name: "Security card",
  layout: "vertical",
  width: "fill_container",
  padding: 20,
  gap: 8,
  fill: "#FFFFFF",
  children: [
    {
      id: "security-card-title",
      type: "text",
      content: "Security",
      textGrowth: "auto",
      fontFamily: "Inter",
      fontSize: 16,
      fontWeight: "600",
      fill: "#18181B"
    },
    {
      id: "security-card-description",
      type: "text",
      content: "Control sign-in and recovery settings for this account.",
      textGrowth: "fixed-width",
      width: "fill_container",
      fontFamily: "Inter",
      fontSize: 13,
      lineHeight: 20,
      fill: "#71717A"
    }
  ]
});
TakeScreenshot([cardId]);
return cardId;
```

## Images and screenshots

`G(target, source, prompt?)` sets the exact target's fill to an image:

- `G(target, "ai", prompt)` generates a low-quality GPT Image 2 asset. The prompt is required and
  one execution may request at most 20 generated images.
- `G(target, source)` accepts an absolute file path, `file://` URL, HTTP(S) URL, data URL, or an
  already-uploaded relative asset path. A new relative path is rejected because Canvas cannot infer
  which file it names.

Canvas stores the image before commit and replaces a transient source with a durable document asset.
Use image generation only when the design calls for raster imagery; icons, shapes, gradients, and
text should remain native editable nodes and paints.

`TakeScreenshot([target, ...])` renders one or more exact source nodes together after all mutations
in the execution. It returns one PNG as image content and reports its node IDs and dimensions in
`screenshots`. It captures document content, not editor chrome, and does not require an open tab.
Call it at most once per execution and include every review target in that one array. A screenshot
is the evidence for appearance; the mutation succeeding is not evidence that text wraps, hierarchy
reads correctly, or content remains unclipped.

`Print(...values)` adds bounded JSON values to `prints`. It is limited to 1,000 entries. Return a
small final value when the caller needs a concise operation result.

## Commit, limits, and recovery

The script cannot access files, network, Account data, timers, the editor DOM, or Penkra runtime
objects directly. Source code is limited to 100,000 UTF-8 bytes and runs for at most five seconds
with a 64 MiB heap and 4 MiB stack. The serialized document, inspection input, and result have
separate bounded sizes.

Canvas validates and materializes generated images before committing, then rejects the commit if
the saved source sequence changed during the execution. A read-only program returns
`operationId: null`. A successful mutation returns a durable `operationId` that
`documents.undo` may reverse only while that mutation remains the exact document head and was
authored by the same caller.

If the operation reports `CANVAS_DOCUMENT_CHANGED`, the document advanced while the script was
running. Re-inspect the affected source and decide whether the intended change is still needed;
never blindly replay stale code. If the script reports zero or multiple nodes for a one-target
operation, narrow it to an exact ID or source path. If visual review reveals clipping, misplaced
content, or a label that is not truly nested, correct the underlying text-growth, layout, or
hierarchy property instead of offsetting the symptom with spaces, coordinates, or one-off widths.
