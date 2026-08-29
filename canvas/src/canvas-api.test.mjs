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

test("Canvas API exposes recoverable Trash without overloading permanent deletion", async () => {
  const calls = [];
  const api = createCanvasApi({
    account: {
      request: async (input) => {
        calls.push(input);
        return response(200, input.path.includes("/trash")
          ? { items: [], pageInfo: { nextCursor: null } }
          : { id: "document-id" });
      },
      subscribe: async () => () => undefined,
    },
  });

  await api.listTrash("cursor-id");
  await api.deleteDocument("document-id");
  await api.restoreDocument("document-id");
  await api.permanentlyDeleteDocument("document-id");

  assert.deepEqual(calls.map(({ path, method }) => [path, method]), [
    ["/projects/trash?limit=100&cursor=cursor-id", "GET"],
    ["/projects/document-id", "DELETE"],
    ["/projects/document-id/restore", "POST"],
    ["/projects/document-id/permanent", "DELETE"],
  ]);
});

test("Canvas rename sends a bounded JSON PATCH body", async () => {
  const calls = [];
  const api = createCanvasApi({
    account: {
      request: async (input) => {
        calls.push(input);
        return response(200, { id: "document-id", title: "Renamed" });
      },
      subscribe: async () => () => undefined,
    },
  });

  await api.renameDocument("document-id", "Renamed");

  assert.equal(calls[0].path, "/projects/document-id");
  assert.equal(calls[0].method, "PATCH");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(calls[0].body)), { title: "Renamed" });
});

test("Canvas undo posts the exact operation and optimistic head sequence", async () => {
  const calls = [];
  const api = createCanvasApi({
    account: {
      request: async (input) => {
        calls.push(input);
        return response(200, { sequence: 9 });
      },
      subscribe: async () => () => undefined,
    },
  });
  const input = {
    operationId: "aa9a67db-63bf-4cba-937b-f9f0406eecb4",
    clientUpdateId: "8696385d-b65e-4388-ac89-da9f12f12126",
    expectedSequence: 8,
  };

  await api.undoOperation("document-id", input);

  assert.equal(calls[0].path, "/projects/document-id/undo");
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(calls[0].body)), input);
});

test("Canvas requests global image generation inside its document namespace", async () => {
  const calls = [];
  const api = createCanvasApi({
    account: {
      request: async (input) => {
        calls.push(input);
        return response(201, { path: "images/generated.png" });
      },
      subscribe: async () => () => undefined,
    },
  });

  const generated = await api.generateImage("document-id", {
    prompt: "quiet paper studio",
    width: 400,
    height: 240,
  });

  assert.deepEqual(generated, { path: "images/generated.png" });
  assert.equal(calls[0].path, "/projects/document-id/images/generate");
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(calls[0].body)), {
    prompt: "quiet paper studio",
    width: 400,
    height: 240,
  });
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

test("Canvas API subscribes to the account-scoped document collection", async () => {
  const calls = [];
  const listener = () => undefined;
  const api = createCanvasApi({
    account: {
      request: async () => ({ status: 200, body: new Uint8Array() }),
      subscribe: async (...input) => {
        calls.push(input);
        return () => undefined;
      },
    },
  });

  await api.subscribeToDocuments(listener);

  assert.deepEqual(calls, [["projects", listener, undefined]]);
});

test("Canvas maps project projections and exact asset paths without changing the source", async () => {
  const calls = [];
  const responses = new Map([
    ["/projects/snapshot-uploads", { uploadId: "upload-id", projectId: "project-id", chunkSize: 1024 }],
    ["/projects/snapshot-uploads/upload-id/parts", { receivedBytes: 1 }],
    ["/projects/snapshot-uploads/upload-id/complete", { id: "project-id" }],
    ["/projects/project-id?chunked=auto", {
      id: "project-id",
      snapshot: { throughSequence: 0, chunked: true },
      updates: [],
    }],
    ["/projects/project-id/snapshots/0/content?kind=projection&offset=0&length=1048576", {
      bytes: "eyJjaGlsZHJlbiI6W119",
      complete: true,
    }],
    ["/projects/project-id/snapshots/0/content?kind=state&offset=0&length=1048576", {
      bytes: "AQ==",
      complete: true,
    }],
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
          status: input.method === "POST" ? 201 : 200,
          headers: {},
          body: new TextEncoder().encode(JSON.stringify(value)),
        };
      },
      subscribe: async () => () => undefined,
    },
  });
  const source = { children: [{ id: "screen", type: "frame" }] };
  await api.createDocument({ title: "Design", source, initialUpdate: "AQ==" });
  const createMetadata = JSON.parse(new TextDecoder().decode(calls[0].body));
  assert.equal(createMetadata.title, "Design");
  assert.equal(createMetadata.projection.size, JSON.stringify(source).length);
  assert.equal(createMetadata.projection.sha256.length, 64);
  assert.equal(createMetadata.state.size, 1);
  assert.deepEqual(
    calls.slice(1, 3).map((call) => JSON.parse(new TextDecoder().decode(call.body)).kind),
    ["projection", "state"],
  );
  const opened = await api.getDocument("project-id");
  assert.deepEqual(opened.snapshot.source, { children: [] });
  assert.deepEqual(opened.assets, [
    { path: "images/hero.png", sha256: "abc", size: 3, mimeType: "image/png" },
  ]);
});

test("Canvas accepts an automatically inlined snapshot without range requests", async () => {
  const calls = [];
  const projection = { children: [{ id: "screen", type: "frame" }] };
  const api = createCanvasApi({
    account: {
      request: async (input) => {
        calls.push(input.path);
        if (input.path === "/projects/project-id?chunked=auto") {
          return response(200, {
            id: "project-id",
            snapshot: { throughSequence: 0, state: "AQ==", projection },
            updates: [],
          });
        }
        if (input.path === "/projects/project-id/blobs") {
          return response(200, { items: [] });
        }
        throw new Error(`Unexpected request ${input.path}`);
      },
      subscribe: async () => () => undefined,
    },
  });

  const opened = await api.getDocument("project-id");

  assert.deepEqual(opened.snapshot.source, projection);
  assert.deepEqual(calls.sort(), [
    "/projects/project-id/blobs",
    "/projects/project-id?chunked=auto",
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
  assert.deepEqual(result, { sha256: "hash", path: "../shared/hero.png" });
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

test("Canvas restores the requested asset path when an upload is already ready", async () => {
  const api = createCanvasApi({
    account: {
      request: async () => response(200, {
        status: "ready",
        blob: { sha256: "hash", size: 3, mimeType: "image/png" },
      }),
      subscribe: async () => () => undefined,
    },
  });

  const result = await api.uploadAsset("project-id", {
    path: "images/hero.png",
    sha256: "hash",
    mimeType: "image/png",
    bytes: Uint8Array.of(1, 2, 3),
  });

  assert.deepEqual(result, {
    path: "images/hero.png",
    sha256: "hash",
    size: 3,
    mimeType: "image/png",
  });
});

test("Canvas aborts an unfinished snapshot upload after a failed part", async () => {
  const calls = [];
  const api = createCanvasApi({
    account: {
      request: async (input) => {
        calls.push(input);
        if (input.path === "/projects/snapshot-uploads") {
          return response(201, { uploadId: "upload-id", chunkSize: 1 });
        }
        if (input.method === "DELETE") return response(200, { aborted: true });
        return response(503, { code: "TEMPORARY", message: "try later" });
      },
      subscribe: async () => () => undefined,
    },
  });

  await assert.rejects(
    api.createDocument({ title: "Design", source: { children: [] }, initialUpdate: "AQ==" }),
    /try later/,
  );
  assert.equal(calls.at(-1).method, "DELETE");
  assert.equal(calls.at(-1).path, "/projects/snapshot-uploads/upload-id");
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

function response(status, value) {
  return {
    status,
    headers: {},
    body: new TextEncoder().encode(JSON.stringify(value)),
  };
}
