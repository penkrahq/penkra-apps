import { createCanvasApi } from "./canvas-api.mjs";
import {
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
import { searchCanvasIcons } from "./pencil-icon-provider.mjs";
import { isSvgAsset, prepareAssetForRendering } from "./document-assets.mjs";
import { applySvgConversionRequests } from "./svg-vectors.mjs";
import { createOperationDocumentStore } from "./operation-document-store.mjs";
import { assertVariantSets } from "./component-variants.mjs";

const runtime = globalThis.penkra;
if (!runtime?.operations) throw new Error("Canvas operations require the Penkra App runtime.");
const api = createCanvasApi(runtime);
const operationDocuments = createOperationDocumentStore(api);

runtime.operations.handle("icons.search", async ({ query, library, limit }) =>
  searchCanvasIcons(query, { library, limit }));

runtime.operations.handle("documents.list", async (input = {}) => {
  const items = [];
  const limit = input.limit ?? 500;
  const query = String(input.query ?? "").trim().toLowerCase();
  let cursor;
  do {
    const page = await api.listDocuments(cursor, {
      view: input.view ?? "all",
      ...(input.folderId ? { folderId: input.folderId } : {}),
    });
    items.push(
      ...page.items
        .filter((document) => !query || document.title.toLowerCase().includes(query))
        .map((document) => Object.fromEntries(Object.entries({
          id: document.id,
          title: document.title,
          ownerAccountId: document.ownerAccountId,
          ownerName: document.ownerName,
          access: document.access,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt,
          lastOpenedAt: document.lastOpenedAt,
          folderId: document.folderId,
          folderName: document.folderName,
          lastEditor: document.lastEditor,
          thumbnailUpdatedAt: document.thumbnailUpdatedAt,
        }).filter(([, value]) => value !== undefined))),
    );
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

runtime.operations.handle("documents.restore", async ({ documentId }) => api.restoreDocument(documentId));

runtime.operations.handle("documents.create", async ({ title, module, preset, folderId = null }) => {
  const source = createBlankDocumentSource({ module, preset });
  const starterFrameId = source.children[0].id;
  const model = createDocumentModel(source);
  try {
    const document = await api.createDocument({ title, folderId, source, initialUpdate: encodeState(model) });
    await updateThumbnailBestEffort(document.id, 0, source, []);
    return { documentId: document.id, title, access: "owner", folderId: document.folderId ?? folderId, starterFrameId };
  } finally {
    model.doc.destroy();
  }
});

runtime.operations.handle("documents.rename", async ({ documentId, title }) => {
  const document = await api.renameDocument(documentId, title);
  return { documentId: document.id, title: document.title };
});

runtime.operations.handle("documents.move", async ({ documentId, folderId = null }) => {
  const result = await api.moveDocument(documentId, folderId);
  return { documentId, folderId: result.folderId };
});

runtime.operations.handle("documents.duplicate", async ({ documentId, title, folderId }) => {
  const source = await api.getDocument(documentId);
  const model = restoreDocumentModel(source);
  try {
    const document = materialize(model);
    const duplicate = await api.createDocument({
      title,
      folderId: folderId === undefined ? source.folderId ?? null : folderId,
      source: document,
      initialUpdate: encodeState(model),
    });
    await updateThumbnailBestEffort(duplicate.id, 0, document, source.assets ?? []);
    return { documentId: duplicate.id, title: duplicate.title, folderId: duplicate.folderId ?? null };
  } finally {
    model.doc.destroy();
  }
});

runtime.operations.handle("folders.list", async (input = {}) => {
  const items = [];
  let cursor;
  do {
    const page = await api.listFolders(cursor, {
      view: input.view ?? "roots",
      parentId: input.parentId ?? null,
      limit: Math.min(100, input.limit ?? 100),
    });
    items.push(...page.items);
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor && items.length < (input.limit ?? 500));
  return { items: items.slice(0, input.limit ?? 500) };
});

runtime.operations.handle("folders.create", async ({ name, parentId = null }) =>
  api.createFolder(name, parentId));
runtime.operations.handle("folders.rename", async ({ folderId, name }) =>
  api.updateFolder(folderId, { name }));
runtime.operations.handle("folders.move", async ({ folderId, parentId = null }) =>
  api.updateFolder(folderId, { parentId }));
runtime.operations.handle("folders.trash", async ({ folderId }) => api.deleteFolder(folderId));
runtime.operations.handle("folders.restore", async ({ folderId }) => api.restoreFolder(folderId));
runtime.operations.handle("folders.sharing.list", async ({ folderId }) => api.listFolderGrants(folderId));
runtime.operations.handle("folders.sharing.add", async ({ folderId, email }) => api.grantFolderAccess(folderId, email));
runtime.operations.handle("folders.sharing.remove", async ({ folderId, grantId }) => api.revokeFolderGrant(folderId, grantId));

runtime.operations.handle("documents.open", async ({ documentId }, context) => {
  const navigation = { route: "/document", state: { documentId } };
  if (context.tab) {
    await context.tab.navigate(navigation);
    return { documentId, tabId: context.tab.id };
  }
  const tab = await context.tabs.open(navigation);
  return { documentId, tabId: tab.id };
});

runtime.operations.handle("documents.execute", async ({ documentId, code, issueDetail = "summary" }, context) =>
  operationDocuments.run(documentId, async (documentState) => {
    const signal = context?.signal ?? new AbortController().signal;
    const { executeCanvasScript, scriptNeedsInspection } = await import("./script-runtime.mjs");
    let model = documentState.model;
    const before = operationDocuments.source(documentState);
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
    let assetDescriptors;
    let svgConversions = [];
    if (execution.svgConversions?.length) {
      assetDescriptors ??= await api.listAssets(documentId);
      svgConversions = applySvgConversionRequests(
        execution.document,
        execution.svgConversions,
        await readDocumentAssets(api, documentId, assetDescriptors),
      );
    }
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
    if (execution.changed) assertVariantSets(execution.document);
    const structuralModel = createDocumentModel(execution.document);
    structuralModel.doc.destroy();
    const changedByScript = execution.changed;
    let uploadedAssets = [];
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
    const issueSummary = summarizeExecutionIssues(issues, touchedNodeIds);
    const returnedIssues = issueDetail === "all" ? issues : issueSummary.sample;
    const returnedIssueSummary = {
      ...issueSummary.counts,
      inspected: Boolean(changedByScript || touchedNodeIds.length > 0 || inspectDocument),
      omitted: issues.length - returnedIssues.length,
    };
    if (!changedByScript) {
      return operationResult({
        documentId,
        changed: false,
        operationId: null,
        sequence: documentState.sequence,
        prints: execution.prints,
        result: execution.result,
        touchedNodeIds,
        svgConversions,
        inspection,
        issues: returnedIssues,
        issueSummary: returnedIssueSummary,
      }, screenshots);
    }
    signal.throwIfAborted();
    if (!model) {
      const hydrated = await api.getDocument(documentId);
      if (authoritativeSequence(hydrated) !== documentState.sequence) {
        const error = new Error("Canvas document changed while the operation was executing. Read the current document and retry the edit.");
        error.code = "CANVAS_DOCUMENT_CONFLICT";
        throw error;
      }
      operationDocuments.replaceWithPayload(documentState, hydrated);
      model = documentState.model;
    }
    const operationId = crypto.randomUUID();
    const operationUpdates = createDocumentOperationUpdates(model, execution.document);
    const appended = await api.appendUpdate(documentId, {
      clientUpdateId: crypto.randomUUID(),
      update: encodeUpdate(operationUpdates.forward),
      expectedSequence: documentState.sequence,
      operation: {
        id: operationId,
        inverseUpdate: encodeUpdate(operationUpdates.inverse),
      },
    });
    operationDocuments.recordCommittedUpdate(documentState, operationUpdates.forward, appended.sequence);
    await saveSnapshotBestEffort(documentId, {
      throughSequence: appended.sequence,
      state: encodeState(model),
      source: materialize(model),
    });
    await updateThumbnailBestEffort(
      documentId,
      appended.sequence,
      materialize(model),
      [...(assetDescriptors ?? []), ...uploadedAssets],
    );
    return operationResult({
      documentId,
      changed: true,
      operationId,
      sequence: appended.sequence,
      prints: execution.prints,
      result: execution.result,
      touchedNodeIds,
      svgConversions,
      inspection,
      issues: returnedIssues,
      issueSummary: returnedIssueSummary,
    }, screenshots);
  }),
);

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
    await saveSnapshotBestEffort(documentId, {
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
    const imported = await loadCanvasImports(api, document, {
      rootDocumentId: input.documentId,
      rasterizeSvg: rasterizeDocumentSvg,
    });
    const assets = new Map([...rootAssets, ...imported.assets]);
    const sets = input.bindings?.length ? input.bindings : [null];
    const destinations = resolveExportDestinations(input.destination, sets);
    const reports = [];
    for (let index = 0; index < sets.length; index += 1) {
      const bindingSet = sets[index];
      const bindings = bindingSet ? Object.fromEntries(Object.entries(bindingSet).filter(([key]) => key !== "output")) : {};
      reports.push(await exportDocument(document, { ...input, destination: destinations[index], bindings, imports: imported.imports }, { assets, title: payload.title }));
    }
    return { artifacts: reports.flatMap((report) => report.artifacts), consequences: reports.flatMap((report) => report.consequences), lowered: reports.flatMap((report) => report.lowered), embeddedFonts: reports.flatMap((report) => report.embeddedFonts), bundledFonts: reports.flatMap((report) => report.bundledFonts ?? []), rasterized: reports.flatMap((report) => report.rasterized) };
  } finally { model.doc.destroy(); }
});

runtime.operations.handle("documents.extract", async (input) => {
  const { extractDocumentNodes } = await import("./export-service.mjs");
  const payload = await api.getDocument(input.documentId);
  const model = restoreDocumentModel(payload);
  try {
    const document = materialize(model);
    const rootAssets = await readDocumentAssets(api, input.documentId, payload.assets);
    const imported = await loadCanvasImports(api, document, {
      rootDocumentId: input.documentId,
      rasterizeSvg: rasterizeDocumentSvg,
    });
    return await extractDocumentNodes(document, input, {
      assets: new Map([...rootAssets, ...imported.assets]),
      imports: imported.imports,
      title: payload.title,
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
    await prepareAssetForRendering(
      { ...asset, bytes: await api.readAsset(documentId, asset) },
      isSvgAsset(asset) ? rasterizeDocumentSvg : null,
    ),
  ])));
}

async function rasterizeDocumentSvg(bytes) {
  return (await import("./document-screenshot.mjs")).rasterizeSvgImage(bytes);
}

async function updateThumbnailBestEffort(documentId, sequence, document, assetDescriptors) {
  try {
    const target = document.children?.find((node) => node?.type === "frame" && node.role)
      ?? document.children?.find((node) => node?.type === "frame");
    if (!target) return;
    const assets = assetDescriptors.length
      ? await readDocumentAssets(api, documentId, assetDescriptors)
      : new Map();
    const [thumbnail] = await (await import("./document-screenshot.mjs")).takeDocumentScreenshots(
      document,
      [{ nodeIds: [target.id] }],
      assets,
      { maxDimension: 640 },
    );
    if (thumbnail?.data) await api.writeThumbnail(documentId, sequence, thumbnail.data);
  } catch (error) {
    console.warn("Canvas kept the last saved thumbnail after preview generation failed.", error);
  }
}

async function saveSnapshotBestEffort(documentId, snapshot) {
  try {
    await api.createSnapshot(documentId, snapshot);
  } catch (error) {
    // The append/undo has already committed. A failed compaction must not turn
    // its acknowledgement into an error that invites the caller to repeat it.
    console.warn(`Canvas kept committed sequence ${snapshot.throughSequence} without a new snapshot.`, error);
  }
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

function summarizeExecutionIssues(issues, touchedNodeIds) {
  const byKind = {};
  const bySeverity = {};
  for (const issue of issues) {
    const kind = issue.kind ?? "other";
    const severity = issue.severity ?? "unspecified";
    byKind[kind] = (byKind[kind] ?? 0) + 1;
    bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
  }
  const touched = new Set(touchedNodeIds);
  const rank = { critical: 0, major: 1, minor: 2, info: 3 };
  const sample = issues.map((issue, index) => ({ issue, index }))
    .sort((a, b) => Number(touched.has(b.issue.nodeId)) - Number(touched.has(a.issue.nodeId))
      || (rank[a.issue.severity] ?? 4) - (rank[b.issue.severity] ?? 4)
      || a.index - b.index)
    .slice(0, 20).map(({ issue }) => issue);
  return { sample, counts: { total: issues.length, omitted: issues.length - sample.length, byKind, bySeverity } };
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
