import assert from "node:assert/strict";
import * as FS from "node:fs/promises";
import NodeFS from "node:fs";
import { EventEmitter } from "node:events";
import { tmpdir } from "node:os";
import * as Path from "node:path";
import test from "node:test";

let registered;
const controllerHandlers = new Map();
const subscriptions = new Map();
globalThis.penkra = {
  operations: {
    handle(key, handler) {
      registered = { key, handler };
    },
  },
  controller: {
    subscription(key, handler) {
      subscriptions.set(key, handler);
    },
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

test("opens the parent of a path root and stops at the filesystem root", async () => {
  const parent = controllerHandlers.get("explorer.parent");
  const result = await parent({ rootPath: import.meta.dirname });
  assert.deepEqual(result, {
    path: Path.dirname(import.meta.dirname),
    name: Path.basename(Path.dirname(import.meta.dirname)),
    childName: Path.basename(import.meta.dirname),
  });
  assert.equal(await parent({ rootPath: Path.parse(import.meta.dirname).root }), null);
  await assert.rejects(parent({ rootPath: "relative/folder" }));
});

test("resolves edited locations and roots file navigation at the parent folder", async () => {
  const location = controllerHandlers.get("explorer.location");
  const parent = Path.dirname(import.meta.dirname);
  const result = await location({ rootPath: parent, path: "explorer/app.js" });
  assert.equal(result.path, import.meta.dirname);
  assert.equal(result.selectedRelativePath, "app.js");
  const upward = await location({ rootPath: import.meta.dirname, path: ".." });
  assert.equal(upward.path, parent);
  assert.equal(upward.selectedRelativePath, undefined);
  await assert.rejects(location({ rootPath: parent, path: "explorer/no-such-location" }));
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
            async invoke(request) {
              invoked.push(request);
            },
          };
        },
      },
    },
  );
  assert.deepEqual(opened, [{ route: "/" }]);
  assert.deepEqual(invoked, [
    {
      operation: "resources.open",
      input: { path: import.meta.dirname, selectedRelativePath: "app.js" },
    },
  ]);
  assert.deepEqual(result, { tabId: "tab-1" });
});

test("navigates the explicitly supplied Explorer tab", async () => {
  const opened = [];
  const invoked = [];
  const result = await openResource(
    { path: import.meta.dirname },
    {
      tab: {
        id: "tab-2",
        async invoke(request) {
          invoked.push(request);
        },
      },
      tabs: {
        async open(input) {
          opened.push(input);
          return {
            id: "tab-3",
            async invoke(request) {
              invoked.push(request);
            },
          };
        },
      },
    },
  );
  assert.deepEqual(opened, []);
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

async function withRoot(t) {
  const root = await FS.realpath(await FS.mkdtemp(Path.join(tmpdir(), "penkra-explorer-")));
  t.after(() => FS.rm(root, { recursive: true, force: true }));
  return root;
}

test("rejects parent escapes and symlink escapes for reads and writes", async (t) => {
  const rootPath = await withRoot(t);
  const outside = await withRoot(t);
  await FS.writeFile(Path.join(outside, "outside.txt"), "unchanged");
  await FS.symlink(outside, Path.join(rootPath, "link"));
  await FS.symlink(Path.join(outside, "missing.txt"), Path.join(rootPath, "dangling"));
  for (const relativePath of ["../outside", "link/outside.txt"]) {
    await assert.rejects(controllerHandlers.get("explorer.stat")({ rootPath, relativePath }));
    await assert.rejects(
      controllerHandlers.get("explorer.writeText")({ rootPath, relativePath, source: "changed" }),
    );
  }
  await assert.rejects(
    controllerHandlers.get("explorer.createDirectory")({ rootPath, relativePath: "link/new" }),
  );
  await assert.rejects(
    controllerHandlers.get("explorer.writeText")({
      rootPath,
      relativePath: "dangling",
      source: "changed",
    }),
  );
  assert.equal(await FS.readFile(Path.join(outside, "outside.txt"), "utf8"), "unchanged");
  await assert.rejects(FS.stat(Path.join(outside, "missing.txt")));
  await controllerHandlers.get("explorer.writeText")({
    rootPath,
    relativePath: "new.txt",
    source: "inside",
  });
  assert.equal(await FS.readFile(Path.join(rootPath, "new.txt"), "utf8"), "inside");
});

test("lists unreadable entries rather than dropping them and uses lstat", async (t) => {
  const rootPath = await withRoot(t);
  await FS.writeFile(Path.join(rootPath, "visible.txt"), "visible");
  await FS.writeFile(Path.join(rootPath, "unreadable.txt"), "unreadable");
  await FS.symlink("absent", Path.join(rootPath, "dangling"));
  const lstat = NodeFS.promises.lstat;
  t.mock.method(NodeFS.promises, "lstat", async (path) => {
    if (path === Path.join(rootPath, "unreadable.txt"))
      throw Object.assign(new Error("denied"), { code: "EACCES" });
    return lstat(path);
  });
  const entries = await controllerHandlers.get("explorer.listDirectory")({
    rootPath,
    relativePath: "",
  });
  assert.deepEqual(entries.map((entry) => entry.name).sort(), [
    "dangling",
    "unreadable.txt",
    "visible.txt",
  ]);
  assert.equal(entries.find((entry) => entry.name === "dangling").kind, "unavailable");
  assert.deepEqual(
    entries.find((entry) => entry.name === "unreadable.txt"),
    {
      kind: "unavailable",
      name: "unreadable.txt",
      relativePath: "unreadable.txt",
      error: "denied",
    },
  );
});

test("a quiet subscription survives two minutes and then sends a real file change", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const rootPath = await withRoot(t);
  const path = Path.join(rootPath, "watched.txt");
  await FS.writeFile(path, "before");
  let changed;
  const change = new Promise((resolve) => {
    changed = resolve;
  });
  const controller = new AbortController();
  t.after(() => controller.abort());
  const end = () => {
    controller.abort();
  };
  await subscriptions.get("explorer.watch")(
    { rootPath, relativePath: "watched.txt" },
    {
      signal: controller.signal,
      send: changed,
      end,
    },
  );
  t.mock.timers.tick(120_001);
  assert.equal(controller.signal.aborted, false);
  await FS.writeFile(path, "after");
  assert.deepEqual(await change, { changed: true });
});

test("watch abort and watcher error close the subscription without timers", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const rootPath = await withRoot(t);
  for (const reason of ["abort", "error"]) {
    const watcher = new EventEmitter();
    let closes = 0;
    watcher.close = () => {
      closes += 1;
    };
    t.mock.method(NodeFS, "watch", () => watcher);
    const controller = new AbortController();
    let ends = 0;
    await subscriptions.get("explorer.watch")(
      { rootPath, relativePath: "" },
      {
        signal: controller.signal,
        send() {},
        end() {
          ends += 1;
          controller.abort();
        },
      },
    );
    if (reason === "abort") controller.abort();
    else watcher.emit("error", new Error(reason));
    assert.equal(closes, 1);
    assert.equal(ends, reason === "error" ? 1 : 0);
    t.mock.restoreAll();
  }
});

test("binary and text writes enforce named byte limits", async (t) => {
  const rootPath = await withRoot(t);
  await FS.writeFile(Path.join(rootPath, "file"), "abc");
  const read = controllerHandlers.get("explorer.readBinary");
  await assert.rejects(
    read({ rootPath, relativePath: "file", offset: 0, length: 1024 * 1024 + 1 }),
  );
  await assert.rejects(read({ rootPath, relativePath: "file", offset: 0 }));
  const file = await FS.open(Path.join(rootPath, "large"), "w");
  await file.truncate(64 * 1024 * 1024 + 1);
  await file.close();
  await assert.rejects(read({ rootPath, relativePath: "large", offset: 0, length: 1 }));
  await assert.rejects(
    controllerHandlers.get("explorer.writeText")({
      rootPath,
      relativePath: "file",
      source: "x".repeat(16 * 1024 * 1024 + 1),
    }),
  );
  assert.equal(await FS.readFile(Path.join(rootPath, "file"), "utf8"), "abc");
});

test("a root under a symlinked parent preserves usable relative paths", async (t) => {
  const root = await withRoot(t);
  const parent = await withRoot(t);
  await FS.symlink(root, Path.join(parent, "alias"));
  await FS.mkdir(Path.join(root, "directory"));
  await FS.writeFile(Path.join(root, "directory", "file"), "contents");
  const rootPath = Path.join(parent, "alias", "directory");
  const entries = await controllerHandlers.get("explorer.listDirectory")({
    rootPath,
    relativePath: "",
  });
  assert.deepEqual(
    entries.map((entry) => entry.relativePath),
    ["file"],
  );
  const entry = await controllerHandlers.get("explorer.stat")({
    rootPath,
    relativePath: entries[0].relativePath,
  });
  assert.equal(entry.relativePath, "file");
  const read = await controllerHandlers.get("explorer.readBinary")({
    rootPath,
    relativePath: entry.relativePath,
    offset: 0,
    length: 8,
  });
  assert.equal(Buffer.from(read.base64, "base64").toString(), "contents");
});

test("in-root symlinks use target metadata; dangling and escaping links are unavailable", async (t) => {
  const rootPath = await withRoot(t);
  const outside = await withRoot(t);
  await FS.mkdir(Path.join(rootPath, "directory"));
  await FS.writeFile(Path.join(rootPath, "file"), "contents");
  await FS.symlink("directory", Path.join(rootPath, "directory-link"));
  await FS.symlink("file", Path.join(rootPath, "file-link"));
  await FS.symlink("absent", Path.join(rootPath, "dangling"));
  await FS.symlink(outside, Path.join(rootPath, "escaping"));
  const entries = await controllerHandlers.get("explorer.listDirectory")({
    rootPath,
    relativePath: "",
  });
  const directory = entries.find((entry) => entry.name === "directory-link");
  assert.equal(directory.kind, "directory");
  assert.equal(directory.relativePath, "directory-link");
  assert.equal(directory.size, (await FS.stat(Path.join(rootPath, "directory"))).size);
  const file = entries.find((entry) => entry.name === "file-link");
  assert.equal(file.kind, "file");
  assert.equal(file.size, 8);
  assert.equal(file.modifiedAt, (await FS.stat(Path.join(rootPath, "file"))).mtime.toISOString());
  for (const name of ["dangling", "escaping"]) {
    const entry = entries.find((entry) => entry.name === name);
    assert.equal(entry.kind, "unavailable");
    assert.equal(typeof entry.error, "string");
    assert.ok(entry.error.length > 0);
  }
});
