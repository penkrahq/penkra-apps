import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseExplorerRoot,
  createDirectory,
  forgetExplorerRoot,
  listDirectory,
  readEntry,
  resolveEntryPath,
  restoreExplorerRoot,
  watchEntry,
  writeTextEntry,
} from "./explorer-files.mjs";

test("chooses and restores roots by path, and forgets the matching picker grant", async () => {
  const calls = [];
  const file = { id: "root", path: "/workspace", kind: "directory", name: "Workspace" };
  const files = {
    async pick(kind) {
      calls.push(["pick", kind]);
      return file;
    },
    async list() {
      return [file];
    },
    async revoke(id) {
      calls.push(["revoke", id]);
    },
  };
  const root = await chooseExplorerRoot(files);
  assert.deepEqual(root, { path: "/workspace", name: "Workspace" });
  assert.deepEqual(await restoreExplorerRoot(files), root);
  await forgetExplorerRoot(root, files);
  assert.deepEqual(calls, [
    ["pick", "directory"],
    ["revoke", "root"],
  ]);
  assert.equal(
    await chooseExplorerRoot({
      async pick() {
        return null;
      },
    }),
    null,
  );
  assert.equal(
    await restoreExplorerRoot({
      async list() {
        return [];
      },
    }),
    null,
  );
});

test("routes path-backed work through private controller handlers", async () => {
  const calls = [];
  globalThis.penkra = {
    controller: {
      async invoke(handler, input) {
        calls.push([handler, input]);
        if (handler === "explorer.listDirectory") return [];
        if (handler === "explorer.resolvePath") return "/workspace/app.js";
        if (handler === "explorer.readBinary") {
          return { base64: "aGVsbG8=", totalBytes: 5, complete: true };
        }
        return null;
      },
    },
  };
  const root = { path: "/workspace" };
  await listDirectory(root, "src");
  assert.equal(await resolveEntryPath(root, "app.js"), "/workspace/app.js");
  assert.equal(await (await readEntry(root, "README.md")).text(), "hello");
  assert.deepEqual(
    calls.map(([handler]) => handler),
    ["explorer.listDirectory", "explorer.resolvePath", "explorer.readBinary"],
  );
  delete globalThis.penkra;
});

test("directory and editing operations use only path-rooted controller calls", async () => {
  const calls = [];
  globalThis.penkra = {
    controller: {
      async invoke(handler, input) {
        calls.push([handler, input]);
        return [];
      },
    },
  };
  const root = { path: "/workspace" };
  await listDirectory(root);
  await writeTextEntry(root, "file", "next");
  await createDirectory(root, "docs", "notes");
  assert.deepEqual(calls, [
    ["explorer.listDirectory", { rootPath: "/workspace", relativePath: "" }],
    ["explorer.writeText", { rootPath: "/workspace", relativePath: "file", source: "next" }],
    ["explorer.createDirectory", { rootPath: "/workspace", relativePath: "docs/notes" }],
  ]);
  delete globalThis.penkra;
});

test("one persistent watch coalesces refreshes and stops explicitly", async () => {
  let callbacks;
  const calls = [];
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  let refreshed;
  const second = new Promise((resolve) => {
    refreshed = resolve;
  });
  let refreshes = 0;
  const stop = () => {
    calls.push("stop");
  };
  globalThis.penkra = {
    controller: {
      subscribe(name, input, handlers) {
        calls.push([name, input]);
        callbacks = handlers;
        return stop;
      },
    },
  };
  const unsubscribe = watchEntry({ path: "/workspace" }, "", async () => {
    refreshes += 1;
    if (refreshes === 1) await pending;
    else refreshed();
  });
  callbacks.message({ changed: true });
  callbacks.message({ changed: true });
  callbacks.message({ changed: true });
  assert.equal(refreshes, 1);
  release();
  await second;
  assert.equal(refreshes, 2);
  assert.deepEqual(calls, [["explorer.watch", { rootPath: "/workspace", relativePath: "" }]]);
  unsubscribe();
  callbacks.message({ changed: true });
  assert.equal(refreshes, 2);
  assert.equal(calls.at(-1), "stop");
  delete globalThis.penkra;
});

test("an ended watch is marked inactive without rearming", () => {
  let callbacks;
  let calls = 0;
  let ended = 0;
  globalThis.penkra = {
    controller: {
      subscribe(_name, _input, handlers) {
        calls += 1;
        callbacks = handlers;
        return () => {};
      },
    },
  };
  const stop = watchEntry(
    { path: "/workspace" },
    "",
    () => {},
    () => {
      ended += 1;
    },
  );
  callbacks.end();
  callbacks.end();
  stop();
  assert.equal(ended, 1);
  assert.equal(calls, 1);
  delete globalThis.penkra;
});
