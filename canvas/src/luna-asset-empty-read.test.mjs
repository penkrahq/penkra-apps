import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createCanvasApi } from "./canvas-api.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";

const projectId = "project/immutable";
const sha256 = "sha256-empty-fixture";
const assetPath = "images/empty.bin";
const emptyAsset = Object.freeze({ sha256, size: 0, path: assetPath });

function response(status, value) {
  return {
    status,
    headers: {},
    body: new TextEncoder().encode(JSON.stringify(value)),
  };
}

function fixtureTransport(reply, calls) {
  return {
    account: {
      request: async (input) => { calls.push({ path: input.path, method: input.method }); return reply(input); },
    },
  };
}

test("zero-byte asset performs one authenticated GET and returns an empty Uint8Array", async () => {
  const calls = [];
  const api = createCanvasApi(fixtureTransport(() => response(200, { bytes: "", complete: true }), calls));
  const result = await api.readAsset(projectId, emptyAsset);
  assert.ok(result instanceof Uint8Array);
  assert.equal(result.byteLength, 0);
  assert.deepEqual(calls, [{ path: `/projects/${encodeURIComponent(projectId)}/blobs/${sha256}?offset=0`, method: "GET" }]);
  assert.deepEqual(emptyAsset, { sha256, size: 0, path: assetPath });
});

test("zero-byte access denial propagates after exactly one GET", async () => {
  const calls = [];
  const api = createCanvasApi(fixtureTransport(() => response(403, { code: "ASSET_FORBIDDEN", message: "Asset access denied" }), calls));
  await assert.rejects(api.readAsset(projectId, emptyAsset), (error) => error.code === "ASSET_FORBIDDEN" && error.status === 403 && /Asset access denied/u.test(error.message));
  assert.deepEqual(calls, [{ path: `/projects/${encodeURIComponent(projectId)}/blobs/${sha256}?offset=0`, method: "GET" }]);
});

test("zero-byte missing blob propagates after exactly one GET", async () => {
  const calls = [];
  const api = createCanvasApi(fixtureTransport(() => response(404, { code: "BLOB_NOT_FOUND", message: "Blob not found" }), calls));
  await assert.rejects(api.readAsset(projectId, emptyAsset), (error) => error.code === "BLOB_NOT_FOUND" && error.status === 404 && /Blob not found/u.test(error.message));
  assert.deepEqual(calls, [{ path: `/projects/${encodeURIComponent(projectId)}/blobs/${sha256}?offset=0`, method: "GET" }]);
});

test("empty incomplete response rejects promptly without a retry", async () => {
  const calls = [];
  const api = createCanvasApi(fixtureTransport(() => response(200, { bytes: "", complete: false }), calls));
  await assert.rejects(api.readAsset(projectId, emptyAsset), /Empty asset range for images\/empty\.bin\./u);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { path: `/projects/${encodeURIComponent(projectId)}/blobs/${sha256}?offset=0`, method: "GET" });
});

test("nonzero one-range asset behavior remains unchanged", async () => {
  const calls = [];
  const asset = Object.freeze({ sha256: "sha256-one-range", size: 3, path: "images/one.bin" });
  const api = createCanvasApi(fixtureTransport(() => response(200, { bytes: "AQID", complete: true }), calls));
  assert.deepEqual(await api.readAsset(projectId, asset), Uint8Array.of(1, 2, 3));
  assert.deepEqual(calls, [{ path: `/projects/${encodeURIComponent(projectId)}/blobs/${asset.sha256}?offset=0`, method: "GET" }]);
  assert.deepEqual(asset, { sha256: "sha256-one-range", size: 3, path: "images/one.bin" });
});

test("nonzero multi-range asset behavior and offsets remain unchanged", async () => {
  const calls = [];
  const asset = Object.freeze({ sha256: "sha256-multi-range", size: 5, path: "images/multi.bin" });
  const replies = [{ bytes: "AQI=", complete: false }, { bytes: "AwQF", complete: true }];
  const api = createCanvasApi(fixtureTransport(() => response(200, replies.shift()), calls));
  assert.deepEqual(await api.readAsset(projectId, asset), Uint8Array.of(1, 2, 3, 4, 5));
  assert.deepEqual(calls, [
    { path: `/projects/${encodeURIComponent(projectId)}/blobs/${asset.sha256}?offset=0`, method: "GET" },
    { path: `/projects/${encodeURIComponent(projectId)}/blobs/${asset.sha256}?offset=2`, method: "GET" },
  ]);
  assert.deepEqual(asset, { sha256: "sha256-multi-range", size: 5, path: "images/multi.bin" });
});

test("storage rejects a ready but unpersisted zero-byte blob after an authenticated GET", async () => {
  const projectId = "zero-byte-library";
  const empty = new Uint8Array();
  const emptySha256 = createHash("sha256").update(empty).digest("hex");
  const emptyPath = "images/empty.bin";
  const document = { axes: {}, imports: {}, paragraphStyles: {}, variables: {}, children: [] };
  const release = createLibraryRelease(document, {
    libraryId: projectId,
    releaseId: "zero-byte-release",
    assets: [{ path: emptyPath, sha256: emptySha256, size: 0, mimeType: "application/octet-stream" }],
  });
  const calls = [];
  const persisted = new Map();
  const uploads = new Map();
  let nextUpload = 1;
  const account = {
    request: async (input) => {
      const body = input.body === undefined ? undefined : JSON.parse(new TextDecoder().decode(input.body));
      calls.push({ path: input.path, method: input.method, body });
      const url = new URL(`https://canvas.test${input.path}`);
      const segments = url.pathname.slice("/projects".length).split("/").filter(Boolean).map(decodeURIComponent);
      const [documentId, resource, name, suffix] = segments;
      if (documentId !== projectId || resource !== "blobs") return response(404, { code: "TEST_UNKNOWN_ENDPOINT", message: input.path });
      if (name === "uploads" && input.method === "POST" && suffix === undefined) {
        if (body.size === 0) {
          // Model the delivery bug: the API returns a ready receipt but never
          // persists the empty blob that a storage readback must authenticate.
          return response(200, { status: "ready", blob: { sha256: body.sha256, size: 0, mimeType: body.mimeType } });
        }
        const uploadId = `upload-${nextUpload++}`;
        uploads.set(uploadId, { metadata: body, parts: new Map() });
        return response(200, { status: "upload", uploadId, chunkSize: 2 });
      }
      if (resource === "blobs" && name === "uploads" && segments[4] === "parts" && input.method === "POST") {
        const upload = uploads.get(segments[3]);
        if (!upload) return response(404, { code: "TEST_UPLOAD_MISSING", message: "missing upload" });
        upload.parts.set(body.part, Uint8Array.from(Buffer.from(body.bytes, "base64")));
        return response(200, { ok: true });
      }
      if (resource === "blobs" && name === "uploads" && segments[4] === "complete" && input.method === "POST") {
        const upload = uploads.get(segments[3]);
        if (!upload) return response(404, { code: "TEST_UPLOAD_MISSING", message: "missing upload" });
        const ordered = [...upload.parts.keys()].sort((left, right) => left - right)
          .flatMap((part) => [...upload.parts.get(part)]);
        const content = Uint8Array.from(ordered);
        persisted.set(upload.metadata.sha256, content);
        uploads.delete(segments[3]);
        return response(200, { blob: { sha256: upload.metadata.sha256, size: content.length, mimeType: upload.metadata.mimeType } });
      }
      if (resource === "blobs" && segments.length === 3 && input.method === "GET") {
        const content = persisted.get(name);
        if (!content) return response(404, { code: "BLOB_NOT_FOUND", message: "Blob not found" });
        const offset = Number(url.searchParams.get("offset") ?? 0);
        const chunk = content.subarray(offset);
        return response(200, { bytes: Buffer.from(chunk).toString("base64"), complete: true });
      }
      return response(404, { code: "TEST_UNKNOWN_ENDPOINT", message: input.path });
    },
  };
  const api = createCanvasApi({ account });
  const store = createLibraryStorage(api);
  let receipt;
  await assert.rejects(
    (async () => { receipt = await store.writeRelease(projectId, { release, assets: new Map([[emptyPath, empty]]) }); })(),
    { code: "BLOB_NOT_FOUND" },
  );
  assert.equal(receipt, undefined);
  assert.deepEqual(calls.filter(({ method }) => method === "GET"), [{
    path: `/projects/${encodeURIComponent(projectId)}/blobs/${emptySha256}?offset=0`,
    method: "GET",
    body: undefined,
  }]);
  assert.equal(calls.some(({ path }) => /\/complete$/u.test(path)), false);
  assert.equal(persisted.has(emptySha256), false);
});
