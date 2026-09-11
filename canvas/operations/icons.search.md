# Finding native Canvas icons

Use `icons.search` when a design needs a symbolic or interface icon and the exact identifier is not
already known. It searches the icon catalogs bundled with the installed Canvas package, so every
returned `library` and `icon` pair is valid for a native `type: "icon"` node in that same package.
It does not read or change a document.

Search for the concrete object or action: `lock`, `loader`, `arrow left`, `school`, `calendar`, or
`progress activity`. Multiple words must all occur in the name. Use `library` only when the design
already follows one icon family; otherwise compare results across all libraries.

Canvas includes Lucide and Feather outline icons; Outlined, Rounded, and Sharp Material Symbols;
and Phosphor outline and filled icons. Copy returned identifiers exactly. Material Symbols use
underscore names and accept weights from 100–700. Base Phosphor icons support weights 100, 300,
400, and 700.

Use a returned pair directly in `documents.execute`:

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
weight, style, and meaning fit the composition.
