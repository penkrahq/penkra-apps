# documents.extract

Write one or more Canvas nodes to image or vector files.

Extraction is **not** deliverable export. It answers *"give me this thing as a file."* It works on
any node — a frame, a group, a component instance, a shape, a text node — and requires no role, no
module, and no capability table.

## Usage

```
documents.extract
  --document-id <id>
  --node <nodeId>            repeatable
  --format png | svg | pdf
  --destination <path>
  [--scale <n>]              png only, default 1
  [--modes '{"appearance":"dark"}']
```

## How many files you get

Two independent questions: how many nodes you name, and whether the destination is a file or a
directory.

| Nodes | Destination | Result |
| --- | --- | --- |
| one | file | one artifact |
| many | file | one artifact — **only if the format holds many units** |
| one or many | directory | one artifact per node, named `<nodeId>.<ext>` |

`pdf` holds many units: N nodes become an N-page PDF in the order given. `png` and `svg` do not;
naming several nodes with a file destination fails with `CANVAS_EXTRACT_FORMAT_SINGLE_UNIT`.

Pages in a multi-page PDF may differ in size. A cover and three spreads at different dimensions is
one valid file.

## What each format gives you

- **png** — raster. `--scale` multiplies the node's pixel dimensions. Maximum 8192px on either
  axis; a request that would downscale fails rather than silently shrinking.
- **svg** — vector. Paths stay paths, text stays text.
- **pdf** — vector, text preserved, fonts embedded.

## Physical size

A node that declares `physical` extracts to PDF at its real-world size, with a MediaBox in points.

```js
{ id: `poster`, type: `frame`, width: 2245, height: 3179,
  physical: { w: 594, h: 841, unit: `mm` } }
```

Without `physical`, the PDF page is derived from pixel dimensions at 72dpi. Declare it whenever the
artifact is going to a printer, because pixels do not tell a print shop what size to cut.

`bleed` is honoured when present: the artwork extends past the trim line and the file carries a real
BleedBox and TrimBox, so a guillotine's tolerance does not leave white edges.

`folds` and `safeMargin` are authoring guides. They emit nothing.

## Why there is no capability table

A capability table answers *"can the target express what you drew?"* That question is live for
`.pptx` and for SwiftUI, whose models differ from ours. It is near-vacuous for SVG and PDF, whose
primitives — paths, fills, strokes, transforms, clips, text runs — are essentially our node model.
There is no fidelity gap to tabulate, so extraction reports no verdicts and no consequences.

## Modes

`--modes` selects axis modes before extraction, the same way export does. Unspecified axes resolve
to their first mode.

```
documents.extract --node hero --format png --destination hero-dark.png --modes '{"appearance":"dark"}'
```

Two files for light and dark is two calls. One file claiming to be both is not a thing.

## Errors

| Code | Cause |
| --- | --- |
| `CANVAS_EXTRACT_NODE_NOT_FOUND` | No node with that id in the document. |
| `CANVAS_EXTRACT_FORMAT_SINGLE_UNIT` | Several nodes named, file destination, format holds one unit. |
| `CANVAS_EXTRACT_SCALE_UNSUPPORTED` | `--scale` given for a vector format. |
| `CANVAS_EXTRACT_DIMENSION_LIMIT` | Requested raster exceeds 8192px on an axis. |
