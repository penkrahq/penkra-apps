const DATABASE_NAME = "penkra-explorer";
const STORE_NAME = "handles";
const ROOT_KEY = "root";

export async function chooseExplorerRoot() {
  try {
    return await globalThis.showDirectoryPicker({ mode: "readwrite" });
  } catch (error) {
    if (error?.name === "AbortError") return null;
    throw error;
  }
}

export async function restoreExplorerRoot() {
  const handle = await readStoredRoot();
  if (!handle) return null;
  return (await handle.queryPermission({ mode: "readwrite" })) === "granted" ? handle : null;
}

export function rememberExplorerRoot(handle) {
  return withStore("readwrite", (store) => requestResult(store.put(handle, ROOT_KEY)));
}

export function forgetExplorerRoot() {
  return withStore("readwrite", (store) => requestResult(store.delete(ROOT_KEY)));
}

export async function listDirectory(root, relativePath = "") {
  const directory = await directoryAt(root, relativePath);
  const entries = [];
  for await (const [name, handle] of directory.entries()) {
    entries.push(await describeHandle(handle, join(relativePath, name)));
  }
  return entries;
}

export async function statEntry(root, relativePath = "") {
  if (!relativePath) return describeHandle(root, "");
  const handle = await entryAt(root, relativePath);
  return describeHandle(handle, relativePath);
}

export async function readEntry(root, relativePath) {
  const handle = await entryAt(root, relativePath);
  if (handle.kind !== "file") throw new TypeError(`${relativePath} is not a file.`);
  return handle.getFile();
}

export async function writeTextEntry(root, relativePath, source) {
  const handle = await entryAt(root, relativePath);
  if (handle.kind !== "file") throw new TypeError(`${relativePath} is not a file.`);
  const writable = await handle.createWritable();
  try {
    await writable.write(source);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

export async function createDirectory(root, parentPath, name) {
  const parent = await directoryAt(root, parentPath);
  await parent.getDirectoryHandle(name, { create: true });
}

async function directoryAt(root, relativePath) {
  let directory = root;
  for (const segment of segments(relativePath)) {
    directory = await directory.getDirectoryHandle(segment);
  }
  return directory;
}

async function entryAt(root, relativePath) {
  const parts = segments(relativePath);
  const name = parts.pop();
  if (!name) return root;
  const parent = await directoryAt(root, parts.join("/"));
  for await (const [candidate, handle] of parent.entries()) {
    if (candidate === name) return handle;
  }
  throw new DOMException(`${relativePath} does not exist.`, "NotFoundError");
}

async function describeHandle(handle, relativePath) {
  if (handle.kind === "directory") {
    return { kind: "directory", name: handle.name, relativePath, size: null, modifiedAt: null };
  }
  const file = await handle.getFile();
  return {
    kind: "file",
    name: handle.name,
    relativePath,
    size: file.size,
    modifiedAt: new Date(file.lastModified).toISOString(),
  };
}

function segments(relativePath) {
  if (!relativePath) return [];
  const parts = relativePath.split("/");
  if (parts.some((part) => !part || part === "." || part === ".." || part.includes("\\"))) {
    throw new TypeError("Invalid relative file path.");
  }
  return parts;
}

function join(parent, name) {
  return parent ? `${parent}/${name}` : name;
}

async function readStoredRoot() {
  return withStore("readonly", (store) => requestResult(store.get(ROOT_KEY)));
}

function withStore(mode, operation) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DATABASE_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE_NAME);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const transaction = database.transaction(STORE_NAME, mode);
      let value;
      Promise.resolve(operation(transaction.objectStore(STORE_NAME))).then(
        (result) => { value = result; },
        (error) => { transaction.abort(); reject(error); },
      );
      transaction.oncomplete = () => {
        database.close();
        resolve(value);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error);
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error);
      };
    };
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
