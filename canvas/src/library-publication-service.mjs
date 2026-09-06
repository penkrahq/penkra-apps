import { createHash } from "node:crypto";
import { loadCanvasImports, normalizeImportRecord } from "./canvas-imports.mjs";
import { createLibraryRelease } from "./library-publication.mjs";

// Prepare an immutable release without writing either the author's document or
// any registry. The persistence adapter must publish this complete result
// atomically; selected dependencies are content identities, never live heads.
export async function prepareLibraryRelease(api, document, options) {
  const snapshot = structuredClone(document);
  const ownedAssets = new Map();
  const assets = (options.assets ?? []).map((asset) => {
    if (!(asset.bytes instanceof Uint8Array)) throw invalid(`Asset ${asset.path} requires its owned bytes.`);
    if (ownedAssets.has(asset.path)) throw invalid(`Asset ${asset.path} is duplicated.`);
    const bytes = new Uint8Array(asset.bytes);
    ownedAssets.set(asset.path, bytes);
    return { path: asset.path, sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.byteLength, ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }) };
  });
  const loaded = await loadCanvasImports(api, snapshot, {
    rootDocumentId: options.libraryId,
    accountId: options.accountId,
    resolveRelease: options.resolveRelease,
    readReleaseAsset: options.readReleaseAsset,
  });
  const dependencies = [];
  for (const [alias, imported] of Object.entries(loaded.imports)) {
    const record = normalizeImportRecord(snapshot.imports[alias]);
    const { libraryId, releaseId, contentHash } = imported.identity;
    dependencies.push({ alias, libraryId, releaseId, contentHash });
    // Retain author update policy while locking the release's accepted content.
    snapshot.imports[alias] = { ...record, releaseId, contentHash };
  }
  return {
    release: createLibraryRelease(snapshot, { libraryId: options.libraryId, releaseId: options.releaseId, dependencies, assets }),
    assets: ownedAssets,
  };
}

function invalid(message) { const error = new Error(message); error.code = "CANVAS_LIBRARY_INVALID"; return error; }
