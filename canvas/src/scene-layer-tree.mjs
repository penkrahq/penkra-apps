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
  return output;
}
