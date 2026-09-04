import assert from "node:assert/strict";
import test from "node:test";

import { createBlankDocumentSource } from "./blank-document.mjs";
import { createDocumentModel, materialize } from "./document-model.mjs";

test("operation and UI creation share one minimal valid blank document", () => {
  const source = createBlankDocumentSource({ id: "starter-frame", module: "web" });
  assert.deepEqual(source.children, [
    {
      id: "starter-frame",
      type: "frame",
      name: "Home",
      x: 120,
      y: 100,
      width: 720,
      height: 480,
      role: "route",
      fill: "#ffffff",
      children: [],
    },
  ]);
  assert.equal(source.canvasSchemaVersion, 3);
  assert.equal(source.module, "web");
  assert.deepEqual(source.flows, []);
  const model = createDocumentModel(source);
  try {
    assert.deepEqual(materialize(model), source);
    assert.equal(model.metadata.has("modelVersion"), false);
  } finally {
    model.doc.destroy();
  }
});
