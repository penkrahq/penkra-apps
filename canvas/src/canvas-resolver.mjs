import { interpolateRichText } from "./rich-text.mjs";

export function resolveCanvasDocument(document, options = {}) {
  const modes = selectModes(document.axes ?? {}, options.modes ?? {});
  const variableValues = resolveVariables(document.variables ?? {}, modes, options.bindings ?? {});
  const localNodes = indexNodes(document.children);
  const imports = options.imports ?? {};
  const consequences = [];
  const lowered = [];
  const resolving = [];
  const children = document.children.map((node) => resolveNode(node, { owner: document, props: {}, modes, variableValues, localNodes, imports, consequences, lowered, resolving })).filter(Boolean);
  return { document: { ...document, children }, modes, consequences, lowered };
}

export function evaluateCondition(condition, context) {
  if (!condition) return true;
  const arg = () => context.props?.[condition.arg?.prop];
  switch (condition.op) {
    case "eq": return Object.is(arg(), condition.value);
    case "neq": return !Object.is(arg(), condition.value);
    case "notNull": return arg() !== null && arg() !== undefined;
    case "isNull": return arg() === null || arg() === undefined;
    case "in": return Array.isArray(condition.value) && condition.value.some((value) => Object.is(value, arg()));
    case "gt": return arg() > condition.value;
    case "lt": return arg() < condition.value;
    case "and": return condition.args.every((item) => evaluateCondition(item, context));
    case "or": return condition.args.some((item) => evaluateCondition(item, context));
    case "not": return !evaluateCondition(condition.arg, context);
    default: throw new Error(`Unknown condition operator ${condition.op}.`);
  }
}

export function resolveCascade(value, context) {
  if (!Array.isArray(value) || !value.every((entry) => entry && typeof entry === "object" && Object.hasOwn(entry, "value"))) return value;
  let resolved = value[0]?.value;
  for (const entry of value) if (matchesWhen(entry.when, context)) resolved = entry.value;
  return resolved;
}

function resolveNode(source, context) {
  if (source.type === "ref") return resolveRef(source, context);
  if (source.properties && Object.keys(context.props ?? {}).length === 0)
    context = { ...context, props: resolveProps(source.properties, {}) };
  const output = {};
  for (const [key, raw] of Object.entries(source)) {
    if (["children", "properties", "bind", "varies"].includes(key)) continue;
    const value = resolveCascade(raw, context);
    output[key] = resolveValue(value, context.variableValues);
  }
  for (const [key, binding] of Object.entries(source.bind ?? {}))
    output[key] = resolveValue(resolveBinding(binding, context.props), context.variableValues);
  if (source.visible && typeof source.visible === "object" && source.visible.op)
    output.enabled = evaluateCondition(source.visible, context);
  if (output.type === "text") {
    const textSource = { ...output, content: output.content ?? "", marks: source.marks ?? [], paragraphs: source.paragraphs ?? [] };
    const resolvedText = interpolateRichText(textSource, context.variableValues);
    output.content = resolvedText.content; output.marks = resolvedText.marks; output.paragraphs = resolvedText.paragraphs;
    if (source.bind?.content && output.content.length > 0) {
      output.marks = [];
      output.paragraphs = [{ from: 0, to: output.content.length, ...(source.style ? { style: source.style } : {}) }];
    }
  }
  output.children = (source.children ?? []).map((child) => resolveNode(child, context)).filter(Boolean);
  if (source.children === undefined) delete output.children;
  return output;
}

function resolveRef(instance, context) {
  const qualified = instance.ref.split(":");
  let owner = context.owner; let target; let localNodes = context.localNodes; let variableValues = context.variableValues;
  if (qualified.length > 1) {
    const alias = qualified.shift(); const imported = context.imports[alias];
    if (!imported) throw new Error(`Import ${alias} is missing or unreadable.`);
    owner = imported; localNodes = indexNodes(imported.children); target = localNodes.get(qualified.join(":"));
    variableValues = resolveVariables(imported.variables ?? {}, context.modes, {});
  } else target = localNodes.get(instance.ref);
  if (!target) throw new Error(`Ref ${instance.id} target ${instance.ref} was not found.`);
  const cycleKey = `${owner === context.owner ? "local" : instance.ref}:${target.id}`;
  if (context.resolving.includes(cycleKey)) throw new Error(`Ref cycle: ${[...context.resolving, cycleKey].join(" -> ")}.`);
  const props = resolveProps(target.properties ?? {}, instance.props ?? {});
  const resolved = resolveNode(target, { ...context, owner, localNodes, variableValues, props, resolving: [...context.resolving, cycleKey] });
  context.lowered.push({ node: instance.id, from: instance.ref, why: "Reference expanded into target-native nodes." });
  return prefixResolvedNode(resolved, instance.id, target.id, props);
}

function resolveProps(declarations, supplied) {
  const result = {};
  for (const [name, declaration] of Object.entries(declarations)) {
    const has = Object.hasOwn(supplied, name);
    if (!has && !Object.hasOwn(declaration, "default") && declaration.optional !== true) throw new Error(`Required component property ${name} is missing.`);
    const value = has ? supplied[name] : Object.hasOwn(declaration, "default") ? declaration.default : null;
    if (!compatible(value, declaration)) throw new Error(`Component property ${name} does not satisfy ${declaration.type}.`);
    result[name] = value;
  }
  for (const name of Object.keys(supplied)) if (!Object.hasOwn(declarations, name)) throw new Error(`Unknown component property ${name}.`);
  return result;
}

function prefixResolvedNode(node, instanceId, sourceId, props) {
  const result = { ...node, id: instanceId, provenance: { from: sourceId, props, lowered: true } };
  if (node.children) result.children = node.children.map((child) => prefixResolvedNode(child, `${instanceId}/${child.id}`, child.id, props));
  return result;
}

function compatible(value, declaration) {
  if (value === null) return declaration.optional === true;
  if (declaration.type === "number") return typeof value === "number" && Number.isFinite(value) && (declaration.min === undefined || value >= declaration.min) && (declaration.max === undefined || value <= declaration.max);
  if (declaration.type === "boolean") return typeof value === "boolean";
  if (["string", "color", "icon"].includes(declaration.type)) return typeof value === "string";
  if (declaration.type === "enum") return declaration.values.includes(value);
  if (declaration.type === "node") return value && typeof value === "object" && typeof value.type === "string";
  return false;
}

function resolveBinding(binding, props) {
  if (typeof binding !== "string" || !binding.startsWith("$props.")) throw new Error(`Invalid component binding ${binding}.`);
  const name = binding.slice(7);
  if (!Object.hasOwn(props, name)) throw new Error(`Component binding ${binding} is unavailable.`);
  return structuredClone(props[name]);
}

function resolveVariables(variables, modes, bindings) {
  const output = { ...bindings };
  const visiting = new Set();
  const resolve = (name) => {
    if (Object.hasOwn(bindings, name)) return bindings[name];
    if (Object.hasOwn(output, name)) return output[name];
    if (!Object.hasOwn(variables, name)) throw new Error(`Variable ${name} was not found.`);
    if (visiting.has(name)) throw new Error(`Variable cycle includes ${name}.`);
    visiting.add(name);
    const raw = resolveCascade(variables[name], { modes, props: {} });
    const value = typeof raw === "string" ? raw.replace(/\$\{([A-Za-z][\w-]*)\}/gu, (_, dependency) => String(resolve(dependency))) : raw;
    visiting.delete(name); output[name] = value; return value;
  };
  for (const name of Object.keys(variables)) resolve(name);
  return output;
}

function resolveValue(value, variables) {
  if (typeof value === "string") return value.replace(/\$\{([A-Za-z][\w-]*)\}/gu, (_, name) => {
    if (!Object.hasOwn(variables, name)) throw new Error(`Variable ${name} was not found.`);
    return String(variables[name]);
  });
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, variables));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, resolveValue(nested, variables)]));
  return value;
}

function matchesWhen(when, context) {
  if (!when) return true;
  for (const [axis, mode] of Object.entries(when)) {
    if (axis === "props") {
      for (const [name, value] of Object.entries(mode)) if (!Object.is(context.props?.[name], value)) return false;
    } else if (context.modes?.[axis] !== mode) return false;
  }
  return true;
}

function selectModes(axes, requested) {
  const selected = {};
  for (const [name, axis] of Object.entries(axes)) {
    const modes = axis.modes.map((mode) => mode.name);
    const value = requested[name] ?? modes[0];
    if (!modes.includes(value)) throw new Error(`Axis ${name} has no mode ${value}.`);
    selected[name] = value;
  }
  for (const name of Object.keys(requested)) if (!Object.hasOwn(axes, name)) throw new Error(`Unknown axis ${name}.`);
  return selected;
}

function indexNodes(children, map = new Map()) { for (const node of children ?? []) { map.set(node.id, node); indexNodes(node.children, map); } return map; }
