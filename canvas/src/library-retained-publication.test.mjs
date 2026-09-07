import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";
import { prepareRetainedLibraryRelease } from "./library-retained-publication.mjs";

const encoder = new TextEncoder();
const bytes = Uint8Array.of(1, 2, 3);

function hash(value) { return createHash("sha256").update(value).digest("hex"); }

function canvasDocument({ children = [], imports = {}, variables = {}, paragraphStyles = {}, publicItems } = {}) {
  return {
    version: "2.17", module: "generic", axes: {}, variables, paragraphStyles, imports, flows: [], children,
    library: { public: publicItems ?? children.map(({ id }) => ({ kind: "component", id })) },
  };
}

function identity(release) {
  return { libraryId: release.libraryId, releaseId: release.releaseId, contentHash: release.contentHash };
}

function importRecord(release, retention, updatePolicy = "pinned") {
  return { documentId: release.libraryId, updatePolicy, releaseId: release.releaseId, contentHash: release.contentHash, ...(retention === undefined ? {} : { retention }) };
}

function memoryAccount() {
  const projects = new Map([["consumer", new Map()]]);
  const calls = [];
  const api = {
    async uploadAsset(documentId, asset) {
      calls.push({ operation: "uploadAsset", documentId, path: asset.path });
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("project denied"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.size, ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }) };
    },
    async readAsset(documentId, descriptor) {
      calls.push({ operation: "readAsset", documentId, path: descriptor.path });
      const value = projects.get(documentId)?.get(descriptor.sha256);
      if (!value) throw Object.assign(new Error(`missing ${documentId}/${descriptor.path}`), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return new Uint8Array(value);
    },
    async getDocument() { throw new Error("retained preparation must not read source documents"); },
    async resolveLibraryRelease() { throw new Error("retained preparation must not resolve upstream releases"); },
  };
  return { api, projects, calls };
}

async function retain(state, release, requestedItems, releases, sourceAssets = new Map()) {
  return createLibraryStorage(state.api).retainItems("consumer", release, requestedItems, {
    resolveRelease: async (record) => {
      const selected = releases.get(record.documentId);
      if (!selected) throw Object.assign(new Error(`source ${record.documentId} unavailable`), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return structuredClone(selected);
    },
    readAsset: async (releaseIdentity, descriptor) => {
      const value = sourceAssets.get(`${releaseIdentity.libraryId}/${descriptor.path}`);
      if (!value) throw Object.assign(new Error(`source asset ${releaseIdentity.libraryId}/${descriptor.path} unavailable`), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      return new Uint8Array(value);
    },
  });
}

function simpleSource() {
  const source = canvasDocument({
    children: [{ id: "card", type: "frame", fill: "${ink}", style: "body" }],
    variables: { ink: { tokenType: "color", cascade: [{ value: "#123456" }] } },
    paragraphStyles: { body: { fontSize: 16 } },
    publicItems: [{ kind: "component", id: "card" }, { kind: "paragraphStyle", id: "body" }, { kind: "variable", id: "ink" }],
  });
  return createLibraryRelease(source, { libraryId: "source", releaseId: "r1" });
}

async function retainedSimple() {
  const state = memoryAccount();
  const source = simpleSource();
  const retention = await retain(state, source, [
    { kind: "component", id: "card" }, { kind: "paragraphStyle", id: "body" }, { kind: "variable", id: "ink" },
  ], new Map([[source.libraryId, source]]));
  state.calls.length = 0;
  return { state, source, retention };
}

test("no imports returns a semantic release without any API calls", async () => {
  const state = memoryAccount();
  const ownBytes = Uint8Array.of(4, 5, 6);
  const document = canvasDocument({ children: [{ id: "card", type: "frame", fill: { type: "image", url: "card.png" } }] });
  delete document.imports;
  const result = await prepareRetainedLibraryRelease(state.api, document, { libraryId: "consumer", releaseId: "r1", assets: [{ path: "card.png", bytes: ownBytes }] });
  assert.equal(result.release.libraryId, "consumer");
  assert.deepEqual(result.release.document.imports, {});
  assert.deepEqual(result.retentions, []);
  assert.deepEqual(result.assets.get("card.png"), ownBytes);
  assert.deepEqual(state.calls, []);
  const storage = createLibraryStorage(state.api);
  const receipt = await storage.writeRelease("consumer", result);
  const roundTrip = await storage.readRelease("consumer", receipt);
  assert.deepEqual(roundTrip.release.document.imports, {});
  assert.deepEqual(roundTrip.assets.get("card.png"), ownBytes);

  for (const imports of [null, []]) {
    const malformed = canvasDocument({ children: [{ id: "card", type: "frame" }] });
    malformed.imports = imports;
    await assert.rejects(prepareRetainedLibraryRelease(state.api, malformed, { libraryId: "consumer", releaseId: "malformed" }), { code: "CANVAS_IMPORT_INTEGRITY" });
  }
});

test("one retained variable, component, and paragraph style become one direct dependency", async () => {
  const { state, source, retention } = await retainedSimple();
  const document = canvasDocument({
    imports: { ui: importRecord(source, retention) },
    children: [{ id: "screen", type: "frame", children: [
      { id: "component", type: "ref", ref: "ui:card" },
      { id: "label", type: "text", content: "Hello", style: "ui:body", fill: "${ui:ink}" },
    ] }],
  });
  const result = await prepareRetainedLibraryRelease(state.api, document, { libraryId: "consumer", releaseId: "r1" });
  assert.deepEqual(result.release.dependencies, [{ alias: "ui", ...identity(source) }]);
  assert.deepEqual(result.retentions.map(({ alias }) => alias), ["ui"]);
  assert.deepEqual(result.retentions[0].retention.root, identity(source));
  assert.deepEqual(result.release.document.imports.ui, importRecord(source, undefined));
  assert.equal(state.calls.every(({ documentId }) => documentId === "consumer"), true);
});

test("retention output is alias-sorted without mutating caller import order", async () => {
  const { state, source, retention } = await retainedSimple();
  const document = canvasDocument({
    imports: { zeta: importRecord(source, retention), alpha: importRecord(source, retention) },
    children: [{ id: "screen", type: "frame", children: [{ id: "z", type: "ref", ref: "zeta:card" }, { id: "a", type: "ref", ref: "alpha:card" }] }],
  });
  const callerOrder = Object.keys(document.imports);
  const result = await prepareRetainedLibraryRelease(state.api, document, { libraryId: "consumer", releaseId: "r1" });
  assert.deepEqual(result.retentions.map(({ alias }) => alias), ["alpha", "zeta"]);
  assert.deepEqual(Object.keys(document.imports), callerOrder);
});

test("two-level retained assets keep colliding names namespaced and dependencies direct", async () => {
  const state = memoryAccount();
  const oneBytes = Uint8Array.of(11, 12, 13);
  const twoBytes = Uint8Array.of(21, 22, 23);
  const one = createLibraryRelease(canvasDocument({
    children: [{ id: "badge", type: "frame", fill: { type: "image", url: "shared.png" } }],
  }), { libraryId: "one", releaseId: "r1", assets: [{ path: "shared.png", sha256: hash(oneBytes), size: oneBytes.length }] });
  const two = createLibraryRelease(canvasDocument({
    imports: { one: importRecord(one) },
    children: [{ id: "wrapper", type: "frame", fill: { type: "image", url: "shared.png" }, children: [{ id: "use", type: "ref", ref: "one:badge" }] }],
  }), { libraryId: "two", releaseId: "r1", dependencies: [{ alias: "one", ...identity(one) }], assets: [{ path: "shared.png", sha256: hash(twoBytes), size: twoBytes.length }] });
  const retention = await retain(state, two, [{ kind: "component", id: "wrapper" }], new Map([[two.libraryId, two], [one.libraryId, one]]), new Map([["one/shared.png", oneBytes], ["two/shared.png", twoBytes]]));
  state.calls.length = 0;
  const document = canvasDocument({ imports: { lib: importRecord(two, retention) }, children: [{ id: "screen", type: "ref", ref: "lib:wrapper" }] });
  const result = await prepareRetainedLibraryRelease(state.api, document, { libraryId: "consumer", releaseId: "r1", assets: [] });
  assert.deepEqual(result.release.dependencies, [{ alias: "lib", ...identity(two) }]);
  assert.deepEqual(result.retentions[0].retention.assets.map(({ release, path }) => `${release.libraryId}:${path}`).sort(), ["one:shared.png", "two:shared.png"]);
  assert.equal(state.calls.every(({ documentId }) => documentId === "consumer"), true);
});

test("source deletion after retention does not cause upstream reads or writes", async () => {
  const { state, source, retention } = await retainedSimple();
  state.projects.delete("source");
  const document = canvasDocument({ imports: { ui: importRecord(source, retention) }, children: [{ id: "screen", type: "ref", ref: "ui:card" }] });
  const result = await prepareRetainedLibraryRelease(state.api, document, { libraryId: "consumer", releaseId: "r2" });
  assert.equal(result.release.dependencies[0].libraryId, "source");
  assert.equal(state.calls.some(({ operation }) => operation === "uploadAsset"), false);
  assert.equal(state.calls.every(({ documentId }) => documentId === "consumer"), true);
});

test("missing retention and missing accepted identity fail before any storage read", async () => {
  const state = memoryAccount();
  const source = simpleSource();
  const missingRetention = canvasDocument({ imports: { ui: importRecord(source) }, children: [] });
  await assert.rejects(prepareRetainedLibraryRelease(state.api, missingRetention, { libraryId: "consumer", releaseId: "r1" }), { code: "CANVAS_IMPORT_RETENTION_REQUIRED" });
  assert.deepEqual(state.calls, []);
  const missingIdentity = canvasDocument({ imports: { ui: { documentId: source.libraryId, updatePolicy: "follow", retention: { path: "_canvas/library-content/" + "0".repeat(64), sha256: "0".repeat(64), size: 0 } } }, children: [] });
  await assert.rejects(prepareRetainedLibraryRelease(state.api, missingIdentity, { libraryId: "consumer", releaseId: "r1" }), { code: "CANVAS_IMPORT_INTEGRITY" });
  assert.deepEqual(state.calls, []);
});

test("wrong accepted identity, private reference, and retained cycle reject through validators", async () => {
  const { state, source, retention } = await retainedSimple();
  const wrong = canvasDocument({ imports: { ui: importRecord({ ...source, contentHash: "f".repeat(64) }, retention) }, children: [] });
  await assert.rejects(prepareRetainedLibraryRelease(state.api, wrong, { libraryId: "consumer", releaseId: "r1" }), { code: "CANVAS_IMPORT_INTEGRITY" });

  const privateReference = canvasDocument({ imports: { ui: importRecord(source, retention) }, children: [{ id: "screen", type: "ref", ref: "ui:secret" }] });
  await assert.rejects(prepareRetainedLibraryRelease(state.api, privateReference, { libraryId: "consumer", releaseId: "r1" }), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });

  const validBundle = await createLibraryStorage(state.api).readRetention("consumer", retention);
  const cycle = structuredClone(validBundle);
  cycle.items[0].content.dependencies.push({ alias: "self", ...cycle.root });
  cycle.items[0].item.contentHash = hash(canonical(cycle.items[0].content));
  const cycleBytes = encoder.encode(JSON.stringify({ schema: "com.penkra.canvas.stored-library/1", kind: "retention", content: cycle }));
  const cycleHash = hash(cycleBytes);
  state.projects.get("consumer").set(cycleHash, cycleBytes);
  const cycleDescriptor = { path: `_canvas/library-content/${cycleHash}`, sha256: cycleHash, size: cycleBytes.length, mimeType: "application/vnd.penkra.canvas.library+json" };
  const cyclicDocument = canvasDocument({ imports: { ui: importRecord(source, cycleDescriptor) }, children: [] });
  await assert.rejects(prepareRetainedLibraryRelease(state.api, cyclicDocument, { libraryId: "consumer", releaseId: "r1" }), { code: "CANVAS_IMPORT_CYCLE" });
});

test("retention locator and publication head are transport-only, while accepted content changes identity", async () => {
  const first = await retainedSimple();
  const baseDocument = canvasDocument({
    imports: { ui: importRecord(first.source, first.retention) },
    children: [{ id: "screen", type: "ref", ref: "ui:card" }],
  });
  baseDocument.library.publication = { releaseId: "old", contentHash: "0".repeat(64), storage: { path: "ignored", sha256: "ignored", size: 0 } };
  const firstResult = await prepareRetainedLibraryRelease(first.state.api, baseDocument, { libraryId: "consumer", releaseId: "r1" });
  const changedHead = structuredClone(baseDocument);
  changedHead.library.publication.releaseId = "new";
  changedHead.imports.ui.retention = structuredClone(first.retention);
  const secondResult = await prepareRetainedLibraryRelease(first.state.api, changedHead, { libraryId: "consumer", releaseId: "r1" });
  assert.equal(firstResult.release.contentHash, secondResult.release.contentHash);

  const changedSourceDocument = structuredClone(first.source.document);
  changedSourceDocument.variables.ink.cascade[0].value = "#abcdef";
  const changedSource = createLibraryRelease(changedSourceDocument, { libraryId: "source", releaseId: "r2" });
  const changedState = memoryAccount();
  const changedRetention = await retain(changedState, changedSource, [{ kind: "component", id: "card" }, { kind: "paragraphStyle", id: "body" }, { kind: "variable", id: "ink" }], new Map([[changedSource.libraryId, changedSource]]));
  const changedDocument = canvasDocument({ imports: { ui: importRecord(changedSource, changedRetention) }, children: [{ id: "screen", type: "ref", ref: "ui:card" }] });
  const changedResult = await prepareRetainedLibraryRelease(changedState.api, changedDocument, { libraryId: "consumer", releaseId: "r1" });
  assert.notEqual(firstResult.release.contentHash, changedResult.release.contentHash);
  assert.notDeepEqual(firstResult.release.dependencies, changedResult.release.dependencies);
});

test("owned bytes and caller inputs are snapshotted across awaits and result mutations detach them", async () => {
  const { state, source, retention } = await retainedSimple();
  const originalRetentionPath = retention.path;
  const ownBytes = Uint8Array.of(7, 8, 9);
  const document = canvasDocument({ imports: { ui: importRecord(source, structuredClone(retention)) }, children: [{ id: "screen", type: "frame", fill: { type: "image", url: "own.png" }, children: [{ id: "use", type: "ref", ref: "ui:card" }] }] });
  const assets = [{ path: "own.png", bytes: ownBytes, mimeType: "image/png" }];
  let releaseRead;
  const gate = new Promise((resolve) => { releaseRead = resolve; });
  const originalRead = state.api.readAsset;
  const api = { ...state.api, readAsset: async (...args) => { await gate; return originalRead(...args); } };
  const pending = prepareRetainedLibraryRelease(api, document, { libraryId: "consumer", releaseId: "r1", assets });
  document.children[0].children[0].ref = "ui:missing";
  document.imports.ui.retention.path = "changed";
  assets[0].path = "changed.png";
  ownBytes[0] = 99;
  releaseRead();
  const result = await pending;
  assert.deepEqual(result.assets.get("own.png"), Uint8Array.of(7, 8, 9));
  assert.equal(result.release.document.children[0].children[0].ref, "ui:card");
  assert.equal(result.release.document.imports.ui.retention, undefined);
  result.release.document.children[0].children[0].ref = "mutated";
  result.assets.get("own.png")[0] = 55;
  result.retentions[0].retention.root.libraryId = "mutated";
  assert.equal(document.children[0].children[0].ref, "ui:missing");
  assert.equal(assets[0].path, "changed.png");
  assert.equal(source.libraryId, "source");
  assert.equal(retention.path, originalRetentionPath);
});

function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}

test("malformed owned assets are rejected before retained reads", async () => {
  const state = memoryAccount();
  const source = simpleSource();
  const document = canvasDocument({ imports: { ui: importRecord(source, { path: "_canvas/library-content/" + "0".repeat(64), sha256: "0".repeat(64), size: 0 }) }, children: [] });
  await assert.rejects(prepareRetainedLibraryRelease(state.api, document, { libraryId: "consumer", releaseId: "r1", assets: [{ path: "x", bytes: "not-bytes" }] }), { code: "CANVAS_LIBRARY_INVALID" });
  assert.deepEqual(state.calls, []);
  await assert.rejects(prepareRetainedLibraryRelease(state.api, canvasDocument(), { libraryId: "consumer", releaseId: "r1", assets: [{ path: "x", bytes }, { path: "x", bytes }] }), { code: "CANVAS_LIBRARY_INVALID" });
});
