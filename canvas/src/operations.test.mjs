import assert from "node:assert/strict";
import test from "node:test";

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
