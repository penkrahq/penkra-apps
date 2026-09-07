import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { resolveCanvasDocument } from "./canvas-resolver.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";
import { loadRetainedCanvasImports } from "./library-retained-loader.mjs";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");

function fixture() {
  const bytes = Uint8Array.of(1, 2, 3);
  const release = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {},
    library: { public: [{ kind: "component", id: "card" }] },
    children: [{ id: "card", type: "frame", fill: { type: "image", url: "card.png" }, children: [] }],
  }, { libraryId: "source", releaseId: "r1", assets: [{ path: "card.png", size: 3, sha256: hash(bytes), mimeType: "image/png" }] });
  return { release, bytes };
}

function backend() {
  const projects = new Map([["consumer", new Map()]]);
  const calls = [];
  const api = {
    async uploadAsset(documentId, asset) {
      calls.push(["upload", documentId, asset.path]);
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("denied"), { code: "ACCESS_DENIED" });
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.size, mimeType: asset.mimeType };
    },
    async readAsset(documentId, descriptor) {
      calls.push(["read", documentId, descriptor.path]);
      const bytes = projects.get(documentId)?.get(descriptor.sha256);
      if (!bytes) throw Object.assign(new Error("denied"), { code: "ACCESS_DENIED" });
      return new Uint8Array(bytes);
    },
    async resolveLibraryRelease() { throw new Error("loader must not resolve source releases"); },
  };
  return { api, projects, calls };
}

async function accepted() {
  const prepared = fixture();
  const state = backend();
  const receipt = await createLibraryStorage(state.api).retainItems("consumer", prepared.release, [{ kind: "component", id: "card" }], {
    resolveRelease: async record => {
      assert.deepEqual(record, { documentId: "source", updatePolicy: "pinned", releaseId: "r1", contentHash: prepared.release.contentHash });
      return prepared.release;
    },
    readAsset: async () => new Uint8Array(prepared.bytes),
  });
  return { ...prepared, state, receipt };
}

function consumer(release, receipt, updatePolicy = "pinned") {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, flows: [],
    imports: { first: { documentId: release.libraryId, updatePolicy, releaseId: release.releaseId, contentHash: release.contentHash, retention: receipt } },
    children: [{ id: "use", type: "ref", ref: "first:card" }],
  };
}

test("fresh loader reads accepted receipts from consumer storage after source deletion and resolves assets", async () => {
  const { release, state, receipt } = await accepted();
  const original = consumer(release, receipt);
  const serialized = JSON.parse(JSON.stringify(original));
  state.projects.delete("source");
  const loaded = await loadRetainedCanvasImports(state.api, serialized, { documentId: "consumer" });
  assert.deepEqual([...loaded.assets.keys()], ["imports/first/card.png"]);
  assert.deepEqual([...loaded.assets.get("imports/first/card.png").bytes], [1, 2, 3]);
  const resolved = resolveCanvasDocument(serialized, { imports: loaded.imports }).document;
  assert.equal(resolved.children[0].fill.url, "imports/first/card.png");
  assert.equal(state.calls.some(([op, project]) => op === "read" && project === "source"), false);
});

test("two accepted aliases share one receipt but retain separate output asset namespaces", async () => {
  const { release, state, receipt } = await accepted();
  const document = consumer(release, receipt);
  document.imports.second = { ...document.imports.first };
  document.children.push({ id: "use-two", type: "ref", ref: "second:card" });
  const loaded = await loadRetainedCanvasImports(state.api, JSON.parse(JSON.stringify(document)), { documentId: "consumer" });
  assert.deepEqual([...loaded.assets.keys()].sort(), ["imports/first/card.png", "imports/second/card.png"]);
});

test("missing retention, malformed descriptor, follow without accepted IDs, and root mismatch fail before source fallback", async () => {
  const { release, state, receipt } = await accepted();
  const missing = consumer(release, receipt);
  delete missing.imports.first.retention;
  await assert.rejects(loadRetainedCanvasImports(state.api, missing, { documentId: "consumer" }), { code: "CANVAS_IMPORT_RETENTION_REQUIRED" });
  const malformed = consumer(release, { ...receipt, path: "wrong" });
  await assert.rejects(loadRetainedCanvasImports(state.api, malformed, { documentId: "consumer" }), { code: "CANVAS_IMPORT_INTEGRITY" });
  const follow = consumer(release, receipt, "follow");
  delete follow.imports.first.releaseId; delete follow.imports.first.contentHash;
  await assert.rejects(loadRetainedCanvasImports(state.api, follow, { documentId: "consumer" }), { code: "CANVAS_IMPORT_INTEGRITY" });
  const mismatch = consumer({ ...release, libraryId: "other" }, receipt);
  await assert.rejects(loadRetainedCanvasImports(state.api, mismatch, { documentId: "consumer" }), { code: "CANVAS_IMPORT_INTEGRITY" });
  assert.equal(state.calls.filter(([op]) => op === "resolve").length, 0);
});

test("corrupt and truncated accepted descriptors fail at consumer storage, and consumer revocation denies reads", async () => {
  for (const alter of [receipt => ({ ...receipt, size: receipt.size + 1 }), receipt => ({ ...receipt, size: Math.max(0, receipt.size - 1) })]) {
    const { release, state, receipt } = await accepted();
    await assert.rejects(loadRetainedCanvasImports(state.api, consumer(release, alter(receipt)), { documentId: "consumer" }), { code: "CANVAS_IMPORT_INTEGRITY" });
  }
  const { release, state, receipt } = await accepted();
  state.projects.get("consumer").get(receipt.sha256)[0] ^= 1;
  await assert.rejects(loadRetainedCanvasImports(state.api, consumer(release, receipt), { documentId: "consumer" }), { code: "CANVAS_IMPORT_INTEGRITY" });
  const revoked = await accepted();
  revoked.state.projects.delete("consumer");
  await assert.rejects(loadRetainedCanvasImports(revoked.state.api, consumer(revoked.release, revoked.receipt), { documentId: "consumer" }), { code: "ACCESS_DENIED" });
});

test("loader snapshots the consumer selection before an awaited receipt read", async () => {
  const { release, state, receipt } = await accepted();
  const document = consumer(release, receipt);
  const originalRead = state.api.readAsset;
  let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  const api = { ...state.api, readAsset: async (...args) => { await gate; return originalRead(...args); } };
  const pending = loadRetainedCanvasImports(api, document, { documentId: "consumer" });
  document.imports.first.releaseId = "changed";
  document.imports.first.retention.path = "changed";
  resume();
  const loaded = await pending;
  assert.ok(loaded.imports.first);
});

test("empty imports return an empty shape without network access, and consumerId is required", async () => {
  const api = { uploadAsset: async () => assert.fail("network"), readAsset: async () => assert.fail("network") };
  const empty = await loadRetainedCanvasImports(api, { imports: {} }, { documentId: "consumer" });
  assert.deepEqual(Object.keys(empty.imports), []);
  assert.equal(empty.assets.size, 0);
  assert.deepEqual(empty.releases, []);
  await assert.rejects(loadRetainedCanvasImports(api, { imports: {} }, {}), { code: "CANVAS_IMPORT_INTEGRITY" });
});
