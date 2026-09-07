import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { base64ToBytes, bytesToBase64, decodeJson, encodeJson } from "./codec.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";
import { createLibraryPublicationHead } from "./library-publication-head.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000002";
const LIBRARY_ID = "00000000-0000-4000-8000-000000000003";
const OTHER_LIBRARY_ID = "00000000-0000-4000-8000-000000000004";
const ITEM = { kind: "component", id: "card" };

function response(status, value) {
  return { status, headers: {}, body: value === null ? new Uint8Array() : encodeJson(value) };
}

function publisherDocument() {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "card", type: "frame", width: 100, height: 100 }],
    library: { public: [ITEM] },
  };
}

function consumerDocument() {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "screen", type: "frame", width: 100, height: 100 }],
    library: { public: [] },
  };
}

function project(source) {
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
  return { snapshot: { throughSequence: 0, state, projection: source }, updates: [], assets: new Map(), blobs: new Map() };
}

function makeAccount({ unpublished = false, denied = false, snapshotFailure = false, conflict = false } = {}) {
  const projects = new Map();
  const calls = [];
  const uploads = new Map();
  let uploadNumber = 0;

  function addProject(id, source) { projects.set(id, { id, title: id, ...project(source) }); }
  addProject(LIBRARY_ID, publisherDocument());
  addProject(DOCUMENT_ID, consumerDocument());

  const account = {
    async request(request) {
      const body = request.body === undefined ? undefined : decodeJson(request.body);
      calls.push({ method: request.method, path: request.path, body });
      const url = new URL(`https://canvas.invalid${request.path}`);
      const parts = url.pathname.split("/").filter(Boolean);
      const documentId = decodeURIComponent(parts[1] ?? "");
      const current = projects.get(documentId);
      if (parts[0] !== "projects") throw new Error(`Unexpected Account path ${request.path}`);
      if (request.method === "GET" && parts.length === 2) {
        if (!current || (denied && documentId === LIBRARY_ID)) return response(403, { code: "CANVAS_LIBRARY_ACCESS_DENIED", message: "denied" });
        return response(200, {
          id: documentId, title: current.title, access: "owner", ownerAccountId: "account-1",
          snapshot: structuredClone(current.snapshot), updates: structuredClone(current.updates),
        });
      }
      if (request.method === "GET" && parts.length === 3 && parts[2] === "blobs") {
        if (!current) return response(404, { code: "CANVAS_DOCUMENT_NOT_FOUND", message: "missing" });
        return response(200, { items: [...current.assets.values()].map(({ bytes: _bytes, ...descriptor }) => descriptor) });
      }
      if (request.method === "GET" && parts.length === 4 && parts[2] === "blobs") {
        const bytes = current?.blobs.get(parts[3]);
        if (!bytes) return response(404, { code: "CANVAS_ASSET_NOT_FOUND", message: "missing" });
        return response(200, { bytes: bytesToBase64(bytes), complete: true });
      }
      if (request.method === "POST" && parts.length === 4 && parts[2] === "blobs" && parts[3] === "uploads") {
        const uploadId = `upload-${++uploadNumber}`;
        uploads.set(uploadId, { documentId, metadata: body, bytes: new Uint8Array() });
        return response(201, { status: "created", uploadId, chunkSize: 32 * 1024 });
      }
      if (request.method === "POST" && parts.length === 6 && parts[2] === "blobs" && parts[3] === "uploads" && parts[5] === "parts") {
        const upload = uploads.get(parts[4]);
        assert.ok(upload);
        const part = base64ToBytes(body.bytes);
        const bytes = new Uint8Array(upload.bytes.length + part.length);
        bytes.set(upload.bytes); bytes.set(part, upload.bytes.length); upload.bytes = bytes;
        return response(201, { receivedBytes: bytes.length });
      }
      if (request.method === "POST" && parts.length === 6 && parts[2] === "blobs" && parts[3] === "uploads" && parts[5] === "complete") {
        const upload = uploads.get(parts[4]);
        assert.ok(upload);
        const sha256 = createHash("sha256").update(upload.bytes).digest("hex");
        assert.equal(sha256, upload.metadata.sha256);
        assert.equal(upload.bytes.length, upload.metadata.size);
        const descriptor = { path: upload.metadata.path, sha256, size: upload.bytes.length, ...(upload.metadata.mimeType === undefined ? {} : { mimeType: upload.metadata.mimeType }) };
        const target = projects.get(upload.documentId);
        target.blobs.set(sha256, new Uint8Array(upload.bytes));
        target.assets.set(descriptor.path, { ...descriptor, bytes: new Uint8Array(upload.bytes) });
        return response(201, { blob: descriptor });
      }
      if (request.method === "POST" && parts.length === 3 && parts[2] === "updates") {
        if (conflict && documentId === DOCUMENT_ID) return response(409, { code: "CANVAS_DOCUMENT_CONFLICT", message: "conflict" });
        if (body.expectedSequence !== latestSequence(current)) return response(409, { code: "CANVAS_DOCUMENT_CONFLICT", message: "conflict" });
        const sequence = latestSequence(current) + 1;
        current.updates.push({ sequence, update: body.update });
        return response(201, { sequence });
      }
      if (request.method === "POST" && parts.length === 3 && parts[2] === "snapshots") {
        if (snapshotFailure && documentId === DOCUMENT_ID) return response(503, { code: "CANVAS_SNAPSHOT_UNAVAILABLE", message: "unavailable" });
        current.snapshot = { throughSequence: body.throughSequence, state: body.state, projection: body.projection };
        current.updates = current.updates.filter(({ sequence }) => sequence > body.throughSequence);
        return response(201, { throughSequence: body.throughSequence });
      }
      throw new Error(`Unexpected Account request ${request.method} ${request.path}`);
    },
    subscribe() {},
  };
  return { account, projects, calls, addProject };
}

function latestSequence(value) {
  return Math.max(Number(value?.snapshot?.throughSequence ?? 0), ...(value?.updates ?? []).map(({ sequence }) => Number(sequence)));
}

async function prepareFixture(options = {}) {
  const state = makeAccount(options);
  const api = (await import("./canvas-api.mjs")).createCanvasApi({ account: state.account });
  const release = createLibraryRelease(publisherDocument(), { libraryId: LIBRARY_ID, releaseId: "00000000-0000-4000-8000-000000000005" });
  const storage = createLibraryStorage(api);
  const descriptor = await storage.writeRelease(LIBRARY_ID, { release, assets: new Map() });
  const published = publisherDocument();
  if (!options.unpublished) published.library.publication = createLibraryPublicationHead(release, descriptor);
  const publisher = state.projects.get(LIBRARY_ID);
  const encoded = project(published);
  publisher.snapshot = encoded.snapshot;
  publisher.updates = encoded.updates;
  state.calls.length = 0;
  return { ...state, api, release, descriptor };
}

async function registered(account, suffix) {
  const handlers = new Map();
  globalThis.penkra = { account, operations: { handle: (name, handler) => handlers.set(name, handler) } };
  await import(`./operations.mjs?library-accept-operations=${suffix}-${Date.now()}-${Math.random()}`);
  return handlers;
}

function assertJsonSafe(value) {
  if (value instanceof Uint8Array || value instanceof Map) assert.fail("receipt exposed transport object");
  if (value && typeof value === "object") for (const child of Object.values(value)) assertJsonSafe(child);
}

test("registered libraries.accept returns a JSON-safe changed receipt and persists the retained import", async () => {
  const state = await prepareFixture();
  const handlers = await registered(state.account, "changed");
  const result = await handlers.get("libraries.accept")({ documentId: DOCUMENT_ID, libraryId: LIBRARY_ID, alias: "ui", items: [ITEM], updatePolicy: "follow" });
  assert.equal(result.accepted, true);
  assert.equal(result.changed, true);
  assert.equal(result.documentId, DOCUMENT_ID);
  assert.equal(result.alias, "ui");
  assert.deepEqual(result.identity, { libraryId: LIBRARY_ID, releaseId: state.release.releaseId, contentHash: state.release.contentHash });
  assert.match(result.retention.path, /^_canvas\/library-content\/[a-f0-9]{64}$/u);
  assert.equal(result.retention.size > 0, true);
  assert.match(result.operationId, /^[0-9a-f-]{36}$/u);
  assert.equal(result.sequence, 1);
  assert.deepEqual(result.snapshot, { status: "saved" });
  assert.equal(state.projects.get(DOCUMENT_ID).snapshot.projection.imports.ui.updatePolicy, "follow");
  assertJsonSafe(result);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("repeated acceptance is changed:false without operation or snapshot, and another library conflicts on the alias", async () => {
  const state = await prepareFixture();
  const handlers = await registered(state.account, "noop");
  const input = { documentId: DOCUMENT_ID, libraryId: LIBRARY_ID, alias: "ui", items: [ITEM] };
  const first = await handlers.get("libraries.accept")(input);
  const appendCount = state.calls.filter(({ path }) => path === `/projects/${DOCUMENT_ID}/updates`).length;
  const second = await handlers.get("libraries.accept")(input);
  assert.equal(first.changed, true);
  assert.deepEqual(Object.keys(second).sort(), ["accepted", "alias", "changed", "documentId", "identity", "retention", "sequence"]);
  assert.equal(second.changed, false);
  assert.equal(second.sequence, 1);
  assert.equal(state.calls.filter(({ path }) => path === `/projects/${DOCUMENT_ID}/updates`).length, appendCount);
  await assert.rejects(handlers.get("libraries.accept")({ ...input, libraryId: OTHER_LIBRARY_ID }), { code: "CANVAS_IMPORT_ALIAS_CONFLICT" });
  assert.equal(state.calls.filter(({ path }) => path === `/projects/${DOCUMENT_ID}/updates`).length, appendCount);
});

test("unpublished or denied source fails before consumer writes", async () => {
  const unpublished = await prepareFixture({ unpublished: true });
  const unpublishedHandlers = await registered(unpublished.account, "unpublished");
  await assert.rejects(unpublishedHandlers.get("libraries.accept")({ documentId: DOCUMENT_ID, libraryId: LIBRARY_ID, alias: "ui", items: [ITEM] }), { code: "CANVAS_LIBRARY_UNPUBLISHED" });
  assert.ok(unpublished.calls.every(({ method }) => method === "GET"));

  const denied = await prepareFixture({ denied: true });
  const deniedHandlers = await registered(denied.account, "denied");
  await assert.rejects(deniedHandlers.get("libraries.accept")({ documentId: DOCUMENT_ID, libraryId: LIBRARY_ID, alias: "ui", items: [ITEM] }), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
  assert.ok(denied.calls.every(({ method }) => method === "GET"));
});

test("removed public item fails before consumer upload or append", async () => {
  const state = await prepareFixture();
  const handlers = await registered(state.account, "removed");
  await assert.rejects(handlers.get("libraries.accept")({ documentId: DOCUMENT_ID, libraryId: LIBRARY_ID, alias: "ui", items: [{ kind: "component", id: "removed" }] }), { code: "CANVAS_LIBRARY_ITEM_PRIVATE" });
  assert.equal(state.calls.some(({ method, path }) => method === "POST" && /\/projects\/[^/]+\/(blobs\/uploads|updates|snapshots)/u.test(path)), false);
});

test("snapshot failure returns changed receipt with deferred snapshot and no false no-op", async () => {
  const state = await prepareFixture({ snapshotFailure: true });
  const handlers = await registered(state.account, "deferred");
  const result = await handlers.get("libraries.accept")({ documentId: DOCUMENT_ID, libraryId: LIBRARY_ID, alias: "ui", items: [ITEM] });
  assert.equal(result.accepted, true);
  assert.equal(result.changed, true);
  assert.match(result.operationId, /^[0-9a-f-]{36}$/u);
  assert.deepEqual(result.snapshot, { status: "deferred", code: "CANVAS_LIBRARY_SNAPSHOT_DEFERRED" });
  assert.equal(state.projects.get(DOCUMENT_ID).updates.length, 1);
  assertJsonSafe(result);
});

test("accept manifest uses supported schemas, conditional fields remain optional, and only named examples are required", async () => {
  const manifest = JSON.parse(await readFile(new URL("../penkra-app.json", import.meta.url), "utf8"));
  const accept = manifest.operations.find(({ key }) => key === "libraries.accept");
  assert.ok(accept);
  assert.deepEqual(Object.keys(accept.input.properties).sort(), ["alias", "documentId", "items", "libraryId", "updatePolicy"]);
  assert.deepEqual(accept.input.required, ["documentId", "libraryId", "alias", "items"]);
  assert.equal(accept.input.additionalProperties, false);
  assert.deepEqual(accept.input.properties.items.items.required, ["kind", "id"]);
  assert.equal(accept.input.properties.items.items.additionalProperties, false);
  assert.deepEqual(accept.input.properties.items.items.properties.kind.enum, ["variable", "paragraphStyle", "component"]);
  assert.deepEqual(accept.output.required, ["accepted", "changed", "documentId", "alias", "identity", "retention", "sequence"]);
  assert.equal(accept.output.additionalProperties, false);
  assert.equal(accept.output.properties.accepted.const, true);
  assert.deepEqual(accept.output.properties.identity.required, ["libraryId", "releaseId", "contentHash"]);
  assert.deepEqual(accept.output.properties.retention.required, ["path", "sha256", "size"]);
  assert.equal(accept.output.properties.operationId.format, "uuid");
  assert.deepEqual(accept.examples, [{
    name: "Accept a published Canvas card",
    input: {
      documentId: "092d8d0f-8a53-4e95-b9ff-7ec6e222ddf9",
      libraryId: "7e8d9c0a-1b2c-4d3e-8f90-a1b2c3d4e5f6",
      alias: "ui",
      items: [{ kind: "component", id: "card" }],
      updatePolicy: "follow",
    },
  }]);
});
