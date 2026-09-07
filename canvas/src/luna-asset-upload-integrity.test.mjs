import assert from "node:assert/strict";
import test from "node:test";

import { createCanvasApi } from "./canvas-api.mjs";

const projectId = "upload/project";
const requested = { path: "images/original.png", sha256: "requested-hash", mimeType: "image/png", bytes: Uint8Array.of(1, 2, 3, 4, 5) };

function response(status, value) {
  return { status, headers: {}, body: new TextEncoder().encode(JSON.stringify(value)) };
}

function body(input) {
  return input.body === undefined ? undefined : JSON.parse(new TextDecoder().decode(input.body));
}

function runtime(handler) {
  const calls = [];
  return {
    calls,
    runtime: { account: { request: async (input) => { calls.push({ ...input, body: body(input) }); return handler(input, calls); } } },
  };
}

function baseAsset(overrides = {}) {
  return { path: requested.path, sha256: requested.sha256, mimeType: requested.mimeType, bytes: new Uint8Array(requested.bytes), ...overrides };
}

function assertReceiptInvalid(promise) {
  return assert.rejects(promise, { code: "CANVAS_ASSET_UPLOAD_RECEIPT_INVALID" });
}

test("upload snapshots metadata, bytes, and caller path before asynchronous requests", async () => {
  let releaseStart;
  let releaseFirstPart;
  let markFirstPart;
  const startGate = new Promise((resolve) => { releaseStart = resolve; });
  const firstPartGate = new Promise((resolve) => { releaseFirstPart = resolve; });
  const firstPartSeen = new Promise((resolve) => { markFirstPart = resolve; });
  const { runtime: fakeRuntime, calls } = runtime((input) => {
    if (input.path.endsWith("/blobs/uploads")) return startGate.then(() => response(201, { status: "uploading", uploadId: "upload-1", chunkSize: 2 }));
    if (input.path.endsWith("/parts")) {
      if (body(input).part === 1) { markFirstPart(); return firstPartGate.then(() => response(201, { received: true })); }
      return response(201, { received: true });
    }
    if (input.path.endsWith("/complete")) return response(200, { blob: { path: "backend/normalized.png", sha256: requested.sha256, size: requested.bytes.byteLength, mimeType: requested.mimeType } });
    throw new Error(`Unexpected request ${input.path}`);
  });
  const api = createCanvasApi(fakeRuntime);
  const asset = baseAsset();
  const pending = api.uploadAsset(projectId, asset);

  asset.path = "mutated/path.png";
  asset.sha256 = "mutated-hash";
  asset.mimeType = "image/jpeg";
  asset.bytes.fill(9);
  releaseStart();
  await firstPartSeen;
  asset.path = "mutated/again.png";
  asset.sha256 = "mutated-again";
  asset.mimeType = "image/gif";
  asset.bytes.fill(8);
  releaseFirstPart();

  const result = await pending;
  assert.deepEqual(calls[0].body, {
    path: requested.path, sha256: requested.sha256, size: requested.bytes.byteLength, mimeType: requested.mimeType,
  });
  assert.deepEqual(calls.filter((call) => call.path.endsWith("/parts")).map((call) => call.body), [
    { part: 1, bytes: "AQI=" }, { part: 2, bytes: "AwQ=" }, { part: 3, bytes: "BQ==" },
  ]);
  assert.deepEqual(result, { path: requested.path, sha256: requested.sha256, size: 5, mimeType: requested.mimeType });
});

test("ready receipts accept omitted MIME and preserve the requested path over backend normalization", async () => {
  const { runtime: fakeRuntime } = runtime(() => response(200, {
    status: "ready", blob: { path: "backend/path.png", sha256: requested.sha256, size: requested.bytes.byteLength },
  }));
  const result = await createCanvasApi(fakeRuntime).uploadAsset(projectId, baseAsset());
  assert.deepEqual(result, { path: requested.path, sha256: requested.sha256, size: requested.bytes.byteLength });
});

test("ready receipts reject missing or mismatched identity, arrays, and requested MIME", async () => {
  const receipts = [
    ["missing hash", { size: 5 }],
    ["wrong hash", { sha256: "wrong", size: 5 }],
    ["missing size", { sha256: requested.sha256 }],
    ["wrong size", { sha256: requested.sha256, size: 4 }],
    ["array", []],
    ["wrong MIME", { sha256: requested.sha256, size: 5, mimeType: "image/jpeg" }],
  ];
  for (const [name, blob] of receipts) {
    const { runtime: fakeRuntime } = runtime(() => response(200, { status: "ready", blob }));
    await assertReceiptInvalid(createCanvasApi(fakeRuntime).uploadAsset(projectId, baseAsset()), name);
  }
});

test("multipart completion receipts enforce identity and requested MIME", async () => {
  const receipts = [
    ["missing hash", { size: 5 }],
    ["wrong hash", { sha256: "wrong", size: 5 }],
    ["missing size", { sha256: requested.sha256 }],
    ["wrong size", { sha256: requested.sha256, size: 4 }],
    ["array", []],
    ["wrong MIME", { sha256: requested.sha256, size: 5, mimeType: "image/jpeg" }],
  ];
  for (const [name, blob] of receipts) {
    const { runtime: fakeRuntime } = runtime((input) => {
      if (input.path.endsWith("/blobs/uploads")) return response(201, { status: "uploading", uploadId: "upload-1", chunkSize: 10 });
      if (input.path.endsWith("/parts")) return response(201, { received: true });
      if (input.path.endsWith("/complete")) return response(200, { blob });
      throw new Error(`Unexpected request ${input.path}`);
    });
    await assertReceiptInvalid(createCanvasApi(fakeRuntime).uploadAsset(projectId, baseAsset()), name);
  }
});

test("invalid uploading chunk sizes fail before the first part", async () => {
  for (const chunkSize of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, "2", null]) {
    const { calls, runtime: fakeRuntime } = runtime((input) => {
      if (input.path.endsWith("/blobs/uploads")) return response(201, { status: "uploading", uploadId: "upload-1", chunkSize });
      throw new Error(`Unexpected request ${input.path}`);
    });
    await assertReceiptInvalid(createCanvasApi(fakeRuntime).uploadAsset(projectId, baseAsset()), `chunkSize=${String(chunkSize)}`);
    assert.equal(calls.filter((call) => call.path.endsWith("/parts")).length, 0);
  }
});
