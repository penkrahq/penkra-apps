import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { createCanvasApi } from "./canvas-api.mjs";
import { decodeJson, encodeJson } from "./codec.mjs";
import { createDocumentModel, createDocumentOperationUpdates, encodeState, encodeUpdate, materialize, Y } from "./document-model.mjs";
import { createLibraryPublicationHead } from "./library-publication-head.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";
import { acceptCanvasLibrary } from "./library-accept-workflow.mjs";

function response(status, value) {
  return { status, headers: {}, body: value === null ? new Uint8Array() : encodeJson(value) };
}

function sourceDocument(name = "shell") {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: name, type: "frame", width: 120, height: 80 }],
    library: { public: [{ kind: "component", id: name }] },
  };
}

function consumerDocument() {
  return { version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "screen", type: "frame" }], library: { public: [] } };
}

function projectPayload(source) {
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
  return { snapshot: { throughSequence: 0, state, projection: source }, updates: [], assets: [] };
}

function backendTransport() {
  const projects = new Map();
  const requests = [];
  const updateBodies = [];
  const snapshotBodies = [];
  const uploads = new Map();
  const undo = new Map();
  let uploadNumber = 0;
  const api = createCanvasApi({ account: { request: async (request) => handle(request) } });

  async function handle(request) {
    requests.push(request);
    const url = new URL(`https://canvas.invalid${request.path}`);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "projects") throw new Error(`Unexpected path ${request.path}`);
    const documentId = decodeURIComponent(parts[1] ?? "");
    const project = projects.get(documentId);
    const method = request.method ?? "GET";
    if (method === "GET" && parts.length === 2) {
      if (!project) return response(404, { code: "CANVAS_DOCUMENT_NOT_FOUND", message: "missing" });
      return response(200, { id: documentId, title: project.title, ownerAccountId: "account", access: "owner", snapshot: project.snapshot, updates: project.updates });
    }
    if (method === "GET" && parts.length === 3 && parts[2] === "blobs") {
      return response(200, { items: [...project.assets.values()].map(({ bytes: _bytes, ...descriptor }) => descriptor) });
    }
    if (method === "GET" && parts.length === 4 && parts[2] === "blobs") {
      const bytes = project.blobs.get(parts[3]);
      if (!bytes) return response(404, { code: "CANVAS_ASSET_NOT_FOUND", message: "missing" });
      return response(200, { bytes: Buffer.from(bytes).toString("base64"), complete: true });
    }
    if (method === "POST" && parts.length === 4 && parts[2] === "blobs" && parts[3] === "uploads") {
      const body = decodeJson(request.body);
      const uploadId = `upload-${++uploadNumber}`;
      uploads.set(uploadId, { documentId, metadata: body, bytes: new Uint8Array() });
      return response(201, { status: "created", uploadId, chunkSize: 32 * 1024 });
    }
    if (method === "POST" && parts.length === 6 && parts[2] === "blobs" && parts[3] === "uploads" && parts[5] === "parts") {
      const body = decodeJson(request.body);
      const upload = uploads.get(parts[4]);
      if (!upload) throw new Error(`unknown upload path ${request.path}`);
      const bytes = Buffer.from(body.bytes, "base64");
      const joined = new Uint8Array(upload.bytes.length + bytes.length);
      joined.set(upload.bytes); joined.set(bytes, upload.bytes.length); upload.bytes = joined;
      return response(201, { receivedBytes: upload.bytes.length });
    }
    if (method === "POST" && parts.length === 6 && parts[2] === "blobs" && parts[3] === "uploads" && parts[5] === "complete") {
      const uploadId = parts[4];
      const upload = uploads.get(uploadId);
      if (!upload) throw new Error(`unknown upload ${uploadId}`);
      const descriptor = { path: upload.metadata.path, sha256: upload.metadata.sha256, size: upload.bytes.length, ...(upload.metadata.mimeType === undefined ? {} : { mimeType: upload.metadata.mimeType }) };
      project.blobs.set(descriptor.sha256, new Uint8Array(upload.bytes));
      project.assets.set(descriptor.path, { ...descriptor, bytes: new Uint8Array(upload.bytes) });
      return response(200, { blob: descriptor });
    }
    if (method === "POST" && parts.length === 3 && parts[2] === "updates") {
      const body = decodeJson(request.body);
      updateBodies.push({ documentId, body });
      const current = latestSequence(project);
      const existing = project.clients.get(body.clientUpdateId);
      if (existing) return response(200, existing);
      if (body.expectedSequence !== undefined && body.expectedSequence !== current) return response(409, { code: "CANVAS_DOCUMENT_CHANGED", message: "changed" });
      const sequence = current + 1;
      project.updates.push({ sequence, update: body.update });
      const result = { sequence, duplicate: false, operationId: body.operation?.id ?? null };
      project.clients.set(body.clientUpdateId, result);
      undo.delete(documentId);
      if (body.operation?.inverseUpdate) undo.set(documentId, { sequence, inverseUpdate: body.operation.inverseUpdate, operationId: body.operation.id });
      return response(201, result);
    }
    if (method === "POST" && parts.length === 3 && parts[2] === "snapshots") {
      const body = decodeJson(request.body);
      snapshotBodies.push({ documentId, body });
      const current = latestSequence(project);
      if (body.throughSequence > current) return response(409, { code: "CANVAS_SNAPSHOT_AHEAD", message: "ahead" });
      project.snapshot = { throughSequence: body.throughSequence, state: body.state, projection: body.projection };
      project.updates = project.updates.filter(({ sequence }) => sequence > body.throughSequence);
      return response(201, { throughSequence: body.throughSequence });
    }
    throw new Error(`Unexpected ${method} ${request.path}`);
  }

  function addProject(id, source) {
    projects.set(id, { title: id, ...projectPayload(source), blobs: new Map(), clients: new Map(), assets: new Map() });
  }
  return { api, projects, requests, updateBodies, snapshotBodies, undo, addProject };
}

function latestSequence(project) {
  return Math.max(Number(project.snapshot?.throughSequence ?? 0), ...(project.updates ?? []).map(({ sequence }) => Number(sequence)));
}

async function publishHead(env, release, storage) {
  const head = structuredClone(release.document);
  head.library.publication = createLibraryPublicationHead(release, storage);
  const model = createDocumentModel(release.document);
  try {
    const updates = createDocumentOperationUpdates(model, head);
    const appended = await env.api.appendUpdate("publisher", {
      clientUpdateId: randomUUID(), update: encodeUpdate(updates.forward), expectedSequence: 0,
      operation: { id: randomUUID(), inverseUpdate: encodeUpdate(updates.inverse) },
    });
    Y.applyUpdate(model.doc, updates.forward);
    await env.api.createSnapshot("publisher", { throughSequence: appended.sequence, state: encodeState(model), source: materialize(model) });
    return head;
  } finally { model.doc.destroy(); }
}

async function fixture() {
  const env = backendTransport();
  const release = createLibraryRelease(sourceDocument(), { libraryId: "publisher", releaseId: "one" });
  env.addProject("publisher", release.document);
  env.addProject("consumer", consumerDocument());
  const storage = createLibraryStorage(env.api);
  const storageDescriptor = await storage.writeRelease("publisher", { release, assets: new Map() });
  const head = await publishHead(env, release, storageDescriptor);
  return { ...env, release, head, storageDescriptor };
}

test("publication and acceptance use actual Canvas API translation and backend receipts", async () => {
  const env = await fixture();
  const result = await acceptCanvasLibrary(env.api, { documentId: "consumer", libraryId: "publisher", alias: "accepted", items: [{ kind: "component", id: "shell" }] });
  assert.equal(result.accepted, true);
  assert.equal(result.sequence, 1);
  const publisherAppend = env.updateBodies.find(({ documentId }) => documentId === "publisher");
  const consumerAppend = env.updateBodies.find(({ documentId }) => documentId === "consumer");
  assert.equal(publisherAppend.body.expectedSequence, 0);
  assert.equal(consumerAppend.body.expectedSequence, 0);
  assert.match(consumerAppend.body.clientUpdateId, /^[0-9a-f-]{36}$/u);
  assert.equal(consumerAppend.body.operation.id, result.operationId);
  assert.ok(consumerAppend.body.operation.inverseUpdate.length > 0);
  assert.equal(env.undo.get("consumer").inverseUpdate, consumerAppend.body.operation.inverseUpdate);
  const snapshot = env.snapshotBodies.find(({ documentId }) => documentId === "consumer");
  assert.equal(snapshot.body.throughSequence, result.sequence);
  assert.ok(snapshot.body.projection);
  assert.equal(Object.hasOwn(snapshot.body, "source"), false, "adapter must translate source to backend projection");
  assert.equal(env.snapshotBodies.find(({ documentId }) => documentId === "publisher").body.throughSequence, 1);
  const consumer = await env.api.getDocument("consumer");
  assert.equal(consumer.snapshot.throughSequence, 1);
  assert.equal(consumer.updates.length, 0);
});

test("actual API preserves backend duplicate/error receipts and snapshot staleness rules", async () => {
  const env = await fixture();
  const body = { clientUpdateId: randomUUID(), update: "AQ==", expectedSequence: 9, operation: { id: randomUUID(), inverseUpdate: "Ag==" } };
  await assert.rejects(env.api.appendUpdate("consumer", body), { code: "CANVAS_DOCUMENT_CHANGED", status: 409 });
  await assert.rejects(env.api.createSnapshot("consumer", { throughSequence: 9, state: "AQ==", source: consumerDocument() }), { code: "CANVAS_SNAPSHOT_AHEAD", status: 409 });

  const successful = { ...body, expectedSequence: 0 };
  const first = await env.api.appendUpdate("consumer", successful);
  const duplicate = await env.api.appendUpdate("consumer", successful);
  assert.deepEqual(first, { sequence: 1, duplicate: false, operationId: successful.operation.id });
  assert.deepEqual(duplicate, first);
  assert.equal(env.undo.get("consumer").inverseUpdate, successful.operation.inverseUpdate);
  const replacement = await env.api.appendUpdate("consumer", {
    clientUpdateId: randomUUID(), update: "Aw==", expectedSequence: 1,
  });
  assert.deepEqual(replacement, { sequence: 2, duplicate: false, operationId: null });
  assert.equal(env.undo.has("consumer"), false, "a non-operation append clears the current undo row");
  await env.api.createSnapshot("consumer", { throughSequence: 2, state: "AQ==", source: consumerDocument() });
  const current = await env.api.getDocument("consumer");
  assert.equal(current.snapshot.throughSequence, 2);
  assert.equal(current.updates.length, 0);
});

test("getDocument follows backend snapshot watermark and ordered post-snapshot updates through the adapter", async () => {
  const env = await fixture();
  const project = env.projects.get("consumer");
  project.snapshot.throughSequence = 4;
  project.updates.push({ sequence: 6, update: "Bg==" }, { sequence: 8, update: "Bw==" });
  const value = await env.api.getDocument("consumer");
  assert.equal(value.snapshot.throughSequence, 4);
  assert.deepEqual(value.updates.map(({ sequence }) => sequence), [6, 8]);
  const requestPaths = env.requests.slice(-2).map(({ path }) => path);
  assert.deepEqual(requestPaths, ["/projects/consumer?chunked=auto", "/projects/consumer/blobs"]);
});
