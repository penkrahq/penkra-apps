import {
  collectPencilResourceReferences,
  pencilResourceMimeType,
  resolvePencilResourcePath,
} from "./pencil-resources.mjs";

const BINARY_CHUNK_BYTES = 1024 * 1024;

export async function choosePenDocument(files = runtimeFiles()) {
  const root = await files.pick("directory");
  if (!root) return null;
  const entries = await files.listDirectory(root.id);
  const documents = entries.filter((entry) => entry.kind === "file" && entry.name.toLowerCase().endsWith(".pen"));
  if (documents.length === 0) throw new Error("The selected folder does not contain a .pen document.");
  if (documents.length > 1) throw new Error("Choose a folder containing exactly one .pen document.");
  return readPenDocument(files, root, documents[0]);
}

export async function readDroppedPenDocument(dataTransfer, files = runtimeFiles()) {
  const item = [...(dataTransfer?.items ?? [])].find((candidate) => candidate.kind === "file");
  const file = item?.getAsFile?.();
  if (!file || !file.name.toLowerCase().endsWith(".pen")) throw new Error("Drop one .pen file to import it.");
  const source = parsePenSource(await readBrowserTextFile(file));
  if (collectPencilResourceReferences(source).length === 0) {
    return { source, assets: [], fallbackTitle: file.name.replace(/\.pen$/iu, "") };
  }
  const root = await files.pick("directory");
  if (!root) return null;
  const entries = await files.listDirectory(root.id);
  const document = entries.find((entry) => entry.kind === "file" && entry.name === file.name);
  if (!document) throw new Error(`The selected folder does not contain ${file.name}.`);
  return readPenDocument(files, root, document);
}

export async function readPenDocument(files, root, document) {
  if (root?.kind !== "directory" || !root.id) throw new Error("Choose the folder containing the .pen file.");
  if (document?.kind !== "file" || !document.name.toLowerCase().endsWith(".pen")) throw new Error("Choose a .pen file.");
  const relative = document.relativePath || document.name;
  const source = parsePenSource(await readTextFile(files, root.id, relative));
  const base = relative.split("/").slice(0, -1);
  const assets = [];
  const seen = new Set();
  const queue = collectPencilResourceReferences(source).map((resource) => ({
    ...resource,
    containerPath: "",
  }));
  while (queue.length > 0) {
    const resource = queue.shift();
    const path = resolvePencilResourcePath(resource.containerPath, resource.path);
    if (seen.has(path)) continue;
    seen.add(path);
    const logicalPath = resolveReference(base, path).join("/");
    const bytes = await readBinaryFile(files, root.id, logicalPath, path);
    assets.push({
      path,
      bytes,
      kind: resource.kind,
      mimeType: pencilResourceMimeType(path, resource.kind),
      sha256: await sha256(bytes),
    });
    if (resource.kind === "library") {
      const library = parsePenSource(decodeResourceText(bytes, path));
      queue.push(...collectPencilResourceReferences(library).map((dependency) => ({
        ...dependency,
        containerPath: path,
      })));
    }
  }
  return {
    source,
    assets,
    fallbackTitle: document.name.replace(/\.pen$/iu, ""),
  };
}

export async function savePenDocument(source, suggestedName, files = runtimeFiles()) {
  const root = await files.pick("directory");
  if (!root) return false;
  const bytes = new TextEncoder().encode(JSON.stringify(source, null, 2));
  const session = await files.beginWrite({
    handleId: root.id,
    relativePath: suggestedName,
    expectedBytes: bytes.byteLength,
    expectedSha256: await sha256(bytes),
  });
  try {
    for (let offset = 0; offset < bytes.byteLength; offset += session.chunkBytes) {
      await files.writeChunk({
        writeId: session.writeId,
        offset,
        bytes: bytes.subarray(offset, offset + session.chunkBytes),
      });
    }
    await files.commitWrite(session.writeId);
  } catch (error) {
    await files.abortWrite(session.writeId).catch(() => undefined);
    throw error;
  }
  return true;
}

export function parsePenSource(text) {
  let source;
  try {
    source = JSON.parse(text);
  } catch {
    throw new Error("This file is not valid JSON and could not be imported as a .pen document.");
  }
  if (!source || typeof source !== "object" || Array.isArray(source) || !Array.isArray(source.children)) {
    throw new Error("This file does not contain a supported .pen document structure.");
  }
  return source;
}

export function collectImageReferences(source) {
  return collectPencilResourceReferences(source)
    .filter(({ kind }) => kind === "image")
    .map(({ path }) => path);
}

function resolveReference(base, reference) {
  validateReference(reference);
  const output = [...base];
  for (const encodedPart of reference.split("/")) {
    let part;
    try {
      part = decodeURIComponent(encodedPart);
    } catch {
      throw new Error(`Asset reference ${reference} contains invalid URL encoding.`);
    }
    if (part.includes("/") || part.includes("\\") || part.includes("\0")) {
      throw new Error(`Asset reference ${reference} contains an invalid path segment.`);
    }
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!output.length) throw new Error(`Asset ${reference} is outside the selected folder.`);
      output.pop();
    } else {
      output.push(part);
    }
  }
  return output;
}

function validateReference(reference) {
  if (
    !reference ||
    reference.startsWith("/") ||
    reference.startsWith("\\") ||
    reference.includes("\\") ||
    reference.includes("//")
  ) {
    throw new Error(`Asset reference ${reference || "(empty)"} is not a relative URL.`);
  }
  let url;
  try {
    url = new URL(reference, "https://penkra.invalid/");
  } catch {
    throw new Error(`Asset reference ${reference} is not a valid relative URL.`);
  }
  if (url.origin !== "https://penkra.invalid" || /^(?:data|blob|https?):/iu.test(reference)) {
    throw new Error(`Asset reference ${reference} is not a local relative URL.`);
  }
  if (url.search || url.hash || reference.endsWith("/") || /(?:^|\/)\.{1,2}$/u.test(reference)) {
    throw new Error(`Asset reference ${reference} does not identify one local file.`);
  }
}

function decodeResourceText(bytes, reference) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`Referenced Pencil resource ${reference} is not valid UTF-8 text.`);
  }
}

async function readBinaryFile(files, handleId, relativePath, reference) {
  const chunks = [];
  let offset = 0;
  let totalBytes = null;
  try {
    while (totalBytes === null || offset < totalBytes) {
      const result = await files.readBinary({ handleId, relativePath, offset, length: BINARY_CHUNK_BYTES });
      const bytes = result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes);
      totalBytes = result.totalBytes;
      chunks.push(bytes);
      offset += bytes.byteLength;
      if (result.complete) break;
      if (bytes.byteLength === 0) throw new Error(`Could not finish reading referenced Pencil resource ${reference}.`);
    }
  } catch (error) {
    if (error?.message?.includes(`referenced Pencil resource ${reference}`)) throw error;
    throw new Error(`Referenced Pencil resource ${reference} is missing.`);
  }
  const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let cursor = 0;
  for (const chunk of chunks) { output.set(chunk, cursor); cursor += chunk.byteLength; }
  return output;
}

async function readTextFile(files, handleId, relativePath) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks = [];
  let offset = 0;
  let totalBytes = null;
  try {
    while (totalBytes === null || offset < totalBytes) {
      const result = await files.readBinary({
        handleId,
        relativePath,
        offset,
        length: BINARY_CHUNK_BYTES,
      });
      const bytes = result.bytes instanceof Uint8Array ? result.bytes : new Uint8Array(result.bytes);
      totalBytes = result.totalBytes;
      chunks.push(decoder.decode(bytes, { stream: !result.complete }));
      offset += bytes.byteLength;
      if (result.complete) break;
      if (bytes.byteLength === 0) throw new Error("Could not finish reading the .pen document.");
    }
    chunks.push(decoder.decode());
  } catch (error) {
    if (error instanceof TypeError) throw new Error("This .pen document is not valid UTF-8 text.");
    throw error;
  }
  return chunks.join("");
}

async function readBrowserTextFile(file) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks = [];
  try {
    for (let offset = 0; offset < file.size; offset += BINARY_CHUNK_BYTES) {
      const bytes = new Uint8Array(
        await file.slice(offset, offset + BINARY_CHUNK_BYTES).arrayBuffer(),
      );
      chunks.push(decoder.decode(bytes, { stream: offset + bytes.byteLength < file.size }));
    }
    chunks.push(decoder.decode());
  } catch (error) {
    if (error instanceof TypeError) throw new Error("This .pen document is not valid UTF-8 text.");
    throw error;
  }
  return chunks.join("");
}

function runtimeFiles() {
  const files = globalThis.penkra?.files;
  if (!files) throw new Error("Canvas requires Penkra's scoped file service.");
  return files;
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
