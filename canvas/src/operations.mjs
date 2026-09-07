import { createCanvasApi } from "./canvas-api.mjs";
import {
  LOCAL_ORIGIN,
  Y,
  applyRemoteUpdate,
  createDocumentOperationUpdates,
  createDocumentModel,
  encodeState,
  encodeUpdate,
  listNodes,
  materialize,
  restoreDocumentModel,
} from "./document-model.mjs";
import { createBlankDocumentSource } from "./blank-document.mjs";
import { collectImageFills, materializeDocumentImages } from "./image-materialization.mjs";
import { loadRetainedCanvasImports } from "./library-retained-loader.mjs";
import { resolveCanvasDocument } from "./canvas-resolver.mjs";
import { publishCanvasLibrary } from "./library-publish-workflow.mjs";
import { readPublishedCanvasLibrary } from "./library-publication-head.mjs";
import { acceptCanvasLibrary } from "./library-accept-workflow.mjs";
import { bindingsForExportSet, exportRoleForFormat, listExportFrames, resolveExportDestinations } from "./export-delivery.mjs";
import { assertExportAvailable } from "./export-availability.mjs";

const runtime = globalThis.penkra;
if (!runtime?.operations) throw new Error("Canvas operations require the Penkra App runtime.");
const api = createCanvasApi(runtime);

runtime.operations.handle("documents.list", async (input = {}) => {
  const items = [];
  const limit = input.limit ?? 500;
  const query = String(input.query ?? "").trim().toLowerCase();
  let cursor;
  do {
    const page = await api.listDocuments(cursor);
    items.push(...page.items.filter(
      (document) => !query || document.title.toLowerCase().includes(query),
    ));
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor && items.length < limit);
  return {
    items: items.slice(0, limit),
  };
});

runtime.operations.handle("documents.trash", async ({ documentId, confirmTitle }) => {
  let cursor;
  let document;
  do {
    const page = await api.listDocuments(cursor);
    document = page.items.find((candidate) => candidate.id === documentId);
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (!document && cursor);
  if (!document) {
    const error = new Error(`Canvas document ${documentId} was not found.`);
    error.code = "CANVAS_DOCUMENT_NOT_FOUND";
    throw error;
  }
  if (document.access !== "owner") {
    const error = new Error(`Only the document owner can move ${document.title} to Trash.`);
    error.code = "CANVAS_DOCUMENT_TRASH_FORBIDDEN";
    throw error;
  }
  if (confirmTitle !== document.title) {
    const error = new Error(
      `Trash confirmation did not match the current title. Pass confirmTitle exactly as ${JSON.stringify(document.title)} after the user confirms moving this document to Trash.`,
    );
    error.code = "CANVAS_DOCUMENT_TRASH_CONFIRMATION_MISMATCH";
    throw error;
  }
  await api.deleteDocument(documentId);
  return { documentId, title: document.title, trashed: true };
});

runtime.operations.handle("documents.create", async ({ title, module, preset }) => {
  const source = createBlankDocumentSource({ module, preset });
  const starterFrameId = source.children[0].id;
  const model = createDocumentModel(source);
  try {
    const document = await api.createDocument({ title, source, initialUpdate: encodeState(model) });
    return { documentId: document.id, title, access: "owner", starterFrameId };
  } finally {
    model.doc.destroy();
  }
});

runtime.operations.handle("documents.open", async ({ documentId }, context) => {
  const navigation = { route: "/document", state: { documentId } };
  if (context.tab) {
    await context.tab.navigate(navigation);
    return { documentId, tabId: context.tab.id };
  }
  const tab = await context.tabs.open(navigation);
  return { documentId, tabId: tab.id };
});

runtime.operations.handle("documents.execute", async ({ documentId, code }, context) => {
  const signal = context?.signal ?? new AbortController().signal;
  const { executeCanvasScript, scriptNeedsInspection } = await import("./script-runtime.mjs");
  const projected = await api.getDocumentProjection(documentId);
  let payload = projected ?? await api.getDocument(documentId);
  let model = projected ? null : restoreDocumentModel(payload);
  try {
    const before = model ? materialize(model) : structuredClone(payload.snapshot.source);
    const needsInitialInspection = scriptNeedsInspection(code);
    const inspectDocument = needsInitialInspection
      ? (await import("./document-inspection.mjs")).inspectDocument
      : null;
    let beforeInspection = { items: [] };
    if (inspectDocument) {
      const inspectionModel = model ?? createDocumentModel(before);
      try { beforeInspection = inspectDocument(before, listNodes(inspectionModel), 1_000); }
      finally { if (!model) inspectionModel.doc.destroy(); }
    }
    const execution = await executeCanvasScript(
      before,
      code,
      Object.fromEntries(
        beforeInspection.items.map((item) => [
          item.id,
          { bounds: item.bounds, problems: item.problems },
        ]),
      ),
    );
    // Build once in isolation before touching the working clone. This enforces
    // the complete normalized-tree contract without relying on Yjs to roll a
    // partially applied transaction back after a validation error.
    const touchedNodeIds = [...new Set(execution.touchedNodeIds)];
    if (touchedNodeIds.length > 10_000) {
      const error = new Error(
        `Canvas execution touched ${touchedNodeIds.length} nodes; the result limit is 10000. Split unrelated design intents into separate executions.`,
      );
      error.code = "CANVAS_EXECUTION_RESULT_LIMIT";
      throw error;
    }
    const structuralModel = createDocumentModel(execution.document);
    structuralModel.doc.destroy();
    const changedByScript = execution.changed;
    let uploadedAssets = [];
    let assetDescriptors = payload.assets;
    if (changedByScript) {
      assetDescriptors ??= (await api.listAssets(documentId));
      const materialized = await materializeDocumentImages({
        api,
        documentId,
        document: execution.document,
        existingAssets: assetDescriptors,
        generations: execution.generations,
        signal,
        skipSources: new Set(collectImageFills(before).map((fill) => fill.url)),
      });
      uploadedAssets = materialized.uploaded;
    }
    let existingInspection = [];
    let issues = beforeInspection.issues ?? [];
    if (changedByScript || touchedNodeIds.length > 0) {
      const inspect = inspectDocument ?? (await import("./document-inspection.mjs")).inspectDocument;
      const validationModel = createDocumentModel(execution.document);
      try {
        const inspected = inspect(
          execution.document,
          listNodes(validationModel),
          1_000,
          new Set(touchedNodeIds),
        );
        existingInspection = inspected.items;
        issues = inspected.issues;
      } finally {
        validationModel.doc.destroy();
      }
    }
    if (issues.length > 10_000) {
      const error = new Error(
        `Canvas execution produced ${issues.length} review issues; the result limit is 10000. Narrow the design intent and correct structural problems first.`,
      );
      error.code = "CANVAS_EXECUTION_RESULT_LIMIT";
      throw error;
    }
    const inspectedIds = new Set(existingInspection.map((item) => item.id));
    const inspection = [
      ...existingInspection,
      ...touchedNodeIds
        .filter((nodeId) => !inspectedIds.has(nodeId))
        .map((nodeId) => ({ nodeId, deleted: true })),
    ];
    let screenshots = [];
    if (execution.screenshots.length > 0) {
      const rootAssets = await readDocumentAssets(
        api,
        documentId,
        [...(assetDescriptors ??= await api.listAssets(documentId)), ...uploadedAssets],
      );
      const imported = await loadRetainedCanvasImports(
        api,
        { ...execution.document, imports: execution.document.imports ?? {} },
        { documentId },
      );
      const renderDocument = resolveCanvasDocument(execution.document, { imports: imported.imports }).document;
      screenshots = await (await import("./document-screenshot.mjs")).takeDocumentScreenshots(
        renderDocument,
        execution.screenshots,
        new Map([...rootAssets, ...imported.assets]),
      );
    }
    if (!changedByScript) {
      return operationResult({
        documentId,
        changed: false,
        operationId: null,
        sequence: authoritativeSequence(payload),
        prints: execution.prints,
        result: execution.result,
        touchedNodeIds,
        inspection,
        issues,
      }, screenshots);
    }
    signal.throwIfAborted();
    if (!model) {
      const hydrated = await api.getDocument(documentId);
      if (authoritativeSequence(hydrated) !== authoritativeSequence(payload)) {
        const error = new Error("Canvas document changed while the operation was executing. Read the current document and retry the edit.");
        error.code = "CANVAS_DOCUMENT_CONFLICT";
        throw error;
      }
      payload = hydrated;
      model = restoreDocumentModel(payload);
    }
    const operationId = crypto.randomUUID();
    const operationUpdates = createDocumentOperationUpdates(model, execution.document);
    Y.applyUpdate(model.doc, operationUpdates.forward, LOCAL_ORIGIN);
    const appended = await api.appendUpdate(documentId, {
      clientUpdateId: crypto.randomUUID(),
      update: encodeUpdate(operationUpdates.forward),
      expectedSequence: authoritativeSequence(payload),
      operation: {
        id: operationId,
        inverseUpdate: encodeUpdate(operationUpdates.inverse),
      },
    });
    await api.createSnapshot(documentId, {
      throughSequence: appended.sequence,
      state: encodeState(model),
      source: materialize(model),
    });
    return operationResult({
      documentId,
      changed: true,
      operationId,
      sequence: appended.sequence,
      prints: execution.prints,
      result: execution.result,
      touchedNodeIds,
      inspection,
      issues,
    }, screenshots);
  } finally {
    model?.doc.destroy();
  }
});

runtime.operations.handle("documents.undo", async ({ documentId, operationId }) => {
  const payload = await api.getDocument(documentId);
  const model = restoreDocumentModel(payload);
  try {
    const undone = await api.undoOperation(documentId, {
      ...(operationId ? { operationId } : {}),
      clientUpdateId: crypto.randomUUID(),
      expectedSequence: authoritativeSequence(payload),
    });
    applyRemoteUpdate(model, undone.update);
    await api.createSnapshot(documentId, {
      throughSequence: undone.sequence,
      state: encodeState(model),
      source: materialize(model),
    });
    return {
      documentId,
      operationId: undone.operationId,
      changed: true,
      sequence: undone.sequence,
    };
  } finally {
    model.doc.destroy();
  }
});

runtime.operations.handle("documents.export", async (input) => {
  assertExportAvailable(input.format);
  if (input.bindings !== undefined && (!Array.isArray(input.bindings) || input.bindings.length === 0 || input.bindings.length > 1000)) {
    const error = new Error("Export bindings must contain between one and 1000 binding sets.");
    error.code = "CANVAS_EXPORT_BINDINGS";
    throw error;
  }
  const { exportDocumentBatch } = await import("./export-service.mjs");
  const payload = await api.getDocument(input.documentId);
  const model = restoreDocumentModel(payload);
  try {
    const document = materialize(model);
    const rootAssets = await readDocumentAssets(api, input.documentId, payload.assets);
    const imported = await loadRetainedCanvasImports(api, document, { documentId: input.documentId });
    const assets = new Map([...rootAssets, ...imported.assets]);
    const role = exportRoleForFormat(input.format);
    const frames = input.frames?.length
      ? input.frames
      : listExportFrames(document, role);
    if (frames.length === 0) {
      const error = new Error(`Canvas document has no ${role} frames for ${input.format} export.`);
      error.code = "CANVAS_EXPORT_NO_FRAMES";
      throw error;
    }
    const sets = input.bindings ?? [null];
    const destinations = resolveExportDestinations(input.destination, sets, input.format);
    const requests = sets.map((bindingSet, index) => ({
      ...input,
      role,
      frames,
      destination: destinations[index],
      bindings: bindingsForExportSet(bindingSet),
      imports: imported.imports,
    }));
    return await exportDocumentBatch(document, requests, { assets, title: payload.title });
  } finally { model.doc.destroy(); }
});

runtime.operations.handle("documents.extract", async (input) => {
  const { extractDocumentNodes } = await import("./export-service.mjs");
  const payload = await api.getDocument(input.documentId);
  const model = restoreDocumentModel(payload);
  try {
    const document = materialize(model);
    const rootAssets = await readDocumentAssets(api, input.documentId, payload.assets);
    const imported = await loadRetainedCanvasImports(api, document, { documentId: input.documentId });
    return await extractDocumentNodes(document, input, {
      assets: new Map([...rootAssets, ...imported.assets]),
      imports: imported.imports,
      title: payload.title,
    });
  } finally { model.doc.destroy(); }
});

runtime.operations.handle("libraries.publish", async (input) =>
  publishCanvasLibrary(api, input),
);

runtime.operations.handle("libraries.inspect", async ({ documentId }) => {
  const selected = await readPublishedCanvasLibrary(api, documentId);
  return {
    documentId,
    publication: {
      releaseId: selected.publication.releaseId,
      contentHash: selected.publication.contentHash,
    },
    items: selected.release.publicItems.map((item) => structuredClone(item)),
  };
});

runtime.operations.handle("libraries.accept", async (input) =>
  acceptCanvasLibrary(api, input),
);

function operationResult(structuredContent, screenshots) {
  const metadata = screenshots.map(({ data: _data, ...screenshot }) => screenshot);
  const result = { ...structuredContent, screenshots: metadata };
  if (screenshots.length === 0) return result;
  return {
    structuredContent: result,
    content: screenshots.map((screenshot) => ({
      type: "image",
      data: screenshot.data,
      mimeType: screenshot.mimeType,
    })),
  };
}

async function readDocumentAssets(api, documentId, descriptors) {
  const byPath = new Map(descriptors.map((asset) => [asset.path, asset]));
  return new Map(await Promise.all([...byPath.values()].map(async (asset) => [
    asset.path,
    { ...asset, bytes: await api.readAsset(documentId, asset) },
  ])));
}

runtime.operations.handle("sharing.list", async ({ documentId }) =>
  api.listGrants(documentId),
);
runtime.operations.handle("sharing.add", async ({ documentId, email }) =>
  api.grantAccess(documentId, email),
);
runtime.operations.handle("sharing.remove", async ({ documentId, grantId }) =>
  api.revokeGrant(documentId, grantId),
);

function authoritativeSequence(payload) {
  return Math.max(
    Number(payload.snapshot?.throughSequence ?? 0),
    ...(payload.updates ?? []).map((update) => Number(update.sequence ?? 0)),
  );
}
