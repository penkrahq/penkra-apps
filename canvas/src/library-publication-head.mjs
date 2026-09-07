import { restoreDocumentModel, materialize } from "./document-model.mjs";
import { validateLibraryStorageDescriptor } from "./canvas-schema.mjs";
import { validateLibraryRelease } from "./library-publication.mjs";
import { createLibraryStorage } from "./library-storage.mjs";

export function createLibraryPublicationHead(release, storage) {
  validateLibraryRelease(release);
  return {
    releaseId: release.releaseId,
    contentHash: release.contentHash,
    storage: validateLibraryStorageDescriptor(storage),
  };
}

export async function readPublishedCanvasLibrary(api, libraryId) {
  const payload = await api.getDocument(libraryId);
  const model = restoreDocumentModel(payload);
  try {
    const source = materialize(model);
    if (source.library?.publication === undefined) throw unpublished();
    const publication = validatePublicationHead(source.library.publication);
    const stored = await createLibraryStorage(api).readRelease(libraryId, publication.storage);
    if (!stored?.release || stored.release.libraryId !== libraryId
      || stored.release.releaseId !== publication.releaseId
      || stored.release.contentHash !== publication.contentHash) {
      throw integrity("Canvas library publication head does not match its stored release.");
    }
    const result = { release: stored.release, assets: stored.assets, publication: structuredClone(publication) };
    if (Object.hasOwn(stored, "retentions")) result.retentions = structuredClone(stored.retentions);
    return result;
  } finally {
    model.doc.destroy();
  }
}

function validatePublicationHead(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["releaseId", "contentHash", "storage"].includes(key))
    || typeof value.releaseId !== "string" || !value.releaseId || /[\u0000-\u001f\u007f]/u.test(value.releaseId)
    || typeof value.contentHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.contentHash)) {
    throw integrity("Canvas library publication head is invalid.");
  }
  let storage;
  try { storage = validateLibraryStorageDescriptor(value.storage); }
  catch { throw integrity("Canvas library publication head storage is invalid."); }
  return { releaseId: value.releaseId, contentHash: value.contentHash, storage };
}

function unpublished() { const error = new Error("Canvas library has no published release head."); error.code = "CANVAS_LIBRARY_UNPUBLISHED"; return error; }
function integrity(message) { const error = new Error(message); error.code = "CANVAS_IMPORT_INTEGRITY"; return error; }
