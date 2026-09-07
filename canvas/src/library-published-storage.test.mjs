import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildRetainedCanvasImports } from "./library-retained-imports.mjs";
import { createLibraryRelease, releaseIdentity } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const component = (id) => ({ kind: "component", id });
const imported = (release) => ({ documentId: release.libraryId, updatePolicy: "pinned", releaseId: release.releaseId, contentHash: release.contentHash });
const dependency = (alias, release) => ({ alias, ...releaseIdentity(release) });

function document(children, publicItems, imports = {}, variables = {}) {
  return { version: "2.17", module: "generic", axes: {}, variables, paragraphStyles: {}, imports, flows: [], children, library: { public: publicItems } };
}

function backend() {
  const projects = new Map(["A", "B", "C"].map((id) => [id, new Map()]));
  const calls = [];
  const controls = { uploadFailure: null, readFailure: null, badRead: null };
  const api = {
    async uploadAsset(documentId, asset) {
      calls.push({ op: "upload", documentId, path: asset.path, mimeType: asset.mimeType, bytes: new Uint8Array(asset.bytes) });
      if (controls.uploadFailure?.(documentId, asset)) throw Object.assign(new Error("upload rejected"), { code: "QUOTA_EXCEEDED" });
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("access denied"), { code: "ACCESS_DENIED" });
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.bytes.length, mimeType: asset.mimeType };
    },
    async readAsset(documentId, descriptor) {
      calls.push({ op: "read", documentId, path: descriptor.path });
      if (controls.readFailure?.(documentId, descriptor)) throw Object.assign(new Error("read rejected"), { code: "ACCESS_DENIED" });
      if (controls.badRead?.(documentId, descriptor)) return Uint8Array.of(0);
      const bytes = projects.get(documentId)?.get(descriptor.sha256);
      if (!bytes) throw Object.assign(new Error("asset missing"), { code: "ACCESS_DENIED" });
      return new Uint8Array(bytes);
    },
  };
  return { api, projects, calls, controls };
}

async function fixture() {
  const bytes = Uint8Array.of(1, 2, 3, 4);
  const b = createLibraryRelease(document([
    { id: "card", type: "frame", fill: "${ink}", children: [{ id: "image", type: "rectangle", fill: { type: "image", url: "image.png" } }] },
    { id: "private-b", type: "frame" },
  ], [component("card")], {}, { ink: { tokenType: "color", cascade: [{ value: "#123456" }] } }), {
    libraryId: "B", releaseId: "one", assets: [{ path: "image.png", sha256: hash(bytes), size: bytes.length, mimeType: "image/png" }],
  });
  const a = createLibraryRelease(document([
    { id: "outer", type: "frame", children: [{ id: "use", type: "ref", ref: "b:card" }] },
    { id: "private-a", type: "frame" },
  ], [component("outer")], { b: imported(b) }), { libraryId: "A", releaseId: "one", dependencies: [dependency("b", b)] });
  const state = backend();
  const store = createLibraryStorage(state.api);
  await store.writeRelease("B", { release: b, assets: new Map([["image.png", bytes]]) });
  const acceptedDescriptor = await store.retainItems("A", b, [component("card")], {
    resolveRelease: async (identity) => { assert.deepEqual(identity, { documentId: "B", updatePolicy: "pinned", releaseId: "one", contentHash: b.contentHash }); return b; },
    readAsset: async () => new Uint8Array(bytes),
  });
  const accepted = await store.readRetention("A", acceptedDescriptor);
  const publication = await store.writeRelease("A", { release: a, assets: new Map(), retentions: [{ alias: "b", retention: accepted }] });
  return { state, store, b, a, publication, bytes };
}

function publicationReader(store, publication, calls = []) {
  return async (identity) => {
    calls.push(identity);
    return store.readRelease("A", publication);
  };
}

function consumerImport(release) {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {},
    imports: { accepted: imported(release) }, flows: [], children: [],
  };
}

function hasRetentionEnvelope(project) {
  return [...project.values()].some((bytes) => {
    try { return JSON.parse(new TextDecoder().decode(bytes))?.kind === "retention"; }
    catch { return false; }
  });
}

test("published retention reauthorizes A once, reads no B source, and survives A/B deletion", async () => {
  const { state, store, a, publication } = await fixture();
  const calls = [];
  state.projects.delete("B");
  state.calls.length = 0;
  const descriptor = await store.retainPublishedItems("C", a, [component("outer")], { readPublication: publicationReader(store, publication, calls) });
  assert.deepEqual(calls, [{ documentId: "A", releaseId: a.releaseId, contentHash: a.contentHash }]);
  assert.equal(state.calls.some(({ documentId }) => documentId === "B"), false);
  assert.ok(descriptor.path.startsWith("_canvas/library-content/"));

  state.projects.delete("A");
  const retained = await store.readRetention("C", descriptor);
  const materialized = buildRetainedCanvasImports(consumerImport(a), new Map([["accepted", retained]]));
  assert.deepEqual([...materialized.assets.keys()], ["imports/accepted/imports/b/image.png"]);
  assert.equal(materialized.imports.accepted.release.publicItems.length, 1);
  assert.equal(materialized.imports.accepted.release.publicItems[0].id, "outer");
});

test("published acceptance requires its explicit reader and fails closed before upload", async () => {
  const { state, store, a } = await fixture();
  state.projects.get("C").set("unrelated", Uint8Array.of(7, 7));
  await assert.rejects(store.retainPublishedItems("C", a, [component("outer")]), { code: "CANVAS_LIBRARY_PUBLICATION_READER_REQUIRED" });
  await assert.rejects(store.retainPublishedItems("C", a, [component("outer")], {
    readPublication: async () => { throw Object.assign(new Error("revoked"), { code: "ACCESS_DENIED" }); },
  }), { code: "ACCESS_DENIED" });
  assert.equal(state.projects.get("C").size, 1);
  assert.equal(state.calls.filter(({ op, documentId }) => op === "upload" && documentId === "C").length, 0);
});

test("published acceptance checks exact selected identity, accepted transport, and public items", async () => {
  const { state, store, a, b, publication } = await fixture();
  const cases = [
    ["wrong identity", async () => ({ release: b, assets: new Map(), retentions: [] }), "CANVAS_IMPORT_INTEGRITY"],
    ["missing transport", async () => { const selected = await store.readRelease("A", publication); delete selected.retentions; return selected; }, "CANVAS_IMPORT_INTEGRITY"],
    ["private item", publicationReader(store, publication), "CANVAS_LIBRARY_ITEM_PRIVATE"],
    ["corrupt accepted asset", async () => {
      const selected = await store.readRelease("A", publication);
      selected.retentions[0].retention.assets[0].bytes[0] ^= 1;
      return selected;
    }, "CANVAS_IMPORT_INTEGRITY"],
  ];
  for (const [name, reader, code] of cases) {
    state.projects.get("C").clear();
    const requested = name === "private item" ? [component("private-a")] : [component("outer")];
    await assert.rejects(store.retainPublishedItems("C", a, requested, { readPublication: reader }), { code }, name);
    assert.equal(state.projects.get("C").size, 0, `${name} published a partial receipt`);
  }
});

test("published acceptance snapshots release and requests before the publication read awaits", async () => {
  const { state, store, a, publication } = await fixture();
  let resume;
  const gate = new Promise((resolve) => { resume = resolve; });
  const requests = [component("outer")];
  const pending = store.retainPublishedItems("C", a, requests, {
    readPublication: async (identity) => { await gate; return store.readRelease("A", publication); },
  });
  requests[0].id = "private-a";
  a.document.imports = {};
  resume();
  const descriptor = await pending;
  const retained = await store.readRetention("C", descriptor);
  assert.deepEqual(retained.requestedItems, [component("outer")]);
  assert.equal(state.projects.get("C").size > 0, true);
});

test("published acceptance asset, envelope, and readback failures return no receipt", async () => {
  for (const failure of ["asset", "envelope", "readback"]) {
    const { state, store, a, publication } = await fixture();
    state.projects.get("C").set("unrelated", Uint8Array.of(9, 9));
    if (failure === "asset") state.controls.uploadFailure = (documentId, asset) => documentId === "C" && asset.mimeType === "image/png";
    if (failure === "envelope") state.controls.uploadFailure = (documentId, asset) => documentId === "C" && asset.mimeType === "application/vnd.penkra.canvas.library+json";
    if (failure === "readback") state.controls.badRead = (documentId) => documentId === "C";
    await assert.rejects(store.retainPublishedItems("C", a, [component("outer")], { readPublication: publicationReader(store, publication) }), failure === "readback" ? { code: "CANVAS_IMPORT_INTEGRITY" } : { code: "QUOTA_EXCEEDED" }, failure);
    assert.deepEqual(state.projects.get("C").get("unrelated"), Uint8Array.of(9, 9));
    assert.equal(hasRetentionEnvelope(state.projects.get("C")), false, `${failure} produced a retention receipt`);
  }
});
