import assert from "node:assert/strict";
import test from "node:test";

import { createBlankDocumentSource } from "./blank-document.mjs";
import { createDocumentModel, materialize } from "./document-model.mjs";
import { validateCanvasDocument } from "./canvas-schema.mjs";

test("A4 and Letter create generic physical frames without a page role", () => {
  for (const preset of ["a4", "letter"]) {
    const source = createBlankDocumentSource({ preset });
    assert.equal(source.module, "generic");
    assert.equal(source.children[0].role, undefined);
    assert.equal(validateCanvasDocument(source).valid, true);
    assert.deepEqual(source.children[0].physical, preset === "a4" ? { w: 210, h: 297, unit: "mm" } : { w: 8.5, h: 11, unit: "in" });
  }
  assert.throws(() => createBlankDocumentSource({ module: "print" }));
  assert.throws(() => createBlankDocumentSource({ module: "deck", preset: "a4" }));
});

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
