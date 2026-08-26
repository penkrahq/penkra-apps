import assert from "node:assert/strict";
import test from "node:test";

import { createOpenPencilGraph } from "./openpencil-engine.mjs";
import { listCanvasSceneLayers } from "./scene-layer-tree.mjs";

test("Layers exposes the canonical hierarchy of component instances", () => {
  const graph = createOpenPencilGraph({
    version: "2.17",
    children: [
      {
        id: "queue-component",
        type: "frame",
        reusable: true,
        children: [{
          id: "row-meta",
          type: "frame",
          children: [{ id: "status-label", type: "text", content: "queued" }],
        }],
      },
      { id: "queue-instance", type: "ref", ref: "queue-component" },
    ],
  });
  const pageId = graph.getPages()[0].id;
  const layers = listCanvasSceneLayers(graph, pageId);

  assert.deepEqual(layers.map(({ node, depth }) => [node.id, depth]), [
    ["queue-component", 0],
    ["row-meta", 1],
    ["status-label", 2],
    ["queue-instance", 0],
    ["queue-instance/row-meta", 1],
    ["queue-instance/row-meta/status-label", 2],
  ]);
});

test("Layers excludes renderer-only internal nodes", () => {
  const nodes = new Map([
    ["page", { id: "page", childIds: ["visible", "internal"] }],
    ["visible", { id: "visible", childIds: [] }],
    ["internal", { id: "internal", childIds: [], internalOnly: true }],
  ]);
  assert.deepEqual(listCanvasSceneLayers({ getNode: (id) => nodes.get(id) }, "page")
    .map(({ node }) => node.id), ["visible"]);
});
