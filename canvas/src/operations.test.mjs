import assert from "node:assert/strict";
import test from "node:test";
import { encodeJson } from "./codec.mjs";

test("tab-targeted operations use the public request-object invoke contract", async () => {
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
  const calls = [];
  const context = {
    tab: {
      id: "tab-1",
      async invoke(request) {
        calls.push(request);
      },
    },
  };

  assert.deepEqual(
    await handlers.get("selection.set")({ nodeId: "node-1" }, context),
    { tabId: "tab-1", nodeId: "node-1" },
  );
  assert.deepEqual(
    await handlers.get("viewport.focus")({ nodeId: "node-2" }, context),
    { tabId: "tab-1", nodeId: "node-2" },
  );
  assert.deepEqual(calls, [
    { operation: "selection.set", input: { nodeId: "node-1" } },
    { operation: "viewport.focus", input: { nodeId: "node-2" } },
  ]);
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
