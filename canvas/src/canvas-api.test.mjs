import assert from "node:assert/strict";
import test from "node:test";

import { createCanvasApi } from "./canvas-api.mjs";

test("Canvas API stays inside the generic project namespace", async () => {
  const calls = [];
  const runtime = {
    account: {
      request: async (input) => {
        calls.push(input);
        return {
          status: 200,
          headers: { "content-type": "application/json" },
          body: new TextEncoder().encode('{"items":[],"pageInfo":{"nextCursor":null}}'),
        };
      },
      subscribe: async () => () => undefined,
    },
  };
  const api = createCanvasApi(runtime);
  await api.listDocuments();
  assert.equal(calls[0].path, "/projects?limit=100");
  assert.equal(calls[0].method, "GET");
});

test("Canvas API reports bounded backend errors", async () => {
  const api = createCanvasApi({
    account: {
      request: async () => ({
        status: 403,
        headers: {},
        body: new TextEncoder().encode(
          '{"code":"APP_ACCOUNT_DATA_FORBIDDEN","message":"Canvas is not installed"}',
        ),
      }),
      subscribe: async () => () => undefined,
    },
  });
  await assert.rejects(api.listDocuments(), {
    message: "Canvas is not installed",
    code: "APP_ACCOUNT_DATA_FORBIDDEN",
  });
});

test("Canvas API forwards realtime connection-state listeners", async () => {
  const calls = [];
  const api = createCanvasApi({
    account: {
      request: async () => ({ status: 200, headers: {}, body: new Uint8Array() }),
      subscribe: async (...input) => {
        calls.push(input);
        return () => undefined;
      },
    },
  });
  const listener = () => undefined;
  const onConnectionStateChange = () => undefined;
  await api.subscribe("document-id", listener, { onConnectionStateChange });
  assert.deepEqual(calls[0], [
    "project:document-id",
    listener,
    { onConnectionStateChange },
  ]);
});

test("Canvas maps project projections and exact asset paths without changing the source", async () => {
  const calls = [];
  const responses = new Map([
    ["/projects/project-id", { id: "project-id", snapshot: { projection: { children: [] } } }],
    ["/projects/project-id/blobs", {
      items: [{ path: "images/hero.png", sha256: "abc", size: 3, mimeType: "image/png" }],
    }],
  ]);
  const api = createCanvasApi({
    account: {
      request: async (input) => {
        calls.push(input);
        const value = responses.get(input.path);
        return {
          status: value ? 200 : 201,
          headers: {},
          body: new TextEncoder().encode(JSON.stringify(value ?? { id: "project-id" })),
        };
      },
      subscribe: async () => () => undefined,
    },
  });
  const source = { children: [{ id: "screen", type: "frame" }] };
  await api.createDocument({ title: "Design", source });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(calls[0].body)), {
    title: "Design",
    projection: source,
  });
  const opened = await api.getDocument("project-id");
  assert.deepEqual(opened.snapshot.source, { children: [] });
  assert.deepEqual(opened.assets, [
    { path: "images/hero.png", sha256: "abc", size: 3, mimeType: "image/png" },
  ]);
});

test("Canvas uploads every multipart byte under the exact Pencil asset path", async () => {
  const calls = [];
  const replies = [
    { status: "uploading", uploadId: "upload-id", chunkSize: 2 },
    { part: 1 },
    { part: 2 },
    { status: "ready", blob: { sha256: "hash" } },
  ];
  const api = createCanvasApi({
    account: {
      request: async (input) => ({
        status: input.path.endsWith("/complete") ? 200 : 201,
        headers: {},
        body: new TextEncoder().encode(JSON.stringify((calls.push(input), replies.shift()))),
      }),
      subscribe: async () => () => undefined,
    },
  });
  const result = await api.uploadAsset("project-id", {
    path: "../shared/hero.png",
    sha256: "hash",
    mimeType: "image/png",
    bytes: Uint8Array.of(1, 2, 3),
  });
  assert.deepEqual(result, { sha256: "hash" });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(calls[0].body)), {
    path: "../shared/hero.png",
    sha256: "hash",
    size: 3,
    mimeType: "image/png",
  });
  assert.deepEqual(
    calls.slice(1, 3).map((call) => JSON.parse(new TextDecoder().decode(call.body))),
    [{ part: 1, bytes: "AQI=" }, { part: 2, bytes: "Aw==" }],
  );
});

test("Canvas reassembles bounded asset ranges", async () => {
  const replies = [
    { bytes: "AQI=", complete: false },
    { bytes: "Aw==", complete: true },
  ];
  const api = createCanvasApi({
    account: {
      request: async () => ({
        status: 200,
        headers: {},
        body: new TextEncoder().encode(JSON.stringify(replies.shift())),
      }),
      subscribe: async () => () => undefined,
    },
  });
  assert.deepEqual(
    await api.readAsset("project-id", { sha256: "hash", size: 3 }),
    Uint8Array.of(1, 2, 3),
  );
});
