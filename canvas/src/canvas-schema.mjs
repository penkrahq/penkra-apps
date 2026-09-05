import { validateRichText } from "./rich-text.mjs";

export const CANVAS_SCHEMA_VERSION = 3;
export const CANVAS_MODULES = Object.freeze(["deck", "print", "web", "mobile"]);
export const CANVAS_ROLES = Object.freeze({ deck: ["slide"], print: ["page"], web: ["route"], mobile: ["ios", "android"] });
export const CANVAS_NODE_TYPES = Object.freeze(["frame", "group", "rectangle", "ellipse", "polygon", "line", "path", "text", "icon", "ref"]);

const fields = (names, overrides = {}) => Object.fromEntries(names.map((name) => [name, {
  type: "canvas-value",
  capability: true,
  ...(overrides[name] ?? {}),
}]));

export const CANVAS_SCHEMA = deepFreeze({
  schemaVersion: CANVAS_SCHEMA_VERSION,
  root: {
    type: "object",
    required: ["canvasSchemaVersion", "version", "module", "axes", "variables", "paragraphStyles", "imports", "flows", "children"],
    fields: fields(
      ["canvasSchemaVersion", "version", "module", "lang", "axes", "variables", "paragraphStyles", "imports", "flows", "children"],
      {
        canvasSchemaVersion: { type: "integer", const: CANVAS_SCHEMA_VERSION },
        version: { type: "string" },
        module: { type: "enum", values: CANVAS_MODULES },
        lang: { type: "string" },
        axes: { type: "record" },
        variables: { type: "record" },
        paragraphStyles: { type: "record" },
        imports: { type: "record" },
        flows: { type: "array" },
        children: { type: "array" },
      },
    ),
  },
  node: {
    required: ["id", "type"],
    groups: {
      common: fields(["id", "type", "name", "x", "y", "width", "height", "rotation", "flipX", "flipY", "opacity", "enabled", "export", "description", "decorative", "role", "size", "physical", "properties", "bind", "visible", "varies", "modes", "notesFor"], {
        id: { type: "string" }, type: { type: "enum", values: CANVAS_NODE_TYPES },
      }),
      layout: fields(["layout", "gap", "rowGap", "columnGap", "padding", "justifyContent", "alignItems", "wrap", "minWidth", "maxWidth", "minHeight", "maxHeight", "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow", "layoutPosition", "clip"]),
      paint: fields(["fill", "stroke", "effect", "blendMode", "cornerRadius"]),
      text: fields(["content", "style", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textAlign", "textAlignVertical", "textGrowth", "underline", "strikethrough", "lang", "headingLevel", "landmark", "linkName", "paragraphs", "marks"]),
      icon: fields(["icon", "library", "weight"]),
      path: fields(["geometry", "viewBox", "fillRule"]),
      ref: fields(["ref", "props"]),
    },
    variants: Object.fromEntries(CANVAS_NODE_TYPES.map((type) => [type, { type }])),
  },
  capability: {
    roles: Object.values(CANVAS_ROLES).flat(),
    relationships: ["ref", "import", "notesFor", "flow"],
    properties: [
      "fill.solid", "fill.image", "fill.gradient.linear", "fill.gradient.linear.transformed", "fill.gradient.radial", "fill.gradient.radial.transformed", "fill.gradient.angular", "fill.gradient.mesh", "fill.shader",
      "stroke.width", "stroke.align", "stroke.cap", "stroke.join", "stroke.dash", "stroke.fill",
      "effect.shadow", "effect.shadow.spread", "effect.blur", "effect.background_blur",
      "text.run.fill", "text.run.weight", "text.run.italic", "text.run.underline", "text.run.strikethrough", "text.run.fontFamily", "text.run.fontSize", "text.run.letterSpacing", "text.run.wordSpacing", "text.run.language", "text.run.link",
      "text.paragraph.align", "text.paragraph.style", "text.paragraph.list", "text.paragraph.headingLevel", "accessibility.description", "flow.advance", "flow.tap", "flow.hover", "flow.keypress",
    ],
  },
});

export function capabilityPathInventory() {
  const paths = new Set([
    ...capabilityFields(CANVAS_SCHEMA.root.fields).map((path) => `root.${path}`),
    ...CANVAS_SCHEMA.capability.roles.map((role) => `roles.${role}`),
    ...Object.keys(CANVAS_SCHEMA.node.variants).map((type) => `nodes.${type}`),
    ...Object.values(CANVAS_SCHEMA.node.groups).flatMap(capabilityFields).map((path) => `properties.${path}`),
    ...CANVAS_SCHEMA.capability.relationships.map((path) => `relationships.${path}`),
  ]);
  for (const path of CANVAS_SCHEMA.capability.properties) paths.add(`properties.${path}`);
  return [...paths].sort();
}

export function validateCanvasDocument(document, options = {}) {
  const errors = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) return invalid(["Document must be an object."], options);
  validateGeneratedShape(document, CANVAS_SCHEMA.root, "root", errors);
  if (typeof document.version !== "string") errors.push("version must preserve the OpenPencil string marker.");
  const nodes = new Map();
  const parents = new Map();
  walk(document.children, null, (node, parent) => {
    validateGeneratedNode(node, errors);
    if (typeof node.id !== "string" || !node.id) errors.push("Every node needs a non-empty id.");
    else if (nodes.has(node.id)) errors.push(`Duplicate node id ${node.id}.`);
    else { nodes.set(node.id, node); parents.set(node.id, parent); }
    if (node.export !== undefined && !["live", "image"].includes(node.export)) errors.push(`${node.id}.export must be live or image.`);
    if (node.decorative === true && node.description != null) errors.push(`${node.id}.description and decorative are mutually exclusive.`);
    if (node.role !== undefined && !CANVAS_ROLES[document.module]?.includes(node.role)) errors.push(`${node.id}.role ${node.role} is invalid for ${document.module}.`);
    if (node.type === "text") errors.push(...validateRichText(node));
    if (node.type === "ref" && typeof node.ref !== "string") errors.push(`${node.id}.ref must be a string.`);
    validateProperties(node, errors);
  });
  if (document.lang !== undefined && !validLanguage(document.lang)) errors.push("lang must be a valid BCP-47 language tag.");
  validateAxes(document.axes ?? {}, errors);
  validateVariables(document.variables ?? {}, errors);
  validateImports(document.imports ?? {}, errors);
  validateRoleNesting(nodes, parents, errors);
  validateNotes(nodes, parents, errors);
  validateAccessibility(document, nodes, errors);
  validateRefs(nodes, parents, errors);
  validateFlows(document.flows ?? [], nodes, parents, errors);
  return invalid(errors, options);
}

export function assertCapabilityTotality(table, inventory = capabilityPathInventory()) {
  const missing = inventory.filter((path) => !Object.hasOwn(table.properties ?? {}, path));
  const extra = Object.keys(table.properties ?? {}).filter((path) => !inventory.includes(path));
  const invalidVerdicts = Object.entries(table.properties ?? {}).filter(([, entry]) =>
    entry.verdict !== null && !["native", "raster", "ignore"].includes(entry.verdict));
  const unverified = Object.entries(table.properties ?? {}).filter(([, entry]) => entry.verdict === null && entry.status === "unverified");
  if (missing.length || extra.length || invalidVerdicts.length || unverified.length) {
    const error = new Error(`Capability table is not buildable: missing=${missing.join(",")} extra=${extra.join(",")} invalid=${invalidVerdicts.map(([p]) => p).join(",")} unverified=${unverified.map(([p]) => p).join(",")}`);
    error.code = "CANVAS_CAPABILITY_INCOMPLETE";
    throw error;
  }
  return true;
}

function validateProperties(node, errors) {
  if (node.properties === undefined) return;
  if (!plainObject(node.properties)) { errors.push(`${node.id}.properties must be an object.`); return; }
  for (const [name, property] of Object.entries(node.properties)) {
    if (!plainObject(property) || !["string", "number", "boolean", "color", "enum", "icon", "node"].includes(property.type)) errors.push(`${node.id}.properties.${name} has an invalid type.`);
    if (property?.optional === true && Object.hasOwn(property, "default")) errors.push(`${node.id}.properties.${name} cannot be optional and have a default.`);
    if (property?.type === "enum" && (!Array.isArray(property.values) || property.values.length === 0)) errors.push(`${node.id}.properties.${name} enum needs values.`);
  }
}

function validateAxes(axes, errors) {
  for (const [name, axis] of Object.entries(axes)) {
    if (!plainObject(axis) || !Array.isArray(axis.modes) || axis.modes.length === 0) { errors.push(`Axis ${name} needs a non-empty modes array.`); continue; }
    const names = axis.modes.map((mode) => mode?.name);
    if (names.some((mode) => typeof mode !== "string" || !mode)) errors.push(`Axis ${name} modes need non-empty names.`);
    if (new Set(names).size !== names.length) errors.push(`Axis ${name} mode names must be unique.`);
  }
}

function validateVariables(variables, errors) {
  for (const [name, variable] of Object.entries(variables)) {
    if (!plainObject(variable) || typeof variable.tokenType !== "string" || !variable.tokenType
      || !Array.isArray(variable.cascade) || variable.cascade.length === 0)
      errors.push(`Variable ${name} must declare tokenType and a non-empty cascade.`);
  }
}

function validateImports(imports, errors) {
  for (const [alias, record] of Object.entries(imports)) {
    if (!/^[A-Za-z][\w-]*$/u.test(alias)) errors.push(`Import alias ${alias} is invalid.`);
    if (!plainObject(record) || typeof record.documentId !== "string" || !record.documentId || (record.pin !== undefined && !["exact", "live"].includes(record.pin)) || (record.pin === "exact" && !Number.isInteger(record.version)))
      errors.push(`Import ${alias} must declare documentId and a valid live or exact pin.`);
  }
}

function validateRoleNesting(nodes, parents, errors) {
  for (const node of nodes.values()) if (node.role) {
    let ancestor = parents.get(node.id);
    while (ancestor) {
      if (nodes.get(ancestor)?.role) { errors.push(`${node.id} role-bearing frame is nested inside ${ancestor}.`); break; }
      ancestor = parents.get(ancestor);
    }
  }
}

function validateNotes(nodes, parents, errors) {
  const claimed = new Set();
  for (const node of nodes.values()) if (node.notesFor !== undefined) {
    const target = nodes.get(node.notesFor);
    if (node.type !== "text" || target?.type !== "frame" || target?.role !== "slide") errors.push(`${node.id}.notesFor must name a slide frame and may only appear on text.`);
    let ancestor = parents.get(node.id); let inside = false;
    while (ancestor) { if (ancestor === node.notesFor) inside = true; ancestor = parents.get(ancestor); }
    if (inside) errors.push(`${node.id} speaker notes must live outside ${node.notesFor}.`);
    if (claimed.has(node.notesFor)) errors.push(`More than one notes node claims ${node.notesFor}.`);
    claimed.add(node.notesFor);
  }
}

function validateAccessibility(document, nodes, errors) {
  for (const node of nodes.values()) {
    if (node.lang !== undefined && !validLanguage(node.lang)) errors.push(`${node.id}.lang must be a valid BCP-47 language tag.`);
    for (const [index, mark] of (node.marks ?? []).entries()) if (mark.type === "lang" && !validLanguage(mark.value)) errors.push(`${node.id}.marks[${index}] lang must be a valid BCP-47 tag.`);
    for (const [index, paragraph] of (node.paragraphs ?? []).entries()) {
      if (paragraph.headingLevel !== undefined && (!Number.isInteger(paragraph.headingLevel) || paragraph.headingLevel < 1 || paragraph.headingLevel > 6)) errors.push(`${node.id}.paragraphs[${index}].headingLevel must be 1–6.`);
      if (paragraph.style !== undefined && !Object.hasOwn(document.paragraphStyles ?? {}, paragraph.style)) errors.push(`${node.id}.paragraphs[${index}] references missing paragraph style ${paragraph.style}.`);
    }
    if (node.modes !== undefined) {
      if (!plainObject(node.modes)) errors.push(`${node.id}.modes must be an object.`);
      else for (const [axis, mode] of Object.entries(node.modes)) {
        const names = document.axes?.[axis]?.modes?.map((entry) => entry.name) ?? [];
        if (!names.includes(mode)) errors.push(`${node.id}.modes.${axis} references unknown axis mode ${mode}.`);
      }
    }
  }
}

function validateRefs(nodes, parents, errors) {
  const localRefs = new Map();
  for (const node of nodes.values()) if (node.type === "ref" && !node.ref.includes(":")) {
    localRefs.set(node.id, node.ref);
    if (!nodes.has(node.ref)) errors.push(`${node.id} references missing node ${node.ref}.`);
    let ancestor = parents.get(node.ref);
    while (ancestor) {
      if (nodes.get(ancestor)?.role) { errors.push(`${node.id} targets ${node.ref} inside role-bearing frame ${ancestor}.`); break; }
      ancestor = parents.get(ancestor);
    }
  }
  for (const start of localRefs.keys()) {
    const path = []; const seen = new Set(); let current = start;
    while (localRefs.has(current)) {
      if (seen.has(current)) { errors.push(`Ref cycle: ${[...path, current].join(" -> ")}.`); break; }
      seen.add(current); path.push(current); current = localRefs.get(current);
    }
  }
  const componentIds = new Set([...localRefs.values()].filter((id) => nodes.has(id)));
  const dependencies = new Map([...componentIds].map((id) => [id, new Set()]));
  const collectDependencies = (componentId, candidate) => {
    for (const child of candidate.children ?? []) {
      if (child.type === "ref" && !child.ref.includes(":") && componentIds.has(child.ref)) dependencies.get(componentId).add(child.ref);
      collectDependencies(componentId, child);
    }
  };
  for (const componentId of componentIds) collectDependencies(componentId, nodes.get(componentId));
  const visiting = new Set(); const visited = new Set();
  const visit = (componentId, path = []) => {
    if (visiting.has(componentId)) { errors.push(`Component ref cycle: ${[...path, componentId].join(" -> ")}.`); return; }
    if (visited.has(componentId)) return;
    visiting.add(componentId);
    for (const dependency of dependencies.get(componentId) ?? []) visit(dependency, [...path, componentId]);
    visiting.delete(componentId); visited.add(componentId);
  };
  for (const componentId of componentIds) visit(componentId);
}

function validateFlows(flows, nodes, parents, errors) {
  const signatures = new Set();
  for (const flow of flows) {
    const from = nodes.get(flow.from); const to = nodes.get(flow.to);
    if (!from?.role || !to?.role || from.role !== to.role) errors.push(`Flow ${flow.id} endpoints must be role-bearing frames with the same role.`);
    if (!flow.trigger || !["advance", "tap", "hover", "keypress"].includes(flow.trigger.kind)) errors.push(`Flow ${flow.id} has an invalid trigger.`);
    if (flow.trigger?.kind !== "advance" && !flow.trigger?.source) errors.push(`Flow ${flow.id} trigger requires source.`);
    if (flow.trigger?.source) {
      const source = flow.trigger.source;
      if (!Array.isArray(source.path) || source.path.some((id) => typeof id !== "string") || typeof source.node !== "string") errors.push(`Flow ${flow.id} source must be a typed instance path.`);
      else if (source.path.length === 0) {
        if (!nodes.has(source.node) || !isDescendant(source.node, flow.from, parents)) errors.push(`Flow ${flow.id} source ${source.node} must live inside ${flow.from}.`);
      } else validateFlowInstancePath(flow, source, nodes, parents, errors);
    }
    const signature = JSON.stringify([flow.from, flow.trigger?.source, flow.trigger]);
    if (signatures.has(signature)) errors.push(`Flow ${flow.id} duplicates an existing flow.`);
    signatures.add(signature);
  }
}

function validateFlowInstancePath(flow, source, nodes, parents, errors) {
  let container = flow.from;
  for (const [index, instanceId] of source.path.entries()) {
    const instance = nodes.get(instanceId);
    if (instance?.type !== "ref" || instance.ref.includes(":")) {
      errors.push(`Flow ${flow.id} source path ${instanceId} must name a local ref instance.`);
      return;
    }
    if (!isDescendant(instanceId, container, parents)) {
      errors.push(`Flow ${flow.id} source path ${instanceId} is outside ${container}.`);
      return;
    }
    const target = nodes.get(instance.ref);
    if (!target) {
      errors.push(`Flow ${flow.id} source path ${instanceId} targets missing ${instance.ref}.`);
      return;
    }
    container = target.id;
    if (index + 1 < source.path.length && !nodes.has(source.path[index + 1])) {
      errors.push(`Flow ${flow.id} source path contains missing ${source.path[index + 1]}.`);
      return;
    }
  }
  if (!nodes.has(source.node) || (source.node !== container && !isDescendant(source.node, container, parents)))
    errors.push(`Flow ${flow.id} source node ${source.node} is outside the final component ${container}.`);
}

function isDescendant(nodeId, ancestorId, parents) { let current = parents.get(nodeId); while (current) { if (current === ancestorId) return true; current = parents.get(current); } return false; }

function walk(children = [], parent, visit) {
  for (const node of children) { visit(node, parent); walk(node.children, node.id, visit); }
}

function plainObject(value) { return value && typeof value === "object" && !Array.isArray(value); }
function capabilityFields(definition) { return Object.entries(definition).flatMap(([name, field]) => field.capability ? [name] : []); }
function validateGeneratedNode(node, errors) {
  const schema = {
    type: "object",
    required: CANVAS_SCHEMA.node.required,
    fields: Object.assign({}, ...Object.values(CANVAS_SCHEMA.node.groups)),
  };
  validateGeneratedShape(node, schema, node?.id ?? "node", errors);
}
function validateGeneratedShape(value, schema, path, errors) {
  if (!plainObject(value)) { errors.push(`${path} must be an object.`); return; }
  for (const name of schema.required ?? []) if (!Object.hasOwn(value, name)) errors.push(`${path}.${name} is required.`);
  for (const [name, field] of Object.entries(schema.fields ?? {})) {
    if (!Object.hasOwn(value, name)) continue;
    const candidate = value[name];
    if (field.type === "canvas-value") continue;
    if (field.type === "string" && typeof candidate !== "string") errors.push(`${path}.${name} must be a string.`);
    if (field.type === "integer" && !Number.isInteger(candidate)) errors.push(`${path}.${name} must be an integer.`);
    if (field.type === "array" && !Array.isArray(candidate)) errors.push(`${path}.${name} must be an array.`);
    if (field.type === "record" && !plainObject(candidate)) errors.push(`${path}.${name} must be an object.`);
    if (field.type === "enum" && !field.values.includes(candidate)) errors.push(`${path}.${name} must be one of ${field.values.join(", ")}.`);
    if (Object.hasOwn(field, "const") && candidate !== field.const) errors.push(`${path}.${name} must be ${field.const}.`);
  }
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function validLanguage(value) { try { return typeof value === "string" && Boolean(new Intl.Locale(value)); } catch { return false; } }
function invalid(errors, options) {
  if (errors.length && options.throw !== false) { const error = new Error(errors.join("\n")); error.code = "CANVAS_SCHEMA_INVALID"; error.errors = errors; throw error; }
  return { valid: errors.length === 0, errors };
}
