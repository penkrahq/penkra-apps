import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseExplorerRoot,
  createDirectory,
  forgetExplorerRoot,
  listDirectory,
  readEntry,
  restoreExplorerRoot,
  watchEntry,
  writeTextEntry,
} from "./explorer-files.mjs";

function fakeFiles() {
  const calls = [];
  return {
    calls,
    async pick(kind) {
      calls.push(["pick", kind]);
      return { id: "root", kind: "directory", name: "Workspace" };
    },
    async list() {
      return [{ id: "root", kind: "directory", name: "Workspace" }];
    },
    async revoke(id) {
      calls.push(["revoke", id]);
    },
    async listDirectory(id, path) {
      calls.push(["listDirectory", id, path]);
      return [];
    },
    async stat() {
      return { kind: "file", name: "README.md", relativePath: "README.md", size: 5 };
    },
    async readBinary({ offset }) {
      return { bytes: new TextEncoder().encode("hello").slice(offset), totalBytes: 5, complete: true };
    },
    async writeText(id, source, path) {
      calls.push(["writeText", id, source, path]);
    },
    async createDirectory(id, path) {
      calls.push(["createDirectory", id, path]);
    },
    async watch(id, path, listener) {
      calls.push(["watch", id, path, typeof listener]);
      return () => undefined;
    },
  };
}

test("chooses, restores, and revokes Runtime v2 handles", async () => {
  const files = fakeFiles();
  const selected = await chooseExplorerRoot(files);
  assert.equal(selected.id, "root");
  assert.equal((await restoreExplorerRoot(files)).id, "root");
  await forgetExplorerRoot(selected, files);
  assert.deepEqual(files.calls.slice(0, 2), [["pick", "directory"], ["revoke", "root"]]);
});

test("routes directory and editing work through the scoped service", async () => {
  const files = fakeFiles();
  const root = { id: "root", kind: "directory", name: "Workspace" };
  await listDirectory(root, "docs", files);
  await writeTextEntry(root, "README.md", "next", files);
  await createDirectory(root, "docs", "notes", files);
  await watchEntry(root, "docs", () => undefined, files);
  assert.deepEqual(files.calls, [
    ["listDirectory", "root", "docs"],
    ["writeText", "root", "next", "README.md"],
    ["createDirectory", "root", "docs/notes"],
    ["watch", "root", "docs", "function"],
  ]);
});

test("reads a file through bounded binary chunks", async () => {
  const files = fakeFiles();
  const blob = await readEntry(
    { id: "root", kind: "directory", name: "Workspace" },
    "README.md",
    files,
  );
  assert.equal(await blob.text(), "hello");
});
