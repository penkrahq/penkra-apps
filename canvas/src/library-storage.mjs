import { createHash } from "node:crypto";
import { validateLibraryRelease } from "./library-publication.mjs";
import { prepareLibraryRetention } from "./library-retention-preparation.mjs";

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

  return {
    async writeRelease(documentId, prepared) {
      const release = structuredClone(prepared.release);
      validateLibraryRelease(release);
      if (release.libraryId !== documentId || !(prepared.assets instanceof Map)) throw invalid("CANVAS_LIBRARY_INVALID");
      const ownedAssets = release.assets.map((asset) => ({ ...asset, bytes: prepared.assets.get(asset.path) }));
      // Snapshot caller-owned bytes before the first asynchronous boundary.
      for (const asset of ownedAssets) {
        if (!(asset.bytes instanceof Uint8Array)) throw invalid("CANVAS_IMPORT_INTEGRITY");
        asset.bytes = new Uint8Array(asset.bytes);
      }
      const assets = await storeAssets(documentId, ownedAssets);
      return writeEnvelope(documentId, "release", { release, assets });
    },

    async readRelease(documentId, descriptor) {
      const content = await readEnvelope(documentId, descriptor, "release");
      validateLibraryRelease(content.release);
      if (content.release.libraryId !== documentId) throw invalid("CANVAS_IMPORT_INTEGRITY");
      const assets = await restoreAssets(documentId, content.assets);
      if (assets.length !== content.release.assets.length) throw invalid("CANVAS_IMPORT_INTEGRITY");
      for (const expected of content.release.assets) {
        const found = assets.filter((asset) => asset.path === expected.path);
        if (found.length !== 1 || found[0].sha256 !== expected.sha256 || found[0].size !== expected.size) throw invalid("CANVAS_IMPORT_INTEGRITY");
      }
      return { release: content.release, assets: new Map(assets.map((asset) => [asset.path, asset.bytes])) };
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

    async readRetention(documentId, descriptor) {
      const content = await readEnvelope(documentId, descriptor, "retention");
      // Integrity is anchored by the accepted descriptor, not by re-reading a
      // mutable source or trusting a source document after access was revoked.
      if (!content.root || !Array.isArray(content.items) || !content.items.length
        || !Array.isArray(content.requestedItems) || !content.requestedItems.length) throw invalid("CANVAS_IMPORT_INTEGRITY");
      return { ...content, assets: await restoreAssets(documentId, content.assets) };
    },
  };
}

export function isLibraryStorageAsset(asset) { return typeof asset?.path === "string" && asset.path.startsWith(PREFIX); }

function validateDescriptor(value) {
  if (!value || !/^[a-f0-9]{64}$/u.test(value.sha256 ?? "") || value.path !== `${PREFIX}${value.sha256}`
    || !Number.isSafeInteger(value.size) || value.size < 0) throw invalid("CANVAS_IMPORT_INTEGRITY");
}
function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function invalid(code) { return Object.assign(new Error("Canvas library storage failed validation."), { code }); }
