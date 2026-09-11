export function canonicalDescendantOverrides(document, instance, { strict = false } = {}) {
  if (!plainObject(instance?.descendants)) return { overrides: {}, errors: [] };
  const nodes = collectNodes(document?.children);
  const component = nodes.get(instance.ref);
  if (!component) return { overrides: structuredClone(instance.descendants), errors: [] };

  return canonicalDescendantOverridesForComponent(instance, component, { strict });
}

export function canonicalDescendantOverridesForComponent(instance, component, { strict = false } = {}) {
  if (!plainObject(instance?.descendants)) return { overrides: {}, errors: [] };

  const paths = new Map();
  collectPaths(component.children ?? [], [], paths);
  const output = {};
  const errors = [];
  for (const [key, value] of Object.entries(instance.descendants)) {
    const canonical = key.includes("/") ? key : paths.get(key);
    if (!canonical || !pathExists(component, canonical)) {
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

function collectNodes(nodes = [], output = new Map()) {
  for (const node of nodes) {
    if (typeof node?.id === "string") output.set(node.id, node);
    collectNodes(node?.children, output);
    for (const content of Object.values(node?.slots ?? {})) collectNodes(content, output);
  }
  return output;
}

function collectPaths(nodes, parentPath, output) {
  for (const node of nodes) {
    const path = [...parentPath, node.id];
    output.set(node.id, path.join("/"));
    collectPaths(node.children ?? [], path, output);
  }
}

function pathExists(component, path) {
  let children = component.children ?? [];
  for (const id of path.split("/")) {
    const node = children.find((candidate) => candidate?.id === id);
    if (!node) return false;
    children = node.children ?? [];
  }
  return true;
}

function plainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
