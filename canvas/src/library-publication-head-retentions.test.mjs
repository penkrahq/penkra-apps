import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildRetainedCanvasImports } from "./library-retained-imports.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";
import { createLibraryRelease, releaseIdentity } from "./library-publication.mjs";
import { createLibraryPublicationHead, readPublishedCanvasLibrary } from "./library-publication-head.mjs";
import { preparePublishedLibraryRetention } from "./library-published-retention.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";
import { createLibraryStorage } from "./library-storage.mjs";

const component = (id) => ({ kind: "component", id });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function payload(document) {
  const model = createDocumentModel(document);
  const state = encodeState(model);
  model.doc.destroy();
  return { snapshot: { state }, updates: [] };
}

function identity(release) { return releaseIdentity(release); }
function imported(release) { return { documentId: release.libraryId, updatePolicy: "pinned", releaseId: release.releaseId, contentHash: release.contentHash }; }

function backend() {
  const projects = new Map([["publisher", new Map()]]);
  const calls = [];
  let headPayload;
  const api = {
    async getDocument(documentId) {
      calls.push(["getDocument", documentId]);
      if (documentId !== "publisher") throw Object.assign(new Error("upstream source access denied"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return structuredClone(headPayload);
    },
    async uploadAsset(documentId, asset) {
      calls.push(["uploadAsset", documentId, asset.path]);
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("project access denied"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.bytes.length, ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }) };
    },
    async readAsset(documentId, descriptor) {
      calls.push(["readAsset", documentId, descriptor.path]);
      const bytes = projects.get(documentId)?.get(descriptor.sha256);
      if (!bytes) throw Object.assign(new Error("stored blob missing"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return new Uint8Array(bytes);
    },
  };
  return { api, projects, calls, setHead(document) { headPayload = payload(document); } };
}

async function fixture({ withRetentions = true } = {}) {
  const imageBytes = Uint8Array.of(1, 2, 3, 4);
  const theme = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: { accent: { tokenType: "color", cascade: [{ value: "#123456" }] } },
    paragraphStyles: {}, imports: {}, flows: [], library: { public: [{ kind: "variable", id: "accent" }] }, children: [],
  }, { libraryId: "theme", releaseId: "one" });
  const ui = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {},
    imports: { theme: imported(theme) }, flows: [], library: { public: [component("card")] },
    children: [{ id: "card", type: "frame", fill: "${theme:accent}", children: [{ id: "logo", type: "rectangle", fill: { type: "image", url: "logo.png" } }] }],
  }, { libraryId: "ui", releaseId: "one", dependencies: [{ alias: "theme", ...identity(theme) }], assets: [{ path: "logo.png", sha256: hash(imageBytes), size: imageBytes.length, mimeType: "image/png" }] });
  const publisher = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {},
    imports: { ui: imported(ui) }, flows: [], library: { public: [component("shell")] },
    children: [{ id: "shell", type: "frame", children: [{ id: "use", type: "ref", ref: "ui:card" }] }],
  }, { libraryId: "publisher", releaseId: "one", dependencies: [{ alias: "ui", ...identity(ui) }] });
  const retention = await prepareLibraryRetention(ui, [component("card")], {
    resolveRelease: async ({ documentId }) => { assert.equal(documentId, theme.libraryId); return theme; },
    readAsset: async (release, descriptor) => { assert.equal(release.libraryId, ui.libraryId); assert.equal(descriptor.path, "logo.png"); return new Uint8Array(imageBytes); },
  });
  const prepared = { release: publisher, assets: new Map(), ...(withRetentions ? { retentions: [{ alias: "ui", retention }] } : {}) };
  const state = backend();
  const storageDescriptor = await createLibraryStorage(state.api).writeRelease("publisher", prepared);
  const headSource = structuredClone(publisher.document);
  headSource.library.publication = createLibraryPublicationHead(publisher, storageDescriptor);
  state.setHead(headSource);
  state.calls.length = 0;
  return { ...state, publisher, ui, theme, retention, imageBytes, storageDescriptor, headSource, prepared };
}

test("Yjs publication head preserves retained transport through storage and pure acceptance", async () => {
  const state = await fixture();
  const loaded = await readPublishedCanvasLibrary(state.api, "publisher");
  assert.equal(Object.hasOwn(loaded, "retentions"), true);
  assert.deepEqual(loaded.retentions.map(({ alias }) => alias), ["ui"]);
  assert.deepEqual(loaded.retentions[0].retention.assets[0].bytes, state.imageBytes);
  const accepted = await preparePublishedLibraryRetention(loaded, [component("shell")]);
  const finalConsumer = {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, flows: [],
    imports: { publisher: imported(state.publisher) }, children: [{ id: "screen", type: "ref", ref: "publisher:shell" }],
  };
  const materialized = buildRetainedCanvasImports(finalConsumer, new Map([["publisher", accepted]]));
  assert.equal(materialized.imports.publisher.imports.ui.retained, true);
  assert.deepEqual([...materialized.assets.keys()], ["imports/publisher/imports/ui/logo.png"]);
  assert.deepEqual([...materialized.assets.get("imports/publisher/imports/ui/logo.png").bytes], [...state.imageBytes]);
  assert.equal(state.calls.every(([, documentId]) => documentId === "publisher"), true);
});

test("changed head identity, tampered envelope, and tampered retained asset fail without source fallback", async () => {
  const changedHead = await fixture();
  const changedSource = structuredClone(changedHead.headSource);
  changedSource.library.publication.releaseId = "wrong";
  changedHead.setHead(changedSource);
  await assert.rejects(readPublishedCanvasLibrary(changedHead.api, "publisher"), { code: "CANVAS_IMPORT_INTEGRITY" });

  const tamperedEnvelope = await fixture();
  const releaseBytes = tamperedEnvelope.projects.get("publisher").get(tamperedEnvelope.storageDescriptor.sha256);
  releaseBytes[releaseBytes.length - 1] ^= 1;
  await assert.rejects(readPublishedCanvasLibrary(tamperedEnvelope.api, "publisher"), { code: "CANVAS_IMPORT_INTEGRITY" });

  const tamperedAsset = await fixture();
  const envelope = JSON.parse(new TextDecoder().decode(tamperedAsset.projects.get("publisher").get(tamperedAsset.storageDescriptor.sha256)));
  const retainedStorage = envelope.content.retentions[0].retention.assets[0].storage;
  tamperedAsset.projects.get("publisher").get(retainedStorage.sha256)[0] ^= 1;
  await assert.rejects(readPublishedCanvasLibrary(tamperedAsset.api, "publisher"), { code: "CANVAS_IMPORT_INTEGRITY" });
  assert.equal(tamperedAsset.calls.every(([, documentId]) => documentId === "publisher"), true);
});

test("head-reader return mutation is detached and legacy absent retentions remain absent", async () => {
  const state = await fixture();
  const first = await readPublishedCanvasLibrary(state.api, "publisher");
  const persisted = new Uint8Array(state.projects.get("publisher").get(state.storageDescriptor.sha256));
  first.release.document.children[0].id = "mutated";
  first.retentions[0].retention.assets[0].bytes[0] = 99;
  first.publication.storage.path = "mutated";
  assert.deepEqual(state.projects.get("publisher").get(state.storageDescriptor.sha256), persisted);
  const second = await readPublishedCanvasLibrary(state.api, "publisher");
  assert.equal(second.release.document.children[0].id, "shell");
  assert.equal(second.retentions[0].retention.assets[0].bytes[0], state.imageBytes[0]);

  const legacy = await fixture({ withRetentions: false });
  const legacyRead = await readPublishedCanvasLibrary(legacy.api, "publisher");
  assert.equal(Object.hasOwn(legacyRead, "retentions"), false);
});
