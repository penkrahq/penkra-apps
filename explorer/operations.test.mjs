import assert from "node:assert/strict";
import * as FS from "node:fs/promises";
import * as OS from "node:os";
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
  const result = await openResource(
    { path: Path.join(import.meta.dirname, "app.js") },
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
      state: { path: import.meta.dirname, selectedRelativePath: "app.js" },
    },
  ]);
  assert.deepEqual(result, { tabId: "tab-1" });
});

test("reuses an explicitly targeted Explorer tab", async () => {
  const navigated = [];
  const result = await openResource(
    { path: import.meta.dirname },
    {
      tab: {
        id: "tab-2",
        async navigate(input) {
          navigated.push(input);
        },
      },
    },
  );
  assert.equal(navigated[0].state.path, import.meta.dirname);
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

test("controller operations reject symlinks that escape the opened root", async (context) => {
  const fixture = await FS.mkdtemp(Path.join(OS.tmpdir(), "penkra-explorer-root-"));
  const outside = await FS.mkdtemp(Path.join(OS.tmpdir(), "penkra-explorer-outside-"));
  context.after(async () => {
    await Promise.all([
      FS.rm(fixture, { recursive: true, force: true }),
      FS.rm(outside, { recursive: true, force: true }),
    ]);
  });
  await FS.writeFile(Path.join(outside, "private.txt"), "private", "utf8");
  await FS.symlink(outside, Path.join(fixture, "outside"), process.platform === "win32" ? "junction" : "dir");

  const escaped = { rootPath: fixture, relativePath: "outside/private.txt" };
  await assert.rejects(
    controllerHandlers.get("explorer.readBinary")({ ...escaped, offset: 0, length: 16 }),
    /escapes its root/,
  );
  await assert.rejects(
    controllerHandlers.get("explorer.writeText")({ ...escaped, source: "overwritten" }),
    /escapes its root/,
  );
  await assert.rejects(
    controllerHandlers.get("explorer.createDirectory")({
      rootPath: fixture,
      relativePath: "outside/new-folder",
    }),
    /escapes its root/,
  );
  assert.equal(await FS.readFile(Path.join(outside, "private.txt"), "utf8"), "private");
  await assert.rejects(FS.stat(Path.join(outside, "new-folder")), { code: "ENOENT" });
});
