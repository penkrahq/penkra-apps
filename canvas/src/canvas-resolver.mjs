import { interpolateRichText } from "./rich-text.mjs";
import { resolveVariableReferences } from "./variable-references.mjs";
import {
  canonicalDescendantOverridesForComponent,
  resolveComponentDescendant,
} from "./component-descendants.mjs";
import { normalizeCanvasDocumentAliases } from "./canvas-normalization.mjs";

export function resolveCanvasDocument(document, options = {}) {
  document = normalizeCanvasDocumentAliases(document);
  const modes = selectModes(document.axes ?? {}, options.modes ?? {});
  const variableValues = resolveVariables(document.variables ?? {}, modes, options.bindings ?? {}, options.imports ?? {});
  const rootContext = { modes, props: {} };
  const paragraphStyles = Object.fromEntries(Object.entries(document.paragraphStyles ?? {}).map(([name, style]) => [name, resolveValue(resolveCascade(style, rootContext), variableValues, rootContext)]));
  const localNodes = indexNodes(document.children);
  const imports = options.imports ?? {};
  const consequences = [];
  const lowered = [];
  const resolving = [];
  const styleRegistry = { styles: paragraphStyles, nextId: 0 };
  const baseContext = {
    owner: document,
    rootOwner: document,
    styleRegistry,
    props: {},
    modes,
    variableValues,
    localNodes,
    imports,
    consequences,
    lowered,
    resolving,
    normalizedOwners: new WeakMap(),
    shouldExpandRef: options.shouldExpandRef ?? (() => true),
  };
  const children = document.children.map((node) => resolveNode(node, { ...baseContext, rootId: node.id })).filter(Boolean);
  const flows = (document.flows ?? []).map(remapResolvedFlowSource);
  return { document: { ...document, paragraphStyles, children, flows }, modes, consequences, lowered };
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
  if (!isCascade(value)) return value;
  let resolved = value[0]?.value;
  for (const entry of value) if (matchesWhen(entry.when, context)) resolved = entry.value;
  return resolved;
}

function resolveNode(source, context) {
  const path = context.componentPath?.join("/");
  const scopedOverride = path ? context.descendantOverrides?.[path] : null;
  if (plainObject(scopedOverride?.replace) && !context.consumedReplacementPaths?.has(path)) {
    source = { ...structuredClone(scopedOverride.replace), id: source.id };
    context = {
      ...context,
      consumedReplacementPaths: new Set([...(context.consumedReplacementPaths ?? []), path]),
    };
  }
  const authoredModes = {
    ...(source.modes ?? {}),
    ...(plainObject(scopedOverride?.modes) ? scopedOverride.modes : {}),
  };
  if (Object.keys(authoredModes).length > 0) {
    const axes = context.owner.axes ?? {};
    const inherited = Object.fromEntries(Object.entries(context.modes).filter(([name]) => Object.hasOwn(axes, name)));
    const modes = { ...context.modes, ...selectModes(axes, { ...inherited, ...authoredModes }) };
    const bindings = Object.fromEntries(Object.entries(context.variableValues).filter(([name]) => !Object.hasOwn(context.owner.variables ?? {}, name)));
    context = { ...context, modes, scopedModes: true, variableValues: resolveVariables(context.owner.variables ?? {}, modes, bindings, context.imports) };
  }
  if (source.type === "ref") {
    if (source.properties) {
      context = context.componentRoot
        ? { ...context, componentRoot: false }
        : { ...context, props: resolveProps(source.properties, {}), componentRoot: false };
    } else if (context.componentRoot) context = { ...context, componentRoot: false };
    if (!context.shouldExpandRef(source, { rootId: context.rootId, componentPath: context.componentPath ?? [] })) {
      return resolveDeferredRef(source, context);
    }
    return resolveRef(source, context);
  }
  if (source.properties) {
    context = context.componentRoot
      ? { ...context, componentRoot: false }
      : { ...context, props: resolveProps(source.properties, {}), componentRoot: false };
  } else if (context.componentRoot) context = { ...context, componentRoot: false };
  const output = {};
  for (const [key, raw] of Object.entries(source)) {
    if (["children", "properties", "bind", "varies"].includes(key)) continue;
    const value = resolveCascade(raw, context);
    output[key] = source.type === "text" && key === "content" ? value : resolveValue(value, context.variableValues, context);
  }
  for (const [key, binding] of Object.entries(source.bind ?? {}))
    output[key] = resolveValue(resolveBinding(binding, context.props), context.variableValues, context);
  if (source.visible && typeof source.visible === "object" && source.visible.op)
    output.enabled = evaluateCondition(source.visible, context);
  if (output.type === "text") {
    const textSource = { ...output, content: String(output.content ?? ""), marks: source.marks ?? [], paragraphs: source.paragraphs ?? [] };
    const resolvedText = interpolateRichText(textSource, context.variableValues);
    output.content = resolvedText.content; output.marks = resolvedText.marks; output.paragraphs = resolvedText.paragraphs;
    if (source.bind?.content && output.content.length > 0) {
      output.marks = [];
      output.paragraphs = [{ from: 0, to: output.content.length, ...(source.style ? { style: source.style } : {}) }];
    }
    // A library style keeps its definition identity. Consumer mode selection
    // still flows into its cascade; an unrelated same-named style cannot replace it.
    if (context.owner !== context.rootOwner || context.scopedModes || output.style?.includes(":") || output.paragraphs.some((paragraph) => paragraph.style?.includes(":"))) {
      const names = new Map();
      const register = (name) => {
        if (names.has(name)) return names.get(name);
        const style = resolveParagraphStyle(name, context);
        const registry = context.styleRegistry;
        let key;
        do { key = `@canvas-resolved-style/${registry.nextId++}`; } while (Object.hasOwn(registry.styles, key));
        registry.styles[key] = style;
        names.set(name, key);
        return key;
      };
      if (output.style) output.style = register(output.style);
      output.paragraphs = output.paragraphs.map((paragraph) => paragraph.style ? { ...paragraph, style: register(paragraph.style) } : paragraph);
    }
  }
  if (context.assetPrefix) {
    for (const key of ["fill", "stroke", "effect"]) {
      if (output[key] !== undefined) output[key] = namespaceAssetReferences(output[key], context.assetPrefix);
    }
  }
  output.children = (source.children ?? []).map((child) => resolveNode(child, context.componentPath
    ? { ...context, componentPath: [...context.componentPath, child.id] }
    : context)).filter(Boolean);
  if (source.children === undefined) delete output.children;
  return output;
}

function resolveDeferredRef(source, context) {
  const output = {};
  for (const [key, raw] of Object.entries(source)) {
    const value = resolveCascade(raw, context);
    output[key] = resolveValue(value, context.variableValues, context);
  }
  if (context.assetPrefix) {
    for (const key of ["fill", "stroke", "effect"]) {
      if (output[key] !== undefined) output[key] = namespaceAssetReferences(output[key], context.assetPrefix);
    }
  }
  const qualified = String(source.ref ?? "").split(":");
  let owner = context.owner;
  let components = context.localNodes;
  if (qualified.length > 1) {
    const alias = qualified.shift();
    const imported = context.imports[alias];
    if (!imported) throw new Error(`Import ${alias} is missing or unreadable.`);
    owner = normalizedImportedOwner(imported, context);
    components = indexNodes(owner.children);
  }
  const targetId = qualified.join(":");
  const target = components.get(targetId);
  if (!target) throw new Error(`Ref ${source.id} target ${source.ref} was not found.`);
  const canonical = canonicalDescendantOverridesForComponent(source, target, {
    strict: true,
    components,
  });
  if (canonical.errors.length) {
    const error = new Error(canonical.errors.join("\n"));
    error.code = "CANVAS_DESCENDANT_OVERRIDE_INVALID";
    throw error;
  }
  const descendants = structuredClone(canonical.overrides);
  compileDeferredSlots({
    source,
    target,
    descendants,
    context,
    components,
  });
  if (Object.keys(descendants).length > 0) output.descendants = descendants;
  delete output.slots;
  return output;
}

function compileDeferredSlots({ source, target, descendants, context, components }) {
  const suppliedSlots = source.slots ?? {};
  if (!plainObject(suppliedSlots)) throw new Error(`Component instance slots must be an object.`);
  const declarations = target.properties ?? {};
  for (const [name, declaration] of Object.entries(declarations)) {
    if (declaration?.type !== "slot") continue;
    const targetNode = declaration.target === "."
      ? target
      : resolveComponentDescendant(target, declaration.target, { components });
    if (!targetNode || targetNode.type !== "frame") {
      throw new Error(`Component slot ${name} target ${declaration.target} is not the component root or a frame descendant.`);
    }
    const path = declaration.target;
    const prior = descendants[path] ?? {};
    descendants[path] = {
      ...prior,
      provenance: {
        ...(prior.provenance ?? targetNode.provenance ?? {}),
        slotTarget: {
          instanceId: source.id,
          name,
          ...(declaration.preferredComponents
            ? { preferredComponents: structuredClone(declaration.preferredComponents) }
            : {}),
        },
      },
    };
  }
  for (const [name, children] of Object.entries(suppliedSlots)) {
    const declaration = declarations[name];
    if (declaration?.type !== "slot") throw new Error(`Component ${target.id} has no slot named ${name}.`);
    if (!Array.isArray(children)) throw new Error(`Component slot ${name} must be an array of Canvas nodes.`);
    const path = declaration.target;
    const parentPrefix = path === "." ? source.id : `${source.id}/${path}`;
    const resolvedChildren = children.map((child) => resolveNode(child, {
      ...context,
      componentRoot: false,
    })).filter(Boolean).map((child) => prefixDeferredSlotContent(child, parentPrefix, source.id, name));
    descendants[path] = { ...(descendants[path] ?? {}), children: resolvedChildren };
  }
}

function prefixDeferredSlotContent(node, parentPrefix, instanceId, name) {
  const reference = node.provenance?.reference ?? node.provenance?.from ?? node.id;
  node.id = `${parentPrefix}/${node.id}`;
  node.provenance = {
    ...(node.provenance ?? {}),
    reference,
    slot: { instanceId, name },
  };
  node.children = (node.children ?? []).map((child) => (
    prefixDeferredSlotContent(child, node.id, instanceId, name)
  ));
  return node;
}

function resolveParagraphStyle(name, context) {
  let owner = context.owner;
  let modes = context.modes;
  let variableValues = context.variableValues;
  let id = name;
  if (name.includes(":")) {
    const separator = name.indexOf(":");
    const alias = name.slice(0, separator);
    id = name.slice(separator + 1);
    const imported = Object.hasOwn(context.imports, alias) ? context.imports[alias] : undefined;
    if (!imported) throw new Error(`Import ${alias} is missing or unreadable.`);
    if (imported.release && !imported.release.publicItems.some((item) => item.kind === "paragraphStyle" && item.id === id)) throw new Error(`Paragraph style ${name} is not published.`);
    owner = normalizedImportedOwner(imported, context);
    modes = { ...context.modes };
    for (const [axisName, axis] of Object.entries(owner.axes ?? {})) {
      if (!axis.modes.some((mode) => mode.name === modes[axisName])) modes[axisName] = axis.modes[0]?.name;
    }
    variableValues = resolveVariables(owner.variables ?? {}, modes, {}, imported.imports ?? {});
  }
  if (!Object.hasOwn(owner.paragraphStyles ?? {}, id)) throw new Error(`Paragraph style ${name} was not found in its owning document.`);
  return resolveValue(resolveCascade(owner.paragraphStyles[id], { ...context, modes }), variableValues, { ...context, modes });
}

function namespaceAssetReferences(value, prefix) {
  if (Array.isArray(value)) return value.map((item) => namespaceAssetReferences(item, prefix));
  if (!value || typeof value !== "object") return value;
  const output = Object.fromEntries(Object.entries(value).map(([key, nested]) => [
    key,
    namespaceAssetReferences(nested, prefix),
  ]));
  if (output.type === "image" && typeof output.url === "string" && !/^(?:data:|https?:|file:|\/)/u.test(output.url)) {
    output.url = `${prefix}/${output.url}`;
  }
  return output;
}

function resolveRef(instance, context) {
  const instanceContext = context;
  const qualified = instance.ref.split(":");
  let owner = context.owner; let target; let localNodes = context.localNodes; let variableValues = context.variableValues;
  if (qualified.length > 1) {
    const alias = qualified.shift(); const imported = context.imports[alias];
    if (!imported) throw new Error(`Import ${alias} is missing or unreadable.`);
    owner = normalizedImportedOwner(imported, context);
    localNodes = indexNodes(owner.children);
    target = localNodes.get(qualified.join(":"));
    const modes = { ...context.modes };
    for (const [name, axis] of Object.entries(owner.axes ?? {})) {
      if (!axis.modes.some((mode) => mode.name === modes[name])) modes[name] = axis.modes[0]?.name;
    }
    variableValues = resolveVariables(owner.variables ?? {}, modes, {}, imported.imports ?? {});
    context = {
      ...context,
      modes,
      imports: imported.imports ?? {},
      assetPrefix: [context.assetPrefix, "imports", alias].filter(Boolean).join("/"),
    };
  } else target = localNodes.get(instance.ref);
  if (!target) throw new Error(`Ref ${instance.id} target ${instance.ref} was not found.`);
  const cycleKey = `${owner === context.owner ? "local" : instance.ref}:${target.id}`;
  if (context.resolving.includes(cycleKey)) throw new Error(`Ref cycle: ${[...context.resolving, cycleKey].join(" -> ")}.`);
  const ownDescendants = canonicalDescendantOverridesForComponent(instance, target, { strict: true, components: localNodes });
  if (ownDescendants.errors.length) {
    const error = new Error(ownDescendants.errors.join("\n"));
    error.code = "CANVAS_DESCENDANT_OVERRIDE_INVALID";
    throw error;
  }
  const componentPath = context.componentPath ?? [];
  const prefix = componentPath.join("/");
  const prefixedOwnDescendants = Object.fromEntries(Object.entries(ownDescendants.overrides).map(([path, override]) => [
    [prefix, path].filter(Boolean).join("/"),
    override,
  ]));
  const descendantOverrides = { ...prefixedOwnDescendants, ...(context.descendantOverrides ?? {}) };
  const instanceOverride = prefix ? descendantOverrides[prefix] : null;
  const suppliedProps = { ...(instance.props ?? {}) };
  for (const [name, binding] of Object.entries(instance.bind ?? {})) {
    if (!Object.hasOwn(target.properties ?? {}, name)) continue;
    suppliedProps[name] = resolveBinding(binding, context.props, `ref ${instance.id} property ${name}`);
  }
  Object.assign(suppliedProps, plainObject(instanceOverride?.props) ? instanceOverride.props : {});
  const props = resolveProps(target.properties ?? {}, suppliedProps);
  const targetContext = {
    ...context,
    owner,
    localNodes,
    variableValues,
    props,
    componentRoot: true,
    componentPath,
    descendantOverrides,
    resolving: [...context.resolving, cycleKey],
  };
  const resolved = resolveNode(target, targetContext);
  applyResolvedSlots(
    resolved,
    target,
    instance.slots ?? {},
    { ...instanceContext, componentRoot: false, resolving: targetContext.resolving },
    instance.id,
  );
  applyResolvedDescendantOverrides(
    resolved,
    target,
    relativeDescendantOverrides(descendantOverrides, componentPath),
    { ...instanceContext, props, componentRoot: false, resolving: targetContext.resolving },
    localNodes,
  );
  context.lowered.push({ node: instance.id, from: instance.ref, why: "Reference expanded into target-native nodes." });
  const output = prefixResolvedNode(resolved, instance.id, target.id, props);
  // A component definition's canvas position is not the instance position.
  // Keep instance geometry/compositing and the author's one-way export override
  // when replacing the reference with its resolved visual subtree.
  output.x = resolveValue(resolveCascade(instance.x ?? 0, instanceContext), instanceContext.variableValues, instanceContext);
  output.y = resolveValue(resolveCascade(instance.y ?? 0, instanceContext), instanceContext.variableValues, instanceContext);
  for (const key of ["name", "width", "height", "rotation", "flipX", "flipY", "opacity", "enabled", "export", "description", "decorative", "layoutPosition", "gridColumn", "gridRow"]) {
    if (Object.hasOwn(instance, key)) output[key] = resolveValue(resolveCascade(instance[key], instanceContext), instanceContext.variableValues, instanceContext);
  }
  return output;
}

function applyResolvedSlots(resolvedRoot, sourceRoot, suppliedSlots, context, instanceId) {
  if (!suppliedSlots || typeof suppliedSlots !== "object" || Array.isArray(suppliedSlots)) {
    throw new Error(`Component instance slots must be an object.`);
  }
  const declarations = sourceRoot.properties ?? {};
  for (const [name, declaration] of Object.entries(declarations)) {
    if (declaration?.type !== "slot") continue;
    const resolvedTarget = nodeAtRelativePath(resolvedRoot, declaration.target);
    if (!resolvedTarget) throw new Error(`Component slot ${name} target ${declaration.target} is unavailable after resolution.`);
    resolvedTarget.provenance = {
      ...(resolvedTarget.provenance ?? {}),
      slotTarget: {
        instanceId,
        name,
        ...(declaration.preferredComponents
          ? { preferredComponents: structuredClone(declaration.preferredComponents) }
          : {}),
      },
    };
  }
  for (const [name, children] of Object.entries(suppliedSlots)) {
    const declaration = declarations[name];
    if (declaration?.type !== "slot") throw new Error(`Component ${sourceRoot.id} has no slot named ${name}.`);
    if (!Array.isArray(children)) throw new Error(`Component slot ${name} must be an array of Canvas nodes.`);
    const sourceTarget = nodeAtRelativePath(sourceRoot, declaration.target);
    const resolvedTarget = nodeAtRelativePath(resolvedRoot, declaration.target);
    if (!sourceTarget || !resolvedTarget || sourceTarget.type !== "frame") throw new Error(`Component slot ${name} target ${declaration.target} is not the component root or a frame descendant.`);
    resolvedTarget.children = children.map((child) => {
      const resolved = resolveNode(child, context);
      if (resolved) markResolvedSlotContent(resolved, instanceId, name);
      return resolved;
    }).filter(Boolean);
  }
}

function markResolvedSlotContent(node, instanceId, name) {
  const prior = node.provenance ?? {};
  node.provenance = {
    ...prior,
    reference: prior.reference ?? prior.from ?? node.id,
    slot: { instanceId, name },
  };
  for (const child of node.children ?? []) markResolvedSlotContent(child, instanceId, name);
}

function nodeAtRelativePath(root, path) {
  if (path === ".") return root;
  let node = root;
  for (const id of String(path ?? "").split("/").filter(Boolean)) {
    node = (node.children ?? []).find((candidate) => candidate.id === id);
    if (!node) return null;
  }
  return node === root ? null : node;
}

function normalizedImportedOwner(imported, context) {
  const source = imported.document ?? imported;
  if (!source || typeof source !== "object") return source;
  let normalized = context.normalizedOwners.get(source);
  if (!normalized) {
    normalized = normalizeCanvasDocumentAliases(source);
    context.normalizedOwners.set(source, normalized);
  }
  return normalized;
}

function applyResolvedDescendantOverrides(resolvedRoot, sourceRoot, overrides, context, components) {
  for (const [path, override] of Object.entries(overrides)) {
    const ids = path.split("/");
    let resolved = resolvedRoot;
    for (const id of ids) {
      resolved = (resolved.children ?? []).find((candidate) => (
        candidate.id === id || candidate.provenance?.from === id
      ));
      if (!resolved) break;
    }
    const source = resolveComponentDescendant(sourceRoot, path, { components });
    if (!resolved || !source) continue;
    for (const [property, raw] of Object.entries(override)) {
      if (["props", "modes", "replace"].includes(property)) continue;
      if (property === "children") {
        resolved.children = raw.map((child) => resolveNode(child, context)).filter(Boolean);
        continue;
      }
      const value = resolveValue(resolveCascade(raw, context), context.variableValues, context);
      resolved[property] = source.type === "text" && property === "content" ? String(value ?? "") : value;
    }
  }
}

function relativeDescendantOverrides(overrides, componentPath) {
  const prefix = componentPath.join("/");
  const output = {};
  for (const [path, override] of Object.entries(overrides)) {
    if (!prefix) output[path] = override;
    else if (path.startsWith(`${prefix}/`)) output[path.slice(prefix.length + 1)] = override;
  }
  return output;
}

function resolveProps(declarations, supplied) {
  const result = {};
  for (const [name, declaration] of Object.entries(declarations)) {
    if (declaration.type === "slot") {
      if (Object.hasOwn(supplied, name)) throw new Error(`Component slot ${name} must be supplied through instance.slots.`);
      continue;
    }
    const has = Object.hasOwn(supplied, name);
    if (!has && !Object.hasOwn(declaration, "default") && declaration.optional !== true) throw new Error(`Required component property ${name} is missing.`);
    const value = has ? supplied[name] : Object.hasOwn(declaration, "default") ? declaration.default : null;
    if (!compatible(value, declaration)) throw new Error(`Component property ${name} does not satisfy ${declaration.type}.`);
    result[name] = value;
  }
  for (const name of Object.keys(supplied)) if (!Object.hasOwn(declarations, name)) throw new Error(`Unknown component property ${name}.`);
  return result;
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function prefixResolvedNode(node, instanceId, sourceId, props) {
  const idMap = new Map();
  const collect = (candidate, prefix) => {
    idMap.set(candidate.id, prefix);
    for (const child of candidate.children ?? []) {
      const childPath = child.id.startsWith(`${candidate.id}/`)
        ? child.id.slice(candidate.id.length + 1)
        : child.id;
      collect(child, `${prefix}/${childPath}`);
    }
  };
  collect(node, instanceId);
  const clone = (candidate) => {
    const prior = candidate.provenance ?? {};
    const result = {
      ...candidate,
      id: idMap.get(candidate.id),
      provenance: {
        ...prior,
        from: prior.from ?? (candidate.id === node.id ? sourceId : candidate.id),
        reference: prior.slot ? prior.reference : idMap.get(candidate.id),
        props,
        lowered: true,
      },
    };
    if (typeof candidate.notesFor === "string") result.notesFor = idMap.get(candidate.notesFor) ?? candidate.notesFor;
    if (candidate.children) result.children = candidate.children.map(clone);
    return result;
  };
  return clone(node);
}

function remapResolvedFlowSource(flow) {
  const source = flow.trigger?.source;
  if (!source || !Array.isArray(source.path) || source.path.length === 0) return flow;
  return {
    ...flow,
    trigger: {
      ...flow.trigger,
      source: { path: [], node: [...source.path, source.node].join("/") },
    },
  };
}

export function isCascade(value) {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || !Object.hasOwn(entry, "value")) return false;
    return Object.keys(entry).every((key) => key === "value" || key === "when");
  });
}

function compatible(value, declaration) {
  if (value === null) return declaration.optional === true;
  if (declaration.type === "number") return typeof value === "number" && Number.isFinite(value) && (declaration.min === undefined || value >= declaration.min) && (declaration.max === undefined || value <= declaration.max);
  if (declaration.type === "boolean") return typeof value === "boolean";
  if (["string", "color", "icon"].includes(declaration.type)) return typeof value === "string";
  if (declaration.type === "enum") return declaration.values.includes(value);
  if (declaration.type === "node") return value && typeof value === "object" && typeof value.type === "string";
  if (declaration.type === "slot") return Array.isArray(value);
  return false;
}

function resolveBinding(binding, props, destination = "component property") {
  if (typeof binding !== "string" || !binding.startsWith("$props.")) throw new Error(`Invalid component binding ${binding}.`);
  const name = binding.slice(7);
  if (!Object.hasOwn(props, name)) throw new Error(`Component binding ${binding} is unavailable for ${destination}.`);
  return structuredClone(props[name]);
}

function resolveVariables(variables, modes, bindings, imports = {}, owners = new Set()) {
  const output = {};
  for (const [alias, imported] of Object.entries(imports)) {
    const owner = imported.document ?? imported;
    if (owners.has(owner)) throw new Error(`Variable import cycle includes ${alias}.`);
    const sourceModes = { ...modes };
    for (const [name, axis] of Object.entries(owner.axes ?? {})) {
      if (!axis.modes.some((mode) => mode.name === sourceModes[name])) sourceModes[name] = axis.modes[0]?.name;
    }
    const values = resolveVariables(owner.variables ?? {}, sourceModes, {}, imported.imports ?? {}, new Set([...owners, owner]));
    const names = imported.release
      ? imported.release.publicItems.filter((item) => item.kind === "variable").map((item) => item.id)
      : Object.keys(owner.variables ?? {});
    for (const name of names) output[`${alias}:${name}`] = values[name];
  }
  for (const [name, value] of Object.entries(bindings)) Object.defineProperty(output, name, { value, enumerable: true, writable: true, configurable: true });
  const visiting = new Set();
  const resolve = (name) => {
    if (Object.hasOwn(bindings, name)) return bindings[name];
    if (Object.hasOwn(output, name)) return output[name];
    if (!Object.hasOwn(variables, name)) throw new Error(`Variable ${name} was not found.`);
    if (visiting.has(name)) throw new Error(`Variable cycle includes ${name}.`);
    visiting.add(name);
    const definition = variables[name];
    if (!definition || typeof definition !== "object" || !Array.isArray(definition.cascade)) throw new Error(`Variable ${name} must declare tokenType and cascade.`);
    const raw = resolveCascade(definition.cascade, { modes, props: {} });
    const value = resolveVariableReferences(raw, resolve);
    visiting.delete(name); output[name] = value; return value;
  };
  for (const name of Object.keys(variables)) resolve(name);
  return output;
}

function resolveValue(value, variables, context) {
  const cascaded = context ? resolveNestedCascades(value, context) : value;
  return resolveVariableReferences(cascaded, (name) => {
    if (!Object.hasOwn(variables, name)) throw new Error(`Variable ${name} was not found.`);
    return variables[name];
  });
}

function resolveNestedCascades(value, context) {
  const selected = resolveCascade(value, context);
  if (selected !== value) return resolveNestedCascades(selected, context);
  if (Array.isArray(value)) return value.map((item) => resolveNestedCascades(item, context));
  if (!plainObject(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    key === "when" ? structuredClone(child) : resolveNestedCascades(child, context),
  ]));
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

function indexNodes(children, map = new Map()) { for (const node of children ?? []) { map.set(node.id, node); indexNodes(node.children, map); for (const content of Object.values(node.slots ?? {})) indexNodes(content, map); } return map; }
