import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCanvasMigrationCopy, migrateCanvasDocument } from "./document-migration.mjs";
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
  const result = migrateCanvasDocument(source);
  assert.equal(result.document.module, "web");
  assert.equal(result.document.children[0].role, undefined);
  assert.equal(result.document.children[1].role, "route");
  assert.equal(result.document.children[1].children[0].type, "frame");
  assert.equal(result.document.children[1].children[0].children[0].content, "Changed");
  assert.equal(result.document.children[1].children[1].type, "text");
  assert.deepEqual(result.document.children[1].padding, { start: 10, end: 20 });
  assert.deepEqual(result.document.variables.ink, { tokenType: "color", cascade: [
    { value: "#fff" }, { value: "#000", when: { appearance: "dark" } },
  ] });
});

test("copy migration verifies the copy before renaming the untouched original", async () => {
  const calls = [];
  let createdSource;
  const api = {
    createDocument: async (input) => { calls.push(["create", input.title]); createdSource = input.source; return { id: "copy-id" }; },
    listAssets: async () => [{ path: "images/a.png", sha256: "abc", size: 3, mimeType: "image/png" }],
    readAsset: async () => new Uint8Array([1, 2, 3]),
    uploadAsset: async (id, asset) => { calls.push(["asset", id, asset.path, [...asset.bytes]]); },
    getDocumentProjection: async () => ({ snapshot: { source: createdSource } }),
    renameDocument: async (...args) => { calls.push(["rename", ...args]); },
    deleteDocument: async (...args) => { calls.push(["trash", ...args]); },
  };
  const source = {
    version: "2.15", children: [{ id: "home", type: "frame", width: 720, height: 480, children: [] }],
  };
  const legacyModel = createDocumentModel(source);
  const payload = { id: "document", title: "Legacy", snapshot: { throughSequence: 7, source, state: encodeState(legacyModel) }, updates: [] };
  legacyModel.doc.destroy();
  const reportDirectory = await mkdtemp(join(tmpdir(), "canvas-migration-"));
  const result = await createCanvasMigrationCopy(api, "document", payload, { reportDirectory });
  assert.equal(result.documentId, "copy-id");
  assert.deepEqual(calls.map(([name]) => name), ["create", "asset", "rename"]);
  assert.deepEqual(calls[1], ["asset", "copy-id", "images/a.png", [1, 2, 3]]);
  assert.deepEqual(calls[2], ["rename", "document", "Legacy — superseded by copy-id"]);

  calls.length = 0;
  api.getDocumentProjection = async () => ({ snapshot: { source: { wrong: true } } });
  await assert.rejects(() => createCanvasMigrationCopy(api, "document", payload, { reportDirectory }), /did not round-trip/u);
  assert.deepEqual(calls.map(([name]) => name), ["create", "asset", "trash"]);
});

test("best-effort migration preserves existing import identifiers", () => {
  const source = { version: "2.15", module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: { shared: { documentId: "another-document" } }, flows: [], children: [] };
  assert.deepEqual(migrateCanvasDocument(source).document.imports, source.imports);
});

test("legacy print migration preserves physical artwork and guides without a page role", () => {
  const frame = { id: "poster", type: "frame", role: "page", width: 600, height: 400, physical: { w: 150, h: 100, unit: "mm" }, bleed: 9, safeMargin: 12, folds: [200], children: [{ id: "mark", type: "rectangle", width: 20, height: 20, fill: "#123456" }] };
  const source = { module: "print", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [frame] };
  const result = migrateCanvasDocument(source).document;
  assert.equal(result.module, "generic");
  const expected = structuredClone(frame); delete expected.role;
  assert.deepEqual(result.children[0], expected);
  assert.equal(source.children[0].role, "page");
});

test("migration renames only node live exports and never replaces invalid content with an empty frame", async () => {
  const source = { module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: { ui: { documentId: "library", pin: "live" } }, flows: [], children: [
    { id: "art", type: "frame", export: "live", width: 100, height: 100, children: [] },
  ] };
  const result = migrateCanvasDocument(source);
  assert.equal(result.document.children[0].export, "default");
  assert.equal(result.document.imports.ui.pin, "live");
  assert.equal(source.children[0].export, "live");
  const invalid = { ...source, axes: { unknown: { modes: [{ name: "custom" }] } } };
  assert.throws(() => migrateCanvasDocument(invalid), { code: "CANVAS_MIGRATION_INVALID" });
  const model = createDocumentModel(invalid);
  const payload = { title: "Keep me", snapshot: { source: invalid, state: encodeState(model) }, updates: [] };
  model.doc.destroy();
  const calls = [];
  await assert.rejects(createCanvasMigrationCopy({ createDocument: async () => { calls.push("create"); } }, "original", payload, { reportDirectory: "/tmp/unused-migration-report" }), { code: "CANVAS_MIGRATION_INVALID" });
  assert.deepEqual(calls, []);
});
