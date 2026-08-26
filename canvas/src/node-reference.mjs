export function formatCanvasNodeReference({ node, nodeId }) {
  const id = nodeId ?? node?.id;
  if (!id) throw new Error("A Canvas node reference requires a node ID.");
  return `Node ID: ${id}`;
}

export function resolveCanvasNodeReferenceId({ document, graph, selectedId }) {
  if (!selectedId) return null;
  const sourceIds = collectSourceNodeIds(document?.children);
  if (sourceIds.has(selectedId)) return selectedId;
  if (!graph?.getNode) return null;

  const descendantPath = [];
  const visited = new Set();
  let current = graph.getNode(selectedId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (sourceIds.has(current.id)) {
      return descendantPath.length > 0
        ? [current.id, ...descendantPath.reverse()].join("/")
        : current.id;
    }
    if (typeof current.componentId !== "string" || current.componentId.length === 0) {
      return null;
    }
    descendantPath.push(stableComponentId(graph, current.componentId, sourceIds));
    current = current.parentId ? graph.getNode(current.parentId) : null;
  }
  return null;
}

function collectSourceNodeIds(nodes = [], output = new Set()) {
  for (const node of nodes ?? []) {
    if (typeof node?.id === "string") output.add(node.id);
    collectSourceNodeIds(node?.children, output);
  }
  return output;
}

function stableComponentId(graph, componentId, sourceIds) {
  const visited = new Set();
  let id = componentId;
  while (!visited.has(id)) {
    visited.add(id);
    if (sourceIds.has(id)) break;
    const component = graph.getNode(id);
    if (typeof component?.componentId !== "string" || component.componentId.length === 0) break;
    id = component.componentId;
  }
  return id;
}

export async function copyTextToClipboard(text, {
  documentObject = globalThis.document,
  navigatorObject = globalThis.navigator,
} = {}) {
  if (documentObject?.body && typeof documentObject.execCommand === "function") {
    const input = documentObject.createElement("textarea");
    input.value = text;
    input.readOnly = true;
    input.setAttribute("aria-hidden", "true");
    input.style.cssText = "position:fixed;left:-10000px;top:0;opacity:0";
    documentObject.body.append(input);
    input.select();
    const copied = documentObject.execCommand("copy");
    input.remove();
    if (copied) return;
  }
  if (typeof navigatorObject?.clipboard?.writeText === "function") {
    await navigatorObject.clipboard.writeText(text);
    return;
  }
  throw new Error("Clipboard writing is unavailable in this Canvas frame.");
}
