import { validateRichText } from "./rich-text.mjs";

export const CANVAS_SCHEMA_VERSION = 3;
export const CANVAS_MODULES = Object.freeze(["deck", "print", "web", "mobile"]);
export const CANVAS_ROLES = Object.freeze({ deck: ["slide"], print: ["page"], web: ["route"], mobile: ["ios", "android"] });
export const CANVAS_NODE_TYPES = Object.freeze(["frame", "group", "rectangle", "ellipse", "polygon", "line", "path", "text", "icon", "ref"]);

export const CANVAS_SCHEMA = Object.freeze({
  root: ["canvasSchemaVersion", "version", "module", "lang", "axes", "variables", "paragraphStyles", "imports", "flows", "children"],
  common: ["id", "type", "name", "x", "y", "width", "height", "rotation", "flipX", "flipY", "opacity", "enabled", "export", "description", "decorative", "role", "size", "physical", "properties", "bind", "visible", "varies", "readingOrder", "notesFor"],
  layout: ["layout", "gap", "rowGap", "columnGap", "padding", "justifyContent", "alignItems", "wrap", "minWidth", "maxWidth", "minHeight", "maxHeight", "gridTemplateColumns", "gridTemplateRows", "gridColumn", "gridRow", "layoutPosition", "clip"],
  paint: ["fill", "stroke", "effect", "blendMode", "cornerRadius"],
  text: ["content", "style", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textAlign", "textAlignVertical", "textGrowth", "underline", "strikethrough", "lang", "headingLevel", "landmark", "linkName", "paragraphs", "marks"],
  icon: ["icon", "library", "weight"],
  path: ["geometry", "viewBox", "fillRule"],
  ref: ["ref", "props"],
});

export function capabilityPathInventory() {
  const paths = new Set([
    ...CANVAS_SCHEMA.root.map((path) => `root.${path}`),
    ...Object.values(CANVAS_ROLES).flat().map((role) => `roles.${role}`),
    ...CANVAS_NODE_TYPES.map((type) => `nodes.${type}`),
    ...[...CANVAS_SCHEMA.common, ...CANVAS_SCHEMA.layout, ...CANVAS_SCHEMA.paint,
      ...CANVAS_SCHEMA.text, ...CANVAS_SCHEMA.icon, ...CANVAS_SCHEMA.path, ...CANVAS_SCHEMA.ref]
      .map((path) => `properties.${path}`),
    "relationships.ref", "relationships.import", "relationships.notesFor",
    "relationships.readingOrder", "relationships.flow",
  ]);
  for (const path of [
    "fill.solid", "fill.image", "fill.gradient.linear", "fill.gradient.linear.transformed", "fill.gradient.radial", "fill.gradient.radial.transformed", "fill.gradient.angular", "fill.gradient.mesh", "fill.shader",
    "stroke.width", "stroke.align", "stroke.cap", "stroke.join", "stroke.dash", "stroke.fill",
    "effect.shadow", "effect.shadow.spread", "effect.blur", "effect.background_blur",
    "text.run.fill", "text.run.weight", "text.run.italic", "text.run.underline", "text.run.strikethrough", "text.run.fontFamily", "text.run.fontSize", "text.run.letterSpacing", "text.run.wordSpacing", "text.run.language", "text.run.link",
    "text.paragraph.align", "text.paragraph.style", "text.paragraph.list", "text.paragraph.headingLevel", "accessibility.description", "accessibility.readingOrder", "flow.advance", "flow.tap", "flow.hover", "flow.keypress",
  ]) paths.add(`properties.${path}`);
  return [...paths].sort();
}

export function validateCanvasDocument(document, options = {}) {
  const errors = [];
  if (!document || typeof document !== "object" || Array.isArray(document)) return invalid(["Document must be an object."], options);
  if (document.canvasSchemaVersion !== CANVAS_SCHEMA_VERSION) errors.push(`canvasSchemaVersion must be ${CANVAS_SCHEMA_VERSION}.`);
  if (typeof document.version !== "string") errors.push("version must preserve the OpenPencil string marker.");
  if (!CANVAS_MODULES.includes(document.module)) errors.push(`module must be one of ${CANVAS_MODULES.join(", ")}.`);
  for (const field of ["axes", "variables", "paragraphStyles", "imports"])
    if (!plainObject(document[field])) errors.push(`${field} must be an object.`);
  if (!Array.isArray(document.flows)) errors.push("flows must be an array.");
  if (!Array.isArray(document.children)) errors.push("children must be an array.");
  const nodes = new Map();
  const parents = new Map();
  walk(document.children, null, (node, parent) => {
    if (!CANVAS_NODE_TYPES.includes(node.type)) errors.push(`${node.id ?? "<missing>"}.type ${node.type} is not in the node vocabulary.`);
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
  validateImports(document.imports ?? {}, errors);
  validateRoleNesting(nodes, parents, errors);
  validateNotes(nodes, parents, errors);
  validateAccessibility(document, nodes, errors);
  validateMarkOverlapPolicy(nodes, errors);
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
    if (!node.role || node.readingOrder === undefined) continue;
    if (!Array.isArray(node.readingOrder)) { errors.push(`${node.id}.readingOrder must be an array.`); continue; }
    const descendants = [];
    const visit = (candidate) => { for (const child of candidate.children ?? []) { if (child.decorative !== true) descendants.push(child.id); visit(child); } };
    visit(node);
    if (node.readingOrder.length !== descendants.length || new Set(node.readingOrder).size !== node.readingOrder.length || descendants.some((id) => !node.readingOrder.includes(id))) errors.push(`${node.id}.readingOrder must cover every non-decorative descendant exactly once.`);
  }
}

function validateMarkOverlapPolicy(nodes, errors) {
  for (const node of nodes.values()) {
    const marks = node.marks ?? [];
    for (let left = 0; left < marks.length; left += 1) {
      for (let right = left + 1; right < marks.length; right += 1) {
        if (marks[left].type !== marks[right].type) continue;
        if (marks[left].from < marks[right].to && marks[right].from < marks[left].to) {
          errors.push(`${node.id}.marks[${left}] and marks[${right}] overlap with the same type; precedence is not specified.`);
        }
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
function validLanguage(value) { try { return typeof value === "string" && Boolean(new Intl.Locale(value)); } catch { return false; } }
function invalid(errors, options) {
  if (errors.length && options.throw !== false) { const error = new Error(errors.join("\n")); error.code = "CANVAS_SCHEMA_INVALID"; error.errors = errors; throw error; }
  return { valid: errors.length === 0, errors };
}
