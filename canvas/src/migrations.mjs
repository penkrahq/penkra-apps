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
  return { document, changes: 1 };
}

export function migrateM3DropReusable(source) {
  const document = structuredClone(source);
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (!Object.hasOwn(node, "reusable")) return;
    delete node.reusable;
    changes += 1;
  });
  return { document, changes };
}

export function migrateM4Descendants(source, manifest) {
  requireCompleteManifest("M4", source, manifest, (node) => node.type === "ref" && isRecord(node.descendants));
  const document = structuredClone(source);
  const nodes = indexNodes(document.children);
  let changes = 0;
  walkNodes(document.children, (instance) => {
    if (instance.type !== "ref" || !isRecord(instance.descendants)) return;
    const decision = manifest.entries[instance.id];
    if (decision.action === "clone") {
      const target = nodes.get(instance.ref);
      if (!target) throw migrationError("M4", `${instance.id} targets missing component ${instance.ref}.`);
      const clone = materializeLegacyInstance(instance, target);
      replaceObject(instance, clone);
    } else if (decision.action === "properties") {
      applyM4Properties(instance, nodes.get(instance.ref), decision);
    } else {
      throw migrationError("M4", `${instance.id} has unsupported action ${String(decision.action)}.`);
    }
    delete instance.descendants;
    changes += 1;
  });
  return { document, changes };
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
  return { document: visit(document), changes };
}

export function migrateM5DeleteEditorSlots(source) {
  const document = structuredClone(source);
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (!Object.hasOwn(node, "slot")) return;
    delete node.slot;
    changes += 1;
  });
  return { document, changes };
}

export function migrateM6UniformText(source) {
  const document = structuredClone(source);
  document.paragraphStyles ??= {};
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (node.type !== "text" || typeof node.content !== "string") return;
    if (Array.isArray(node.marks) && Array.isArray(node.paragraphs)) return;
    if (node.marks !== undefined || node.paragraphs !== undefined) {
      throw migrationError("M6", `${node.id} has only one rich-text range collection.`);
    }
    node.marks ??= [];
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
  return { document, changes };
}

export function migrateM7AssignRoles(source, options = {}) {
  const document = structuredClone(source);
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
  return { document, changes };
}

export function migrateM8AddFlows(source) {
  const document = structuredClone(source);
  if (document.flows !== undefined) return { document, changes: 0 };
  document.flows = [];
  return { document, changes: 1 };
}

export function migrateM10Scripts(source, manifest) {
  requireCompleteManifest("M10", source, manifest, (node) => node.type === "script");
  const document = structuredClone(source);
  let changes = 0;
  transformNodes(document.children, (node) => {
    if (node.type !== "script") return node;
    const decision = manifest.entries[node.id];
    if (decision.status === "quarantine") throw migrationError("M10", `${node.id} is quarantined: ${decision.reason ?? "non-deterministic output"}.`);
    if (decision.status !== "materialize" || !Array.isArray(decision.output)) throw migrationError("M10", `${node.id} needs recorded materialized output.`);
    changes += 1;
    return decision.output.map((output, index) => ({
      ...structuredClone(output),
      provenance: {
        migration: "M10",
        scriptUri: node.scriptUri ?? null,
        inputs: structuredClone(node.inputs ?? {}),
        outputIndex: index,
      },
    }));
  });
  return { document, changes };
}

export function migrateM11Notes(source, manifest) {
  requireCompleteManifest("M11", source, manifest, (node) => node.type === "note");
  const document = structuredClone(source);
  let changes = 0;
  walkNodes(document.children, (node) => {
    if (node.type !== "note") return;
    const decision = manifest.entries[node.id];
    node.type = "text";
    if (decision.notesFor === null) delete node.notesFor;
    else if (typeof decision.notesFor === "string" && decision.notesFor) node.notesFor = decision.notesFor;
    else throw migrationError("M11", `${node.id} needs notesFor as a slide id or null.`);
    normalizeMigratedText(node);
    changes += 1;
  });
  return { document, changes };
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

export function migrateM18LogicalDirections(source) {
  const document = structuredClone(source);
  let changes = 0;
  const visit = (value, parentKey = null) => {
    if (Array.isArray(value)) { value.forEach((entry) => visit(entry, parentKey)); return; }
    if (!isRecord(value)) return;
    if (["padding", "margin"].includes(parentKey)) {
      for (const [from, to] of [["left", "start"], ["right", "end"]]) {
        if (!Object.hasOwn(value, from)) continue;
        if (Object.hasOwn(value, to)) throw migrationError("M18", `${parentKey} contains both ${from} and ${to}.`);
        value[to] = value[from];
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
  return { document, changes };
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
  return { document, changes, migration };
}

function requireCompleteManifest(migration, source, manifest, predicate) {
  const ids = [];
  walkNodes(source.children, (node) => { if (predicate(node)) ids.push(node.id); });
  if (!isRecord(manifest) || !isRecord(manifest.entries)) {
    throw migrationError(migration, `A reviewed manifest is required for ${ids.length} case(s).`);
  }
  const missing = ids.filter((id) => !Object.hasOwn(manifest.entries, id));
  const extra = Object.keys(manifest.entries).filter((id) => !ids.includes(id));
  if (missing.length || extra.length) throw migrationError(migration, `Manifest mismatch: missing=${missing.join(",")} extra=${extra.join(",")}.`);
  for (const id of ids) {
    const entry = manifest.entries[id];
    if (!isRecord(entry) || typeof entry.evidence !== "string" || !entry.evidence) {
      throw migrationError(migration, `${id} needs non-empty evidence.`);
    }
  }
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

function materializeLegacyInstance(instance, target) {
  const clone = structuredClone(target);
  for (const key of ["name", "x", "y", "width", "height", "rotation", "flipX", "flipY", "opacity", "enabled", "role", "size", "physical", "modes", "bind", "visible", "varies", "export"]) {
    if (Object.hasOwn(instance, key)) clone[key] = structuredClone(instance[key]);
  }
  for (const [path, override] of Object.entries(instance.descendants ?? {})) {
    const candidate = path === clone.id || path === target.id ? clone : findPath(clone, path);
    if (!candidate) throw migrationError("M4", `${instance.id} descendant path ${path} does not resolve.`);
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

function applyM4Properties(instance, target, decision) {
  if (!target) throw migrationError("M4", `${instance.id} targets missing component ${instance.ref}.`);
  if (!isRecord(decision.bindings) || !isRecord(decision.definitions)) {
    throw migrationError("M4", `${instance.id} properties action needs definitions and bindings.`);
  }
  target.properties = { ...(target.properties ?? {}) };
  for (const [name, definition] of Object.entries(decision.definitions)) {
    if (Object.hasOwn(target.properties, name)
      && !sameJsonValue(target.properties[name], definition)) {
      throw migrationError("M4", `${instance.id}.${name} conflicts with an existing component property definition.`);
    }
    target.properties[name] = structuredClone(definition);
  }
  instance.props = { ...(instance.props ?? {}) };
  const consumed = new Set();
  if (isRecord(decision.modes)) {
    instance.modes = { ...(instance.modes ?? {}), ...structuredClone(decision.modes) };
    for (const [path, override] of Object.entries(instance.descendants)) {
      if (!isRecord(override?.theme)) continue;
      for (const [axis, mode] of Object.entries(override.theme)) {
        if (decision.modes[axis] !== mode) {
          throw migrationError("M4", `${instance.id} mode ${path}.theme.${axis} is not accounted for.`);
        }
      }
      consumed.add(`${path}\u0000theme`);
    }
  }
  for (const [name, binding] of Object.entries(decision.bindings)) {
    if (!isRecord(binding) || typeof binding.path !== "string" || typeof binding.property !== "string") {
      throw migrationError("M4", `${instance.id}.${name} has an invalid binding.`);
    }
    const override = instance.descendants[binding.path];
    if (!isRecord(override) || !Object.hasOwn(override, binding.property)) {
      throw migrationError("M4", `${instance.id}.${name} does not resolve ${binding.path}.${binding.property}.`);
    }
    instance.props[name] = structuredClone(override[binding.property]);
    const targetNode = findPath(target, binding.path);
    if (!targetNode) throw migrationError("M4", `${instance.id}.${name} targets missing path ${binding.path}.`);
    const expression = `$props.${name}`;
    if (Object.hasOwn(targetNode.bind ?? {}, binding.property)
      && targetNode.bind[binding.property] !== expression) {
      throw migrationError("M4", `${instance.id}.${name} conflicts with the existing ${binding.path}.${binding.property} binding.`);
    }
    targetNode.bind = { ...(targetNode.bind ?? {}), [binding.property]: expression };
    consumed.add(`${binding.path}\u0000${binding.property}`);
  }
  for (const [path, override] of Object.entries(instance.descendants)) {
    for (const property of Object.keys(override)) {
      if (!consumed.has(`${path}\u0000${property}`)) throw migrationError("M4", `${instance.id} manifest leaves ${path}.${property} unresolved.`);
    }
  }
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
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
