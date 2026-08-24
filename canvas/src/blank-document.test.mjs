import assert from "node:assert/strict";
import test from "node:test";

import { createBlankDocumentSource } from "./blank-document.mjs";
import { createDocumentModel, materialize } from "./document-model.mjs";

test("operation and UI creation share one minimal valid blank document", () => {
  const source = createBlankDocumentSource({ id: "starter-frame" });
  assert.deepEqual(source.children, [
    {
      id: "starter-frame",
      type: "frame",
      name: "Frame",
      x: 120,
      y: 100,
      width: 720,
      height: 480,
      fill: "#ffffff",
      children: [],
    },
  ]);
  const model = createDocumentModel(source);
  try {
    assert.deepEqual(materialize(model), source);
    assert.equal(model.metadata.has("modelVersion"), false);
  } finally {
    model.doc.destroy();
  }
});
