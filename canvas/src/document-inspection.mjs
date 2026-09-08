import { createOpenPencilGraph } from "./openpencil-engine.mjs";
import { prepareOpenPencilRenderDocument, resolveCanvasOverflow } from "./openpencil-render-document.mjs";
import { designValidationIssues } from "./document-review.mjs";
import { computeDescendantVisualBounds } from "../vendor/open-pencil/engine.source.mjs";

export function inspectDocument(document, nodes, requestedLimit = 500, nodeIds) {
  const limit = Math.min(1_000, Math.max(1, Number(requestedLimit) || 500));
  const prepared = prepareOpenPencilRenderDocument(document);
  const graph = createOpenPencilGraph(document, new Map(), prepared);
  const hasScrollContainers = nodes.some(({ node }) => node.type === "frame" && resolveCanvasOverflow(node).startsWith("scroll-"));
  const contentGraph = hasScrollContainers ? createUnclippedGraph(document) : graph;
  const reviewIssues = [...prepared.issues, ...designValidationIssues(document)];
  const issuesByNode = new Map();
  for (const issue of reviewIssues) {
    if (typeof issue.nodeId !== "string") continue;
    const items = issuesByNode.get(issue.nodeId) ?? [];
    items.push(issue);
    issuesByNode.set(issue.nodeId, items);
  }
  const nodeById = new Map(nodes.map((entry) => [entry.node.id, entry.node]));
  const parentById = new Map(nodes.map((entry) => [entry.node.id, entry.parentId]));
  const selectedNodes = nodeIds
    ? nodes.filter((entry) => nodeIds.has(entry.node.id))
    : nodes;
  const boundsById = new Map();
  const ensureBounds = (nodeId) => {
    if (!boundsById.has(nodeId)) boundsById.set(nodeId, sceneBounds(graph, nodeId));
    return boundsById.get(nodeId);
  };
  for (const { node } of selectedNodes) {
    ensureBounds(node.id);
    let parentId = parentById.get(node.id);
    while (parentId) {
      ensureBounds(parentId);
      parentId = parentById.get(parentId);
    }
  }
  return {
    items: selectedNodes.slice(0, limit).map(({ node, depth, parentId, index }) => ({
      id: node.id,
      type: node.type,
      name: node.name ?? null,
      depth,
      parentId,
      index,
      properties: Object.fromEntries(
        Object.entries(node).filter(([key]) => !["id", "type", "children"].includes(key)),
      ),
      bounds: boundsById.get(node.id),
      ...(node.type === "frame" ? scrollInspection(node, contentGraph, boundsById.get(node.id)) : {}),
      problems: [
        ...(issuesByNode.get(node.id) ?? []).map((issue) => structuredClone(issue)),
        ...clippingProblems(node.id, nodeById, parentById, boundsById),
      ],
    })),
    truncated: selectedNodes.length > limit,
    total: selectedNodes.length,
    issues: reviewIssues,
  };
}

function createUnclippedGraph(document) {
  const source = structuredClone(document);
  walk(source.children, (node) => {
    if (node.type === "frame" && resolveCanvasOverflow(node).startsWith("scroll-")) {
      node.overflow = "visible";
      node.clip = false;
    }
  });
  const prepared = prepareOpenPencilRenderDocument(source);
  return createOpenPencilGraph(source, new Map(), prepared);
}

function scrollInspection(node, graph, viewport) {
  const mode = resolveCanvasOverflow(node);
  if (!mode.startsWith("scroll-") || !viewport || !graph.getNode(node.id)) return {};
  const childIds = graph.getNode(node.id).childIds ?? [];
  const contentBounds = computeDescendantVisualBounds(
    childIds,
    (id) => graph.getNode(id),
    (id) => graph.getAbsolutePosition(id),
  );
  if (!contentBounds || ![contentBounds.minX, contentBounds.minY, contentBounds.maxX, contentBounds.maxY].every(Number.isFinite)) return {};
  const right = viewport.x + viewport.width;
  const bottom = viewport.y + viewport.height;
  const contentWidth = Math.max(right, contentBounds.maxX) - Math.min(viewport.x, contentBounds.minX);
  const contentHeight = Math.max(bottom, contentBounds.maxY) - Math.min(viewport.y, contentBounds.minY);
  return {
    overflow: {
      mode,
      contentWidth,
      contentHeight,
      overflowX: Math.max(0, viewport.x - contentBounds.minX) + Math.max(0, contentBounds.maxX - right),
      overflowY: Math.max(0, viewport.y - contentBounds.minY) + Math.max(0, contentBounds.maxY - bottom),
    },
  };
}

function sceneBounds(graph, nodeId) {
  if (!graph.getNode(nodeId)) return null;
  const bounds = graph.getAbsoluteBounds(nodeId);
  if (!bounds) return null;
  const result = {
    x: Number(bounds.x),
    y: Number(bounds.y),
    width: Number(bounds.width),
    height: Number(bounds.height),
  };
  return Object.values(result).every(Number.isFinite) ? result : null;
}

function clippingProblems(nodeId, nodeById, parentById, boundsById) {
  const bounds = boundsById.get(nodeId);
  if (!bounds) return [];
  let parentId = parentById.get(nodeId);
  while (parentId) {
    const parent = nodeById.get(parentId);
    if (parent?.clip === true || parent?.clipsContent === true) {
      const clippingBounds = boundsById.get(parentId);
      if (clippingBounds && !contains(clippingBounds, bounds)) {
        return [{
          nodeId,
          kind: "clipping",
          ancestorId: parentId,
          message: `Node ${nodeId} extends beyond clipping ancestor ${parentId}.`,
        }];
      }
    }
    parentId = parentById.get(parentId);
  }
  return [];
}

function contains(outer, inner) {
  return inner.x >= outer.x
    && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

function walk(children, visit) {
  for (const node of children ?? []) {
    visit(node);
    walk(node.children, visit);
  }
}
