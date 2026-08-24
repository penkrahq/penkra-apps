const BINARY_CHUNK_BYTES = 1024 * 1024;
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

export function listDirectory(root, relativePath = "", files = runtimeFiles()) {
  return files.listDirectory(root.id, relativePath || undefined);
}

export function statEntry(root, relativePath = "", files = runtimeFiles()) {
  return files.stat(root.id, relativePath || undefined);
}

export async function readEntry(root, relativePath, files = runtimeFiles()) {
  const metadata = await files.stat(root.id, relativePath || undefined);
  if (metadata.kind !== "file") throw new TypeError(`${relativePath} is not a file.`);
  if (metadata.size > MAX_PREVIEW_BYTES) throw new Error("Preview exceeds Explorer's 64 MB limit.");
  const chunks = [];
  let offset = 0;
  do {
    const result = await files.readBinary({
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

export function writeTextEntry(root, relativePath, source, files = runtimeFiles()) {
  return files.writeText(root.id, source, relativePath || undefined);
}

export function createDirectory(root, parentPath, name, files = runtimeFiles()) {
  return files.createDirectory(root.id, join(parentPath, name));
}

export function watchEntry(root, relativePath, listener, files = runtimeFiles()) {
  return files.watch(root.id, relativePath || undefined, listener);
}

function join(parent, name) {
  return parent ? `${parent}/${name}` : name;
}

function runtimeFiles() {
  const files = globalThis.penkra?.files;
  if (!files) throw new Error("Explorer requires Penkra's scoped file service.");
  return files;
}
