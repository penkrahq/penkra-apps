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
  const materialized = materializePencilInstances(source);
  const document = materialized.document;
  const variables = source?.variables && typeof source.variables === "object"
    ? source.variables
    : {};
  const defaultTheme = Object.fromEntries(
    Object.entries(source?.themes ?? {})
      .filter(([, values]) => Array.isArray(values) && typeof values[0] === "string")
      .map(([axis, values]) => [axis, values[0]]),
  );
  const issues = [...materialized.issues];

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
    normalizePencilNode(object, issues, nodeId);
    return object;
  };

  for (const node of document.children ?? []) resolveObject(node, defaultTheme);
  return { document, issues };
}

function materializePencilInstances(source) {
  const document = structuredClone(source);
  const components = new Map();
  const issues = [];

  const index = (node) => {
    if (node?.reusable && typeof node.id === "string") {
      components.set(node.id, structuredClone(node));
    }
    for (const child of node?.children ?? []) index(child);
  };
  for (const node of document.children ?? []) index(node);

  const markSourceIds = (node) => {
    if (!node || typeof node !== "object") return;
    node.__penSourceId = node.id;
    for (const child of node.children ?? []) markSourceIds(child);
  };

  const mergeOverride = (target, override) => {
    for (const [key, value] of Object.entries(override)) {
      if (key === "theme" && isRecord(value)) {
        target.theme = { ...(isRecord(target.theme) ? target.theme : {}), ...structuredClone(value) };
      } else {
        target[key] = structuredClone(value);
      }
    }
  };

  const findDescendant = (root, sourceId) => {
    for (const child of root.children ?? []) {
      if (child.__penSourceId === sourceId) return child;
      const nested = findDescendant(child, sourceId);
      if (nested) return nested;
    }
    return null;
  };

  const findPath = (root, path) => {
    let current = root;
    for (const segment of path.split("/")) {
      current = findDescendant(current, segment);
      if (!current) return null;
    }
    return current;
  };

  const findParentOf = (root, sourceId) => {
    for (let index = 0; index < (root.children ?? []).length; index += 1) {
      const child = root.children[index];
      if (child.__penSourceId === sourceId) return { parent: root, index };
      const nested = findParentOf(child, sourceId);
      if (nested) return nested;
    }
    return null;
  };

  const replacePath = (root, path, replacement) => {
    const parts = path.split("/");
    const leaf = parts.pop();
    const parent = parts.length > 0 ? findPath(root, parts.join("/")) : root;
    if (!parent) return false;
    const location = findParentOf(parent, leaf);
    if (!location) return false;
    const next = structuredClone(replacement);
    markSourceIds(next);
    location.parent.children[location.index] = next;
    return true;
  };

  const assignRenderIds = (node, rootId, path = []) => {
    if (path.length > 0) node.id = `${rootId}::${path.join("::")}`;
    const counts = new Map();
    for (const child of node.children ?? []) {
      const sourceId = child.__penSourceId ?? child.id ?? "node";
      const count = counts.get(sourceId) ?? 0;
      counts.set(sourceId, count + 1);
      assignRenderIds(child, rootId, [...path, count === 0 ? sourceId : `${sourceId}-${count}`]);
    }
  };

  const expand = (node, stack = []) => {
    if (!node || typeof node !== "object") return node;
    if (node.type !== "ref") {
      node.__penSourceId ??= node.id;
      node.children = (node.children ?? []).map((child) => expand(child, stack));
      return node;
    }

    const component = components.get(node.ref);
    if (!component || stack.includes(node.ref)) {
      issues.push({
        nodeId: node.id,
        kind: "component",
        message: component
          ? `Component cycle ${[...stack, node.ref].join(" → ")} is preserved but cannot be rendered.`
          : `Component ${node.ref ?? "(missing)"} was not found.`,
      });
      return node;
    }

    const instance = structuredClone(component);
    markSourceIds(instance);
    instance.children = (instance.children ?? []).map((child) => expand(child, [...stack, node.ref]));
    const rootOverrides = Object.fromEntries(
      Object.entries(node).filter(([key]) => !["type", "ref", "descendants", "children"].includes(key)),
    );
    mergeOverride(instance, rootOverrides);
    instance.id = node.id;
    instance.__penSourceId = node.__penSourceId ?? node.id;
    instance.reusable = false;

    for (const [path, override] of Object.entries(node.descendants ?? {})) {
      if (override?.type) {
        if (!replacePath(instance, path, override)) {
          issues.push(componentOverrideIssue(node.id, path));
        }
        continue;
      }
      const target = findPath(instance, path);
      if (!target) {
        issues.push(componentOverrideIssue(node.id, path));
        continue;
      }
      mergeOverride(target, override);
      if (override?.children) {
        target.children = target.children.map((child) => expand(child, [...stack, node.ref]));
      }
    }

    instance.children = (instance.children ?? []).map((child) => expand(child, [...stack, node.ref]));
    assignRenderIds(instance, node.id);
    return instance;
  };

  document.children = (document.children ?? []).map((node) => expand(node));
  const stripSourceIds = (node) => {
    delete node.__penSourceId;
    for (const child of node.children ?? []) stripSourceIds(child);
  };
  for (const node of document.children) stripSourceIds(node);
  return { document, issues };
}

function componentOverrideIssue(nodeId, path) {
  return {
    nodeId,
    kind: "component",
    message: `Component descendant ${path} was not found while rendering instance ${nodeId}.`,
  };
}

function normalizePencilNode(node, issues, nodeId) {
  if (!node || typeof node !== "object" || !node.type) return;
  node.width = normalizePencilSize(node.width);
  node.height = normalizePencilSize(node.height);

  if (node.type === "frame") {
    node.layout ??= "horizontal";
    node.width ??= "hug_content";
    node.height ??= "hug_content";
  }
  if (node.justifyContent === "space_between") node.justifyContent = "space-between";
  if (node.justifyContent === "space_around") {
    node.justifyContent = "space-between";
    issues.push({
      nodeId,
      kind: "layout",
      message: "space_around is approximated with space_between by the current Canvas renderer.",
    });
  }
  if (node.textAlign === "justify") node.textAlign = "justified";
  if (node.textAlignVertical === "middle") node.textAlignVertical = "center";

  if (node.stroke !== undefined && !isOpenPencilStroke(node.stroke)) {
    const fills = Array.isArray(node.stroke) ? node.stroke : [node.stroke];
    const fill = fills.find((candidate) => candidate?.enabled !== false);
    const color = typeof fill === "string" ? fill : fill?.color;
    if (typeof color === "string") {
      node.stroke = {
        fill: color,
        thickness: node.strokeWidth ?? 1,
        align: ({ inner: "inside", outer: "outside" })[node.strokeAlignment] ?? "center",
        join: node.strokeLinejoin,
        cap: node.strokeLinecap,
      };
    } else {
      issues.push({
        nodeId,
        kind: "stroke",
        message: "This stroke fill is preserved but is not represented by the current Canvas renderer.",
      });
      delete node.stroke;
    }
  }
}

function normalizePencilSize(value) {
  if (typeof value !== "string") return value;
  return /^fit_content(?:\([^)]*\))?$/.test(value) ? "hug_content" : value;
}

function isOpenPencilStroke(value) {
  return isRecord(value) && Object.hasOwn(value, "fill") && Object.hasOwn(value, "thickness");
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
  let fallback;
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || !("value" in entry)) continue;
    fallback ??= entry.value;
    const conditions = isRecord(entry.theme) ? Object.entries(entry.theme) : [];
    if (!conditions.every(([axis, mode]) => theme[axis] === mode)) continue;
    if (conditions.length > specificity) {
      selected = entry.value;
      found = true;
      specificity = conditions.length;
    }
  }
  if (found) return { ok: true, value: selected };
  if (fallback !== undefined) return { ok: true, value: fallback };
  return { ok: false, reason: "Variable has no values." };
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
