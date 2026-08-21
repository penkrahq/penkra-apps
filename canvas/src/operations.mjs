import { createCanvasApi } from "./canvas-api.mjs";
import {
  LOCAL_ORIGIN,
  Y,
  createDocumentModel,
  encodeState,
  encodeUpdate,
  listNodes,
  materialize,
  mutate,
  replaceDocument,
  restoreDocumentModel,
} from "./document-model.mjs";
import {
  assertMutationBatch,
  inlineExport,
} from "./operation-model.mjs";
import { getCanvasGuidelines } from "./guidelines.mjs";

const runtime = globalThis.penkra;
if (!runtime?.operations) throw new Error("Canvas operations require the Penkra App runtime.");
const api = createCanvasApi(runtime);

runtime.operations.handle("guidelines.get", ({ topic } = {}) => getCanvasGuidelines(topic));

runtime.operations.handle("documents.list", async (input = {}) => {
  const items = [];
  let cursor;
  do {
    const page = await api.listDocuments(cursor);
    items.push(...page.items);
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor && items.length < (input.limit ?? 500));
  const query = String(input.query ?? "").trim().toLowerCase();
  return {
    items: items
      .filter((document) => !query || document.title.toLowerCase().includes(query))
      .slice(0, input.limit ?? 500),
  };
});

runtime.operations.handle("documents.get", async ({ documentId, nodeLimit = 500 }) => {
  const { inspectDocument } = await import("./document-inspection.js");
  const payload = await api.getDocument(documentId);
  const model = restoreDocumentModel(payload);
  try {
    return {
      id: payload.id,
      title: payload.title,
      access: payload.access,
      ownerAccountId: payload.ownerAccountId,
      nodes: inspectDocument(materialize(model), listNodes(model), nodeLimit),
    };
  } finally {
    model.doc.destroy();
  }
});

runtime.operations.handle("documents.create", async ({ title, document }) => {
  const model = createDocumentModel(document);
  try {
    return await api.createDocument({ title, source: document, initialUpdate: encodeState(model) });
  } finally {
    model.doc.destroy();
  }
});

runtime.operations.handle("documents.open", async ({ documentId }, context) => {
  const navigation = { route: "/document", state: { documentId } };
  if (context.tab) {
    await context.tab.navigate(navigation);
    return { tabId: context.tab.id };
  }
  const tab = await context.tabs.open(navigation);
  return { tabId: tab.id };
});

runtime.operations.handle("documents.mutate", async ({ documentId, mutations }) => {
  assertMutationBatch(mutations);
  const payload = await api.getDocument(documentId);
  const model = restoreDocumentModel(payload);
  const updates = [];
  const listener = (update, origin) => {
    if (origin === LOCAL_ORIGIN) updates.push(update);
  };
  model.doc.on("update", listener);
  try {
    model.doc.transact(() => {
      for (const mutation of mutations) mutate(model, mutation, LOCAL_ORIGIN);
    }, LOCAL_ORIGIN);
    if (updates.length === 0) return { documentId, changed: false, mutationCount: 0 };
    const combined = updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
    const appended = await api.appendUpdate(documentId, {
      clientUpdateId: crypto.randomUUID(),
      update: encodeUpdate(combined),
      expectedSequence: authoritativeSequence(payload),
    });
    await api.createSnapshot(documentId, {
      throughSequence: appended.sequence,
      state: encodeState(model),
      source: materialize(model),
    });
    return {
      documentId,
      changed: true,
      mutationCount: mutations.length,
      sequence: appended.sequence,
    };
  } finally {
    model.doc.off("update", listener);
    model.doc.destroy();
  }
});

runtime.operations.handle("documents.execute", async ({ documentId, code }) => {
  const [{ executeCanvasScript }, { reviewDocumentIssues }] = await Promise.all([
    import("./script-runtime.js"),
    import("./document-review.js"),
  ]);
  const payload = await api.getDocument(documentId);
  const model = restoreDocumentModel(payload);
  const updates = [];
  const listener = (update, origin) => {
    if (origin === LOCAL_ORIGIN) updates.push(update);
  };
  model.doc.on("update", listener);
  try {
    const before = materialize(model);
    const execution = await executeCanvasScript(before, code);
    // Build once in isolation before touching the working clone. This enforces
    // the complete normalized-tree contract without relying on Yjs to roll a
    // partially applied transaction back after a validation error.
    const validationModel = createDocumentModel(execution.document);
    validationModel.doc.destroy();
    const issues = reviewDocumentIssues(execution.document);
    if (JSON.stringify(before) === JSON.stringify(execution.document)) {
      return {
        documentId,
        changed: false,
        sequence: authoritativeSequence(payload),
        prints: execution.prints,
        result: execution.result,
        issues,
      };
    }
    model.doc.transact(() => replaceDocument(model, execution.document, LOCAL_ORIGIN), LOCAL_ORIGIN);
    const combined = updates.length === 1 ? updates[0] : Y.mergeUpdates(updates);
    const appended = await api.appendUpdate(documentId, {
      clientUpdateId: crypto.randomUUID(),
      update: encodeUpdate(combined),
      expectedSequence: authoritativeSequence(payload),
    });
    await api.createSnapshot(documentId, {
      throughSequence: appended.sequence,
      state: encodeState(model),
      source: materialize(model),
    });
    return {
      documentId,
      changed: true,
      sequence: appended.sequence,
      prints: execution.prints,
      result: execution.result,
      issues,
    };
  } finally {
    model.doc.off("update", listener);
    model.doc.destroy();
  }
});

runtime.operations.handle("documents.export", async ({ documentId }) => {
  const payload = await api.getDocument(documentId);
  const model = restoreDocumentModel(payload);
  try {
    return { documentId, title: payload.title, ...inlineExport(materialize(model)) };
  } finally {
    model.doc.destroy();
  }
});

runtime.operations.handle("sharing.list", async ({ documentId }) =>
  api.listGrants(documentId),
);
runtime.operations.handle("sharing.add", async ({ documentId, email }) =>
  api.grantAccess(documentId, email),
);
runtime.operations.handle("sharing.remove", async ({ documentId, grantId }) =>
  api.revokeGrant(documentId, grantId),
);

runtime.operations.handle("selection.set", async ({ nodeId }, context) => {
  if (!context.tab) throw new Error("selection.set requires an explicit Canvas tabId.");
  await context.tab.invoke({ operation: "selection.set", input: { nodeId } });
  return { tabId: context.tab.id, nodeId };
});

runtime.operations.handle("viewport.focus", async ({ nodeId }, context) => {
  if (!context.tab) throw new Error("viewport.focus requires an explicit Canvas tabId.");
  await context.tab.invoke({ operation: "viewport.focus", input: { nodeId } });
  return { tabId: context.tab.id, nodeId };
});

runtime.operations.handle("performance.snapshot", async (_input, context) => {
  if (!context.tab) throw new Error("performance.snapshot requires an explicit Canvas tabId.");
  return context.tab.invoke({ operation: "performance.snapshot", input: {} });
});

function authoritativeSequence(payload) {
  return Math.max(
    Number(payload.snapshot?.throughSequence ?? 0),
    ...(payload.updates ?? []).map((update) => Number(update.sequence ?? 0)),
  );
}
