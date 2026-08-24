import assert from "node:assert/strict";
import test from "node:test";
import { decodeJson, encodeJson } from "./codec.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";

function response(status, value) {
  return { status, headers: {}, body: value === null ? new Uint8Array() : encodeJson(value) };
}

function readableDocumentAccount(source, requests) {
  const model = createDocumentModel(source);
  const state = encodeState(model);
  model.doc.destroy();
  return {
    async request(request) {
      requests.push(request);
      if (request.path === "/projects/document-1?chunked=auto") {
        return response(200, {
          id: "document-1",
          title: "Design",
          access: "owner",
          ownerAccountId: "account-1",
          snapshot: { throughSequence: 7, state, projection: source },
          updates: [],
        });
      }
      if (request.path === "/projects/document-1/blobs") return response(200, { items: [] });
      throw new Error(`Unexpected request ${request.method} ${request.path}`);
    },
    subscribe() {},
  };
}

test("registers only the public document lifecycle, execute, and sharing surface", async () => {
  const handlers = new Map();
  globalThis.penkra = {
    account: { request() {}, subscribe() {} },
    operations: {
      handle(name, handler) {
        handlers.set(name, handler);
      },
    },
  };
  await import(`./operations.mjs?test=${Date.now()}`);
  const context = {
    tab: {
      id: "tab-1",
      async navigate() {},
    },
  };
  assert.deepEqual([...handlers.keys()].sort(), [
    "documents.create",
    "documents.delete",
    "documents.execute",
    "documents.list",
    "documents.open",
    "sharing.add",
    "sharing.list",
    "sharing.remove",
  ]);
  assert.deepEqual(
    await handlers.get("documents.open")({ documentId: "document-1" }, context),
    { documentId: "document-1", tabId: "tab-1" },
  );
});

test("documents.delete requires exact current-title confirmation without decoding the document", async () => {
  const handlers = new Map();
  const requests = [];
  globalThis.penkra = {
    account: {
      async request(request) {
        requests.push(request);
        if (request.method === "DELETE") {
          return { status: 204, body: new Uint8Array() };
        }
        return {
          status: 200,
          body: encodeJson({
            items: [
              {
                id: "bbae45e7-a867-42c6-9727-af47f4644c23",
                title: "Unreadable draft",
                access: "owner",
              },
            ],
            pageInfo: { nextCursor: null },
          }),
        };
      },
      subscribe() {},
    },
    operations: {
      handle(name, handler) {
        handlers.set(name, handler);
      },
    },
  };
  await import(`./operations.mjs?delete-test=${Date.now()}`);
  const remove = handlers.get("documents.delete");

  await assert.rejects(
    remove({
      documentId: "bbae45e7-a867-42c6-9727-af47f4644c23",
      confirmTitle: "wrong title",
    }),
    { code: "CANVAS_DOCUMENT_DELETE_CONFIRMATION_MISMATCH" },
  );
  assert.equal(requests.some((request) => request.method === "DELETE"), false);

  assert.deepEqual(
    await remove({
      documentId: "bbae45e7-a867-42c6-9727-af47f4644c23",
      confirmTitle: "Unreadable draft",
    }),
    {
      documentId: "bbae45e7-a867-42c6-9727-af47f4644c23",
      title: "Unreadable draft",
      deleted: true,
    },
  );
  assert.equal(
    requests.some(
      (request) =>
        request.method === "DELETE" &&
        request.path === "/projects/bbae45e7-a867-42c6-9727-af47f4644c23",
    ),
    true,
  );
});

test("read-only execute reports real inspection without advancing the source sequence", async () => {
  const handlers = new Map();
  const requests = [];
  globalThis.penkra = {
    account: readableDocumentAccount(
      {
        version: "2.15",
        children: [
          { id: "frame", type: "frame", x: 10, y: 20, width: 200, height: 100, children: [] },
        ],
      },
      requests,
    ),
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?read-test=${Date.now()}`);
  const result = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: 'Print(Get("#frame")[0].bounds); return "frame";',
  });

  assert.equal(result.changed, false);
  assert.equal(result.sequence, 7);
  assert.deepEqual(result.touchedNodeIds, []);
  assert.equal(result.prints[0].width, 200);
  assert.equal(requests.some((request) => request.method === "POST"), false);
});

test("invalid execute output fails before any shared update or snapshot write", async () => {
  const handlers = new Map();
  const requests = [];
  globalThis.penkra = {
    account: readableDocumentAccount({ version: "2.15", children: [] }, requests),
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?invalid-test=${Date.now()}`);

  await assert.rejects(
    handlers.get("documents.execute")({
      documentId: "document-1",
      code: 'Insert(null, { id: "broken" });',
    }),
    /non-empty string type/,
  );
  assert.equal(requests.some((request) => request.method === "POST"), false);
});

test("execute uploads a direct image before committing its durable asset path", async () => {
  const handlers = new Map();
  const requests = [];
  const source = {
    version: "2.15",
    children: [
      { id: "hero", type: "frame", x: 0, y: 0, width: 400, height: 240, children: [] },
    ],
  };
  const base = readableDocumentAccount(source, requests);
  globalThis.penkra = {
    account: {
      ...base,
      async request(request) {
        if ((request.method ?? "GET") === "GET") return base.request(request);
        requests.push(request);
        if (request.path === "/projects/document-1/blobs/uploads") {
          const input = decodeJson(request.body);
          return response(200, {
            status: "ready",
            blob: {
              path: input.path,
              sha256: input.sha256,
              size: input.size,
              mimeType: input.mimeType,
            },
          });
        }
        if (request.path === "/projects/document-1/updates") {
          return response(200, { sequence: 8 });
        }
        if (request.path === "/projects/document-1/snapshot-uploads") {
          return response(200, { uploadId: "snapshot-1", chunkSize: 1024 * 1024 });
        }
        if (request.path === "/projects/snapshot-uploads/snapshot-1/parts") {
          return response(200, null);
        }
        if (request.path === "/projects/snapshot-uploads/snapshot-1/complete") {
          return response(200, { throughSequence: 8 });
        }
        throw new Error(`Unexpected request ${request.method} ${request.path}`);
      },
    },
    operations: { handle: (name, handler) => handlers.set(name, handler) },
  };
  await import(`./operations.mjs?image-test=${Date.now()}`);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const result = await handlers.get("documents.execute")({
    documentId: "document-1",
    code: `Update("#hero", { fill: { type: "image", mode: "fill", url: "data:image/png;base64,${png.toString("base64")}" } });`,
  });

  assert.equal(result.changed, true);
  assert.equal(result.sequence, 8);
  const uploadIndex = requests.findIndex(
    (request) => request.path === "/projects/document-1/blobs/uploads",
  );
  const updateIndex = requests.findIndex(
    (request) => request.path === "/projects/document-1/updates",
  );
  assert.ok(uploadIndex >= 0 && updateIndex > uploadIndex);
  const snapshotStart = requests.find(
    (request) => request.path === "/projects/document-1/snapshot-uploads",
  );
  assert.match(decodeJson(snapshotStart.body).projection.sha256, /^[a-f0-9]{64}$/u);
  const projectionParts = requests
    .filter((request) => request.path === "/projects/snapshot-uploads/snapshot-1/parts")
    .map((request) => decodeJson(request.body))
    .filter((part) => part.kind === "projection")
    .sort((left, right) => left.part - right.part);
  const projection = decodeJson(
    Buffer.concat(projectionParts.map((part) => Buffer.from(part.bytes, "base64"))),
  );
  assert.match(projection.children[0].fill.url, /^images\/[a-f0-9]{64}\.png$/u);
});
