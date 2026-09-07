import assert from "node:assert/strict";
import test from "node:test";

import { createCanvasApi } from "./canvas-api.mjs";

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
