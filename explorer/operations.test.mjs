import assert from "node:assert/strict";
import test from "node:test";

globalThis.penkra = { operations: { handle() {} } };
const { openResource } = await import("./operations.js");

test("navigates an explicitly targeted Explorer tab", async () => {
  let navigation = null;
  const result = await openResource({ handleId: "handle-1", kind: "file", name: "README.md" }, { tab: { id: "tab-1", navigate: async (value) => (navigation = value) } });
  assert.equal(result.tabId, "tab-1");
  assert.deepEqual(navigation, { route: "/open", state: { handleId: "handle-1", kind: "file", name: "README.md" } });
});

test("opens a new Explorer tab when no target was supplied", async () => {
  const result = await openResource({ handleId: "handle-2", kind: "directory", name: "Penkra" }, { tabs: { open: async () => ({ id: "tab-2" }) } });
  assert.deepEqual(result, { tabId: "tab-2" });
});
