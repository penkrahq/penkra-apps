import { createHash } from "node:crypto";
import { validateLibraryStorageDescriptor } from "./canvas-schema.mjs";
import { normalizeImportRecord } from "./canvas-imports.mjs";
import { validateLibraryRelease } from "./library-publication.mjs";
import { preparePublishedLibraryRetention } from "./library-published-retention.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";
import { buildRetainedCanvasImports, validateRetainedCanvasRetention } from "./library-retained-imports.mjs";

const PREFIX = "_canvas/library-content/";
const MIME = "application/vnd.penkra.canvas.library+json";
const SCHEMA = "com.penkra.canvas.stored-library/1";

// All durable bytes go through the public document blob API. Content-addressed
// paths never reuse a logical name for different bytes. The returned descriptor
// is the commit point: callers must not attach it to a document before success.
// An interrupted write may leave unreferenced blobs, but never a partial receipt.
export function createLibraryStorage(api) {
  if (typeof api?.uploadAsset !== "function" || typeof api?.readAsset !== "function") {
    throw invalid("CANVAS_LIBRARY_STORAGE_REQUIRED");
  }

  async function writeBytes(documentId, bytes, mimeType) {
    const owned = new Uint8Array(bytes);
    const sha256 = hash(owned);
    const descriptor = { path: `${PREFIX}${sha256}`, sha256, size: owned.length, mimeType };
    const uploaded = await api.uploadAsset(documentId, { ...descriptor, bytes: owned });
    if (uploaded?.sha256 !== sha256 || uploaded?.size !== owned.length || uploaded?.path !== descriptor.path) {
      throw invalid("CANVAS_IMPORT_INTEGRITY");
    }
    // A successful upload response alone is not a durable readback check.
    await readBytes(documentId, descriptor);
    return descriptor;
  }

  async function readBytes(documentId, descriptor) {
    validateDescriptor(descriptor);
    const result = await api.readAsset(documentId, structuredClone(descriptor));
    if (!(result instanceof Uint8Array) || result.length !== descriptor.size || hash(result) !== descriptor.sha256) {
      throw invalid("CANVAS_IMPORT_INTEGRITY");
    }
    return new Uint8Array(result);
  }

  async function writeEnvelope(documentId, kind, content) {
    return writeBytes(documentId, new TextEncoder().encode(JSON.stringify({ schema: SCHEMA, kind, content })), MIME);
  }

  async function readEnvelope(documentId, descriptor, kind) {
    const bytes = await readBytes(documentId, descriptor);
    let envelope;
    try { envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw invalid("CANVAS_IMPORT_INTEGRITY"); }
    if (envelope?.schema !== SCHEMA || envelope.kind !== kind || !envelope.content) throw invalid("CANVAS_IMPORT_INTEGRITY");
    return envelope.content;
  }

  async function storeAssets(documentId, assets) {
    const stored = [];
    for (const asset of assets) {
      const { bytes, ...metadata } = asset;
      if (!(bytes instanceof Uint8Array) || bytes.length !== asset.size || hash(bytes) !== asset.sha256) {
        throw invalid("CANVAS_IMPORT_INTEGRITY");
      }
      stored.push({ ...metadata, storage: await writeBytes(documentId, bytes, asset.mimeType ?? "application/octet-stream") });
    }
    return stored;
  }

  async function restoreAssets(documentId, assets) {
    if (!Array.isArray(assets)) throw invalid("CANVAS_IMPORT_INTEGRITY");
    const restored = [];
    for (const asset of assets) {
      const { storage, ...metadata } = asset;
      const bytes = await readBytes(documentId, storage);
      if (bytes.length !== metadata.size || hash(bytes) !== metadata.sha256) throw invalid("CANVAS_IMPORT_INTEGRITY");
      restored.push({ ...metadata, bytes });
    }
    return restored;
  }

  async function storeReleaseRetentions(documentId, entries) {
    const stored = [];
    for (const entry of entries) {
      const assets = await storeAssets(documentId, entry.retention.assets);
      stored.push({ alias: entry.alias, retention: { ...entry.retention, assets } });
    }
    return stored;
  }

  return {
    async writeRelease(documentId, prepared) {
      const release = structuredClone(prepared.release);
      const retentions = prepared.retentions === undefined ? undefined : snapshotTransport(prepared.retentions);
      validateLibraryRelease(release);
      if (release.libraryId !== documentId || !(prepared.assets instanceof Map)) throw invalid("CANVAS_LIBRARY_INVALID");
      const ownedAssets = release.assets.map((asset) => ({ ...asset, bytes: prepared.assets.get(asset.path) }));
      // Snapshot caller-owned bytes before the first asynchronous boundary.
      for (const asset of ownedAssets) {
        if (!(asset.bytes instanceof Uint8Array)) throw invalid("CANVAS_IMPORT_INTEGRITY");
        asset.bytes = new Uint8Array(asset.bytes);
      }
      if (retentions !== undefined) validateReleaseRetentions(release, retentions);
      const assets = await storeAssets(documentId, ownedAssets);
      const storedRetentions = retentions === undefined ? undefined : await storeReleaseRetentions(documentId, retentions);
      return writeEnvelope(documentId, "release", { release, assets, ...(storedRetentions === undefined ? {} : { retentions: storedRetentions }) });
    },

    async readRelease(documentId, descriptor) {
      const content = await readEnvelope(documentId, descriptor, "release");
      validateLibraryRelease(content.release);
      if (content.release.libraryId !== documentId) throw invalid("CANVAS_IMPORT_INTEGRITY");
      const storedRetentions = Object.hasOwn(content, "retentions")
        ? validateReleaseRetentions(content.release, content.retentions, { allowStoredAssets: true, checkReferences: false })
        : undefined;
      if (storedRetentions !== undefined) validateRetentionImportIdentities(content.release, storedRetentions);
      const assets = await restoreAssets(documentId, content.assets);
      if (assets.length !== content.release.assets.length) throw invalid("CANVAS_IMPORT_INTEGRITY");
      for (const expected of content.release.assets) {
        const found = assets.filter((asset) => asset.path === expected.path);
        if (found.length !== 1 || found[0].sha256 !== expected.sha256 || found[0].size !== expected.size) throw invalid("CANVAS_IMPORT_INTEGRITY");
      }
      if (storedRetentions === undefined) return { release: content.release, assets: new Map(assets.map((asset) => [asset.path, asset.bytes])) };
      const retentions = [];
      for (const entry of storedRetentions) retentions.push({ alias: entry.alias, retention: { ...entry.retention, assets: await restoreAssets(documentId, entry.retention.assets) } });
      const validatedRetentions = validateReleaseRetentions(content.release, retentions);
      return { release: structuredClone(content.release), assets: new Map(assets.map((asset) => [asset.path, new Uint8Array(asset.bytes)])), retentions: validatedRetentions };
    },

    async retainItems(documentId, release, requestedItems, readers) {
      // Preparation validates each public item and dependency while the source
      // readers still authorize access. Only its minimal closure is retained.
      const root = structuredClone(release);
      const requests = structuredClone(requestedItems);
      validateLibraryRelease(root);
      if (typeof readers?.resolveRelease !== "function") throw invalid("CANVAS_IMPORT_RELEASE_RESOLVER_REQUIRED");
      // Even a previously loaded, asset-free root must be authorized anew for
      // acceptance. Retained reads, in contrast, authorize only the consumer.
      const selected = await readers.resolveRelease({ documentId: root.libraryId, updatePolicy: "pinned", releaseId: root.releaseId, contentHash: root.contentHash });
      validateLibraryRelease(selected);
      if (selected.libraryId !== root.libraryId || selected.releaseId !== root.releaseId || selected.contentHash !== root.contentHash) throw invalid("CANVAS_IMPORT_INTEGRITY");
      const prepared = await prepareLibraryRetention(selected, requests, readers);
      const assets = await storeAssets(documentId, prepared.assets);
      return writeEnvelope(documentId, "retention", { ...prepared, assets });
    },

    async retainPublishedItems(documentId, release, requestedItems, options = {}) {
      const root = structuredClone(release);
      const requests = structuredClone(requestedItems);
      validateLibraryRelease(root);
      if (typeof options.readPublication !== "function") throw invalid("CANVAS_LIBRARY_PUBLICATION_READER_REQUIRED");
      const selected = await options.readPublication({
        documentId: root.libraryId,
        releaseId: root.releaseId,
        contentHash: root.contentHash,
      });
      if (!selected || typeof selected !== "object" || Array.isArray(selected)) throw invalid("CANVAS_IMPORT_INTEGRITY");
      try { validateLibraryRelease(selected.release); }
      catch { throw invalid("CANVAS_IMPORT_INTEGRITY"); }
      if (selected.release.libraryId !== root.libraryId
        || selected.release.releaseId !== root.releaseId
        || selected.release.contentHash !== root.contentHash) {
        throw invalid("CANVAS_IMPORT_INTEGRITY");
      }
      const prepared = await preparePublishedLibraryRetention(selected, requests);
      const assets = await storeAssets(documentId, prepared.assets);
      return writeEnvelope(documentId, "retention", { ...prepared, assets });
    },

    async readRetention(documentId, descriptor) {
      const content = await readEnvelope(documentId, descriptor, "retention");
      // Integrity is anchored by the accepted descriptor, not by re-reading a
      // mutable source or trusting a source document after access was revoked.
      validateRetainedCanvasRetention(content, { allowStoredAssets: true });
      const restored = { ...content, assets: await restoreAssets(documentId, content.assets) };
      validateRetainedCanvasRetention(restored);
      return restored;
    },
  };
}

function validateRetentionImportIdentities(release, entries) {
  for (const entry of entries) {
    let normalized;
    try { normalized = normalizeImportRecord(release.document.imports[entry.alias]); }
    catch { throw invalid("CANVAS_IMPORT_INTEGRITY"); }
    const root = entry.retention.root;
    if (root.libraryId !== normalized.documentId
      || root.releaseId !== normalized.releaseId
      || root.contentHash !== normalized.contentHash) {
      throw invalid("CANVAS_IMPORT_INTEGRITY");
    }
  }
}

export function isLibraryStorageAsset(asset) { return typeof asset?.path === "string" && asset.path.startsWith(PREFIX); }
export { validateLibraryStorageDescriptor };

function snapshotTransport(value) {
  try { return structuredClone(value); }
  catch { throw invalid("CANVAS_IMPORT_INTEGRITY"); }
}

function validateReleaseRetentions(release, retentions, options = {}) {
  if (!Array.isArray(retentions)) throw invalid("CANVAS_IMPORT_INTEGRITY");
  const imports = release?.document?.imports;
  if (!plainObject(imports)) throw invalid("CANVAS_IMPORT_INTEGRITY");
  const aliases = Object.keys(imports);
  const seen = new Set();
  const entries = [];
  for (const entry of retentions) {
    if (!plainObject(entry) || Object.keys(entry).some((key) => !["alias", "retention"].includes(key)) || typeof entry.alias !== "string" || !entry.alias || seen.has(entry.alias)) throw invalid("CANVAS_IMPORT_INTEGRITY");
    seen.add(entry.alias);
    if (!Object.hasOwn(imports, entry.alias)) throw invalid("CANVAS_IMPORT_INTEGRITY");
    validateRetentionShape(entry.retention, options.allowStoredAssets === true);
    try { validateRetainedCanvasRetention(entry.retention, { allowStoredAssets: options.allowStoredAssets === true }); }
    catch { throw invalid("CANVAS_IMPORT_INTEGRITY"); }
    entries.push({ alias: entry.alias, retention: entry.retention });
  }
  if (seen.size !== aliases.length || aliases.some((alias) => !seen.has(alias))) throw invalid("CANVAS_IMPORT_INTEGRITY");
  if (options.checkReferences !== false) {
    try { buildRetainedCanvasImports(release.document, new Map(entries.map(({ alias, retention }) => [alias, retention]))); }
    catch { throw invalid("CANVAS_IMPORT_INTEGRITY"); }
  }
  return entries;
}

function validateRetentionShape(retention, allowStoredAssets) {
  if (!plainObject(retention) || Object.keys(retention).some((key) => !["root", "requestedItems", "items", "assets"].includes(key))) throw invalid("CANVAS_IMPORT_INTEGRITY");
  if (!Array.isArray(retention.assets)) throw invalid("CANVAS_IMPORT_INTEGRITY");
  for (const asset of retention.assets) {
    if (!plainObject(asset)) throw invalid("CANVAS_IMPORT_INTEGRITY");
    const allowed = allowStoredAssets ? ["release", "path", "sha256", "size", "mimeType", "storage"] : ["release", "path", "sha256", "size", "mimeType", "bytes"];
    if (Object.keys(asset).some((key) => !allowed.includes(key))) throw invalid("CANVAS_IMPORT_INTEGRITY");
    if (allowStoredAssets ? !(Object.hasOwn(asset, "storage") && !Object.hasOwn(asset, "bytes")) : !(asset.bytes instanceof Uint8Array && !Object.hasOwn(asset, "storage"))) throw invalid("CANVAS_IMPORT_INTEGRITY");
  }
}

function validateDescriptor(value) {
  validateLibraryStorageDescriptor(value);
}
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function invalid(code) { return Object.assign(new Error("Canvas library storage failed validation."), { code }); }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
