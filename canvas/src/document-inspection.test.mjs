import assert from "node:assert/strict";
import test from "node:test";

import { createDocumentModel, listNodes } from "./document-model.mjs";
import { inspectDocument } from "./document-inspection.mjs";

function inspect(source) {
  const model = createDocumentModel(source);
  try { return inspectDocument(source, listNodes(model)); }
  finally { model.doc.destroy(); }
}

test("inspection reports scroll viewport, descendant content bounds, and each overflow axis", () => {
  const source = {
    version: "2.15",
    module: "web",
    axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "scroll", type: "frame", x: 10, y: 20, width: 100, height: 100,
      layout: "none", overflow: "scroll-both", children: [
        { id: "right", type: "rectangle", x: 120, y: 0, width: 30, height: 10 },
        { id: "bottom", type: "rectangle", x: 0, y: 140, width: 10, height: 20 },
      ],
    }],
  };
  const result = inspect(source);
  const item = result.items.find((entry) => entry.id === "scroll");
  assert.deepEqual(item.overflow, {
    mode: "scroll-both",
    contentWidth: 150,
    contentHeight: 160,
    overflowX: 50,
    overflowY: 60,
  });
  assert.equal(source.children[0].overflow, "scroll-both");
  assert.equal(source.children[0].clip, undefined);
});

test("inspection omits overflow metadata for visible and plain clipped frames", () => {
  const base = {
    version: "2.15", module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "frame", type: "frame", width: 100, height: 100, children: [] }],
  };
  assert.equal(Object.hasOwn(inspect(base).items[0], "overflow"), false);
  const clipped = structuredClone(base);
  clipped.children[0].clip = true;
  assert.equal(Object.hasOwn(inspect(clipped).items[0], "overflow"), false);
});
