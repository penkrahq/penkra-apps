import { createHash } from "node:crypto";
import { loadCanvasImports, normalizeImportRecord } from "./canvas-imports.mjs";
import { createLibraryRelease } from "./library-publication.mjs";

// Prepare an immutable release without writing either the author's document or
// any registry. The persistence adapter must publish this complete result
// atomically; selected dependencies are content identities, never live heads.
export async function prepareLibraryRelease(api, document, options) {
  const snapshot = structuredClone(document);
  if (snapshot.library?.publication !== undefined) delete snapshot.library.publication;
  const { libraryId, releaseId, accountId, resolveRelease, readReleaseAsset } = options;
  const ownedAssets = new Map();
  const assets = (options.assets ?? []).map((asset) => {
    if (!(asset.bytes instanceof Uint8Array)) throw invalid(`Asset ${asset.path} requires its owned bytes.`);
    if (ownedAssets.has(asset.path)) throw invalid(`Asset ${asset.path} is duplicated.`);
    const bytes = new Uint8Array(asset.bytes);
    ownedAssets.set(asset.path, bytes);
    return { path: asset.path, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength, ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }) };
  });
  // Retention is consumer-local transport metadata. Normalize the author's
  // records before removing it so accepted follow identities cannot be
  // bypassed by turning a retained import into a latest-release lookup.
  const loadSnapshot = structuredClone(snapshot);
  const normalizedImports = new Map();
  for (const [alias, value] of Object.entries(snapshot.imports ?? {})) {
    const record = normalizeImportRecord(value);
    if (record.retention && record.updatePolicy === "follow"
      && (record.releaseId === undefined || record.contentHash === undefined)) {
      throw importIntegrity(`Following retained import ${record.documentId} needs both accepted releaseId and contentHash.`);
    }
    const semanticRecord = withoutRetention(record);
    normalizedImports.set(alias, semanticRecord);
    loadSnapshot.imports[alias] = semanticRecord;
  }
  const loaded = await loadCanvasImports(api, loadSnapshot, {
    rootDocumentId: libraryId,
    accountId,
    resolveRelease,
    readReleaseAsset,
  });
  const dependencies = [];
  for (const [alias, imported] of Object.entries(loaded.imports)) {
    const record = normalizedImports.get(alias);
    const { libraryId, releaseId, contentHash } = imported.identity;
    dependencies.push({ alias, libraryId, releaseId, contentHash });
    // Retain author update policy while locking the release's accepted content.
    snapshot.imports[alias] = { ...record, releaseId, contentHash };
  }
  return {
    release: createLibraryRelease(snapshot, { libraryId, releaseId, dependencies, assets }),
    assets: ownedAssets,
  };
}

function invalid(message) { const error = new Error(message); error.code = "CANVAS_LIBRARY_INVALID"; return error; }
function importIntegrity(message) { const error = new Error(message); error.code = "CANVAS_IMPORT_INTEGRITY"; return error; }
function withoutRetention(record) {
  const semanticRecord = { ...record };
  delete semanticRecord.retention;
  return semanticRecord;
}
