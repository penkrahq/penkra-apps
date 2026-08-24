import assert from "node:assert/strict";
import test from "node:test";

globalThis.penkra = { operations: { handle() {} } };
const { deliver, deliverToExistingTab } = await import("./operations.js");

test("targets an existing tab point-to-point", async () => {
  const calls = [];
  const result = await deliver(
    { url: "https://penkra.com" },
    {
      tab: {
        invoke: async (input) => {
          calls.push(input);
          return { ok: true };
        },
      },
      tabs: { open: async () => assert.fail("must not open") },
    },
    "pages.navigate",
  );
  assert.deepEqual(calls, [
    { operation: "pages.navigate", input: { url: "https://penkra.com" } },
  ]);
  assert.deepEqual(result, { ok: true });
});

test("opens a Browser tab for untargeted URLs", async () => {
  const opens = [];
  const result = await deliver(
    { url: "https://penkra.com" },
    {
      tabs: {
        open: async (input) => {
          opens.push(input);
          return { id: "tab_1" };
        },
      },
    },
    "pages.open",
  );
  assert.deepEqual(opens, [
    { route: "/", state: { url: "https://penkra.com" } },
  ]);
  assert.deepEqual(result, { tabId: "tab_1" });
});

test("requires the owning Browser tab when closing a page", async () => {
  await assert.rejects(
    deliverToExistingTab({ pageId: "page-1" }, { tabs: {} }, "pages.close"),
    /requires an exact Browser tabId/,
  );
  const calls = [];
  await deliverToExistingTab(
    { pageId: "page-1" },
    { tab: { invoke: async (input) => calls.push(input) } },
    "pages.close",
  );
  assert.deepEqual(calls, [
    { operation: "pages.close", input: { pageId: "page-1" } },
  ]);
});
