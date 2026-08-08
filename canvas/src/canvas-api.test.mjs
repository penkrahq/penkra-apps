import assert from "node:assert/strict";
import test from "node:test";

import { createCanvasApi } from "./canvas-api.mjs";

test("Canvas API stays inside the Canvas namespace", async () => {
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
  assert.equal(calls[0].path, "/canvas/documents?limit=100");
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
    "document:document-id",
    listener,
    { onConnectionStateChange },
  ]);
});
