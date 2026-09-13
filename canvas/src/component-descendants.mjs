export function canonicalDescendantOverrides(document, instance, { strict = false } = {}) {
  if (!plainObject(instance?.descendants)) return { overrides: {}, errors: [] };
  const nodes = collectNodes(document?.children);
  const component = nodes.get(instance.ref);
  if (!component) return { overrides: structuredClone(instance.descendants), errors: [] };

  return canonicalDescendantOverridesForComponent(instance, component, { strict, components: nodes });
}

export function canonicalDescendantOverridesForComponent(instance, component, { strict = false, components } = {}) {
  if (!plainObject(instance?.descendants)) return { overrides: {}, errors: [] };

  components ??= collectNodes([component]);
  const paths = new Map();
  collectPaths(component.children ?? [], [], paths, components, new Set([component.id]));
  const output = {};
  const errors = [];
  for (const [key, value] of Object.entries(instance.descendants)) {
    const direct = resolveComponentDescendant(component, key, { components });
    const canonical = direct
      ? key
      : canonicalizeLegacyPath(component, key, components) ?? paths.get(key);
    if (!canonical || !resolveComponentDescendant(component, canonical, { components })) {
      errors.push(`${instance.id}.descendants.${key} does not identify a descendant of component ${component.id}. Descendant paths omit the component root ID.`);
      if (!strict) output[key] = structuredClone(value);
      continue;
    }
    if (Object.hasOwn(output, canonical)) {
      errors.push(`${instance.id}.descendants defines ${canonical} more than once through equivalent keys.`);
      continue;
    }
    output[canonical] = structuredClone(value);
  }
  return { overrides: output, errors };
}

function canonicalizeLegacyPath(component, path, components) {
  const output = [];
  let searchRoot = component;
  for (const id of String(path ?? "").split("/").filter(Boolean)) {
    const relative = uniqueLiteralPath(searchRoot.children ?? [], id);
    if (!relative) return null;
    output.push(...relative);
    const selected = literalNodeAtPath(searchRoot.children ?? [], relative);
    if (!selected) return null;
    if (selected.type === "ref" && typeof selected.ref === "string" && !selected.ref.includes(":")) {
      searchRoot = components.get(selected.ref);
      if (!searchRoot) return null;
    } else {
      searchRoot = selected;
    }
  }
  return output.join("/");
}

function uniqueLiteralPath(children, id) {
  const matches = [];
  const visit = (nodes, prefix) => {
    for (const node of nodes ?? []) {
      const path = [...prefix, node.id];
      if (node.id === id) matches.push(path);
      visit(node.children, path);
    }
  };
  visit(children, []);
  return matches.length === 1 ? matches[0] : null;
}

function literalNodeAtPath(children, path) {
  let node = null;
  for (const id of path) {
    node = (node?.children ?? children).find((candidate) => candidate?.id === id);
    if (!node) return null;
  }
  return node;
}

export function resolveComponentDescendant(component, path, { components } = {}) {
  components ??= collectNodes([component]);
  let children = component.children ?? [];
  const visited = new Set([component.id]);
  let node = null;
  for (const id of String(path ?? "").split("/").filter(Boolean)) {
    node = children.find((candidate) => candidate?.id === id);
    if (!node) return null;
    children = node.children ?? [];
    if (node.type === "ref" && typeof node.ref === "string" && !node.ref.includes(":")) {
      const target = components.get(node.ref);
      if (target && !visited.has(target.id)) {
        visited.add(target.id);
        children = target.children ?? [];
      }
    }
  }
  return node;
}

function collectNodes(nodes = [], output = new Map()) {
  for (const node of nodes) {
    if (typeof node?.id === "string") output.set(node.id, node);
    collectNodes(node?.children, output);
    for (const content of Object.values(node?.slots ?? {})) collectNodes(content, output);
  }
  return output;
}

function collectPaths(nodes, parentPath, output, components, visited) {
  for (const node of nodes) {
    const path = [...parentPath, node.id];
    const canonical = path.join("/");
    if (!output.has(node.id)) output.set(node.id, canonical);
    else if (output.get(node.id) !== canonical) output.set(node.id, null);
    collectPaths(node.children ?? [], path, output, components, visited);
    if (node.type !== "ref" || typeof node.ref !== "string" || node.ref.includes(":")) continue;
    const target = components.get(node.ref);
    if (!target || visited.has(target.id)) continue;
    collectPaths(target.children ?? [], path, output, components, new Set([...visited, target.id]));
  }
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
