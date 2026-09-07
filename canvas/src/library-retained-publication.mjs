import { createHash } from "node:crypto";

import { normalizeImportRecord } from "./canvas-imports.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";
import { buildRetainedCanvasImports } from "./library-retained-imports.mjs";

// Prepare a new semantic release entirely from consumer-owned retained
// closures. This is preparation only: no retained or release bytes are
// written, and no upstream source resolver is consulted.
export async function prepareRetainedLibraryRelease(api, document, options = {}) {
  const snapshot = snapshotDocument(document);
  const libraryId = identifier(options.libraryId, "libraryId");
  const releaseId = identifier(options.releaseId, "releaseId");
  const ownedAssets = snapshotAssets(options.assets ?? []);
  const aliases = Object.keys(snapshot.imports ?? {});

  if (aliases.length === 0) {
    // Treat an omitted imports member as the canonical empty record while
    // still sending malformed present values through the same validator.
    const validationDocument = snapshot.imports === undefined ? { ...snapshot, imports: {} } : snapshot;
    buildRetainedCanvasImports(validationDocument, new Map());
    return createResult(snapshot, libraryId, releaseId, ownedAssets, [], []);
  }

  const storage = createLibraryStorage(api);
  const retentionsByAlias = new Map();
  const normalizedByAlias = new Map();
  for (const alias of aliases) {
    const normalized = normalizeImportRecord(snapshot.imports[alias]);
    normalizedByAlias.set(alias, normalized);
    if (!normalized.retention) {
      throw importError(`Import ${alias} requires an accepted retention descriptor.`, "CANVAS_IMPORT_RETENTION_REQUIRED");
    }
    if (!normalized.releaseId || !normalized.contentHash) {
      throw importError(`Import ${alias} has no accepted release identity.`, "CANVAS_IMPORT_INTEGRITY");
    }
    // readRetention validates and detaches the authenticated retained bundle.
    // The document snapshot and normalized locator are immutable for this call.
    retentionsByAlias.set(alias, await storage.readRetention(libraryId, normalized.retention));
  }

  // This is the single validation/materialization boundary for every retained
  // alias, including cross-document public references, private local closure,
  // dependency closure, cycles, and asset namespaces.
  const validated = buildRetainedCanvasImports(snapshot, retentionsByAlias);
  const dependencies = aliases.map((alias) => {
    const identity = validated.imports[alias]?.identity;
    if (!identity) throw importError(`Import ${alias} has no retained release identity.`, "CANVAS_IMPORT_INTEGRITY");
    return { alias, ...identity };
  });

  const semanticDocument = structuredClone(snapshot);
  for (const alias of aliases) {
    const record = { ...normalizedByAlias.get(alias) };
    delete record.retention;
    semanticDocument.imports[alias] = record;
  }
  if (semanticDocument.library?.publication !== undefined) delete semanticDocument.library.publication;

  const descriptors = ownedAssets.map(({ bytes, ...asset }) => ({
    ...asset,
    sha256: hash(bytes),
    size: bytes.byteLength,
  }));
  const release = createLibraryRelease(semanticDocument, {
    libraryId,
    releaseId,
    dependencies,
    assets: descriptors,
  });
  const assets = new Map(ownedAssets.map(({ path, bytes }) => [path, new Uint8Array(bytes)]));
  const retentions = aliases.map((alias) => ({ alias, retention: structuredClone(retentionsByAlias.get(alias)) }));
  return { release, assets, retentions };
}

function createResult(snapshot, libraryId, releaseId, ownedAssets, dependencies, retentions) {
  const semanticDocument = structuredClone(snapshot);
  if (semanticDocument.library?.publication !== undefined) delete semanticDocument.library.publication;
  const descriptors = ownedAssets.map(({ bytes, ...asset }) => ({ ...asset, sha256: hash(bytes), size: bytes.byteLength }));
  const release = createLibraryRelease(semanticDocument, { libraryId, releaseId, dependencies, assets: descriptors });
  return {
    release,
    assets: new Map(ownedAssets.map(({ path, bytes }) => [path, new Uint8Array(bytes)])),
    retentions,
  };
}

function snapshotDocument(document) {
  try { return structuredClone(document); }
  catch { throw invalid("Canvas document cannot be snapshotted."); }
}

function snapshotAssets(assets) {
  if (!Array.isArray(assets)) throw invalid("Owned assets must be an array.");
  const seen = new Set();
  return assets.map((asset) => {
    if (!plainObject(asset) || typeof asset.path !== "string" || !asset.path || !(asset.bytes instanceof Uint8Array)) {
      throw invalid(`Asset ${asset?.path ?? ""} requires its owned bytes.`);
    }
    if (seen.has(asset.path)) throw invalid(`Asset ${asset.path} is duplicated.`);
    seen.add(asset.path);
    if (asset.mimeType !== undefined && typeof asset.mimeType !== "string") throw invalid(`Asset ${asset.path} has invalid MIME metadata.`);
    return { path: asset.path, bytes: new Uint8Array(asset.bytes), ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }) };
  });
}

function identifier(value, name) {
  if (typeof value !== "string" || !value || /[\u0000-\u001f\u007f]/u.test(value)) throw invalid(`${name} must be a non-empty identifier.`);
  return value;
}

function hash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function invalid(message) { return Object.assign(new Error(message), { code: "CANVAS_LIBRARY_INVALID" }); }
function importError(message, code = "CANVAS_IMPORT_INTEGRITY") { return Object.assign(new Error(message), { code }); }
