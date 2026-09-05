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
import { loadCanvasImports } from "./canvas-imports.mjs";

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

runtime.operations.handle("documents.create", async ({ title, module }) => {
  const source = createBlankDocumentSource({ module });
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
    const screenshots = execution.screenshots.length === 0
      ? []
      : await (await import("./document-screenshot.mjs")).takeDocumentScreenshots(
        execution.document,
        execution.screenshots,
        await readDocumentAssets(api, documentId, [...(assetDescriptors ??= await api.listAssets(documentId)), ...uploadedAssets]),
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
  const { exportDocument } = await import("./export-service.mjs");
  const payload = await api.getDocument(input.documentId);
  const model = restoreDocumentModel(payload);
  try {
    const document = materialize(model);
    const rootAssets = await readDocumentAssets(api, input.documentId, payload.assets);
    const imported = await loadCanvasImports(api, document, { rootDocumentId: input.documentId });
    const assets = new Map([...rootAssets, ...imported.assets]);
    const sets = input.bindings?.length ? input.bindings : [null];
    const destinations = resolveExportDestinations(input.destination, sets);
    const reports = [];
    for (let index = 0; index < sets.length; index += 1) {
      const bindingSet = sets[index];
      const bindings = bindingSet ? Object.fromEntries(Object.entries(bindingSet).filter(([key]) => key !== "output")) : {};
      reports.push(await exportDocument(document, { ...input, destination: destinations[index], bindings, imports: imported.imports }, { assets, title: payload.title }));
    }
    return { artifacts: reports.flatMap((report) => report.artifacts), consequences: reports.flatMap((report) => report.consequences), lowered: reports.flatMap((report) => report.lowered), embeddedFonts: reports.flatMap((report) => report.embeddedFonts), rasterized: reports.flatMap((report) => report.rasterized) };
  } finally { model.doc.destroy(); }
});

runtime.operations.handle("documents.export-image", async (input) => {
  const { exportImage } = await import("./export-service.mjs");
  const payload = await api.getDocument(input.documentId);
  const model = restoreDocumentModel(payload);
  try {
    const document = materialize(model);
    const rootAssets = await readDocumentAssets(api, input.documentId, payload.assets);
    const imported = await loadCanvasImports(api, document, { rootDocumentId: input.documentId });
    return await exportImage(document, input, {
      assets: new Map([...rootAssets, ...imported.assets]),
      imports: imported.imports,
    });
  } finally { model.doc.destroy(); }
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

function resolveExportDestinations(pattern, sets) {
  if (sets.length === 1 && !sets[0]) return [pattern];
  const seen = new Map();
  return sets.map((set, index) => {
    if (!set || typeof set.output !== "string") throw new Error(`Binding set ${index} needs an explicit output value.`);
    const destination = pattern.replace(/\$\{([A-Za-z][\w-]*)\}/gu, (token, name) => {
      if (!Object.hasOwn(set, name)) throw new Error(`Destination token ${token} has no binding in set ${index}.`);
      return validateBindingSegment(set[name], name, index);
    });
    const key = destination.normalize("NFC").toLowerCase();
    if (seen.has(key)) throw new Error(`Binding sets ${seen.get(key)} and ${index} collide at ${destination}.`);
    seen.set(key, index); return destination;
  });
}

function validateBindingSegment(value, name, index) {
  const segment = String(value);
  if (!segment || segment !== segment.normalize("NFC") || /[\/\\\0-\x1f]/u.test(segment) || segment === "." || segment === ".." || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(segment) || new TextEncoder().encode(segment).length > 255) throw new Error(`Binding ${name} in set ${index} is not a safe filename segment: ${JSON.stringify(value)}.`);
  return segment;
}
