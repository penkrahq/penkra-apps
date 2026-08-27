import assert from "node:assert/strict";
import test from "node:test";

import { registerAppsOperations } from "./operations.js";

function harness(overrides = {}) {
  const handlers = new Map();
  const installed = [
    {
      id: "com.example.canvas",
      spaceId: "personal",
      slug: "canvas",
      name: "Canvas",
      summary: "Create designs.",
      version: "1.2.0",
    },
  ];
  const calls = [];
  const installations = {
    getState: async () => ({
      installed: [
        ...installed,
        {
          id: "com.example.other",
          spaceId: "other",
          slug: "other",
          name: "Other",
          summary: "Another Space.",
          version: "1.0.0",
        },
        {
          id: "com.example.hidden",
          spaceId: "personal",
          slug: "hidden",
          name: "Hidden",
          summary: "Unavailable here.",
          version: "1.0.0",
        },
      ],
      spaces: [
        { appId: "com.example.canvas", spaceId: "personal", enabled: true },
        { appId: "com.example.hidden", spaceId: "personal", enabled: false },
        { appId: "com.example.other", spaceId: "other", enabled: true },
      ],
    }),
    installRegistry: async (input) => (calls.push(["install", input]), { installed }),
    updateRegistry: async (input) => (calls.push(["update", input]), { installed }),
    uninstall: async (input) => (calls.push(["uninstall", input]), { installed: [] }),
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

test("lists only Apps available in the invocation Space without leaking operation catalogs", async () => {
  const app = harness();
  assert.deepEqual(await app.invoke("list", {}), {
    apps: [
      {
        id: "com.example.canvas",
        slug: "canvas",
        name: "Canvas",
        description: "Create designs.",
        version: "1.2.0",
      },
    ],
    pageInfo: { nextCursor: null },
  });
});

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
  await app.invoke("installations.uninstall", {
    appId: "com.example.canvas",
    retainData: true,
  });
  await app.invoke("installations.remove-data", { appId: "com.example.canvas" });
  assert.deepEqual(app.calls, [
    [
      "install",
      {
        slug: "canvas",
        version: "1.2.0",
        spaceId: "personal",
        permissions: { "network-fetch": "granted" },
      },
    ],
    [
      "uninstall",
      {
        appId: "com.example.canvas",
        spaceId: "personal",
        retainData: true,
      },
    ],
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
      "installations.uninstall",
      { appId: "com.example.canvas", retainData: true },
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
