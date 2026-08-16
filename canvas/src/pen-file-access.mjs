const PEN_FILE_TYPES = [{
  description: "Pencil document",
  accept: { "application/json": [".pen"] },
}];

export async function choosePenDocument() {
  try {
    const root = await globalThis.showDirectoryPicker({ mode: "read" });
    const [handle] = await globalThis.showOpenFilePicker({
      startIn: root,
      multiple: false,
      types: PEN_FILE_TYPES,
      excludeAcceptAllOption: true,
    });
    if (!handle) return null;
    return readPenDocument(root, handle);
  } catch (error) {
    if (error?.name === "AbortError") return null;
    throw error;
  }
}

export async function readDroppedPenDocument(dataTransfer) {
  const item = [...(dataTransfer?.items ?? [])].find((candidate) => candidate.kind === "file");
  if (!item?.getAsFileSystemHandle) {
    throw new Error("This browser cannot grant a standard filesystem handle for the dropped file.");
  }
  const handle = await item.getAsFileSystemHandle();
  if (!handle || handle.kind !== "file") throw new Error("Drop one .pen file to import it.");
  try {
    const root = await globalThis.showDirectoryPicker({ mode: "read" });
    return readPenDocument(root, handle);
  } catch (error) {
    if (error?.name === "AbortError") return null;
    throw error;
  }
}

export async function readPenDocument(root, handle) {
  if (!handle.name.toLowerCase().endsWith(".pen")) throw new Error("Choose a .pen file.");
  const relative = await root.resolve(handle);
  if (!relative) throw new Error("The .pen file must be inside the selected folder.");
  const source = parsePenSource(await (await handle.getFile()).text());
  const base = relative.slice(0, -1);
  const assets = [];
  for (const reference of collectImageReferences(source)) {
    const logicalPath = resolveReference(base, reference);
    const file = await fileAt(root, logicalPath, reference);
    const bytes = new Uint8Array(await file.arrayBuffer());
    assets.push({
      path: reference,
      bytes,
      mimeType: file.type || mimeTypeFor(reference),
      sha256: await sha256(bytes),
    });
  }
  return {
    source,
    assets,
    fallbackTitle: handle.name.replace(/\.pen$/iu, ""),
  };
}

export async function savePenDocument(source, suggestedName) {
  let handle;
  try {
    handle = await globalThis.showSaveFilePicker({
      suggestedName,
      types: PEN_FILE_TYPES,
      excludeAcceptAllOption: true,
    });
  } catch (error) {
    if (error?.name === "AbortError") return false;
    throw error;
  }
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(source, null, 2));
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
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
  const references = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value) && value.type === "image" && typeof value.url === "string") {
      validateReference(value.url);
      references.add(value.url);
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  visit(source);
  return [...references];
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

async function fileAt(root, parts, reference) {
  let directory = root;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part);
  try {
    return await (await directory.getFileHandle(parts.at(-1))).getFile();
  } catch (error) {
    if (error?.name === "NotFoundError") throw new Error(`Referenced asset ${reference} is missing.`);
    throw error;
  }
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mimeTypeFor(name) {
  const extension = name.split(".").at(-1)?.toLowerCase();
  return ({ gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", svg: "image/svg+xml", webp: "image/webp" })[extension] ?? "application/octet-stream";
}
