import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { base64ToBytes, bytesToBase64, decodeJson, encodeJson } from "./codec.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";

const DOCUMENT_ID = "00000000-0000-4000-8000-000000000001";
const ITEM = { kind: "component", id: "card" };

function response(status, value) {
  return { status, headers: {}, body: value === null ? new Uint8Array() : encodeJson(value) };
}

function sourceDocument() {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{ id: "card", type: "frame", width: 100, height: 100 }],
    library: { public: [ITEM] },
  };
}

function makeAccount({ conflict = false, snapshotFailure = false, denied = false, unpublished = false } = {}) {
  const source = sourceDocument();
  if (unpublished) delete source.library;
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
  const project = {
    id: DOCUMENT_ID,
    title: "Library",
    access: "owner",
    ownerAccountId: "account-1",
    snapshot: { throughSequence: 0, state, projection: source },
    updates: [],
  };
  const blobs = new Map();
  const uploads = new Map();
  const calls = [];
  let uploadNumber = 0;
  let sequence = 0;

  const account = {
    async request(request) {
      const body = request.body === undefined ? undefined : decodeJson(request.body);
      calls.push({ method: request.method, path: request.path, body });
      const prefix = `/projects/${DOCUMENT_ID}`;
      if (request.path === `${prefix}?chunked=auto`) {
        if (denied) return response(403, { code: "CANVAS_LIBRARY_ACCESS_DENIED", message: "denied" });
        return response(200, structuredClone(project));
      }
      if (request.path === `${prefix}/blobs`) return response(200, { items: [] });
      if (request.path === `${prefix}/blobs/uploads` && request.method === "POST") {
        const uploadId = `upload-${++uploadNumber}`;
        uploads.set(uploadId, { ...body, bytes: new Uint8Array() });
        return response(200, { uploadId, chunkSize: 1024 });
      }
      const partMatch = request.path.match(new RegExp(`^${prefix}/blobs/uploads/([^/]+)/parts$`, "u"));
      if (partMatch && request.method === "POST") {
        const upload = uploads.get(partMatch[1]);
        assert.ok(upload);
        const part = base64ToBytes(body.bytes);
        const combined = new Uint8Array(upload.bytes.length + part.length);
        combined.set(upload.bytes);
        combined.set(part, upload.bytes.length);
        upload.bytes = combined;
        return response(200, { received: true });
      }
      const completeMatch = request.path.match(new RegExp(`^${prefix}/blobs/uploads/([^/]+)/complete$`, "u"));
      if (completeMatch && request.method === "POST") {
        const upload = uploads.get(completeMatch[1]);
        assert.ok(upload);
        const sha256 = createHash("sha256").update(upload.bytes).digest("hex");
        assert.equal(sha256, upload.sha256);
        assert.equal(upload.bytes.length, upload.size);
        blobs.set(sha256, new Uint8Array(upload.bytes));
        return response(200, { blob: { sha256, size: upload.bytes.length } });
      }
      const blobMatch = request.path.match(new RegExp(`^${prefix}/blobs/([a-f0-9]{64})\\?offset=\\d+$`, "u"));
      if (blobMatch && request.method === "GET") {
        const bytes = blobs.get(blobMatch[1]);
        if (!bytes) return response(404, { code: "CANVAS_ASSET_NOT_FOUND", message: "missing" });
        return response(200, { bytes: bytesToBase64(bytes), complete: true });
      }
      if (request.path === `${prefix}/updates` && request.method === "POST") {
        if (conflict) return response(409, { code: "CANVAS_DOCUMENT_CONFLICT", message: "conflict" });
        assert.equal(body.expectedSequence, sequence);
        sequence += 1;
        project.updates.push({ update: body.update, sequence });
        return response(200, { sequence });
      }
      if (request.path === `${prefix}/snapshots` && request.method === "POST") {
        if (snapshotFailure) return response(503, { code: "CANVAS_SNAPSHOT_UNAVAILABLE", message: "unavailable" });
        project.snapshot = { throughSequence: body.throughSequence, state: body.state, projection: body.projection };
        project.updates = project.updates.filter(({ sequence: itemSequence }) => itemSequence > body.throughSequence);
        return response(200, { throughSequence: body.throughSequence });
      }
      throw new Error(`Unexpected Account request ${request.method} ${request.path}`);
    },
    subscribe() {},
  };
  return { account, blobs, calls, project };
}

async function registered(account, suffix) {
  const handlers = new Map();
  globalThis.penkra = { account, operations: { handle: (name, handler) => handlers.set(name, handler) } };
  await import(`./operations.mjs?library-operations=${suffix}-${Date.now()}-${Math.random()}`);
  return handlers;
}

function releaseFromBlobs(blobs) {
  for (const bytes of blobs.values()) {
    try {
      const envelope = JSON.parse(new TextDecoder().decode(bytes));
      if (envelope?.kind === "release") return envelope.content.release;
    } catch {}
  }
  throw new Error("release envelope was not stored");
}

function assertNoTransportObjects(value) {
  if (value instanceof Uint8Array || value instanceof Map) assert.fail("operation exposed transport bytes or a Map");
  if (value && typeof value === "object") for (const child of Object.values(value)) assertNoTransportObjects(child);
}

test("manifest declares exact publish and inspect schemas and registered handlers cover both", async () => {
  const manifest = JSON.parse(await readFile(new URL("../penkra-app.json", import.meta.url), "utf8"));
  const entries = manifest.operations.filter(({ key }) => key.startsWith("libraries."));
  assert.deepEqual(entries.map(({ key }) => key).sort(), ["libraries.accept", "libraries.inspect", "libraries.publish"]);
  const publish = entries.find(({ key }) => key === "libraries.publish");
  assert.deepEqual(Object.keys(publish.input.properties).sort(), ["documentId", "publicItems"]);
  assert.deepEqual(publish.input.required, ["documentId"]);
  assert.equal(publish.input.additionalProperties, false);
  assert.deepEqual(publish.input.properties.publicItems.items.required, ["kind", "id"]);
  assert.equal(publish.input.properties.publicItems.items.additionalProperties, false);
  assert.deepEqual(publish.input.properties.publicItems.items.properties.kind.enum, ["variable", "paragraphStyle", "component"]);
  assert.deepEqual(publish.output.properties.publication.properties.contentHash, { type: "string", minLength: 64, maxLength: 64 });
  assert.deepEqual(publish.output.properties.publication.properties.storage.properties.sha256, { type: "string", minLength: 64, maxLength: 64 });
  assert.deepEqual(Object.keys(publish.output.properties).sort(), ["documentId", "operationId", "publication", "published", "sequence", "snapshot"]);
  assert.deepEqual(publish.output.required, ["documentId", "published", "operationId", "sequence", "publication", "snapshot"]);
  assert.equal(publish.output.properties.published.const, true);
  assert.equal(publish.output.properties.publication.additionalProperties, false);
  assert.deepEqual(publish.output.properties.snapshot.properties.status.enum, ["saved", "deferred"]);
  assert.equal(publish.output.properties.snapshot.properties.code.const, "CANVAS_LIBRARY_SNAPSHOT_DEFERRED");
  assert.equal(publish.output.properties.snapshot.additionalProperties, false);

  const inspect = entries.find(({ key }) => key === "libraries.inspect");
  assert.deepEqual(Object.keys(inspect.input.properties), ["documentId"]);
  assert.deepEqual(inspect.input.required, ["documentId"]);
  assert.equal(inspect.output.additionalProperties, false);
  assert.deepEqual(inspect.output.properties.items.items.required, ["kind", "id", "contentHash"]);
  assert.equal(inspect.output.properties.items.items.additionalProperties, false);
  assert.deepEqual(inspect.output.properties.items.items.properties.kind.enum, ["component", "paragraphStyle", "variable"]);
  assert.deepEqual(inspect.output.properties.publication.properties.contentHash, { type: "string", minLength: 64, maxLength: 64 });
  assert.deepEqual(inspect.output.properties.items.items.properties.contentHash, { type: "string", minLength: 64, maxLength: 64 });
  assert.deepEqual(publish.examples, [{
    name: "Publish a Canvas card library",
    input: { documentId: "092d8d0f-8a53-4e95-b9ff-7ec6e222ddf9", publicItems: [{ kind: "component", id: "card" }] },
  }]);
  assert.deepEqual(inspect.examples, [{
    name: "Inspect the published Canvas library surface",
    input: { documentId: "092d8d0f-8a53-4e95-b9ff-7ec6e222ddf9" },
  }]);

  const handlers = await registered(makeAccount().account, "coverage");
  for (const entry of entries) assert.equal(typeof handlers.get(entry.handler), "function", entry.handler);
});

test("libraries.publish delegates to the workflow and returns the exact committed receipt", async () => {
  const fixture = makeAccount();
  const handlers = await registered(fixture.account, "success");
  const result = await handlers.get("libraries.publish")({ documentId: DOCUMENT_ID });
  assert.equal(result.documentId, DOCUMENT_ID);
  assert.equal(result.published, true);
  assert.match(result.operationId, /^[0-9a-f-]{36}$/u);
  assert.equal(result.sequence, 1);
  assert.match(result.publication.releaseId, /^[0-9a-f-]{36}$/u);
  assert.match(result.publication.contentHash, /^[a-f0-9]{64}$/u);
  assert.match(result.publication.storage.path, /^_canvas\/library-content\/[a-f0-9]{64}$/u);
  assert.equal(result.snapshot.status, "saved");
  assert.deepEqual(fixture.project.snapshot.projection.library.public, [ITEM]);
  assert.equal(fixture.project.snapshot.projection.library.publication.releaseId, result.publication.releaseId);
  assertNoTransportObjects(result);
});

test("explicit empty publicItems publishes an empty surface instead of falling back to the manifest", async () => {
  const fixture = makeAccount();
  const handlers = await registered(fixture.account, "empty");
  const result = await handlers.get("libraries.publish")({ documentId: DOCUMENT_ID, publicItems: [] });
  assert.equal(result.published, true);
  const release = releaseFromBlobs(fixture.blobs);
  assert.deepEqual(release.publicItems, []);
});

test("libraries.publish leaves no head on revision conflict", async () => {
  const fixture = makeAccount({ conflict: true });
  const handlers = await registered(fixture.account, "conflict");
  await assert.rejects(handlers.get("libraries.publish")({ documentId: DOCUMENT_ID }), { code: "CANVAS_DOCUMENT_CONFLICT" });
  assert.equal(fixture.project.snapshot.projection.library.publication, undefined);
  assert.equal(fixture.project.updates.length, 0);
  assert.equal(fixture.calls.some(({ path }) => path === `/projects/${DOCUMENT_ID}/snapshots`), false);
});

test("libraries.publish reports deferred snapshot durability only after the append commits", async () => {
  const fixture = makeAccount({ snapshotFailure: true });
  const handlers = await registered(fixture.account, "deferred");
  const result = await handlers.get("libraries.publish")({ documentId: DOCUMENT_ID });
  assert.equal(result.published, true);
  assert.deepEqual(result.snapshot, { status: "deferred", code: "CANVAS_LIBRARY_SNAPSHOT_DEFERRED" });
  assert.equal(fixture.project.updates.length, 1);
});

test("libraries.inspect returns only the validated current public surface and performs no writes", async () => {
  const fixture = makeAccount();
  const handlers = await registered(fixture.account, "inspect");
  const published = await handlers.get("libraries.publish")({ documentId: DOCUMENT_ID });
  const before = fixture.calls.length;
  const result = await handlers.get("libraries.inspect")({ documentId: DOCUMENT_ID });
  const release = releaseFromBlobs(fixture.blobs);
  assert.deepEqual(result, {
    documentId: DOCUMENT_ID,
    publication: { releaseId: published.publication.releaseId, contentHash: published.publication.contentHash },
    items: release.publicItems,
  });
  assertNoTransportObjects(result);
  assert.equal(result.release, undefined);
  assert.equal(result.assets, undefined);
  assert.equal(result.retentions, undefined);
  assert.ok(fixture.calls.slice(before).length > 0);
  assert.ok(fixture.calls.slice(before).every(({ method }) => method === "GET"));
});

test("libraries.inspect propagates denied and unpublished source states without writes", async () => {
  const denied = makeAccount({ denied: true });
  const deniedHandlers = await registered(denied.account, "denied");
  await assert.rejects(deniedHandlers.get("libraries.inspect")({ documentId: DOCUMENT_ID }), { code: "CANVAS_LIBRARY_ACCESS_DENIED" });
  assert.ok(denied.calls.every(({ method }) => method === "GET"));

  const unpublished = makeAccount({ unpublished: true });
  const unpublishedHandlers = await registered(unpublished.account, "unpublished");
  await assert.rejects(unpublishedHandlers.get("libraries.inspect")({ documentId: DOCUMENT_ID }), { code: "CANVAS_LIBRARY_UNPUBLISHED" });
  assert.ok(unpublished.calls.every(({ method }) => method === "GET"));
  assert.equal(unpublished.calls.some(({ path }) => /\/blobs\/[a-f0-9]{64}\?offset=/u.test(path)), false);
});
