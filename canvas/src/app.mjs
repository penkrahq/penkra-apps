import { createCanvasApi } from "./canvas-api.mjs";
import { createBlankDocumentSource } from "./blank-document.mjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { safeDocumentName } from "./codec.mjs";
import { createRouteCoordinator } from "./route-coordinator.mjs";
import {
  analyzeOpenPencilCompatibility,
  isOpenPencilEditableNode,
  penPropertyToSceneChanges,
  sceneNodeToPenNode,
} from "./openpencil-engine.mjs";
import { mountOpenPencilSurface, prepareOpenPencilEngine } from "./openpencil-surface.mjs";
import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";
import {
  isPencilAuthorableNode,
  parsePencilAuthoringValue,
  pencilAuthoringSections,
} from "./pencil-authoring.mjs";
import {
  choosePenDocument,
  readDroppedPenDocument,
  savePenDocument,
} from "./pen-file-access.mjs";
import { viewportInsetsFromRects } from "./viewport-insets.mjs";
import { listCanvasSceneLayers } from "./scene-layer-tree.mjs";
import { createPerformanceMonitor } from "./performance-monitor.mjs";
import { configureCanvasFonts } from "./font-runtime.mjs";
import {
  copyTextToClipboard,
  formatCanvasNodeReference,
  resolveCanvasNodeReferenceId,
  resolveCanvasNodeSelection,
} from "./node-reference.mjs";
import { applyMutationsToProjection, compactDeletionMutations } from "./document-projection.mjs";
import {
  ACCESS_REMOVED_HEADING,
  ACCESS_REMOVED_MESSAGE,
  assertExportAllowed,
} from "./access-removed.mjs";
import {
  collaboratorRemovalConfirmation,
  documentPermanentDeleteConfirmation,
  documentTrashConfirmation,
  executeDestructiveConfirmation,
  isDestructiveConfirmation,
} from "./destructive-confirmation.mjs";
import {
  REALTIME_CONNECTED,
  REALTIME_RECONNECTING,
  disconnectedSyncStatus,
  isTransportFailure,
  normalizePresenceCount,
  realtimeStateAfterSignal,
  visiblePresenceCount,
} from "./collaboration-status.mjs";
import {
  ENGINE_ORIGIN,
  LOCAL_ORIGIN,
  REMOTE_ORIGIN,
  Y,
  applyRemoteUpdate,
  createDocumentModel,
  createUndoManager,
  encodeState,
  encodeUpdate,
  listDocumentNodes,
  materialize,
  mutate,
  reconcileDocumentPayload,
  restoreDocumentModel,
} from "./document-model.mjs";

const runtime = globalThis.penkra;
const root = document.querySelector("#app");
if (!runtime || !root) throw new Error("Canvas requires the Penkra App runtime.");

const api = createCanvasApi(runtime);
const performanceMonitor = createPerformanceMonitor();
configureCanvasFonts(runtime, { performanceMonitor });
const state = {
  route: "library",
  libraryFilter: "all",
  search: "",
  documents: [],
  trashedDocuments: [],
  loading: true,
  error: null,
  document: null,
  assets: new Map(),
  model: null,
  selectedId: null,
  sync: "saved",
  syncMessage: "Saved",
  presence: null,
  realtimeConnection: REALTIME_RECONNECTING,
  activePanel: null,
  layersOpen: false,
  inspectorOpen: false,
  dialog: null,
  dialogReturnFocusSelector: null,
  dialogFocusSelector: null,
  grants: [],
  toast: null,
  contextMenu: null,
  unsubscribe: null,
  updateListener: null,
  lastSequence: 0,
  updatesSinceSnapshot: 0,
  flushing: false,
  reconciling: null,
  pendingUpdates: [],
  localUpdateSequences: new Map(),
  incrementalEngineUpdate: false,
  persistence: null,
  undo: null,
  fieldDrafts: new Map(),
  fieldErrors: new Map(),
  accessRemoved: false,
  documentUnavailable: null,
  activeTool: "select",
  spacePressed: false,
  engineSurface: null,
  engineMountGeneration: 0,
  engineViewport: null,
  engineReady: false,
  engineDocumentDirty: false,
  engineDocumentDirtyReason: null,
  compatibilityIssues: [],
  compatibilityNodeIds: new Set(),
  compatibilityDocument: null,
  materializedDocument: null,
  preparedRenderDocument: null,
  documentNodes: null,
  documentNodeById: null,
  deletedNodeSnapshots: new Map(),
  assetPanel: "file",
  inspectorTab: "design",
  documentOpenStartedAt: null,
};

const routes = createRouteCoordinator({
  isDocumentOpen: (documentId) => state.document?.id === documentId,
  openDocument,
  setRoute: (input) => runtime.tab.setRoute(input),
  showDocumentUnavailable,
  showLibrary,
  showTrash,
});

runtime.tab.onNavigate((input) => routes.handleHostNavigation(input));
window.addEventListener("online", () => {
  if (state.document) {
    const documentId = state.document.id;
    if (state.realtimeConnection === REALTIME_CONNECTED) {
      setSync("syncing", "Syncing…");
      render();
      void restoreConnectedState(documentId);
    } else {
      applyDisconnectedState();
    }
  }
});
window.addEventListener("offline", () => {
  if (!state.document) return;
  state.realtimeConnection = realtimeStateAfterSignal(state.realtimeConnection, "browser-offline");
  state.presence = null;
  applyDisconnectedState();
});
window.addEventListener("beforeunload", () => state.unsubscribe?.());
window.addEventListener("keydown", handleKeyboardShortcut);
window.addEventListener("keyup", handleKeyboardRelease);
window.addEventListener("blur", releaseSpacePan);

await bootstrap();

async function bootstrap() {
  try {
    const identity = await runtime.identity.get();
    if (!identity.subject) {
      state.loading = false;
      state.error = "Sign in to your Penkra Account to use Canvas.";
      render();
      return;
    }
    await routes.showDefaultLibrary();
  } catch (error) {
    state.loading = false;
    state.error = message(error);
    render();
  }
}

async function showLibrary() {
  closeDocument();
  state.route = "library";
  state.loading = true;
  state.error = null;
  render();
  try {
    const documents = [];
    let cursor;
    do {
      const page = await api.listDocuments(cursor);
      documents.push(...page.items);
      cursor = page.pageInfo.nextCursor ?? undefined;
    } while (cursor);
    state.documents = documents;
  } catch (error) {
    state.error = message(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function showTrash() {
  closeDocument();
  state.route = "trash";
  state.loading = true;
  state.error = null;
  state.contextMenu = null;
  render();
  try {
    const documents = [];
    let cursor;
    do {
      const page = await api.listTrash(cursor);
      documents.push(...page.items);
      cursor = page.pageInfo.nextCursor ?? undefined;
    } while (cursor);
    state.trashedDocuments = documents;
  } catch (error) {
    state.error = message(error);
  } finally {
    state.loading = false;
    render();
  }
}

async function showDocumentUnavailable(input) {
  closeDocument();
  state.route = "document-unavailable";
  state.documentUnavailable = {
    documentId: input.documentId,
    reason: ["deleted", "trashed"].includes(input.reason) ? input.reason : "unavailable",
    ...(typeof input.title === "string" && input.title ? { title: input.title } : {}),
  };
  state.loading = false;
  state.error = null;
  render();
}

async function navigateToLibrary() {
  await routes.navigateToLibrary();
}

async function navigateToTrash() {
  await routes.navigateToTrash();
}

async function createBlankDocument(title = "Untitled") {
  const source = createBlankDocumentSource();
  const model = createDocumentModel(source);
  try {
    const document = await api.createDocument({ title, source, initialUpdate: encodeState(model) });
    await navigateToDocument(document.id);
  } finally {
    model.doc.destroy();
  }
}

async function importFromHandle() {
  const imported = await choosePenDocument();
  if (!imported) return;
  await importDocument(imported.source, imported.fallbackTitle, imported.assets);
}

async function importDocument(source, fallbackTitle = "Imported design", assets = []) {
  const model = createDocumentModel(source);
  const title = typeof source.name === "string" && source.name.trim() ? source.name : fallbackTitle;
  let document = null;
  try {
    document = await api.createDocument({ title, source, initialUpdate: encodeState(model) });
    for (const asset of assets) await api.uploadAsset(document.id, asset);
    await navigateToDocument(document.id);
  } catch (error) {
    if (document) {
      await api.deleteDocument(document.id).catch(() => undefined);
      await api.permanentlyDeleteDocument(document.id).catch(() => undefined);
    }
    throw error;
  } finally {
    model.doc.destroy();
  }
}

async function navigateToDocument(documentId) {
  await routes.navigateToDocument(documentId);
}

async function openDocument(documentId) {
  closeDocument();
  state.documentOpenStartedAt = performance.now();
  state.route = "editor";
  state.loading = true;
  state.error = null;
  render();
  try {
    const [payload] = await Promise.all([
      performanceMonitor.measureAsync(
        "document.fetch",
        () => api.getDocument(documentId),
        { documentId },
      ),
      performanceMonitor.measureAsync(
        "engine.canvaskit-ready",
        () => prepareOpenPencilEngine(),
        { documentId },
      ),
    ]);
    const assetDescriptors = payload.assets ?? [];
    const assets = await performanceMonitor.measureAsync(
      "document.assets",
      () => Promise.all(
        assetDescriptors.map(async (asset) => [
          asset.path,
          { ...asset, bytes: await api.readAsset(documentId, asset) },
        ]),
      ),
      {
        documentId,
        assets: assetDescriptors.length,
        assetBytes: assetDescriptors.reduce((total, asset) => total + Number(asset.size ?? 0), 0),
      },
    );
    state.document = payload;
    state.assets = new Map(assets);
    state.accessRemoved = false;
    state.model = performanceMonitor.measure(
      "document.restore-model",
      () => restoreDocumentModel(payload, {
        onPerformance: (name, duration, details) => {
          performanceMonitor.record(name, duration, { documentId, ...details });
        },
      }),
      {
        documentId,
        updates: payload.updates?.length ?? 0,
        projectionBytes: payload.snapshot?.projectionBytes ?? 0,
        stateBytes: payload.snapshot?.stateBytes ?? 0,
      },
    );
    invalidateDocumentProjection();
    const serverStateVector = performanceMonitor.measure(
      "document.state-vector",
      () => Y.encodeStateVector(state.model.doc),
      { documentId },
    );
    state.persistence = new IndexeddbPersistence(`penkra-canvas:${documentId}`, state.model.doc);
    await performanceMonitor.measureAsync(
      "document.indexeddb-sync",
      () => state.persistence.whenSynced,
      { documentId },
    );
    const offlineUpdate = performanceMonitor.measure(
      "document.offline-diff",
      () => Y.encodeStateAsUpdate(state.model.doc, serverStateVector),
      { documentId },
    );
    if (offlineUpdate.byteLength > 2) {
      queueEncodedUpdate(documentId, encodeUpdate(offlineUpdate));
    }
    state.undo = createUndoManager(state.model);
    state.lastSequence = Math.max(
      payload.snapshot.throughSequence,
      ...(payload.updates ?? []).map((update) => update.sequence),
    );
    state.selectedId = currentDocumentNodes()[0]?.node.id ?? null;
    state.updateListener = (update, origin) => {
      const incrementalEngineUpdate = origin === ENGINE_ORIGIN && state.incrementalEngineUpdate;
      if (!incrementalEngineUpdate) invalidateDocumentProjection();
      if (origin === REMOTE_ORIGIN) return;
      queueUpdate(documentId, update);
      state.engineDocumentDirty = origin !== ENGINE_ORIGIN;
      state.engineDocumentDirtyReason = state.engineDocumentDirty
        ? origin === LOCAL_ORIGIN ? "local-model-update" : "unclassified-model-update"
        : null;
      state.updatesSinceSnapshot += 1;
      if (state.realtimeConnection === REALTIME_CONNECTED) {
        setSync(navigator.onLine ? "saving" : "offline", navigator.onLine ? "Saving…" : "Offline — changes stay on this device");
      } else {
        applyDisconnectedState(false);
      }
      if (incrementalEngineUpdate) renderSyncStatus();
      else render();
      void flushPending();
    };
    state.model.doc.on("update", state.updateListener);
    state.realtimeConnection = REALTIME_RECONNECTING;
    state.presence = null;
    state.unsubscribe = await performanceMonitor.measureAsync(
      "document.realtime-subscribe",
      () => api.subscribe(
        documentId,
        (event) => {
        if (event.event === "project:update" && event.payload?.update) {
          state.lastSequence = Math.max(state.lastSequence, Number(event.payload.sequence ?? 0));
          if (event.payload.clientUpdateId && state.localUpdateSequences.has(event.payload.clientUpdateId)) {
            state.localUpdateSequences.delete(event.payload.clientUpdateId);
            return;
          }
          const changed = applyRemoteUpdate(state.model, event.payload.update);
          if (!changed) return;
          state.engineDocumentDirty = true;
          state.engineDocumentDirtyReason = "realtime-remote-update";
          render();
        }
        if (event.event === "presence") {
          state.presence = normalizePresenceCount(event.payload?.count);
          render();
        }
        if (event.event === "project:deleted") {
          void routes.navigateToDocumentUnavailable({
            documentId,
            reason: event.payload?.recoverableUntil ? "trashed" : "deleted",
            ...(state.document?.title ? { title: state.document.title } : {}),
          });
        }
        if (event.event === "access-revoked") handleAccessRemoved();
        },
        {
          onConnectionStateChange: (connectionState) => {
            void handleRealtimeConnectionChange(documentId, connectionState);
          },
        },
      ),
      { documentId },
    );
    collapseEditorPanels();
    state.loading = false;
    setSync("saved", "Saved");
    render();
    await flushPending();
  } catch (error) {
    if (state.documentOpenStartedAt !== null) {
      performanceMonitor.record(
        "document.failed",
        performance.now() - state.documentOpenStartedAt,
        { documentId, error: message(error) },
      );
      state.documentOpenStartedAt = null;
    }
    if (error?.status === 404) {
      await showDocumentUnavailable({ documentId, reason: "unavailable" });
      await runtime.tab.setRoute({
        route: "/document-unavailable",
        state: { documentId, reason: "unavailable" },
      });
    } else {
      state.loading = false;
      state.error = message(error);
      render();
    }
  }
}

function closeDocument() {
  disposeEngineSurface();
  state.unsubscribe?.();
  state.unsubscribe = null;
  if (state.model && state.updateListener) state.model.doc.off("update", state.updateListener);
  state.updateListener = null;
  state.assets = new Map();
  state.persistence?.destroy();
  state.undo?.destroy();
  state.model?.doc.destroy();
  state.persistence = null;
  state.undo = null;
  state.pendingUpdates = [];
  state.localUpdateSequences.clear();
  state.incrementalEngineUpdate = false;
  state.reconciling = null;
  state.document = null;
  state.model = null;
  state.selectedId = null;
  state.presence = null;
  state.realtimeConnection = REALTIME_RECONNECTING;
  state.dialog = null;
  state.contextMenu = null;
  state.activeTool = "select";
  collapseEditorPanels();
  state.spacePressed = false;
  state.engineViewport = null;
  state.engineReady = false;
  state.engineDocumentDirty = false;
  state.engineDocumentDirtyReason = null;
  state.compatibilityIssues = [];
  state.compatibilityNodeIds = new Set();
  state.compatibilityDocument = null;
  state.materializedDocument = null;
  state.preparedRenderDocument = null;
  state.documentNodes = null;
  state.documentNodeById = null;
  state.deletedNodeSnapshots.clear();
  state.documentOpenStartedAt = null;
  state.fieldDrafts.clear();
  state.fieldErrors.clear();
  state.accessRemoved = false;
  state.documentUnavailable = null;
}

function collapseEditorPanels() {
  state.activePanel = null;
  state.layersOpen = false;
  state.inspectorOpen = false;
}

async function reconcileFromServer(documentId) {
  if (state.document?.id !== documentId || !state.model) return false;
  if (state.reconciling) return state.reconciling;
  const model = state.model;
  let task;
  task = (async () => {
    try {
      const payload = await api.getDocument(documentId);
      if (state.document?.id !== documentId || state.model !== model) return false;
      const previousSequence = state.lastSequence;
      state.lastSequence = reconcileDocumentPayload(model, payload, state.lastSequence);
      for (const [clientUpdateId, sequence] of state.localUpdateSequences) {
        if (sequence !== null && sequence <= state.lastSequence) {
          state.localUpdateSequences.delete(clientUpdateId);
        }
      }
      state.document = { ...state.document, ...payload };
      if (state.lastSequence > previousSequence) {
        state.engineDocumentDirty = true;
        state.engineDocumentDirtyReason = "server-reconcile";
        render();
      }
      return true;
    } catch (error) {
      if (state.document?.id !== documentId || state.model !== model) return false;
      if (error?.status === 403 || error?.status === 404) {
        handleAccessRemoved();
        return false;
      }
      if (isTransportFailure(error)) {
        state.realtimeConnection = realtimeStateAfterSignal(
          state.realtimeConnection,
          "request-failure",
        );
        state.presence = null;
        setSync(
          navigator.onLine ? "error" : "offline",
          navigator.onLine ? "Couldn’t sync — retrying" : "Offline — changes stay on this device",
        );
        render();
        setTimeout(() => void reconcileFromServer(documentId), 3_000);
        return false;
      }
      setSync(
        navigator.onLine ? "error" : "offline",
        navigator.onLine ? "Couldn’t sync — retrying" : "Offline — changes stay on this device",
      );
      render();
      setTimeout(() => void reconcileFromServer(documentId), 3_000);
      return false;
    }
  })().finally(() => {
    if (state.reconciling === task) state.reconciling = null;
  });
  state.reconciling = task;
  return task;
}

function queueUpdate(documentId, update) {
  if (state.document?.id !== documentId) return;
  queueEncodedUpdate(documentId, encodeUpdate(update));
}

function queueEncodedUpdate(documentId, update) {
  if (state.document?.id !== documentId) return;
  const clientUpdateId = crypto.randomUUID();
  state.pendingUpdates.push({ clientUpdateId, update });
  state.localUpdateSequences.set(clientUpdateId, null);
}

async function flushPending() {
  if (!state.document || state.flushing || !navigator.onLine) return;
  state.flushing = true;
  const documentId = state.document.id;
  try {
    while (state.pendingUpdates.length > 0) {
      const item = state.pendingUpdates[0];
      const result = await api.appendUpdate(documentId, item);
      state.lastSequence = Math.max(state.lastSequence, Number(result.sequence));
      if (state.localUpdateSequences.has(item.clientUpdateId)) {
        state.localUpdateSequences.set(item.clientUpdateId, Number(result.sequence));
      }
      state.pendingUpdates.shift();
    }
    if (state.updatesSinceSnapshot >= 10 && state.model) {
      await api.createSnapshot(documentId, {
        throughSequence: state.lastSequence,
        state: encodeState(state.model),
        source: currentMaterializedDocument(),
      });
      state.updatesSinceSnapshot = 0;
    }
    if (state.realtimeConnection === REALTIME_CONNECTED) {
      setSync("saved", "Saved");
      renderSyncStatus();
    } else {
      applyDisconnectedState(false);
    }
  } catch (error) {
    if (error?.status === 403 || error?.status === 404) {
      handleAccessRemoved();
      return;
    }
    if (isTransportFailure(error)) {
      state.realtimeConnection = realtimeStateAfterSignal(
        state.realtimeConnection,
        "request-failure",
      );
      state.presence = null;
      setSync(
        navigator.onLine ? "error" : "offline",
        navigator.onLine ? "Couldn’t save — retrying" : "Offline — changes stay on this device",
      );
      setTimeout(() => void flushPending(), 3_000);
      return;
    }
    setSync(navigator.onLine ? "error" : "offline", navigator.onLine ? "Couldn’t save — retrying" : "Offline — changes stay on this device");
    setTimeout(() => void flushPending(), 3_000);
  } finally {
    state.flushing = false;
    renderSyncStatus();
  }
}

async function handleRealtimeConnectionChange(documentId, connectionState) {
  if (state.document?.id !== documentId) return;
  state.realtimeConnection = realtimeStateAfterSignal(
    state.realtimeConnection,
    connectionState,
  );
  if (connectionState !== REALTIME_CONNECTED) {
    state.presence = null;
    applyDisconnectedState();
    return;
  }
  setSync("syncing", "Syncing…");
  render();
  await restoreConnectedState(documentId);
}

async function restoreConnectedState(documentId) {
  const reconciled = await reconcileFromServer(documentId);
  if (!reconciled || state.document?.id !== documentId) return;
  await flushPending();
}

function applyDisconnectedState(shouldRender = true) {
  const status = disconnectedSyncStatus(navigator.onLine);
  setSync(status.sync, status.message);
  if (shouldRender) render();
}

function setSync(sync, syncMessage) {
  state.sync = sync;
  state.syncMessage = syncMessage;
}

function renderSyncStatus() {
  const sync = root.querySelector(".sync");
  if (!sync) return;
  sync.dataset.state = state.sync;
  sync.title = state.syncMessage;
  const label = sync.querySelector("span");
  if (label) label.textContent = state.syncMessage;
}

function invalidateDocumentProjection() {
  state.materializedDocument = null;
  state.preparedRenderDocument = null;
  state.documentNodes = null;
  state.documentNodeById = null;
}

function currentPreparedRenderDocument() {
  if (!state.preparedRenderDocument) {
    state.preparedRenderDocument = performanceMonitor.measure(
      "document.prepare-render",
      () => prepareOpenPencilRenderDocument(currentMaterializedDocument(), { assets: state.assets }),
      { documentId: state.document?.id, nodes: state.documentNodes?.length ?? 0 },
    );
  }
  return state.preparedRenderDocument;
}

function currentMaterializedDocument() {
  if (!state.materializedDocument) {
    state.materializedDocument = performanceMonitor.measure(
      "document.materialize",
      () => materialize(state.model),
      { documentId: state.document?.id },
    );
  }
  return state.materializedDocument;
}

function currentDocumentNodes() {
  if (!state.documentNodes) {
    state.documentNodes = performanceMonitor.measure(
      "document.index",
      () => listDocumentNodes(currentMaterializedDocument()),
      { documentId: state.document?.id },
    );
    state.documentNodeById = new Map(
      state.documentNodes.map(({ node }) => [node.id, node]),
    );
  }
  return state.documentNodes;
}

function currentDocumentNode(nodeId) {
  if (!nodeId) return null;
  currentDocumentNodes();
  return state.documentNodeById.get(nodeId) ?? null;
}

function currentCanvasSelection() {
  if (!state.selectedId) return null;
  return resolveCanvasNodeSelection({
    document: currentMaterializedDocument(),
    graph: state.engineSurface?.editor.graph,
    selectedId: state.selectedId,
  });
}

function render() {
  const renderStartedAt = performance.now();
  const retainedHost = state.route === "editor" && state.document && state.engineSurface
    ? root.querySelector('[data-role="openpencil-surface"]')
    : null;
  if (!retainedHost) disposeEngineSurface();
  if (state.loading) {
    root.innerHTML = `<main class="shell empty"><div><span class="muted">Loading Canvas…</span></div></main>`;
    return;
  }
  if (state.error && !state.document) {
    root.innerHTML = `<main class="shell empty"><div><h2>Canvas couldn’t open</h2><p>${escapeHtml(state.error)}</p><button class="button" data-action="retry">Try again</button></div></main>`;
    bindCommon();
    return;
  }
  root.innerHTML = state.route === "editor" && state.document && state.model
    ? renderEditor()
    : state.route === "document-unavailable" && state.documentUnavailable
      ? renderDocumentUnavailable()
      : state.route === "trash" ? renderTrash() : renderLibrary();
  if (retainedHost) {
    root.querySelector('[data-role="openpencil-surface"]')?.replaceWith(retainedHost);
  }
  bindCommon();
  if (state.route === "editor") {
    bindEditor();
    if (retainedHost) {
      if (state.engineDocumentDirty) {
        performanceMonitor.measure(
          "engine.replace-document",
          () => state.engineSurface.replaceDocument(
            currentMaterializedDocument(),
            state.selectedId,
            currentPreparedRenderDocument(),
          ),
          {
            documentId: state.document.id,
            nodes: state.documentNodes?.length ?? 0,
            reason: state.engineDocumentDirtyReason ?? "unknown",
          },
        );
        state.engineDocumentDirty = false;
        state.engineDocumentDirtyReason = null;
      }
    } else scheduleEditorSurfaceMount();
  }
  else bindLibrary();
  focusRequestedControl();
  performanceMonitor.record("ui.render", performance.now() - renderStartedAt, {
    route: state.route,
    nodes: state.documentNodes?.length ?? 0,
  });
}

function renderDocumentUnavailable() {
  const unavailable = state.documentUnavailable;
  const deleted = unavailable.reason === "deleted";
  const trashed = unavailable.reason === "trashed";
  const heading = trashed ? "This design is in Trash" : deleted ? "This design was deleted" : "This design is unavailable";
  const subject = unavailable.title ? `“${unavailable.title}”` : "This Canvas design";
  const detail = trashed
    ? `${subject} was moved to Trash by its owner and can be restored from the Trash page for 30 days.`
    : deleted
    ? `${subject} was permanently deleted and can no longer be opened.`
    : `${subject} no longer exists or you no longer have access to it.`;
  return `<main class="shell empty"><div>${icon("file")}<h2>${heading}</h2><p>${escapeHtml(detail)}</p><div class="library-actions"><button class="button primary" data-action="back">Back to files</button></div></div></main>`;
}

function renderLibrary() {
  const query = state.search.trim().toLowerCase();
  const documents = state.documents.filter((document) => {
    const matchesGroup =
      state.libraryFilter === "all" ||
      (state.libraryFilter === "owned" ? document.access === "owner" : document.access === "editor");
    return matchesGroup && (!query || document.title.toLowerCase().includes(query));
  });
  return `<main class="shell library" data-drop-target="library"><div class="library-inner">
    <header class="library-header">
      <div class="library-title"><h1>Canvas</h1><p>Create, import, and collaborate on design documents.</p></div>
      <div class="library-actions"><button class="button" data-action="open-trash">Trash</button><button class="button" data-action="import">Import .pen</button><button class="button primary" data-action="new">New design</button></div>
    </header>
    <div class="library-toolbar">
      <input class="search" data-role="search" type="search" value="${escapeHtml(state.search)}" placeholder="Search files" aria-label="Search files" />
      <div class="segmented" aria-label="Library section">
        ${segment("all", "All")}${segment("owned", "Your files")}${segment("shared", "Shared with you")}
      </div>
    </div>
    ${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
    ${documents.length ? `<section class="document-grid">${documents.map(documentCard).join("")}</section>` : `<section class="empty"><div>${icon("file")}<h2>No files here yet</h2><p>Create a design or import a .pen file. Shared files appear automatically when another owner adds your verified Account email.</p></div></section>`}
  </div></main>${renderContextMenu()}${renderDialog()}${renderToast()}`;
}

function renderTrash() {
  const query = state.search.trim().toLowerCase();
  const documents = state.trashedDocuments.filter((document) =>
    !query || document.title.toLowerCase().includes(query));
  return `<main class="shell library"><div class="library-inner">
    <header class="library-header">
      <div class="library-title"><h1>Trash</h1><p>Items in Trash are permanently deleted after 30 days.</p></div>
      <div class="library-actions"><button class="button" data-action="back-to-files">Back to files</button></div>
    </header>
    <div class="library-toolbar"><input class="search" data-role="search" type="search" value="${escapeHtml(state.search)}" placeholder="Search Trash" aria-label="Search Trash" /></div>
    ${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
    ${documents.length ? `<section class="document-grid">${documents.map(trashCard).join("")}</section>` : `<section class="empty"><div>${icon("trash")}<h2>Trash is empty</h2><p>Files moved to Trash will appear here for 30 days.</p></div></section>`}
  </div></main>${renderDialog()}${renderToast()}`;
}

function segment(key, label) {
  return `<button class="${state.libraryFilter === key ? "active" : ""}" data-filter="${key}">${label}</button>`;
}

function documentCard(document) {
  const ownership = document.access === "owner" ? "Your file" : `Shared by ${document.ownerName ?? "another Account"}`;
  return `<button class="document-card" data-document-id="${document.id}"><span class="document-preview">${icon("frame")}</span><span class="document-meta"><strong>${escapeHtml(document.title)}</strong><span>${escapeHtml(ownership)} · ${relativeTime(document.updatedAt)}</span></span></button>`;
}

function trashCard(document) {
  return `<article class="document-card trash-card"><span class="document-preview">${icon("file")}</span><span class="document-meta"><strong>${escapeHtml(document.title)}</strong><span>Deleted ${escapeHtml(formatDate(document.deletedAt))}</span><span>Permanently deletes ${escapeHtml(formatDate(document.recoverableUntil))}</span></span><span class="trash-actions"><button class="button" data-restore-document="${document.id}">Restore</button><button class="button danger" data-permanently-delete-document="${document.id}">Delete permanently</button></span></article>`;
}

function renderContextMenu() {
  const menu = state.contextMenu;
  if (!menu) return "";
  const document = state.documents.find((item) => item.id === menu.documentId);
  if (!document || document.access !== "owner") return "";
  return `<div class="context-menu-backdrop" data-action="close-context-menu"><div class="context-menu" role="menu" aria-label="${escapeHtml(document.title)} actions" style="left:${menu.x}px;top:${menu.y}px"><button role="menuitem" data-trash-document="${document.id}">${icon("trash")}<span>Move to Trash</span></button></div></div>`;
}

function renderEditor() {
  if (state.accessRemoved) {
    return `<main class="shell empty"><div>${icon("file")}<h2>${ACCESS_REMOVED_HEADING}</h2><p>${ACCESS_REMOVED_MESSAGE}</p><div class="library-actions"><button class="button primary" data-action="back">Back to files</button></div></div></main>${renderToast()}`;
  }
  const document = currentMaterializedDocument();
  const documentNodes = currentDocumentNodes();
  const layerNodes = currentLayerNodes(documentNodes);
  if (state.compatibilityDocument !== document) {
    state.compatibilityIssues = performanceMonitor.measure(
      "document.compatibility",
      () => analyzeOpenPencilCompatibility(
        document,
        state.assets,
        currentPreparedRenderDocument(),
      ),
      { documentId: state.document.id, nodes: documentNodes.length },
    );
    state.compatibilityNodeIds = new Set(state.compatibilityIssues.map((issue) => issue.nodeId));
    state.compatibilityDocument = document;
  }
  const selection = currentCanvasSelection();
  const unsupported = state.compatibilityIssues;
  const visiblePresence = visiblePresenceCount(state.realtimeConnection, state.presence);
  const presenceNoun = visiblePresence === 1 ? "person" : "people";
  const panelClass = state.activePanel ? `show-${state.activePanel}` : "show-none";
  const panelVisibilityClass = `${state.layersOpen ? "layers-open" : "layers-closed"} ${state.inspectorOpen ? "inspector-open" : "inspector-closed"}`;
  const closedPanelClass = state.layersOpen && state.inspectorOpen ? "" : " has-closed-panel";
  return `<main class="shell editor${closedPanelClass}">
    <header class="editor-header">
      <button class="icon-button" data-action="back" aria-label="Back to files">${icon("back")}</button>
      <div class="panel-switch segmented"><button class="${state.activePanel === "layers" ? "active" : ""}" data-panel="layers">Layers</button><button class="${state.activePanel === "inspector" ? "active" : ""}" data-panel="inspector">Inspect</button></div>
      <div class="editor-title"><input data-role="title" value="${escapeHtml(state.document.title)}" aria-label="Document title" /></div>
      <div class="history-controls"><button class="icon-button" data-action="undo" aria-label="Undo" ${state.undo?.canUndo() ? "" : "disabled"}>${icon("undo")}</button><button class="icon-button" data-action="redo" aria-label="Redo" ${state.undo?.canRedo() ? "" : "disabled"}>${icon("redo")}</button></div>
      <div class="sync" data-state="${state.sync}" title="${escapeHtml(state.syncMessage)}" role="status" aria-live="polite"><i class="sync-dot"></i><span>${escapeHtml(state.syncMessage)}</span></div>
      ${visiblePresence === null ? "" : `<div class="presence" aria-label="${visiblePresence} ${presenceNoun} here"><span>People </span>${visiblePresence}</div>`}
      ${state.document.access === "owner" ? `<button class="button" data-action="share">Share</button>` : ""}
      <button class="icon-button" data-action="menu" aria-label="Document actions">${icon("more")}</button>
    </header>
    <div class="editor-body ${panelClass} ${panelVisibilityClass}">
      <aside class="side-panel layers" ${state.layersOpen ? "" : "hidden"}>
        <div class="panel-tabs"><button class="${state.assetPanel === "file" ? "active" : ""}" data-asset-panel="file">File</button><button class="${state.assetPanel === "assets" ? "active" : ""}" data-asset-panel="assets">Assets</button><button class="icon-button panel-close" data-action="close-layers" aria-label="Close layers">${icon("close")}</button></div>
        <div class="panel-scroll">${state.layersOpen ? renderLayersPanelContent(layerNodes) : ""}</div>
      </aside>
      <section class="viewport" data-role="viewport" data-tool="${state.activeTool}" tabindex="0" aria-label="Canvas viewport">
        <div class="openpencil-host" data-role="openpencil-surface"><div class="engine-loading" role="status" aria-live="polite">Rendering design…</div></div>
        ${state.realtimeConnection === REALTIME_RECONNECTING && navigator.onLine ? `<div class="connection-banner">${icon("refresh")}<span>Reconnecting and merging changes</span></div>` : ""}
        ${unsupported.length ? `<div class="compatibility-banner"><span>${unsupported.length} visual behavior${unsupported.length === 1 ? "" : "s"} preserved but not faithfully represented</span><button class="button" data-action="compatibility">Review</button></div>` : ""}
        <div class="zoom-controls" aria-label="Canvas zoom"><button class="tool" data-action="zoom-out" aria-label="Zoom out">−</button><button class="zoom-label" data-action="fit" aria-label="Fit design in view">${Math.round((state.engineViewport?.zoom ?? 1) * 100)}%</button><button class="tool" data-action="zoom-in" aria-label="Zoom in">+</button></div>
        <div class="tool-palette" aria-label="Canvas tools"><button class="tool ${state.activeTool === "select" ? "active" : ""}" data-tool="SELECT" aria-label="Select tool" title="Select (V)">${icon("cursor")}</button><button class="tool ${state.activeTool === "hand" ? "active" : ""}" data-tool="HAND" aria-label="Pan canvas" title="Pan canvas (H or Space)">${icon("hand")}</button><span class="tool-separator"></span><button class="tool" data-tool="FRAME" aria-label="Frame tool" title="Frame (F)">${icon("frame")}</button><button class="tool" data-tool="RECTANGLE" aria-label="Rectangle tool" title="Rectangle (R)">${icon("rectangle")}</button><button class="tool" data-tool="ELLIPSE" aria-label="Ellipse tool" title="Ellipse (O)">${icon("ellipse")}</button><button class="tool" data-tool="TEXT" aria-label="Text tool" title="Text (T)">${icon("text")}</button></div>
      </section>
      <aside class="side-panel inspector" ${state.inspectorOpen ? "" : "hidden"}><div class="panel-tabs"><button class="${state.inspectorTab === "design" ? "active" : ""}" data-inspector-tab="design">Design</button><button class="${state.inspectorTab === "code" ? "active" : ""}" data-inspector-tab="code">Code</button><button class="icon-button panel-close" data-action="close-inspector" aria-label="Close inspector">${icon("close")}</button></div><div class="panel-scroll">${state.inspectorTab === "design" ? renderInspector(selection) : renderCodeInspector(selection)}</div></aside>
    </div>
  </main>${renderDialog()}${renderToast()}`;
}

function mountEditorSurface() {
  if (state.accessRemoved || !state.model) return;
  const host = root.querySelector('[data-role="openpencil-surface"]');
  if (!host) return;
  const documentId = state.document.id;
  const firstFrameStartedAt = performance.now();
  try {
    let surface;
    surface = performanceMonitor.measure("engine.mount", () => mountOpenPencilSurface(host, currentMaterializedDocument(), {
      assets: state.assets,
      preparedDocument: currentPreparedRenderDocument(),
      selectedId: state.selectedId,
      viewport: state.engineViewport,
      getViewportInsets: () => visibleViewportInsets(host),
      onPerformance: (name, duration, details) => {
        performanceMonitor.record(name, duration, { documentId, ...details });
      },
      onReady: () => {
        if (state.engineSurface !== surface) return;
        state.engineReady = true;
        renderHistoryControls();
        renderLayersTree();
        host.querySelector(".engine-loading")?.remove();
        performanceMonitor.record(
          "engine.first-frame",
          performance.now() - firstFrameStartedAt,
          {
            documentId,
            graphNodes: surface.editor.graph.nodes.size,
          },
        );
        if (state.documentOpenStartedAt !== null) {
          performanceMonitor.record(
            "document.interactive",
            performance.now() - state.documentOpenStartedAt,
            {
              documentId,
              nodes: state.documentNodes?.length ?? 0,
              graphNodes: surface.editor.graph.nodes.size,
            },
          );
          state.documentOpenStartedAt = null;
        }
      },
      onSelection: ([nodeId]) => {
        if (state.document?.id !== documentId || nodeId === state.selectedId) return;
        state.selectedId = nodeId ?? null;
        renderSelection();
      },
      onViewport: (viewport) => {
        if (state.document?.id !== documentId) return;
        state.engineViewport = viewport;
        const label = root.querySelector('[data-action="fit"]');
        if (label) label.textContent = `${Math.round(viewport.zoom * 100)}%`;
      },
      onTool: (tool) => {
        state.activeTool = tool.toLowerCase();
        root.querySelectorAll("button[data-tool]").forEach((button) => {
          button.classList.toggle("active", button.dataset.tool === tool);
        });
      },
      onMutations: (mutations) => queueEngineMutations(documentId, surface, mutations),
      onUnsupportedEdit: (text) => setToast(text, true),
      onError: (error) => {
        state.engineReady = false;
        host.innerHTML = `<div class="engine-error"><strong>Canvas could not render this design.</strong><span>${escapeHtml(message(error))}</span></div>`;
      },
    }), { documentId, nodes: state.documentNodes?.length ?? 0 });
    state.engineSurface = surface;
    state.engineDocumentDirty = false;
    state.engineDocumentDirtyReason = null;
  } catch (error) {
    host.innerHTML = `<div class="engine-error"><strong>Canvas could not render this design.</strong><span>${escapeHtml(message(error))}</span></div>`;
  }
}

function scheduleEditorSurfaceMount() {
  const generation = ++state.engineMountGeneration;
  const documentId = state.document?.id;
  const scheduleAfterPaint = () => setTimeout(() => {
    if (
      generation !== state.engineMountGeneration
      || state.loading
      || state.route !== "editor"
      || state.document?.id !== documentId
      || !state.model
      || state.engineSurface
    ) return;
    mountEditorSurface();
  }, 0);
  if (typeof requestAnimationFrame === "function" && document.visibilityState !== "hidden") {
    requestAnimationFrame(scheduleAfterPaint);
  } else {
    scheduleAfterPaint();
  }
}

function disposeEngineSurface() {
  state.engineMountGeneration += 1;
  if (!state.engineSurface) return;
  const { editor } = state.engineSurface;
  state.engineViewport = {
    panX: editor.state.panX,
    panY: editor.state.panY,
    zoom: editor.state.zoom,
  };
  state.engineSurface.unmount();
  state.engineSurface = null;
  state.engineReady = false;
}

let pendingEngineBatch = null;
function queueEngineMutations(documentId, surface, mutations, { prepend = false } = {}) {
  if (state.engineSurface !== surface || state.document?.id !== documentId) return;
  pendingEngineBatch ??= { documentId, surface, mutations: [] };
  if (prepend) pendingEngineBatch.mutations.unshift(...mutations);
  else pendingEngineBatch.mutations.push(...mutations);
  queueMicrotask(() => {
    const batch = pendingEngineBatch;
    if (!batch || batch.surface !== surface) return;
    pendingEngineBatch = null;
    if (state.engineSurface !== surface || state.document?.id !== documentId || !state.model) return;
    const documentNodes = currentDocumentNodes();
    const existing = new Set(documentNodes.map(({ node }) => node.id));
    const mutations = compactDeletionMutations(batch.mutations, documentNodes);
    const documentEntryById = new Map(documentNodes.map((entry) => [entry.node.id, entry]));
    for (const mutation of mutations) {
      if (mutation.kind !== "delete-node") continue;
      const entry = documentEntryById.get(mutation.nodeId);
      if (!entry) continue;
      state.deletedNodeSnapshots.set(mutation.nodeId, {
        node: structuredClone(entry.node),
        parentId: entry.parentId,
        position: entry.index,
      });
    }
    const appliedMutations = [];
    state.incrementalEngineUpdate = true;
    try {
      state.model.doc.transact(() => {
        for (const mutation of mutations) {
          if (mutation.kind === "insert-node" && existing.has(mutation.node.id)) continue;
          if (mutation.kind !== "insert-node" && !existing.has(mutation.nodeId)) continue;
          const modelMutation = mutation.kind === "insert-node" && state.model.nodes.has(mutation.node.id)
            ? { kind: "restore-node", nodeId: mutation.node.id }
            : mutation;
          mutate(state.model, modelMutation, ENGINE_ORIGIN);
          appliedMutations.push(mutation);
          if (mutation.kind === "insert-node") {
            existing.add(mutation.node.id);
            state.deletedNodeSnapshots.delete(mutation.node.id);
          }
          if (mutation.kind === "delete-node") existing.delete(mutation.nodeId);
        }
      }, ENGINE_ORIGIN);
    } finally {
      state.incrementalEngineUpdate = false;
    }
    if (appliedMutations.length) {
      applyMutationsToProjection(state.materializedDocument, appliedMutations);
      state.documentNodes = null;
      state.documentNodeById = null;
      state.preparedRenderDocument = null;
      state.compatibilityDocument = null;
      renderSelection();
      renderLayersTree();
      renderHistoryControls();
    }
  });
}

function renderLayersTree() {
  const scroll = root.querySelector(".side-panel.layers .panel-scroll");
  if (!scroll) return;
  if (!state.layersOpen) {
    scroll.replaceChildren();
    return;
  }
  scroll.innerHTML = renderLayersPanelContent(currentLayerNodes());
  bindLayersTree();
}

function currentLayerNodes(fallback = currentDocumentNodes()) {
  const editor = state.engineSurface?.editor;
  const graph = editor?.graph;
  if (!graph) return fallback;
  const pageId = editor.state.currentPageId ?? graph.getPages()?.[0]?.id;
  const nodes = listCanvasSceneLayers(graph, pageId);
  return nodes.length > 0 ? nodes : fallback;
}

function renderLayersPanelContent(nodes) {
  if (state.assetPanel !== "file") {
    return `<div class="inspector-empty">Reusable components and document assets appear here.</div>`;
  }
  return `<section class="layer-section"><h3>Pages</h3><button class="page-row active">Page 1</button></section><section class="layer-section"><h3>Layers</h3><div role="tree" aria-label="Document layers">${nodes.map(layerRow).join("")}</div></section>`;
}

function renderHistoryControls() {
  const editor = state.engineSurface?.editor;
  const undoButton = root.querySelector('[data-action="undo"]');
  const redoButton = root.querySelector('[data-action="redo"]');
  if (undoButton) undoButton.disabled = editor ? !editor.undo.canUndo : !state.undo?.canUndo();
  if (redoButton) redoButton.disabled = editor ? !editor.undo.canRedo : !state.undo?.canRedo();
}

function layerRow({ node, depth }) {
  const sourceId = node.pencilNodeId ?? node.id.split("/").at(-1);
  const issue = state.compatibilityNodeIds.has(sourceId);
  const type = String(node.type).toLowerCase();
  return `<button class="layer-row ${node.id === state.selectedId ? "selected" : ""}" style="--depth:${depth}" data-node-id="${escapeHtml(node.id)}" role="treeitem" aria-level="${depth + 1}" aria-selected="${node.id === state.selectedId}"><span class="layer-type">${type === "text" ? "T" : ["frame", "group", "section"].includes(type) ? "□" : "◇"}</span><span>${escapeHtml(node.name ?? node.content ?? node.text ?? node.type)}</span>${issue ? `<span title="Preserved but not faithfully represented">⚠</span>` : ""}</button>`;
}

function renderInspector(selection) {
  const node = selection?.effectiveNode;
  if (!node) return `<div class="inspector-empty">Select an object to inspect and edit its properties.</div>`;
  const sceneEditable = isOpenPencilEditableNode(node);
  if (!isPencilAuthorableNode(node, sceneEditable)) {
    return `${selectionHeading(selection)}<div class="inspector-empty">This unsupported object is preserved as opaque .pen source and cannot be edited in Canvas.</div>`;
  }
  const fieldNodeId = selection.referenceId;
  const numeric = ["x", "y", "width", "height", "rotation"];
  const simpleFill = typeof node.fill === "string"
    || node.fill?.type === "color"
    || node.fill?.type === "solid"
    || node.fill == null;
  return `${selectionHeading(selection)}
  <section class="section"><h3>Position</h3><div class="field-grid">${field("name", node.name ?? "", "text", true, fieldNodeId)}${numeric.slice(0, 2).map((property) => field(property, node[property] ?? 0, "number", false, fieldNodeId)).join("")}${field("rotation", node.rotation ?? 0, "number", false, fieldNodeId)}</div></section>
  <section class="section"><h3>Layout</h3><div class="field-grid">${numeric.slice(2, 4).map((property) => field(property, node[property] ?? 0, "number", false, fieldNodeId)).join("")}${field("gap", node.gap ?? 0, "number", false, fieldNodeId)}${field("padding", Array.isArray(node.padding) ? node.padding.join(", ") : node.padding ?? 0, "text", false, fieldNodeId)}</div></section>
  <section class="section"><h3>Appearance</h3><div class="field-grid">${simpleFill ? field("fill", fillValue(node.fill), "text", true, fieldNodeId) : ""}${field("opacity", node.opacity ?? 1, "number", false, fieldNodeId)}${field("cornerRadius", node.cornerRadius ?? 0, "number", false, fieldNodeId)}</div></section>
  ${node.type === "text" ? `<section class="section"><h3>Typography</h3><div class="field-grid">${field("content", node.content ?? "", "text", true, fieldNodeId)}${field("fontFamily", node.fontFamily ?? "Inter", "text", true, fieldNodeId)}${field("fontSize", node.fontSize ?? 16, "number", false, fieldNodeId)}${field("fontWeight", node.fontWeight ?? "400", "text", false, fieldNodeId)}${field("lineHeight", node.lineHeight ?? 1.2, "number", false, fieldNodeId)}</div></section>` : ""}
  ${pencilAuthoringSections(node).map((section) => renderAuthoringSection(section, fieldNodeId)).join("")}
  ${state.compatibilityNodeIds.has(node.id) ? `<section class="section"><h3>Compatibility</h3><p class="muted">Some visual behavior on this object is preserved in the .pen source but is not represented faithfully. Review compatibility for details.</p></section>` : ""}
  ${selection.isInstanceDescendant ? "" : `<div class="danger-zone"><button class="button danger" data-action="delete-node">Delete object</button></div>`}`;
}

function renderAuthoringSection(section, nodeId) {
  return `<section class="section"><h3>${escapeHtml(section.title)}</h3><div class="field-grid">${section.fields.map((descriptor) => authoringField(descriptor, nodeId)).join("")}</div></section>`;
}

function authoringField(descriptor, nodeId) {
  const path = descriptor.path.join(".");
  const options = { kind: descriptor.kind, path, label: descriptor.path.at(-1) ?? descriptor.property };
  return field(descriptor.property, descriptor.value, descriptor.kind, descriptor.full, nodeId, options);
}

function selectionHeading(selection) {
  const node = selection.effectiveNode;
  return `<section class="selection-heading"><span class="layer-type">${node.type === "text" ? "T" : "◇"}</span><div><strong>${escapeHtml(node.name ?? node.type)}</strong><span>${escapeHtml(node.type)} · ${escapeHtml(selection.referenceId)}</span></div><button class="button copy-reference" data-action="copy-node-reference" type="button" title="Copy a reference you can paste into a Thread or send to an agent">Copy reference</button></section>`;
}

function renderSelection() {
  const startedAt = performance.now();
  const previous = root.querySelector(".layer-row.selected");
  previous?.classList.remove("selected");
  previous?.setAttribute("aria-selected", "false");
  if (state.selectedId) {
    const selected = root.querySelector(`[data-node-id="${CSS.escape(state.selectedId)}"]`);
    selected?.classList.add("selected");
    selected?.setAttribute("aria-selected", "true");
  }
  const inspector = root.querySelector(".side-panel.inspector .panel-scroll");
  if (inspector) {
    const selection = currentCanvasSelection();
    inspector.innerHTML = state.inspectorTab === "design"
      ? renderInspector(selection)
      : renderCodeInspector(selection);
    bindInspectorControls();
  }
  performanceMonitor.record("ui.selection", performance.now() - startedAt, {
    documentId: state.document?.id,
    nodeId: state.selectedId,
  });
}

function syncPanelVisibility() {
  const startedAt = performance.now();
  const editor = root.querySelector(".shell.editor");
  const body = root.querySelector(".editor-body");
  editor?.classList.toggle("has-closed-panel", !(state.layersOpen && state.inspectorOpen));
  if (body) {
    body.classList.remove("show-layers", "show-inspector", "show-none", "layers-open", "layers-closed", "inspector-open", "inspector-closed");
    body.classList.add(state.activePanel ? `show-${state.activePanel}` : "show-none");
    body.classList.add(state.layersOpen ? "layers-open" : "layers-closed");
    body.classList.add(state.inspectorOpen ? "inspector-open" : "inspector-closed");
  }
  root.querySelector(".side-panel.layers")?.toggleAttribute("hidden", !state.layersOpen);
  root.querySelector(".side-panel.inspector")?.toggleAttribute("hidden", !state.inspectorOpen);
  root.querySelectorAll("[data-panel]").forEach((button) => {
    button.classList.toggle("active", button.dataset.panel === state.activePanel);
  });
  performanceMonitor.record("ui.panel", performance.now() - startedAt, {
    documentId: state.document?.id,
    panel: state.activePanel,
  });
}

function renderCodeInspector(selection) {
  if (!selection?.sourceNode) return `<div class="inspector-empty">Select an object to inspect its lossless .pen source.</div>`;
  const source = selection.isInstanceDescendant
    ? {
      nodeId: selection.referenceId,
      componentSource: selection.sourceNode,
      instanceOverride: selection.override,
    }
    : selection.sourceNode;
  return `<section class="section code-section"><h3>.pen source</h3><pre>${escapeHtml(JSON.stringify(source, null, 2))}</pre></section>`;
}

function field(property, value, type = "text", full = false, nodeId = "", options = {}) {
  const kind = options.kind ?? type;
  const path = options.path ?? "";
  const key = `${nodeId}:${property}:${path}`;
  const displayed = state.fieldDrafts.has(key) ? state.fieldDrafts.get(key) : value;
  const error = state.fieldErrors.get(key);
  const label = options.label ?? property;
  const attributes = `data-property="${escapeHtml(property)}" data-path="${escapeHtml(path)}" data-value-kind="${escapeHtml(kind)}"`;
  const invalid = error ? `aria-invalid="true" aria-describedby="field-${property}-error"` : "";
  let control;
  if (kind === "json" || kind === "textarea") {
    const text = state.fieldDrafts.has(key)
      ? displayed
      : kind === "json" ? JSON.stringify(value, null, 2) : displayed;
    control = `<textarea id="field-${property}" class="field field-area" ${attributes} ${invalid}>${escapeHtml(text)}</textarea>`;
  } else if (kind === "boolean") {
    control = `<input id="field-${property}" class="field field-check" type="checkbox" ${attributes} ${displayed ? "checked" : ""} ${invalid} />`;
  } else {
    control = `<input id="field-${property}" class="field" type="${type === "number" ? "number" : "text"}" ${attributes} value="${escapeHtml(displayed)}" ${invalid} />`;
  }
  return `<div class="field-row ${full ? "full" : ""}"><label for="field-${property}">${escapeHtml(label)}</label>${control}${error ? `<span class="field-error" id="field-${property}-error">${escapeHtml(error)}</span>` : ""}</div>`;
}

function bindCommon() {
  root.querySelector('[data-action="retry"]')?.addEventListener("click", () => void bootstrap());
  if (state.route === "document-unavailable") {
    root.querySelector('[data-action="back"]')?.addEventListener("click", () => void navigateToLibrary());
  }
  root.querySelectorAll("[data-action=close-dialog]").forEach((button) =>
    button.addEventListener("click", closeDialog),
  );
}

function bindLibrary() {
  root.querySelector('[data-action="open-trash"]')?.addEventListener("click", () => void navigateToTrash());
  root.querySelector('[data-action="back-to-files"]')?.addEventListener("click", () => void navigateToLibrary());
  root.querySelector('[data-action="new"]')?.addEventListener("click", () => void act(() => createBlankDocument()));
  root.querySelector('[data-action="import"]')?.addEventListener("click", () => void act(importFromHandle));
  root.querySelector('[data-role="search"]')?.addEventListener("input", (event) => {
    state.search = event.target.value;
    render();
    const search = root.querySelector('[data-role="search"]');
    search?.focus();
    search?.setSelectionRange(state.search.length, state.search.length);
  });
  root.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    state.libraryFilter = button.dataset.filter;
    render();
  }));
  root.querySelectorAll("[data-document-id]").forEach((button) => {
    button.addEventListener("click", () => void navigateToDocument(button.dataset.documentId));
    button.addEventListener("contextmenu", (event) => {
      const document = state.documents.find((item) => item.id === button.dataset.documentId);
      if (document?.access !== "owner") return;
      event.preventDefault();
      state.contextMenu = {
        documentId: document.id,
        x: Math.min(event.clientX, Math.max(8, innerWidth - 190)),
        y: Math.min(event.clientY, Math.max(8, innerHeight - 70)),
      };
      render();
    });
  });
  root.querySelector('[data-action="close-context-menu"]')?.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    state.contextMenu = null;
    render();
  });
  root.querySelectorAll("[data-trash-document]").forEach((button) => button.addEventListener("click", () => {
    const document = state.documents.find((item) => item.id === button.dataset.trashDocument);
    if (!document) return;
    state.contextMenu = null;
    state.dialog = documentTrashConfirmation(document, {
      returnDialog: null,
      returnFocusSelector: `[data-document-id="${document.id}"]`,
    });
    state.dialogFocusSelector = '[data-action="cancel-confirmation"]';
    render();
  }));
  root.querySelectorAll("[data-restore-document]").forEach((button) => button.addEventListener("click", () => void act(async () => {
    await api.restoreDocument(button.dataset.restoreDocument);
    state.trashedDocuments = state.trashedDocuments.filter((item) => item.id !== button.dataset.restoreDocument);
    setToast("Document restored.");
    render();
  })));
  root.querySelectorAll("[data-permanently-delete-document]").forEach((button) => button.addEventListener("click", () => {
    const document = state.trashedDocuments.find((item) => item.id === button.dataset.permanentlyDeleteDocument);
    if (!document) return;
    state.dialog = documentPermanentDeleteConfirmation(document);
    state.dialogFocusSelector = '[data-action="cancel-confirmation"]';
    render();
  }));
  root.querySelector('[data-action="cancel-confirmation"]')?.addEventListener("click", cancelDestructiveConfirmation);
  root.querySelector('[data-action="confirm-trash-document"]')?.addEventListener("click", () => void confirmDestructiveAction());
  root.querySelector('[data-action="confirm-permanently-delete-document"]')?.addEventListener("click", () => void confirmDestructiveAction());
  const dropTarget = root.querySelector("[data-drop-target=library]");
  dropTarget?.addEventListener("dragover", (event) => { event.preventDefault(); });
  dropTarget?.addEventListener("drop", (event) => {
    event.preventDefault();
    void act(async () => {
      const imported = await readDroppedPenDocument(event.dataTransfer);
      if (!imported) return;
      await importDocument(imported.source, imported.fallbackTitle, imported.assets);
    });
  });
}

function bindEditor() {
  root.querySelector('[data-action="back"]')?.addEventListener("click", () => void navigateToLibrary());
  if (state.accessRemoved) return;
  root.querySelector('[data-action="undo"]')?.addEventListener("click", undo);
  root.querySelector('[data-action="redo"]')?.addEventListener("click", redo);
  root.querySelectorAll("[data-panel]").forEach((button) => button.addEventListener("click", () => {
    const panel = button.dataset.panel;
    const wasOpen = state[`${panel}Open`];
    state.activePanel = panel;
    state[`${panel}Open`] = true;
    syncPanelVisibility();
    if (panel === "layers" && !wasOpen) renderLayersTree();
  }));
  root.querySelectorAll("[data-asset-panel]").forEach((button) => button.addEventListener("click", () => {
    state.assetPanel = button.dataset.assetPanel;
    root.querySelectorAll("[data-asset-panel]").forEach((candidate) => {
      candidate.classList.toggle("active", candidate.dataset.assetPanel === state.assetPanel);
    });
    renderLayersTree();
  }));
  root.querySelectorAll("[data-inspector-tab]").forEach((button) => button.addEventListener("click", () => {
    state.inspectorTab = button.dataset.inspectorTab;
    render();
  }));
  root.querySelector('[data-action="close-layers"]')?.addEventListener("click", () => {
    state.layersOpen = false;
    if (state.activePanel === "layers") state.activePanel = null;
    syncPanelVisibility();
    renderLayersTree();
  });
  root.querySelector('[data-action="close-inspector"]')?.addEventListener("click", () => {
    state.inspectorOpen = false;
    if (state.activePanel === "inspector") state.activePanel = null;
    syncPanelVisibility();
  });
  root.querySelector('[data-role="title"]')?.addEventListener("change", (event) => void act(async () => {
    const title = event.target.value.trim();
    if (!title || title === state.document.title) return;
    await api.renameDocument(state.document.id, title);
    state.document.title = title;
    setToast("Document renamed.");
    render();
  }));
  bindLayersTree();
  bindInspectorControls();
  root.querySelectorAll("button[data-tool]").forEach((button) => button.addEventListener("click", () => {
    state.engineSurface?.editor.setTool(button.dataset.tool);
  }));
  root.querySelector('[data-action="zoom-in"]')?.addEventListener("click", () => {
    const editor = state.engineSurface?.editor;
    if (!editor) return;
    editor.zoomToLevel(editor.state.zoom * 1.2);
  });
  root.querySelector('[data-action="zoom-out"]')?.addEventListener("click", () => {
    const editor = state.engineSurface?.editor;
    if (!editor) return;
    editor.zoomToLevel(editor.state.zoom / 1.2);
  });
  root.querySelector('[data-action="fit"]')?.addEventListener("click", () => state.engineSurface?.fitDesignInView());
  root.querySelector('[data-action="share"]')?.addEventListener("click", () => void openShare());
  root.querySelector('[data-action="compatibility"]')?.addEventListener("click", () => openDialog("compatibility", '[data-action="compatibility"]'));
  root.querySelector('[data-action="menu"]')?.addEventListener("click", () => openDialog("menu", '[data-action="menu"]'));
  root.querySelector('[data-action="download"]')?.addEventListener("click", () => void act(downloadDocument));
  root.querySelector('[data-action="trash-document"]')?.addEventListener("click", () => {
    state.dialog = documentTrashConfirmation(state.document);
    state.dialogFocusSelector = '[data-action="cancel-confirmation"]';
    render();
  });
  root.querySelector('[data-action="grant"]')?.addEventListener("click", () => void act(async () => {
    const input = root.querySelector('[data-role="share-email"]');
    const email = input?.value.trim();
    if (!email) return;
    await api.grantAccess(state.document.id, email);
    state.grants = (await api.listGrants(state.document.id)).items;
    render();
  }));
  root.querySelectorAll("[data-revoke-grant]").forEach((button) => button.addEventListener("click", () => {
    const grant = state.grants.find((item) => item.id === button.dataset.revokeGrant);
    if (!grant) return;
    state.dialog = collaboratorRemovalConfirmation(grant);
    state.dialogFocusSelector = '[data-action="cancel-confirmation"]';
    render();
  }));
  root.querySelector('[data-action="cancel-confirmation"]')?.addEventListener("click", cancelDestructiveConfirmation);
  root.querySelector('[data-action="confirm-trash-document"]')?.addEventListener("click", () => void confirmDestructiveAction());
  root.querySelector('[data-action="confirm-remove-collaborator"]')?.addEventListener("click", () => void confirmDestructiveAction());
}

function bindLayersTree() {
  const tree = root.querySelector('[role="tree"][aria-label="Document layers"]');
  if (!tree || tree.dataset.bound === "true") return;
  tree.dataset.bound = "true";
  tree.addEventListener("click", (event) => {
    const element = event.target.closest("[data-node-id]");
    if (!element) return;
    event.stopPropagation();
    selectNode(element.dataset.nodeId, { openInspector: innerWidth < 960 });
  });
  tree.addEventListener("dblclick", (event) => {
    const element = event.target.closest("[data-node-id]");
    if (!element) return;
    event.stopPropagation();
    const nodeId = element.dataset.nodeId;
    selectNode(nodeId, { focus: true });
  });
}

function bindInspectorControls() {
  root.querySelector('[data-action="copy-node-reference"]')?.addEventListener("click", (event) => {
    void copySelectedNodeReference(event.currentTarget);
  });
  root.querySelectorAll("[data-property]").forEach((input) => {
    input.addEventListener("input", () => {
      if (!state.selectedId) return;
      state.fieldDrafts.set(inspectorFieldKey(input), input.type === "checkbox" ? input.checked : input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !state.selectedId) return;
      const key = inspectorFieldKey(input);
      state.fieldDrafts.delete(key);
      state.fieldErrors.delete(key);
      render();
    });
    input.addEventListener("change", () => commitInspectorField(input));
  });
  root.querySelector('[data-action="delete-node"]')?.addEventListener("click", () => {
    deleteSelectedNode();
  });
}

async function copySelectedNodeReference(button = null) {
  if (!state.document || !state.selectedId) return;
  try {
    const nodeId = resolveCanvasNodeReferenceId({
      document: currentMaterializedDocument(),
      graph: state.engineSurface?.editor.graph,
      selectedId: state.selectedId,
    });
    if (!nodeId) {
      throw new Error("The selected visual does not have a stable .pen node address.");
    }
    await copyTextToClipboard(formatCanvasNodeReference({ nodeId }));
    if (button) {
      button.textContent = "Copied";
      button.setAttribute("aria-label", "Node reference copied");
      setTimeout(() => {
        if (!button.isConnected) return;
        button.textContent = "Copy reference";
        button.removeAttribute("aria-label");
      }, 1_500);
    }
    if (!button) {
      showTransientToast("Node reference copied");
    }
  } catch (error) {
    if (button) {
      button.textContent = "Copy failed";
      setTimeout(() => {
        if (button.isConnected) button.textContent = "Copy reference";
      }, 1_500);
    }
    if (!button) {
      showTransientToast(message(error), true);
    }
    console.error("Canvas could not copy the selected node reference.", error);
  }
}

function handleAccessRemoved() {
  if (["deleted", "trashed"].includes(state.documentUnavailable?.reason)) return;
  state.accessRemoved = true;
  state.dialog = null;
  state.dialogFocusSelector = null;
  state.dialogReturnFocusSelector = null;
  state.unsubscribe?.();
  state.unsubscribe = null;
  state.pendingUpdates = [];
  setSync("error", "Access removed");
  render();
}

function commitInspectorField(input) {
  if (!state.selectedId) return;
  const selection = currentCanvasSelection();
  if (!selection?.effectiveNode) return;
  const property = input.dataset.property;
  const path = input.dataset.path ? input.dataset.path.split(".") : [];
  const key = inspectorFieldKey(input);
  const raw = input.type === "checkbox" ? input.checked : input.value;
  try {
    const value = parsePencilAuthoringValue(
      input.dataset.valueKind ?? input.type,
      input.value,
      input.checked,
    );
    if (path.length > 0) {
      if (selection.isInstanceDescendant) {
        const propertyValue = setObjectPath(selection.effectiveNode[property], path, value);
        mutate(state.model, {
          kind: "set-property-path",
          nodeId: selection.instanceId,
          property: "descendants",
          path: [selection.descendantPath, property],
          value: propertyValue,
        }, LOCAL_ORIGIN);
      } else {
        mutate(state.model, {
          kind: "set-property-path",
          nodeId: state.selectedId,
          property,
          path,
          value,
        }, LOCAL_ORIGIN);
      }
      state.fieldDrafts.delete(key);
      state.fieldErrors.delete(key);
      return;
    }
    const editor = state.engineSurface?.editor;
    const sceneNode = editor?.graph.getNode(state.selectedId);
    const changes = penPropertyToSceneChanges(sceneNode, property, value);
    if (editor && changes && isOpenPencilEditableNode(selection.effectiveNode)) {
      editor.updateNodeWithUndo(state.selectedId, changes, `Set ${property}`);
    } else if (selection.isInstanceDescendant) {
      mutate(state.model, {
        kind: "set-property-path",
        nodeId: selection.instanceId,
        property: "descendants",
        path: [selection.descendantPath, property],
        value,
      }, LOCAL_ORIGIN);
    } else {
      mutate(state.model, { kind: "set-property", nodeId: state.selectedId, property, value }, LOCAL_ORIGIN);
    }
    state.fieldDrafts.delete(key);
    state.fieldErrors.delete(key);
  } catch (error) {
    state.fieldDrafts.set(key, raw);
    state.fieldErrors.set(key, message(error));
    render();
    root.querySelector(`[data-property="${CSS.escape(property)}"][data-path="${CSS.escape(input.dataset.path ?? "")}"]`)?.focus();
  }
}

function setObjectPath(source, path, value) {
  const output = source && typeof source === "object" ? structuredClone(source) : {};
  let target = output;
  for (const key of path.slice(0, -1)) {
    const current = target[key];
    target = target[key] = current && typeof current === "object" ? current : {};
  }
  target[path.at(-1)] = value;
  return output;
}

function inspectorFieldKey(input) {
  return `${state.selectedId}:${input.dataset.property}:${input.dataset.path ?? ""}`;
}

function undo() {
  if (state.engineSurface) {
    state.engineSurface.editor.undoAction();
    queueRestoredSelectedNodes(state.engineSurface);
  } else state.undo?.undo();
  renderHistoryControls();
}

function queueRestoredSelectedNodes(surface) {
  if (!state.document || state.engineSurface !== surface) return;
  const editor = surface.editor;
  const existing = new Set(currentDocumentNodes().map(({ node }) => node.id));
  const pageIds = new Set(editor.graph.getPages(true).map((page) => page.id));
  const mutations = [];
  for (const nodeId of editor.state.selectedIds) {
    if (existing.has(nodeId)) continue;
    const sceneNode = editor.graph.getNode(nodeId);
    const deleted = state.deletedNodeSnapshots.get(nodeId);
    const node = deleted?.node ?? (sceneNode && sceneNodeToPenNode(sceneNode));
    if (!node) continue;
    mutations.push({
      kind: "insert-node",
      node,
      parentId: deleted ? deleted.parentId : (pageIds.has(sceneNode.parentId) ? null : sceneNode.parentId),
      position: deleted ? deleted.position : sceneNode.index,
    });
  }
  if (mutations.length) {
    queueEngineMutations(state.document.id, surface, mutations, { prepend: true });
  }
}

function redo() {
  if (state.engineSurface) state.engineSurface.editor.redoAction();
  else state.undo?.redo();
  renderHistoryControls();
}

function handleKeyboardShortcut(event) {
  if (state.dialog) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (isDestructiveConfirmation(state.dialog)) cancelDestructiveConfirmation();
      else closeDialog();
      return;
    }
    if (event.key === "Tab") trapDialogFocus(event);
    if (event.key === "Enter") {
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && active.closest('[role="dialog"]')) {
        event.preventDefault();
        active.click();
      }
    }
    return;
  }
  if (state.route !== "editor" || !state.model || event.defaultPrevented) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
  const command = event.metaKey || event.ctrlKey;
  if (command && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
    return;
  }
  if (command && event.key.toLowerCase() === "d" && state.selectedId) {
    event.preventDefault();
    duplicateSelectedNode();
    return;
  }
  if (command && event.key.toLowerCase() === "c" && state.selectedId) {
    event.preventDefault();
    void copySelectedNodeReference();
    return;
  }
  if (target instanceof Element && target.closest("button, select, a[href]")) return;
  if (event.code === "Space") {
    event.preventDefault();
    state.spacePressed = true;
    root.querySelector('[data-role="viewport"]')?.classList.add("space-pan");
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && state.selectedId) {
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const horizontal = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
    const vertical = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
    state.engineSurface?.editor.nudgeSelected(horizontal, vertical);
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && state.selectedId) {
    event.preventDefault();
    deleteSelectedNode();
  }
}

function deleteSelectedNode() {
  if (currentCanvasSelection()?.isInstanceDescendant) {
    showTransientToast("A component descendant cannot be deleted independently.", true);
    return;
  }
  state.engineSurface?.editor.deleteSelected();
}

function handleKeyboardRelease(event) {
  if (event.code === "Space") releaseSpacePan();
}

function releaseSpacePan() {
  state.spacePressed = false;
  root.querySelector('[data-role="viewport"]')?.classList.remove("space-pan");
}

function duplicateSelectedNode() {
  if (currentCanvasSelection()?.isInstanceDescendant) {
    showTransientToast("A component descendant cannot be duplicated independently.", true);
    return;
  }
  state.engineSurface?.editor.duplicateSelected();
}

function selectNode(nodeId, options = {}) {
  state.selectedId = nodeId;
  if (options.openInspector) {
    state.activePanel = "inspector";
    state.inspectorOpen = true;
    syncPanelVisibility();
  }
  const editor = state.engineSurface?.editor;
  if (editor?.graph.getNode(nodeId)) editor.select([nodeId]);
  renderSelection();
  if (options.focus) requestAnimationFrame(() => focusNodeInViewport(nodeId));
}

function focusNodeInViewport(nodeId) {
  const editor = state.engineSurface?.editor;
  if (!editor?.graph.getNode(nodeId)) return;
  editor.select([nodeId]);
  editor.zoomToSelection();
}

function visibleViewportInsets(host) {
  const viewport = host.getBoundingClientRect();
  const panels = [];
  for (const panel of root.querySelectorAll(".side-panel")) {
    const style = getComputedStyle(panel);
    if (style.display === "none" || style.visibility === "hidden") continue;
    panels.push(panel.getBoundingClientRect());
  }
  return viewportInsetsFromRects(viewport, panels);
}

async function openShare() {
  state.dialogReturnFocusSelector = '[data-action="share"]';
  state.dialog = "share";
  state.dialogFocusSelector = '[data-role="share-email"]';
  render();
  await act(async () => {
    state.grants = (await api.listGrants(state.document.id)).items;
    render();
  });
}

function renderDialog() {
  if (!state.dialog) return "";
  if (state.dialog.kind === "confirm-trash-document") {
    return dialog(
      `Move “${state.dialog.title}” to Trash?`,
      `<p>It will be removed from everyone’s Canvas library and can be restored for 30 days.</p>`,
      `<button class="button" data-action="cancel-confirmation" autofocus>Cancel</button><button class="button danger" data-action="confirm-trash-document">Move to Trash</button>`,
    );
  }
  if (state.dialog.kind === "confirm-permanently-delete-document") {
    return dialog(
      `Permanently delete “${state.dialog.title}”?`,
      `<p>This immediately deletes the document and cannot be undone.</p>`,
      `<button class="button" data-action="cancel-confirmation" autofocus>Cancel</button><button class="button danger" data-action="confirm-permanently-delete-document">Delete permanently</button>`,
    );
  }
  if (state.dialog.kind === "confirm-remove-collaborator") {
    return dialog(
      "Remove access?",
      `<p><strong>${escapeHtml(state.dialog.email)}</strong> will no longer be able to open or edit this file.</p>`,
      `<button class="button" data-action="cancel-confirmation" autofocus>Cancel</button><button class="button danger" data-action="confirm-remove-collaborator">Remove access</button>`,
    );
  }
  if (state.dialog === "menu") {
    return dialog("Document actions", `<div class="grant-list"><button class="button" data-action="download">Download .pen</button>${state.document?.access === "owner" ? `<button class="button danger" data-action="trash-document">Move to Trash</button>` : ""}</div>`);
  }
  if (state.dialog === "compatibility") {
    return dialog("Compatibility review", `<p class="muted">Canvas keeps the original .pen data losslessly. The items below are not represented faithfully by the current Canvas renderer and are not silently rewritten.</p><div class="grant-list">${state.compatibilityIssues.map((issue) => `<div class="grant-row"><div><strong>${escapeHtml(issue.nodeId)}</strong><span>${escapeHtml(issue.message)}</span></div></div>`).join("") || `<p>No known unsupported visual behavior.</p>`}</div>`);
  }
  if (state.dialog === "share") {
    return dialog("Share document", `<p class="muted">Add editors by their Penkra Account email. No email will be sent.</p><div class="share-form"><input class="field" data-role="share-email" type="email" placeholder="name@example.com" aria-label="Collaborator email" /><button class="button primary" data-action="grant">Add editor</button></div><div class="grant-list">${state.grants.map((grant) => `<div class="grant-row"><div><strong>${escapeHtml(grant.email)}</strong><span>${grant.status === "active" ? "Editor" : "Pending account"}</span></div><button class="button danger" data-revoke-grant="${grant.id}">Remove</button></div>`).join("") || `<p class="muted">No other editors have access.</p>`}</div>`);
  }
  return "";
}

function dialog(title, body, actions = '<button class="button" data-action="close-dialog">Done</button>') {
  return `<div class="modal-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><header class="dialog-head"><h2>${escapeHtml(title)}</h2></header><div class="dialog-body">${body}</div><footer class="dialog-actions">${actions}</footer></section></div>`;
}

function openDialog(dialogValue, returnFocusSelector) {
  state.dialog = dialogValue;
  state.dialogReturnFocusSelector = returnFocusSelector;
  state.dialogFocusSelector = '[data-action="close-dialog"]';
  render();
}

function closeDialog() {
  const returnFocusSelector = state.dialogReturnFocusSelector;
  state.dialog = null;
  state.dialogReturnFocusSelector = null;
  state.dialogFocusSelector = returnFocusSelector;
  render();
}

function cancelDestructiveConfirmation() {
  if (!isDestructiveConfirmation(state.dialog)) return;
  const confirmation = state.dialog;
  state.dialog = confirmation.returnDialog;
  state.dialogFocusSelector = confirmation.returnFocusSelector;
  render();
}

async function confirmDestructiveAction() {
  if (!isDestructiveConfirmation(state.dialog)) return;
  const confirmation = state.dialog;
  await act(async () => {
    const result = await executeDestructiveConfirmation(confirmation, {
      trashDocument: (documentId) => api.deleteDocument(documentId),
      permanentlyDeleteDocument: (documentId) => api.permanentlyDeleteDocument(documentId),
      removeCollaborator: (grantId) => api.revokeGrant(state.document.id, grantId),
    });
    if (result === "trashed-document") {
      state.dialog = null;
      if (state.route === "editor") await navigateToLibrary();
      else {
        state.documents = state.documents.filter((item) => item.id !== confirmation.documentId);
        setToast("Moved to Trash.");
        render();
      }
      return;
    }
    if (result === "permanently-deleted-document") {
      state.dialog = null;
      state.trashedDocuments = state.trashedDocuments.filter((item) => item.id !== confirmation.documentId);
      setToast("Document permanently deleted.");
      render();
      return;
    }
    state.grants = (await api.listGrants(state.document.id)).items;
    state.dialog = "share";
    state.dialogFocusSelector = '[data-role="share-email"]';
    render();
  });
}

function focusRequestedControl() {
  if (!state.dialogFocusSelector) return;
  const selector = state.dialogFocusSelector;
  state.dialogFocusSelector = null;
  const focus = () => root.querySelector(selector)?.focus();
  focus();
  requestAnimationFrame(focus);
}

function trapDialogFocus(event) {
  const dialogElement = root.querySelector('[role="dialog"]');
  if (!dialogElement) return;
  const controls = [...dialogElement.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
  if (controls.length === 0) return;
  const first = controls[0];
  const last = controls.at(-1);
  if (!dialogElement.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function downloadDocument() {
  if (!state.model) return;
  assertExportAllowed(state.accessRemoved);
  await revalidateExportAccess();
  assertExportAllowed(state.accessRemoved);
  await revalidateExportAccess();
  assertExportAllowed(state.accessRemoved);
  const filename = safeDocumentName(state.document.title);
  if (!(await savePenDocument(currentMaterializedDocument(), filename))) return;
  state.dialog = null;
  setToast(`Downloaded ${filename}.`);
  render();
}

async function revalidateExportAccess() {
  try {
    await api.getDocument(state.document.id);
  } catch (error) {
    if (error?.status === 403 || error?.status === 404) handleAccessRemoved();
    throw error;
  }
}

async function act(action) {
  try {
    state.error = null;
    await action();
  } catch (error) {
    setToast(message(error), true);
    render();
  }
}

function setToast(text, error = false) {
  state.toast = { text, error };
  setTimeout(() => { state.toast = null; render(); }, 3_000);
}

function showTransientToast(text, error = false) {
  const toast = { text, error };
  state.toast = toast;
  root.querySelector(".toast")?.remove();
  root.insertAdjacentHTML("beforeend", renderToast());
  setTimeout(() => {
    if (state.toast !== toast) return;
    state.toast = null;
    root.querySelector(".toast")?.remove();
  }, 3_000);
}

function renderToast() {
  return state.toast ? `<div class="toast ${state.toast.error ? "error-copy" : ""}">${escapeHtml(state.toast.text)}</div>` : "";
}

function fillValue(fill) {
  if (typeof fill === "string") return fill;
  if (fill && typeof fill === "object" && typeof fill.color === "string") return fill.color;
  return "";
}

function finite(value, fallback) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function relativeTime(value) {
  const delta = Date.now() - new Date(value).getTime();
  if (delta < 60_000) return "Just now";
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`;
  return new Date(value).toLocaleDateString();
}

function formatDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function icon(name) {
  const paths = {
    back: '<path d="m15 18-6-6 6-6"/><path d="M9 12h10"/>',
    close: '<path d="m7 7 10 10M17 7 7 17"/>',
    cursor: '<path d="m6 4 12 8-6 2-2 6z"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/>',
    frame: '<path d="M5 5h14v14H5z"/><path d="M3 8h4M17 8h4M8 3v4M8 17v4"/>',
    hand: '<path d="M7.5 11V6.5a1.5 1.5 0 0 1 3 0V10 5.5a1.5 1.5 0 0 1 3 0V10 7a1.5 1.5 0 0 1 3 0v4-2a1.5 1.5 0 0 1 3 0v5.5c0 4-2.5 6.5-6.5 6.5h-1.2a6 6 0 0 1-4.8-2.4L4.3 15a1.6 1.6 0 0 1 2.4-2.1L9 15"/>',
    more: '<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-4M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.9 4M20 20v-5h-5"/>',
    redo: '<path d="M18 8v5h-5"/><path d="M18 13a7 7 0 1 0-1.7 4.6"/>',
    rectangle: '<rect x="5" y="7" width="14" height="10" rx="1"/>',
    text: '<path d="M5 6h14M12 6v12M8 18h8"/>',
    undo: '<path d="M6 8v5h5"/><path d="M6 13a7 7 0 1 1 1.7 4.6"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.file}</svg>`;
}
