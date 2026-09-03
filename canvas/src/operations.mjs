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

runtime.operations.handle("documents.create", async ({ title }) => {
  const source = createBlankDocumentSource();
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
  const [
    { executeCanvasScript },
    { reviewDocumentIssues },
    { inspectDocument },
    { takeDocumentScreenshots },
  ] = await Promise.all([
    import("./script-runtime.mjs"),
    import("./document-review.mjs"),
    import("./document-inspection.mjs"),
    import("./document-screenshot.mjs"),
  ]);
  const payload = await api.getDocument(documentId);
  const model = restoreDocumentModel(payload);
  try {
    const before = materialize(model);
    const beforeInspection = inspectDocument(before, listNodes(model), 1_000);
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
    const changedByScript = JSON.stringify(before) !== JSON.stringify(execution.document);
    let uploadedAssets = [];
    if (changedByScript) {
      const materialized = await materializeDocumentImages({
        api,
        documentId,
        document: execution.document,
        existingAssets: payload.assets,
        generations: execution.generations,
        signal,
        skipSources: new Set(collectImageFills(before).map((fill) => fill.url)),
      });
      uploadedAssets = materialized.uploaded;
    }
    const validationModel = createDocumentModel(execution.document);
    let existingInspection;
    let issues;
    try {
      issues = reviewDocumentIssues(execution.document);
      if (issues.length > 10_000) {
        const error = new Error(
          `Canvas execution produced ${issues.length} review issues; the result limit is 10000. Narrow the design intent and correct structural problems first.`,
        );
        error.code = "CANVAS_EXECUTION_RESULT_LIMIT";
        throw error;
      }
      existingInspection = inspectDocument(
        execution.document,
        listNodes(validationModel),
        1_000,
        new Set(touchedNodeIds),
      ).items;
    } finally {
      validationModel.doc.destroy();
    }
    const inspectedIds = new Set(existingInspection.map((item) => item.id));
    const inspection = [
      ...existingInspection,
      ...touchedNodeIds
        .filter((nodeId) => !inspectedIds.has(nodeId))
        .map((nodeId) => ({ nodeId, deleted: true })),
    ];
    const screenshots = execution.screenshots.length === 0
      ? []
      : await takeDocumentScreenshots(
        execution.document,
        execution.screenshots,
        await readDocumentAssets(api, documentId, [...payload.assets, ...uploadedAssets]),
      );
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
    model.doc.destroy();
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
