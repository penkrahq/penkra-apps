import assert from "node:assert/strict";
import * as FS from "node:fs/promises";
import * as Path from "node:path";
import test from "node:test";

let registered;
const controllerHandlers = new Map();
globalThis.penkra = {
  operations: {
    handle(key, handler) {
      registered = { key, handler };
    },
  },
  controller: {
    handle(key, handler) {
      controllerHandlers.set(key, handler);
    },
  },
};

const { openResource } = await import("./operations.js");
const manifest = JSON.parse(
  await FS.readFile(new URL("./penkra-app.json", import.meta.url), "utf8"),
);

test("declares path delivery for the path-based resource operation", () => {
  const handlers = manifest.contributions.handlers.filter(
    (handler) => handler.operation === "resources.open",
  );
  assert.deepEqual(
    handlers.map((handler) => [handler.intent, handler.input]),
    [
      ["open-file", "path"],
      ["open-directory", "path"],
    ],
  );
});

test("registers the Explorer resource operation", () => {
  assert.equal(registered.key, "resources.open");
  assert.equal(registered.handler, openResource);
});

test("opens a file through its parent directory and selects it", async () => {
  const opened = [];
  const invoked = [];
  const result = await openResource(
    { path: Path.join(import.meta.dirname, "app.js") },
    {
      tabs: {
        async open(input) {
          opened.push(input);
          return {
            id: "tab-1",
            async invoke(request) { invoked.push(request); },
          };
        },
      },
    },
  );
  assert.deepEqual(opened, [{ route: "/" }]);
  assert.deepEqual(invoked, [{
    operation: "resources.open",
    input: { path: import.meta.dirname, selectedRelativePath: "app.js" },
  }]);
  assert.deepEqual(result, { tabId: "tab-1" });
});

test("reuses an explicitly targeted Explorer tab", async () => {
  const invoked = [];
  const result = await openResource(
    { path: import.meta.dirname },
    {
      tab: {
        id: "tab-2",
        async invoke(input) {
          invoked.push(input);
        },
      },
    },
  );
  assert.equal(invoked[0].input.path, import.meta.dirname);
  assert.equal(invoked[0].operation, "resources.open");
  assert.deepEqual(result, { tabId: "tab-2" });
});

test("returns controller file chunks as JSON-safe base64", async () => {
  const readBinary = controllerHandlers.get("explorer.readBinary");
  const result = await readBinary({
    rootPath: import.meta.dirname,
    relativePath: "operations.test.mjs",
    offset: 0,
    length: 32,
  });
  assert.equal(typeof result.base64, "string");
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.match(Buffer.from(result.base64, "base64").toString("utf8"), /^import assert/);
});
