import assert from "node:assert/strict";
import test from "node:test";

import { registerAppsOperations } from "./operations.js";

function harness(overrides = {}) {
  const handlers = new Map();
  const installed = [{ id: "com.example.canvas", slug: "canvas", version: "1.2.0" }];
  const calls = [];
  const installations = {
    installRegistry: async (input) => (calls.push(["install", input]), { installed }),
    updateRegistry: async (input) => (calls.push(["update", input]), { installed }),
    uninstall: async (input) => (calls.push(["uninstall", input]), { installed: [] }),
    setEnabled: async (input) => (calls.push(["enabled", input]), { installed }),
    removeData: async (input) => (calls.push(["remove-data", input]), { installed }),
    ...overrides,
  };
  const unregister = registerAppsOperations({
    installations,
    operations: {
      handle: (key, handler) => {
        handlers.set(key, handler);
        return () => handlers.delete(key);
      },
    },
  });
  return {
    calls,
    handlers,
    unregister,
    invoke: (key, input, spaceId = "personal", callerKind = "agent", context = {}) =>
      handlers.get(key)(input, {
        invocation: { spaceId },
        caller: { kind: callerKind },
        tabs: { open: async () => ({ id: "apps-tab" }) },
        ...context,
      }),
  };
}

test("routes current-Space lifecycle operations through the trusted bridge", async () => {
  const app = harness();
  assert.deepEqual(
    await app.invoke("installations.install", {
      slug: "canvas",
      version: "1.2.0",
      permissions: { "network-fetch": "granted" },
    }),
    { appId: "com.example.canvas", spaceId: "personal", state: "installed", version: "1.2.0" },
  );
  await app.invoke("installations.disable", { appId: "com.example.canvas" });
  await app.invoke("installations.remove-data", { appId: "com.example.canvas" });
  assert.deepEqual(app.calls, [
    ["install", { slug: "canvas", version: "1.2.0", spaceId: "personal", permissions: { "network-fetch": "granted" } }],
    ["enabled", { appId: "com.example.canvas", spaceId: "personal", enabled: false }],
    ["remove-data", { appId: "com.example.canvas", spaceId: "personal" }],
  ]);
  app.unregister();
  assert.equal(app.handlers.size, 0);
});

test("opens a canonical listing without mutating installations", async () => {
  const app = harness();
  assert.deepEqual(await app.invoke("listings.open", { appId: "com.acme.canvas" }), {
    appId: "com.acme.canvas",
    tabId: "apps-tab",
  });
  await assert.rejects(
    app.invoke("listings.open", { appId: "not-a-canonical-id" }),
    /canonical reverse-domain/,
  );
  assert.deepEqual(app.calls, []);
});

test("rejects installation mutations from another App", async () => {
  const app = harness();
  await assert.rejects(
    app.invoke(
      "installations.disable",
      { appId: "com.example.canvas" },
      "personal",
      "app",
    ),
    /cannot change installations/,
  );
  assert.deepEqual(app.calls, []);
});

test("requires explicit update grants and rejects self-management", async () => {
  const app = harness();
  await assert.rejects(
    app.invoke("installations.update", { slug: "canvas", version: "2.0.0" }),
    /Operation input must be an object/,
  );
  await assert.rejects(
    app.invoke("installations.uninstall", { appId: "com.penkra.apps", retainData: true }),
    /cannot manage its own installation/,
  );
});
