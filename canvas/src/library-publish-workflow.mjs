import { createHash, randomUUID } from "node:crypto";
import { Y } from "../collaboration/pen-yjs-model.mjs";
import { restoreDocumentModel, materialize, createDocumentOperationUpdates, encodeUpdate, encodeState, LOCAL_ORIGIN } from "./document-model.mjs";
import { validateCanvasDocument } from "./canvas-schema.mjs";
import { prepareRetainedLibraryRelease } from "./library-retained-publication.mjs";
import { createLibraryStorage, isLibraryStorageAsset } from "./library-storage.mjs";
import { createLibraryPublicationHead } from "./library-publication-head.mjs";

// Public-runtime service, not an operation registration. Publication becomes
// visible only when the revision-guarded document update commits. Blob writes
// precede that point and may leave unreferenced content on failure.
export async function publishCanvasLibrary(api, input) {
  const request = structuredClone(input);
  const documentId = request?.documentId;
  if (typeof documentId !== "string" || !documentId || /[\u0000-\u001f\u007f]/u.test(documentId)) throw failure("CANVAS_LIBRARY_INVALID");
  for (const method of ["getDocument", "readAsset", "uploadAsset", "appendUpdate", "createSnapshot"]) {
    if (typeof api?.[method] !== "function") throw failure("CANVAS_LIBRARY_STORAGE_REQUIRED");
  }
  const payload = structuredClone(await api.getDocument(documentId));
  const expectedSequence = documentSequence(payload);
  const model = restoreDocumentModel(payload);
  try {
    const document = materialize(model);
    const publicItems = request.publicItems ?? document.library?.public;
    if (!Array.isArray(publicItems)) throw failure("CANVAS_LIBRARY_PUBLIC_SURFACE_REQUIRED");
    document.library = { ...(document.library ?? {}), public: structuredClone(publicItems) };
    const validation = validateCanvasDocument(document);
    if (validation.errors.length) throw failure("CANVAS_LIBRARY_INVALID");
    const assets = [];
    for (const descriptor of payload.assets ?? []) {
      if (isLibraryStorageAsset(descriptor)) continue;
      const bytes = await api.readAsset(documentId, structuredClone(descriptor));
      if (!(bytes instanceof Uint8Array) || bytes.length !== descriptor.size
        || createHash("sha256").update(bytes).digest("hex") !== descriptor.sha256) throw failure("CANVAS_IMPORT_INTEGRITY");
      assets.push({ path: descriptor.path, bytes: new Uint8Array(bytes), ...(descriptor.mimeType === undefined ? {} : { mimeType: descriptor.mimeType }) });
    }
    const prepared = await prepareRetainedLibraryRelease(api, document, { libraryId: documentId, releaseId: randomUUID(), assets });
    const storage = await createLibraryStorage(api).writeRelease(documentId, prepared);
    const publication = createLibraryPublicationHead(prepared.release, storage);
    document.library.publication = publication;
    const operationId = randomUUID();
    const updates = createDocumentOperationUpdates(model, document);
    const appended = await api.appendUpdate(documentId, {
      clientUpdateId: randomUUID(), expectedSequence, update: encodeUpdate(updates.forward),
      operation: { id: operationId, inverseUpdate: encodeUpdate(updates.inverse) },
    });
    if (!Number.isSafeInteger(appended?.sequence) || appended.sequence <= expectedSequence) {
      const error = failure("CANVAS_LIBRARY_PUBLICATION_COMMIT_UNKNOWN");
      error.publication = structuredClone(publication);
      error.operationId = operationId;
      throw error;
    }
    Y.applyUpdate(model.doc, updates.forward, LOCAL_ORIGIN);
    const receipt = { documentId, published: true, operationId, sequence: appended.sequence, publication };
    try {
      await api.createSnapshot(documentId, { throughSequence: appended.sequence, state: encodeState(model), source: materialize(model) });
      receipt.snapshot = { status: "saved" };
    } catch {
      // The append is already durable. Snapshot compaction failure must not
      // pretend publication failed or invite an unsafe automatic duplicate.
      receipt.snapshot = { status: "deferred", code: "CANVAS_LIBRARY_SNAPSHOT_DEFERRED" };
    }
    return receipt;
  } finally { model.doc.destroy(); }
}

function documentSequence(payload) {
  const values = [payload?.snapshot?.throughSequence ?? 0, ...(payload?.updates ?? []).map(({ sequence }) => sequence)];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw failure("CANVAS_IMPORT_INTEGRITY");
  return Math.max(...values);
}
function failure(code) { return Object.assign(new Error("Canvas library publication did not complete."), { code }); }
