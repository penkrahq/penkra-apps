import { randomUUID } from "node:crypto";

import { validateCanvasDocument } from "./canvas-schema.mjs";
import { createDocumentOperationUpdates, encodeState, encodeUpdate, LOCAL_ORIGIN, materialize, restoreDocumentModel, Y } from "./document-model.mjs";
import { loadRetainedCanvasImports } from "./library-retained-loader.mjs";
import { readPublishedCanvasLibrary } from "./library-publication-head.mjs";
import { createLibraryStorage } from "./library-storage.mjs";

const ALIAS_PATTERN = /^[A-Za-z][\w-]*$/u;

// Accept one immutable published library surface into a consumer document.
// Publication selection and all retained reads remain explicit boundaries:
// this workflow never resolves a source head or falls back to upstream data.
export async function acceptCanvasLibrary(api, input) {
  const request = snapshot(input);
  validateRequest(request);
  requireApi(api);

  const payload = structuredClone(await api.getDocument(request.documentId));
  const expectedSequence = documentSequence(payload);
  const model = restoreDocumentModel(payload);
  try {
    const consumer = materialize(model);
    const existing = consumer.imports?.[request.alias];
    if (existing?.documentId !== undefined && existing.documentId !== request.libraryId) {
      throw failure("CANVAS_IMPORT_ALIAS_CONFLICT");
    }
    const updatePolicy = request.updatePolicy
      ?? (existing?.documentId === request.libraryId && ["follow", "pinned"].includes(existing.updatePolicy)
        ? existing.updatePolicy
        : "follow");
    const selected = await readPublishedCanvasLibrary(api, request.libraryId);
    const proposed = structuredClone(consumer);
    proposed.imports = { ...(consumer.imports ?? {}), [request.alias]: {
      documentId: request.libraryId,
      updatePolicy,
      releaseId: selected.release.releaseId,
      contentHash: selected.release.contentHash,
    } };

    const retention = await createLibraryStorage(api).retainPublishedItems(
      request.documentId,
      selected.release,
      request.items,
      { readPublication: (record) => readPublishedCanvasLibrary(api, record.documentId) },
    );
    proposed.imports[request.alias].retention = retention;

    // Resolve every proposed retained import before touching the consumer Yjs
    // model. This checks the new receipt, existing receipts, public surfaces,
    // private references, and current cross-document references together.
    await loadRetainedCanvasImports(api, proposed, { documentId: request.documentId });
    validateCanvasDocument(proposed);

    const operationId = randomUUID();
    const updates = createDocumentOperationUpdates(model, proposed);
    const appended = await api.appendUpdate(request.documentId, {
      clientUpdateId: randomUUID(),
      update: encodeUpdate(updates.forward),
      expectedSequence,
      operation: { id: operationId, inverseUpdate: encodeUpdate(updates.inverse) },
    });
    if (!Number.isSafeInteger(appended?.sequence) || appended.sequence <= expectedSequence) {
      const error = failure("CANVAS_LIBRARY_ACCEPT_COMMIT_UNKNOWN");
      error.identity = { libraryId: selected.release.libraryId, releaseId: selected.release.releaseId, contentHash: selected.release.contentHash };
      error.operationId = operationId;
      throw error;
    }

    Y.applyUpdate(model.doc, updates.forward, LOCAL_ORIGIN);
    const receipt = {
      accepted: true,
      documentId: request.documentId,
      alias: request.alias,
      identity: { libraryId: selected.release.libraryId, releaseId: selected.release.releaseId, contentHash: selected.release.contentHash },
      retention: structuredClone(retention),
      operationId,
      sequence: appended.sequence,
    };
    try {
      await api.createSnapshot(request.documentId, {
        throughSequence: appended.sequence,
        state: encodeState(model),
        source: materialize(model),
      });
      receipt.snapshot = { status: "saved" };
    } catch {
      receipt.snapshot = { status: "deferred", code: "CANVAS_LIBRARY_SNAPSHOT_DEFERRED" };
    }
    return receipt;
  } finally {
    model.doc.destroy();
  }
}

function validateRequest(request) {
  if (!plainObject(request)
    || typeof request.documentId !== "string" || !request.documentId || /[\u0000-\u001f\u007f]/u.test(request.documentId)
    || typeof request.libraryId !== "string" || !request.libraryId || /[\u0000-\u001f\u007f]/u.test(request.libraryId)
    || typeof request.alias !== "string" || !ALIAS_PATTERN.test(request.alias)
    || !Array.isArray(request.items) || request.items.length === 0
    || request.items.some((item) => !plainObject(item) || Object.keys(item).some((key) => !["kind", "id"].includes(key)) || typeof item.kind !== "string" || typeof item.id !== "string" || !item.id)) {
    throw failure("CANVAS_LIBRARY_INVALID");
  }
  if (request.updatePolicy !== undefined && !["follow", "pinned"].includes(request.updatePolicy)) throw failure("CANVAS_LIBRARY_INVALID");
}

function requireApi(api) {
  for (const method of ["getDocument", "uploadAsset", "readAsset", "appendUpdate", "createSnapshot"]) {
    if (typeof api?.[method] !== "function") throw failure("CANVAS_LIBRARY_STORAGE_REQUIRED");
  }
}

function documentSequence(payload) {
  const values = [payload?.snapshot?.throughSequence ?? 0, ...(payload?.updates ?? []).map(({ sequence }) => sequence)];
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) throw failure("CANVAS_IMPORT_INTEGRITY");
  return Math.max(...values);
}

function snapshot(value) {
  try { return structuredClone(value); }
  catch { throw failure("CANVAS_LIBRARY_INVALID"); }
}
function plainObject(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function failure(code) { return Object.assign(new Error("Canvas library acceptance did not complete."), { code }); }
