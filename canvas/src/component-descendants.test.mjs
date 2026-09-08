import assert from "node:assert/strict";
import test from "node:test";

import { validateCanvasDocument, assertValidDescendantOverrides } from "./canvas-schema.mjs";
import { createOpenPencilGraph } from "./openpencil-engine.mjs";
import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";

function documentWith(descendants) {
  return {
    version: "2.17",
    module: "generic",
    axes: {}, variables: { ink: { tokenType: "color", cascade: [{ value: "#ff0000" }] } },
    paragraphStyles: {}, imports: {}, flows: [],
    children: [
      {
        id: "tabs", type: "frame", reusable: true, layout: "none", width: 100, height: 30,
        children: [{
          id: "tab", type: "frame", layout: "none", width: 100, height: 30, fill: "$ink",
          children: [
            { id: "label", type: "text", content: "Default", paragraphs: [{ from: 0, to: 7 }], fill: "#000000" },
            { id: "underline", type: "rectangle", y: 27, width: 100, height: 3, fill: "$ink" },
          ],
        }],
      },
      { id: "instance", type: "ref", ref: "tabs", descendants },
    ],
  };
}

test("bare descendant IDs canonicalize to source-relative paths and override non-text variable fills", () => {
  const source = documentWith({
    tab: { fill: "#202124" },
    label: { content: "Active" },
    underline: { fill: "#16181a" },
  });
  assert.equal(validateCanvasDocument(source).valid, true);
  const prepared = prepareOpenPencilRenderDocument(source);
  assert.deepEqual(Object.keys(prepared.document.children[1].descendants), ["tab", "tab/label", "tab/underline"]);

  const graph = createOpenPencilGraph(source, new Map(), prepared);
  const instance = graph.getNode("instance");
  const descendants = [...instance.childIds]
    .flatMap((id) => descendantsOf(graph, id));
  const label = descendants.find((node) => node.componentId === "label");
  const tab = descendants.find((node) => node.componentId === "tab");
  const underline = descendants.find((node) => node.componentId === "underline");
  assert.equal(label.text, "Active");
  assert.deepEqual(tab.fills[0].color, { r: 32 / 255, g: 33 / 255, b: 36 / 255, a: 1 });
  assert.deepEqual(underline.fills[0].color, { r: 22 / 255, g: 24 / 255, b: 26 / 255, a: 1 });
});

test("invalid paths and unsupported descendant properties fail with a stable pre-commit code", () => {
  for (const descendants of [
    { missing: { fill: "#000000" } },
    { "tab/underline": { opacity: 0.5 } },
    { "tab/underline": { fontWeight: 600 } },
  ]) {
    assert.throws(() => assertValidDescendantOverrides(documentWith(descendants)), {
      code: "CANVAS_DESCENDANT_OVERRIDE_INVALID",
    });
  }
});

function descendantsOf(graph, id) {
  const node = graph.getNode(id);
  return node ? [node, ...node.childIds.flatMap((childId) => descendantsOf(graph, childId))] : [];
}
