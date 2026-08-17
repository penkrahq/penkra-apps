import assert from "node:assert/strict";
import test from "node:test";

let registered;
globalThis.penkra = {
  operations: {
    handle(key, handler) {
      registered = { key, handler };
    },
  },
};

const { openResource } = await import("./operations.js");

test("registers the Explorer resource operation", () => {
  assert.equal(registered.key, "resources.open");
  assert.equal(registered.handler, openResource);
});

test("opens a new tab for a scoped handle", async () => {
  const opened = [];
  const result = await openResource(
    { handleId: "handle-1", kind: "file", name: "README.md" },
    {
      tabs: {
        async open(input) {
          opened.push(input);
          return { id: "tab-1" };
        },
      },
    },
  );
  assert.deepEqual(opened, [
    {
      route: "/open",
      state: { id: "handle-1", kind: "file", name: "README.md" },
    },
  ]);
  assert.deepEqual(result, { tabId: "tab-1" });
});

test("reuses an explicitly targeted Explorer tab", async () => {
  const navigated = [];
  const result = await openResource(
    { handleId: "handle-2", kind: "directory", name: "docs" },
    {
      tab: {
        id: "tab-2",
        async navigate(input) {
          navigated.push(input);
        },
      },
    },
  );
  assert.equal(navigated[0].state.id, "handle-2");
  assert.deepEqual(result, { tabId: "tab-2" });
});
