---
name: canvas-deck
description: Working with presentation decks in Canvas — adding and editing slides, keeping frames exportable, and producing a .pptx. Load this when a Canvas document has module "deck", or before creating one.
display-name: Canvas decks
short-description: Slides, slide frames, and .pptx export in Canvas.
---

# Canvas decks

A Canvas document whose `module` is `"deck"` produces a PowerPoint file. The module is chosen at
`documents.create` and cannot be changed afterwards, so a document that should end up as a deck has
to be created as one; there is no conversion.

This Skill covers how decks work in Canvas. It does not cover how to design a good presentation —
judge that from the rendered screenshot, the same way you would judge any other visual work.

## The slide frame

In a deck, a **slide** is a top-level frame carrying `role: "slide"`. Nothing else is a slide.
Frames without that role are ordinary design content: components, scratch work, off-canvas notes.
Most frames in a deck have no role at all, and that is normal.

`documents.create` puts the first slide in the document for you:

| | |
| --- | --- |
| Name | `Slide 1` |
| Size | 1280 × 720 |
| `role` | `slide` |
| `size` | `widescreen` |
| `physical` | 13.333 × 7.5 in |

Build the first design into that frame rather than adding another one beside it.

## Adding a slide

A new slide is a new top-level frame. `Insert(null, ...)` places it at the document root; a slide
inserted into another frame is not a slide.

Copying the previous slide is usually better than building one from nothing, because it carries the
size, role, and physical dimensions forward along with the visual language:

```js
const id = Copy("#slide-1", null, undefined, { name: "Slide 2" });
Print({ id });
```

`Copy` renews every ID in the subtree and returns the new root ID. Keep that ID; do not rediscover
the slide later with a broad selector.

When you do build one from scratch, four properties have to be right:

```js
Insert(null, {
  id: "slide-2",
  type: "frame",
  name: "Slide 2",
  role: "slide",
  size: "widescreen",
  physical: { w: 13.333, h: 7.5, unit: "in" },
  width: 1280,
  height: 720,
  layout: "none",
  fill: "#FFFFFF"
});
```

`physical` is the one people forget, and it is the one that fails loudly. Export rejects a slide
frame that has neither `physical` nor a size it recognises, because it cannot work out how large the
slide is on a real surface. Copying an existing slide avoids the whole problem.

Two rules constrain where slides live:

- Slides are siblings at the document root. A role-bearing frame must never contain another
  role-bearing frame.
- A reusable component must not live inside a slide. Put shared components at the root, outside
  every slide, and place `ref` instances into slides.

## Speaker notes and layout

A deck's canvas is fixed at the slide size, so slides do not reflow. Auto-layout is still worth
using inside a slide for rows, columns, and bullet lists, because it keeps spacing consistent when
content changes length — but the slide frame itself should normally be `layout: "none"` so you can
compose freely.

## Exporting

`documents.export` with `role: "slide"` writes a `.pptx` to an absolute file path. Pass the slide
frame IDs explicitly and in the order they should appear:

```json
{ "documentId": "…", "role": "slide", "frames": ["slide-1", "slide-2"],
  "destination": "/Users/you/Desktop/deck.pptx" }
```

Every frame in that list must carry `role: "slide"`. If one does not, export fails with
`CANVAS_EXPORT_ROLE` naming the frame — which is the usual sign that a slide was added by hand
without its role.

The destination must not already exist. Export never overwrites.

For a single slide as an image — pasting one into a chat or a document — use
`documents.export-image` instead, which takes exactly one subtree and writes a PNG or SVG.
