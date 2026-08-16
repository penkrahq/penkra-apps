import assert from "node:assert/strict";
import test from "node:test";

import {
  chooseExplorerRoot,
  createDirectory,
  listDirectory,
  readEntry,
  restoreExplorerRoot,
  writeTextEntry,
} from "./explorer-files.mjs";

function fileHandle(name, source = "hello") {
  const writes = [];
  return {
    kind: "file",
    name,
    writes,
    async getFile() {
      return { name, size: source.length, lastModified: 0, text: async () => source };
    },
    async createWritable() {
      return {
        write: async (value) => writes.push(value),
        close: async () => writes.push("closed"),
        abort: async () => writes.push("aborted"),
      };
    },
  };
}

function directoryHandle(name, values = {}) {
  return {
    kind: "directory",
    name,
    values,
    async *entries() { yield* Object.entries(values); },
    async getDirectoryHandle(child, options) {
      if (!values[child] && options?.create) values[child] = directoryHandle(child);
      const result = values[child];
      if (result?.kind !== "directory") throw new DOMException("Missing", "NotFoundError");
      return result;
    },
  };
}

test("the native directory picker is the only root authority", async () => {
  const root = directoryHandle("Designs");
  const original = globalThis.showDirectoryPicker;
  globalThis.showDirectoryPicker = async (options) => {
    assert.deepEqual(options, { mode: "readwrite" });
    return root;
  };
  try {
    assert.equal(await chooseExplorerRoot(), root);
  } finally {
    globalThis.showDirectoryPicker = original;
  }
});

test("picker cancellation is a no-op and not a fallback", async () => {
  const original = globalThis.showDirectoryPicker;
  globalThis.showDirectoryPicker = async () => { throw new DOMException("Cancelled", "AbortError"); };
  try {
    assert.equal(await chooseExplorerRoot(), null);
  } finally {
    globalThis.showDirectoryPicker = original;
  }
});

test("native handles provide deterministic traversal, reads, writes, and folder creation", async () => {
  const note = fileHandle("note.txt");
  const root = directoryHandle("Designs", { docs: directoryHandle("docs", { "note.txt": note }) });
  assert.deepEqual(await listDirectory(root, "docs"), [{
    kind: "file",
    name: "note.txt",
    relativePath: "docs/note.txt",
    size: 5,
    modifiedAt: "1970-01-01T00:00:00.000Z",
  }]);
  assert.equal(await (await readEntry(root, "docs/note.txt")).text(), "hello");
  await writeTextEntry(root, "docs/note.txt", "updated");
  assert.deepEqual(note.writes, ["updated", "closed"]);
  await createDirectory(root, "docs", "new-folder");
  assert.equal(root.values.docs.values["new-folder"].kind, "directory");
  await assert.rejects(readEntry(root, "../secret"), /Invalid relative file path/);
});

test("restoration returns only a still-granted native handle", async () => {
  const original = globalThis.indexedDB;
  const granted = { queryPermission: async () => "granted" };
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        const transaction = {
          objectStore: () => ({
            get: () => {
              const get = {};
              queueMicrotask(() => { get.result = granted; get.onsuccess(); });
              return get;
            },
          }),
        };
        request.result = { transaction: () => transaction, close: () => undefined };
        request.onsuccess();
        setTimeout(() => transaction.oncomplete(), 0);
      });
      return request;
    },
  };
  try {
    assert.equal(await restoreExplorerRoot(), granted);
  } finally {
    globalThis.indexedDB = original;
  }
});
