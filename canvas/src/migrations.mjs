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

export function migrateM14ThemesToAxes(source) {
  const document = structuredClone(source);
  let changes = 0;
  if (document.themes && typeof document.themes === "object" && !Array.isArray(document.themes)) {
    document.axes = Object.fromEntries(Object.entries(document.themes).map(([name, modes]) => [name, {
      modes: (Array.isArray(modes) ? modes : []).map((mode) => ({ name: mode })),
    }]));
    delete document.themes;
    changes += 1;
  }
  return { document, changes };
}

export function migrateM15NodeModes(source) {
  const document = structuredClone(source);
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (!node.theme || typeof node.theme !== "object" || Array.isArray(node.theme)) return;
    node.modes = { ...(node.modes ?? {}), ...node.theme };
    delete node.theme;
    changes += 1;
  });
  return { document, changes };
}

export function migrateM16VariableTokens(source) {
  const document = structuredClone(source);
  let changes = 0;
  for (const [name, definition] of Object.entries(document.variables ?? {})) {
    if (!definition || typeof definition !== "object" || Array.isArray(definition)
      || !Object.hasOwn(definition, "type") || !Object.hasOwn(definition, "value")) continue;
    document.variables[name] = {
      tokenType: definition.type,
      cascade: Array.isArray(definition.value) && definition.value.every((entry) => entry && typeof entry === "object" && Object.hasOwn(entry, "value"))
        ? structuredClone(definition.value)
        : [{ value: structuredClone(definition.value) }],
    };
    changes += 1;
  }
  return { document, changes };
}

export function migrateM17CascadeConditions(source) {
  const document = structuredClone(source);
  let changes = 0;
  const visit = (value) => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    if (Object.hasOwn(value, "value") && Object.hasOwn(value, "theme")) {
      value.when = { ...(value.when ?? {}), ...value.theme };
      delete value.theme;
      changes += 1;
    }
    Object.values(value).forEach(visit);
  };
  visit(document);
  return { document, changes };
}

function walkNodes(children, visitor) {
  for (const node of children ?? []) {
    visitor(node);
    walkNodes(node.children, visitor);
  }
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
