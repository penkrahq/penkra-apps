export function applyMutationsToProjection(document, mutations) {
  const index = createProjectionIndex(document);
  for (const mutation of mutations) applyMutation(document, index, mutation);
  return document;
}

export function compactDeletionMutations(mutations, documentNodes) {
  const deleted = new Set(
    mutations.filter((mutation) => mutation.kind === "delete-node").map((mutation) => mutation.nodeId),
  );
  if (deleted.size < 2) return mutations;
  const parentById = new Map(documentNodes.map(({ node, parentId }) => [node.id, parentId]));
  return mutations.filter((mutation) => {
    if (mutation.kind !== "delete-node") return true;
    let parentId = parentById.get(mutation.nodeId) ?? null;
    while (parentId !== null) {
      if (deleted.has(parentId)) return false;
      parentId = parentById.get(parentId) ?? null;
    }
    return true;
  });
}

function applyMutation(document, index, mutation) {
  if (mutation.kind === "set-property") {
    const entry = index.get(mutation.nodeId);
    if (!entry) throw new Error(`Projection node ${mutation.nodeId} was not found.`);
    entry.node[mutation.property] = structuredClone(mutation.value);
    return;
  }
  if (mutation.kind === "set-property-path") {
    const entry = index.get(mutation.nodeId);
    if (!entry) throw new Error(`Projection node ${mutation.nodeId} was not found.`);
    entry.node[mutation.property] ??= {};
    let target = entry.node[mutation.property];
    for (const key of mutation.path.slice(0, -1)) target = target[key] ??= {};
    target[mutation.path.at(-1)] = structuredClone(mutation.value);
    return;
  }
  if (mutation.kind === "insert-node") {
    if (index.has(mutation.node.id)) return;
    const parentId = mutation.parentId ?? null;
    const children = childrenFor(document, index, parentId);
    const node = structuredClone(mutation.node);
    children.splice(insertionIndex(children, mutation.position), 0, node);
    indexSubtree(index, node, parentId);
    return;
  }
  if (mutation.kind === "delete-node") {
    const entry = index.get(mutation.nodeId);
    if (!entry) return;
    const children = childrenFor(document, index, entry.parentId);
    const position = children.findIndex((node) => node.id === mutation.nodeId);
    if (position >= 0) children.splice(position, 1);
    removeSubtreeFromIndex(index, entry.node);
    return;
  }
  if (mutation.kind === "move-node") {
    const entry = index.get(mutation.nodeId);
    if (!entry) throw new Error(`Projection node ${mutation.nodeId} was not found.`);
    const source = childrenFor(document, index, entry.parentId);
    const sourceIndex = source.findIndex((node) => node.id === mutation.nodeId);
    if (sourceIndex < 0) throw new Error(`Projection node ${mutation.nodeId} has no parent entry.`);
    const [node] = source.splice(sourceIndex, 1);
    const parentId = mutation.parentId ?? null;
    const target = childrenFor(document, index, parentId);
    target.splice(insertionIndex(target, mutation.position), 0, node);
    entry.parentId = parentId;
    return;
  }
  throw new Error(`Unsupported projection mutation: ${String(mutation.kind)}`);
}

function childrenFor(document, index, parentId) {
  if (parentId === null) return document.children ??= [];
  const parent = index.get(parentId)?.node;
  if (!parent) throw new Error(`Projection parent ${parentId} was not found.`);
  return parent.children ??= [];
}

function createProjectionIndex(document) {
  const index = new Map();
  for (const node of document.children ?? []) indexSubtree(index, node, null);
  return index;
}

function indexSubtree(index, node, parentId) {
  index.set(node.id, { node, parentId });
  for (const child of node.children ?? []) indexSubtree(index, child, node.id);
}

function removeSubtreeFromIndex(index, node) {
  index.delete(node.id);
  for (const child of node.children ?? []) removeSubtreeFromIndex(index, child);
}

function insertionIndex(children, position) {
  if (!Number.isFinite(position)) return children.length;
  return Math.max(0, Math.min(children.length, Math.trunc(position)));
}
