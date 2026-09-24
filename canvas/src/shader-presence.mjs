export function createShaderPresence(graph) {
  const time = new Set();
  const mouse = new Set();
  const flags = (node) => {
    let hasTime = false;
    let hasMouse = false;
    for (const fill of node?.fills ?? []) {
      for (const uniform of fill.pencilShader?.uniforms ?? []) {
        if (uniform.automatic === "time") hasTime = true;
        if (uniform.automatic === "mouse") hasMouse = true;
      }
    }
    return { hasTime, hasMouse };
  };
  const update = (node) => {
    if (!node?.id) return false;
    const before = time.has(node.id);
    const { hasTime, hasMouse } = flags(node);
    if (hasTime) time.add(node.id); else time.delete(node.id);
    if (hasMouse) mouse.add(node.id); else mouse.delete(node.id);
    return before !== hasTime;
  };
  const remove = (id) => {
    const hadTime = time.delete(id);
    mouse.delete(id);
    return hadTime;
  };
  const replaceGraph = (nextGraph) => {
    time.clear();
    mouse.clear();
    for (const node of nextGraph.nodes.values()) update(node);
  };
  replaceGraph(graph);
  return {
    update,
    remove,
    replaceGraph,
    hasTime: () => time.size > 0,
    hasMouse: () => mouse.size > 0,
  };
}
