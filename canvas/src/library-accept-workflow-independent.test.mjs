import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { applyRemoteUpdate, createDocumentModel, encodeState, materialize, restoreDocumentModel } from "./document-model.mjs";
import { loadRetainedCanvasImports } from "./library-retained-loader.mjs";
import { createLibraryPublicationHead, readPublishedCanvasLibrary } from "./library-publication-head.mjs";
import { createLibraryRelease, releaseIdentity } from "./library-publication.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";
import { createLibraryStorage } from "./library-storage.mjs";
import { acceptCanvasLibrary } from "./library-accept-workflow.mjs";
import { publishCanvasLibrary } from "./library-publish-workflow.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const component = (id) => ({ kind: "component", id });
const imported = (release, retention) => ({
  documentId: release.libraryId,
  updatePolicy: "pinned",
  releaseId: release.releaseId,
  contentHash: release.contentHash,
  ...(retention === undefined ? {} : { retention }),
});
const dependency = (alias, release) => ({ alias, ...releaseIdentity(release) });

function document(children, publicItems, imports = {}, variables = {}) {
  return {
    version: "2.17", module: "generic", axes: {}, variables, paragraphStyles: {},
    imports, flows: [], library: { public: publicItems }, children,
  };
}

function encodeDocument(source, assets = []) {
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
  return { snapshot: { state, throughSequence: 0 }, updates: [], assets };
}

function sequence(payload) {
  return Math.max(Number(payload?.snapshot?.throughSequence ?? 0), ...(payload?.updates ?? []).map(({ sequence: value }) => Number(value)));
}

function account() {
  const projects = new Map([["publisher", new Map()], ["consumer", new Map()]]);
  const documents = new Map();
  const calls = [];
  const appendBodies = [];
  const controls = {
    denyPublisher: false,
    uploadFailure: null,
    badRead: null,
    appendFailure: null,
    malformedAppend: false,
    snapshotFailure: false,
    beforeAppend: null,
    consumerReadGate: null,
    resumeConsumerRead: () => {},
    publisherAssetGate: null,
    resumePublisherAsset: () => {},
  };
  const api = {
    async getDocument(documentId) {
      calls.push({ op: "getDocument", documentId });
      if (documentId === "publisher" && controls.denyPublisher) {
        throw Object.assign(new Error("publisher denied"), { code: "ACCESS_DENIED" });
      }
      if (documentId === "consumer" && controls.consumerReadGate) await controls.consumerReadGate;
      const payload = documents.get(documentId);
      if (!payload) throw Object.assign(new Error("document missing"), { code: "CANVAS_DOCUMENT_NOT_FOUND" });
      return structuredClone(payload);
    },
    async uploadAsset(documentId, asset) {
      calls.push({ op: "uploadAsset", documentId, path: asset.path });
      if (controls.uploadFailure?.(documentId, asset)) throw Object.assign(new Error("upload failed"), { code: "UPLOAD_FAILED" });
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("project denied"), { code: "ACCESS_DENIED" });
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.bytes.length, ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }) };
    },
    async readAsset(documentId, descriptor) {
      calls.push({ op: "readAsset", documentId, path: descriptor.path });
      if (documentId === "publisher" && !descriptor.path.startsWith("_canvas/library-content/")) {
        if (controls.publisherAssetGate) await controls.publisherAssetGate;
      }
      if (controls.badRead?.(documentId, descriptor)) return Uint8Array.of(0);
      const bytes = projects.get(documentId)?.get(descriptor.sha256);
      if (!bytes) throw Object.assign(new Error("asset missing"), { code: "ACCESS_DENIED" });
      return new Uint8Array(bytes);
    },
    async appendUpdate(documentId, body) {
      calls.push({ op: "appendUpdate", documentId });
      appendBodies.push(structuredClone(body));
      if (controls.beforeAppend) await controls.beforeAppend(documentId, body);
      if (controls.appendFailure) throw Object.assign(new Error("append failed"), { code: controls.appendFailure });
      const payload = documents.get(documentId);
      if (body.expectedSequence !== sequence(payload)) throw Object.assign(new Error("document changed"), { code: "CANVAS_DOCUMENT_CONFLICT" });
      const next = body.expectedSequence + 1;
      payload.updates.push({ sequence: next, update: body.update });
      if (controls.malformedAppend) return {};
      return { sequence: next };
    },
    async createSnapshot(documentId, snapshot) {
      calls.push({ op: "createSnapshot", documentId });
      if (controls.snapshotFailure) throw Object.assign(new Error("snapshot unavailable"), { code: "SNAPSHOT_UNAVAILABLE" });
      const prior = documents.get(documentId);
      documents.set(documentId, {
        snapshot: { state: snapshot.state, throughSequence: snapshot.throughSequence },
        updates: [], assets: structuredClone(prior.assets ?? []),
      });
    },
  };
  return {
    api, projects, documents, calls, appendBodies, controls,
    gatePublisherAsset() {
      controls.publisherAssetGate = new Promise((resolve) => { controls.resumePublisherAsset = resolve; });
    },
    gateConsumerRead() {
      controls.consumerReadGate = new Promise((resolve) => { controls.resumeConsumerRead = resolve; });
    },
  };
}

async function fixture({ assetFree = false } = {}) {
  const state = account();
  const nestedBytes = Uint8Array.of(1, 2, 3, 4);
  const sourceBytes = Uint8Array.of(8, 9, 10);
  const theme = createLibraryRelease(document([], [{ kind: "variable", id: "accent" }], {}, { accent: { tokenType: "color", cascade: [{ value: "#123456" }] } }), {
    libraryId: "theme", releaseId: "one",
  });
  const ui = createLibraryRelease(document([
    { id: "card", type: "frame", fill: "${theme:accent}", children: [{ id: "logo", type: "rectangle", fill: { type: "image", url: "logo.png" } }] },
    { id: "private-ui", type: "frame" },
  ], [component("card")], { theme: imported(theme) }), {
    libraryId: "ui", releaseId: "one", dependencies: [dependency("theme", theme)],
    assets: [{ path: "logo.png", sha256: hash(nestedBytes), size: nestedBytes.length, mimeType: "image/png" }],
  });
  const uiRetention = await createLibraryStorage(state.api).retainItems("publisher", ui, [component("card")], {
    resolveRelease: async ({ documentId }) => {
      if (documentId === "ui") return ui;
      if (documentId === "theme") return theme;
      throw new Error(`unexpected source ${documentId}`);
    },
    readAsset: async (release, descriptor) => {
      assert.equal(release.libraryId, "ui");
      assert.equal(descriptor.path, "logo.png");
      return new Uint8Array(nestedBytes);
    },
  });
  const sourceAssets = assetFree ? [] : [{ path: "source.png", sha256: hash(sourceBytes), size: sourceBytes.length, mimeType: "image/png" }];
  const publisherSource = document([
    { id: "shell", type: "frame", children: [{ id: "use", type: "ref", ref: "ui:card" }] },
    { id: "private-publisher", type: "frame" },
  ], [component("shell")], { ui: imported(ui, uiRetention) });
  if (!assetFree) state.projects.get("publisher").set(hash(sourceBytes), new Uint8Array(sourceBytes));
  state.documents.set("publisher", encodeDocument(publisherSource, sourceAssets));
  state.documents.set("consumer", encodeDocument(document([{ id: "screen", type: "frame" }], [])));
  state.calls.length = 0;
  return { ...state, nestedBytes, sourceBytes, publisherSource, uiRetention, theme, ui, assetFree };
}

async function publish(state, publicItems = [component("shell")]) {
  return publishCanvasLibrary(state.api, { documentId: "publisher", publicItems });
}

async function accept(state, overrides = {}) {
  return acceptCanvasLibrary(state.api, {
    documentId: "consumer", libraryId: "publisher", alias: "school", items: [component("shell")], ...overrides,
  });
}

async function freshConsumer(state) {
  const payload = await state.api.getDocument("consumer");
  const model = restoreDocumentModel(payload);
  try { return { payload, document: materialize(model) }; }
  finally { model.doc.destroy(); }
}

test("real publish then accept retains nested assets after publisher and upstream deletion", async () => {
  const state = await fixture();
  const published = await publish(state);
  const accepted = await accept(state);
  assert.equal(published.published, true);
  assert.equal(accepted.accepted, true);
  assert.equal(state.appendBodies.length, 2);
  assert.equal(state.appendBodies[0].expectedSequence, 0);
  assert.equal(state.appendBodies[1].expectedSequence, 0);
  for (const body of state.appendBodies) {
    assert.match(body.clientUpdateId, /^[0-9a-f-]{36}$/u);
    assert.match(body.operation.id, /^[0-9a-f-]{36}$/u);
    assert.ok(body.update.length > 0 && body.operation.inverseUpdate.length > 0);
  }
  const consumerBeforeUndo = await state.api.getDocument("consumer");
  const undoModel = restoreDocumentModel(consumerBeforeUndo);
  try {
    applyRemoteUpdate(undoModel, state.appendBodies[1].operation.inverseUpdate);
    assert.deepEqual(materialize(undoModel).imports, {});
  } finally { undoModel.doc.destroy(); }

  const beforeDeletionCalls = state.calls.length;
  state.projects.delete("publisher");
  state.documents.delete("publisher");
  const current = await freshConsumer(state);
  const loaded = await loadRetainedCanvasImports(state.api, current.document, { documentId: "consumer" });
  assert.equal(loaded.imports.school.retained, true);
  assert.deepEqual([...loaded.assets.keys()], ["imports/school/imports/ui/logo.png"]);
  assert.equal(state.calls.slice(beforeDeletionCalls).every(({ documentId }) => documentId === "consumer"), true);
  assert.equal(state.calls.some(({ documentId }) => documentId === "ui" || documentId === "theme"), false);
  assert.equal(accepted.identity.contentHash, published.publication.contentHash);
});

test("publisher denial is enforced even for asset-free publications, before consumer upload", async () => {
  const state = await fixture({ assetFree: true });
  await publish(state);
  state.calls.length = 0;
  state.controls.denyPublisher = true;
  await assert.rejects(accept(state), { code: "ACCESS_DENIED" });
  assert.equal(state.calls.map(({ op }) => op).includes("uploadAsset"), false);
  assert.equal(state.calls.map(({ op }) => op).includes("appendUpdate"), false);
});

test("removed public items, unaccepted private items, and source/asset failures reject before append", async () => {
  const removed = await fixture();
  await publish(removed, []);
  removed.calls.length = 0;
  await assert.rejects(accept(removed), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  assert.equal(removed.calls.some(({ op }) => op === "appendUpdate" || op === "uploadAsset"), false);

  const privateItem = await fixture();
  await publish(privateItem);
  privateItem.calls.length = 0;
  await assert.rejects(accept(privateItem, { items: [component("private-publisher")] }), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  assert.equal(privateItem.calls.some(({ op }) => op === "appendUpdate"), false);

  const upload = await fixture();
  await publish(upload);
  upload.controls.uploadFailure = (documentId) => documentId === "consumer";
  await assert.rejects(accept(upload), { code: "UPLOAD_FAILED" });
  assert.equal(upload.calls.some(({ op }) => op === "appendUpdate"), false);

  const readback = await fixture();
  await publish(readback);
  readback.controls.badRead = (documentId) => documentId === "consumer";
  await assert.rejects(accept(readback), { code: "CANVAS_IMPORT_INTEGRITY" });
  assert.equal(readback.calls.some(({ op }) => op === "appendUpdate"), false);
});

test("CAS conflict, malformed durable receipt, deferred snapshot, and exact undo remain distinguishable", async () => {
  const conflict = await fixture();
  await publish(conflict);
  conflict.controls.beforeAppend = async (documentId, body) => {
    const payload = conflict.documents.get(documentId);
    payload.updates.push({ sequence: 1, update: body.update });
  };
  await assert.rejects(accept(conflict), { code: "CANVAS_DOCUMENT_CONFLICT" });
  assert.equal(conflict.calls.some(({ op }) => op === "createSnapshot"), true); // publisher snapshot only
  assert.equal(conflict.calls.filter(({ op, documentId }) => op === "createSnapshot" && documentId === "consumer").length, 0);

  const malformed = await fixture();
  await publish(malformed);
  malformed.controls.malformedAppend = true;
  await assert.rejects(accept(malformed), (error) => {
    assert.equal(error.code, "CANVAS_LIBRARY_ACCEPT_COMMIT_UNKNOWN");
    assert.ok(error.operationId && error.identity.contentHash);
    return true;
  });
  assert.equal(malformed.calls.filter(({ op, documentId }) => op === "createSnapshot" && documentId === "consumer").length, 0);

  const deferred = await fixture();
  await publish(deferred);
  deferred.controls.snapshotFailure = true;
  const result = await accept(deferred);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.snapshot, { status: "deferred", code: "CANVAS_LIBRARY_SNAPSHOT_DEFERRED" });
  const current = await freshConsumer(deferred);
  const inverseModel = restoreDocumentModel(current.payload);
  try {
    applyRemoteUpdate(inverseModel, deferred.appendBodies.at(-1).operation.inverseUpdate);
    assert.deepEqual(materialize(inverseModel).imports, {});
  } finally { inverseModel.doc.destroy(); }
});

test("same-source alias updates preserve policy, other source conflicts, and later publication is selected", async () => {
  const state = await fixture();
  const first = await publish(state);
  const accepted = await accept(state);
  assert.equal((await freshConsumer(state)).document.imports.school.updatePolicy, "follow");
  const same = await accept(state);
  assert.equal(same.accepted, true);
  assert.equal((await freshConsumer(state)).document.imports.school.updatePolicy, "follow");
  await assert.rejects(accept(state, { libraryId: "other" }), { code: "CANVAS_IMPORT_ALIAS_CONFLICT" });

  const oldStorage = structuredClone(first.publication.storage);
  const oldBytes = new Uint8Array(state.projects.get("publisher").get(oldStorage.sha256));
  const second = await publish(state);
  assert.notEqual(second.publication.contentHash, first.publication.contentHash);
  assert.deepEqual(state.projects.get("publisher").get(oldStorage.sha256), oldBytes);
  const latest = await readPublishedCanvasLibrary(state.api, "publisher");
  assert.equal(latest.publication.contentHash, second.publication.contentHash);
  const updated = await accept(state, { updatePolicy: "pinned" });
  assert.equal(updated.identity.contentHash, second.publication.contentHash);
  assert.equal((await freshConsumer(state)).document.imports.school.updatePolicy, "pinned");
  assert.equal(accepted.identity.contentHash, first.publication.contentHash);
});

test("request and source snapshots isolate caller mutation across awaits and forbid upstream reads", async () => {
  const state = await fixture();
  state.gatePublisherAsset();
  const input = { documentId: "publisher", publicItems: [component("shell")] };
  const pendingPublish = publishCanvasLibrary(state.api, input);
  input.publicItems[0].id = "private-publisher";
  state.documents.get("publisher").assets[0].path = "mutated.png";
  state.controls.resumePublisherAsset();
  const published = await pendingPublish;
  assert.equal(published.published, true);

  const state2 = await fixture();
  await publish(state2);
  state2.gateConsumerRead();
  const acceptInput = { documentId: "consumer", libraryId: "publisher", alias: "school", items: [component("shell")] };
  const pendingAccept = acceptCanvasLibrary(state2.api, acceptInput);
  acceptInput.alias = "mutated";
  acceptInput.items[0].id = "private-publisher";
  state2.controls.resumeConsumerRead();
  const accepted = await pendingAccept;
  assert.equal(accepted.alias, "school");
  assert.equal((await freshConsumer(state2)).document.imports.school.documentId, "publisher");
  assert.equal(state2.calls.some(({ documentId }) => documentId === "ui" || documentId === "theme"), false);
});
