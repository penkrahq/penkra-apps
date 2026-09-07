import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { Y } from "../collaboration/pen-yjs-model.mjs";
import { buildRetainedCanvasImports } from "./library-retained-imports.mjs";
import { base64ToBytes } from "./codec.mjs";
import { createDocumentModel, encodeState, materialize, restoreDocumentModel } from "./document-model.mjs";
import { createLibraryRelease, releaseIdentity } from "./library-publication.mjs";
import { createLibraryPublicationHead, readPublishedCanvasLibrary } from "./library-publication-head.mjs";
import { preparePublishedLibraryRetention } from "./library-published-retention.mjs";
import { prepareRetainedLibraryRelease } from "./library-retained-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";
import { publishCanvasLibrary } from "./library-publish-workflow.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const component = (id) => ({ kind: "component", id });
const identity = (release) => releaseIdentity(release);
const imported = (release, retention) => ({ documentId: release.libraryId, updatePolicy: "pinned", releaseId: release.releaseId, contentHash: release.contentHash, ...(retention === undefined ? {} : { retention }) });

function sourceDocument({ importRecord, publication, publicItems = [component("screen")] } = {}) {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {},
    imports: importRecord ? { a: importRecord } : {}, flows: [],
    library: { public: publicItems, ...(publication === undefined ? {} : { publication }) },
    children: [{ id: "screen", type: "frame", fill: { type: "image", url: "source.png" }, children: [{ id: "use", type: "ref", ref: "a:hero" }] }],
  };
}

function backend({ conflict = false, snapshotFailure = false } = {}) {
  const projects = new Map([["publisher", new Map()]]);
  const calls = [];
  const appendBodies = [];
  let payload;
  let sequence = 0;
  let readGate;
  let resumeRead = () => {};
  const api = {
    async getDocument(documentId) {
      calls.push(["getDocument", documentId]);
      if (documentId !== "publisher") throw Object.assign(new Error("only publisher is readable"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return structuredClone(payload);
    },
    async readAsset(documentId, descriptor) {
      calls.push(["readAsset", documentId, descriptor.path]);
      if (readGate) await readGate;
      const bytes = projects.get(documentId)?.get(descriptor.sha256);
      if (!bytes) throw Object.assign(new Error("asset denied"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return new Uint8Array(bytes);
    },
    async uploadAsset(documentId, asset) {
      calls.push(["uploadAsset", documentId, asset.path]);
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("upload denied"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.bytes.length, ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }) };
    },
    async appendUpdate(documentId, body) {
      calls.push(["appendUpdate", documentId]);
      appendBodies.push(structuredClone(body));
      assert.equal(documentId, "publisher");
      if (conflict) throw Object.assign(new Error("revision conflict"), { code: "CANVAS_DOCUMENT_CONFLICT" });
      if (body.expectedSequence !== sequence) throw Object.assign(new Error("revision conflict"), { code: "CANVAS_DOCUMENT_CONFLICT" });
      sequence += 1;
      payload.updates.push({ update: body.update, sequence });
      return { sequence };
    },
    async createSnapshot(documentId, snapshot) {
      calls.push(["createSnapshot", documentId]);
      if (snapshotFailure) throw new Error("snapshot unavailable");
      payload.snapshot = structuredClone({ state: snapshot.state, throughSequence: snapshot.throughSequence });
      payload.updates = payload.updates.filter(({ sequence: itemSequence }) => itemSequence > snapshot.throughSequence);
    },
  };
  return {
    api, projects, calls, appendBodies,
    setPayload(value) { payload = value; },
    getPayload() { return payload; },
    resumeRead: () => resumeRead(),
    enableReadGate() { readGate = new Promise((resolve) => { resumeRead = resolve; }); },
  };
}

async function fixture(options = {}) {
  const state = backend(options);
  const themeBytes = Uint8Array.of(4, 5, 6);
  const sourceBytes = Uint8Array.of(7, 8, 9);
  const theme = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: { accent: { tokenType: "color", cascade: [{ value: "#123456" }] } },
    paragraphStyles: {}, imports: {}, flows: [], library: { public: [{ kind: "variable", id: "accent" }] }, children: [],
  }, { libraryId: "theme", releaseId: "one" });
  const ui = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {},
    imports: { theme: imported(theme) }, flows: [], library: { public: [component("card")] },
    children: [{ id: "card", type: "frame", fill: "${theme:accent}", children: [{ id: "logo", type: "rectangle", fill: { type: "image", url: "logo.png" } }] }],
  }, { libraryId: "ui", releaseId: "one", dependencies: [{ alias: "theme", ...identity(theme) }], assets: [{ path: "logo.png", sha256: hash(themeBytes), size: themeBytes.length, mimeType: "image/png" }] });
  const upstream = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {},
    imports: { ui: imported(ui) }, flows: [], library: { public: [component("hero")] },
    children: [{ id: "hero", type: "frame", children: [{ id: "use-card", type: "ref", ref: "ui:card" }] }],
  }, { libraryId: "A", releaseId: "one", dependencies: [{ alias: "ui", ...identity(ui) }] });
  const retentionReaders = {
    resolveRelease: async ({ documentId }) => {
      if (documentId === "A") return upstream;
      if (documentId === "ui") return ui;
      if (documentId === "theme") return theme;
      throw new Error(`unexpected source ${documentId}`);
    },
    readAsset: async (release, descriptor) => { assert.equal(release.libraryId, "ui"); assert.equal(descriptor.path, "logo.png"); return new Uint8Array(themeBytes); },
  };
  const publisherSemantic = sourceDocument({ importRecord: imported(upstream), publicItems: [component("screen")] });
  const publisher = createLibraryRelease(publisherSemantic, {
    libraryId: "publisher", releaseId: "initial", dependencies: [{ alias: "a", ...identity(upstream) }],
    assets: [{ path: "source.png", sha256: hash(sourceBytes), size: sourceBytes.length, mimeType: "image/png" }],
  });
  const retentionDescriptor = await createLibraryStorage(state.api).retainItems("publisher", upstream, [component("hero")], retentionReaders);
  const storageDescriptor = await createLibraryStorage(state.api).writeRelease("publisher", { release: publisher, assets: new Map([["source.png", sourceBytes]]) });
  const headSource = sourceDocument({
    importRecord: imported(upstream, retentionDescriptor),
    publication: createLibraryPublicationHead(publisher, storageDescriptor),
  });
  const model = createDocumentModel(headSource);
  state.setPayload({ snapshot: { state: encodeState(model), throughSequence: 0 }, updates: [], assets: [{ path: "source.png", sha256: hash(sourceBytes), size: sourceBytes.length, mimeType: "image/png" }] });
  model.doc.destroy();
  state.calls.length = 0;
  return { ...state, publisher, upstream, ui, theme, sourceBytes, headSource, storageDescriptor, retentionDescriptor };
}

test("workflow composes Yjs head, retained transport, guarded release, inverse, and final retained materialization", async () => {
  const state = await fixture();
  const initialPayload = structuredClone(state.getPayload());
  const initialModel = restoreDocumentModel(initialPayload);
  const initialDocument = materialize(initialModel);
  initialModel.doc.destroy();
  const result = await publishCanvasLibrary(state.api, { documentId: "publisher", publicItems: [component("screen")] });
  assert.equal(result.published, true);
  assert.deepEqual(result.snapshot, { status: "saved" });
  const append = state.appendBodies[0];
  assert.equal(append.expectedSequence, 0);
  assert.match(append.clientUpdateId, /^[0-9a-f-]{36}$/u);
  assert.match(append.operation.id, /^[0-9a-f-]{36}$/u);
  assert.ok(append.update.length > 0 && append.operation.inverseUpdate.length > 0);

  const replay = restoreDocumentModel(initialPayload);
  try {
    Y.applyUpdate(replay.doc, base64ToBytes(append.update));
    assert.equal(materialize(replay).library.publication.releaseId, result.publication.releaseId);
    Y.applyUpdate(replay.doc, base64ToBytes(append.operation.inverseUpdate));
    assert.deepEqual(materialize(replay), initialDocument);
  } finally { replay.doc.destroy(); }

  const loaded = await readPublishedCanvasLibrary(state.api, "publisher");
  assert.equal(loaded.release.contentHash, result.publication.contentHash);
  assert.equal(loaded.retentions.length, 1);
  const accepted = await preparePublishedLibraryRetention(loaded, [component("screen")]);
  const finalConsumer = {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, flows: [],
    imports: { publisher: imported(loaded.release) }, children: [{ id: "final", type: "ref", ref: "publisher:screen" }],
  };
  const built = buildRetainedCanvasImports(finalConsumer, new Map([["publisher", accepted]]));
  assert.equal(built.imports.publisher.retained, true);
  assert.deepEqual([...built.assets.keys()].sort(), ["imports/publisher/imports/a/imports/ui/logo.png", "imports/publisher/source.png"]);
  assert.equal(state.calls.every(([, documentId]) => documentId === "publisher"), true);
});

test("concurrent revision conflict never attaches a head, while snapshot failure reports deferred durability", async () => {
  const conflict = await fixture({ conflict: true });
  await assert.rejects(publishCanvasLibrary(conflict.api, { documentId: "publisher", publicItems: [component("screen")] }), { code: "CANVAS_DOCUMENT_CONFLICT" });
  assert.equal(conflict.getPayload().updates.length, 0);
  assert.equal(conflict.calls.some(([operation]) => operation === "createSnapshot"), false);

  const deferred = await fixture({ snapshotFailure: true });
  const result = await publishCanvasLibrary(deferred.api, { documentId: "publisher", publicItems: [component("screen")] });
  assert.equal(result.published, true);
  assert.deepEqual(result.snapshot, { status: "deferred", code: "CANVAS_LIBRARY_SNAPSHOT_DEFERRED" });
  assert.equal(deferred.getPayload().updates.length, 1);
  assert.equal((await readPublishedCanvasLibrary(deferred.api, "publisher")).release.contentHash, result.publication.contentHash);
});

test("malformed append receipt is commit-unknown rather than publication absence", async () => {
  const state = await fixture();
  const appendUpdate = state.api.appendUpdate;
  state.api.appendUpdate = async (...args) => { await appendUpdate(...args); return {}; };
  await assert.rejects(publishCanvasLibrary(state.api, { documentId: "publisher", publicItems: [component("screen")] }), (error) => {
    assert.equal(error.code, "CANVAS_LIBRARY_PUBLICATION_COMMIT_UNKNOWN");
    assert.ok(error.operationId && error.publication.storage.path);
    return true;
  });
  assert.equal(state.getPayload().updates.length, 1);
  assert.equal(state.calls.some(([operation]) => operation === "createSnapshot"), false);
});

test("request and fetched-source mutations across an await do not alter the selected publication", async () => {
  const state = await fixture();
  state.enableReadGate();
  const input = { documentId: "publisher", publicItems: [component("screen")] };
  const pending = publishCanvasLibrary(state.api, input);
  input.publicItems[0].id = "missing";
  state.getPayload().snapshot.state = "mutated";
  state.headSource.children[0].id = "mutated";
  state.resumeRead();
  const result = await pending;
  assert.equal(result.published, true);
  assert.deepEqual((await readPublishedCanvasLibrary(state.api, "publisher")).release.publicItems.map(({ kind, id }) => ({ kind, id })), [component("screen")]);
});

test("explicit public removal publishes an empty manifest and successive heads preserve old immutable bytes", async () => {
  const state = await fixture();
  const first = await publishCanvasLibrary(state.api, { documentId: "publisher", publicItems: [component("screen")] });
  const oldBlob = new Uint8Array(state.projects.get("publisher").get(first.publication.storage.sha256));
  const second = await publishCanvasLibrary(state.api, { documentId: "publisher", publicItems: [] });
  assert.deepEqual((await readPublishedCanvasLibrary(state.api, "publisher")).release.publicItems, []);
  assert.notEqual(first.publication.storage.sha256, second.publication.storage.sha256);
  assert.deepEqual(state.projects.get("publisher").get(first.publication.storage.sha256), oldBlob);
  assert.equal(JSON.parse(new TextDecoder().decode(oldBlob)).content.release.publicItems.length, 1);
});

test("missing methods, invalid public shape, denied own asset, and tampered own asset fail before append", async () => {
  const missing = await fixture();
  delete missing.api.appendUpdate;
  await assert.rejects(publishCanvasLibrary(missing.api, { documentId: "publisher", publicItems: [component("screen")] }), { code: "CANVAS_LIBRARY_STORAGE_REQUIRED" });

  const invalid = await fixture();
  await assert.rejects(publishCanvasLibrary(invalid.api, { documentId: "publisher", publicItems: [component("missing")] }), { code: "CANVAS_SCHEMA_INVALID" });
  assert.deepEqual(invalid.calls, [["getDocument", "publisher"]]);

  const denied = await fixture();
  denied.projects.get("publisher").delete(hash(denied.sourceBytes));
  await assert.rejects(publishCanvasLibrary(denied.api, { documentId: "publisher", publicItems: [component("screen")] }), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
  assert.equal(denied.calls.some(([operation]) => operation === "appendUpdate"), false);

  const tampered = await fixture();
  tampered.projects.get("publisher").set(hash(tampered.sourceBytes), Uint8Array.of(1));
  await assert.rejects(publishCanvasLibrary(tampered.api, { documentId: "publisher", publicItems: [component("screen")] }), { code: "CANVAS_IMPORT_INTEGRITY" });
  assert.equal(tampered.calls.some(([operation]) => operation === "appendUpdate"), false);
});
