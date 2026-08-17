import { createCanvasApi } from "./canvas-api.mjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { safeDocumentName } from "./codec.mjs";
import { createRouteCoordinator } from "./route-coordinator.mjs";
import { analyzeOpenPencilCompatibility, isOpenPencilEditableNode } from "./openpencil-engine.mjs";
import { mountOpenPencilSurface, prepareOpenPencilEngine } from "./openpencil-surface.mjs";
import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";
import {
  choosePenDocument,
  readDroppedPenDocument,
  savePenDocument,
} from "./pen-file-access.mjs";
import { viewportInsetsFromRects } from "./viewport-insets.mjs";
import { createPerformanceMonitor } from "./performance-monitor.mjs";
import {
  ACCESS_REMOVED_HEADING,
  ACCESS_REMOVED_MESSAGE,
  assertExportAllowed,
} from "./access-removed.mjs";
import {
  collaboratorRemovalConfirmation,
  documentDeleteConfirmation,
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
const state = {
  route: "library",
  libraryFilter: "all",
  search: "",
  documents: [],
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
  activePanel: "layers",
  layersOpen: true,
  inspectorOpen: true,
  dialog: null,
  dialogReturnFocusSelector: null,
  dialogFocusSelector: null,
  grants: [],
  toast: null,
  unsubscribe: null,
  updateListener: null,
  lastSequence: 0,
  updatesSinceSnapshot: 0,
  flushing: false,
  reconciling: null,
  pendingUpdates: [],
  persistence: null,
  undo: null,
  fieldDrafts: new Map(),
  fieldErrors: new Map(),
  accessRemoved: false,
  activeTool: "select",
  spacePressed: false,
  engineSurface: null,
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
  assetPanel: "file",
  inspectorTab: "design",
};

const routes = createRouteCoordinator({
  isDocumentOpen: (documentId) => state.document?.id === documentId,
  openDocument,
  setRoute: (input) => runtime.tab.setRoute(input),
  showLibrary,
});

runtime.tab.onNavigate((input) => routes.handleHostNavigation(input));
runtime.tab.handle("selection.set", async ({ nodeId }) => {
  if (!state.model || !currentDocumentNode(nodeId)) {
    throw new Error(`Canvas node ${nodeId} was not found in this tab.`);
  }
  state.selectedId = nodeId;
  state.activePanel = "inspector";
  state.inspectorOpen = true;
  render();
  return { selected: true };
});
runtime.tab.handle("viewport.focus", async ({ nodeId }) => {
  if (!state.model || !currentDocumentNode(nodeId)) {
    throw new Error(`Canvas node ${nodeId} was not found in this tab.`);
  }
  state.selectedId = nodeId;
  render();
  requestAnimationFrame(() => focusNodeInViewport(nodeId));
  return { focused: true };
});

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

async function navigateToLibrary() {
  await routes.navigateToLibrary();
}

async function createBlankDocument(title = "Untitled") {
  const frameId = crypto.randomUUID();
  const source = {
    version: "2.15",
    children: [
      {
        id: frameId,
        type: "frame",
        name: "Frame",
        x: 120,
        y: 100,
        width: 720,
        height: 480,
        fill: "#ffffff",
        children: [],
      },
    ],
  };
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
    if (document) await api.deleteDocument(document.id).catch(() => undefined);
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
  state.route = "editor";
  state.loading = true;
  state.error = null;
  render();
  try {
    const payload = await api.getDocument(documentId);
    const assets = await Promise.all(
      (payload.assets ?? []).map(async (asset) => [
        asset.path,
        { ...asset, bytes: await api.readAsset(documentId, asset) },
      ]),
    );
    state.document = payload;
    state.assets = new Map(assets);
    state.accessRemoved = false;
    state.model = restoreDocumentModel(payload);
    invalidateDocumentProjection();
    const serverStateVector = Y.encodeStateVector(state.model.doc);
    state.persistence = new IndexeddbPersistence(`penkra-canvas:${documentId}`, state.model.doc);
    await state.persistence.whenSynced;
    const offlineUpdate = Y.encodeStateAsUpdate(state.model.doc, serverStateVector);
    if (offlineUpdate.byteLength > 2) {
      state.pendingUpdates.push({
        clientUpdateId: crypto.randomUUID(),
        update: encodeUpdate(offlineUpdate),
      });
    }
    state.undo = createUndoManager(state.model);
    state.lastSequence = Math.max(
      payload.snapshot.throughSequence,
      ...(payload.updates ?? []).map((update) => update.sequence),
    );
    state.selectedId = currentDocumentNodes()[0]?.node.id ?? null;
    state.updateListener = (update, origin) => {
      invalidateDocumentProjection();
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
      render();
      void flushPending();
    };
    state.model.doc.on("update", state.updateListener);
    state.realtimeConnection = REALTIME_RECONNECTING;
    state.presence = null;
    state.unsubscribe = await api.subscribe(
      documentId,
      (event) => {
        if (event.event === "project:update" && event.payload?.update) {
          state.lastSequence = Math.max(state.lastSequence, Number(event.payload.sequence ?? 0));
          applyRemoteUpdate(state.model, event.payload.update);
          state.engineDocumentDirty = true;
          state.engineDocumentDirtyReason = "realtime-remote-update";
          render();
        }
        if (event.event === "presence") {
          state.presence = normalizePresenceCount(event.payload?.count);
          render();
        }
        if (event.event === "access-revoked") handleAccessRemoved();
      },
      {
        onConnectionStateChange: (connectionState) => {
          void handleRealtimeConnectionChange(documentId, connectionState);
        },
      },
    );
    await prepareOpenPencilEngine();
    state.loading = false;
    setSync("saved", "Saved");
    render();
    await flushPending();
  } catch (error) {
    state.loading = false;
    state.error = message(error);
    render();
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
  state.reconciling = null;
  state.document = null;
  state.model = null;
  state.selectedId = null;
  state.presence = null;
  state.realtimeConnection = REALTIME_RECONNECTING;
  state.dialog = null;
  state.activeTool = "select";
  state.activePanel = "layers";
  state.layersOpen = true;
  state.inspectorOpen = true;
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
  state.fieldDrafts.clear();
  state.fieldErrors.clear();
  state.accessRemoved = false;
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
  state.pendingUpdates.push({ clientUpdateId: crypto.randomUUID(), update: encodeUpdate(update) });
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
    render();
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
      () => prepareOpenPencilRenderDocument(currentMaterializedDocument()),
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
    : renderLibrary();
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
    } else mountEditorSurface();
  }
  else bindLibrary();
  focusRequestedControl();
  performanceMonitor.record("ui.render", performance.now() - renderStartedAt, {
    route: state.route,
    nodes: state.documentNodes?.length ?? 0,
  });
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
      <div class="library-actions"><button class="button" data-action="import">Import .pen</button><button class="button primary" data-action="new">New design</button></div>
    </header>
    <div class="library-toolbar">
      <input class="search" data-role="search" type="search" value="${escapeHtml(state.search)}" placeholder="Search files" aria-label="Search files" />
      <div class="segmented" aria-label="Library section">
        ${segment("all", "All")}${segment("owned", "Your files")}${segment("shared", "Shared with you")}
      </div>
    </div>
    ${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
    ${documents.length ? `<section class="document-grid">${documents.map(documentCard).join("")}</section>` : `<section class="empty"><div>${icon("file")}<h2>No files here yet</h2><p>Create a design or import a .pen file. Shared files appear automatically when another owner adds your verified Account email.</p></div></section>`}
  </div></main>${renderDialog()}${renderToast()}`;
}

function segment(key, label) {
  return `<button class="${state.libraryFilter === key ? "active" : ""}" data-filter="${key}">${label}</button>`;
}

function documentCard(document) {
  const ownership = document.access === "owner" ? "Your file" : `Shared by ${document.ownerName ?? "another Account"}`;
  return `<button class="document-card" data-document-id="${document.id}"><span class="document-preview">${icon("frame")}</span><span class="document-meta"><strong>${escapeHtml(document.title)}</strong><span>${escapeHtml(ownership)} · ${relativeTime(document.updatedAt)}</span></span></button>`;
}

function renderEditor() {
  if (state.accessRemoved) {
    return `<main class="shell empty"><div>${icon("file")}<h2>${ACCESS_REMOVED_HEADING}</h2><p>${ACCESS_REMOVED_MESSAGE}</p><div class="library-actions"><button class="button primary" data-action="back">Back to files</button></div></div></main>${renderToast()}`;
  }
  const document = currentMaterializedDocument();
  const nodes = currentDocumentNodes();
  if (state.compatibilityDocument !== document) {
    state.compatibilityIssues = performanceMonitor.measure(
      "document.compatibility",
      () => analyzeOpenPencilCompatibility(
        document,
        state.assets,
        currentPreparedRenderDocument(),
      ),
      { documentId: state.document.id, nodes: nodes.length },
    );
    state.compatibilityNodeIds = new Set(state.compatibilityIssues.map((issue) => issue.nodeId));
    state.compatibilityDocument = document;
  }
  const selected = currentDocumentNode(state.selectedId);
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
        <div class="panel-scroll">${state.assetPanel === "file" ? `<section class="layer-section"><h3>Pages</h3><button class="page-row active">Page 1</button></section><section class="layer-section"><h3>Layers</h3><div role="tree" aria-label="Document layers">${nodes.map(layerRow).join("")}</div></section>` : `<div class="inspector-empty">Reusable components and document assets appear here.</div>`}</div>
      </aside>
      <section class="viewport" data-role="viewport" data-tool="${state.activeTool}" tabindex="0" aria-label="Canvas viewport">
        <div class="openpencil-host" data-role="openpencil-surface"><div class="engine-loading">Rendering design…</div></div>
        ${state.realtimeConnection === REALTIME_RECONNECTING && navigator.onLine ? `<div class="connection-banner">${icon("refresh")}<span>Reconnecting and merging changes</span></div>` : ""}
        ${unsupported.length ? `<div class="compatibility-banner"><span>${unsupported.length} visual behavior${unsupported.length === 1 ? "" : "s"} preserved but not faithfully represented</span><button class="button" data-action="compatibility">Review</button></div>` : ""}
        <div class="zoom-controls" aria-label="Canvas zoom"><button class="tool" data-action="zoom-out" aria-label="Zoom out">−</button><button class="zoom-label" data-action="fit" aria-label="Fit design in view">${Math.round((state.engineViewport?.zoom ?? 1) * 100)}%</button><button class="tool" data-action="zoom-in" aria-label="Zoom in">+</button></div>
        <div class="tool-palette" aria-label="Canvas tools"><button class="tool ${state.activeTool === "select" ? "active" : ""}" data-tool="SELECT" aria-label="Select tool" title="Select (V)">${icon("cursor")}</button><button class="tool ${state.activeTool === "hand" ? "active" : ""}" data-tool="HAND" aria-label="Pan canvas" title="Pan canvas (H or Space)">${icon("hand")}</button><span class="tool-separator"></span><button class="tool" data-tool="FRAME" aria-label="Frame tool" title="Frame (F)">${icon("frame")}</button><button class="tool" data-tool="RECTANGLE" aria-label="Rectangle tool" title="Rectangle (R)">${icon("rectangle")}</button><button class="tool" data-tool="ELLIPSE" aria-label="Ellipse tool" title="Ellipse (O)">${icon("ellipse")}</button><button class="tool" data-tool="TEXT" aria-label="Text tool" title="Text (T)">${icon("text")}</button></div>
      </section>
      <aside class="side-panel inspector" ${state.inspectorOpen ? "" : "hidden"}><div class="panel-tabs"><button class="${state.inspectorTab === "design" ? "active" : ""}" data-inspector-tab="design">Design</button><button class="${state.inspectorTab === "code" ? "active" : ""}" data-inspector-tab="code">Code</button><button class="icon-button panel-close" data-action="close-inspector" aria-label="Close inspector">${icon("close")}</button></div><div class="panel-scroll">${state.inspectorTab === "design" ? renderInspector(selected) : renderCodeInspector(selected)}</div></aside>
    </div>
  </main>${renderDialog()}${renderToast()}`;
}

function mountEditorSurface() {
  if (state.accessRemoved || !state.model) return;
  const host = root.querySelector('[data-role="openpencil-surface"]');
  if (!host) return;
  const documentId = state.document.id;
  try {
    let surface;
    surface = performanceMonitor.measure("engine.mount", () => mountOpenPencilSurface(host, currentMaterializedDocument(), {
      assets: state.assets,
      preparedDocument: currentPreparedRenderDocument(),
      selectedId: state.selectedId,
      viewport: state.engineViewport,
      getViewportInsets: () => visibleViewportInsets(host),
      onReady: () => {
        if (state.engineSurface !== surface) return;
        state.engineReady = true;
        host.querySelector(".engine-loading")?.remove();
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

function disposeEngineSurface() {
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
function queueEngineMutations(documentId, surface, mutations) {
  if (state.engineSurface !== surface || state.document?.id !== documentId) return;
  pendingEngineBatch ??= { documentId, surface, mutations: [] };
  pendingEngineBatch.mutations.push(...mutations);
  queueMicrotask(() => {
    const batch = pendingEngineBatch;
    if (!batch || batch.surface !== surface) return;
    pendingEngineBatch = null;
    if (state.engineSurface !== surface || state.document?.id !== documentId || !state.model) return;
    const existing = new Set(currentDocumentNodes().map(({ node }) => node.id));
    state.model.doc.transact(() => {
      for (const mutation of batch.mutations) {
        if (mutation.kind === "insert-node" && existing.has(mutation.node.id)) continue;
        if (mutation.kind !== "insert-node" && !existing.has(mutation.nodeId)) continue;
        mutate(state.model, mutation, ENGINE_ORIGIN);
        if (mutation.kind === "insert-node") existing.add(mutation.node.id);
        if (mutation.kind === "delete-node") existing.delete(mutation.nodeId);
      }
    }, ENGINE_ORIGIN);
  });
}

function layerRow({ node, depth }) {
  const issue = state.compatibilityNodeIds.has(node.id);
  return `<button class="layer-row ${node.id === state.selectedId ? "selected" : ""}" style="--depth:${depth}" data-node-id="${escapeHtml(node.id)}" role="treeitem" aria-level="${depth + 1}" aria-selected="${node.id === state.selectedId}"><span class="layer-type">${node.type === "text" ? "T" : node.type === "frame" ? "□" : "◇"}</span><span>${escapeHtml(node.name ?? node.content ?? node.type)}</span>${issue ? `<span title="Preserved but not faithfully represented">⚠</span>` : ""}</button>`;
}

function renderInspector(node) {
  if (!node) return `<div class="inspector-empty">Select an object to inspect and edit its properties.</div>`;
  if (!isOpenPencilEditableNode(node)) {
    return `<section class="selection-heading"><span class="layer-type">◇</span><div><strong>${escapeHtml(node.name ?? node.type)}</strong><span>${escapeHtml(node.type)} · ${escapeHtml(node.id)}</span></div></section><div class="inspector-empty">This unsupported object is preserved as opaque .pen source and cannot be edited in Canvas.</div>`;
  }
  const numeric = ["x", "y", "width", "height", "rotation"];
  return `<section class="selection-heading"><span class="layer-type">${node.type === "text" ? "T" : "◇"}</span><div><strong>${escapeHtml(node.name ?? node.type)}</strong><span>${escapeHtml(node.type)} · ${escapeHtml(node.id)}</span></div></section>
  <section class="section"><h3>Position</h3><div class="field-grid">${field("name", node.name ?? "", "text", true, node.id)}${numeric.slice(0, 2).map((property) => field(property, node[property] ?? 0, "number", false, node.id)).join("")}${field("rotation", node.rotation ?? 0, "number", false, node.id)}</div></section>
  <section class="section"><h3>Layout</h3><div class="field-grid">${numeric.slice(2, 4).map((property) => field(property, node[property] ?? 0, "number", false, node.id)).join("")}${field("gap", node.gap ?? 0, "number", false, node.id)}${field("padding", Array.isArray(node.padding) ? node.padding.join(", ") : node.padding ?? 0, "text", false, node.id)}</div></section>
  <section class="section"><h3>Appearance</h3><div class="field-grid">${field("fill", fillValue(node.fill), "text", true, node.id)}${field("opacity", node.opacity ?? 1, "number", false, node.id)}${field("cornerRadius", node.cornerRadius ?? 0, "number", false, node.id)}</div></section>
  ${node.type === "text" ? `<section class="section"><h3>Typography</h3><div class="field-grid">${field("content", node.content ?? "", "text", true, node.id)}${field("fontSize", node.fontSize ?? 16, "number", false, node.id)}${field("fontWeight", node.fontWeight ?? 400, "number", false, node.id)}</div></section>` : ""}
  ${state.compatibilityNodeIds.has(node.id) ? `<section class="section"><h3>Compatibility</h3><p class="muted">Some visual behavior on this object is preserved in the .pen source but is not represented faithfully. Review compatibility for details.</p></section>` : ""}
  <div class="danger-zone"><button class="button danger" data-action="delete-node">Delete object</button></div>`;
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
    const node = currentDocumentNode(state.selectedId);
    inspector.innerHTML = state.inspectorTab === "design"
      ? renderInspector(node)
      : renderCodeInspector(node);
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

function renderCodeInspector(node) {
  if (!node) return `<div class="inspector-empty">Select an object to inspect its lossless .pen source.</div>`;
  return `<section class="section code-section"><h3>.pen source</h3><pre>${escapeHtml(JSON.stringify(node, null, 2))}</pre></section>`;
}

function field(property, value, type = "text", full = false, nodeId = "") {
  const key = `${nodeId}:${property}`;
  const displayed = state.fieldDrafts.has(key) ? state.fieldDrafts.get(key) : value;
  const error = state.fieldErrors.get(key);
  return `<div class="field-row ${full ? "full" : ""}"><label for="field-${property}">${property}</label><input id="field-${property}" class="field" type="${type}" data-property="${property}" value="${escapeHtml(displayed)}" ${error ? `aria-invalid="true" aria-describedby="field-${property}-error"` : ""} />${error ? `<span class="field-error" id="field-${property}-error">${escapeHtml(error)}</span>` : ""}</div>`;
}

function bindCommon() {
  root.querySelector('[data-action="retry"]')?.addEventListener("click", () => void bootstrap());
  root.querySelectorAll("[data-action=close-dialog]").forEach((button) =>
    button.addEventListener("click", closeDialog),
  );
}

function bindLibrary() {
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
  root.querySelectorAll("[data-document-id]").forEach((button) => button.addEventListener("click", () => void navigateToDocument(button.dataset.documentId)));
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
    state.activePanel = panel;
    state[`${panel}Open`] = true;
    syncPanelVisibility();
  }));
  root.querySelectorAll("[data-asset-panel]").forEach((button) => button.addEventListener("click", () => {
    state.assetPanel = button.dataset.assetPanel;
    render();
  }));
  root.querySelectorAll("[data-inspector-tab]").forEach((button) => button.addEventListener("click", () => {
    state.inspectorTab = button.dataset.inspectorTab;
    render();
  }));
  root.querySelector('[data-action="close-layers"]')?.addEventListener("click", () => {
    state.layersOpen = false;
    if (state.activePanel === "layers") state.activePanel = null;
    syncPanelVisibility();
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
  root.querySelector('[role="tree"]')?.addEventListener("click", (event) => {
    const element = event.target.closest("[data-node-id]");
    if (!element) return;
    event.stopPropagation();
    state.selectedId = element.dataset.nodeId;
    if (innerWidth < 960) {
      state.activePanel = "inspector";
      state.inspectorOpen = true;
    }
    renderSelection();
    if (innerWidth < 960) syncPanelVisibility();
  });
  root.querySelector('[role="tree"]')?.addEventListener("dblclick", (event) => {
    const element = event.target.closest("[data-node-id]");
    if (!element) return;
    event.stopPropagation();
    const nodeId = element.dataset.nodeId;
    state.selectedId = nodeId;
    renderSelection();
    requestAnimationFrame(() => focusNodeInViewport(nodeId));
  });
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
  root.querySelector('[data-action="delete-document"]')?.addEventListener("click", () => {
    state.dialog = documentDeleteConfirmation(state.document);
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
  root.querySelector('[data-action="confirm-delete-document"]')?.addEventListener("click", () => void confirmDestructiveAction());
  root.querySelector('[data-action="confirm-remove-collaborator"]')?.addEventListener("click", () => void confirmDestructiveAction());
}

function bindInspectorControls() {
  root.querySelectorAll("[data-property]").forEach((input) => {
    input.addEventListener("input", () => {
      if (!state.selectedId) return;
      state.fieldDrafts.set(`${state.selectedId}:${input.dataset.property}`, input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || !state.selectedId) return;
      const key = `${state.selectedId}:${input.dataset.property}`;
      state.fieldDrafts.delete(key);
      state.fieldErrors.delete(key);
      render();
    });
    input.addEventListener("change", () => commitInspectorField(input));
  });
  root.querySelector('[data-action="delete-node"]')?.addEventListener("click", () => {
    if (!state.selectedId) return;
    mutate(state.model, { kind: "delete-node", nodeId: state.selectedId }, LOCAL_ORIGIN);
    state.selectedId = null;
    render();
  });
}

function handleAccessRemoved() {
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
  const property = input.dataset.property;
  const key = `${state.selectedId}:${property}`;
  let value = input.value;
  if (input.type === "number") {
    value = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(value)) {
      state.fieldDrafts.set(key, input.value);
      state.fieldErrors.set(key, "Enter a valid number.");
      render();
      root.querySelector(`[data-property="${CSS.escape(property)}"]`)?.focus();
      return;
    }
  }
  try {
    mutate(state.model, { kind: "set-property", nodeId: state.selectedId, property, value }, LOCAL_ORIGIN);
    state.fieldDrafts.delete(key);
    state.fieldErrors.delete(key);
  } catch (error) {
    state.fieldDrafts.set(key, input.value);
    state.fieldErrors.set(key, message(error));
    render();
    root.querySelector(`[data-property="${CSS.escape(property)}"]`)?.focus();
  }
}

function undo() {
  state.undo?.undo();
  render();
}

function redo() {
  state.undo?.redo();
  render();
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
  if (target instanceof Element && target.closest("button, select, a[href]")) return;
  if (event.code === "Space") {
    event.preventDefault();
    state.spacePressed = true;
    root.querySelector('[data-role="viewport"]')?.classList.add("space-pan");
    return;
  }
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
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && state.selectedId) {
    event.preventDefault();
    const amount = event.shiftKey ? 10 : 1;
    const node = currentDocumentNode(state.selectedId);
    if (!node) return;
    const horizontal = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
    const vertical = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
    state.model.doc.transact(() => {
      if (horizontal) mutate(state.model, { kind: "set-property", nodeId: node.id, property: "x", value: finite(node.x, 0) + horizontal }, LOCAL_ORIGIN);
      if (vertical) mutate(state.model, { kind: "set-property", nodeId: node.id, property: "y", value: finite(node.y, 0) + vertical }, LOCAL_ORIGIN);
    }, LOCAL_ORIGIN);
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && state.selectedId) {
    event.preventDefault();
    mutate(state.model, { kind: "delete-node", nodeId: state.selectedId }, LOCAL_ORIGIN);
    state.selectedId = null;
    render();
  }
}

function handleKeyboardRelease(event) {
  if (event.code === "Space") releaseSpacePan();
}

function releaseSpacePan() {
  state.spacePressed = false;
  root.querySelector('[data-role="viewport"]')?.classList.remove("space-pan");
}

function duplicateSelectedNode() {
  const item = currentDocumentNodes().find(({ node }) => node.id === state.selectedId);
  if (!item) return;
  const clone = structuredClone(item.node);
  const replaceIds = (node) => {
    node.id = crypto.randomUUID();
    node.children?.forEach(replaceIds);
  };
  replaceIds(clone);
  clone.x = finite(clone.x, 0) + 12;
  clone.y = finite(clone.y, 0) + 12;
  mutate(state.model, { kind: "insert-node", node: clone, parentId: item.parentId, position: item.index + 0.5 }, LOCAL_ORIGIN);
  state.selectedId = clone.id;
  render();
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
  if (state.dialog.kind === "confirm-delete-document") {
    return dialog(
      `Delete “${state.dialog.title}”?`,
      `<p>It will be removed from everyone’s Canvas library. This action may be recoverable by support for a limited time.</p>`,
      `<button class="button" data-action="cancel-confirmation" autofocus>Cancel</button><button class="button danger" data-action="confirm-delete-document">Delete file</button>`,
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
    return dialog("Document actions", `<div class="grant-list"><button class="button" data-action="download">Download .pen</button>${state.document?.access === "owner" ? `<button class="button danger" data-action="delete-document">Delete document</button>` : ""}</div>`);
  }
  if (state.dialog === "compatibility") {
    return dialog("Compatibility review", `<p class="muted">Canvas keeps the original .pen data losslessly. The items below are not represented faithfully by the current OpenPencil adapter and are not silently rewritten.</p><div class="grant-list">${state.compatibilityIssues.map((issue) => `<div class="grant-row"><div><strong>${escapeHtml(issue.nodeId)}</strong><span>${escapeHtml(issue.message)}</span></div></div>`).join("") || `<p>No known unsupported visual behavior.</p>`}</div>`);
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
      deleteDocument: (documentId) => api.deleteDocument(documentId),
      removeCollaborator: (grantId) => api.revokeGrant(state.document.id, grantId),
    });
    if (result === "deleted-document") {
      state.dialog = null;
      await navigateToLibrary();
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
