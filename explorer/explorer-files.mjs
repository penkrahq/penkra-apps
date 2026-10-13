// Controller results cross the JSON-only tab bridge. A 512 KiB binary chunk remains comfortably
// below the bridge's 1 MiB limit after base64 expansion and response metadata are included.
const BINARY_CHUNK_BYTES = 512 * 1024;
const MAX_PREVIEW_BYTES = 64 * 1024 * 1024;

export async function chooseExplorerRoot(files = runtimeFiles()) {
  const selected = await files.pick("directory");
  return selected === null ? null : { path: selected.path, name: selected.name };
}

export async function restoreExplorerRoot(files = runtimeFiles()) {
  const selected = (await files.list()).find((file) => file.kind === "directory");
  return selected ? { path: selected.path, name: selected.name } : null;
}

export async function forgetExplorerRoot(root, files = runtimeFiles()) {
  const selected = (await files.list()).find((file) => file.path === root.path);
  if (selected) await files.revoke(selected.id);
}

export function listDirectory(root, relativePath = "") {
  return invoke("explorer.listDirectory", root, relativePath);
}

export function statEntry(root, relativePath = "") {
  return invoke("explorer.stat", root, relativePath);
}

export async function readEntry(root, relativePath) {
  const chunks = [];
  let offset = 0;
  do {
    const result = await invoke("explorer.readBinary", root, relativePath, {
      offset,
      length: BINARY_CHUNK_BYTES,
    });
    const bytes = decodeControllerChunk(result.base64);
    chunks.push(bytes);
    offset += bytes.byteLength;
    if (result.complete) return new Blob(chunks);
    if (bytes.byteLength === 0) throw new Error("Explorer could not finish reading this file.");
  } while (offset <= MAX_PREVIEW_BYTES);
  throw new Error("Preview exceeds Explorer's 64 MiB limit.");
}

export function writeTextEntry(root, relativePath, source) {
  return invoke("explorer.writeText", root, relativePath, { source });
}

export function createDirectory(root, parentPath, name) {
  return invoke("explorer.createDirectory", root, join(parentPath, name));
}

export function watchEntry(root, relativePath, listener, ended) {
  const controller = globalThis.penkra?.controller;
  if (!controller) throw new Error("Explorer requires its Node controller.");
  let stopped = false;
  let refreshing = false;
  let pending = false;
  const refresh = async () => {
    if (stopped) return;
    if (refreshing) {
      pending = true;
      return;
    }
    refreshing = true;
    try {
      await listener();
    } catch (error) {
      console.warn("[explorer] Watch refresh failed.", error);
    } finally {
      refreshing = false;
      if (pending && !stopped) {
        pending = false;
        void refresh();
      }
    }
  };
  const stop = controller.subscribe(
    "explorer.watch",
    { rootPath: root.path, relativePath },
    {
      message: () => {
        void refresh();
      },
      end: (error) => {
        if (stopped) return;
        stopped = true;
        if (error) console.warn("[explorer] Controller watch ended.", error);
        ended?.();
      },
    },
  );
  return () => {
    stopped = true;
    stop();
  };
}

export function resolveEntryPath(root, relativePath = "") {
  return invoke("explorer.resolvePath", root, relativePath);
}

function join(parent, name) {
  return parent ? `${parent}/${name}` : name;
}

function decodeControllerChunk(value) {
  if (typeof value !== "string") throw new Error("Explorer received an invalid file chunk.");
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function runtimeFiles() {
  const files = globalThis.penkra?.files;
  if (!files) throw new Error("Explorer requires Penkra's file picker.");
  return files;
}

function invoke(handler, root, relativePath, extra = {}) {
  const controller = globalThis.penkra?.controller;
  if (!controller) throw new Error("Explorer requires its Node controller.");
  return controller.invoke(handler, {
    rootPath: root.path,
    relativePath,
    ...extra,
  });
}
