import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createDocumentModel, encodeState, applyRemoteUpdate, materialize, restoreDocumentModel } from "./document-model.mjs";
import { createLibraryRelease, releaseIdentity } from "./library-publication.mjs";
import { createLibraryPublicationHead } from "./library-publication-head.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";
import { createLibraryStorage } from "./library-storage.mjs";
import { loadRetainedCanvasImports } from "./library-retained-loader.mjs";
import { acceptCanvasLibrary } from "./library-accept-workflow.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const component = (id) => ({ kind: "component", id });
const imported = (release) => ({ documentId: release.libraryId, updatePolicy: "pinned", releaseId: release.releaseId, contentHash: release.contentHash });
const dependency = (alias, release) => ({ alias, ...releaseIdentity(release) });

function doc(children, publicItems, imports = {}, variables = {}) {
  return { version: "2.17", module: "generic", axes: {}, variables, paragraphStyles: {}, imports, flows: [], children, library: { public: publicItems } };
}

function encodeDocument(source) {
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
  return { snapshot: { state, throughSequence: 0 }, updates: [], assets: [] };
}

function sequence(payload) {
  return Math.max(Number(payload.snapshot?.throughSequence ?? 0), ...(payload.updates ?? []).map(({ sequence: value }) => Number(value)));
}

function fakeAccount() {
  const projects = new Map([["publisher", new Map()], ["consumer", new Map()]]);
  const documents = new Map();
  const calls = [];
  const appendBodies = [];
  const controls = { denyPublisher: false, consumerGate: null, uploadFailure: null, badRead: null, appendFailure: null, malformedAppend: false, snapshotFailure: false, beforeAppend: null };
  const api = {
    async getDocument(documentId) {
      calls.push({ op: "getDocument", documentId });
      if (documentId === "publisher" && controls.denyPublisher) throw Object.assign(new Error("publisher denied"), { code: "ACCESS_DENIED" });
      if (controls.consumerGate && documentId === "consumer") await controls.consumerGate;
      const payload = documents.get(documentId);
      if (!payload) throw Object.assign(new Error("document missing"), { code: "CANVAS_DOCUMENT_NOT_FOUND" });
      return structuredClone(payload);
    },
    async uploadAsset(documentId, asset) {
      calls.push({ op: "uploadAsset", documentId, path: asset.path });
      if (controls.uploadFailure?.(documentId, asset)) throw Object.assign(new Error("upload failed"), { code: "QUOTA_EXCEEDED" });
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("project denied"), { code: "ACCESS_DENIED" });
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.bytes.length, mimeType: asset.mimeType };
    },
    async readAsset(documentId, descriptor) {
      calls.push({ op: "readAsset", documentId, path: descriptor.path });
      if (controls.badRead?.(documentId, descriptor)) return Uint8Array.of(0);
      const bytes = projects.get(documentId)?.get(descriptor.sha256);
      if (!bytes) throw Object.assign(new Error("asset missing"), { code: "ACCESS_DENIED" });
      return new Uint8Array(bytes);
    },
    async appendUpdate(documentId, body) {
      calls.push({ op: "appendUpdate", documentId });
      appendBodies.push(structuredClone(body));
      if (controls.beforeAppend) await controls.beforeAppend(documentId);
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
      documents.set(documentId, { snapshot: { state: snapshot.state, throughSequence: snapshot.throughSequence }, updates: [], assets: [] });
      return { throughSequence: snapshot.throughSequence };
    },
  };
  return { api, projects, documents, calls, appendBodies, controls };
}

async function fixture(consumer = null) {
  const imageBytes = Uint8Array.of(1, 2, 3, 4);
  const theme = createLibraryRelease(doc([], [{ kind: "variable", id: "accent" }], {}, { accent: { tokenType: "color", cascade: [{ value: "#123456" }] } }), { libraryId: "theme", releaseId: "one" });
  const ui = createLibraryRelease(doc([
    { id: "card", type: "frame", fill: "${theme:accent}", children: [{ id: "logo", type: "rectangle", fill: { type: "image", url: "logo.png" } }] },
    { id: "private-ui", type: "frame" },
  ], [component("card")], { theme: imported(theme) }), {
    libraryId: "ui", releaseId: "one", dependencies: [dependency("theme", theme)],
    assets: [{ path: "logo.png", sha256: hash(imageBytes), size: imageBytes.length, mimeType: "image/png" }],
  });
  const publisher = createLibraryRelease(doc([
    { id: "shell", type: "frame", children: [{ id: "use", type: "ref", ref: "ui:card" }] },
    { id: "private-publisher", type: "frame" },
  ], [component("shell")], { ui: imported(ui) }), { libraryId: "publisher", releaseId: "one", dependencies: [dependency("ui", ui)] });
  const uiRetention = await prepareLibraryRetention(ui, [component("card")], {
    resolveRelease: async () => theme,
    readAsset: async () => new Uint8Array(imageBytes),
  });
  const state = fakeAccount();
  const storage = createLibraryStorage(state.api);
  const releaseStorage = await storage.writeRelease("publisher", {
    release: publisher,
    assets: new Map(),
    retentions: [{ alias: "ui", retention: uiRetention }],
  });
  const publisherSource = structuredClone(publisher.document);
  publisherSource.library.publication = createLibraryPublicationHead(publisher, releaseStorage);
  state.documents.set("publisher", encodeDocument(publisherSource));
  state.documents.set("consumer", encodeDocument(consumer ?? doc([{ id: "screen", type: "frame" }], [])));
  return { ...state, storage, theme, ui, publisher, uiRetention, imageBytes, releaseStorage, publisherSource };
}

async function accept(state, input = {}) {
  return acceptCanvasLibrary(state.api, {
    documentId: "consumer", libraryId: "publisher", alias: "school", items: [component("shell")], ...input,
  });
}

async function materializedConsumer(state) {
  const payload = await state.api.getDocument("consumer");
  const model = restoreDocumentModel(payload);
  try { return { payload, document: materialize(model) }; }
  finally { model.doc.destroy(); }
}

test("publish then accept stores one undoable retained import and loads after source deletion", async () => {
  const state = await fixture();
  const result = await accept(state);
  assert.equal(result.accepted, true);
  assert.equal(result.alias, "school");
  assert.deepEqual(result.identity, { libraryId: "publisher", releaseId: state.publisher.releaseId, contentHash: state.publisher.contentHash });
  assert.equal(result.sequence, 1);
  assert.deepEqual(result.snapshot, { status: "saved" });
  assert.equal(state.calls.filter(({ op, documentId }) => op === "getDocument" && documentId === "publisher").length, 2);
  const current = await materializedConsumer(state);
  const loaded = await loadRetainedCanvasImports(state.api, current.document, { documentId: "consumer" });
  assert.equal(loaded.imports.school.retained, true);
  assert.deepEqual([...loaded.assets.keys()], ["imports/school/imports/ui/logo.png"]);
  assert.equal(current.document.imports.school.updatePolicy, "follow");
  assert.equal(state.calls.some(({ documentId }) => documentId === "ui" || documentId === "theme"), false);
  state.projects.delete("publisher");
  state.documents.delete("publisher");
  const afterDeletion = await loadRetainedCanvasImports(state.api, current.document, { documentId: "consumer" });
  assert.deepEqual([...afterDeletion.assets.keys()], ["imports/school/imports/ui/logo.png"]);
});

test("same-source alias updates preserve default policy, explicit policy is honored, and other sources conflict", async () => {
  const state = await fixture();
  const first = await accept(state);
  const second = await accept(state, { updatePolicy: "pinned" });
  assert.equal(second.sequence, 2);
  assert.equal((await materializedConsumer(state)).document.imports.school.updatePolicy, "pinned");
  const third = await accept(state, { updatePolicy: "follow" });
  assert.equal(third.sequence, 3);
  assert.equal((await materializedConsumer(state)).document.imports.school.updatePolicy, "follow");
  await assert.rejects(acceptCanvasLibrary(state.api, { documentId: "consumer", libraryId: "different", alias: "school", items: [component("shell")] }), { code: "CANVAS_IMPORT_ALIAS_CONFLICT" });
  assert.equal(state.calls.filter(({ op }) => op === "appendUpdate").length, 3);
  assert.ok(first.operationId && second.operationId && third.operationId);
});

test("private or removed items and broken existing references fail before append", async () => {
  const state = await fixture();
  await assert.rejects(accept(state, { items: [component("private-publisher")] }), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  assert.equal(state.calls.some(({ op }) => op === "appendUpdate"), false);

  const acceptedDescriptor = await state.storage.retainPublishedItems("consumer", state.publisher, [component("shell")], { readPublication: async () => (await import("./library-publication-head.mjs")).readPublishedCanvasLibrary(state.api, "publisher") });
  const broken = doc([{ id: "screen", type: "ref", ref: "old:private-publisher" }], [], { old: { documentId: "publisher", updatePolicy: "follow", releaseId: state.publisher.releaseId, contentHash: state.publisher.contentHash, retention: acceptedDescriptor } });
  state.documents.set("consumer", encodeDocument(broken));
  state.calls.length = 0;
  await assert.rejects(accept(state), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  assert.equal(state.calls.some(({ op }) => op === "appendUpdate"), false);
});

test("root denial happens before consumer upload", async () => {
  const state = await fixture();
  state.controls.denyPublisher = true;
  state.projects.get("consumer").set("unrelated", Uint8Array.of(8));
  await assert.rejects(accept(state), { code: "ACCESS_DENIED" });
  assert.equal(state.calls.some(({ op, documentId }) => op === "uploadAsset" && documentId === "consumer"), false);
  assert.deepEqual(state.projects.get("consumer").get("unrelated"), Uint8Array.of(8));
});

test("consumer input is snapshotted across publication awaits and output receipt bytes are detached", async () => {
  const state = await fixture();
  let resume;
  const gate = new Promise((resolve) => { resume = resolve; });
  state.controls.consumerGate = gate;
  const input = { documentId: "consumer", libraryId: "publisher", alias: "school", items: [component("shell")] };
  const pending = acceptCanvasLibrary(state.api, input);
  input.alias = "changed";
  input.items[0].id = "private-publisher";
  resume();
  const result = await pending;
  assert.equal(result.alias, "school");
  const before = result.retention.path;
  result.retention.path = "changed";
  assert.equal(before.startsWith("_canvas/library-content/"), true);
  assert.equal((await materializedConsumer(state)).document.imports.school.retention.path.startsWith("_canvas/library-content/"), true);
});

test("append conflict, upload/readback failure, and malformed append receipt never snapshot a false success", async () => {
  for (const failure of ["upload", "readback", "append", "malformed"]) {
    const state = await fixture();
    state.projects.get("consumer").set("unrelated", Uint8Array.of(5, 5));
    if (failure === "upload") state.controls.uploadFailure = (documentId) => documentId === "consumer";
    if (failure === "readback") state.controls.badRead = (documentId) => documentId === "consumer";
    if (failure === "append") state.controls.appendFailure = "CANVAS_DOCUMENT_CONFLICT";
    if (failure === "malformed") state.controls.malformedAppend = true;
    if (failure === "malformed") {
      await assert.rejects(accept(state), (error) => {
        assert.equal(error.code, "CANVAS_LIBRARY_ACCEPT_COMMIT_UNKNOWN");
        assert.ok(error.operationId && error.identity.contentHash);
        return true;
      });
    } else {
      await assert.rejects(accept(state));
    }
    assert.equal(state.calls.some(({ op }) => op === "createSnapshot"), false);
    assert.deepEqual(state.projects.get("consumer").get("unrelated"), Uint8Array.of(5, 5));
  }
});

test("snapshot failure preserves committed receipt, and inverse update restores prior imports", async () => {
  const state = await fixture();
  state.controls.snapshotFailure = true;
  const result = await accept(state);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.snapshot, { status: "deferred", code: "CANVAS_LIBRARY_SNAPSHOT_DEFERRED" });
  const append = state.appendBodies[0];
  const current = await state.api.getDocument("consumer");
  const model = restoreDocumentModel(current);
  try {
    applyRemoteUpdate(model, append.operation.inverseUpdate);
    assert.deepEqual(materialize(model).imports, {});
  } finally { model.doc.destroy(); }
});

test("concurrent consumer edit is guarded by the captured safe sequence", async () => {
  const state = await fixture();
  state.controls.beforeAppend = async () => {
    const payload = state.documents.get("consumer");
    payload.updates.push({ sequence: 1, update: state.appendBodies[0].update });
  };
  await assert.rejects(accept(state), { code: "CANVAS_DOCUMENT_CONFLICT" });
  assert.equal(state.calls.some(({ op }) => op === "createSnapshot"), false);
});

test("invalid request fields and non-safe consumer sequences fail before publication selection", async () => {
  const invalid = [
    [{ alias: "bad/slash" }, "CANVAS_LIBRARY_INVALID"],
    [{ updatePolicy: "live" }, "CANVAS_LIBRARY_INVALID"],
    [{ items: [] }, "CANVAS_LIBRARY_INVALID"],
    [{ documentId: "" }, "CANVAS_LIBRARY_INVALID"],
  ];
  for (const [change, code] of invalid) {
    const state = await fixture();
    state.calls.length = 0;
    await assert.rejects(acceptCanvasLibrary(state.api, { documentId: "consumer", libraryId: "publisher", alias: "school", items: [component("shell")], ...change }), { code });
    assert.equal(state.calls.length, 0);
  }
  for (const badSequence of ["0", Number.MAX_SAFE_INTEGER + 1]) {
    const state = await fixture();
    state.documents.get("consumer").snapshot.throughSequence = badSequence;
    state.calls.length = 0;
    await assert.rejects(accept(state), { code: "CANVAS_IMPORT_INTEGRITY" });
    assert.deepEqual(state.calls.map(({ op }) => op), ["getDocument"]);
  }
});
