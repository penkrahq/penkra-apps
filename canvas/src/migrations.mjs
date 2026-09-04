const LEGACY_VARIABLE_REFERENCE = /^\$([A-Za-z][\w-]*)$/;

export function migrateM1DelimitedVariables(source) {
  const document = structuredClone(source);
  let changes = 0;
  const visit = (value, key = null) => {
    if (typeof value === "string") {
      if (!VARIABLE_KEYS.has(key)) return value;
      const match = LEGACY_VARIABLE_REFERENCE.exec(value);
      if (!match) return value;
      changes += 1;
      return `\${${match[1]}}`;
    }
    if (Array.isArray(value)) return value.map((item) => visit(item, key));
    if (!value || typeof value !== "object") return value;
    const migrated = Object.fromEntries(
      Object.entries(value).map(([childKey, child]) => [childKey, visit(child, childKey)]),
    );
    if (value.type === "text" && typeof value.content === "string" && migrated.content !== value.content) {
      const beforeLength = value.content.length;
      const afterLength = migrated.content.length;
      migrated.marks = (value.marks ?? []).map((mark) => (
        mark.from === 0 && mark.to === beforeLength ? { ...mark, to: afterLength } : { ...mark }
      ));
      migrated.paragraphs = (value.paragraphs ?? []).map((paragraph) => (
        paragraph.from === 0 && paragraph.to === beforeLength ? { ...paragraph, to: afterLength } : { ...paragraph }
      ));
    }
    return migrated;
  };
  return { document: visit(document), changes };
}

const VARIABLE_KEYS = new Set([
  "x", "y", "width", "height", "gap", "opacity", "rotation", "strokeWidth",
  "fontSize", "lineHeight", "letterSpacing", "thickness", "weight", "radius",
  "spread", "blur", "startAngle", "sweepAngle", "innerRadius", "polygonCount",
  "position", "top", "right", "bottom", "left", "enabled", "clip", "flipX",
  "flipY", "underline", "strikethrough", "fontFamily", "fontWeight", "fontStyle",
  "content", "model", "library", "icon", "color", "cornerRadius", "padding", "fill",
  "stroke", "colors",
]);
