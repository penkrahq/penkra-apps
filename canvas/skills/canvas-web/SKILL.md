---
name: canvas-web
description: Working with web designs in Canvas — routes, responsive layout, and exporting HTML and CSS. Load this when a Canvas document has module "web", or before creating one.
metadata:
  display-name: Canvas web designs
  short-description: Routes, responsive layout, and HTML/CSS export in Canvas.
---

# Canvas web designs

A Canvas document whose `module` is `"web"` produces HTML and CSS. The module is chosen at
`documents.create` and cannot be changed afterwards.

Web differs from a fixed-layout deck or extracted PDF in one way that changes how you build: the
export is **semantic**. Fixed-layout artifacts preserve a composed surface. Web reads your
structure and emits corresponding markup, so the hierarchy you build becomes the hierarchy the
browser gets. Sloppy structure that looks fine in a screenshot exports as sloppy markup.

## The route frame

A **route** is a top-level frame carrying `role: "route"`. One route is one page of the site.
Frames without that role are ordinary design content — components, sections, states — and most
frames in a web document have no role.

`documents.create` puts the first route in the document:

| | |
| --- | --- |
| Name | `Home` |
| Size | 720 × 480 |
| `role` | `route` |
| `size` | none |
| `physical` | none |

Unlike a slide or physical PDF frame, a route has no physical size. Its dimensions are a working viewport, not a
fixed output surface, so 720 × 480 is a starting canvas you should resize to whatever you are
designing for.

## Adding a route

Copy an existing route to carry the role and shared chrome forward:

```js
const id = Copy("#home", null, undefined, { name: "Pricing" });
```

Or build one at the root:

```js
Insert(null, {
  id: "pricing",
  type: "frame",
  name: "Pricing",
  role: "route",
  width: 1440,
  height: 2400,
  layout: "vertical",
  fill: "#FFFFFF"
});
```

No `physical` and no `size` are needed. Routes are siblings at the document root — a role-bearing
frame never contains another one — and reusable components live at the root, outside every route,
with `ref` instances placed into routes.

A route is usually a **vertical auto-layout** frame, not a free-positioned one, because that is what
a page actually is: a stack of full-width sections. Give each section `width: "fill_container"` and
let the route grow.

## Structure that exports well

The exporter maps what you built onto real elements. Four properties control that mapping, and they
are the reason web work needs more care than a deck:

| Property | Effect on the export |
| --- | --- |
| `landmark` on a frame | Becomes the element: `nav`, `main`, `header`, `footer`, `aside`, `region` → `<section>`. A route with no landmark becomes `<main>` |
| `headingLevel` on a text paragraph (1–6) | Becomes `<h1>`–`<h6>` instead of a generic element |
| `description` on any node | Becomes `aria-label`, or `alt` on an image |
| `decorative: true` | Becomes `aria-hidden="true"` — for shapes and ornament that carry no meaning |

Set `landmark` on the top-level sections of a route: the site header, the nav, the footer. Set
`headingLevel` on real headings and only on real headings; a large bold text node is not a heading
unless you say so, and the exported page will have none. `description` and `decorative` are mutually
exclusive on the same node.

Beyond those:

- Group properly. A card is a frame containing its image, heading, and body — not four overlapping
  siblings that happen to sit near each other. Overlapping siblings export as absolutely positioned
  divs.
- Use auto-layout for anything that is a row, column, or list. Free positioning exports as fixed
  coordinates that will not adapt.
- Keep text as `text` nodes. Generated images of text export as `<img>` and are invisible to search
  and to screen readers.
- Give nodes meaningful IDs. They become element IDs in the output.

Canvas layout is not CSS: percentages, viewport units, `calc()`, margins, and wrapping are not
available. Build with `fill_container`, `fit_content`, `gap`, and `padding`.

## Exporting

`documents.export` with `format: "html"` writes a **directory**, not a file:

```json
{ "documentId": "…", "format": "html", "frames": ["home", "pricing"],
  "destination": "/Users/you/Desktop/site" }
```

The directory contains the HTML and CSS, an `assets/` folder holding any rasterised nodes as PNGs,
and `export-report.json`. That report lists what the exporter could not represent natively and what
it rasterised or dropped instead — read it, because a design can export successfully and still have
quietly become an image.

Every frame must carry `role: "route"` or export fails with `CANVAS_EXPORT_ROLE`. The destination
must not already exist.
