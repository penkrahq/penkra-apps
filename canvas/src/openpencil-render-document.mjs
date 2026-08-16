import { lucideIconGeometry, phosphorIconGeometry } from "./lucide-render-icon.mjs";

const NUMERIC_PROPERTIES = new Set([
  "x",
  "y",
  "width",
  "height",
  "gap",
  "opacity",
  "rotation",
  "strokeWidth",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
  "thickness",
]);

const BOOLEAN_PROPERTIES = new Set(["enabled", "clip"]);
const NUMERIC_ARRAY_PROPERTIES = new Set(["cornerRadius", "padding"]);
const VARIABLE_PROPERTIES = new Set([
  ...NUMERIC_PROPERTIES,
  ...BOOLEAN_PROPERTIES,
  ...NUMERIC_ARRAY_PROPERTIES,
  "fill",
  "stroke",
  "fontFamily",
  "icon",
]);

export function prepareOpenPencilRenderDocument(source) {
  const document = structuredClone(source);
  const variables = source?.variables && typeof source.variables === "object"
    ? source.variables
    : {};
  const defaultTheme = Object.fromEntries(
    Object.entries(source?.themes ?? {})
      .filter(([, values]) => Array.isArray(values) && typeof values[0] === "string")
      .map(([axis, values]) => [axis, values[0]]),
  );
  const issues = [];

  const resolveReference = (reference, theme, trail = []) => {
    const name = reference.slice(1);
    if (trail.includes(name)) {
      return { ok: false, reason: `Variable cycle: ${[...trail, name].join(" → ")}` };
    }
    const definition = variables[name];
    if (!definition || typeof definition !== "object" || !("value" in definition)) {
      return { ok: false, reason: `Variable ${reference} was not found.` };
    }
    const selected = selectVariableValue(definition.value, theme);
    if (!selected.ok) return selected;
    if (isKnownVariableReference(selected.value, variables)) {
      return resolveReference(selected.value, theme, [...trail, name]);
    }
    return { ok: true, value: structuredClone(selected.value) };
  };

  const resolveValue = (value, property, theme, nodeId) => {
    if (isVariableReference(value, property)) {
      const resolved = resolveReference(value, theme);
      if (!resolved.ok) {
        issues.push(variableIssue(nodeId, value, resolved.reason));
        return safeFallback(property, value);
      }
      if (!validPropertyValue(property, resolved.value)) {
        issues.push(variableIssue(
          nodeId,
          value,
          `Variable ${value} resolved to an invalid ${property} value.`,
        ));
        return safeFallback(property, value);
      }
      return resolved.value;
    }
    if (Array.isArray(value)) {
      return value.map((item) => resolveValue(item, property, theme, nodeId));
    }
    if (value && typeof value === "object") {
      return resolveObject(value, theme, nodeId);
    }
    return value;
  };

  const resolveObject = (object, inheritedTheme, inheritedNodeId = null) => {
    const theme = isRecord(object.theme)
      ? { ...inheritedTheme, ...object.theme }
      : inheritedTheme;
    const nodeId = typeof object.id === "string" ? object.id : inheritedNodeId;
    for (const [property, value] of Object.entries(object)) {
      if (property === "theme") continue;
      object[property] = resolveValue(value, property, theme, nodeId);
    }
    if (object.type === "icon") adaptIcon(object, issues, nodeId);
    return object;
  };

  for (const node of document.children ?? []) resolveObject(node, defaultTheme);
  return { document, issues };
}

function adaptIcon(node, issues, nodeId) {
  const geometry = node.library === "lucide"
    ? lucideIconGeometry(node.icon)
    : node.library === "phosphor"
      ? phosphorIconGeometry(node.icon)
      : null;
  if (!geometry) {
    issues.push(iconIssue(
      nodeId,
      `${node.library ?? "Unknown"} icon ${node.icon ?? "(unnamed)"} is not supported.`,
    ));
    return;
  }
  const color = typeof node.fill === "string" ? node.fill : node.fill?.color;
  node.type = "path";
  node.geometry = geometry;
  if (node.library === "lucide") {
    node.stroke = {
      align: "center",
      thickness: 2,
      join: "round",
      cap: "round",
      fill: typeof color === "string" ? color : "#000000",
    };
  } else {
    node.fill = typeof color === "string" ? color : "#000000";
  }
  if (node.library === "lucide") delete node.fill;
  delete node.icon;
  delete node.library;
  delete node.weight;
}

function selectVariableValue(value, theme) {
  if (!Array.isArray(value)) return { ok: true, value };
  let selected;
  let found = false;
  let specificity = -1;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || !("value" in entry)) continue;
    const conditions = isRecord(entry.theme) ? Object.entries(entry.theme) : [];
    if (!conditions.every(([axis, mode]) => theme[axis] === mode)) continue;
    if (conditions.length > specificity) {
      selected = entry.value;
      found = true;
      specificity = conditions.length;
    }
  }
  return !found
    ? { ok: false, reason: "Variable has no value compatible with the active node theme." }
    : { ok: true, value: selected };
}

function isVariableReference(value, property) {
  return typeof value === "string" && value.startsWith("$") && VARIABLE_PROPERTIES.has(property);
}

function isKnownVariableReference(value, variables) {
  return typeof value === "string" && value.startsWith("$") && Object.hasOwn(variables, value.slice(1));
}

function validPropertyValue(property, value) {
  if (NUMERIC_PROPERTIES.has(property)) {
    if (["width", "height"].includes(property) && typeof value === "string") return true;
    return typeof value === "number" && Number.isFinite(value);
  }
  if (BOOLEAN_PROPERTIES.has(property)) return typeof value === "boolean";
  if (NUMERIC_ARRAY_PROPERTIES.has(property)) {
    return typeof value === "number" && Number.isFinite(value)
      || Array.isArray(value) && value.every((item) => typeof item === "number" && Number.isFinite(item));
  }
  return true;
}

function safeFallback(property, original) {
  if (NUMERIC_PROPERTIES.has(property)) return property === "opacity" ? 1 : 0;
  if (BOOLEAN_PROPERTIES.has(property)) return property === "enabled";
  if (NUMERIC_ARRAY_PROPERTIES.has(property)) return 0;
  return original;
}

function variableIssue(nodeId, reference, message) {
  return {
    nodeId,
    kind: "variable",
    message: `${message} The original ${reference} reference is preserved in the Canvas document.`,
  };
}

function iconIssue(nodeId, message) {
  return {
    nodeId,
    kind: "icon",
    message: `${message} The original icon is preserved in the Canvas document.`,
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
