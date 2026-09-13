// Controller results cross the JSON-only tab bridge. A 512 KiB binary chunk remains comfortably
// below the bridge's 1 MiB limit after base64 expansion and response metadata are included.
const BINARY_CHUNK_BYTES = 512 * 1024;
const MAX_PREVIEW_BYTES = 64 * 1024 * 1024;

export async function chooseExplorerRoot(files = runtimeFiles()) {
  return files.pick("directory");
}

export async function restoreExplorerRoot(files = runtimeFiles()) {
  const handles = await files.list();
  return handles.find((handle) => handle.kind === "directory") ?? handles[0] ?? null;
}

export async function rememberExplorerRoot() {
  // Runtime v2 handles already survive iframe reloads for the current desktop session.
}

export async function forgetExplorerRoot(handle, files = runtimeFiles()) {
  if (handle?.id) await files.revoke(handle.id);
}

export function listDirectory(root, relativePath = "", files) {
  if (root?.path) return invoke("explorer.listDirectory", root, relativePath);
  return (files ?? runtimeFiles()).listDirectory(root.id, relativePath || undefined);
}

export function statEntry(root, relativePath = "", files) {
  if (root?.path) return invoke("explorer.stat", root, relativePath);
  return (files ?? runtimeFiles()).stat(root.id, relativePath || undefined);
}

export async function readEntry(root, relativePath, files) {
  if (root?.path) {
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
      if (result.complete) break;
      if (bytes.byteLength === 0) throw new Error("Explorer could not finish reading this file.");
    } while (offset <= MAX_PREVIEW_BYTES);
    return new Blob(chunks);
  }
  const scopedFiles = files ?? runtimeFiles();
  const metadata = await scopedFiles.stat(root.id, relativePath || undefined);
  if (metadata.kind !== "file") throw new TypeError(`${relativePath} is not a file.`);
  if (metadata.size > MAX_PREVIEW_BYTES) throw new Error("Preview exceeds Explorer's 64 MB limit.");
  const chunks = [];
  let offset = 0;
  do {
    const result = await scopedFiles.readBinary({
      handleId: root.id,
      relativePath: relativePath || undefined,
      offset,
      length: BINARY_CHUNK_BYTES,
    });
    chunks.push(result.bytes);
    offset += result.bytes.byteLength;
    if (result.complete) break;
    if (result.bytes.byteLength === 0) throw new Error("Explorer could not finish reading this file.");
  } while (offset <= MAX_PREVIEW_BYTES);
  return new Blob(chunks);
}

export function writeTextEntry(root, relativePath, source, files) {
  if (root?.path) return invoke("explorer.writeText", root, relativePath, { source });
  return (files ?? runtimeFiles()).writeText(root.id, source, relativePath || undefined);
}

export function createDirectory(root, parentPath, name, files) {
  if (root?.path) return invoke("explorer.createDirectory", root, join(parentPath, name));
  return (files ?? runtimeFiles()).createDirectory(root.id, join(parentPath, name));
}

export function watchEntry(root, relativePath, listener, files) {
  if (root?.path) {
    let stopped = false;
    const watch = async () => {
      while (!stopped) {
        const result = await invoke("explorer.watch", root, relativePath);
        if (stopped) return;
        if (result.changed) listener();
      }
    };
    void watch().catch((error) => {
      if (!stopped) console.warn("[explorer] Controller watch stopped.", error);
    });
    return Promise.resolve(() => { stopped = true; });
  }
  return (files ?? runtimeFiles()).watch(root.id, relativePath || undefined, listener);
}

export function resolveEntryPath(root, relativePath = "") {
  if (!root?.path) throw new Error("This Explorer location does not expose a filesystem path.");
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
  if (!files) throw new Error("Explorer requires Penkra's scoped file service.");
  return files;
}

function invoke(handler, root, relativePath, extra = {}) {
  const controller = globalThis.penkra?.controller;
  if (!controller) throw new Error("Explorer requires its Node controller.");
  return controller.invoke(handler, {
    rootPath: root.path,
    ...(relativePath ? { relativePath } : {}),
    ...extra,
  });
}
