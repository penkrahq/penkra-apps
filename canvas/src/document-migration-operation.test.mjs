import assert from "node:assert/strict";
import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createCanvasMigrationCopy } from "./document-migration.mjs";
import {
  createDocumentModel,
  createDocumentOperationUpdates,
  encodeState,
  encodeUpdate,
} from "./document-model.mjs";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const COPY_ID = "22222222-2222-4222-8222-222222222222";

function makePayload(source, updates = []) {
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
  return { id: SOURCE_ID, title: "Legacy", snapshot: { source, state }, updates };
}

function emptySource() {
  return { module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [] };
}

function fakeApi({
  payload,
  copiedAssets = [],
  sourceAssets = [],
  projection,
  events = [],
  readAsset = async () => new Uint8Array(),
  uploadAsset = async () => undefined,
  renameDocument = async () => undefined,
} = {}) {
  let created;
  return {
    events,
    async listAssets(id) { return id === SOURCE_ID ? sourceAssets : copiedAssets; },
    async readAsset(id, asset) { events.push(["read", id, asset.path]); return readAsset(id, asset); },
    async createDocument(input) { created = input; events.push(["create", input.title]); return { id: COPY_ID }; },
    async uploadAsset(id, asset) { events.push(["upload", id, asset.path]); return uploadAsset(id, asset); },
    async getDocumentProjection() { return { snapshot: { source: projection ?? created.source } }; },
    async renameDocument(id, title) { events.push(["rename", id, title]); return renameDocument(id, title); },
    async deleteDocument(id) { events.push(["delete", id]); },
  };
}

test("editor migration creates a suffixed owner copy and leaves the shared source unchanged", async () => {
  const reportDirectory = await mkdtemp(join(tmpdir(), "canvas-migration-editor-"));
  const payload = makePayload(emptySource());
  const events = [];
  const api = fakeApi({ payload, events });
  const result = await createCanvasMigrationCopy(api, SOURCE_ID, payload, {
    reportDirectory,
    sourceAccess: "editor",
  });

  assert.deepEqual(result, {
    sourceDocumentId: SOURCE_ID,
    documentId: COPY_ID,
    title: "Legacy — migrated copy",
    sourceAccess: "editor",
    sourceRenamed: false,
    reportPath: join(reportDirectory, `migration-${SOURCE_ID}-to-${COPY_ID}.md`),
    assetCount: 0,
  });
  assert.deepEqual(events, [["create", "Legacy — migrated copy"]]);
  assert.match(await readFile(result.reportPath, "utf8"), /shared with this caller and was left unchanged/u);
});

test("migration materializes the snapshot and all ordered updates before creating the copy", async () => {
  const original = { ...emptySource(), children: [{ id: "frame", type: "frame", width: 100, height: 100, children: [] }] };
  const changed = { ...original, children: [{ ...original.children[0], width: 240 }] };
  const model = createDocumentModel(original);
  const snapshotState = encodeState(model);
  const operation = createDocumentOperationUpdates(model, changed);
  model.doc.destroy();
  const payload = { id: SOURCE_ID, title: "Legacy", snapshot: { source: original, state: snapshotState }, updates: [{ sequence: 1, update: encodeUpdate(operation.forward) }] };
  const events = [];
  let createdSource;
  const api = fakeApi({ events });
  api.createDocument = async (input) => {
    createdSource = input.source;
    events.push(["create", input.title]);
    return { id: COPY_ID };
  };
  api.getDocumentProjection = async () => ({ snapshot: { source: createdSource } });
  const reportDirectory = await mkdtemp(join(tmpdir(), "canvas-migration-updates-"));
  await createCanvasMigrationCopy(api, SOURCE_ID, payload, { reportDirectory });
  assert.equal(createdSource.children[0].width, 240);
});

test("title and report-directory preflight failures happen before create", async () => {
  const payload = makePayload(emptySource());
  const events = [];
  const api = fakeApi({ payload, events });
  await assert.rejects(
    createCanvasMigrationCopy(api, SOURCE_ID, payload, { reportDirectory: "relative" }),
    { code: "CANVAS_MIGRATION_INVALID" },
  );
  await assert.rejects(
    createCanvasMigrationCopy(api, SOURCE_ID, { ...payload, title: "é".repeat(200) }, {
      reportDirectory: "/tmp",
      sourceAccess: "editor",
    }),
    { code: "CANVAS_MIGRATION_TITLE_INVALID" },
  );
  assert.deepEqual(events, []);
});

test("read and upload failures delete only the created copy", async () => {
  const payload = makePayload(emptySource());
  const sourceAssets = [{ path: "images/a.png", sha256: "abc", size: 3, mimeType: "image/png" }];
  for (const failure of ["read", "upload"]) {
    const events = [];
    const api = fakeApi({
      payload,
      sourceAssets,
      events,
      readAsset: async () => { if (failure === "read") throw new Error("read failed"); return new Uint8Array([1, 2, 3]); },
      uploadAsset: async () => { if (failure === "upload") throw new Error("upload failed"); },
    });
    const reportDirectory = await mkdtemp(join(tmpdir(), `canvas-migration-${failure}-`));
    await assert.rejects(createCanvasMigrationCopy(api, SOURCE_ID, payload, { reportDirectory }), /failed/u);
    assert.deepEqual(events.filter(([name]) => name === "delete"), [["delete", COPY_ID]]);
  }
});

test("rename failure deletes the copy and report", async () => {
  const payload = makePayload(emptySource());
  const events = [];
  const reportDirectory = await mkdtemp(join(tmpdir(), "canvas-migration-rename-"));
  const api = fakeApi({
    payload,
    events,
    renameDocument: async () => { throw new Error("rename failed"); },
  });
  const reportPath = join(reportDirectory, `migration-${SOURCE_ID}-to-${COPY_ID}.md`);
  await assert.rejects(createCanvasMigrationCopy(api, SOURCE_ID, payload, { reportDirectory }), /rename failed/u);
  assert.deepEqual(events.filter(([name]) => name === "delete"), [["delete", COPY_ID]]);
  await assert.rejects(access(reportPath));
});
