import { createCanvasApi } from "./canvas-api.mjs";
import { createBlankDocumentSource } from "./blank-document.mjs";
import { createDocumentCollectionLifecycle } from "./document-collection-lifecycle.mjs";
import { hasUnloadedDocumentImages, hydrateDocumentAssets } from "./document-assets.mjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { createRouteCoordinator } from "./route-coordinator.mjs";
import {
  analyzeOpenPencilCompatibility,
  isOpenPencilEditableNode,
  penPropertyToSceneChanges,
} from "./openpencil-engine.mjs";
import {
  mountOpenPencilSurface,
  prepareOpenPencilEngine,
  rasterizeOpenPencilSvgAsset,
} from "./openpencil-surface.mjs";
import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";
import {
  isPencilAuthorableNode,
  parsePencilAuthoringValue,
  pencilAuthoringSections,
} from "./pencil-authoring.mjs";
import { viewportInsetsFromRects } from "./viewport-insets.mjs";
import {
  canvasSceneLayerAncestorIds,
  listCanvasSceneLayers,
  visibleCanvasSceneLayers,
} from "./scene-layer-tree.mjs";
import { createPerformanceMonitor } from "./performance-monitor.mjs";
import { configureCanvasFonts } from "./font-runtime.mjs";
import {
  copyTextToClipboard,
  formatCanvasNodeReference,
  resolveCanvasNodeReferenceId,
  resolveCanvasNodeSelection,
} from "./node-reference.mjs";
import { applyMutationsToProjection, compactDeletionMutations } from "./document-projection.mjs";
import { beginSelectedTextEditing } from "./text-editing.mjs";
import { convertSvgAssetToCanvasNode, inspectSvgVectorCandidate } from "./svg-vectors.mjs";
import {
  ACCESS_REMOVED_HEADING,
  ACCESS_REMOVED_MESSAGE,
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
const documentCollectionLifecycle = createDocumentCollectionLifecycle({
  subscribe: (listener) => api.subscribeToDocuments(listener),
});
const performanceMonitor = createPerformanceMonitor();
configureCanvasFonts(runtime, { performanceMonitor });
const state = {
  route: "library",
  libraryFilter: "recent",
  search: "",
  documents: [],
  folders: [],
  recentFolders: [],
  currentFolder: null,
  folderDocuments: [],
  folderChildren: [],
  libraryLoaded: false,
  libraryFolderRefresh: null,
  folderCollections: new Map(),
  folderRefreshes: new Map(),
  folderTree: null,
  folderTreeRefresh: null,
  folderGrants: new Map(),
  editorDocuments: [],
  thumbnails: new Map(),
  currentProfile: null,
  trashedDocuments: [],
  trashedFolders: [],
  trashLoaded: false,
  shellReady: false,
  loading: true,
  error: null,
  document: null,
  assets: new Map(),
  model: null,
  selectedId: null,
  expandedLayerIds: new Set(),
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
  shareTarget: null,
  toast: null,
  contextMenu: null,
  documentSwitcherOpen: false,
  documentUnsubscribe: null,
  folderUnsubscribe: null,
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
  appTabActive: true,
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
  thumbnailTimer: null,
  assetPanel: "layers",
  inspectorTab: "design",
  documentOpenStartedAt: null,
};

const routes = createRouteCoordinator({
  isDocumentOpen: (documentId) => state.document?.id === documentId,
  openDocument,
  setRoute: (input) => runtime.tab.setRoute(input),
  showDocumentUnavailable,
  showFolder,
  showLibrary,
  showTrash,
});

runtime.tab.onNavigate((input) => routes.handleHostNavigation(input));
const releaseTabVisibility = runtime.tab.onVisibilityChange(({ active }) => {
  state.appTabActive = active;
  state.engineSurface?.setVisible(active);
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
window.addEventListener("beforeunload", () => {
  releaseTabVisibility();
  state.documentUnsubscribe?.();
  state.folderUnsubscribe?.();
  documentCollectionLifecycle.stop();
});
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
    state.currentProfile = await runtime.account.profile();
    state.shellReady = true;
    await routes.showDefaultLibrary();
  } catch (error) {
    state.loading = false;
    state.error = message(error);
    render();
  }
}

async function showLibrary() {
  closeDocument();
  state.currentFolder = null;
  state.route = "library";
  state.loading = !state.shellReady;
  state.error = null;
  render();
  startFolderSubscription();
  const folders = refreshLibraryFolders();
  const documents = documentCollectionLifecycle.start({
    load: () => loadEveryDocumentPage(api.listDocuments),
    apply: (documents) => {
      if (state.route !== "library") return;
      state.documents = documents.map(withModule);
      state.error = null;
      if (state.libraryLoaded) render();
      void loadDocumentThumbnails(state.documents).then(() => {
        if (state.route === "library") render();
      });
    },
    onError: handleDocumentCollectionError,
  });
  await Promise.all([folders, documents]);
  if (state.route !== "library") return;
  state.libraryLoaded = true;
  state.loading = false;
  render();
}

async function showFolder(folderId) {
  closeDocument();
  state.route = "folder";
  state.error = null;
  const cached = state.folderCollections.get(folderId);
  const known = cached?.folder ?? knownFolder(folderId);
  state.currentFolder = known ?? null;
  state.folderChildren = cached?.children ?? [];
  state.folderDocuments = cached?.documents ?? [];
  state.loading = !known;
  render();
  startFolderSubscription(folderId);
  const opened = api.openFolder(folderId);
  await Promise.all([
    opened.then((folder) => {
      const cachedCollection = state.folderCollections.get(folderId);
      if (cachedCollection) state.folderCollections.set(folderId, { ...cachedCollection, folder });
      if (state.route === "folder" && state.currentFolder?.id === folderId) state.currentFolder = folder;
    }),
    refreshFolderCollection(folderId, { folderRequest: opened }),
  ]);
}

function knownFolder(folderId) {
  return [state.currentFolder, ...state.folders, ...state.recentFolders, ...state.folderChildren]
    .find((folder) => folder?.id === folderId) ?? null;
}

function refreshLibraryFolders() {
  if (state.libraryFolderRefresh) return state.libraryFolderRefresh;
  const refresh = Promise.all([
    loadEveryFolderPage({ view: "roots" }),
    loadEveryFolderPage({ view: "recent", limit: 10 }),
  ]).then(([roots, recentFolders]) => {
    state.folders = roots;
    state.recentFolders = recentFolders.slice(0, 10);
    void loadFolderGrants([...state.folders, ...state.recentFolders]).then(() => {
      if (state.route === "library") render();
    });
    if (state.route === "library" && state.libraryLoaded) render();
  }).finally(() => {
    if (state.libraryFolderRefresh === refresh) state.libraryFolderRefresh = null;
  });
  state.libraryFolderRefresh = refresh;
  return refresh;
}

function refreshFolderCollection(folderId, { folderRequest = null } = {}) {
  const existing = state.folderRefreshes.get(folderId);
  if (existing) return existing;
  const cached = state.folderCollections.get(folderId);
  const resolvedFolder = folderRequest
    ?? Promise.resolve(cached?.folder ?? knownFolder(folderId)).then((folder) => folder ?? api.openFolder(folderId));
  const refresh = Promise.all([
    resolvedFolder,
    loadEveryFolderPage({ view: "children", parentId: folderId }),
    loadEveryDocumentPage((cursor) => api.listDocuments(cursor, { view: "folder", folderId })),
  ]).then(([folder, children, documents]) => {
    const collection = { folder, children, documents: documents.map(withModule) };
    state.folderCollections.set(folderId, collection);
    if (state.route !== "folder" || state.currentFolder?.id !== folderId) return;
    state.currentFolder = collection.folder;
    state.folderChildren = collection.children;
    state.folderDocuments = collection.documents;
    state.loading = false;
    state.error = null;
    render();
    void loadFolderGrants([folder, ...children]).then(() => {
      if (state.route === "folder" && state.currentFolder?.id === folderId) render();
    });
    void loadDocumentThumbnails(collection.documents).then(() => {
      if (state.route === "folder" && state.currentFolder?.id === folderId) render();
    });
  }).catch((error) => {
    if (state.route === "folder" && state.currentFolder?.id === folderId) {
      state.loading = false;
      state.error = message(error);
      render();
    }
    throw error;
  }).finally(() => {
    if (state.folderRefreshes.get(folderId) === refresh) state.folderRefreshes.delete(folderId);
  });
  state.folderRefreshes.set(folderId, refresh);
  return refresh;
}

async function loadEveryFolderPage(options) {
  const folders = [];
  let cursor;
  do {
    const page = await api.listFolders(cursor, options);
    folders.push(...page.items);
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor && folders.length < (options.limit ?? Number.POSITIVE_INFINITY));
  return folders;
}

async function loadFolderGrants(folders) {
  const unique = [...new Map(folders.map((folder) => [folder.id, folder])).values()]
    .filter((folder) => folder.access === "owner" && !state.folderGrants.has(folder.id))
    .slice(0, 20);
  await Promise.all(unique.map(async (folder) => {
    try {
      const grants = await api.listFolderGrants(folder.id);
      state.folderGrants.set(folder.id, grants.items.filter((grant) => grant.status === "active" && !grant.isCurrentUser));
    } catch (error) {
      console.warn(`Canvas could not load collaborators for folder ${folder.id}.`, error);
    }
  }));
}

function withModule(document) {
  return { ...document, module: document.projection?.module ?? null };
}

function knownDocument(documentId) {
  return [...state.documents, ...state.folderDocuments, ...state.trashedDocuments]
    .find((document) => document.id === documentId) ?? null;
}

function upsertFolderSummary(folder) {
  const replace = (items) => {
    const next = items.filter((item) => item.id !== folder.id);
    if (folder.parentId === null) next.unshift(folder);
    return next;
  };
  state.folders = replace(state.folders);
  state.recentFolders = [folder, ...state.recentFolders.filter((item) => item.id !== folder.id)].slice(0, 10);
  for (const [id, collection] of state.folderCollections) {
    const children = collection.children.filter((item) => item.id !== folder.id);
    if (folder.parentId === id) children.unshift(folder);
    state.folderCollections.set(id, {
      ...collection,
      folder: id === folder.id ? folder : collection.folder,
      children,
    });
  }
  if (state.currentFolder?.id === folder.id) state.currentFolder = folder;
  if (state.route === "folder" && state.currentFolder) {
    state.folderChildren = state.folderCollections.get(state.currentFolder.id)?.children ?? state.folderChildren;
  }
  invalidateFolderTree();
}

function removeFolderSummary(folderId) {
  state.folders = state.folders.filter((folder) => folder.id !== folderId);
  state.recentFolders = state.recentFolders.filter((folder) => folder.id !== folderId);
  state.folderChildren = state.folderChildren.filter((folder) => folder.id !== folderId);
  state.folderCollections.delete(folderId);
  for (const [id, collection] of state.folderCollections) {
    state.folderCollections.set(id, {
      ...collection,
      children: collection.children.filter((folder) => folder.id !== folderId),
    });
  }
  invalidateFolderTree();
}

function upsertDocumentSummary(document, previousFolderId = undefined) {
  const existing = knownDocument(document.id);
  const normalized = withModule({ ...(existing ?? {}), ...document });
  const oldFolderId = previousFolderId === undefined ? existing?.folderId : previousFolderId;
  state.documents = [normalized, ...state.documents.filter((item) => item.id !== document.id)];
  for (const [id, collection] of state.folderCollections) {
    const documents = collection.documents.filter((item) => item.id !== document.id);
    if (normalized.folderId === id) documents.unshift(normalized);
    state.folderCollections.set(id, { ...collection, documents });
  }
  if (state.route === "folder" && state.currentFolder) {
    state.folderDocuments = state.folderCollections.get(state.currentFolder.id)?.documents
      ?? state.folderDocuments.filter((item) => item.id !== document.id);
    if (normalized.folderId === state.currentFolder.id && !state.folderDocuments.some((item) => item.id === document.id)) {
      state.folderDocuments.unshift(normalized);
    }
  }
  if (oldFolderId === normalized.folderId) return;
  adjustFolderDesignCount(oldFolderId, -1);
  adjustFolderDesignCount(normalized.folderId, 1);
}

function removeDocumentSummary(documentId) {
  const existing = knownDocument(documentId);
  state.documents = state.documents.filter((document) => document.id !== documentId);
  state.folderDocuments = state.folderDocuments.filter((document) => document.id !== documentId);
  for (const [id, collection] of state.folderCollections) {
    state.folderCollections.set(id, {
      ...collection,
      documents: collection.documents.filter((document) => document.id !== documentId),
    });
  }
  adjustFolderDesignCount(existing?.folderId, -1);
}

function adjustFolderDesignCount(folderId, delta) {
  if (!folderId || delta === 0) return;
  const update = (folder) => folder.id === folderId
    ? { ...folder, designCount: Math.max(0, Number(folder.designCount ?? 0) + delta) }
    : folder;
  state.folders = state.folders.map(update);
  state.recentFolders = state.recentFolders.map(update);
  state.folderChildren = state.folderChildren.map(update);
  if (state.currentFolder?.id === folderId) state.currentFolder = update(state.currentFolder);
  for (const [id, collection] of state.folderCollections) {
    state.folderCollections.set(id, {
      ...collection,
      folder: update(collection.folder),
      children: collection.children.map(update),
    });
  }
}

function invalidateFolderTree() {
  state.folderTree = null;
}

async function showTrash() {
  closeDocument();
  state.currentFolder = null;
  state.route = "trash";
  state.loading = !state.shellReady;
  state.error = null;
  state.contextMenu = null;
  render();
  state.trashedFolders = await loadEveryFolderPage({ view: "trash" });
  await documentCollectionLifecycle.start({
    load: () => loadEveryDocumentPage(api.listTrash),
    apply: (documents) => {
      if (state.route !== "trash") return;
      state.trashedDocuments = documents;
      state.loading = false;
      state.trashLoaded = true;
      state.error = null;
      render();
    },
    onError: handleDocumentCollectionError,
  });
}

async function loadEveryDocumentPage(loadPage) {
  const documents = [];
  let cursor;
  do {
    const page = await loadPage(cursor);
    documents.push(...page.items);
    cursor = page.pageInfo.nextCursor ?? undefined;
  } while (cursor);
  return documents;
}

function handleDocumentCollectionError(error, { phase }) {
  if (phase === "subscribe") {
    console.warn("Canvas document collection realtime is unavailable.", error);
    return;
  }
  state.loading = false;
  state.error = message(error);
  render();
}

function startFolderSubscription(folderId = null) {
  state.folderUnsubscribe?.();
  state.folderUnsubscribe = null;
  void api.subscribeToFolders(() => {
    invalidateFolderTree();
    if (folderId && state.route === "folder" && state.currentFolder?.id === folderId) {
      void refreshFolderCollection(folderId).catch((error) => handleDocumentCollectionError(error, { phase: "load" }));
    } else if (!folderId && state.route === "library") {
      void refreshLibraryFolders().catch((error) => handleDocumentCollectionError(error, { phase: "load" }));
    }
  }).then((unsubscribe) => { state.folderUnsubscribe = unsubscribe; }).catch((error) => {
    console.warn("Canvas folder realtime is unavailable.", error);
  });
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

async function navigateToFolder(folderId) {
  await routes.navigateToFolder(folderId);
}

async function createBlankDocument(title = "Untitled", module = "generic", destinationFolderId) {
  const source = createBlankDocumentSource({ module });
  const model = createDocumentModel(source);
  try {
    const folderId = destinationFolderId === undefined
      ? state.route === "folder" ? state.currentFolder?.id ?? null : null
      : destinationFolderId || null;
    const document = await api.createDocument({ title, folderId, source, initialUpdate: encodeState(model) });
    await navigateToDocument(document.id);
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
    const { assets } = await performanceMonitor.measureAsync(
      "document.assets",
      () => hydrateDocumentAssets(api, documentId, assetDescriptors, new Map(), {
        rasterizeSvg: rasterizeOpenPencilSvgAsset,
      }),
      {
        documentId,
        assets: assetDescriptors.length,
        assetBytes: assetDescriptors.reduce((total, asset) => total + Number(asset.size ?? 0), 0),
      },
    );
    state.document = {
      ...payload,
      module: payload.snapshot?.source?.module
        ?? payload.snapshot?.projection?.module
        ?? payload.module
        ?? "generic",
    };
    state.currentFolder = payload.folderId
      ? await api.openFolder(payload.folderId)
      : null;
    state.editorDocuments = (await loadEveryDocumentPage((cursor) =>
      api.listDocuments(cursor, payload.folderId
        ? { view: "folder", folderId: payload.folderId }
        : { view: "root" }))).map(withModule);
    state.grants = payload.access === "owner"
      ? (await api.listGrants(documentId)).items
      : [];
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
    state.expandedLayerIds.clear();
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
    state.documentUnsubscribe = await performanceMonitor.measureAsync(
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
          if (hasUnloadedDocumentImages(currentMaterializedDocument(), state.assets)) {
            void refreshDocumentAssets(documentId)
              .catch((error) => console.warn("Canvas could not refresh document assets.", error))
              .finally(() => {
                if (state.document?.id === documentId) render();
              });
          } else {
            render();
          }
        }
        if (event.event === "project:renamed" && typeof event.payload?.title === "string") {
          state.document.title = event.payload.title;
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
    state.activePanel = null;
    state.layersOpen = false;
    state.inspectorOpen = false;
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

async function loadDocumentThumbnails(documents) {
  const pending = documents.filter((document) =>
    document.thumbnailUpdatedAt && !state.thumbnails.has(document.id));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, async () => {
    for (;;) {
      const document = pending[next++];
      if (!document) return;
      try {
        const result = await api.readThumbnail(document.id);
        state.thumbnails.set(document.id, `data:image/png;base64,${result.png}`);
      } catch (error) {
        console.warn("Canvas could not load a saved design thumbnail.", error);
      }
    }
  }));
}

function closeDocument() {
  documentCollectionLifecycle.stop();
  state.folderUnsubscribe?.();
  state.folderUnsubscribe = null;
  disposeEngineSurface();
  state.documentUnsubscribe?.();
  state.documentUnsubscribe = null;
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
  state.grants = [];
  state.shareTarget = null;
  state.model = null;
  state.selectedId = null;
  state.expandedLayerIds.clear();
  state.presence = null;
  state.realtimeConnection = REALTIME_RECONNECTING;
  state.dialog = null;
  state.contextMenu = null;
  state.documentSwitcherOpen = false;
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
  clearTimeout(state.thumbnailTimer);
  state.thumbnailTimer = null;
  state.fieldDrafts.clear();
  state.fieldErrors.clear();
  state.accessRemoved = false;
  state.documentUnavailable = null;
}

async function refreshDocumentAssets(documentId) {
  const descriptors = await api.listAssets(documentId);
  if (state.document?.id !== documentId) return;
  const result = await hydrateDocumentAssets(api, documentId, descriptors, state.assets, {
    rasterizeSvg: rasterizeOpenPencilSvgAsset,
  });
  if (state.document?.id !== documentId || !result.changed) return;
  state.assets = result.assets;
  invalidateDocumentProjection();
  state.compatibilityDocument = null;
  state.engineDocumentDirty = true;
  state.engineDocumentDirtyReason = "document-assets-refreshed";
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
    scheduleThumbnailUpdate(documentId);
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

function scheduleThumbnailUpdate(documentId) {
  clearTimeout(state.thumbnailTimer);
  state.thumbnailTimer = setTimeout(() => void updateOpenDocumentThumbnail(documentId), 2_000);
}

async function updateOpenDocumentThumbnail(documentId) {
  state.thumbnailTimer = null;
  if (state.document?.id !== documentId || state.pendingUpdates.length || state.flushing) return;
  const png = state.engineSurface?.capturePreview?.(640);
  if (!png) return;
  try {
    await api.writeThumbnail(documentId, state.lastSequence, png);
  } catch (error) {
    console.warn("Canvas kept the last saved thumbnail after preview generation failed.", error);
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
      : state.route === "trash" ? renderTrash() : state.route === "folder" ? renderFolder() : renderLibrary();
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
  const matches = (value) => !query || value.toLowerCase().includes(query);
  const recentDocuments = [...state.documents]
    .filter((document) => document.lastOpenedAt && matches(document.title))
    .sort((a, b) => String(b.lastOpenedAt).localeCompare(String(a.lastOpenedAt)));
  const rootDocuments = state.documents.filter((document) => document.folderId === null && matches(document.title));
  const rootFolders = state.folders.filter((folder) => matches(folder.name));
  const sharedDocuments = state.documents.filter((document) => document.access === "editor" && matches(document.title));
  const sharedFolders = state.folders.filter((folder) => folder.access === "editor" && matches(folder.name));
  const filteredRecentFolders = state.recentFolders.filter((folder) => matches(folder.name));
  const empty = state.libraryLoaded ? emptyLibrary(query) : "";
  const content = state.libraryFilter === "recent"
    ? `${filteredRecentFolders.length ? folderSection(filteredRecentFolders, "Folders", true) : ""}<section class="library-section"><div class="section-heading"><h2>Recent designs <span>${recentDocuments.length}</span></h2></div>${recentDocuments.length ? `<div class="document-grid">${recentDocuments.map(documentCard).join("")}</div>` : empty}</section>`
    : state.libraryFilter === "shared"
      ? `<section class="library-section">${sharedFolders.length ? folderSection(sharedFolders, "Folders") : ""}<div class="section-heading"><h2>Shared designs <span>${sharedDocuments.length}</span></h2></div>${sharedDocuments.length ? `<div class="document-grid">${sharedDocuments.map(documentCard).join("")}</div>` : sharedFolders.length ? "" : empty}</section>`
      : `${folderSection(rootFolders, "Folders", false, true)}<section class="library-section"><div class="section-heading"><h2>Designs <span>${rootDocuments.length}</span></h2></div>${rootDocuments.length ? `<div class="document-grid">${rootDocuments.map(documentCard).join("")}</div>` : empty}</section>`;
  return `<main class="shell library"><div class="library-inner">
    <div class="library-sticky">${libraryTopbar("Search designs and folders")}${libraryTabs(state.libraryFilter)}</div>
    <div class="library-content">${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
    ${content}</div>
  </div></main>${renderDialog()}${renderToast()}`;
}

function renderFolder() {
  const folder = state.currentFolder;
  if (!folder) return `<main class="shell empty"><div><h2>Folder unavailable</h2></div></main>`;
  const query = state.search.trim().toLowerCase();
  const matches = (value) => !query || value.toLowerCase().includes(query);
  const folders = state.folderChildren.filter((item) => matches(item.name));
  const documents = state.folderDocuments.filter((item) => matches(item.title));
  const empty = state.folderCollections.has(folder.id) ? emptyLibrary(query) : "";
  return `<main class="shell library"><div class="library-inner">
    <div class="library-sticky">${folderTopbar(folder)}</div>
    <div class="folder-content">
    <header class="folder-overview">
      <span class="folder-overview-icon">${icon("folder")}</span><div class="library-title"><div class="folder-name-line"><h1>${escapeHtml(folder.name)}</h1>${folder.access === "owner" ? `<button class="icon-button" data-action="rename-current-folder" aria-label="Rename folder">${icon("pencil")}</button>` : ""}</div><div class="folder-detail-line"><p>${folders.length} folder${folders.length === 1 ? "" : "s"} · ${folder.designCount} design${folder.designCount === 1 ? "" : "s"} · Updated ${escapeHtml(relativeTime(folder.updatedAt))}</p>${folderPeopleSummary(folder)}</div></div><div class="folder-header-actions">${collectionControls()}${folder.access === "owner" ? `<button class="button" data-action="share-current-folder">${icon("person-plus")}Share folder</button>` : ""}<button class="icon-button" data-action="current-folder-menu" aria-label="Folder actions">${icon("more")}</button></div>
    </header>
    ${folders.length ? folderSection(folders, "Folders", false, false, true) : ""}
    <section class="library-section"><div class="section-heading"><h2>Designs in ${escapeHtml(folder.name)} <span>${documents.length}</span></h2></div>${documents.length ? `<div class="document-grid">${documents.map(documentCard).join("")}</div>` : empty}</section>
    </div>
  </div></main>${renderDialog()}${renderToast()}`;
}

function libraryTopbar(placeholder) {
  return `<header class="library-topbar"><button class="canvas-brand" data-action="back-to-files" aria-label="Canvas home"><span>${icon("frame")}</span><strong>Canvas</strong></button><div class="topbar-actions">${searchControl(placeholder)}<button class="button" data-action="new-folder">${icon("folder-plus")}New folder</button><button class="button primary" data-action="new">${icon("plus")}New design</button></div></header>`;
}

function folderTopbar(folder) {
  return `<header class="library-topbar folder-topbar"><div class="folder-breadcrumb"><button data-action="folder-back">${icon("home")}Home</button><span>${icon("chevron")}</span><strong>${icon("folder")}${escapeHtml(folder.name)}</strong></div><div class="topbar-actions">${searchControl("Search designs and folders", `Search ${folder.name}`)}<button class="button primary" data-action="new">${icon("plus")}New design</button></div></header>`;
}

function searchControl(placeholder, label = placeholder) {
  return `<label class="search-wrap">${icon("search")}<input class="search" data-role="search" type="search" value="${escapeHtml(state.search)}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(label)}" /><kbd>⌘K</kbd></label>`;
}

function libraryTabs(active) {
  return `<nav class="library-tabs" aria-label="Canvas sections"><div class="library-tab-list">${segment("recent", "Recent")}${segment("all", "All designs")}${segment("shared", "Shared with you")}<button class="${active === "trash" ? "active" : ""}" data-action="open-trash">Trash</button></div>${collectionControls()}</nav>`;
}

function folderSection(folders, title, rail = false, includeNew = false, nested = false) {
  return `<section class="library-section"><div class="section-heading"><h2>${escapeHtml(title)} <span>${folders.length}</span></h2>${rail && folders.length >= 10 ? `<span class="section-link">See more</span>` : ""}</div><div class="${rail ? "folder-rail" : "folder-grid"}">${folders.map((folder) => folderCard(folder, nested)).join("")}${includeNew ? `<button class="folder-card folder-card-new" data-action="new-folder">${icon("folder-plus")}<span><strong>New folder</strong></span></button>` : ""}</div></section>`;
}

function collectionControls() {
  return `<div class="collection-controls" aria-hidden="true"><span class="view-toggle">${icon("grid")}${icon("list")}</span><span class="sort-control">Last edited ${icon("chevron-down")}</span></div>`;
}

function emptyLibrary(query = "") {
  return query
    ? `<section class="empty"><div>${icon("search")}<h2>No results found</h2><p>Try a different name or clear your search.</p></div></section>`
    : `<section class="empty"><div>${icon("file")}<h2>No designs here yet</h2><p>Create a design to get started.</p><button class="button primary" data-action="new">${icon("plus")}New design</button></div></section>`;
}

function renderTrash() {
  const query = state.search.trim().toLowerCase();
  const documents = state.trashedDocuments.filter((document) =>
    !query || document.title.toLowerCase().includes(query));
  return `<main class="shell library"><div class="library-inner">
    ${libraryTopbar("Search Trash")}
    ${libraryTabs("trash")}
    <header class="trash-overview"><div class="library-title"><h1>Trash</h1><p>Items are permanently deleted after 30 days.</p></div></header>
    ${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
    ${state.trashedFolders.length ? `<section class="library-section"><div class="section-heading"><h2>Folders</h2></div><div class="folder-grid">${state.trashedFolders.map(trashFolderCard).join("")}</div></section>` : ""}
    ${documents.length ? `<section class="library-section"><div class="section-heading"><h2>Designs</h2></div><div class="document-grid">${documents.map(trashCard).join("")}</div></section>` : state.trashedFolders.length || !state.trashLoaded ? "" : `<section class="empty"><div>${icon("trash")}<h2>Trash is empty</h2><p>Items moved to Trash will appear here for 30 days.</p></div></section>`}
  </div></main>${renderDialog()}${renderToast()}`;
}

function segment(key, label) {
  return `<button class="${state.route === "library" && state.libraryFilter === key ? "active" : ""}" data-filter="${key}">${label}</button>`;
}

function documentCard(document) {
  const preview = state.thumbnails.get(document.id);
  const editor = document.lastEditor && !document.lastEditor.isCurrentUser ? avatar(document.lastEditor) : "";
  return `<button class="document-card" data-document-id="${document.id}"><span class="document-preview">${preview ? `<img src="${preview}" alt="" />` : `<span class="preview-placeholder">${icon("frame")}</span>`}</span><span class="document-meta"><strong>${escapeHtml(document.title)}</strong><span class="document-submeta"><span>${escapeHtml(moduleLabel(document.module))}</span><span>Edited ${escapeHtml(relativeTime(document.updatedAt))}</span>${editor}</span></span></button>`;
}

function folderCard(folder, nested = false) {
  const people = folderPeople(folder, { inheritCurrentFolder: nested });
  const peopleCount = folderPeopleProfiles(folder, { inheritCurrentFolder: nested }).length;
  const detail = `${folder.designCount} design${folder.designCount === 1 ? "" : "s"}${nested && peopleCount ? ` · inherits ${peopleCount} ${peopleCount === 1 ? "person" : "people"}` : peopleCount ? ` · ${peopleCount} ${peopleCount === 1 ? "person" : "people"}` : ""}`;
  return `<button class="folder-card ${nested ? "nested-folder-card" : ""}" data-folder-id="${folder.id}">${nested ? `<span class="folder-icon">${icon("folder")}</span>` : ""}<span><strong>${escapeHtml(folder.name)}</strong><small>${escapeHtml(detail)}</small>${nested ? "" : people}</span></button>`;
}

function folderPeopleProfiles(folder, { inheritCurrentFolder = false } = {}) {
  const direct = state.folderGrants.get(folder.id) ?? [];
  if (direct.length || !inheritCurrentFolder || !state.currentFolder) return direct;
  return state.folderGrants.get(state.currentFolder.id) ?? [];
}

function folderPeople(folder, options) {
  const profiles = folderPeopleProfiles(folder, options).slice(0, 4);
  return profiles.length ? `<span class="folder-people">${profiles.map(avatar).join("")}</span>` : "";
}

function folderPeopleSummary(folder) {
  const profiles = [state.currentProfile, ...folderPeopleProfiles(folder)]
    .filter(Boolean)
    .filter((profile, index, all) => all.findIndex((candidate) => (candidate.id ?? candidate.accountId ?? candidate.email) === (profile.id ?? profile.accountId ?? profile.email)) === index)
    .slice(0, 3);
  if (!profiles.length) return "";
  const names = profiles.map((profile, index) => index === 0 && profile === state.currentProfile ? "You" : profile.name?.trim() || profile.email).filter(Boolean);
  const summary = names.length < 2 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `<span class="folder-people-summary">${escapeHtml(summary)}</span>`;
}

function moduleLabel(value) {
  return ({ generic: "Generic", deck: "Deck", web: "Web", mobile: "Mobile" })[value] ?? "Generic";
}

function avatar(profile) {
  const label = profile.name?.trim() || "Collaborator";
  return profile.avatarUrl
    ? `<img class="avatar" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(label)}" />`
    : `<span class="avatar avatar-fallback" aria-label="${escapeHtml(label)}">${escapeHtml(initials(label))}</span>`;
}

function initials(value) {
  return value.split(/\s+/u).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function trashCard(document) {
  return `<article class="document-card trash-card"><span class="document-preview">${icon("file")}</span><span class="document-meta"><strong>${escapeHtml(document.title)}</strong><span>Deleted ${escapeHtml(formatDate(document.deletedAt))}</span><span>Permanently deletes ${escapeHtml(formatDate(document.recoverableUntil))}</span></span><span class="trash-actions"><button class="button" data-restore-document="${document.id}">Restore</button><button class="button danger" data-permanently-delete-document="${document.id}">Delete permanently</button></span></article>`;
}

function trashFolderCard(folder) {
  return `<article class="folder-card trash-folder-card"><span class="folder-icon">${icon("folder")}</span><span><strong>${escapeHtml(folder.name)}</strong><small>${folder.designCount} designs</small></span><span class="trash-actions"><button class="button" data-restore-folder="${folder.id}">Restore</button><button class="button danger" data-delete-folder="${folder.id}">Delete permanently</button></span></article>`;
}

function renderContextMenu() {
  const menu = state.contextMenu;
  if (!menu) return "";
  const document = state.documents.find((item) => item.id === menu.documentId);
  if (!document || document.access !== "owner") return "";
  return `<div class="context-menu-backdrop" data-role="context-menu-layer" data-action="close-context-menu"><div class="context-menu" role="menu" aria-label="${escapeHtml(document.title)} actions" style="left:${menu.x}px;top:${menu.y}px"><button role="menuitem" data-trash-document="${document.id}">${icon("trash")}<span>Move to Trash</span></button></div></div>`;
}

function renderEditor() {
  if (state.accessRemoved) {
    return `<main class="shell empty"><div>${icon("file")}<h2>${ACCESS_REMOVED_HEADING}</h2><p>${ACCESS_REMOVED_MESSAGE}</p><div class="library-actions"><button class="button primary" data-action="back">Back to files</button></div></div></main>${renderToast()}`;
  }
  const document = currentMaterializedDocument();
  const documentNodes = currentDocumentNodes();
  const layerNodes = currentVisibleLayerNodes(documentNodes);
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
  const unsupportedNodeCount = state.compatibilityNodeIds.size;
  const panelVisibilityClass = `${state.layersOpen ? "layers-open" : "layers-closed"} ${state.inspectorOpen ? "inspector-open" : "inspector-closed"}`;
  const editorPeople = [state.currentProfile, ...state.grants.filter((grant) => grant.status === "active")]
    .filter(Boolean)
    .filter((profile, index, profiles) => profiles.findIndex((candidate) => (candidate.id ?? candidate.email) === (profile.id ?? profile.email)) === index)
    .slice(0, 3);
  return `<main class="shell editor">
    <header class="editor-header">
      <div class="editor-header-left">
        <button class="icon-button editor-panel-toggle" data-action="toggle-layers" aria-label="${state.layersOpen ? "Hide" : "Show"} layers panel">${icon("panel-left")}</button>
        <button class="icon-button editor-back" data-action="back" aria-label="Back to files">${icon("back")}</button>
        <div class="editor-title"><input data-role="title" size="${Math.min(42, Math.max(1, state.document.title.length))}" value="${escapeHtml(state.document.title)}" aria-label="Document title" /><button class="document-switcher" data-action="document-switcher" aria-label="Switch design">${icon("chevron-down")}</button></div>
        <span class="module-badge">${escapeHtml(moduleLabel(state.document.module))}</span>
        <div class="sync" data-state="${state.sync}" title="${escapeHtml(state.syncMessage)}" role="status" aria-live="polite">${state.sync === "saved" ? icon("check") : `<i class="sync-dot"></i>`}<span>${escapeHtml(state.syncMessage)}</span></div>
      </div>
      <div class="editor-header-right">
        ${editorPeople.length ? `<div class="editor-avatars" aria-label="People with access">${editorPeople.map(avatar).join("")}</div>` : ""}
        ${state.document.access === "owner" ? `<button class="button editor-share" data-action="share">${icon("person-plus")}<span>Share</span></button>` : ""}
        <button class="icon-button editor-panel-toggle" data-action="toggle-inspector" aria-label="${state.inspectorOpen ? "Hide" : "Show"} design panel">${icon("panel-right")}</button>
      </div>
    </header>
    <div class="editor-body ${panelVisibilityClass}">
      <aside class="side-panel layers" ${state.layersOpen ? "" : "hidden"}>
        <div class="panel-tabs"><button class="${state.assetPanel === "layers" ? "active" : ""}" data-asset-panel="layers">Layers</button><button class="${state.assetPanel === "assets" ? "active" : ""}" data-asset-panel="assets">Assets</button><button class="${state.assetPanel === "variables" ? "active" : ""}" data-asset-panel="variables">Variables</button></div>
        ${renderLayersPanelHeader(layerNodes)}
        <div class="panel-scroll">${state.layersOpen ? renderLayersPanelContent(layerNodes) : ""}</div>
      </aside>
      <section class="viewport" data-role="viewport" data-tool="${state.activeTool}" tabindex="0" aria-label="Canvas viewport">
        <div class="openpencil-host" data-role="openpencil-surface"><div class="engine-loading" role="status" aria-live="polite">Rendering design…</div></div>
        ${state.realtimeConnection === REALTIME_RECONNECTING && navigator.onLine ? `<div class="connection-banner">${icon("refresh")}<span>Reconnecting and merging changes</span></div>` : ""}
        ${unsupported.length ? `<div class="compatibility-banner"><span>${unsupportedNodeCount} object${unsupportedNodeCount === 1 ? " needs" : "s need"} compatibility review</span><button class="button" data-action="compatibility">Review</button></div>` : ""}
      </section>
      <aside class="side-panel inspector" ${state.inspectorOpen ? "" : "hidden"}><div class="panel-tabs"><button class="${state.inspectorTab === "design" ? "active" : ""}" data-inspector-tab="design">Design</button><button class="${state.inspectorTab === "prototype" ? "active" : ""}" data-inspector-tab="prototype">Prototype</button><button class="${state.inspectorTab === "review" ? "active" : ""}" data-inspector-tab="review">Review</button></div><div class="panel-scroll">${renderInspectorPanel(selection)}</div></aside>
    </div>
    ${state.documentSwitcherOpen ? '<div class="document-switcher-scrim" aria-hidden="true"></div>' : ""}
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
      visible: state.appTabActive,
      showRulers: true,
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
        if (expandSelectedLayerAncestors(nodeId)) renderLayersTree();
        renderSelection();
        scrollSelectedLayerIntoView();
      },
      onViewport: (viewport) => {
        if (state.document?.id !== documentId) return;
        state.engineViewport = viewport;
      },
      onTool: (tool) => {
        state.activeTool = tool.toLowerCase();
        root.querySelectorAll("button[data-tool]").forEach((button) => {
          button.classList.toggle("active", button.dataset.tool === tool);
        });
      },
      onTextEditStart: () => state.undo?.stopCapturing(),
      onMutations: (mutations) => queueEngineMutations(documentId, surface, mutations),
      onTextEditCommit: () => queueMicrotask(() => state.undo?.stopCapturing()),
      restoreDeletedNode: (nodeId) => {
        const deleted = state.deletedNodeSnapshots.get(nodeId);
        return deleted ? {
          kind: "insert-node",
          node: structuredClone(deleted.node),
          parentId: deleted.parentId,
          position: deleted.position,
        } : null;
      },
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
  const nodes = currentVisibleLayerNodes();
  const toolbar = root.querySelector(".side-panel.layers .layers-toolbar");
  const toolbarHtml = renderLayersPanelHeader(nodes);
  if (toolbar && toolbarHtml) toolbar.replaceWith(fragment(toolbarHtml));
  scroll.innerHTML = renderLayersPanelContent(nodes);
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

function currentVisibleLayerNodes(fallback = currentDocumentNodes()) {
  return visibleCanvasSceneLayers(currentLayerNodes(fallback), state.expandedLayerIds);
}

function renderLayersPanelContent(nodes) {
  if (state.assetPanel === "assets") return `<div class="inspector-empty">Reusable components and document assets appear here.</div>`;
  if (state.assetPanel === "variables") return `<div class="inspector-empty">Document variables appear here.</div>`;
  return `<div role="tree" aria-label="Document layers">${nodes.map(layerRow).join("")}</div><div class="components-row">${icon("component")}<span>Components</span><span class="components-count">${componentDefinitionCount()}</span></div>`;
}

function renderLayersPanelHeader(nodes) {
  if (state.assetPanel !== "layers") return "";
  const labels = { deck: "Slides", web: "Routes", mobile: "Screens", generic: "Frames" };
  const label = labels[state.document?.module] ?? "Frames";
  const count = nodes.filter(({ depth }) => depth === 0).length;
  const lower = label.toLowerCase();
  return `<div class="layers-toolbar"><span>${escapeHtml(label)} <b>${count}</b></span><div><button class="icon-button" aria-label="Search ${escapeHtml(lower)}">${icon("search")}</button><button class="icon-button" aria-label="Add ${escapeHtml(lower)}">${icon("plus")}</button></div></div>`;
}

function componentDefinitionCount() {
  const components = currentMaterializedDocument()?.components;
  return components && typeof components === "object" ? Object.keys(components).length : 0;
}

function fragment(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

function renderInspectorPanel(selection) {
  if (state.inspectorTab === "prototype") return `<div class="inspector-empty">Prototype settings appear here.</div>`;
  if (state.inspectorTab === "review") return `<div class="inspector-empty">Review notes appear here.</div>`;
  return renderInspector(selection);
}

function renderHistoryControls() {
  const editor = state.engineSurface?.editor;
  const undoButton = root.querySelector('[data-action="undo"]');
  const redoButton = root.querySelector('[data-action="redo"]');
  if (undoButton) undoButton.disabled = editor ? !editor.undo.canUndo : !state.undo?.canUndo();
  if (redoButton) redoButton.disabled = editor ? !editor.undo.canRedo : !state.undo?.canRedo();
}

function layerRow({ node, depth, hasChildren }) {
  const sourceId = node.pencilNodeId ?? node.id.split("/").at(-1);
  const issue = state.compatibilityNodeIds.has(sourceId);
  const type = String(node.type).toLowerCase();
  const expanded = hasChildren && state.expandedLayerIds.has(node.id);
  return `<div class="layer-row ${node.id === state.selectedId ? "selected" : ""}" style="--depth:${depth}" data-node-id="${escapeHtml(node.id)}" role="treeitem" tabindex="0" aria-level="${depth + 1}" aria-selected="${node.id === state.selectedId}"${hasChildren ? ` aria-expanded="${expanded}"` : ""}><button class="layer-disclosure" data-action="toggle-layer" type="button" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(node.name ?? node.type)}"${hasChildren ? "" : " disabled"}>${hasChildren ? icon(expanded ? "chevron-down" : "chevron") : ""}</button><span class="layer-type">${layerTypeIcon(type)}</span><span class="layer-name">${escapeHtml(node.name ?? node.content ?? node.text ?? node.type)}</span>${issue ? `<span title="Preserved but not faithfully represented">⚠</span>` : ""}${node.locked ? icon("lock") : ""}${node.visible === false ? icon("eye-off") : ""}</div>`;
}

function layerTypeIcon(type) {
  if (type === "text") return icon("type");
  if (type === "image") return icon("image");
  if (type === "component" || type === "instance") return icon("component");
  if (["frame", "group", "section"].includes(type)) return icon("layout-list");
  return icon("square");
}

function renderInspector(selection) {
  const node = selection?.effectiveNode;
  if (!node) return `<div class="inspector-empty">Select an object to inspect and edit its properties.</div>`;
  const sceneEditable = isOpenPencilEditableNode(node);
  if (!isPencilAuthorableNode(node, sceneEditable)) {
    return `${selectionHeading(selection)}<div class="inspector-empty">This unsupported object is preserved without alteration and cannot currently be edited in Canvas.</div>`;
  }
  const fieldNodeId = selection.referenceId;
  const numeric = ["x", "y", "width", "height", "rotation"];
  const simpleFill = typeof node.fill === "string"
    || node.fill?.type === "color"
    || node.fill?.type === "solid"
    || node.fill == null;
  const svgCandidate = selection.isInstanceDescendant ? null : inspectSvgVectorCandidate(node, state.assets);
  return `${selectionHeading(selection)}
  <section class="section"><h3>Position</h3><div class="field-grid">${field("name", node.name ?? "", "text", true, fieldNodeId)}${numeric.slice(0, 2).map((property) => field(property, node[property] ?? 0, "number", false, fieldNodeId)).join("")}${field("rotation", node.rotation ?? 0, "number", false, fieldNodeId)}</div></section>
  <section class="section"><h3>Layout</h3><div class="field-grid">${numeric.slice(2, 4).map((property) => field(property, node[property] ?? 0, "number", false, fieldNodeId)).join("")}${field("gap", node.gap ?? 0, "number", false, fieldNodeId)}${field("padding", Array.isArray(node.padding) ? node.padding.join(", ") : node.padding ?? 0, "text", false, fieldNodeId)}</div></section>
  <section class="section"><h3>Appearance</h3><div class="field-grid">${simpleFill ? field("fill", fillValue(node.fill), "text", true, fieldNodeId) : ""}${field("opacity", node.opacity ?? 1, "number", false, fieldNodeId)}${field("cornerRadius", node.cornerRadius ?? 0, "number", false, fieldNodeId)}</div></section>
  ${node.type === "text" ? `<section class="section"><h3>Typography</h3><div class="field-grid">${field("content", node.content ?? "", "text", true, fieldNodeId)}${field("fontFamily", node.fontFamily ?? "Inter", "text", true, fieldNodeId)}${field("fontSize", node.fontSize ?? 16, "number", false, fieldNodeId)}${field("fontWeight", node.fontWeight ?? "400", "text", false, fieldNodeId)}${field("lineHeight", node.lineHeight ?? 1.2, "number", false, fieldNodeId)}</div></section>` : ""}
  ${pencilAuthoringSections(node).map((section) => renderAuthoringSection(section, fieldNodeId)).join("")}
  ${svgCandidate ? renderSvgVectorSection(svgCandidate) : ""}
  ${state.compatibilityNodeIds.has(node.id) ? `<section class="section"><h3>Compatibility</h3><p class="muted">Some visual behavior on this object is preserved but not currently represented faithfully. Review compatibility for details.</p></section>` : ""}
  ${selection.isInstanceDescendant ? "" : `<div class="danger-zone"><button class="button danger" data-action="delete-node">Delete object</button></div>`}`;
}

function renderSvgVectorSection(candidate) {
  const support = candidate.support;
  const detail = support.conversionSupported
    ? "This SVG already renders as retained vector artwork. Create a native-path copy when you need to edit its shapes, fills, or strokes."
    : `This SVG already renders as retained vector artwork. Editable conversion is unavailable because it would lose ${support.conversionIssues.join(", ")}.`;
  return `<section class="section svg-vector-section"><h3>SVG artwork</h3><p class="muted">${escapeHtml(detail)}</p><button class="button" data-action="convert-svg-vectors" type="button" ${support.conversionSupported ? "" : "disabled"}>Create editable vector copy</button></section>`;
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
  const layersTree = currentLayersTree();
  const previous = layersTree?.querySelector(".layer-row.selected");
  previous?.classList.remove("selected");
  previous?.setAttribute("aria-selected", "false");
  if (state.selectedId) {
    const selected = layersTree?.querySelector(`[data-node-id="${CSS.escape(state.selectedId)}"]`);
    selected?.classList.add("selected");
    selected?.setAttribute("aria-selected", "true");
  }
  const inspector = root.querySelector(".side-panel.inspector .panel-scroll");
  if (inspector) {
    const selection = currentCanvasSelection();
    inspector.innerHTML = renderInspectorPanel(selection);
    bindInspectorControls();
  }
  performanceMonitor.record("ui.selection", performance.now() - startedAt, {
    documentId: state.document?.id,
    nodeId: state.selectedId,
  });
}

function expandSelectedLayerAncestors(nodeId) {
  const editor = state.engineSurface?.editor;
  const graph = editor?.graph;
  const pageId = editor?.state.currentPageId ?? graph?.getPages?.()[0]?.id;
  let changed = false;
  for (const ancestorId of canvasSceneLayerAncestorIds(graph, pageId, nodeId)) {
    if (state.expandedLayerIds.has(ancestorId)) continue;
    state.expandedLayerIds.add(ancestorId);
    changed = true;
  }
  return changed;
}

function scrollSelectedLayerIntoView() {
  if (!state.layersOpen || !state.selectedId) return;
  requestAnimationFrame(() => {
    currentLayersTree()
      ?.querySelector(`[data-node-id="${CSS.escape(state.selectedId)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  });
}

function currentLayersTree() {
  return root.querySelector('.side-panel.layers [role="tree"][aria-label="Document layers"]');
}

function syncPanelVisibility() {
  const startedAt = performance.now();
  const body = root.querySelector(".editor-body");
  if (body) {
    body.classList.remove("layers-open", "layers-closed", "inspector-open", "inspector-closed");
    body.classList.add(state.layersOpen ? "layers-open" : "layers-closed");
    body.classList.add(state.inspectorOpen ? "inspector-open" : "inspector-closed");
  }
  root.querySelector(".side-panel.layers")?.toggleAttribute("hidden", !state.layersOpen);
  root.querySelector(".side-panel.inspector")?.toggleAttribute("hidden", !state.inspectorOpen);
  performanceMonitor.record("ui.panel", performance.now() - startedAt, {
    documentId: state.document?.id,
    layersOpen: state.layersOpen,
    inspectorOpen: state.inspectorOpen,
  });
}

function renderCodeInspector(selection) {
  if (!selection?.sourceNode) return `<div class="inspector-empty">Select an object to inspect its stored properties.</div>`;
  const source = selection.isInstanceDescendant
    ? {
      nodeId: selection.referenceId,
      componentSource: selection.sourceNode,
      instanceOverride: selection.override,
    }
    : selection.sourceNode;
  return `<section class="section code-section"><h3>Stored properties</h3><pre>${escapeHtml(JSON.stringify(source, null, 2))}</pre></section>`;
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
  root.querySelector('[data-action="folder-back"]')?.addEventListener("click", () => {
    const parentId = state.currentFolder?.parentId;
    void (parentId ? navigateToFolder(parentId) : navigateToLibrary());
  });
  root.querySelectorAll('[data-action="new-folder"]').forEach((button) => button.addEventListener("click", () => {
    state.dialog = { kind: "folder-form", mode: "create" };
    state.dialogFocusSelector = '[data-role="folder-name"]';
    render();
  }));
  root.querySelector('[data-action="rename-current-folder"]')?.addEventListener("click", () => {
    if (!state.currentFolder) return;
    state.dialog = { kind: "folder-form", mode: "rename", folderId: state.currentFolder.id, name: state.currentFolder.name };
    state.dialogFocusSelector = '[data-role="folder-name"]';
    render();
  });
  root.querySelector('[data-action="share-current-folder"]')?.addEventListener("click", () => {
    const folder = state.currentFolder;
    if (folder) void openShare({ type: "folder", id: folder.id, name: folder.name });
  });
  root.querySelector('[data-action="current-folder-menu"]')?.addEventListener("click", () => {
    if (state.currentFolder) void openFolderContextMenu(state.currentFolder);
  });
  root.querySelectorAll('[data-action="new"]').forEach((button) => button.addEventListener("click", () => {
    state.dialog = { kind: "new-design" };
    state.dialogFocusSelector = '[data-role="design-name"]';
    render();
  }));
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
      const document = [...state.documents, ...state.folderDocuments]
        .find((item) => item.id === button.dataset.documentId);
      if (!document) return;
      event.preventDefault();
      void openDocumentContextMenu(document);
    });
  });
  root.querySelectorAll("[data-folder-id]").forEach((button) => {
    button.addEventListener("click", () => void navigateToFolder(button.dataset.folderId));
    button.addEventListener("pointerenter", () => {
      void refreshFolderCollection(button.dataset.folderId).catch(() => undefined);
    }, { once: true });
    button.addEventListener("contextmenu", (event) => {
      const folder = [...state.folders, ...state.recentFolders, ...state.folderChildren]
        .find((item) => item.id === button.dataset.folderId);
      if (!folder) return;
      event.preventDefault();
      void openFolderContextMenu(folder);
    });
  });
  root.querySelectorAll("[data-restore-document]").forEach((button) => button.addEventListener("click", () => void act(async () => {
    const document = state.trashedDocuments.find((item) => item.id === button.dataset.restoreDocument);
    const restored = await api.restoreDocument(button.dataset.restoreDocument);
    state.trashedDocuments = state.trashedDocuments.filter((item) => item.id !== button.dataset.restoreDocument);
    upsertDocumentSummary({ ...(document ?? {}), ...restored, deletedAt: null });
    setToast("Document restored.");
    render();
  })));
  root.querySelectorAll("[data-restore-folder]").forEach((button) => button.addEventListener("click", () => void act(async () => {
    const folder = state.trashedFolders.find((item) => item.id === button.dataset.restoreFolder);
    const restored = await api.restoreFolder(button.dataset.restoreFolder);
    state.trashedFolders = state.trashedFolders.filter((item) => item.id !== button.dataset.restoreFolder);
    upsertFolderSummary({ ...(folder ?? {}), ...restored, deletedAt: null });
    render();
  })));
  root.querySelectorAll("[data-delete-folder]").forEach((button) => button.addEventListener("click", () => {
    const folder = state.trashedFolders.find((item) => item.id === button.dataset.deleteFolder);
    if (!folder) return;
    state.dialog = { kind: "confirm-permanently-delete-folder", folderId: folder.id, name: folder.name };
    state.dialogFocusSelector = '[data-action="cancel-folder-delete"]';
    render();
  }));
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
  bindFolderDialogs();
}

async function openDocumentContextMenu(document) {
  const folders = await loadFolderTree();
  const action = await runtime.contextMenu.show([
    { id: "open", label: "Open" },
    { id: "duplicate", label: "Duplicate" },
    { type: "submenu", label: "Move to", items: [
      { id: "move:root", label: "All Designs", enabled: document.folderId !== null },
      { type: "separator" },
      ...folderMoveMenu(folders, document.folderId),
    ] },
    ...(document.access === "owner" ? [{ id: "share", label: "Share" }] : []),
    { type: "separator" },
    { id: "trash", label: "Move to Trash", destructive: true },
  ]);
  if (!action) return;
  if (action === "open") return navigateToDocument(document.id);
  if (action === "duplicate") return duplicateDocument(document);
  if (action.startsWith("move:")) {
    const folderId = action === "move:root" ? null : action.slice(5);
    return act(async () => {
      const moved = await api.moveDocument(document.id, folderId);
      upsertDocumentSummary(moved, document.folderId);
      render();
    });
  }
  if (action === "share") return openShare({ type: "document", id: document.id, name: document.title });
  if (action === "trash") {
    state.dialog = documentTrashConfirmation(document, { returnDialog: null, returnFocusSelector: `[data-document-id="${document.id}"]` });
    state.dialogFocusSelector = '[data-action="cancel-confirmation"]';
    render();
  }
}

async function duplicateDocument(document) {
  await act(async () => {
    const payload = await api.getDocument(document.id);
    const model = restoreDocumentModel(payload);
    try {
      const created = await api.createDocument({ title: `Copy of ${document.title}`, folderId: document.folderId, source: materialize(model), initialUpdate: encodeState(model) });
      upsertDocumentSummary(created);
    } finally { model.doc.destroy(); }
    render();
  });
}

async function openFolderContextMenu(folder) {
  const folders = await loadFolderTree();
  const action = await runtime.contextMenu.show([
    { id: "open", label: "Open" },
    ...(folder.access === "owner" ? [
      { id: "rename", label: "Rename" },
      { type: "submenu", label: "Move to", items: [
        { id: "move:root", label: "All Designs", enabled: folder.parentId !== null },
        { type: "separator" },
        ...folderMoveMenu(folders, folder.parentId, new Set(folderTreeIds(folders, folder.id))),
      ] },
      { id: "share", label: "Share" },
      { type: "separator" },
      { id: "trash", label: "Move to Trash", destructive: true },
    ] : []),
  ]);
  if (!action) return;
  if (action === "open") return navigateToFolder(folder.id);
  if (action === "rename") {
    state.dialog = { kind: "folder-form", mode: "rename", folderId: folder.id, name: folder.name };
    state.dialogFocusSelector = '[data-role="folder-name"]';
    return render();
  }
  if (action.startsWith("move:")) {
    const parentId = action === "move:root" ? null : action.slice(5);
    return act(async () => {
      const moved = await api.updateFolder(folder.id, { parentId });
      upsertFolderSummary(moved);
      render();
    });
  }
  if (action === "share") return openShare({ type: "folder", id: folder.id, name: folder.name });
  if (action === "trash") {
    state.dialog = { kind: "confirm-trash-folder", folderId: folder.id, name: folder.name };
    state.dialogFocusSelector = '[data-action="cancel-folder-trash"]';
    render();
  }
}

function loadFolderTree() {
  if (state.folderTree) return Promise.resolve(state.folderTree);
  if (state.folderTreeRefresh) return state.folderTreeRefresh;
  const refresh = loadFolderTreeBranch().then((folders) => {
    state.folderTree = folders;
    return folders;
  }).finally(() => {
    if (state.folderTreeRefresh === refresh) state.folderTreeRefresh = null;
  });
  state.folderTreeRefresh = refresh;
  return refresh;
}

async function loadFolderTreeBranch(parentId = null) {
  const folders = await loadEveryFolderPage(parentId === null ? { view: "roots" } : { view: "children", parentId });
  return Promise.all(folders.map(async (folder) => ({ ...folder, children: await loadFolderTreeBranch(folder.id) })));
}

function folderMoveMenu(folders, selectedId, excluded = new Set()) {
  return folders.filter((folder) => !excluded.has(folder.id)).map((folder) => ({
    type: "submenu",
    label: folder.name,
    items: [
      { id: `move:${folder.id}`, label: "Move here", enabled: folder.id !== selectedId },
      ...(folder.children.length ? [{ type: "separator" }, ...folderMoveMenu(folder.children, selectedId, excluded)] : []),
    ],
  }));
}

function folderTreeIds(folders, targetId) {
  for (const folder of folders) {
    if (folder.id === targetId) return [folder.id, ...flattenFolderIds(folder.children)];
    const nested = folderTreeIds(folder.children, targetId);
    if (nested.length) return nested;
  }
  return [];
}

function flattenFolderIds(folders) {
  return folders.flatMap((folder) => [folder.id, ...flattenFolderIds(folder.children)]);
}

async function refreshCurrentCollection() {
  if (state.route === "folder" && state.currentFolder) return refreshFolderCollection(state.currentFolder.id);
  await Promise.all([
    refreshLibraryFolders(),
    documentCollectionLifecycle.refresh(),
  ]);
}

function bindEditor() {
  root.querySelector('[data-action="back"]')?.addEventListener("click", () => void (state.currentFolder ? navigateToFolder(state.currentFolder.id) : navigateToLibrary()));
  if (state.accessRemoved) return;
  root.querySelector('[data-action="undo"]')?.addEventListener("click", undo);
  root.querySelector('[data-action="redo"]')?.addEventListener("click", redo);
  root.querySelector('[data-action="toggle-layers"]')?.addEventListener("click", () => {
    state.layersOpen = !state.layersOpen;
    syncPanelVisibility();
    if (state.layersOpen) {
      renderLayersTree();
      scrollSelectedLayerIntoView();
    }
  });
  root.querySelector('[data-action="toggle-inspector"]')?.addEventListener("click", () => {
    state.inspectorOpen = !state.inspectorOpen;
    syncPanelVisibility();
    if (state.inspectorOpen) renderSelection();
  });
  root.querySelectorAll("[data-asset-panel]").forEach((button) => button.addEventListener("click", () => {
    state.assetPanel = button.dataset.assetPanel;
    render();
  }));
  root.querySelectorAll("[data-inspector-tab]").forEach((button) => button.addEventListener("click", () => {
    state.inspectorTab = button.dataset.inspectorTab;
    render();
  }));
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
  root.querySelector('[data-action="share"]')?.addEventListener("click", () => void openShare({ type: "document", id: state.document.id, name: state.document.title }));
  root.querySelector('[data-action="document-switcher"]')?.addEventListener("click", () => void (async () => {
    const items = state.editorDocuments.map((document) => ({
      id: `open:${document.id}`,
      label: document.title,
      checked: document.id === state.document.id,
    }));
    state.documentSwitcherOpen = true;
    render();
    try {
      const action = await runtime.contextMenu.show(items);
      if (action?.startsWith("open:") && action.slice(5) !== state.document.id) await navigateToDocument(action.slice(5));
    } finally {
      if (state.route === "editor") {
        state.documentSwitcherOpen = false;
        render();
      }
    }
  })());
  root.querySelector('[data-action="compatibility"]')?.addEventListener("click", () => openDialog("compatibility", '[data-action="compatibility"]'));
  root.querySelector('[data-action="menu"]')?.addEventListener("click", () => void openDocumentContextMenu({ ...state.document, folderId: state.document.folderId ?? null }));
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
  const tree = currentLayersTree();
  if (!tree || tree.dataset.bound === "true") return;
  tree.dataset.bound = "true";
  tree.addEventListener("click", (event) => {
    const element = event.target.closest("[data-node-id]");
    if (!element) return;
    event.stopPropagation();
    if (event.target.closest('[data-action="toggle-layer"]')) {
      const nodeId = element.dataset.nodeId;
      if (state.expandedLayerIds.has(nodeId)) state.expandedLayerIds.delete(nodeId);
      else state.expandedLayerIds.add(nodeId);
      renderLayersTree();
      return;
    }
    selectNode(element.dataset.nodeId, { openInspector: innerWidth < 960 });
  });
  tree.addEventListener("dblclick", (event) => {
    if (event.target.closest('[data-action="toggle-layer"]')) return;
    const element = event.target.closest("[data-node-id]");
    if (!element) return;
    event.stopPropagation();
    const nodeId = element.dataset.nodeId;
    selectNode(nodeId, { focus: true });
  });
  tree.addEventListener("keydown", (event) => {
    const element = event.target.closest("[data-node-id]");
    if (!element) return;
    if (event.key === "Enter") {
      event.preventDefault();
      selectNode(element.dataset.nodeId, { openInspector: innerWidth < 960 });
      beginSelectedTextEditing({
        editor: state.engineSurface?.editor,
        selection: currentCanvasSelection(),
      });
      return;
    }
    if (event.key === " ") {
      event.preventDefault();
      selectNode(element.dataset.nodeId, { openInspector: innerWidth < 960 });
      return;
    }
    if (event.key === "ArrowRight" && element.getAttribute("aria-expanded") === "false") {
      event.preventDefault();
      state.expandedLayerIds.add(element.dataset.nodeId);
      renderLayersTree();
      currentLayersTree()?.querySelector(`[data-node-id="${CSS.escape(element.dataset.nodeId)}"]`)?.focus();
      return;
    }
    if (event.key === "ArrowLeft" && element.getAttribute("aria-expanded") === "true") {
      event.preventDefault();
      state.expandedLayerIds.delete(element.dataset.nodeId);
      renderLayersTree();
      currentLayersTree()?.querySelector(`[data-node-id="${CSS.escape(element.dataset.nodeId)}"]`)?.focus();
    }
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
  root.querySelector('[data-action="convert-svg-vectors"]')?.addEventListener("click", () => {
    convertSelectedSvgToVectors();
  });
}

function convertSelectedSvgToVectors() {
  const selection = currentCanvasSelection();
  if (!selection?.effectiveNode || selection.isInstanceDescendant) return;
  try {
    const candidate = inspectSvgVectorCandidate(selection.effectiveNode, state.assets);
    if (!candidate) throw new Error("The selected object is not a loaded SVG image.");
    const entries = currentDocumentNodes();
    const sourceEntry = entries.find(({ node }) => node.id === selection.referenceId);
    if (!sourceEntry) throw new Error("The selected SVG is no longer in this document.");
    const usedIds = new Set(entries.map(({ node }) => node.id));
    const base = `${sourceEntry.node.id}-editable`;
    let createdId = base;
    let suffix = 1;
    while (usedIds.has(createdId)) createdId = `${base}-${++suffix}`;
    const converted = convertSvgAssetToCanvasNode({
      sourceNode: sourceEntry.node,
      asset: candidate.asset,
      createdId,
      usedIds,
    });
    converted.x = Number(converted.x ?? 0) + 24;
    converted.y = Number(converted.y ?? 0) + 24;
    mutate(state.model, {
      kind: "insert-node",
      node: converted,
      parentId: sourceEntry.parentId,
      position: sourceEntry.index + 1,
    }, LOCAL_ORIGIN);
    queueMicrotask(() => selectNode(createdId));
    showTransientToast(`Created ${converted.children.length} editable vector shape${converted.children.length === 1 ? "" : "s"}`);
  } catch (error) {
    showTransientToast(message(error), true);
  }
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
      throw new Error("The selected visual does not have a stable node address.");
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
  state.documentUnsubscribe?.();
  state.documentUnsubscribe = null;
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
    state.engineSurface.undo();
  } else state.undo?.undo();
  renderHistoryControls();
}

function redo() {
  if (state.engineSurface) state.engineSurface.redo();
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
  if (
    event.key === "Enter"
    && !event.shiftKey
    && !event.altKey
    && !command
    && beginSelectedTextEditing({
      editor: state.engineSurface?.editor,
      selection: currentCanvasSelection(),
    })
  ) {
    event.preventDefault();
    return;
  }
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
  if (expandSelectedLayerAncestors(nodeId)) renderLayersTree();
  renderSelection();
  scrollSelectedLayerIntoView();
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

async function openShare(target = null) {
  state.shareTarget = target ?? { type: "document", id: state.document.id, name: state.document.title };
  state.dialogReturnFocusSelector = '[data-action="share"]';
  state.dialog = "share";
  state.dialogFocusSelector = '[data-role="share-email"]';
  render();
  await act(async () => {
    state.grants = await loadShareGrants(state.shareTarget);
    render();
  });
}

async function loadShareGrants(target) {
  if (target.type === "folder") return (await api.listFolderGrants(target.id)).items;
  const direct = (await api.listGrants(target.id)).items;
  const combined = [...direct];
  const seen = new Set(direct.map(sharePersonKey));
  let folder = state.document?.folderId ? await api.openFolder(state.document.folderId) : null;
  while (folder) {
    try {
      const inherited = (await api.listFolderGrants(folder.id)).items;
      for (const grant of inherited) {
        const key = sharePersonKey(grant);
        if (grant.isCurrentUser || seen.has(key)) continue;
        seen.add(key);
        combined.push({ ...grant, inheritedFrom: folder.name });
      }
    } catch (error) {
      console.warn(`Canvas could not load inherited access from folder ${folder.id}.`, error);
    }
    folder = folder.parentId ? await api.openFolder(folder.parentId) : null;
  }
  return combined;
}

function sharePersonKey(person) {
  return person.accountId ?? person.email ?? person.id;
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
  if (state.dialog.kind === "folder-form") {
    const creating = state.dialog.mode === "create";
    return dialog(
      creating ? "New folder" : "Rename folder",
      `<div class="field-row"><label for="folder-name">Name</label><input id="folder-name" class="field" data-role="folder-name" value="${escapeHtml(state.dialog.name ?? "")}" /></div>`,
      `<button class="button" data-action="cancel-folder-form">Cancel</button><button class="button primary" data-action="save-folder">${creating ? "Create" : "Rename"}</button>`,
    );
  }
  if (state.dialog.kind === "new-design") {
    const selectedFolderId = state.route === "folder" ? state.currentFolder?.id ?? "" : "";
    const availableFolders = state.currentFolder && !state.folders.some((folder) => folder.id === state.currentFolder.id)
      ? [...state.folders, state.currentFolder]
      : state.folders;
    const folderOptions = availableFolders.map((folder) => `<option value="${escapeHtml(folder.id)}" ${folder.id === selectedFolderId ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("");
    return dialog(
      "New design",
      `<p class="dialog-intro">Choose what you’re making. Only Generic can change later.</p><div class="module-picker" role="radiogroup" aria-label="Design type">${moduleChoice("generic", "Generic", "frame", "Free canvas for flyers, social, print, anything.")}${moduleChoice("deck", "Deck", "deck", "Slides with a fixed 16:9 stage.", true)}${moduleChoice("web", "Web", "web", "Responsive routes and sections.")}${moduleChoice("mobile", "Mobile", "mobile", "Phone-sized screens and flows.")}</div><div class="design-fields"><div class="field-row"><label for="design-name">Name</label><input id="design-name" class="field" data-role="design-name" value="Untitled" /></div><div class="field-row"><label for="design-folder">Save in</label><select id="design-folder" class="field" data-role="design-folder"><option value="">All designs</option>${folderOptions}</select></div></div>`,
      `<button class="button" data-action="cancel-new-design">Cancel</button><button class="button primary" data-action="create-design">${icon("plus")}Create deck</button>`,
    );
  }
  if (state.dialog.kind === "confirm-trash-folder") {
    return dialog(
      `Move “${state.dialog.name}” to Trash?`,
      `<p>The folder, its nested folders, and its designs will move to Trash together. They can be restored for 30 days.</p>`,
      `<button class="button" data-action="cancel-folder-trash">Cancel</button><button class="button danger" data-action="confirm-folder-trash">Move to Trash</button>`,
    );
  }
  if (state.dialog.kind === "confirm-permanently-delete-folder") {
    return dialog(
      `Permanently delete “${state.dialog.name}”?`,
      `<p>This deletes the folder, its nested folders, and every document you own inside it. It cannot be undone.</p>`,
      `<button class="button" data-action="cancel-folder-delete">Cancel</button><button class="button danger" data-action="confirm-folder-delete">Delete permanently</button>`,
    );
  }
  if (state.dialog === "menu") {
    return dialog("Document actions", `<div class="grant-list">${state.document?.access === "owner" ? `<button class="button danger" data-action="trash-document">Move to Trash</button>` : ""}</div>`);
  }
  if (state.dialog === "compatibility") {
    return dialog("Compatibility review", `<p class="muted">Canvas preserves the original design data. The objects below are not represented faithfully by the current renderer and are not silently rewritten.</p><div class="grant-list">${state.compatibilityIssues.map((issue) => `<div class="grant-row"><div><strong>${escapeHtml(issue.nodeId)}</strong><span>${escapeHtml(issue.message)}</span></div></div>`).join("") || `<p>No known unsupported visual behavior.</p>`}</div>`);
  }
  if (state.dialog === "share") {
    const targetName = state.shareTarget?.name ?? "item";
    return `<div class="modal-backdrop share-backdrop"><section class="dialog share-dialog" role="dialog" aria-modal="true" aria-label="Share ${escapeHtml(targetName)}">
      <header class="share-dialog-head"><div><h2>Share</h2><p>${escapeHtml(targetName)}</p></div><button class="icon-button" data-action="close-dialog" aria-label="Close">${icon("close")}</button></header>
      ${renderShareInvite()}
      <footer class="share-dialog-footer"><button class="button" data-action="close-dialog">Done</button></footer>
    </section></div>`;
  }
  return "";
}

function renderShareInvite() {
  const owner = state.currentProfile ? { ...state.currentProfile, isOwner: true, isCurrentUser: true } : null;
  const people = [owner, ...state.grants].filter(Boolean);
  return `<div class="share-dialog-body"><div class="share-form"><div class="share-email-control">${icon("mail")}<input data-role="share-email" type="email" placeholder="Email address" aria-label="Collaborator email" /></div><button class="button primary" data-action="grant">Invite</button></div><div class="share-people"><div class="share-people-heading"><strong>People with access</strong><span>${people.length + 1}</span></div>${people.map(sharePersonRow).join("")}<div class="share-person-row"><span class="avatar avatar-fallback share-agent-avatar">A</span><div class="share-person-copy"><strong>Agent</strong><span>Penkra Agent · works in this Thread</span></div></div></div></div>`;
}

function sharePersonRow(person) {
  const name = person.isCurrentUser ? "You" : person.name?.trim() || person.email;
  const detail = person.email ?? (person.isOwner ? "Owner" : person.status === "pending" ? "Pending invitation" : "Editor");
  const inherited = person.inheritedFrom ? `<span class="share-inherited">via ${escapeHtml(person.inheritedFrom)}</span>` : "";
  return `<div class="share-person-row">${avatar(person)}<div class="share-person-copy"><div class="share-person-name"><strong>${escapeHtml(name)}</strong>${inherited}</div><span>${escapeHtml(detail)}</span></div>${person.isOwner ? `<span class="share-access-label">Owner</span>` : person.inheritedFrom ? "" : `<button class="share-remove" data-revoke-grant="${escapeHtml(person.id)}">Remove</button>`}</div>`;
}

function bindFolderDialogs() {
  root.querySelectorAll('[data-role="design-module"]').forEach((control) => control.addEventListener("change", () => {
    const create = root.querySelector('[data-action="create-design"]');
    if (create) create.innerHTML = `${icon("plus")}Create ${moduleLabel(control.value).toLowerCase()}`;
  }));
  root.querySelector('[data-action="cancel-new-design"]')?.addEventListener("click", closeDialog);
  root.querySelector('[data-action="create-design"]')?.addEventListener("click", () => void act(async () => {
    const title = root.querySelector('[data-role="design-name"]')?.value.trim();
    const module = root.querySelector('[data-role="design-module"]:checked')?.value;
    const folderId = root.querySelector('[data-role="design-folder"]')?.value ?? undefined;
    if (!title || !["generic", "deck", "web", "mobile"].includes(module)) return;
    state.dialog = null;
    await createBlankDocument(title, module, folderId);
  }));
  root.querySelector('[data-action="cancel-folder-form"]')?.addEventListener("click", closeDialog);
  root.querySelector('[data-action="save-folder"]')?.addEventListener("click", () => void act(async () => {
    const name = root.querySelector('[data-role="folder-name"]')?.value.trim();
    if (!name) return;
    const form = state.dialog;
    state.dialog = null;
    render();
    const folder = form.mode === "create"
      ? await api.createFolder(name, state.route === "folder" ? state.currentFolder?.id ?? null : null)
      : await api.updateFolder(form.folderId, { name });
    upsertFolderSummary(folder);
    render();
  }));
  root.querySelector('[data-action="cancel-folder-trash"]')?.addEventListener("click", closeDialog);
  root.querySelector('[data-action="confirm-folder-trash"]')?.addEventListener("click", () => void act(async () => {
    const folderId = state.dialog.folderId;
    const parentId = knownFolder(folderId)?.parentId ?? null;
    state.dialog = null;
    render();
    await api.deleteFolder(folderId);
    removeFolderSummary(folderId);
    if (state.currentFolder?.id === folderId) {
      await (parentId ? navigateToFolder(parentId) : navigateToLibrary());
    } else render();
  }));
  root.querySelector('[data-action="cancel-folder-delete"]')?.addEventListener("click", closeDialog);
  root.querySelector('[data-action="confirm-folder-delete"]')?.addEventListener("click", () => void act(async () => {
    const folderId = state.dialog.folderId;
    state.dialog = null;
    await api.permanentlyDeleteFolder(folderId);
    state.trashedFolders = state.trashedFolders.filter((item) => item.id !== folderId);
    render();
  }));
  root.querySelector('[data-action="grant"]')?.addEventListener("click", () => void act(async () => {
    const email = root.querySelector('[data-role="share-email"]')?.value.trim();
    if (!email || !state.shareTarget) return;
    if (state.shareTarget.type === "folder") await api.grantFolderAccess(state.shareTarget.id, email);
    else await api.grantAccess(state.shareTarget.id, email);
    state.grants = await loadShareGrants(state.shareTarget);
    render();
  }));
  root.querySelectorAll("[data-revoke-grant]").forEach((button) => button.addEventListener("click", () => void act(async () => {
    if (!state.shareTarget) return;
    if (state.shareTarget.type === "folder") await api.revokeFolderGrant(state.shareTarget.id, button.dataset.revokeGrant);
    else await api.revokeGrant(state.shareTarget.id, button.dataset.revokeGrant);
    state.grants = await loadShareGrants(state.shareTarget);
    render();
  })));
}

function dialog(title, body, actions = '<button class="button" data-action="close-dialog">Done</button>') {
  return `<div class="modal-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}"><header class="dialog-head"><h2>${escapeHtml(title)}</h2><button class="icon-button" data-action="close-dialog" aria-label="Close">${icon("close")}</button></header><div class="dialog-body">${body}</div><footer class="dialog-actions">${actions}</footer></section></div>`;
}

function moduleChoice(value, label, iconName, description, checked = false) {
  return `<label class="module-choice"><input type="radio" name="design-module" data-role="design-module" value="${value}" ${checked ? "checked" : ""} /><span><span class="module-choice-top"><i>${icon(iconName)}</i><i class="module-radio">${icon("check")}</i></span><strong>${label}</strong><small>${escapeHtml(description)}</small></span></label>`;
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
        removeDocumentSummary(confirmation.documentId);
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
    folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
    "folder-plus": '<path d="M3 7h7l2 2h9v10H3z"/><path d="M12 12v5M9.5 14.5h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    pencil: '<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14 7 3 3"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".7"/><circle cx="4" cy="12" r=".7"/><circle cx="4" cy="18" r=".7"/>',
    canvas: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 15 11 9l2 4 2-2 2 4"/>',
    deck: '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h5"/>',
    web: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M7 7h.01M10 7h.01"/>',
    mobile: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 6h4M11 18h2"/>',
    home: '<path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
    "person-plus": '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-4 2-6 6-6s6 2 6 6M18 8v6M15 11h6"/>',
    "panel-left": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
    "panel-right": '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/>',
    check: '<path d="m7 12 3 3 7-7"/>',
    hand: '<path d="M7.5 11V6.5a1.5 1.5 0 0 1 3 0V10 5.5a1.5 1.5 0 0 1 3 0V10 7a1.5 1.5 0 0 1 3 0v4-2a1.5 1.5 0 0 1 3 0v5.5c0 4-2.5 6.5-6.5 6.5h-1.2a6 6 0 0 1-4.8-2.4L4.3 15a1.6 1.6 0 0 1 2.4-2.1L9 15"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m4 7 8 6 8-6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5"/><path d="M5 20h14"/>',
    more: '<circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.9-4M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.9 4M20 20v-5h-5"/>',
    redo: '<path d="M18 8v5h-5"/><path d="M18 13a7 7 0 1 0-1.7 4.6"/>',
    rectangle: '<rect x="5" y="7" width="14" height="10" rx="1"/>',
    text: '<path d="M5 6h14M12 6v12M8 18h8"/>',
    undo: '<path d="M6 8v5h5"/><path d="M6 13a7 7 0 1 1 1.7 4.6"/>',
    type: '<path d="M5 6h14M12 6v12M8 18h8"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 17 4-4 3 3 2-2 5 3"/>',
    component: '<rect x="5" y="5" width="6" height="6" rx="1"/><rect x="13" y="5" width="6" height="6" rx="1"/><rect x="5" y="13" width="6" height="6" rx="1"/><rect x="13" y="13" width="6" height="6" rx="1"/>',
    "layout-list": '<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 13h8M8 17h5"/>',
    square: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
    lock: '<rect x="6" y="10" width="12" height="10" rx="2"/><path d="M9 10V7a3 3 0 0 1 6 0v3"/>',
    "eye-off": '<path d="m3 3 18 18M10.5 10.7a2 2 0 0 0 2.8 2.8M9.9 4.2A10.7 10.7 0 0 1 21 12a11.8 11.8 0 0 1-2.1 3.3M6.6 6.6A11.5 11.5 0 0 0 3 12s3.3 6 9 6a9.8 9.8 0 0 0 3.4-.6"/>',
  };
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] ?? paths.file}</svg>`;
}
