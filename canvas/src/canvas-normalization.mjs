const LOGICAL_ALIGNMENT_PROPERTIES = new Set([
  "align",
  "textAlign",
  "justifyContent",
  "alignItems",
]);

export function normalizeCanvasDocumentAliases(source) {
  const document = structuredClone(source);
  normalizeCanvasAliasesInPlace(document);
  return document;
}

export function normalizeCanvasAliasesInPlace(value) {
  if (Array.isArray(value)) {
    for (const item of value) normalizeCanvasAliasesInPlace(item);
    return value;
  }
  if (!value || typeof value !== "object") return value;
  for (const [property, child] of Object.entries(value)) {
    if (LOGICAL_ALIGNMENT_PROPERTIES.has(property) && (child === "left" || child === "right")) {
      value[property] = child === "left" ? "start" : "end";
    } else if (property === "textAlignVertical" && child === "middle") {
      value[property] = "center";
    } else {
      normalizeCanvasAliasesInPlace(child);
    }
  }
  return value;
}
