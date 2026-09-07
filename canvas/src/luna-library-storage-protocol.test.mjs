import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { base64ToBytes, bytesToBase64, decodeJson, encodeJson } from "./codec.mjs";
import { createCanvasApi } from "./canvas-api.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage, isLibraryStorageAsset } from "./library-storage.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (...values) => Uint8Array.from(values);
const requestedCard = [{ kind: "component", id: "card" }];

function response(value, status = 200) { return { status, body: encodeJson(value) }; }
function denied(code = "CANVAS_LIBRARY_ACCESS_DENIED", status = 403) { return response({ code, message: code }, status); }

function runtime(options = {}) {
  const projects = new Map(["source", "consumer", "dependency"].map((id) => [id, new Map()]));
  const uploads = new Map();
  const calls = [];
  let nextUpload = 1;
  const state = { projects, uploads, calls, options };
  const fail = (stage) => options.failStage === stage ? response({ code: options.failCode ?? `CANVAS_STORAGE_${stage.toUpperCase()}`, message: `injected ${stage}` }, options.failStatus ?? 503) : null;
  const account = {
    async request(request) {
      calls.push({ ...request, body: request.body ? decodeJson(request.body) : undefined });
      const url = new URL(`https://canvas.test${request.path}`);
      const segments = url.pathname.slice("/projects".length).split("/").filter(Boolean).map(decodeURIComponent);
      const [projectId, resource, name, suffix] = segments;
      const method = request.method ?? "GET";
      const body = request.body ? decodeJson(request.body) : undefined;
      if (options.denyRead?.has(projectId) && method === "GET") return denied(options.denyReadCode);
      if (options.denyWrite?.has(projectId) && method !== "GET") return denied(options.denyWriteCode);
      const project = projects.get(projectId);
      if (!project) return denied();
      if (resource !== "blobs") return response({ code: "CANVAS_TEST_UNKNOWN_ENDPOINT", message: request.path }, 404);
      if (name === "uploads" && method === "POST" && suffix === undefined) {
        const injected = fail("start");
        if (injected) return injected;
        const existing = project.get(body.sha256);
        if (existing && existing.bytes.length === body.size) return response({ status: "ready", blob: { sha256: body.sha256, size: body.size, mimeType: body.mimeType } });
        const uploadId = `upload-${nextUpload++}`;
        uploads.set(uploadId, { projectId, metadata: body, parts: new Map() });
        return response({ status: "upload", uploadId, chunkSize: options.chunkSize ?? 2 });
      }
      if (segments[1] === "blobs" && segments[2] === "uploads" && method === "POST" && segments[4] === "parts") {
        const upload = uploads.get(segments[3]);
        const injected = fail("part");
        if (injected) return injected;
        if (!upload) return response({ code: "CANVAS_TEST_UPLOAD_MISSING", message: "missing upload" }, 404);
        upload.parts.set(body.part, base64ToBytes(body.bytes));
        return response({ ok: true });
      }
      if (segments[1] === "blobs" && segments[2] === "uploads" && method === "POST" && segments[4] === "complete") {
        const upload = uploads.get(segments[3]);
        const injected = fail("complete");
        if (injected) return injected;
        if (!upload) return response({ code: "CANVAS_TEST_UPLOAD_MISSING", message: "missing upload" }, 404);
        const ordered = [...upload.parts.keys()].sort((a, b) => a - b).flatMap((part) => [...upload.parts.get(part)]);
        const content = Uint8Array.from(ordered);
        if (content.length !== upload.metadata.size || hash(content) !== upload.metadata.sha256) return response({ code: "CANVAS_TEST_UPLOAD_INTEGRITY", message: "bad upload" }, 422);
        project.set(upload.metadata.sha256, { bytes: content, mimeType: upload.metadata.mimeType });
        uploads.delete(segments[3]);
        const blob = { sha256: upload.metadata.sha256, size: content.length, mimeType: upload.metadata.mimeType };
        if (options.receipt === "wrong-hash") blob.sha256 = "0".repeat(64);
        if (options.receipt === "wrong-size") blob.size += 1;
        if (options.receipt === "wrong-path") blob.path = "wrong";
        if (options.receipt === "missing") return response({});
        return response({ blob });
      }
      if (resource === "blobs" && segments.length === 3 && method === "GET") {
        const injected = fail("readback");
        if (injected) return injected;
        const stored = project.get(name);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const requestedSize = Number(url.searchParams.get("length") ?? (options.chunkSize ?? 2));
        const source = stored?.bytes;
        if (!source) return denied();
        let output = source.subarray(offset, Math.min(source.length, offset + requestedSize));
        if (options.readMode === "corrupt") output = Uint8Array.from(output, (value) => value ^ 0xff);
        if (options.readMode === "truncated") output = output.subarray(0, Math.max(0, output.length - 1));
        if (options.readMode === "oversized") output = Uint8Array.from([...output, 99]);
        const complete = options.readMode === "truncated" || options.readMode === "oversized" || offset + output.length >= source.length;
        return response({ bytes: bytesToBase64(output), complete });
      }
      return response({ code: "CANVAS_TEST_UNKNOWN_ENDPOINT", message: request.path }, 404);
    },
  };
  return { runtime: { account }, state, api: createCanvasApi({ account }) };
}

function asset(path, content, mimeType = "application/octet-stream") { return { path, sha256: hash(content), size: content.length, mimeType, bytes: content }; }

function simpleFixture() {
  const image = bytes(1, 2, 3, 4, 5);
  const document = {
    axes: {}, imports: {}, paragraphStyles: {},
    variables: { ink: { tokenType: "color", cascade: [{ value: "#123456" }] }, secret: { tokenType: "string", cascade: [{ value: "private" }] } },
    library: { public: [{ kind: "component", id: "card" }] },
    children: [
      { id: "card", type: "frame", fill: "${ink}", children: [{ id: "image", type: "rectangle", fill: { type: "image", url: "used.png" } }] },
      { id: "private-node", type: "frame", children: [{ id: "private-image", type: "rectangle", fill: { type: "image", url: "private.png" } }] },
    ],
  };
  const used = asset("used.png", image, "image/png");
  const unused = asset("private.png", bytes(8, 8, 8), "image/png");
  const release = createLibraryRelease(document, { libraryId: "source", releaseId: "one", assets: [used, unused] });
  return { release, assets: new Map([[used.path, image], [unused.path, unused.bytes]]) };
}

function dependencyFixture() {
  const dependencyBytes = bytes(9, 8, 7, 6);
  const dependencyDocument = {
    axes: {}, imports: {}, paragraphStyles: {}, variables: { depInk: { tokenType: "color", cascade: [{ value: "#abcdef" }] } },
    library: { public: [{ kind: "component", id: "badge" }] },
    children: [{ id: "badge", type: "frame", fill: "${depInk}", children: [{ id: "dep-image", type: "rectangle", fill: { type: "image", url: "dependency.png" } }] }, { id: "dependency-private" }],
  };
  const dependencyAsset = asset("dependency.png", dependencyBytes, "image/png");
  const dependency = createLibraryRelease(dependencyDocument, { libraryId: "dependency", releaseId: "one", assets: [dependencyAsset] });
  const rootBytes = bytes(4, 3, 2, 1);
  const rootDocument = {
    axes: {}, imports: {}, paragraphStyles: {}, variables: {},
    library: { public: [{ kind: "component", id: "wrapper" }] },
    children: [{ id: "wrapper", type: "frame", children: [{ id: "dep-ref", type: "ref", ref: "dep:badge" }, { id: "root-image", type: "rectangle", fill: { type: "image", url: "root.png" } }] }],
  };
  const rootAsset = asset("root.png", rootBytes, "image/png");
  const root = createLibraryRelease(rootDocument, {
    libraryId: "source", releaseId: "dependent", dependencies: [{ alias: "dep", libraryId: dependency.libraryId, releaseId: dependency.releaseId, contentHash: dependency.contentHash }], assets: [rootAsset],
  });
  return { root, dependency, assets: new Map([[rootAsset.path, rootBytes], [dependencyAsset.path, dependencyBytes]]) };
}

function readersFor(fixture, options = {}) {
  const calls = [];
  return {
    calls,
    resolveRelease: async (record) => {
      calls.push(["resolve", record.documentId]);
      if (options.denyDependency && record.documentId === "dependency") throw Object.assign(new Error("dependency denied"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      if (record.documentId === "dependency") return fixture.dependency;
      return fixture.root ?? fixture.release;
    },
    readAsset: async (identity, descriptor) => {
      calls.push(["asset", identity.libraryId, descriptor.path]);
      if (options.denyAsset) throw Object.assign(new Error("asset denied"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
      const content = fixture.assets.get(descriptor.path);
      if (!content) throw Object.assign(new Error("asset missing"), { code: "CANVAS_IMPORT_INTEGRITY" });
      return new Uint8Array(content);
    },
  };
}

async function retainSimple(state, fixture, options = {}) {
  const store = createLibraryStorage(state.api);
  const readers = readersFor({ release: fixture.release, root: fixture.release, assets: fixture.assets }, options);
  const descriptor = await store.retainItems("consumer", fixture.release, requestedCard, readers);
  return { store, descriptor, readers };
}

test("real createCanvasApi protocol round-trips releases through multipart blobs and fresh adapters", async () => {
  const fixture = simpleFixture();
  const state = runtime();
  const store = createLibraryStorage(state.api);
  const descriptor = await store.writeRelease("source", fixture);
  assert.equal(isLibraryStorageAsset(descriptor), true);
  assert.deepEqual(await createLibraryStorage(state.api).readRelease("source", descriptor), { release: fixture.release, assets: fixture.assets });
  const repeated = await store.writeRelease("source", fixture);
  assert.deepEqual(repeated, descriptor);
  assert.equal(state.state.projects.get("source").size, 3);
  assert.ok(state.state.calls.some((call) => call.path.includes("/blobs/uploads") && call.method === "POST"));
  assert.ok(state.state.calls.some((call) => call.path.includes("/parts") && call.method === "POST"));
  assert.ok(state.state.calls.some((call) => call.path.includes("/complete") && call.method === "POST"));
});

test("retention stores the minimum public/private closure and survives source deletion with consumer-only reads", async () => {
  const fixture = simpleFixture();
  const state = runtime();
  const { store, descriptor, readers } = await retainSimple(state, fixture);
  const before = state.state.calls.length;
  state.state.projects.delete("source");
  fixture.release.document.children.length = 0;
  const retained = await createLibraryStorage(state.api).readRetention("consumer", descriptor);
  assert.deepEqual(retained.items[0].content.resources.map(([key]) => key), ["component:card", "variable:ink"]);
  assert.deepEqual(retained.assets.map((entry) => entry.path), ["used.png"]);
  const stored = [...state.state.projects.get("consumer").values()].map(({ bytes: value }) => new TextDecoder().decode(value)).join("\n");
  assert.doesNotMatch(stored, /private-node|private\.png|"document"|"secret"/u);
  assert.ok(state.state.calls.slice(before).every((call) => call.path.includes("/consumer/")));
  assert.equal(readers.calls.filter(([kind]) => kind === "resolve").length, 1);
  state.state.projects.delete("consumer");
  await assert.rejects(store.readRetention("consumer", descriptor), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
});

test("two-level dependency retention copies required root and dependency assets without unrelated blobs", async () => {
  const fixture = dependencyFixture();
  const state = runtime();
  const store = createLibraryStorage(state.api);
  const readers = readersFor(fixture);
  const unrelated = bytes(55, 44);
  state.state.projects.get("consumer").set(hash(unrelated), { bytes: unrelated, mimeType: "application/octet-stream" });
  const descriptor = await store.retainItems("consumer", fixture.root, [{ kind: "component", id: "wrapper" }], readers);
  const retained = await createLibraryStorage(state.api).readRetention("consumer", descriptor);
  assert.deepEqual(retained.assets.map((entry) => entry.path), ["dependency.png", "root.png"]);
  assert.equal(retained.items.some((item) => item.release.libraryId === "dependency" && item.item.id === "badge"), true);
  assert.equal(state.state.projects.get("consumer").has(hash(unrelated)), true);
  assert.equal(readers.calls.filter(([kind]) => kind === "resolve").length, 2);
  assert.equal(readers.calls.filter(([kind]) => kind === "asset").length, 2);
});

test("new acceptance reauthorizes asset-free roots and fails closed for private, dependency, and asset gates", async () => {
  const fixture = simpleFixture();
  const state = runtime();
  const store = createLibraryStorage(state.api);
  const assetFreeDocument = structuredClone(fixture.release.document);
  assetFreeDocument.children[0].children = [];
  const noAssets = { release: createLibraryRelease(assetFreeDocument, { libraryId: "source", releaseId: "asset-free" }), assets: new Map() };
  await assert.rejects(store.retainItems("consumer", noAssets.release, requestedCard, { resolveRelease: async () => { throw Object.assign(new Error("revoked"), { code: "CANVAS_LIBRARY_ACCESS_DENIED" }); } }), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
  await assert.rejects(store.retainItems("consumer", fixture.release, [{ kind: "component", id: "private-node" }], readersFor({ release: fixture.release, root: fixture.release, assets: fixture.assets })), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  const dependency = dependencyFixture();
  await assert.rejects(store.retainItems("consumer", dependency.root, [{ kind: "component", id: "wrapper" }], readersFor(dependency, { denyDependency: true })), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
  await assert.rejects(store.retainItems("consumer", fixture.release, requestedCard, readersFor({ release: fixture.release, root: fixture.release, assets: fixture.assets }, { denyAsset: true })), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
  assert.equal([...state.state.projects.get("consumer").keys()].length, 0);
});

test("consumer writes propagate access denial and every upload phase failure without a usable receipt", async (t) => {
  for (const stage of ["start", "part", "complete", "readback"]) {
    await t.test(stage, async () => {
      const fixture = simpleFixture();
      const state = runtime({ failStage: stage, failCode: `CANVAS_STORAGE_${stage.toUpperCase()}` });
      await assert.rejects(createLibraryStorage(state.api).writeRelease("source", fixture), { code: stage === "readback" ? "CANVAS_STORAGE_READBACK" : `CANVAS_STORAGE_${stage.toUpperCase()}` });
    });
  }
  const fixture = simpleFixture();
  const deniedState = runtime({ denyWrite: new Set(["consumer"]) });
  await assert.rejects(createLibraryStorage(deniedState.api).retainItems("consumer", fixture.release, requestedCard, readersFor({ release: fixture.release, root: fixture.release, assets: fixture.assets })), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
});

test("malformed upload receipts fail closed with a stable integrity code", async () => {
  const fixture = simpleFixture();
  for (const [receipt, code] of [["wrong-hash", "CANVAS_ASSET_UPLOAD_RECEIPT_INVALID"], ["wrong-size", "CANVAS_ASSET_UPLOAD_RECEIPT_INVALID"], ["missing", "CANVAS_ASSET_UPLOAD_RECEIPT_INVALID"]]) {
    const state = runtime({ receipt });
    await assert.rejects(createLibraryStorage(state.api).writeRelease("source", fixture), { code });
  }
  const pathReceiptState = runtime({ receipt: "wrong-path" });
  const pathReceipt = await createLibraryStorage(pathReceiptState.api).writeRelease("source", fixture);
  assert.equal(pathReceipt.path, `_canvas/library-content/${pathReceipt.sha256}`);
});

test("stored descriptors and payload bytes fail closed", async () => {
  const fixture = simpleFixture();
  for (const readMode of ["corrupt", "truncated", "oversized"]) {
    const state = runtime();
    const store = createLibraryStorage(state.api);
    const descriptor = await store.writeRelease("source", fixture);
    const broken = runtime({ readMode });
    broken.state.projects.set("source", state.state.projects.get("source"));
    await assert.rejects(createLibraryStorage(broken.api).readRelease("source", descriptor), { code: "CANVAS_IMPORT_INTEGRITY" });
  }
  const state = runtime();
  const store = createLibraryStorage(state.api);
  const descriptor = await store.writeRelease("source", fixture);
  for (const malformed of [null, {}, { sha256: "0".repeat(64), path: "wrong", size: 1 }, { sha256: "0".repeat(64), path: "_canvas/library-content/" + "0".repeat(64), size: "1" }]) {
    await assert.rejects(store.readRelease("source", malformed), { code: "CANVAS_IMPORT_INTEGRITY" });
  }
  const invalidEnvelope = bytes(...new TextEncoder().encode("{}"));
  const invalidHash = hash(invalidEnvelope);
  state.state.projects.get("source").set(invalidHash, { bytes: invalidEnvelope, mimeType: "application/json" });
  await assert.rejects(store.readRelease("source", { path: `_canvas/library-content/${invalidHash}`, sha256: invalidHash, size: invalidEnvelope.length, mimeType: "application/json" }), { code: "CANVAS_IMPORT_INTEGRITY" });
  assert.ok(descriptor);
});

test("caller mutation during an awaited protocol write cannot alter the stored release", async () => {
  const fixture = simpleFixture();
  const state = runtime();
  const original = structuredClone(fixture);
  let releaseStart;
  let continueStart;
  const started = new Promise((resolve) => { releaseStart = resolve; });
  const gate = new Promise((resolve) => { continueStart = resolve; });
  const base = state.runtime.account.request;
  state.runtime.account.request = async (request) => {
    if (request.method === "POST" && request.path.endsWith("/blobs/uploads")) {
      releaseStart?.();
      await gate;
    }
    return base(request);
  };
  const pending = createLibraryStorage(createCanvasApi(state.runtime)).writeRelease("source", fixture);
  await started;
  fixture.release.document.children.length = 0;
  fixture.assets.get("used.png")[0] = 99;
  continueStart();
  const descriptor = await pending;
  const restored = await createLibraryStorage(createCanvasApi(state.runtime)).readRelease("source", descriptor);
  assert.deepEqual(restored, original);
});
