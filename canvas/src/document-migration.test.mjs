import assert from "node:assert/strict";
import test from "node:test";

import { commitCanvasMigration, migrateCanvasDocument } from "./document-migration.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";

test("the complete migration pipeline produces one schema-valid canonical document", () => {
  const source = {
    version: "2.17",
    themes: { theme: ["light", "dark"] },
    variables: { ink: { type: "color", value: [{ value: "#fff" }, { value: "#000", theme: { theme: "dark" } }] } },
    children: [
      { id: "component", type: "frame", reusable: true, children: [{ id: "label", type: "text", content: "Default", fill: "$ink" }] },
      { id: "screen", type: "frame", width: 1440, height: 900, padding: { left: 10, right: 20 }, children: [
        { id: "instance", type: "ref", ref: "component", descendants: { label: { content: "Changed" } } },
        { id: "context", type: "context", content: "Reference" },
      ] },
    ],
  };
  const result = migrateCanvasDocument(source, { m4: { entries: {
    instance: {
      action: "properties", evidence: "content-only override verified from source",
      definitions: { label: { type: "string", default: "Default" } },
      bindings: { label: { path: "label", property: "content" } },
    },
  } } });
  assert.equal(result.document.canvasSchemaVersion, 3);
  assert.equal(result.document.module, "web");
  assert.equal(result.document.children[0].role, undefined);
  assert.equal(result.document.children[1].role, "route");
  assert.equal(result.document.children[1].children[1].type, "text");
  assert.deepEqual(result.document.children[1].padding, { start: 10, end: 20 });
  assert.deepEqual(result.document.variables.ink, { tokenType: "color", cascade: [
    { value: "#fff" }, { value: "#000", when: { theme: "dark" } },
  ] });
});

test("atomic migration begins, completes with regenerated state and aborts after a failed completion", async () => {
  const calls = [];
  const api = {
    beginSchemaMigration: async (...args) => { calls.push(["begin", ...args]); },
    completeSchemaMigration: async (...args) => { calls.push(["complete", ...args]); return { migrating: false, sequence: 7 }; },
    abortSchemaMigration: async (...args) => { calls.push(["abort", ...args]); },
  };
  const source = {
    version: "2.15", children: [{ id: "home", type: "frame", width: 720, height: 480, children: [] }],
  };
  const legacyModel = createDocumentModel(source);
  const payload = { snapshot: { throughSequence: 7, source, state: encodeState(legacyModel) }, updates: [] };
  legacyModel.doc.destroy();
  const result = await commitCanvasMigration(api, "document", payload);
  assert.equal(result.migrating, false);
  assert.deepEqual(calls.map(([name]) => name), ["begin", "complete"]);
  assert.equal(calls[1][2].projection.canvasSchemaVersion, 3);
  assert.equal(typeof calls[1][2].state, "string");

  calls.length = 0;
  api.completeSchemaMigration = async () => { throw new Error("complete failed"); };
  await assert.rejects(() => commitCanvasMigration(api, "document", payload), /complete failed/);
  assert.deepEqual(calls.map(([name]) => name), ["begin", "abort"]);
});
