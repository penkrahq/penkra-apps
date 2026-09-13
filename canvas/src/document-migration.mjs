import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { validateCanvasDocument } from "./canvas-schema.mjs";
import {
  canonicalDescendantOverridesForComponent,
  resolveComponentDescendant,
} from "./component-descendants.mjs";
import { createDocumentModel, encodeState, materialize, restoreDocumentModel } from "./document-model.mjs";
import {
  migrateM1DelimitedVariables,
  migrateM2AssignModule,
  migrateM3DropReusable,
  migrateM4Descendants,
  migrateM5ComponentSlots,
  migrateM6UniformText,
  migrateM7AssignRoles,
  migrateM8AddFlows,
  migrateM10Scripts,
  migrateM11Notes,
  migrateM12Contexts,
  migrateM13Prompts,
  migrateM14ThemesToAxes,
  migrateM15NodeModes,
  migrateM16VariableTokens,
  migrateM17CascadeConditions,
  migrateM18LogicalDirections,
} from "./migrations.mjs";

export function migrateCanvasDocument(source) {
  const legacyThemeAxes = new Set(Object.keys(source?.themes ?? {}));
  const steps = [
    ["M1", (value) => migrateM1DelimitedVariables(value)],
    ["M2", (value) => migrateM2AssignModule(value)],
    ["MV", migrateLegacyComponentVariants],
    ["M5", migrateM5ComponentSlots],
    ["M6", migrateM6UniformText],
    ["M10", (value) => migrateM10Scripts(value)],
    ["M11", (value) => migrateM11Notes(value)],
    ["M12", migrateM12Contexts],
    ["M13", migrateM13Prompts],
    ["M7", (value) => migrateM7AssignRoles(value)],
    ["M4", (value) => migrateM4Descendants(value)],
    ["M3", migrateM3DropReusable],
    ["M14", migrateM14ThemesToAxes],
    ["M15", migrateM15NodeModes],
    ["M16", migrateM16VariableTokens],
    ["M17", migrateM17CascadeConditions],
    ["M18", migrateM18LogicalDirections],
    ["M8", migrateM8AddFlows],
  ];
  let document = structuredClone(source);
  const changes = {};
  const notes = [];
  for (const [name, migrate] of steps) {
    const result = migrate(document);
    document = result.document;
    changes[name] = result.changes;
    notes.push(...(result.notes ?? []));
  }
  repairLegacyParagraphs(document, notes);
  canonicalizeLegacyStrokes(document, notes);
  canonicalizeLegacyAnnotatedDimensions(document, notes);
  canonicalizeLegacyTextAlignment(document, notes);
  wrapLegacyScalarVariableReferences(document, notes);
  canonicalizeEmptyLegacyPaths(document, notes);
  if (Object.hasOwn(document, "version")) {
    delete document.version;
    notes.push("Dropped the obsolete OpenPencil format marker; Canvas has no Pencil file-compatibility contract.");
  }
  if (!document.axes || typeof document.axes !== "object" || Array.isArray(document.axes)) document.axes = {};
  if (document.axes.theme && !document.axes.appearance
    && document.axes.theme.modes?.every((mode) => ["light", "dark"].includes(mode.name))) {
    document.axes.appearance = document.axes.theme;
    delete document.axes.theme;
    renameAxisSelections(document, "theme", "appearance");
    notes.push("Renamed the legacy light/dark theme axis to appearance, including mode selections and cascade conditions.");
  }
  if (document.axes.mode && !document.axes.appearance
    && document.axes.mode.modes?.every((mode) => ["light", "dark"].includes(mode.name))) {
    document.axes.appearance = document.axes.mode;
    delete document.axes.mode;
    renameAxisSelections(document, "mode", "appearance");
    notes.push("Renamed the legacy light/dark mode axis to appearance, including mode selections and cascade conditions.");
  }
  collapseUniformLegacyAxes(document, notes, legacyThemeAxes);
  collapseLegacyVariantAxes(document, notes, legacyThemeAxes);
  if (!document.variables || typeof document.variables !== "object" || Array.isArray(document.variables)) document.variables = {};
  if (!document.paragraphStyles || typeof document.paragraphStyles !== "object" || Array.isArray(document.paragraphStyles)) document.paragraphStyles = {};
  if (document.imports === undefined) document.imports = {};
  if (!Array.isArray(document.flows)) document.flows = [];
  if (!Array.isArray(document.children)) document.children = [];
  let renamedExports = 0;
  const renameExports = (nodes) => {
    for (const node of nodes) {
      if (node.export === "live") { node.export = "default"; renamedExports += 1; }
      if (Array.isArray(node.children)) renameExports(node.children);
      for (const content of Object.values(node.slots ?? {})) renameExports(content);
    }
  };
  renameExports(document.children);
  if (renamedExports) notes.push(`Renamed ${renamedExports} node export override(s) from live to default without changing rendering intent.`);
  if (document.module === "print") {
    document.module = "generic";
    const removePageRoles = (nodes) => {
      for (const node of nodes) {
        if (node.role === "page") delete node.role;
        if (Array.isArray(node.children)) removePageRoles(node.children);
        for (const content of Object.values(node.slots ?? {})) removePageRoles(content);
      }
    };
    removePageRoles(document.children);
    notes.push("Converted the withdrawn print module to generic and removed page roles; physical size, artwork, bleed and advisory guides are preserved.");
  }
  try {
    validateCanvasDocument(document);
  } catch (error) {
    const detail = String(error?.message ?? error);
    const limit = 1_600;
    const bounded = detail.length > limit
      ? `${detail.slice(0, limit)}\n… ${detail.length - limit} additional characters omitted.`
      : detail;
    throw migrationError(`Migration cannot preserve this document as valid Canvas content: ${bounded}`);
  }
  return { document, changes, notes };
}

function migrateLegacyComponentVariants(source) {
  const document = structuredClone(source);
  const definitions = document.themes && typeof document.themes === "object" && !Array.isArray(document.themes)
    ? document.themes : {};
  const nodes = new Map();
  const instances = [];
  const visit = (children, depth = 0) => {
    for (const node of children ?? []) {
      if (typeof node?.id === "string") nodes.set(node.id, node);
      if (node?.type === "ref") instances.push({ instance: node, depth });
      visit(node?.children, depth + 1);
      for (const content of Object.values(node?.slots ?? {})) visit(content, depth + 1);
      for (const override of Object.values(node?.descendants ?? {})) {
        if (override?.id && override?.type) visit([override], depth + 1);
      }
    }
  };
  visit(document.children);
  instances.sort((left, right) => right.depth - left.depth);
  let changes = 0;
  const notes = [];
  for (const { instance } of instances) {
    if (typeof instance.ref !== "string" || instance.ref.includes(":")) continue;
    const target = nodes.get(instance.ref);
    if (!target) continue;
    const instanceTheme = instance.theme && typeof instance.theme === "object" && !Array.isArray(instance.theme)
      ? instance.theme
      : {};
    for (const [axis, mode] of Object.entries(instanceTheme)) {
      if (["theme", "mode"].includes(axis) || !Array.isArray(definitions[axis]) || !definitions[axis].includes(mode)) continue;
      declareLegacyEnumProperty(target, axis, definitions, instance.id);
      instance.props ??= {};
      if (Object.hasOwn(instance.props, axis) && instance.props[axis] !== mode) {
        throw migrationError(`Legacy ref ${instance.id} selects conflicting ${axis} values.`);
      }
      instance.props[axis] = mode;
      delete instance.theme[axis];
      if (Object.keys(instance.theme).length === 0) delete instance.theme;
      rewriteAxisConditionsThroughComponentRefs(
        target, axis, axis, document.variables, nodes, definitions, instance.id,
      );
      changes += 1;
    }
    const canonical = canonicalDescendantOverridesForComponent(instance, target, {
      strict: true,
      components: nodes,
    });
    if (canonical.errors.length > 0) {
      notes.push(`Dropped ${canonical.errors.length} stale descendant override path(s) from legacy ref \`${instance.id}\`; none identified an effective component descendant.`);
      changes += canonical.errors.length;
    }
    if (instance.descendants !== undefined) instance.descendants = canonical.overrides;
    for (const [path, override] of Object.entries(canonical.overrides)) {
      const descendant = resolveComponentDescendant(target, path, { components: nodes });
      if (descendant && ["id", "type", "ref", "descendants"].some((key) => Object.hasOwn(override, key))) {
        canonical.overrides[path] = {
          replace: { ...structuredClone(override), id: descendant.id },
        };
        changes += 1;
        continue;
      }
      if (!override?.theme || typeof override.theme !== "object" || Array.isArray(override.theme)) continue;
      for (const [axis, mode] of Object.entries(override.theme)) {
        if (!Array.isArray(definitions[axis]) || !definitions[axis].includes(mode)) continue;
        if (descendant?.type === "ref" && !["theme", "mode"].includes(axis)) {
          const descendantTarget = nodes.get(descendant.ref);
          if (!descendantTarget) continue;
          declareLegacyEnumProperty(descendantTarget, axis, definitions, instance.id);
          override.props ??= {};
          if (Object.hasOwn(override.props, axis) && override.props[axis] !== mode) {
            throw migrationError(`Legacy ref ${instance.id} descendant ${path} selects conflicting ${axis} values.`);
          }
          override.props[axis] = mode;
          rewriteAxisConditionsThroughComponentRefs(
            descendantTarget, axis, axis, document.variables, nodes, definitions, instance.id,
          );
        } else if (!["theme", "mode"].includes(axis)) {
          const boundary = nearestComponentBoundary(target, path, nodes);
          const propName = `${axis}__${descendant.id}`;
          declareLegacyEnumProperty(
            boundary.component,
            propName,
            { [propName]: definitions[axis] },
            instance.id,
            descendant.theme?.[axis] ?? definitions[axis][0],
          );
          rewriteAxisConditionsThroughComponentRefs(
            descendant, axis, propName, document.variables, nodes,
            { [propName]: definitions[axis] }, instance.id,
          );
          const receiver = boundary.instancePath
            ? (canonical.overrides[boundary.instancePath] ??= {})
            : instance;
          receiver.props ??= {};
          if (Object.hasOwn(receiver.props, propName) && receiver.props[propName] !== mode) {
            throw migrationError(`Legacy ref ${instance.id} descendant ${path} selects conflicting ${axis} values.`);
          }
          receiver.props[propName] = mode;
        } else {
          override.modes ??= {};
          override.modes[axis] = mode;
        }
        delete override.theme[axis];
        changes += 1;
      }
      if (Object.keys(override.theme).length === 0) delete override.theme;
    }
    for (const [path, override] of Object.entries(canonical.overrides)) {
      if (override && typeof override === "object" && !Array.isArray(override) && Object.keys(override).length === 0) {
        delete canonical.overrides[path];
      }
    }
    if (Object.keys(canonical.overrides).length === 0) delete instance.descendants;
  }
  if (changes) notes.push(`Converted ${changes} legacy component-variant selection(s) into canonical enum properties and instance props.`);
  return { document, changes, notes };
}

function declareLegacyEnumProperty(target, axis, definitions, instanceId, defaultMode = definitions[axis][0]) {
  target.properties ??= {};
  const declaration = { type: "enum", values: [...definitions[axis]], default: defaultMode };
  if (target.properties[axis] !== undefined
    && JSON.stringify(target.properties[axis]) !== JSON.stringify(declaration)) {
    throw migrationError(`Legacy component ${target.id} referenced by ${instanceId} has an incompatible property named ${axis}.`);
  }
  target.properties[axis] = declaration;
}

function rewriteAxisConditionsAsProps(value, axis, propName = axis, variables = {}, variableTrail = new Set()) {
  if (typeof value === "string") {
    const reference = /^\$\{([A-Za-z][\w-]*)\}$/u.exec(value)?.[1];
    const definition = reference ? variables?.[reference] : null;
    const cascade = Array.isArray(definition?.value) ? definition.value : null;
    if (!cascade || !cascade.some((entry) => entry?.theme?.[axis] !== undefined || entry?.when?.[axis] !== undefined)
      || variableTrail.has(reference)) return value;
    const nextTrail = new Set([...variableTrail, reference]);
    return cascade.map((entry) => ({
      value: rewriteAxisConditionsAsProps(structuredClone(entry.value), axis, propName, variables, nextTrail),
      ...rewriteLegacyVariantCondition(entry, axis, propName),
    }));
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      value[index] = rewriteAxisConditionsAsProps(value[index], axis, propName, variables, variableTrail);
    }
    return value;
  }
  if (!value || typeof value !== "object") return value;
  const condition = value.when && typeof value.when === "object" && !Array.isArray(value.when)
    ? value.when
    : Object.hasOwn(value, "value") && value.theme && typeof value.theme === "object" && !Array.isArray(value.theme)
      ? value.theme
      : null;
  if (condition && Object.hasOwn(condition, axis)) {
    value.when = { ...condition, props: { ...(condition.props ?? {}) } };
    delete value.theme;
    if (Object.hasOwn(value.when.props, propName) && value.when.props[propName] !== value.when[axis]) {
      throw migrationError(`Legacy component cascade has conflicting ${axis} conditions.`);
    }
    value.when.props[propName] = value.when[axis];
    delete value.when[axis];
  } else if (condition?.props && propName !== axis && Object.hasOwn(condition.props, axis)) {
    value.when = { ...condition, props: { ...condition.props } };
    if (Object.hasOwn(value.when.props, propName) && value.when.props[propName] !== value.when.props[axis]) {
      throw migrationError(`Legacy component cascade has conflicting ${axis} conditions.`);
    }
    value.when.props[propName] = value.when.props[axis];
    delete value.when.props[axis];
  }
  for (const [key, child] of Object.entries(value)) {
    if (["when", "theme"].includes(key)) continue;
    value[key] = rewriteAxisConditionsAsProps(child, axis, propName, variables, variableTrail);
  }
  return value;
}

function rewriteAxisConditionsThroughComponentRefs(
  value,
  axis,
  propName,
  variables,
  components,
  definitions,
  instanceId,
  visited = new Set(),
) {
  const nested = [];
  const collect = (candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return;
    if (candidate.type === "ref" && typeof candidate.ref === "string" && !candidate.ref.includes(":")) {
      const target = components.get(candidate.ref);
      const explicitlySelected = Object.hasOwn(candidate.props ?? {}, propName);
      if (target && !explicitlySelected
        && componentSubtreeDependsOnLegacyAxis(target, axis, propName, variables, components)) {
        nested.push({ instance: candidate, target });
      }
    }
    for (const child of candidate.children ?? []) collect(child);
    for (const children of Object.values(candidate.slots ?? {})) for (const child of children) collect(child);
  };
  collect(value);
  rewriteAxisConditionsAsProps(value, axis, propName, variables);
  for (const { instance, target } of nested) {
    declareLegacyEnumProperty(target, propName, definitions, instanceId);
    instance.bind ??= {};
    const expected = `$props.${propName}`;
    if (Object.hasOwn(instance.bind, propName) && instance.bind[propName] !== expected) {
      throw migrationError(`Legacy ref ${instance.id} has an incompatible binding for component property ${propName}.`);
    }
    instance.bind[propName] = expected;
    const key = `${target.id}:${axis}:${propName}`;
    if (visited.has(key)) continue;
    rewriteAxisConditionsThroughComponentRefs(
      target, axis, propName, variables, components, definitions, instanceId, new Set([...visited, key]),
    );
  }
}

function componentSubtreeDependsOnLegacyAxis(component, axis, propName, variables, components, visited = new Set()) {
  const key = `${component.id}:${axis}:${propName}`;
  if (visited.has(key)) return false;
  visited = new Set([...visited, key]);
  if (Object.hasOwn(component.properties ?? {}, propName)) return true;
  const depends = (value, variableTrail = new Set()) => {
    if (typeof value === "string") {
      const reference = /^\$\{([A-Za-z][\w-]*)\}$/u.exec(value)?.[1];
      if (!reference || variableTrail.has(reference)) return false;
      const definition = variables?.[reference];
      const cascade = Array.isArray(definition?.value) ? definition.value : null;
      return cascade ? depends(cascade, new Set([...variableTrail, reference])) : false;
    }
    if (Array.isArray(value)) return value.some((item) => depends(item, variableTrail));
    if (!value || typeof value !== "object") return false;
    if (value.theme?.[axis] !== undefined || value.when?.[axis] !== undefined
      || value.when?.props?.[propName] !== undefined) return true;
    return Object.entries(value).some(([name, child]) => !["children", "slots", "descendants"].includes(name)
      && depends(child, variableTrail));
  };
  const visit = (node) => {
    if (depends(node)) return true;
    for (const child of node.children ?? []) {
      if (child.type === "ref" && typeof child.ref === "string" && !child.ref.includes(":")) {
        if (Object.hasOwn(child.props ?? {}, propName)) continue;
        const target = components.get(child.ref);
        if (target && componentSubtreeDependsOnLegacyAxis(target, axis, propName, variables, components, visited)) return true;
      }
      if (visit(child)) return true;
    }
    for (const children of Object.values(node.slots ?? {})) for (const child of children) if (visit(child)) return true;
    return false;
  };
  return visit(component);
}

function rewriteLegacyVariantCondition(entry, axis, propName) {
  const condition = entry?.when ?? entry?.theme;
  if (!condition || typeof condition !== "object" || Array.isArray(condition)) return {};
  const when = structuredClone(condition);
  if (Object.hasOwn(when, axis)) {
    when.props = { ...(when.props ?? {}), [propName]: when[axis] };
    delete when[axis];
  }
  return Object.keys(when).length > 0 ? { when } : {};
}

function nearestComponentBoundary(component, path, components) {
  let current = component;
  let boundary = { component, instancePath: null };
  const traversed = [];
  for (const id of String(path).split("/").filter(Boolean)) {
    const child = (current.children ?? []).find((candidate) => candidate?.id === id);
    if (!child) break;
    traversed.push(id);
    if (child.type === "ref" && typeof child.ref === "string" && !child.ref.includes(":")) {
      const target = components.get(child.ref);
      if (target) {
        boundary = { component: target, instancePath: traversed.join("/") };
        current = target;
        continue;
      }
    }
    current = child;
  }
  return boundary;
}

function canonicalizeEmptyLegacyPaths(document, notes) {
  let changes = 0;
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      if (node?.type === "path" && typeof node.geometry === "string" && !node.geometry.trim()) {
        node.geometry = "M 0 0";
        changes += 1;
      }
      visit(node?.children);
      for (const content of Object.values(node?.slots ?? {})) visit(content);
    }
  };
  visit(document.children);
  if (changes) notes.push(`Canonicalized ${changes} intentionally empty legacy path(s) as zero-length paths with unchanged visual output.`);
}

function wrapLegacyScalarVariableReferences(document, notes) {
  const scalarKeys = new Set([
    "x", "y", "width", "height", "rotation", "flipX", "flipY", "opacity", "enabled", "decorative",
    "bleed", "safeMargin", "wrap", "minWidth", "maxWidth", "minHeight", "maxHeight", "gridColumn", "gridRow",
    "clip", "fontSize", "lineHeight", "letterSpacing", "wordSpacing", "underline", "strikethrough", "weight",
  ]);
  let changes = 0;
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      for (const key of scalarKeys) {
        const value = node?.[key];
        if (typeof value !== "string" || !/^\$\{(?:[A-Za-z][\w-]*:)?[A-Za-z][\w-]*(?:\.[\w-]+)*\}$/u.test(value)) continue;
        node[key] = [{ value }];
        changes += 1;
      }
      visit(node?.children);
      for (const content of Object.values(node?.slots ?? {})) visit(content);
    }
  };
  visit(document.children);
  if (changes) notes.push(`Wrapped ${changes} legacy scalar variable reference(s) as canonical cascades so their resolved types remain intact.`);
}

function collapseUniformLegacyAxes(document, notes, legacyThemeAxes) {
  const unsupported = Object.keys(document.axes ?? {}).filter((name) => name === "portal" && legacyThemeAxes.has(name));
  for (const axis of unsupported) {
    const selected = new Set();
    const collect = (nodes) => {
      for (const node of nodes ?? []) {
        if (typeof node?.modes?.[axis] === "string") selected.add(node.modes[axis]);
        collect(node?.children);
        for (const content of Object.values(node?.slots ?? {})) collect(content);
      }
    };
    collect(document.children);
    if (selected.size > 1) {
      throw migrationError(`Legacy axis ${axis} has multiple active modes and cannot be collapsed without changing sibling rendering.`);
    }
    const mode = [...selected][0] ?? document.axes[axis]?.modes?.[0]?.name;
    if (typeof mode !== "string" || !mode) throw migrationError(`Legacy axis ${axis} has no selectable mode.`);
    collapseAxisConditions(document, axis, mode);
    delete document.axes[axis];
    notes.push(`Collapsed uniformly selected legacy axis \`${axis}\` at mode \`${mode}\` into static values; Canvas axes are appearance and viewport.`);
  }
}

function collapseAxisConditions(value, axis, mode) {
  if (Array.isArray(value)) {
    const cascade = value.length > 0 && value.every((entry) => entry && typeof entry === "object"
      && !Array.isArray(entry) && Object.hasOwn(entry, "value"));
    if (cascade) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        const entry = value[index];
        if (entry.when?.[axis] !== undefined && entry.when[axis] !== mode) {
          value.splice(index, 1);
          continue;
        }
        if (entry.when && Object.hasOwn(entry.when, axis)) {
          delete entry.when[axis];
          if (Object.keys(entry.when).length === 0) delete entry.when;
        }
        collapseAxisConditions(entry.value, axis, mode);
      }
      return;
    }
    value.forEach((entry) => collapseAxisConditions(entry, axis, mode));
    return;
  }
  if (!value || typeof value !== "object") return;
  if (value.modes && typeof value.modes === "object" && !Array.isArray(value.modes)) {
    delete value.modes[axis];
    if (Object.keys(value.modes).length === 0) delete value.modes;
  }
  for (const child of Object.values(value)) collapseAxisConditions(child, axis, mode);
}

function collapseLegacyVariantAxes(document, notes, legacyThemeAxes) {
  const axes = Object.keys(document.axes ?? {}).filter((name) => legacyThemeAxes.has(name) && !["appearance", "viewport"].includes(name));
  for (const axis of axes) {
    const defaultMode = document.axes[axis]?.modes?.[0]?.name;
    if (typeof defaultMode !== "string" || !defaultMode) throw migrationError(`Legacy axis ${axis} has no selectable mode.`);
    collapseAxisConditions(document.variables, axis, defaultMode);
    collapseAxisConditions(document.paragraphStyles, axis, defaultMode);
    let selectedNodes = 0;
    const visit = (nodes, inheritedMode) => {
      for (const node of nodes ?? []) {
        const mode = typeof node?.modes?.[axis] === "string" ? node.modes[axis] : inheritedMode;
        if (typeof node?.modes?.[axis] === "string") selectedNodes += 1;
        for (const [key, value] of Object.entries(node ?? {})) {
          if (key === "children" || key === "modes") continue;
          collapseAxisConditions(value, axis, mode);
        }
        if (node.modes && Object.hasOwn(node.modes, axis)) {
          delete node.modes[axis];
          if (Object.keys(node.modes).length === 0) delete node.modes;
        }
        visit(node.children, mode);
        for (const content of Object.values(node.slots ?? {})) visit(content, mode);
      }
    };
    visit(document.children, defaultMode);
    delete document.axes[axis];
    notes.push(`Materialized legacy component-variant axis \`${axis}\` into static values for ${selectedNodes} explicitly selected node(s).`);
  }
}

function canonicalizeLegacyTextAlignment(document, notes) {
  let changes = 0;
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      if (node?.type === "text" && node.textAlignVertical === "middle") {
        node.textAlignVertical = "center";
        changes += 1;
      }
      visit(node?.children);
      for (const content of Object.values(node?.slots ?? {})) visit(content);
    }
  };
  visit(document.children);
  if (changes) notes.push(`Renamed ${changes} legacy middle text alignment value(s) to canonical center alignment.`);
}

function canonicalizeLegacyAnnotatedDimensions(document, notes) {
  const dimensionKeys = new Set(["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"]);
  let changes = 0;
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    {
      const node = value;
      for (const key of dimensionKeys) {
        const value = node?.[key];
        if (typeof value !== "string") continue;
        const match = /^(fill_container|fit_content)\([^)]*\)$/u.exec(value);
        if (!match) continue;
        node[key] = match[1];
        changes += 1;
      }
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(document);
  if (changes) notes.push(`Canonicalized ${changes} legacy annotated sizing value(s) while preserving fill/fit layout intent.`);
}

function canonicalizeLegacyStrokes(document, notes) {
  const aliases = ["strokeWidth", "strokeAlignment", "strokeLinecap", "strokeLinejoin", "strokeDashPattern"];
  let changes = 0;
  const visit = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    if (value.stroke !== undefined && aliases.some((key) => Object.hasOwn(value, key))) {
      const stroke = value.stroke && typeof value.stroke === "object" && !Array.isArray(value.stroke)
        && (Object.hasOwn(value.stroke, "fill") || Object.hasOwn(value.stroke, "fills"))
        ? structuredClone(value.stroke)
        : { fill: structuredClone(value.stroke) };
      if (value.strokeWidth !== undefined) stroke.width = structuredClone(value.strokeWidth);
      if (value.strokeAlignment !== undefined) stroke.align = ({ inner: "inside", outer: "outside" })[value.strokeAlignment] ?? value.strokeAlignment;
      if (value.strokeLinecap !== undefined) stroke.cap = value.strokeLinecap;
      if (value.strokeLinejoin !== undefined) stroke.join = value.strokeLinejoin;
      if (value.strokeDashPattern !== undefined) stroke.dash = structuredClone(value.strokeDashPattern);
      value.stroke = stroke;
      for (const key of aliases) delete value[key];
      changes += 1;
    }
    for (const child of Object.values(value)) visit(child);
  };
  visit(document);
  if (changes) notes.push(`Canonicalized ${changes} legacy split stroke definition(s) as native Canvas stroke descriptors.`);
}

function repairLegacyParagraphs(document, notes) {
  const visit = (nodes) => {
    for (const node of nodes ?? []) {
      if (node?.type === "text" && typeof node.content === "string" && !validParagraphPartition(node)) {
        const original = Array.isArray(node.paragraphs) ? node.paragraphs : [];
        node.paragraphs = paragraphPartition(node.content).map((range, index) => ({
          ...range,
          ...usableParagraphMetadata(document, selectParagraph(original, range, index)),
        }));
        notes.push(`Regenerated paragraph ranges from content for text node \`${node.id}\`; preserved usable paragraph metadata deterministically.`);
      }
      visit(node?.children);
      for (const content of Object.values(node?.slots ?? {})) visit(content);
    }
  };
  visit(document.children);
}

function validParagraphPartition(node) {
  const { content, paragraphs } = node;
  if (!Array.isArray(paragraphs)) return false;
  if (content.length === 0) return paragraphs.length === 0;
  if (paragraphs.length === 0) return false;
  let cursor = 0;
  for (const paragraph of paragraphs) {
    if (!paragraph || !Number.isInteger(paragraph.from) || !Number.isInteger(paragraph.to)
      || paragraph.from !== cursor || paragraph.from < 0 || paragraph.from >= paragraph.to
      || paragraph.to > content.length) return false;
    if (paragraph.to < content.length && content[paragraph.to - 1] !== "\n") return false;
    cursor = paragraph.to;
  }
  return cursor === content.length;
}

function selectParagraph(paragraphs, range, targetIndex) {
  if (!paragraphs.length) return null;
  const ranked = paragraphs.map((paragraph, index) => {
    const interval = paragraphInterval(paragraph);
    if (!interval) return { paragraph, index, overlap: 0, distance: Number.POSITIVE_INFINITY };
    const overlap = Math.max(0, Math.min(interval.to, range.to) - Math.max(interval.from, range.from));
    const distance = overlap > 0 ? 0 : interval.to < range.from ? range.from - interval.to : interval.from - range.to;
    return { paragraph, index, overlap, distance };
  });
  ranked.sort((left, right) => {
    if ((left.overlap > 0) !== (right.overlap > 0)) return left.overlap > 0 ? -1 : 1;
    if (left.overlap !== right.overlap) return right.overlap - left.overlap;
    if (left.distance !== right.distance) return left.distance - right.distance;
    const leftIndexDistance = Math.abs(left.index - targetIndex);
    const rightIndexDistance = Math.abs(right.index - targetIndex);
    return leftIndexDistance - rightIndexDistance || left.index - right.index;
  });
  return ranked[0].paragraph;
}

function paragraphInterval(paragraph) {
  if (!paragraph || typeof paragraph !== "object" || Array.isArray(paragraph)
    || !Number.isInteger(paragraph.from) || !Number.isInteger(paragraph.to)) return null;
  return paragraph.from <= paragraph.to
    ? { from: paragraph.from, to: paragraph.to }
    : { from: paragraph.to, to: paragraph.from };
}

function usableParagraphMetadata(document, paragraph) {
  if (!paragraph || typeof paragraph !== "object" || Array.isArray(paragraph)) return {};
  const metadata = {};
  if (typeof paragraph.style === "string" && paragraph.style
    && paragraphStyleExists(document, paragraph.style)) metadata.style = paragraph.style;
  if (["start", "center", "end", "justify"].includes(paragraph.align)) metadata.align = paragraph.align;
  if (paragraph.list && typeof paragraph.list === "object" && !Array.isArray(paragraph.list)) {
    metadata.list = structuredClone(paragraph.list);
  }
  if (Number.isInteger(paragraph.headingLevel) && paragraph.headingLevel >= 1 && paragraph.headingLevel <= 6) {
    metadata.headingLevel = paragraph.headingLevel;
  }
  return metadata;
}

function paragraphStyleExists(document, style) {
  if (Object.hasOwn(document.paragraphStyles ?? {}, style)) return true;
  const parts = style.split(":");
  return parts.length === 2 && Boolean(parts[0]) && Boolean(parts[1]) && Object.hasOwn(document.imports ?? {}, parts[0]);
}

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

function renameAxisSelections(value, from, to) {
  if (!value || typeof value !== "object") return;
  for (const key of ["modes", "when"]) {
    const record = value[key];
    if (record && !Array.isArray(record) && typeof record === "object" && !record.op && Object.hasOwn(record, from)) {
      record[to] = record[from];
      delete record[from];
    }
  }
  for (const child of Object.values(value)) renameAxisSelections(child, from, to);
}

export async function createCanvasMigrationCopy(api, documentId, payload, {
  reportDirectory,
  sourceAccess = "owner",
  sourceTitle,
} = {}) {
  if (payload.id !== undefined && payload.id !== documentId) {
    throw migrationError(`Canvas migration payload ${payload.id} does not match source document ${documentId}.`);
  }
  if (!payload.snapshot?.source || typeof payload.snapshot.source !== "object") throw migrationError("Canvas migration needs a source projection.");
  if (typeof reportDirectory !== "string" || !reportDirectory || !isAbsolute(reportDirectory)) {
    throw migrationError("Canvas migration needs an absolute report directory for its Markdown record.");
  }
  if (sourceAccess !== "owner" && sourceAccess !== "editor") {
    throw migrationError(`Canvas migration received unsupported source access ${sourceAccess}.`);
  }
  const title = String(sourceTitle ?? payload.title ?? "Untitled");
  const copyTitle = sourceAccess === "editor" ? `${title} — migrated copy` : title;
  const supersededTitle = `${title} — superseded by 00000000-0000-0000-0000-000000000000`;
  // Validate the title that is sent to createDocument before any remote write.
  // The owner superseded title is checked again after the generated copy ID is
  // known because that ID is part of the final title.
  assertMigrationTitle(copyTitle);
  if (sourceAccess === "owner") assertMigrationTitle(supersededTitle);
  const legacyModel = restoreDocumentModel(payload);
  const source = materialize(legacyModel);
  legacyModel.doc.destroy();
  const migrated = migrateCanvasDocument(source);
  const model = createDocumentModel(migrated.document);
  let copy = null;
  let reportPath = null;
  let reportCreated = false;
  try {
    const sourceAssets = payload.assets === undefined
      ? validateAssetInventory(await api.listAssets(documentId), documentId)
      : validateAssetInventory(payload.assets, documentId);
    copy = await api.createDocument({ title: copyTitle, source: migrated.document, initialUpdate: encodeState(model) });
    if (!copy?.id) throw migrationError("Canvas migration createDocument returned no copy ID.");
    const transferredAssets = await transferAssets(api, documentId, copy.id, sourceAssets);
    const rehashedAssets = transferredAssets.filter((asset, index) => asset.sha256 !== sourceAssets[index].sha256);
    if (rehashedAssets.length) {
      migrated.notes.push(`Re-encoded ${rehashedAssets.length} JPEG asset(s) with a standards-valid comment marker to bypass orphaned backend upload reservations; decoded pixels and logical paths are unchanged.`);
    }
    const verified = await api.getDocumentProjection(copy.id);
    if (!verified?.snapshot?.source || !sameProjection(verified.snapshot.source, migrated.document)) {
      throw migrationError(`Migrated copy ${copy.id} did not round-trip its canonical projection.`);
    }
    const copiedAssets = validateAssetInventory(await api.listAssets(copy.id), copy.id);
    if (!sameAssetInventory(transferredAssets, copiedAssets)) {
      throw migrationError(`Migrated copy ${copy.id} did not round-trip its asset inventory.`);
    }
    reportPath = join(resolve(reportDirectory), `migration-${documentId}-to-${copy.id}.md`);
    await mkdir(resolve(reportDirectory), { recursive: true });
    await writeFile(reportPath, migrationMarkdown(title, documentId, copy.id, migrated, transferredAssets, sourceAccess), { encoding: "utf8", flag: "wx" });
    reportCreated = true;
    let sourceRenamed = false;
    if (sourceAccess === "owner") {
      const finalSupersededTitle = `${title} — superseded by ${copy.id}`;
      assertMigrationTitle(finalSupersededTitle);
      await api.renameDocument(documentId, finalSupersededTitle);
      sourceRenamed = true;
    }
    return {
      sourceDocumentId: documentId,
      documentId: copy.id,
      title: copyTitle,
      sourceAccess,
      sourceRenamed,
      reportPath,
      assetCount: sourceAssets.length,
    };
  } catch (error) {
    if (copy?.id) await api.deleteDocument(copy.id).catch(() => undefined);
    if (reportCreated) await unlink(reportPath).catch(() => undefined);
    throw error;
  } finally {
    model.doc.destroy();
  }
}

function migrationMarkdown(title, sourceId, copyId, migrated, assets, sourceAccess) {
  const notes = migrated.notes.length ? migrated.notes.map((note) => `- ${note}`).join("\n") : "- No content was dropped, approximated or inferred.";
  const sourceDisposition = sourceAccess === "editor"
    ? "The source was shared with this caller and was left unchanged; only a new owner copy was created."
    : "The source content was left untouched and renamed only after the copy and asset inventory round-tripped successfully.";
  return `# Canvas migration: ${title}\n\nSource document: \`${sourceId}\`\n\nMigrated copy: \`${copyId}\`\n\nValidated assets transferred: ${assets.length}\n\n${sourceDisposition}\n\n## Dropped, approximated and inferred\n\n${notes}\n`;
}

function assertMigrationTitle(title) {
  if (new TextEncoder().encode(title).length > 255) {
    const error = new Error("The Canvas migration title exceeds 255 UTF-8 bytes.");
    error.code = "CANVAS_MIGRATION_TITLE_INVALID";
    throw error;
  }
}

function validateAssetInventory(value, documentId) {
  if (!Array.isArray(value)) throw migrationError(`Canvas document ${documentId} returned an invalid asset inventory.`);
  const paths = new Set();
  for (const asset of value) {
    if (!asset || typeof asset !== "object" || typeof asset.path !== "string" || !asset.path
      || typeof asset.sha256 !== "string" || !asset.sha256 || !Number.isSafeInteger(asset.size) || asset.size < 0
      || typeof asset.mimeType !== "string" || !asset.mimeType) {
      throw migrationError(`Canvas document ${documentId} returned an invalid asset descriptor.`);
    }
    if (paths.has(asset.path)) throw migrationError(`Canvas document ${documentId} returned duplicate asset path ${asset.path}.`);
    paths.add(asset.path);
  }
  return value;
}

function sameAssetInventory(left, right) {
  if (left.length !== right.length) return false;
  const byPath = new Map(right.map((asset) => [asset.path, asset]));
  return left.every((asset) => {
    const copy = byPath.get(asset.path);
    return copy?.sha256 === asset.sha256 && copy.size === asset.size && copy.mimeType === asset.mimeType;
  });
}

async function transferAssets(api, sourceDocumentId, destinationDocumentId, assets) {
  // The Account backend deduplicates blobs by content hash. Paths sharing a
  // hash must therefore upload serially, while different hashes can retain the
  // bounded parallelism used for large migrations.
  const groups = [];
  const byHash = new Map();
  assets.forEach((asset, index) => {
    let group = byHash.get(asset.sha256);
    if (!group) {
      group = [];
      byHash.set(asset.sha256, group);
      groups.push(group);
    }
    group.push({ asset, index });
  });
  const next = { index: 0 };
  let failed = false;
  const failures = [];
  const transferred = new Array(assets.length);
  const worker = async () => {
    while (true) {
      if (failed) return;
      const index = next.index;
      next.index += 1;
      if (index >= groups.length) return;
      for (const entry of groups[index]) {
        if (failed) return;
        try {
          const bytes = await api.readAsset(sourceDocumentId, entry.asset);
          try {
            await api.uploadAsset(destinationDocumentId, { ...entry.asset, bytes });
            transferred[entry.index] = entry.asset;
          } catch (error) {
            if (!isActiveUploadConflict(error)) throw error;
            const alternate = rehashJpegAsset(entry.asset, bytes, destinationDocumentId);
            await api.uploadAsset(destinationDocumentId, alternate);
            transferred[entry.index] = {
              path: alternate.path,
              sha256: alternate.sha256,
              size: alternate.bytes.byteLength,
              mimeType: alternate.mimeType,
            };
          }
        } catch (error) {
          const contextual = new Error(`Asset ${entry.asset.path} (${entry.asset.mimeType}, ${entry.asset.sha256}) failed: ${String(error?.message ?? error)}`);
          contextual.code = error?.code;
          failures.push({ index: entry.index, error: contextual });
          failed = true;
          return;
        }
      }
    }
  };
  const workerCount = Math.min(4, groups.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failures.length) {
    failures.sort((left, right) => left.index - right.index);
    throw failures[0].error;
  }
  return transferred;
}

function isActiveUploadConflict(error) {
  return error?.code === "CANVAS_BLOB_UPLOAD_ACTIVE"
    || /project file is already uploading/iu.test(String(error?.message ?? error));
}

function rehashJpegAsset(asset, bytes, destinationDocumentId) {
  if (asset.mimeType !== "image/jpeg" || bytes.length < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error(`Cannot safely rehash active upload ${asset.path}; only valid JPEG assets support the no-pixel-change fallback.`);
  }
  const comment = new TextEncoder().encode(`Penkra Canvas migration ${destinationDocumentId}`);
  const markerLength = comment.length + 2;
  if (markerLength > 0xffff) throw new Error(`JPEG migration marker for ${asset.path} is too large.`);
  const output = new Uint8Array(bytes.length + comment.length + 4);
  output.set(bytes.subarray(0, 2), 0);
  output.set([0xff, 0xfe, markerLength >> 8, markerLength & 0xff], 2);
  output.set(comment, 6);
  output.set(bytes.subarray(2), 6 + comment.length);
  return {
    ...asset,
    sha256: createHash("sha256").update(output).digest("hex"),
    size: output.byteLength,
    bytes: output,
  };
}

function sameProjection(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => sameProjection(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => key === rightKeys[index] && sameProjection(left[key], right[key]));
}

function migrationError(message) {
  const error = new Error(message);
  error.code = "CANVAS_MIGRATION_INVALID";
  return error;
}
