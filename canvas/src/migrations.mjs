const LEGACY_VARIABLE_REFERENCE = /^\$([A-Za-z][\w-]*)$/;
const TEXT_STYLE_KEYS = Object.freeze([
  "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
  "wordSpacing", "textAlign", "textAlignVertical", "underline", "strikethrough", "fill",
]);
const LOGICAL_ALIGNMENT_KEYS = new Set(["align", "textAlign", "justifyContent", "alignItems"]);

export function migrateM2AssignModule(source, options = {}) {
  const document = structuredClone(source);
  if (document.module !== undefined) return { document, changes: 0 };
  const module = options.module ?? inferLegacyModule(document);
  if (!new Set(["deck", "print", "web", "mobile"]).has(module)) {
    throw migrationError("M2", `Cannot assign module ${String(module)}.`);
  }
  document.module = module;
  return { document, changes: 1, notes: [`Inferred document module \`${module}\` from its frame geometry.`] };
}

export function migrateM3DropReusable(source) {
  const document = structuredClone(source);
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (!Object.hasOwn(node, "reusable")) return;
    delete node.reusable;
    changes += 1;
  });
  return { document, changes, notes: changes ? [`Dropped \`reusable\` from ${changes} node(s); canonical components have no status field.`] : [] };
}

export function migrateM4Descendants(source) {
  const document = structuredClone(source);
  const nodes = indexNodes(document.children);
  const parents = indexParents(document.children);
  let changes = 0;
  const notes = [];
  const instances = [];
  const collectInstances = (children, depth = 0) => {
    for (const node of children ?? []) {
      if (node?.type === "ref") instances.push({ instance: node, depth });
      collectInstances(node?.children, depth + 1);
    }
  };
  collectInstances(document.children);
  instances.sort((left, right) => right.depth - left.depth);
  for (const { instance } of instances) {
    if (instance.type !== "ref") continue;
    const target = nodes.get(instance.ref);
    const nestedInRole = target ? hasRoleAncestor(instance.ref, nodes, parents) : false;
    if (!isRecord(instance.descendants) && !nestedInRole) continue;
    if (target) {
      replaceObject(instance, materializeLegacyInstance(instance, target, notes));
      notes.push(nestedInRole
        ? `Approximated ref \`${instance.id}\` as a materialized clone because its legacy target was nested inside an export frame.`
        : `Approximated ref \`${instance.id}\` as a materialized clone so its descendant overrides remain visible.`);
    } else {
      const missing = instance.ref;
      const fallback = { ...structuredClone(instance), type: "group", children: [] };
      for (const key of ["ref", "descendants", "props", "role", "size", "physical"]) delete fallback[key];
      replaceObject(instance, fallback);
      notes.push(`Dropped unresolved component target \`${missing}\` from ref \`${instance.id}\`; retained the instance box as an empty group.`);
    }
    changes += 1;
  }
  return { document, changes, notes };
}

function indexParents(children, parentId = null, output = new Map()) {
  for (const node of children ?? []) {
    if (typeof node?.id === "string") output.set(node.id, parentId);
    indexParents(node?.children, node?.id ?? parentId, output);
  }
  return output;
}

function hasRoleAncestor(nodeId, nodes, parents) {
  let ancestor = parents.get(nodeId);
  while (ancestor) {
    if (nodes.get(ancestor)?.role) return true;
    ancestor = parents.get(ancestor);
  }
  return false;
}

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
      const mapStart = (offset) => offset === 0 ? 0 : offset + 1;
      const mapEnd = (offset) => offset <= 1 ? offset : offset + 1;
      const remap = (range) => range.from === 0 && range.to === beforeLength
        ? { ...range, from: 0, to: beforeLength + 2 }
        : { ...range, from: mapStart(range.from), to: mapEnd(range.to) };
      migrated.marks = (value.marks ?? []).map(remap);
      migrated.paragraphs = (value.paragraphs ?? []).map(remap);
    }
    return migrated;
  };
  return { document: visit(document), changes, notes: changes ? [`Approximated ${changes} legacy whole-value variable reference(s) with canonical interpolation delimiters.`] : [] };
}

export function migrateM5DeleteEditorSlots(source) {
  const document = structuredClone(source);
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (!Object.hasOwn(node, "slot")) return;
    delete node.slot;
    changes += 1;
  });
  return { document, changes, notes: changes ? [`Dropped ${changes} Pencil editor-chrome \`slot\` field(s).`] : [] };
}

export function migrateM6UniformText(source) {
  const document = structuredClone(source);
  document.paragraphStyles ??= {};
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (node.type !== "text" || typeof node.content !== "string") return;
    if (Array.isArray(node.marks) && Array.isArray(node.paragraphs)) return;
    node.marks = Array.isArray(node.marks) ? node.marks : [];
    if (node.content.length === 0) {
      node.paragraphs = [];
      return;
    }
    const style = Object.fromEntries(TEXT_STYLE_KEYS.flatMap((key) => (
      Object.hasOwn(node, key) ? [[key, structuredClone(node[key])]] : []
    )));
    const styleName = `m6-${node.id}`;
    if (Object.keys(style).length > 0) document.paragraphStyles[styleName] = style;
    node.paragraphs = paragraphPartition(node.content).map((range) => (
      Object.keys(style).length > 0 ? { ...range, style: styleName } : range
    ));
    changes += 1;
  });
  return { document, changes, notes: changes ? [`Inferred paragraph partitions and uniform paragraph styles for ${changes} legacy text node(s).`] : [] };
}

export function migrateM7AssignRoles(source, options = {}) {
  const document = structuredClone(source);
  if (document.module === "generic") return { document, changes: 0, notes: [] };
  const roleById = options.roleById ?? {};
  const defaultRole = { deck: "slide", print: "page", web: "route", mobile: "ios" }[document.module];
  if (!defaultRole) throw migrationError("M7", `Document module ${String(document.module)} cannot supply roles.`);
  const componentTargets = new Set();
  walkNodes(document.children, (node) => {
    if (node.type === "ref" && typeof node.ref === "string" && !node.ref.includes(":")) {
      componentTargets.add(node.ref);
    }
  });
  let changes = 0;
  for (const node of document.children ?? []) {
    if (node?.type !== "frame" || node.role !== undefined || componentTargets.has(node.id)) continue;
    const role = roleById[node.id] ?? defaultRole;
    if (document.module === "mobile" && !["ios", "android"].includes(role)) {
      throw migrationError("M7", `${node.id} needs role ios or android.`);
    }
    node.role = role;
    changes += 1;
  }
  return { document, changes, notes: changes ? [`Inferred export roles for ${changes} top-level frame(s) from document module \`${document.module}\`.`] : [] };
}

export function migrateM8AddFlows(source) {
  const document = structuredClone(source);
  if (document.flows !== undefined) return { document, changes: 0 };
  document.flows = [];
  return { document, changes: 1, notes: ["Inferred an empty reserved flow collection."] };
}

export function migrateM10Scripts(source) {
  const document = structuredClone(source);
  let changes = 0;
  const notes = [];
  transformNodes(document.children, (node) => {
    if (node.type !== "script") return node;
    changes += 1;
    notes.push(`Dropped script node \`${node.id}\`${node.scriptUri ? ` (\`${node.scriptUri}\`)` : ""}; no materialized output was stored in the document.`);
    return [];
  });
  return { document, changes, notes };
}

export function migrateM11Notes(source) {
  const document = structuredClone(source);
  let changes = 0;
  const notes = [];
  walkNodes(document.children, (node) => {
    if (node.type !== "note") return;
    node.type = "text";
    if (typeof node.notesFor !== "string" || !node.notesFor) delete node.notesFor;
    normalizeMigratedText(node);
    notes.push(node.notesFor
      ? `Approximated note \`${node.id}\` as text and retained its explicit \`notesFor\` link.`
      : `Approximated note \`${node.id}\` as ordinary text because no explicit slide association existed.`);
    changes += 1;
  });
  return { document, changes, notes };
}

export function migrateM12Contexts(source) { return migrateStickyType(source, "context", "M12"); }
export function migrateM13Prompts(source) { return migrateStickyType(source, "prompt", "M13"); }

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
  if (!isRecord(document.axes)) {
    document.axes = {};
    changes += 1;
  }
  return { document, changes, notes: changes ? [`Approximated ${changes} legacy theme definition(s) as canonical axes.`] : [] };
}

export function migrateM15NodeModes(source) {
  const document = structuredClone(source);
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (!node.theme) return;
    const modes = typeof node.theme === "string"
      ? { theme: node.theme }
      : !Array.isArray(node.theme) && typeof node.theme === "object" ? node.theme : null;
    if (!modes) return;
    node.modes = { ...(node.modes ?? {}), ...modes };
    delete node.theme;
    changes += 1;
  });
  return { document, changes, notes: changes ? [`Approximated ${changes} node theme override(s) as canonical axis modes.`] : [] };
}

export function migrateM16VariableTokens(source) {
  const document = structuredClone(source);
  let changes = 0;
  if (!isRecord(document.variables)) {
    document.variables = {};
    changes += 1;
  }
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
  return { document, changes, notes: changes ? [`Approximated ${changes} legacy variable definition(s) as typed cascades.`] : [] };
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
  return { document, changes, notes: changes ? [`Approximated ${changes} legacy theme condition(s) as canonical \`when\` conditions.`] : [] };
}

export function migrateM18LogicalDirections(source) {
  const document = structuredClone(source);
  let changes = 0;
  const visit = (value, parentKey = null) => {
    if (Array.isArray(value)) { value.forEach((entry) => visit(entry, parentKey)); return; }
    if (!isRecord(value)) return;
    if (["padding", "margin"].includes(parentKey)) {
      for (const [from, to] of [["left", "start"], ["right", "end"]]) {
        if (!Object.hasOwn(value, from)) continue;
        if (!Object.hasOwn(value, to)) value[to] = value[from];
        delete value[from];
        changes += 1;
      }
    }
    for (const [key, child] of Object.entries(value)) {
      if (LOGICAL_ALIGNMENT_KEYS.has(key) && (child === "left" || child === "right")) {
        value[key] = child === "left" ? "start" : "end";
        changes += 1;
      } else visit(child, key);
    }
  };
  visit(document);
  return { document, changes, notes: changes ? [`Inferred logical start/end values for ${changes} legacy left/right field(s); an existing canonical value won conflicts.`] : [] };
}

function walkNodes(children, visitor) {
  for (const node of children ?? []) {
    visitor(node);
    walkNodes(node.children, visitor);
  }
}

function inferLegacyModule(document) {
  const frames = (document.children ?? []).filter((node) => node?.type === "frame");
  if (frames.some((node) => finiteSize(node.width) && finiteSize(node.height)
    && Math.abs(node.width / node.height - 16 / 9) <= 0.02)) return "deck";
  if (frames.some((node) => finiteSize(node.width) && finiteSize(node.height)
    && node.height > node.width && node.height / node.width >= 1.5 && node.width <= 600)) return "mobile";
  return "web";
}

function finiteSize(value) { return typeof value === "number" && Number.isFinite(value) && value > 0; }
function isRecord(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }

function paragraphPartition(content) {
  const ranges = [];
  let from = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "\n") continue;
    ranges.push({ from, to: index + 1 });
    from = index + 1;
  }
  if (from < content.length) ranges.push({ from, to: content.length });
  return ranges;
}

function normalizeMigratedText(node) {
  node.content = typeof node.content === "string" ? node.content : "";
  node.marks = Array.isArray(node.marks) ? node.marks : [];
  node.paragraphs = node.content.length === 0 ? [] : paragraphPartition(node.content);
}

function migrateStickyType(source, type, migration) {
  const document = structuredClone(source);
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (node.type !== type) return;
    node.type = "text";
    normalizeMigratedText(node);
    changes += 1;
  });
  return { document, changes, migration, notes: changes ? [`Approximated ${changes} legacy \`${type}\` node(s) as ordinary text.`] : [] };
}

function indexNodes(children, output = new Map()) {
  for (const node of children ?? []) {
    if (typeof node?.id === "string") output.set(node.id, node);
    indexNodes(node?.children, output);
  }
  return output;
}

function findPath(root, path) {
  const parts = path.split("/");
  let current = findDescendant(root, parts[0]);
  for (const id of parts.slice(1)) {
    current = (current?.children ?? []).find((child) => child.id === id) ?? findDescendant(current, id);
    if (!current) return null;
  }
  return current;
}

function findDescendant(root, id) {
  if (!root) return null;
  if (root.id === id) return root;
  for (const child of root.children ?? []) {
    const match = findDescendant(child, id);
    if (match) return match;
  }
  return null;
}

function materializeLegacyInstance(instance, target, notes) {
  const clone = structuredClone(target);
  for (const key of ["name", "x", "y", "width", "height", "rotation", "flipX", "flipY", "opacity", "enabled", "role", "size", "physical", "modes", "bind", "visible", "varies", "export"]) {
    if (Object.hasOwn(instance, key)) clone[key] = structuredClone(instance[key]);
  }
  for (const [path, override] of Object.entries(instance.descendants ?? {})) {
    const candidate = path === clone.id || path === target.id ? clone : findPath(clone, path);
    if (!candidate) {
      notes.push(`Dropped unresolved descendant override \`${path}\` while materializing ref \`${instance.id}\`.`);
      continue;
    }
    Object.assign(candidate, structuredClone(override));
  }
  remapMaterializedIds(clone, instance.id);
  delete clone.reusable;
  delete clone.descendants;
  return clone;
}

function remapMaterializedIds(root, instanceId) {
  const ids = new Map();
  walkNodes([root], (node) => {
    if (typeof node.id === "string") ids.set(node.id, node === root ? instanceId : `${instanceId}/${node.id}`);
  });
  walkNodes([root], (node) => {
    if (typeof node.id === "string") node.id = ids.get(node.id);
    if (typeof node.ref === "string" && ids.has(node.ref)) node.ref = ids.get(node.ref);
    if (typeof node.notesFor === "string" && ids.has(node.notesFor)) node.notesFor = ids.get(node.notesFor);
  });
}

function replaceObject(target, source) {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, source);
}

function transformNodes(children, transform) {
  for (let index = 0; index < (children ?? []).length; index += 1) {
    const current = children[index];
    const transformed = transform(current);
    if (Array.isArray(transformed)) {
      children.splice(index, 1, ...transformed);
      index += transformed.length - 1;
      for (const node of transformed) transformNodes(node.children, transform);
    } else {
      children[index] = transformed;
      transformNodes(transformed.children, transform);
    }
  }
}

function migrationError(migration, message) {
  const error = new Error(`${migration}: ${message}`);
  error.code = "CANVAS_MIGRATION_INVALID";
  return error;
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
