import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentModel, encodeState, restoreDocumentModel, materialize } from "./document-model.mjs";
import { publishCanvasLibrary } from "./library-publish-workflow.mjs";
import { readPublishedCanvasLibrary } from "./library-publication-head.mjs";

const document = () => ({ version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "card", type: "frame", width: 100, height: 100 }] });
const publicItems = [{ kind: "component", id: "card" }];
function fixture(options = {}) {
  const model = createDocumentModel(document());
  const payload = { snapshot: { state: encodeState(model), throughSequence: 0 }, updates: [], assets: [] };
  model.doc.destroy();
  const blobs = new Map();
  const calls = [];
  let sequence = 0;
  const api = {
    async getDocument(id) { assert.equal(id, "source"); calls.push("get"); return structuredClone(payload); },
    async uploadAsset(id, asset) {
      assert.equal(id, "source"); calls.push("upload");
      if (options.uploadFailure) throw Object.assign(new Error("upload"), { code: "UPLOAD_FAILED" });
      blobs.set(asset.path, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.size };
    },
    async readAsset(id, asset) { assert.equal(id, "source"); calls.push("read"); return new Uint8Array(blobs.get(asset.path)); },
    async appendUpdate(id, update) {
      assert.equal(id, "source"); calls.push("append");
      assert.ok(update.operation.id && update.operation.inverseUpdate);
      if (options.conflict || update.expectedSequence !== sequence) throw Object.assign(new Error("conflict"), { code: "CANVAS_DOCUMENT_CONFLICT" });
      sequence++;
      payload.updates.push({ update: update.update, sequence });
      return options.malformedAppend ? {} : { sequence };
    },
    async createSnapshot(id, snapshot) {
      assert.equal(id, "source"); calls.push("snapshot");
      if (options.snapshotFailure) throw new Error("snapshot unavailable");
      payload.snapshot = structuredClone(snapshot);
      payload.updates = payload.updates.filter(({ sequence }) => sequence > snapshot.throughSequence);
    },
  };
  return { api, calls, payload, blobs };
}

test("publication writes and verifies content before guarded undoable head update", async () => {
  const f = fixture();
  const input = { documentId: "source", publicItems: structuredClone(publicItems) };
  const before = structuredClone(input);
  const result = await publishCanvasLibrary(f.api, input);
  assert.equal(result.published, true);
  assert.equal(result.sequence, 1);
  assert.deepEqual(result.snapshot, { status: "saved" });
  assert.deepEqual(f.calls, ["get", "upload", "read", "append", "snapshot"]);
  const loaded = await readPublishedCanvasLibrary(f.api, "source");
  assert.equal(loaded.release.contentHash, result.publication.contentHash);
  assert.deepEqual(loaded.release.document.library.public, publicItems);
  assert.equal(loaded.release.document.library.publication, undefined);
  assert.deepEqual(input, before);
});

test("failed upload or revision conflict never attaches a new head", async () => {
  for (const options of [{ uploadFailure: true }, { conflict: true }]) {
    const f = fixture(options);
    await assert.rejects(publishCanvasLibrary(f.api, { documentId: "source", publicItems }));
    assert.equal(f.payload.updates.length, 0);
    assert.equal(f.calls.includes("snapshot"), false);
    const model = restoreDocumentModel(f.payload);
    try { assert.equal(materialize(model).library?.publication, undefined); }
    finally { model.doc.destroy(); }
    if (options.uploadFailure) assert.equal(f.calls.includes("append"), false);
  }
});

test("snapshot failure preserves truthful committed publication receipt and replayable update", async () => {
  const f = fixture({ snapshotFailure: true });
  const result = await publishCanvasLibrary(f.api, { documentId: "source", publicItems });
  assert.equal(result.published, true);
  assert.deepEqual(result.snapshot, { status: "deferred", code: "CANVAS_LIBRARY_SNAPSHOT_DEFERRED" });
  assert.equal(f.payload.updates.length, 1);
  const loaded = await readPublishedCanvasLibrary(f.api, "source");
  assert.equal(loaded.release.releaseId, result.publication.releaseId);
});

test("malformed append receipt is explicitly unknown rather than claimed absent", async () => {
  const f = fixture({ malformedAppend: true });
  await assert.rejects(publishCanvasLibrary(f.api, { documentId: "source", publicItems }), (error) => {
    assert.equal(error.code, "CANVAS_LIBRARY_PUBLICATION_COMMIT_UNKNOWN");
    assert.ok(error.operationId && error.publication.contentHash);
    return true;
  });
  assert.equal(f.payload.updates.length, 1);
  assert.equal(f.calls.includes("snapshot"), false);
});

test("invalid public surface and sequence reject before uploads", async () => {
  for (const request of [{ documentId: "source" }, { documentId: "source", publicItems: [{ kind: "component", id: "missing" }] }]) {
    const f = fixture();
    await assert.rejects(publishCanvasLibrary(f.api, request));
    assert.deepEqual(f.calls, ["get"]);
  }
  const f = fixture();
  f.payload.snapshot.throughSequence = "0";
  await assert.rejects(publishCanvasLibrary(f.api, { documentId: "source", publicItems }), { code: "CANVAS_IMPORT_INTEGRITY" });
  assert.deepEqual(f.calls, ["get"]);
});
