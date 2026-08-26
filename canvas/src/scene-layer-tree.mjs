export function listCanvasSceneLayers(graph, pageId) {
  if (!graph?.getNode || !pageId) return [];
  const page = graph.getNode(pageId);
  if (!page) return [];
  const output = [];
  const append = (parent, depth) => {
    for (const childId of parent.childIds ?? []) {
      const node = graph.getNode(childId);
      if (!node || node.internalOnly) continue;
      output.push({ node, depth });
      append(node, depth + 1);
    }
  };
  append(page, 0);
  for (let index = 0; index < output.length; index += 1) {
    output[index].hasChildren = (output[index + 1]?.depth ?? -1) > output[index].depth;
  }
  return output;
}

export function visibleCanvasSceneLayers(layers, expandedIds) {
  const expanded = expandedIds instanceof Set ? expandedIds : new Set(expandedIds ?? []);
  const ancestors = [];
  const visible = [];
  for (const entry of layers ?? []) {
    ancestors.length = entry.depth;
    const parent = ancestors[entry.depth - 1];
    if (entry.depth === 0 || (parent?.visible && expanded.has(parent.node.id))) {
      visible.push(entry);
      ancestors[entry.depth] = { node: entry.node, visible: true };
    } else {
      ancestors[entry.depth] = { node: entry.node, visible: false };
    }
  }
  return visible;
}

export function canvasSceneLayerAncestorIds(graph, pageId, nodeId) {
  if (!graph?.getNode || !pageId || !nodeId) return [];
  const ancestors = [];
  let node = graph.getNode(nodeId);
  const visited = new Set();
  while (node?.parentId && node.parentId !== pageId && !visited.has(node.parentId)) {
    visited.add(node.parentId);
    ancestors.unshift(node.parentId);
    node = graph.getNode(node.parentId);
  }
  return ancestors;
}
