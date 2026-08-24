import assert from "node:assert/strict";
import test from "node:test";
import { encodeJson } from "./codec.mjs";
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
