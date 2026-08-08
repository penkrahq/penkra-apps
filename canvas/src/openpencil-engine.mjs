import {
  computeBounds,
  computeAllLayouts,
  createEditor,
  parsePenFile,
} from "../vendor/open-pencil/engine.mjs";

const VISUAL_NODE_TYPES = new Set([
  "frame",
  "rectangle",
  "ellipse",
  "text",
  "icon_font",
  "path",
  "ref",
]);

const DIRECT_PROPERTY_MAP = new Map([
  ["name", "name"],
  ["x", "x"],
  ["y", "y"],
  ["width", "width"],
  ["height", "height"],
  ["rotation", "rotation"],
  ["opacity", "opacity"],
  ["visible", "enabled"],
  ["clipsContent", "clip"],
  ["text", "content"],
  ["fontFamily", "fontFamily"],
  ["fontSize", "fontSize"],
  ["fontWeight", "fontWeight"],
  ["lineHeight", "lineHeight"],
  ["letterSpacing", "letterSpacing"],
]);

const TRACKED_SCENE_PROPERTIES = new Set([
  ...DIRECT_PROPERTY_MAP.keys(),
  "layoutMode",
  "itemSpacing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "textAlignHorizontal",
  "textAlignVertical",
]);

export function createOpenPencilEditor(document, options = {}) {
  const graph = createOpenPencilGraph(document);
  return createEditor({
    graph,
    getViewportSize: options.getViewportSize,
  });
}

export function createOpenPencilGraph(document) {
  const graph = parsePenFile(JSON.stringify(document));
  walkPenNodes(document.children, (sourceNode) => {
    if (isOpenPencilEditableNode(sourceNode)) return;
    if (graph.getNode(sourceNode.id)) graph.updateNode(sourceNode.id, { locked: true });
  });
  for (const page of graph.getPages()) computeAllLayouts(graph, page.id);
  return graph;
}

export function refreshOpenPencilEditor(editor, document, selectedId = null) {
  const viewport = {
    panX: editor.state.panX,
    panY: editor.state.panY,
    zoom: editor.state.zoom,
  };
  editor.replaceGraph(createOpenPencilGraph(document));
  editor.state.panX = viewport.panX;
  editor.state.panY = viewport.panY;
  editor.state.zoom = viewport.zoom;
  if (selectedId && editor.graph.getNode(selectedId)) editor.select([selectedId]);
  editor.requestRender();
  return editor;
}

export function fitOpenPencilDesign(editor, viewport) {
  const pageNodes = editor.graph.getChildren(editor.state.currentPageId);
  if (pageNodes.length === 0) return null;
  const bounds = computeBounds(pageNodes);
  const left = Math.max(0, viewport.left ?? 0);
  const right = Math.max(0, viewport.right ?? 0);
  const top = Math.max(0, viewport.top ?? 0);
  const bottom = Math.max(0, viewport.bottom ?? 0);
  const availableWidth = Math.max(1, viewport.width - left - right);
  const availableHeight = Math.max(1, viewport.height - top - bottom);
  const padding = 80;
  const paddedWidth = bounds.width + padding * 2;
  const paddedHeight = bounds.height + padding * 2;
  const zoom = Math.min(availableWidth / paddedWidth, availableHeight / paddedHeight, 1);
  const previous = {
    panX: editor.state.panX,
    panY: editor.state.panY,
    zoom: editor.state.zoom,
  };
  editor.state.zoom = zoom;
  editor.state.panX = left + (availableWidth - paddedWidth * zoom) / 2
    - bounds.x * zoom + padding * zoom;
  editor.state.panY = top + (availableHeight - paddedHeight * zoom) / 2
    - bounds.y * zoom + padding * zoom;
  editor.requestRepaint();
  return {
    previous,
    panX: editor.state.panX,
    panY: editor.state.panY,
    zoom: editor.state.zoom,
  };
}

export function analyzeOpenPencilCompatibility(document) {
  const issues = [];
  walkPenNodes(document.children, (node) => {
    if (node.type === "prompt") return;
    if (!VISUAL_NODE_TYPES.has(node.type)) {
      issues.push({
        nodeId: node.id,
        kind: "node-type",
        message: `${node.type} is preserved but OpenPencil renders it as a generic frame.`,
      });
    }
    for (const fill of Array.isArray(node.fill) ? node.fill : node.fill ? [node.fill] : []) {
      if (typeof fill === "object" && fill.type && fill.type !== "solid") {
        issues.push({
          nodeId: node.id,
          kind: "fill",
          message: `${fill.type} fill is preserved but is not represented faithfully by the current OpenPencil .pen adapter.`,
        });
      }
    }
    for (const effect of Array.isArray(node.effect) ? node.effect : node.effect ? [node.effect] : []) {
      if (effect?.type && effect.type !== "shadow") {
        issues.push({
          nodeId: node.id,
          kind: "effect",
          message: `${effect.type} effect is preserved but is not represented by the current OpenPencil .pen adapter.`,
        });
      }
    }
    if (node.layout && !["row", "horizontal", "column", "vertical", "none"].includes(node.layout)) {
      issues.push({
        nodeId: node.id,
        kind: "layout",
        message: `${node.layout} layout is preserved but is not represented by the current OpenPencil .pen adapter.`,
      });
    }
  });
  return issues;
}

export function sceneUpdateToMutations(nodeId, changes) {
  const mutations = [];
  const addMutation = (property, value) => {
    mutations.push({ kind: "set-property", nodeId, property, value });
  };
  for (const [sceneProperty, penProperty] of DIRECT_PROPERTY_MAP) {
    if (!(sceneProperty in changes)) continue;
    addMutation(penProperty, changes[sceneProperty]);
  }
  if ("layoutMode" in changes) {
    const value = changes.layoutMode === "HORIZONTAL"
      ? "horizontal"
      : changes.layoutMode === "VERTICAL"
        ? "vertical"
        : "none";
    addMutation("layout", value);
  }
  if ("itemSpacing" in changes) {
    addMutation("gap", changes.itemSpacing);
  }
  if (["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"].some((key) => key in changes)) {
    const values = [
      changes.paddingTop ?? 0,
      changes.paddingRight ?? 0,
      changes.paddingBottom ?? 0,
      changes.paddingLeft ?? 0,
    ];
    addMutation("padding", values.every((value) => value === values[0]) ? values[0] : values);
  }
  if ("textAlignHorizontal" in changes) {
    const value = ({ CENTER: "center", RIGHT: "right", JUSTIFIED: "justified" })[
      changes.textAlignHorizontal
    ] ?? "left";
    addMutation("textAlign", value);
  }
  if ("textAlignVertical" in changes) {
    const value = ({ CENTER: "center", BOTTOM: "bottom" })[changes.textAlignVertical] ?? "top";
    addMutation("textAlignVertical", value);
  }
  return mutations;
}

export function sceneEventToPenMutations(editor, document, nodeId, changes, previousSceneValues) {
  if (!editor.state.selectedIds.has(nodeId)) return [];
  const sourceNode = findPenNode(document, nodeId);
  if (!sourceNode || !isOpenPencilEditableNode(sourceNode)) return [];
  return sceneUpdateToMutations(
    nodeId,
    changedSceneProperties(previousSceneValues, changes),
  );
}

export function isOpenPencilEditableNode(node) {
  return Boolean(node && node.type !== "prompt" && VISUAL_NODE_TYPES.has(node.type));
}

export function sceneNodePropertySnapshot(node) {
  return Object.fromEntries(
    [...TRACKED_SCENE_PROPERTIES]
      .filter((property) => property in node)
      .map((property) => [property, node[property]]),
  );
}

export function changedSceneProperties(previous, changes) {
  return Object.fromEntries(
    Object.entries(changes).filter(
      ([property, value]) => TRACKED_SCENE_PROPERTIES.has(property)
        && !Object.is(previous?.[property], value),
    ),
  );
}

export function sceneNodeToPenNode(node) {
  const type = ({
    FRAME: "frame",
    RECTANGLE: "rectangle",
    ROUNDED_RECTANGLE: "rectangle",
    ELLIPSE: "ellipse",
    TEXT: "text",
    LINE: "path",
    VECTOR: "path",
  })[node.type];
  if (!type) return null;
  const pen = {
    id: node.id,
    type,
    name: node.name,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
  if (type === "frame") pen.children = [];
  if (type === "text") {
    pen.content = node.text;
    pen.fontFamily = node.fontFamily;
    pen.fontSize = node.fontSize;
    pen.fontWeight = node.fontWeight;
  }
  const solid = node.fills?.find((fill) => fill.visible && fill.type === "SOLID");
  if (solid) pen.fill = rgbaToHex(solid.color, solid.opacity);
  return pen;
}

export function findPenNode(document, nodeId) {
  let match = null;
  walkPenNodes(document.children, (node) => {
    if (node.id === nodeId) match = node;
  });
  return match;
}

function walkPenNodes(nodes, visit) {
  for (const node of nodes ?? []) {
    visit(node);
    walkPenNodes(node.children, visit);
  }
}

function rgbaToHex(color, opacity = 1) {
  const channel = (value) => Math.round(Math.max(0, Math.min(1, value ?? 0)) * 255)
    .toString(16)
    .padStart(2, "0");
  const alpha = channel((color?.a ?? 1) * opacity);
  const value = `#${channel(color?.r)}${channel(color?.g)}${channel(color?.b)}`;
  return alpha === "ff" ? value : `${value}${alpha}`;
}
