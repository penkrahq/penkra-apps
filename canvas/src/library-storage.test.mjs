import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage, isLibraryStorageAsset } from "./library-storage.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const requested = [{ kind: "component", id: "card" }];
function fixture() {
  const bytes = Uint8Array.of(1, 2, 3);
  const release = createLibraryRelease({
    axes: {}, imports: {}, paragraphStyles: {},
    variables: { ink: { tokenType: "color", cascade: [{ value: "#123456" }] }, secret: { tokenType: "string", cascade: [{ value: "not-retained" }] } },
    library: { public: requested },
    children: [{ id: "card", type: "frame", fill: "${ink}", children: [{ id: "image", type: "rectangle", fill: { type: "image", url: "used.png" } }] }, { id: "private-node", type: "frame" }],
  }, { libraryId: "source", releaseId: "one", assets: [{ path: "used.png", size: 3, sha256: hash(bytes), mimeType: "image/png" }] });
  return { release, assets: new Map([["used.png", bytes]]) };
}

// Protocol-level storage double, not evidence of a running backend or migration.
function backend() {
  const projects = new Map([["source", new Map()], ["consumer", new Map()]]);
  const calls = [];
  const api = {
    async uploadAsset(documentId, asset) {
      calls.push(["upload", documentId, asset.path]);
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("denied"), { code: "ACCESS_DENIED" });
      assert.equal(hash(asset.bytes), asset.sha256);
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.bytes.length, mimeType: asset.mimeType };
    },
    async readAsset(documentId, descriptor) {
      calls.push(["read", documentId, descriptor.path]);
      const bytes = projects.get(documentId)?.get(descriptor.sha256);
      if (!bytes) throw Object.assign(new Error("denied"), { code: "ACCESS_DENIED" });
      return new Uint8Array(bytes);
    },
  };
  return { api, projects, calls };
}

test("release blobs round-trip through the public asset protocol with readback and a fresh adapter", async () => {
  const prepared = fixture();
  const state = backend();
  const descriptor = await createLibraryStorage(state.api).writeRelease("source", prepared);
  assert.equal(isLibraryStorageAsset(descriptor), true);
  assert.equal(state.calls.filter(([op]) => op === "upload").length, 2);
  assert.equal(state.calls.filter(([op]) => op === "read").length, 2);
  assert.deepEqual(await createLibraryStorage(state.api).readRelease("source", descriptor), prepared);
  const repeated = await createLibraryStorage(state.api).writeRelease("source", prepared);
  assert.deepEqual(repeated, descriptor);
  assert.equal(state.projects.get("source").size, 2);
  await assert.rejects(createLibraryStorage(state.api).writeRelease("consumer", prepared), { code: "CANVAS_LIBRARY_INVALID" });
});

test("acceptance copies only the public closure and consumer reads do not revisit a deleted source", async () => {
  const prepared = fixture();
  const state = backend();
  const store = createLibraryStorage(state.api);
  let rootReads = 0;
  const descriptor = await store.retainItems("consumer", prepared.release, requested, {
    resolveRelease: async (record) => { rootReads++; assert.equal(record.documentId, "source"); return prepared.release; },
    readAsset: async () => prepared.assets.get("used.png"),
  });
  assert.equal(rootReads, 1);
  const storedJson = new TextDecoder().decode(state.projects.get("consumer").get(descriptor.sha256));
  assert.equal(storedJson.includes("not-retained"), false);
  assert.equal(storedJson.includes("private-node"), false);
  assert.equal(storedJson.includes('"document"'), false);
  state.projects.delete("source");
  prepared.release.document.children.length = 0;
  const callCount = state.calls.length;
  const retained = await createLibraryStorage(state.api).readRetention("consumer", descriptor);
  assert.deepEqual(retained.items[0].content.resources.map(([key]) => key), ["component:card", "variable:ink"]);
  assert.deepEqual(retained.assets[0].bytes, Uint8Array.of(1, 2, 3));
  assert.ok(state.calls.slice(callCount).every(([, project]) => project === "consumer"));
  state.projects.delete("consumer");
  await assert.rejects(store.readRetention("consumer", descriptor), { code: "ACCESS_DENIED" });
});

test("new acceptance reauthorizes the root and rejects private requests before any upload", async () => {
  const prepared = fixture();
  const state = backend();
  const store = createLibraryStorage(state.api);
  await assert.rejects(store.retainItems("consumer", prepared.release, requested, {
    resolveRelease: async () => { throw Object.assign(new Error("revoked"), { code: "ACCESS_DENIED" }); },
  }), { code: "ACCESS_DENIED" });
  await assert.rejects(store.retainItems("consumer", prepared.release, [{ kind: "component", id: "private-node" }], {
    resolveRelease: async () => prepared.release,
  }), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  await assert.rejects(store.retainItems("consumer", prepared.release, requested, {}), { code: "CANVAS_IMPORT_RELEASE_RESOLVER_REQUIRED" });
  assert.deepEqual(state.calls, []);
});

test("failed upload or readback never returns a publication receipt", async () => {
  for (const failure of ["upload", "readback", "receipt"]) {
    const prepared = fixture();
    const state = backend();
    const api = { ...state.api };
    if (failure === "upload") api.uploadAsset = async () => { throw Object.assign(new Error("quota"), { code: "QUOTA_EXCEEDED" }); };
    if (failure === "readback") api.readAsset = async () => Uint8Array.of(9, 9, 9);
    if (failure === "receipt") api.uploadAsset = async () => ({ path: "wrong", sha256: "0".repeat(64), size: 3 });
    await assert.rejects(createLibraryStorage(api).writeRelease("source", prepared), { code: failure === "upload" ? "QUOTA_EXCEEDED" : "CANVAS_IMPORT_INTEGRITY" });
    assert.ok(state.projects.get("source").size <= 1, "manifest was not written after asset failure");
  }
});

test("stored bytes and descriptors are integrity checked and release/retention kinds cannot be confused", async () => {
  const state = backend();
  const store = createLibraryStorage(state.api);
  const descriptor = await store.writeRelease("source", fixture());
  for (const mutate of [value => { value.path = "../escape"; }, value => { value.size++; }, value => { value.sha256 = "0".repeat(64); }]) {
    const changed = structuredClone(descriptor); mutate(changed);
    await assert.rejects(store.readRelease("source", changed), { code: "CANVAS_IMPORT_INTEGRITY" });
  }
  await assert.rejects(store.readRetention("source", descriptor), { code: "CANVAS_IMPORT_INTEGRITY" });
  state.projects.get("source").get(descriptor.sha256)[0] ^= 1;
  await assert.rejects(store.readRelease("source", descriptor), { code: "CANVAS_IMPORT_INTEGRITY" });
});

test("release inputs are snapshotted before asynchronous storage", async () => {
  const prepared = fixture();
  const expected = structuredClone(prepared);
  const state = backend();
  let resume;
  const gate = new Promise(resolve => { resume = resolve; });
  const api = { ...state.api, uploadAsset: async (...args) => { await gate; return state.api.uploadAsset(...args); } };
  const pending = createLibraryStorage(api).writeRelease("source", prepared);
  prepared.release.document.children.length = 0;
  prepared.assets.get("used.png")[0] = 99;
  resume();
  assert.deepEqual(await createLibraryStorage(state.api).readRelease("source", await pending), expected);
});

async function retainedState() {
  const prepared = fixture();
  const state = backend();
  const store = createLibraryStorage(state.api);
  const descriptor = await store.retainItems("consumer", prepared.release, requested, {
    resolveRelease: async () => prepared.release,
    readAsset: async () => prepared.assets.get("used.png"),
  });
  const envelope = JSON.parse(new TextDecoder().decode(state.projects.get("consumer").get(descriptor.sha256)));
  return { prepared, state, store, descriptor, content: envelope.content };
}

async function uploadRetentionContent(state, content) {
  const bytes = new TextEncoder().encode(JSON.stringify({ schema: "com.penkra.canvas.stored-library/1", kind: "retention", content }));
  const sha256 = hash(bytes);
  const descriptor = { path: `_canvas/library-content/${sha256}`, sha256, size: bytes.length, mimeType: "application/vnd.penkra.canvas.library+json" };
  await state.api.uploadAsset("consumer", { ...descriptor, bytes });
  return descriptor;
}

test("readRetention rejects malformed and minimally hashed envelopes at the storage boundary", async () => {
  const state = backend();
  const cases = [
    ["empty content", {}],
    ["exact empty identity repro", { root: {}, items: [{}], requestedItems: [{}], assets: [] }],
    ["missing root", { items: [], requestedItems: [], assets: [] }],
    ["empty requests", { root: { libraryId: "source", releaseId: "one", contentHash: "0".repeat(64) }, items: [], requestedItems: [], assets: [] }],
    ["empty items", { root: { libraryId: "source", releaseId: "one", contentHash: "0".repeat(64) }, items: [], requestedItems: [{ kind: "component", id: "card" }], assets: [] }],
  ];
  for (const [name, content] of cases) {
    const descriptor = await uploadRetentionContent(state, content);
    await assert.rejects(createLibraryStorage(state.api).readRetention("consumer", descriptor), { code: "CANVAS_IMPORT_INTEGRITY" }, name);
  }
});

test("readRetention validates item hashes, duplicate identities, conflicting releases, and duplicate assets", async () => {
  const { state, content } = await retainedState();
  const cases = [
    ["tampered item hash", value => { value.items[0].item.contentHash = "0".repeat(64); }],
    ["duplicate item", value => { value.items.push(structuredClone(value.items[0])); }],
    ["conflicting release identity", value => { value.items.push({ ...structuredClone(value.items[0]), release: { ...value.items[0].release, contentHash: "f".repeat(64) } }); }],
    ["duplicate asset", value => { value.assets.push(structuredClone(value.assets[0])); }],
  ];
  for (const [name, mutate] of cases) {
    const candidate = structuredClone(content);
    mutate(candidate);
    const descriptor = await uploadRetentionContent(state, candidate);
    await assert.rejects(createLibraryStorage(state.api).readRetention("consumer", descriptor), { code: "CANVAS_IMPORT_INTEGRITY" }, name);
  }
});

test("readRetention rejects missing dependency and asset closure, while accepting private local closure", async () => {
  const { state, content, descriptor: original } = await retainedState();
  const missingDependency = structuredClone(content);
  const item = missingDependency.items[0];
  item.content.dependencies = [{ alias: "missing", libraryId: "missing", releaseId: "one", contentHash: "1".repeat(64) }];
  item.item.contentHash = hashCanonical(item.content);
  const dependencyDescriptor = await uploadRetentionContent(state, missingDependency);
  await assert.rejects(createLibraryStorage(state.api).readRetention("consumer", dependencyDescriptor), { code: "CANVAS_IMPORT_INTEGRITY" });

  const missingAsset = structuredClone(content);
  missingAsset.assets = [];
  const assetDescriptor = await uploadRetentionContent(state, missingAsset);
  await assert.rejects(createLibraryStorage(state.api).readRetention("consumer", assetDescriptor), { code: "CANVAS_IMPORT_INTEGRITY" });

  const valid = await createLibraryStorage(state.api).readRetention("consumer", original);
  assert.equal(valid.items[0].content.resources.some(([key]) => key === "variable:ink"), true);
  assert.equal(valid.items[0].content.resources.some(([key]) => key === "secret"), false);
});

test("readRetention restores detached bytes and does not authorize or reread the deleted source", async () => {
  const { state, store, descriptor } = await retainedState();
  state.projects.delete("source");
  const first = await store.readRetention("consumer", descriptor);
  first.assets[0].bytes[0] = 99;
  const second = await store.readRetention("consumer", descriptor);
  assert.deepEqual(second.assets[0].bytes, Uint8Array.of(1, 2, 3));
  assert.equal(state.calls.filter(([op, project]) => op === "read" && project === "source").length, 0, "retained read revisited source");
});

function hashCanonical(value) { return hash(Buffer.from(canonical(value))); }
function canonical(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
