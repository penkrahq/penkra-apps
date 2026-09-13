---
name: canvas-print
description: Working with print documents in Canvas — pages, physical sizes, and PDF export including PDF/A, PDF/X, and PDF/UA profiles. Load this when a Canvas document has module "print", or before creating one.
display-name: Canvas print documents
short-description: Pages, physical sizing, and PDF export in Canvas.
---

# Canvas print documents

A Canvas document whose `module` is `"print"` produces a PDF. The module is chosen at
`documents.create` and cannot be changed afterwards.

Print is the module where the design has a real physical size. Everything below follows from that.

## The page frame

A **page** is a top-level frame carrying `role: "page"`. Frames without that role are ordinary
design content, and most frames in a print document have no role.

`documents.create` puts the first page in the document:

| | |
| --- | --- |
| Name | `Page 1` |
| Size | 794 × 1123 |
| `role` | `page` |
| `size` | `a4` |
| `physical` | 210 × 297 mm |

794 × 1123 is A4 at 96 dpi. That is the working resolution; `physical` is what the PDF is actually
measured in, and the two must agree in aspect ratio or the export will look subtly stretched.

## Adding a page

Copy the previous page. It carries size, role, and physical dimensions forward:

```js
const id = Copy("#page-1", null, undefined, { name: "Page 2" });
```

Building one from scratch means setting the physical size yourself:

```js
Insert(null, {
  id: "page-2",
  type: "frame",
  name: "Page 2",
  role: "page",
  size: "a4",
  physical: { w: 210, h: 297, unit: "mm" },
  width: 794,
  height: 1123,
  layout: "none",
  fill: "#FFFFFF"
});
```

Export recognises `size: "a4"` (210 × 297 mm) and `size: "letter"` (8.5 × 11 in) on its own. Any
other page size needs an explicit `physical`, or export fails.

Pages are siblings at the document root — a role-bearing frame never contains another one — and
reusable components live at the root, outside every page, with `ref` instances placed into pages.

## Designing for print

- Work in the 96-dpi pixel space. Canvas rasterises at 300 dpi during export, so a 12-point body
  size is roughly 16 px here.
- Keep critical content away from the trim edge. Canvas does not add bleed for you.
- Prefer real text nodes over generated images of text. Text stays selectable and searchable in the
  PDF; a raster of text does not, and it is the main reason a PDF fails an accessibility check.
- Repeating furniture — headers, folios, footers — is worth making a reusable component so a change
  propagates to every page.

## Exporting

`documents.export` with `role: "page"` writes a PDF to an absolute file path:

```json
{ "documentId": "…", "role": "page", "frames": ["page-1", "page-2"],
  "destination": "/Users/you/Desktop/report.pdf" }
```

Frames export in the order given, and every one must carry `role: "page"` or export fails with
`CANVAS_EXPORT_ROLE`. The destination must not already exist.

`profile` requests a conformance level, and each one means something different:

| Profile | Use it when |
| --- | --- |
| `PDF/A-3` | The file has to stay readable long-term — an archive, a legal record |
| `PDF/X-4` | A commercial printer is producing it |
| `PDF/UA-1` | Accessibility conformance is required |
| omitted | An ordinary PDF for reading or emailing |

Do not request a profile speculatively. Each one constrains what the exporter will accept, so a
design that exports cleanly without a profile can fail with one — and the right response is to fix
the design, not to drop the profile the user asked for.
