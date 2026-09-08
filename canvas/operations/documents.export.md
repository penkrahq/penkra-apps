# documents.export

Write a Canvas document to a deliverable file format.

Export is for formats whose **units carry semantics** — a `.pptx` slide has speaker notes, layout
inheritance and transitions; a web route is an addressable page. Producing one means projecting our
node model onto a foreign model, which can lose things. Export therefore requires a role, consults a
capability table, and returns a report saying what survived.

If you only want a picture or a vector of something, use `documents.extract`. It works on any node,
needs no role, and loses nothing.

## Usage

```
documents.export
  --document-id <id>
  --format pptx | html | swift | kotlin
  --destination <path>
  [--frames <nodeId>...]     default: every role-bearing frame, in document order
  [--modes '{"appearance":"dark"}']
```

## Roles

A frame carries a `role` naming what kind of deliverable unit it is.

| Role | Module | Format |
| --- | --- | --- |
| `slide` | `deck` | `.pptx` |
| `route` | `web` | `.html` + `.css` |
| `ios` | `mobile` | SwiftUI source |
| `android` | `mobile` | Compose source |

There is no `page` role and no `print` module. A PDF page is a frame that declares a real-world
`physical` size, and multi-page PDFs come from `documents.extract`, because a PDF page carries no
semantics beyond its dimensions — nothing to project, nothing to lose.

## The artifact

Export writes a bundle, not always a single file. A `.pptx` is one file; a web export is `.html`
plus `.css` plus an assets directory. `--destination` names the root, and the report lists
everything written.

## The report

Every export returns verdicts drawn from the capability table for the target format:

- `native` — the target expresses this directly.
- `lower` — expressed by a different construct that looks the same.
- `raster` — flattened to an image, with a `consequences` entry saying what was lost.

A verdict is only `native` where a measured test says so. Anything unmeasured is `raster`, which is
the honest answer rather than the flattering one.

## Modes

Static targets select a mode at export time; the artifact contains one. `--modes` says which.
Unspecified axes resolve to their first mode. Only `web`, where a mode carries a real media query,
resolves the axis in the output.

## Errors

| Code | Cause |
| --- | --- |
| `CANVAS_EXPORT_ROLE` | A named frame does not carry the role this format requires. |
| `CANVAS_EXPORT_NO_FRAMES` | The document has no frame with the required role. |
| `CANVAS_PHYSICAL_SIZE_UNDECLARED` | A format needing real-world dimensions found none. |
