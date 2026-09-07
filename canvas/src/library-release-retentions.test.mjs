import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { buildRetainedCanvasImports } from "./library-retained-imports.mjs";
import { createLibraryRelease, releaseIdentity } from "./library-publication.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";
import { createLibraryStorage } from "./library-storage.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const text = (value) => new TextDecoder().decode(value);
const identity = (release) => releaseIdentity(release);

function backend({ gateFirstUpload = false } = {}) {
  const projects = new Map([["publisher", new Map()]]);
  const calls = [];
  let resume;
  const gate = gateFirstUpload ? new Promise((resolve) => { resume = resolve; }) : null;
  let uploads = 0;
  const controls = { uploadError: null, zeroReads: false };
  const api = {
    async uploadAsset(documentId, asset) {
      calls.push({ op: "upload", documentId, path: asset.path });
      if (gate && uploads++ === 0) await gate;
      if (controls.uploadError) throw Object.assign(new Error("upload failure"), { code: controls.uploadError });
      const project = projects.get(documentId);
      if (!project) throw Object.assign(new Error("source access is forbidden"), { code: "ACCESS_DENIED" });
      project.set(asset.sha256, new Uint8Array(asset.bytes));
      return { path: asset.path, sha256: asset.sha256, size: asset.bytes.length, mimeType: asset.mimeType };
    },
    async readAsset(documentId, descriptor) {
      calls.push({ op: "read", documentId, path: descriptor.path });
      if (controls.zeroReads) return new Uint8Array();
      const bytes = projects.get(documentId)?.get(descriptor.sha256);
      if (!bytes) throw Object.assign(new Error("missing stored blob"), { code: "ACCESS_DENIED" });
      return new Uint8Array(bytes);
    },
  };
  return { api, projects, calls, controls, resume: resume ?? (() => {}) };
}

async function fixture() {
  const imageBytes = Uint8Array.of(1, 2, 3, 4);
  const theme = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: { accent: { tokenType: "color", cascade: [{ value: "#123456" }] } },
    paragraphStyles: {}, imports: {}, flows: [], library: { public: [{ kind: "variable", id: "accent" }] }, children: [],
  }, { libraryId: "theme", releaseId: "one" });
  const ui = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {},
    imports: { theme: { documentId: theme.libraryId, updatePolicy: "pinned", releaseId: theme.releaseId, contentHash: theme.contentHash } }, flows: [],
    library: { public: [{ kind: "component", id: "card" }] },
    children: [{ id: "card", type: "frame", fill: "${theme:accent}", children: [{ id: "logo", type: "rectangle", fill: { type: "image", url: "logo.png" } }] }],
  }, { libraryId: "ui", releaseId: "one", dependencies: [{ alias: "theme", ...identity(theme) }], assets: [{ path: "logo.png", sha256: hash(imageBytes), size: imageBytes.length, mimeType: "image/png" }] });
  const publisher = createLibraryRelease({
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {},
    imports: { ui: { documentId: ui.libraryId, updatePolicy: "pinned", releaseId: ui.releaseId, contentHash: ui.contentHash } }, flows: [],
    library: { public: [{ kind: "component", id: "shell" }] },
    children: [{ id: "shell", type: "frame", children: [{ id: "use", type: "ref", ref: "ui:card" }] }],
  }, { libraryId: "publisher", releaseId: "one", dependencies: [{ alias: "ui", ...identity(ui) }] });
  const retention = await prepareLibraryRetention(ui, [{ kind: "component", id: "card" }], {
    resolveRelease: async ({ documentId }) => { assert.equal(documentId, theme.libraryId); return theme; },
    readAsset: async (release, descriptor) => { assert.equal(release.libraryId, ui.libraryId); assert.equal(descriptor.path, "logo.png"); return imageBytes; },
  });
  return { publisher, ui, theme, retention, imageBytes, prepared: { release: publisher, assets: new Map(), retentions: [{ alias: "ui", retention }] } };
}

function envelopeBytes(content) {
  const bytes = new TextEncoder().encode(JSON.stringify({ schema: "com.penkra.canvas.stored-library/1", kind: "release", content }));
  return { bytes, descriptor: { path: `_canvas/library-content/${hash(bytes)}`, sha256: hash(bytes), size: bytes.length, mimeType: "application/vnd.penkra.canvas.library+json" } };
}

async function uploadEnvelope(state, content) {
  const envelope = envelopeBytes(content);
  await state.api.uploadAsset("publisher", { ...envelope.descriptor, bytes: envelope.bytes });
  return envelope.descriptor;
}

function releaseEnvelope(state, descriptor) {
  return JSON.parse(text(state.projects.get("publisher").get(descriptor.sha256)));
}

test("write/read release transports nested retention assets without source access", async () => {
  const { prepared, publisher, retention, imageBytes } = await fixture();
  const state = backend();
  const descriptor = await createLibraryStorage(state.api).writeRelease("publisher", prepared);
  const stored = releaseEnvelope(state, descriptor);
  assert.equal(Object.hasOwn(stored.content, "retentions"), true);
  assert.equal(stored.content.retentions.length, 1);
  assert.equal(Object.hasOwn(stored.content.retentions[0].retention.assets[0], "bytes"), false);
  assert.equal(stored.content.retentions[0].retention.assets[0].storage.path.startsWith("_canvas/library-content/"), true);
  const loaded = await createLibraryStorage(state.api).readRelease("publisher", descriptor);
  assert.deepEqual(loaded.retentions[0].retention.assets[0].bytes, imageBytes);
  const built = buildRetainedCanvasImports(loaded.release.document, new Map(loaded.retentions.map(({ alias, retention: value }) => [alias, value])));
  assert.deepEqual([...built.assets.keys()], ["imports/ui/logo.png"]);
  assert.equal(loaded.release.contentHash, publisher.contentHash);
  assert.ok(state.calls.every(({ documentId }) => documentId === "publisher"));
});

test("legacy absent transport and explicit empty transport preserve their contracts", async () => {
  const { publisher } = await fixture();
  const state = backend();
  const store = createLibraryStorage(state.api);
  const legacy = await store.writeRelease("publisher", { release: publisher, assets: new Map() });
  const legacyRead = await store.readRelease("publisher", legacy);
  assert.equal(Object.hasOwn(legacyRead, "retentions"), false);

  const noImports = createLibraryRelease({ version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], library: { public: [{ kind: "component", id: "card" }] }, children: [{ id: "card", type: "frame" }] }, { libraryId: "publisher", releaseId: "empty" });
  const explicit = await store.writeRelease("publisher", { release: noImports, assets: new Map(), retentions: [] });
  const explicitRead = await store.readRelease("publisher", explicit);
  assert.deepEqual(explicitRead.retentions, []);
});

test("retention transport and all bytes are snapshotted before the first upload await", async () => {
  const { prepared, retention, imageBytes } = await fixture();
  const expected = structuredClone(prepared);
  const state = backend({ gateFirstUpload: true });
  const pending = createLibraryStorage(state.api).writeRelease("publisher", prepared);
  prepared.release.document.imports.ui.releaseId = "changed";
  prepared.retentions[0].retention.assets[0].bytes[0] = 99;
  imageBytes[0] = 88;
  state.resume();
  const descriptor = await pending;
  const loaded = await createLibraryStorage(state.api).readRelease("publisher", descriptor);
  assert.equal(loaded.release.document.imports.ui.releaseId, expected.release.document.imports.ui.releaseId);
  assert.deepEqual(loaded.retentions[0].retention.assets[0].bytes, expected.retentions[0].retention.assets[0].bytes);
  assert.notDeepEqual(loaded.retentions[0].retention.assets[0].bytes, retention.assets[0].bytes);
});

test("malformed transport rejects with integrity and publishes no release envelope", async () => {
  const { prepared } = await fixture();
  const cases = [
    ["missing alias", []],
    ["extra alias", [...prepared.retentions, { alias: "extra", retention: structuredClone(prepared.retentions[0].retention) }]],
    ["duplicate alias", [...prepared.retentions, structuredClone(prepared.retentions[0])]],
    ["wrong root", [{ alias: "ui", retention: { ...structuredClone(prepared.retentions[0].retention), root: { ...prepared.retentions[0].retention.root, releaseId: "wrong" } } }]],
    ["bad item hash", [{ alias: "ui", retention: (() => { const value = structuredClone(prepared.retentions[0].retention); value.items[0].item.contentHash = "0".repeat(64); return value; })() }]],
    ["corrupt bytes", [{ alias: "ui", retention: (() => { const value = structuredClone(prepared.retentions[0].retention); value.assets[0].bytes[0] ^= 1; return value; })() }]],
    ["truncated bytes", [{ alias: "ui", retention: (() => { const value = structuredClone(prepared.retentions[0].retention); value.assets[0].bytes = value.assets[0].bytes.slice(0, 1); return value; })() }]],
    ["missing dependency closure", [{ alias: "ui", retention: (() => { const value = structuredClone(prepared.retentions[0].retention); value.items = value.items.filter(({ release }) => release.libraryId !== "theme"); return value; })() }]],
  ];
  for (const [name, retentions] of cases) {
    const state = backend();
    const unrelated = Uint8Array.of(7, 7, 7);
    state.projects.get("publisher").set("unrelated", unrelated);
    await assert.rejects(createLibraryStorage(state.api).writeRelease("publisher", { release: prepared.release, assets: new Map(), retentions }), { code: "CANVAS_IMPORT_INTEGRITY" }, name);
    assert.deepEqual(state.projects.get("publisher").get("unrelated"), unrelated, name);
    assert.equal([...state.projects.get("publisher").values()].some((bytes) => text(bytes).includes('"kind":"release"')), false, name);
  }
});

test("stored retention envelopes validate before publisher-only restore and return detached bytes", async () => {
  const { prepared } = await fixture();
  const state = backend();
  const store = createLibraryStorage(state.api);
  const descriptor = await store.writeRelease("publisher", prepared);
  const original = releaseEnvelope(state, descriptor).content;
  const malformed = [
    ["duplicate alias", { ...original, retentions: [...original.retentions, structuredClone(original.retentions[0])] }],
    ["missing storage", { ...original, retentions: [{ alias: "ui", retention: { ...original.retentions[0].retention, assets: [{ ...original.retentions[0].retention.assets[0], storage: undefined }] } }] }],
    ["wrong root", { ...original, retentions: [{ alias: "ui", retention: { ...original.retentions[0].retention, root: { ...original.retentions[0].retention.root, contentHash: "0".repeat(64) } } }] }],
  ];
  for (const [name, content] of malformed) {
    const candidate = await uploadEnvelope(state, content);
    await assert.rejects(store.readRelease("publisher", candidate), { code: "CANVAS_IMPORT_INTEGRITY" }, name);
  }
  const stored = releaseEnvelope(state, descriptor).content;
  const storageDescriptor = stored.retentions[0].retention.assets[0].storage;
  const originalAssetBytes = new Uint8Array(state.projects.get("publisher").get(storageDescriptor.sha256));
  state.projects.get("publisher").set(storageDescriptor.sha256, Uint8Array.of());
  await assert.rejects(store.readRelease("publisher", descriptor), { code: "CANVAS_IMPORT_INTEGRITY" }, "zero-byte backend read");
  state.projects.get("publisher").set(storageDescriptor.sha256, originalAssetBytes);

  const clean = await store.readRelease("publisher", descriptor).catch((error) => { throw error; });
  clean.retentions[0].retention.assets[0].bytes[0] = 99;
  const second = await store.readRelease("publisher", descriptor);
  assert.notEqual(second.retentions[0].retention.assets[0].bytes[0], 99);
});

test("asset and envelope write failures return no receipt while unrelated blobs remain", async () => {
  const { prepared } = await fixture();
  for (const failure of ["asset", "envelope"]) {
    const state = backend();
    state.projects.get("publisher").set("unrelated", Uint8Array.of(4, 4));
    if (failure === "asset") state.controls.uploadError = "QUOTA_EXCEEDED";
    else {
      const original = state.api.uploadAsset;
      state.api.uploadAsset = async (documentId, asset) => {
        if (asset.bytes instanceof Uint8Array && text(asset.bytes).includes('"kind":"release"')) throw Object.assign(new Error("envelope failure"), { code: "QUOTA_EXCEEDED" });
        return original(documentId, asset);
      };
    }
    await assert.rejects(createLibraryStorage(state.api).writeRelease("publisher", prepared), { code: "QUOTA_EXCEEDED" }, failure);
    assert.deepEqual(state.projects.get("publisher").get("unrelated"), Uint8Array.of(4, 4));
    assert.equal([...state.projects.get("publisher").values()].some((bytes) => text(bytes).includes('"kind":"release"')), false);
  }
});
