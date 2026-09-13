# Finding native Canvas icons

Use `icons.search` when a design needs a symbolic or interface icon and the exact identifier is not
already known. It searches the icon catalogs bundled with the installed Canvas package, so every
returned `library` and `icon` pair is valid for a native `type: "icon"` node in that same package.
It does not read or change a document.

Search terms are matched against icon names. Multiple words must all occur in the name. Start with
the concrete object or action rather than a visual description: `lock`, `loader`, `arrow left`,
`school`, `calendar`, or `progress activity`. If the first term is too narrow, try a nearby ordinary
word. Use `library` only when the design already follows one icon family; otherwise compare results
from all libraries.

Canvas includes:

- `lucide` — outline icons with hyphenated names;
- `feather` — a smaller outline set with hyphenated names;
- `Material Symbols Outlined` — Material Symbols using underscore names and weights from 100–700;
- `Material Symbols Rounded` — the rounded Material Symbols family;
- `Material Symbols Sharp` — the sharp Material Symbols family;
- `phosphor` — outline and filled icons, including named style variants; base icons support weights
  100, 300, 400, and 700.

Copy the returned identifiers exactly. Do not approximate an available symbol with ellipse, line,
polygon, path, text-glyph, or raster-image nodes. Build custom geometry only when the requested mark
is genuinely absent from the bundled catalogs or is original artwork rather than an interface icon.

Examples of distinct searches:

```json
{ "query": "loader", "library": "lucide", "limit": 20 }
```

```json
{ "query": "progress activity", "library": "Material Symbols Rounded" }
```

```json
{ "query": "spinner", "library": "phosphor" }
```

Use one returned pair in `documents.execute`:

```js
Insert("#status-row", {
  id: "status-icon",
  type: "icon",
  library: "lucide",
  icon: "loader-circle",
  width: 16,
  height: 16,
  fill: "#667085"
});
```

If a result is visually unsuitable, search again and compare native alternatives. A successful
lookup establishes that the identifier exists; review the rendered design to judge whether its
weight, style, and meaning fit the surrounding composition.
