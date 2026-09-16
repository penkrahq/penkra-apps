import { createCanvasApi } from "./canvas-api.mjs";
import { documentCardPeople, folderCardPeople } from "./card-people.mjs";
import { actionButtonState } from "./interaction-state.mjs";
import { initials, naviiAvatarUrl, profileLabel, shareAccessPeople } from "./share-people.mjs";
import { readCollectionCache, writeCollectionCache } from "./collection-cache.mjs";
import {
  createFolderForDocument,
  folderCreationParentId,
  nestedFolderForm,
} from "./folder-actions.mjs";
import { createBlankDocumentSource } from "./blank-document.mjs";
import { createDocumentCollectionLifecycle } from "./document-collection-lifecycle.mjs";
import { createDocumentAssetCache } from "./document-asset-cache.mjs";
import { hasUnloadedDocumentImages, hydrateDocumentAssets } from "./document-assets.mjs";
import { migrateLegacyOfflineCache } from "./legacy-offline-cache.mjs";
import { createPendingUpdateQueue } from "./pending-update-queue.mjs";
import { createSnapshotMaintenance } from "./snapshot-maintenance.mjs";
import { createRouteCoordinator } from "./route-coordinator.mjs";
import { activateLibraryTab } from "./library-navigation.mjs";
import { runCurrentBackgroundTasks } from "./current-background-tasks.mjs";
import { COLLECTION_SORT_OPTIONS, searchableDocumentText, sortCollection } from "./library-presentation.mjs";
import { trashSummary } from "./trash-summary.mjs";
import { createVisibleDocumentRestore } from "./visible-document-restore.mjs";
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
  applyIncrementalDocumentPayload,
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
const documentAssetCache = createDocumentAssetCache(2);
const pendingUpdateQueue = createPendingUpdateQueue();
configureCanvasFonts(runtime, { performanceMonitor });
const state = {
  route: "library",
  libraryFilter: "recent",
  search: "",
  searchScope: "everywhere",
  searchDocumentText: new Map(),
  searchGeneration: 0,
  searchTimer: null,
  searchRenderTimer: null,
  searchLoading: false,
  searchTrashGeneration: 0,
  searchTrashMatchingCount: null,
  searchTrashFailed: false,
  collectionView: "grid",
  collectionSort: "updated",
  documents: [],
  folders: [],
  recentFolders: [],
  currentFolder: null,
  activeFolderId: null,
  folderDocuments: [],
  folderChildren: [],
  libraryLoaded: false,
  libraryActive: false,
  libraryFolderRefresh: null,
  folderCollections: new Map(),
  folderRefreshes: new Map(),
  folderTree: null,
  folderTreeRefresh: null,
  folderGrants: new Map(),
  editorDocuments: [],
  thumbnails: new Map(),
  currentProfile: null,
  shareLoading: false,
  trashItems: [],
  trashTotalCount: 0,
  trashMatchingCount: 0,
  trashExpiringSoonCount: 0,
  trashNextCursor: null,
  trashLoadingMore: false,
  trashSearchTimer: null,
  trashLoaded: false,
  shellReady: false,
  loading: true,
  fatalError: false,
  collectionCacheAccountId: null,
  collectionCacheQueued: false,
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
  documentSwitcherOpen: false,
  documentUnsubscribe: null,
  folderUnsubscribe: null,
  updateListener: null,
  lastSequence: 0,
  lastCatchUpSequence: 0,
  catchUpAfterOpen: false,
  updatesSinceSnapshot: 0,
  deferredSnapshotUpdates: 0,
  flushing: false,
  reconciling: null,
  pendingUpdates: [],
  localUpdateSequences: new Map(),
  incrementalEngineUpdate: false,
  undo: null,
  fieldDrafts: new Map(),
  fieldErrors: new Map(),
  accessRemoved: false,
  documentUnavailable: null,
  activeTool: "select",
  spacePressed: false,
  engineSurface: null,
  enginePreparation: null,
  engineMountGeneration: 0,
  engineViewport: null,
  engineReady: false,
  appTabActive: false,
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
  layerSearch: "",
  layerSearchOpen: false,
  inspectorTab: "design",
  documentOpenStartedAt: null,
};

const snapshotMaintenance = createSnapshotMaintenance({
  canRun: (documentId) => (
    state.document?.id === documentId
    && Boolean(state.model)
    && navigator.onLine
    && state.pendingUpdates.length === 0
    && state.updatesSinceSnapshot >= 10
  ),
  createPayload: (documentId) => {
    const throughSequence = state.lastSequence;
    const coveredUpdates = state.updatesSinceSnapshot;
    const snapshotState = performanceMonitor.measure(
      "snapshot.state-encode",
      () => encodeState(state.model),
      { documentId, throughSequence },
    );
    const source = performanceMonitor.measure(
      "snapshot.projection",
      () => currentMaterializedDocument(),
      { documentId, throughSequence },
    );
    performanceMonitor.record("snapshot.payload", 0, {
      documentId,
      throughSequence,
      stateCharacters: snapshotState.length,
      projectionBytes: new TextEncoder().encode(JSON.stringify(source)).byteLength,
    });
    return { throughSequence, coveredUpdates, state: snapshotState, source };
  },
  upload: (documentId, payload) => performanceMonitor.measureAsync(
    "snapshot.upload",
    () => api.createSnapshot(documentId, {
      throughSequence: payload.throughSequence,
      state: payload.state,
      source: payload.source,
    }),
    { documentId, throughSequence: payload.throughSequence },
  ),
  onSuccess: (documentId, payload) => {
    if (state.document?.id !== documentId) return;
    state.updatesSinceSnapshot = Math.max(
      0,
      state.updatesSinceSnapshot - payload.coveredUpdates,
    );
  },
  onFailure: (error, { willRetry }) => {
    performanceMonitor.record("snapshot.failed", 0, {
      documentId: state.document?.id ?? null,
      status: error?.status ?? null,
      code: error?.code ?? null,
      requestId: error?.requestId ?? null,
      willRetry,
      error: message(error),
    });
    console.warn("Canvas could not refresh its maintenance snapshot.", error);
  },
  onAccessRemoved: () => handleAccessRemoved(),
});

const visibleDocumentRestore = createVisibleDocumentRestore({
  openDocument,
  onQueued: (documentId) => {
    const knownDocument = state.documents.find((document) => document.id === documentId);
    closeDocument();
    state.route = "editor";
    state.document = {
      id: documentId,
      title: knownDocument?.title ?? "Canvas",
      module: knownDocument?.module ?? "generic",
      folderId: knownDocument?.folderId ?? null,
    };
    state.currentFolder = state.document.folderId ? knownFolder(state.document.folderId) : null;
    state.loading = true;
    state.fatalError = false;
    state.error = null;
    render();
  },
  onError: (error) => console.warn("Canvas could not restore its document route.", error),
});

const routes = createRouteCoordinator({
  isDocumentOpen: (documentId) => state.document?.id === documentId,
  openDocument,
  restoreDocument: (documentId) => visibleDocumentRestore.restore(documentId),
  onRouteError: (error) => console.warn("Canvas could not persist its current route.", error),
  setRoute: (input) => runtime.tab.setRoute(input),
  showDocumentUnavailable,
  showFolder,
  showLibrary,
  showTrash,
});

runtime.tab.onNavigate((input) => routes.handleHostNavigation(input));
const releaseTabVisibility = runtime.tab.onVisibilityChange(({ active }) => {
  state.appTabActive = active;
  visibleDocumentRestore.setActive(active);
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
      state.fatalError = true;
      state.error = "Sign in to your Penkra Account to use Canvas.";
      render();
      return;
    }
    restoreCollectionCache(identity.subject);
    state.currentProfile = await runtime.account.profile();
    state.shellReady = true;
    await routes.showDefaultLibrary();
  } catch (error) {
    state.loading = false;
    state.fatalError = true;
    state.error = message(error);
    render();
  }
}

async function showLibrary() {
  if (state.route === "library" && state.libraryActive) return;
  visibleDocumentRestore.cancel();
  closeDocument();
  state.currentFolder = null;
  state.activeFolderId = null;
  state.route = "library";
  state.loading = false;
  state.fatalError = false;
  state.error = null;
  state.libraryActive = true;
  render();
  startFolderSubscription();
  const folders = refreshLibraryFolders();
  const documents = documentCollectionLifecycle.start({
    load: () => loadEveryDocumentPage(api.listDocuments),
    apply: (documents) => {
      if (state.route !== "library") return;
      state.documents = documents.map(withModule);
      persistCollectionCache();
      state.error = null;
      if (state.libraryLoaded) render();
      void loadDocumentThumbnails(state.documents).then(() => {
        if (state.route === "library") render();
      });
    },
    onError: handleDocumentCollectionError,
  });
  void Promise.all([folders, documents]).then(() => {
    if (state.route !== "library") return;
    state.libraryLoaded = true;
    render();
  }).catch((error) => handleDocumentCollectionError(error, { phase: "load" }));
}

async function showFolder(folderId) {
  visibleDocumentRestore.cancel();
  closeDocument();
  state.route = "folder";
  state.activeFolderId = folderId;
  state.fatalError = false;
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
  void Promise.all([
    opened.then((folder) => {
      const cachedCollection = state.folderCollections.get(folderId);
      if (cachedCollection) state.folderCollections.set(folderId, { ...cachedCollection, folder });
      if (state.route === "folder" && state.activeFolderId === folderId) {
        state.currentFolder = folder;
        state.loading = false;
        render();
      }
    }),
    refreshFolderCollection(folderId, { folderRequest: opened }),
  ]).catch((error) => handleDocumentCollectionError(error, { phase: "load" }));
}

function knownFolder(folderId) {
  return [state.currentFolder, ...state.folders, ...state.recentFolders, ...state.folderChildren]
    .find((folder) => folder?.id === folderId) ?? null;
}

function refreshLibraryFolders() {
  if (state.libraryFolderRefresh) return state.libraryFolderRefresh;
  const roots = loadEveryFolderPage({ view: "roots" }).then((items) => {
    state.folders = items;
    persistCollectionCache();
    if (state.route === "library" && state.libraryLoaded) render();
  });
  const recent = loadEveryFolderPage({ view: "recent", limit: 10 }).then((items) => {
    state.recentFolders = items.slice(0, 10);
    persistCollectionCache();
    if (state.route === "library" && state.libraryLoaded) render();
  });
  const refresh = Promise.all([roots, recent]).then(() => {
    if (state.route !== "library" || !state.libraryActive) return;
    void loadFolderGrants([...state.folders, ...state.recentFolders]).then(() => {
      if (state.route === "library") render();
    });
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
    persistCollectionCache();
    if (state.route !== "folder" || state.activeFolderId !== folderId) return;
    state.currentFolder = collection.folder;
    state.folderChildren = collection.children;
    state.folderDocuments = collection.documents;
    state.loading = false;
    state.error = null;
    render();
    void loadFolderGrants([folder, ...children]).then(() => {
      if (state.route === "folder" && state.activeFolderId === folderId) render();
    });
    void loadDocumentThumbnails(collection.documents).then(() => {
      if (state.route === "folder" && state.activeFolderId === folderId) render();
    });
  }).catch((error) => {
    if (state.route === "folder" && state.activeFolderId === folderId) {
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
  if (state.route !== "library" && state.route !== "folder") return;
  const unique = [...new Map(folders.map((folder) => [folder.id, folder])).values()]
    .filter((folder) => folder.access === "owner" && !state.folderGrants.has(folder.id))
    .slice(0, 20);
  const route = state.route;
  const folderId = state.activeFolderId;
  const isCurrent = () => state.route === route && state.activeFolderId === folderId;
  await runCurrentBackgroundTasks(unique, async (folder) => {
    if (!isCurrent()) return;
    try {
      const grants = await api.listFolderGrants(folder.id);
      if (isCurrent()) {
        state.folderGrants.set(folder.id, grants.items.filter((grant) => grant.status === "active" && !grant.isCurrentUser));
      }
    } catch (error) {
      console.warn(`Canvas could not load collaborators for folder ${folder.id}.`, error);
    }
  }, { concurrency: 2, isCurrent });
}

function withModule(document) {
  return { ...document, module: document.projection?.module ?? null };
}

function restoreCollectionCache(accountId) {
  state.collectionCacheAccountId = accountId;
  const cached = readCollectionCache(globalThis.localStorage, accountId);
  if (!cached) return;
  state.documents = cached.documents.map(withModule);
  state.folders = cached.folders;
  state.recentFolders = cached.recentFolders;
  state.folderCollections = cached.folderCollections;
  state.libraryLoaded = true;
}

function persistCollectionCache() {
  if (!state.collectionCacheAccountId || state.collectionCacheQueued) return;
  state.collectionCacheQueued = true;
  queueMicrotask(() => {
    state.collectionCacheQueued = false;
    try {
      writeCollectionCache(globalThis.localStorage, state.collectionCacheAccountId, {
        documents: state.documents,
        folders: state.folders,
        recentFolders: state.recentFolders,
        folderCollections: state.folderCollections,
      });
    } catch (error) {
      console.warn("Canvas could not cache collection summaries.", error);
    }
  });
}

function knownDocument(documentId) {
  return [...state.documents, ...state.folderDocuments, ...state.trashItems.filter((item) => item.kind === "document")]
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
  persistCollectionCache();
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
  persistCollectionCache();
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
  if (oldFolderId === normalized.folderId) {
    persistCollectionCache();
    return;
  }
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
  persistCollectionCache();
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
  persistCollectionCache();
}

function invalidateFolderTree() {
  state.folderTree = null;
}

async function showTrash() {
  visibleDocumentRestore.cancel();
  closeDocument();
  state.currentFolder = null;
  state.activeFolderId = null;
  state.route = "trash";
  state.loading = false;
  state.fatalError = false;
  state.error = null;
  state.trashLoaded = false;
  state.trashItems = [];
  state.trashNextCursor = null;
  render();
  const documents = documentCollectionLifecycle.start({
    load: () => api.listTrashItems(null, { query: state.search.trim() }),
    apply: (result) => {
      if (state.route !== "trash") return;
      state.trashItems = result.items;
      state.trashTotalCount = result.totalCount;
      state.trashMatchingCount = result.matchingCount;
      state.trashExpiringSoonCount = result.expiringSoonCount;
      state.trashNextCursor = result.pageInfo.nextCursor;
      state.loading = false;
      state.trashLoaded = true;
      state.error = null;
      render();
    },
    onError: handleDocumentCollectionError,
  });
  startFolderSubscription();
  void documents.catch((error) => handleDocumentCollectionError(error, { phase: "load" }));
}

async function loadMoreTrash() {
  if (!state.trashNextCursor || state.trashLoadingMore) return;
  state.trashLoadingMore = true;
  render();
  try {
    const result = await api.listTrashItems(state.trashNextCursor, { query: state.search.trim() });
    if (state.route !== "trash") return;
    const known = new Set(state.trashItems.map((item) => `${item.kind}:${item.id}`));
    state.trashItems.push(...result.items.filter((item) => !known.has(`${item.kind}:${item.id}`)));
    state.trashNextCursor = result.pageInfo.nextCursor;
    state.trashTotalCount = result.totalCount;
    state.trashMatchingCount = result.matchingCount;
    state.trashExpiringSoonCount = result.expiringSoonCount;
  } catch (error) {
    state.error = message(error);
  } finally {
    state.trashLoadingMore = false;
    if (state.route === "trash") render();
  }
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

function scheduleDocumentSearch() {
  clearTimeout(state.searchTimer);
  const query = state.search.trim().toLocaleLowerCase();
  if (query.length < 2 || state.route === "trash") return;
  state.searchTimer = setTimeout(() => {
    void indexDocumentsForSearch(query);
    void searchTrashForQuery(query);
  }, 250);
}

function scheduleSearchRender() {
  clearTimeout(state.searchRenderTimer);
  state.searchRenderTimer = setTimeout(() => {
    state.searchRenderTimer = null;
    render();
  }, 120);
}

function clearLibrarySearch() {
  clearTimeout(state.searchTimer);
  clearTimeout(state.searchRenderTimer);
  clearTimeout(state.trashSearchTimer);
  state.searchTimer = null;
  state.searchRenderTimer = null;
  state.trashSearchTimer = null;
  state.search = "";
  state.searchScope = "everywhere";
  state.searchGeneration += 1;
  state.searchTrashGeneration += 1;
  state.searchTrashMatchingCount = null;
  state.searchTrashFailed = false;
  state.searchLoading = false;
}

async function searchTrashForQuery(query) {
  const generation = ++state.searchTrashGeneration;
  state.searchTrashMatchingCount = null;
  state.searchTrashFailed = false;
  try {
    const result = await api.listTrashItems(null, { query });
    if (generation !== state.searchTrashGeneration || state.search.trim().toLocaleLowerCase() !== query) return;
    state.searchTrashMatchingCount = result.matchingCount;
    render();
  } catch (error) {
    if (generation !== state.searchTrashGeneration || state.search.trim().toLocaleLowerCase() !== query) return;
    console.warn("Canvas could not search Trash.", error);
    state.searchTrashFailed = true;
    render();
  }
}

async function indexDocumentsForSearch(query) {
  const generation = ++state.searchGeneration;
  const pending = state.documents.filter((document) => !state.searchDocumentText.has(document.id));
  if (!pending.length) return;
  state.searchLoading = true;
  render();
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length && generation === state.searchGeneration) {
      const document = pending[cursor++];
      try {
        const projection = await api.getDocumentProjection(document.id)
          ?? await api.getDocument(document.id, { loadAssets: false });
        state.searchDocumentText.set(document.id, searchableDocumentText(projection.snapshot?.source));
      } catch (error) {
        console.warn(`Canvas could not index ${document.id} for search.`, error);
        state.searchDocumentText.set(document.id, "");
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker));
  if (generation !== state.searchGeneration) return;
  state.searchLoading = false;
  if (state.search.trim().toLocaleLowerCase() === query) render();
}

function handleDocumentCollectionError(error, { phase }) {
  if (phase === "subscribe") {
    console.warn("Canvas document collection realtime is unavailable.", error);
    return;
  }
  state.loading = false;
  state.error = message(error);
  if (state.route === "trash") {
    state.trashItems = [];
    state.trashLoaded = true;
  }
  render();
}

function startFolderSubscription(folderId = null) {
  state.folderUnsubscribe?.();
  state.folderUnsubscribe = null;
  void api.subscribeToFolders(() => {
    invalidateFolderTree();
    if (folderId && state.route === "folder" && state.activeFolderId === folderId) {
      void refreshFolderCollection(folderId).catch((error) => handleDocumentCollectionError(error, { phase: "load" }));
    } else if (!folderId && state.route === "library") {
      void refreshLibraryFolders().catch((error) => handleDocumentCollectionError(error, { phase: "load" }));
    } else if (!folderId && state.route === "trash") {
      void documentCollectionLifecycle.refresh();
    }
  }).then((unsubscribe) => { state.folderUnsubscribe = unsubscribe; }).catch((error) => {
    console.warn("Canvas folder realtime is unavailable.", error);
  });
}

async function showDocumentUnavailable(input) {
  visibleDocumentRestore.cancel();
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
    state.dialog = null;
    await navigateToDocument(document.id);
  } finally {
    model.doc.destroy();
  }
}

async function navigateToDocument(documentId) {
  await routes.navigateToDocument(documentId);
}

async function openDocument(documentId, isCurrentRequest = () => true) {
  const knownDocument = state.documents.find((document) => document.id === documentId)
    ?? state.editorDocuments.find((document) => document.id === documentId)
    ?? (state.document?.id === documentId ? state.document : null);
  closeDocument();
  state.documentOpenStartedAt = performance.now();
  state.route = "editor";
  state.document = {
    id: documentId,
    title: knownDocument?.title ?? "Canvas",
    module: knownDocument?.module ?? "generic",
    folderId: knownDocument?.folderId ?? null,
  };
  state.currentFolder = state.document.folderId ? knownFolder(state.document.folderId) : null;
  state.loading = true;
  state.fatalError = false;
  state.error = null;
  render();
  try {
    state.enginePreparation = performanceMonitor.measureAsync(
      "engine.canvaskit-ready",
      () => prepareOpenPencilEngine(),
      { documentId },
    ).then(
      () => ({ error: null }),
      (error) => ({ error }),
    );
    const cachedAssets = documentAssetCache.take(documentId);
    const assetHydrationTask = performanceMonitor.measureAsync(
      "document.assets",
      async () => {
        const assetDescriptors = await api.listAssets(documentId);
        return hydrateDocumentAssets(api, documentId, assetDescriptors, cachedAssets, {
          rasterizeSvg: rasterizeOpenPencilSvgAsset,
        });
      },
      { documentId },
    ).then(
      (value) => ({ value, error: null }),
      (error) => ({ value: null, error }),
    );
    const payload = await performanceMonitor.measureAsync(
      "document.fetch",
      () => api.getDocument(documentId, {
        loadAssets: false,
        onMetadata: (metadata) => {
          if (state.route !== "editor" || state.document?.id !== documentId || !state.loading) return;
          state.document = {
            ...state.document,
            ...metadata,
            module: metadata.snapshot?.projection?.module
              ?? metadata.module
              ?? state.document.module
              ?? "generic",
          };
          state.currentFolder = metadata.folderId ? knownFolder(metadata.folderId) : null;
          render();
        },
      }),
      { documentId },
    );
    if (!isCurrentRequest()) return;
    const assetHydrationResult = await assetHydrationTask;
    if (assetHydrationResult.error) throw assetHydrationResult.error;
    const assetHydration = assetHydrationResult.value;
    if (!isCurrentRequest()) return;
    documentAssetCache.remember(documentId, assetHydration.assets);
    state.assets = assetHydration.assets;
    for (const failure of assetHydration.failures) {
      console.warn(
        `Canvas could not load document asset ${failure.descriptor.path}.`,
        failure.error,
      );
    }
    state.document = {
      ...payload,
      module: payload.snapshot?.source?.module
        ?? payload.snapshot?.projection?.module
        ?? payload.module
        ?? "generic",
    };
    state.currentFolder = payload.folderId ? knownFolder(payload.folderId) : null;
    state.editorDocuments = [];
    state.grants = [];
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
    const durablePendingUpdates = await performanceMonitor.measureAsync(
      "document.pending-updates",
      () => pendingUpdateQueue.load(documentId),
      { documentId },
    );
    if (!isCurrentRequest()) return;
    state.pendingUpdates = durablePendingUpdates.map((item) => ({
      ...item,
      persisted: Promise.resolve(true),
    }));
    for (const item of durablePendingUpdates) {
      applyRemoteUpdate(state.model, item.update);
      state.localUpdateSequences.set(item.clientUpdateId, null);
    }
    state.undo = createUndoManager(state.model);
    state.lastSequence = Math.max(
      payload.snapshot.throughSequence,
      ...(payload.updates ?? []).map((update) => update.sequence),
    );
    state.lastCatchUpSequence = state.lastSequence;
    state.deferredSnapshotUpdates = payload.updates?.length ?? 0;
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
    const subscription = performanceMonitor.measureAsync(
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
    if (state.catchUpAfterOpen) {
      state.catchUpAfterOpen = false;
      void restoreConnectedState(documentId);
    }
    void restoreLegacyOfflineChanges(documentId, serverStateVector);
    void subscription.then((unsubscribe) => {
      if (state.document?.id === documentId) state.documentUnsubscribe = unsubscribe;
      else unsubscribe?.();
    }).catch((error) => {
      if (state.document?.id !== documentId) return;
      console.warn("Canvas realtime subscription is unavailable.", error);
      applyDisconnectedState(false);
      renderSyncStatus();
    });
    void Promise.all([
      payload.folderId ? api.openFolder(payload.folderId) : Promise.resolve(null),
      loadEveryDocumentPage((cursor) => api.listDocuments(cursor, payload.folderId
        ? { view: "folder", folderId: payload.folderId }
        : { view: "root" })),
      payload.access === "owner" ? api.listGrants(documentId) : Promise.resolve({ items: [] }),
    ]).then(([folder, documents, grants]) => {
      if (state.document?.id !== documentId) return;
      state.currentFolder = folder;
      state.editorDocuments = documents.map(withModule);
      state.grants = grants.items;
      render();
    }).catch((error) => {
      if (state.document?.id === documentId) {
        console.warn("Canvas could not load secondary document controls.", error);
      }
    });
    await flushPending();
  } catch (error) {
    if (!isCurrentRequest()) return;
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
      state.fatalError = true;
      state.error = message(error);
      render();
    }
  }
}

async function loadDocumentThumbnails(documents) {
  const pending = documents.filter((document) =>
    document.thumbnailUpdatedAt && !state.thumbnails.has(document.id));
  const route = state.route;
  const folderId = state.activeFolderId;
  const isCurrent = () => state.route === route && state.activeFolderId === folderId;
  await runCurrentBackgroundTasks(pending, async (document) => {
    if (!isCurrent()) return;
      try {
        const result = await api.readThumbnail(document.id);
        if (isCurrent()) state.thumbnails.set(document.id, `data:image/png;base64,${result.png}`);
      } catch (error) {
        console.warn("Canvas could not load a saved design thumbnail.", error);
      }
  }, { concurrency: 2, isCurrent });
}

function closeDocument() {
  clearTimeout(state.trashSearchTimer);
  state.trashSearchTimer = null;
  snapshotMaintenance.cancel();
  documentCollectionLifecycle.stop();
  state.libraryActive = false;
  state.folderUnsubscribe?.();
  state.folderUnsubscribe = null;
  disposeEngineSurface();
  state.documentUnsubscribe?.();
  state.documentUnsubscribe = null;
  if (state.model && state.updateListener) state.model.doc.off("update", state.updateListener);
  state.updateListener = null;
  state.assets = new Map();
  state.undo?.destroy();
  state.model?.doc.destroy();
  state.undo = null;
  state.pendingUpdates = [];
  state.localUpdateSequences.clear();
  state.incrementalEngineUpdate = false;
  state.reconciling = null;
  state.lastSequence = 0;
  state.lastCatchUpSequence = 0;
  state.catchUpAfterOpen = false;
  state.updatesSinceSnapshot = 0;
  state.deferredSnapshotUpdates = 0;
  state.document = null;
  state.grants = [];
  state.shareTarget = null;
  state.model = null;
  state.selectedId = null;
  state.expandedLayerIds.clear();
  state.presence = null;
  state.realtimeConnection = REALTIME_RECONNECTING;
  state.dialog = null;
  state.documentSwitcherOpen = false;
  state.activeTool = "select";
  collapseEditorPanels();
  state.spacePressed = false;
  state.engineViewport = null;
  state.engineReady = false;
  state.enginePreparation = null;
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
      state.lastCatchUpSequence = state.lastSequence;
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

async function catchUpFromServer(documentId) {
  if (state.document?.id !== documentId || !state.model) return false;
  if (state.reconciling) return state.reconciling;
  const model = state.model;
  let task;
  task = (async () => {
    try {
      let changed = false;
      let hasMore;
      do {
        const requestedAfter = state.lastCatchUpSequence;
        const payload = await performanceMonitor.measureAsync(
          "document.catch-up",
          () => api.listUpdates(documentId, requestedAfter),
          { documentId, afterSequence: requestedAfter },
        );
        performanceMonitor.record("document.catch-up-result", 0, {
          documentId,
          afterSequence: requestedAfter,
          updates: payload.updates?.length ?? 0,
          requiresSnapshot: payload.requiresSnapshot === true,
          hasMore: payload.hasMore === true,
        });
        if (state.document?.id !== documentId || state.model !== model) return false;
        const result = applyIncrementalDocumentPayload(model, payload, state);
        if (result.requiresSnapshot) return "snapshot-required";
        state.lastSequence = result.lastSequence;
        state.lastCatchUpSequence = result.lastCatchUpSequence;
        changed = result.changed || changed;
        hasMore = payload.hasMore === true;
        if (hasMore && state.lastCatchUpSequence <= requestedAfter) {
          throw new Error("Canvas catch-up did not advance its update watermark.");
        }
      } while (hasMore);
      for (const [clientUpdateId, sequence] of state.localUpdateSequences) {
        if (sequence !== null && sequence <= state.lastCatchUpSequence) {
          state.localUpdateSequences.delete(clientUpdateId);
        }
      }
      if (changed) {
        state.engineDocumentDirty = true;
        state.engineDocumentDirtyReason = "server-catch-up";
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
      }
      state.presence = null;
      setSync(
        navigator.onLine ? "error" : "offline",
        navigator.onLine ? "Couldn’t sync — retrying" : "Offline — changes stay on this device",
      );
      render();
      setTimeout(() => void restoreConnectedState(documentId), 3_000);
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

function queueEncodedUpdate(documentId, update, options = {}) {
  if (state.document?.id !== documentId) return;
  const clientUpdateId = options.clientUpdateId ?? crypto.randomUUID();
  const createdAt = Number(options.createdAt ?? Date.now());
  const persisted = options.persisted
    ? Promise.resolve(true)
    : pendingUpdateQueue.enqueue(documentId, { clientUpdateId, update, createdAt }).then(
      () => true,
      (error) => {
        console.error("Canvas could not store an offline-safe copy of a local change.", error);
        return false;
      },
    );
  const item = { clientUpdateId, update, createdAt, persisted };
  state.pendingUpdates.push(item);
  state.localUpdateSequences.set(clientUpdateId, null);
  return item;
}

async function flushPending() {
  if (!state.document || state.flushing || !navigator.onLine) return;
  state.flushing = true;
  const documentId = state.document.id;
  try {
    while (state.pendingUpdates.length > 0) {
      const item = state.pendingUpdates[0];
      await item.persisted;
      const result = await api.appendUpdate(documentId, {
        clientUpdateId: item.clientUpdateId,
        update: item.update,
      });
      state.lastSequence = Math.max(state.lastSequence, Number(result.sequence));
      if (state.localUpdateSequences.has(item.clientUpdateId)) {
        state.localUpdateSequences.set(item.clientUpdateId, Number(result.sequence));
      }
      await pendingUpdateQueue.acknowledge(documentId, item.clientUpdateId);
      state.pendingUpdates.shift();
    }
    if (state.realtimeConnection === REALTIME_CONNECTED) {
      setSync("saved", "Saved");
      renderSyncStatus();
    } else {
      applyDisconnectedState(false);
    }
    scheduleThumbnailUpdate(documentId);
    void snapshotMaintenance.request(documentId);
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

async function restoreLegacyOfflineChanges(documentId, serverStateVector) {
  try {
    if (await pendingUpdateQueue.migrationComplete(documentId)) return;
    const item = await performanceMonitor.measureAsync(
      "document.legacy-offline-migration",
      () => migrateLegacyOfflineCache(documentId, serverStateVector),
      { documentId },
    );
    if (!item || state.document?.id !== documentId || !state.model) return;
    const changed = applyRemoteUpdate(state.model, item.update);
    queueEncodedUpdate(documentId, item.update, { ...item, persisted: true });
    if (changed) {
      invalidateDocumentProjection();
      state.engineDocumentDirty = true;
      state.engineDocumentDirtyReason = "legacy-offline-update";
      render();
    }
    void flushPending();
  } catch (error) {
    if (state.document?.id === documentId) {
      console.warn("Canvas could not migrate its legacy offline changes yet.", error);
    }
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
  if (state.loading) {
    state.catchUpAfterOpen = true;
    return;
  }
  setSync("syncing", "Syncing…");
  render();
  await restoreConnectedState(documentId);
}

async function restoreConnectedState(documentId) {
  const reconciled = await catchUpFromServer(documentId);
  if (reconciled === "snapshot-required") {
    const refreshed = await reconcileFromServer(documentId);
    if (!refreshed || state.document?.id !== documentId) return;
    await flushPending();
    return;
  }
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
  const activeSearch = document.activeElement?.matches?.('[data-role="search"]')
    ? {
        start: document.activeElement.selectionStart,
        end: document.activeElement.selectionEnd,
        direction: document.activeElement.selectionDirection,
      }
    : null;
  const hasRequestedFocus = Boolean(state.dialogFocusSelector);
  const retainedHost = state.route === "editor" && state.document && state.engineSurface
    ? root.querySelector('[data-role="openpencil-surface"]')
    : null;
  if (!retainedHost) disposeEngineSurface();
  if (state.loading) {
    root.innerHTML = state.route === "editor" && state.document
      ? renderEditorLoading()
      : `<main class="shell empty"><div><span class="muted">Loading Canvas…</span></div></main>`;
    bindCommon();
    return;
  }
  if (state.fatalError && state.error && !state.document) {
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
    if (state.engineReady) scheduleCompatibilityAnalysis(state.document.id);
  }
  else bindLibrary();
  focusRequestedControl();
  if (activeSearch && !hasRequestedFocus) {
    const search = root.querySelector('[data-role="search"]');
    if (search) {
      search.focus({ preventScroll: true });
      const valueLength = search.value.length;
      search.setSelectionRange(
        Math.min(activeSearch.start ?? valueLength, valueLength),
        Math.min(activeSearch.end ?? valueLength, valueLength),
        activeSearch.direction ?? "none",
      );
    }
  }
  performanceMonitor.record("ui.render", performance.now() - renderStartedAt, {
    route: state.route,
    nodes: state.documentNodes?.length ?? 0,
  });
}

function renderEditorLoading() {
  return `<main class="shell editor">
    <header class="editor-header">
      <div class="editor-header-left">
        <button class="icon-button editor-panel-toggle" disabled aria-label="Layers panel unavailable while opening">${icon("panel-left")}</button>
        <button class="icon-button editor-back" disabled aria-label="Opening design">${icon("back")}</button>
        <div class="editor-title"><input size="${Math.min(42, Math.max(1, state.document.title.length))}" value="${escapeHtml(state.document.title)}" aria-label="Document title" disabled /></div>
        <span class="module-badge">${escapeHtml(moduleLabel(state.document.module))}</span>
        <div class="sync" data-state="syncing" role="status" aria-live="polite"><i class="sync-dot"></i><span>Opening…</span></div>
      </div>
      <div class="editor-header-right">
        <button class="button" disabled>Share</button>
        <button class="icon-button editor-panel-toggle" disabled aria-label="Design panel unavailable while opening">${icon("panel-right")}</button>
      </div>
    </header>
    <div class="editor-body layers-closed inspector-closed">
      <section class="viewport" tabindex="0" aria-label="Canvas viewport" aria-busy="true">
        <div class="openpencil-host"><div class="engine-loading" role="status" aria-live="polite">Rendering design…</div></div>
      </section>
    </div>
  </main>`;
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
  const recentDocuments = sortCollection(state.documents
    .filter((document) => document.lastOpenedAt && matches(document.title))
    , state.collectionSort);
  const rootDocuments = sortCollection(state.documents.filter((document) => document.folderId === null && matches(document.title)), state.collectionSort);
  const rootFolders = sortCollection(state.folders.filter((folder) => matches(folder.name)), state.collectionSort);
  const sharedDocuments = sortCollection(state.documents.filter((document) => document.access === "editor" && matches(document.title)), state.collectionSort);
  const sharedFolders = sortCollection(state.folders.filter((folder) => folder.access === "editor" && matches(folder.name)), state.collectionSort);
  const filteredRecentFolders = sortCollection(state.recentFolders.filter((folder) => matches(folder.name)), state.collectionSort);
  const empty = state.libraryLoaded ? emptyLibrary(query) : "";
  const content = query ? renderSearchResults(query) : state.libraryFilter === "recent"
    ? `${folderSection(filteredRecentFolders, "Folders", true, true)}<section class="library-section"><div class="section-heading"><h2>Recent designs <span>${recentDocuments.length}</span></h2></div>${recentDocuments.length ? documentCollection(recentDocuments) : empty}</section>`
    : state.libraryFilter === "shared"
      ? `<section class="library-section">${sharedFolders.length ? folderSection(sharedFolders, "Folders") : ""}<div class="section-heading"><h2>Shared designs <span>${sharedDocuments.length}</span></h2></div>${sharedDocuments.length ? documentCollection(sharedDocuments) : sharedFolders.length ? "" : empty}</section>`
      : `${folderSection(rootFolders, "Folders", false, true)}<section class="library-section"><div class="section-heading"><h2>Unfiled designs <span>${rootDocuments.length}</span></h2></div>${rootDocuments.length ? documentCollection(rootDocuments) : empty}</section>`;
  return `<main class="shell library"><div class="library-inner">
    <div class="library-sticky">${libraryTopbar("Search designs and folders")}${query ? "" : libraryTabs(state.libraryFilter)}</div>
    <div class="library-content">${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
    ${content}</div>
  </div></main>${renderDialog()}${renderToast()}`;
}

function renderFolder() {
  const folder = state.currentFolder;
  if (!folder) return `<main class="shell empty"><div><h2>Folder unavailable</h2></div></main>`;
  const query = state.search.trim().toLowerCase();
  const matches = (value) => !query || value.toLowerCase().includes(query);
  const folders = sortCollection(state.folderChildren.filter((item) => matches(item.name)), state.collectionSort);
  const documents = sortCollection(state.folderDocuments.filter((item) => matches(item.title)), state.collectionSort);
  const collectionEmpty = !query && folders.length === 0 && documents.length === 0 && state.folderCollections.has(folder.id);
  const noResults = query && folders.length === 0 && documents.length === 0 ? emptyLibrary(query) : "";
  return `<main class="shell library"><div class="library-inner">
    <div class="library-sticky">${folderTopbar(folder)}</div>
    <div class="folder-content">
    ${state.error ? `<p class="error-copy">${escapeHtml(state.error)}</p>` : ""}
    <header class="folder-overview">
      <span class="folder-overview-icon">${icon("folder")}</span><div class="library-title"><div class="folder-name-line"><h1>${escapeHtml(folder.name)}</h1>${folder.access === "owner" ? `<button class="icon-button" data-action="rename-current-folder" aria-label="Rename folder">${icon("pencil")}</button>` : ""}</div><div class="folder-detail-line"><p>${folderCollectionSummary(folder, folders)}</p>${folderPeopleSummary(folder)}</div></div><div class="folder-header-actions">${collectionControls()}${folder.access === "owner" ? `<button class="button" data-action="share-current-folder">${icon("person-plus")}Share folder</button>` : ""}<button class="icon-button" data-action="current-folder-menu" aria-label="Folder actions">${icon("more")}</button></div>
    </header>
    ${collectionEmpty ? folderEmptyState(folder) : `${folders.length ? folderSection(folders, "Folders", false, false, true) : ""}${documents.length ? `<section class="library-section"><div class="section-heading"><h2>Designs in ${escapeHtml(folder.name)} <span>${documents.length}</span></h2></div>${documentCollection(documents)}</section>` : noResults}`}
    </div>
  </div></main>${renderDialog()}${renderToast()}`;
}

function libraryTopbar(placeholder) {
  return `<header class="library-topbar"><button class="canvas-brand" data-action="back-to-files" aria-label="Canvas home"><span>${icon("frame")}</span><strong>Canvas</strong></button><div class="topbar-actions">${searchControl(placeholder)}<button class="button" data-action="new-folder">${icon("folder-plus")}New folder</button><button class="button primary" data-action="new">${icon("plus")}New design</button></div></header>`;
}

function folderTopbar(folder) {
  const parent = folder.parentId && folder.parentName
    ? `<button data-action="folder-back">${icon("folder")}${escapeHtml(folder.parentName)}</button><span>${icon("chevron")}</span>`
    : "";
  return `<header class="library-topbar folder-topbar"><div class="folder-breadcrumb"><button data-action="folder-home">${icon("home")}Home</button><span>${icon("chevron")}</span>${parent}<strong>${icon("folder")}${escapeHtml(folder.name)}</strong></div><div class="topbar-actions">${searchControl("Search designs and folders", `Search ${folder.name}`)}<button class="button primary" data-action="new">${icon("plus")}New design</button></div></header>`;
}

function searchControl(placeholder, label = placeholder) {
  const trailingControl = state.search.trim()
    ? `<button type="button" class="search-clear" data-action="clear-search" aria-label="Clear search">${icon("close")}</button>`
    : `<kbd>⌘&nbsp;K</kbd>`;
  return `<div class="search-wrap">${icon("search")}<input class="search" data-role="search" name="canvas-search" autocomplete="off" type="search" value="${escapeHtml(state.search)}" placeholder="${escapeHtml(placeholder)}" aria-label="${escapeHtml(label)}" />${trailingControl}</div>`;
}

function libraryTabs(active) {
  return `<nav class="library-tabs" aria-label="Canvas sections"><div class="library-tab-list">${segment("recent", "Recent")}${segment("all", "All designs")}${segment("shared", "Shared with you")}<button class="${active === "trash" ? "active" : ""}" data-action="open-trash">Trash</button></div>${collectionControls()}</nav>`;
}

function folderSection(folders, title, rail = false, includeNew = false, nested = false) {
  const useRail = rail && state.collectionView === "grid";
  const layout = useRail ? "folder-rail" : `folder-grid${state.collectionView === "list" ? " folder-list" : ""}`;
  return `<section class="library-section"><div class="section-heading"><h2>${escapeHtml(title)} <span>${folders.length}</span></h2>${useRail && folders.length >= 10 ? `<span class="section-link">See more</span>` : ""}</div><div class="${layout}">${folders.map((folder) => folderCard(folder, nested)).join("")}${includeNew ? `<button class="folder-card folder-card-new" data-action="new-folder">${icon("folder-plus")}<span><strong>New folder</strong></span></button>` : ""}</div></section>`;
}

function collectionControls() {
  const sort = COLLECTION_SORT_OPTIONS.find((option) => option.id === state.collectionSort) ?? COLLECTION_SORT_OPTIONS[0];
  return `<div class="collection-controls"><div class="view-toggle" role="group" aria-label="Choose view"><button class="view-option ${state.collectionView === "grid" ? "active" : ""}" data-action="set-collection-view" data-view="grid" type="button" aria-label="Grid view" aria-pressed="${state.collectionView === "grid"}">${icon("grid")}</button><button class="view-option ${state.collectionView === "list" ? "active" : ""}" data-action="set-collection-view" data-view="list" type="button" aria-label="List view" aria-pressed="${state.collectionView === "list"}">${icon("list")}</button></div><button class="sort-control" data-action="choose-collection-sort" type="button" aria-haspopup="menu">${icon("arrow-up-down")}<span>${escapeHtml(sort.label)}</span></button></div>`;
}

function documentCollection(documents) {
  return `<div class="document-grid ${state.collectionView === "list" ? "document-list" : ""}">${documents.map(documentCard).join("")}</div>`;
}

function renderSearchResults(query) {
  const inScope = (document) => state.searchScope === "everywhere"
    || (state.searchScope === "unfiled" ? document.folderId === null : document.folderId === state.searchScope);
  const documents = sortCollection(state.documents.filter((document) => inScope(document) && (
    document.title.toLocaleLowerCase().includes(query)
    || state.searchDocumentText.get(document.id)?.includes(query)
  )), state.collectionSort);
  const folders = state.searchScope === "everywhere"
    ? sortCollection(state.folders.filter((folder) => folder.name.toLocaleLowerCase().includes(query)), state.collectionSort)
    : [];
  const count = documents.length + folders.length;
  const scopes = [
    ["everywhere", "Everywhere"],
    ...sortCollection(state.folders, "name").map((folder) => [folder.id, folder.name]),
    ["unfiled", "Unfiled"],
  ];
  const scopeControls = scopes.map(([value, label]) => `<button type="button" data-search-scope="${escapeHtml(value)}" aria-pressed="${state.searchScope === value}" class="${state.searchScope === value ? "active" : ""}">${escapeHtml(label)}</button>`).join("");
  const results = count
    ? `${folders.length ? folderSection(folders, "Folders") : ""}<section class="library-section"><div class="section-heading"><h2>Designs <span>${documents.length}</span></h2>${state.searchLoading ? `<span class="search-indexing" role="status">Searching document text…</span>` : ""}</div>${documents.length ? documentCollection(documents) : ""}</section>`
    : `<section class="empty search-empty"><div><span class="search-empty-art">${icon("search-off")}</span><div class="search-empty-copy"><h2>No designs match “${escapeHtml(state.search.trim())}”</h2><p>${searchEmptyDescription()}</p></div><div class="empty-actions"><button class="button" data-action="clear-search">${icon("close")}Clear search</button><button class="button primary" data-action="create-from-search">${icon("plus")}Create “${escapeHtml(state.search.trim())}”</button></div></div></section>`;
  return `<section class="search-results"><header class="search-results-head"><h1>Results for “${escapeHtml(state.search.trim())}” <span>${count}</span></h1><div class="search-scopes" aria-label="Search location">${scopeControls}</div></header>${results}</section>`;
}

function searchEmptyDescription() {
  const searched = `We searched ${state.documents.length} design names, ${state.folders.length} folder names and the text inside every design.`;
  if (state.searchLoading || (state.searchTrashMatchingCount === null && !state.searchTrashFailed)) return "Searching document text and Trash…";
  if (state.searchTrashFailed) return `${searched} Trash couldn’t be searched.`;
  if (state.searchTrashMatchingCount === 0) return `${searched} Nothing in Trash matched either.`;
  return `${searched} ${state.searchTrashMatchingCount} matching item${state.searchTrashMatchingCount === 1 ? " is" : "s are"} in Trash.`;
}

function emptyLibrary(query = "") {
  return query
    ? `<section class="empty"><div>${icon("search")}<h2>No results found</h2><p>Try a different name or clear your search.</p></div></section>`
    : `<section class="empty"><div>${icon("file")}<h2>No designs here yet</h2><p>Create a design to get started.</p><button class="button primary" data-action="new">${icon("plus")}New design</button></div></section>`;
}

async function openMoveDesignsHere() {
  const folder = state.currentFolder;
  if (!folder) return;
  state.dialog = { kind: "move-designs-here", folderId: folder.id, folderName: folder.name, loading: true };
  render();
  try {
    const documents = await loadEveryDocumentPage(api.listDocuments);
    if (state.dialog?.kind !== "move-designs-here" || state.dialog.folderId !== folder.id) return;
    state.documents = documents.map(withModule);
    persistCollectionCache();
    state.dialog = { ...state.dialog, loading: false, error: null };
    state.dialogFocusSelector = '[data-role="move-design-checkbox"]';
    render();
  } catch (error) {
    if (state.dialog?.kind !== "move-designs-here" || state.dialog.folderId !== folder.id) return;
    state.dialog = { ...state.dialog, loading: false, error: message(error) };
    state.dialogFocusSelector = '[data-action="retry-move-designs"]';
    render();
  }
}

function folderCollectionSummary(folder, childFolders) {
  const parts = [];
  if (childFolders.length) parts.push(`${childFolders.length} folder${childFolders.length === 1 ? "" : "s"}`);
  parts.push(`${folder.designCount} design${folder.designCount === 1 ? "" : "s"}`);
  const isEmpty = childFolders.length === 0 && folder.designCount === 0;
  const timestamp = relativeTime(isEmpty ? folder.createdAt ?? folder.updatedAt : folder.updatedAt);
  parts.push(`${isEmpty ? "Created" : "Updated"} ${isEmpty ? timestamp.replace(/^Just/u, "just") : timestamp}`);
  return escapeHtml(parts.join(" · "));
}

function folderEmptyState(folder) {
  return `<section class="folder-empty" aria-label="Empty ${escapeHtml(folder.name)} folder"><div class="folder-empty-illustration" aria-hidden="true"><i></i><i></i><span>${icon("folder-input")}</span></div><div class="folder-empty-copy"><h2>Nothing in ${escapeHtml(folder.name)} yet</h2><p>Create a design here, or move ones you already have. Designs keep their sharing when they move, and the folder’s people are added on top.</p></div><div class="folder-empty-actions"><button class="button primary" data-action="new">${icon("plus")}New design</button><button class="button" data-action="move-designs-here">${icon("folder-input")}Move designs here</button></div></section>`;
}

function renderTrash() {
  return `<main class="shell library"><div class="library-inner">
    <div class="library-sticky">${libraryTopbar("Search Trash")}${libraryTabs("trash")}</div>
    <div class="trash-content">
      <section class="trash-banner">
        <span class="trash-banner-icon">${icon("info")}</span>
        <p>Designs and folders stay in Trash for 30 days, then they’re deleted for good. Folders restore with everything inside. Previous parents are restored when available; otherwise the item returns to Home.</p>
        <button class="button danger" data-action="empty-trash" ${state.trashTotalCount ? "" : "disabled"}>${icon("trash")}Empty trash</button>
      </section>
      ${state.error ? `<section class="empty trash-empty"><div>${icon("info")}<h2>Trash search failed</h2><p>${escapeHtml(state.error)}</p></div></section>` : state.trashItems.length ? renderTrashTable() : state.trashLoaded ? `<section class="empty trash-empty"><div>${icon("trash")}<h2>${state.search.trim() ? "No results in Trash" : "Trash is empty"}</h2><p>${state.search.trim() ? "Try another name or location." : "Items moved to Trash will stay here for 30 days."}</p></div></section>` : `<section class="trash-loading" aria-label="Loading Trash"></section>`}
    </div>
  </div></main>${renderDialog()}${renderToast()}`;
}

function renderTrashTable() {
  const summary = trashSummary({
    query: state.search,
    matchingCount: state.trashMatchingCount,
    totalCount: state.trashTotalCount,
  });
  const visibleCount = summary.matchingCount;
  const visibleLabel = `${visibleCount} item${visibleCount === 1 ? "" : "s"}`;
  const totalLabel = `${summary.totalCount} item${summary.totalCount === 1 ? "" : "s"} total`;
  const footer = `${summary.isFiltered ? `${visibleLabel} · ${totalLabel}` : visibleLabel}${state.trashExpiringSoonCount ? ` · ${state.trashExpiringSoonCount} expiring soon` : ""}`;
  return `<section class="trash-table" role="table" aria-label="Deleted designs and folders">
    <div class="trash-table-head" role="row"><span role="columnheader">NAME</span><span role="columnheader">WAS IN</span><span role="columnheader">DELETED</span><span role="columnheader">BY</span><span role="columnheader" aria-label="Actions"></span></div>
    <div class="trash-table-body" role="rowgroup">${state.trashItems.map(trashRow).join("")}</div>
    <footer class="trash-table-footer"><span>${escapeHtml(footer)}</span><span class="trash-agent-hint">${icon("sparkles")}Ask the Agent: “restore everything Bernard deleted yesterday”</span>${state.trashNextCursor ? `<button class="button" data-action="load-more-trash" ${state.trashLoadingMore ? 'disabled aria-busy="true"' : ""}>${state.trashLoadingMore ? `${icon("loader")}Loading…` : "Load more"}</button>` : ""}</footer>
  </section>`;
}

function trashRow(item) {
  const document = item.kind === "document";
  const detail = document
    ? `${libraryModuleLabel(item.module)} · ${item.unitCount} ${trashUnitLabel(item.module, item.unitCount)}`
    : `Folder · ${item.designCount} design${item.designCount === 1 ? "" : "s"} inside — restore brings ${item.designCount === 1 ? "it" : "them"} all back`;
  const actor = item.deletedBy;
  const actorLabel = actor ? (actor.isCurrentUser ? "You" : actor.name?.trim() || "Unknown") : "Unknown";
  return `<div class="trash-table-row" role="row" data-trash-kind="${item.kind}">
    <span class="trash-name-cell" role="cell"><i class="trash-item-icon ${item.kind}">${icon(document ? moduleIcon(item.module) : "folder")}</i><span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(detail)}</small></span></span>
    <span class="trash-path-cell" role="cell" title="${escapeHtml(item.previousPath)}">${escapeHtml(item.previousPath)}</span>
    <span class="trash-deleted-cell" role="cell"><strong>${escapeHtml(relativeTime(item.deletedAt))}</strong><small>Gone in ${daysUntil(item.recoverableUntil)} day${daysUntil(item.recoverableUntil) === 1 ? "" : "s"}</small></span>
    <span class="trash-actor-cell" role="cell">${actor ? avatar(actor) : `<span class="avatar avatar-fallback" aria-hidden="true">?</span>`}<span>${escapeHtml(actorLabel)}</span></span>
    <span class="trash-row-actions" role="cell"><button class="button" data-${document ? "restore-document" : "restore-folder"}="${item.id}">Restore${document ? "" : " folder"}</button><button class="icon-button trash-delete" data-${document ? "permanently-delete-document" : "delete-folder"}="${item.id}" aria-label="Permanently delete ${escapeHtml(item.title)}" title="Delete permanently">${icon("trash")}</button></span>
  </div>`;
}

function trashUnitLabel(module, count) {
  const singular = ({ deck: "slide", web: "route", mobile: "screen" })[module] ?? "item";
  return `${singular}${count === 1 ? "" : "s"}`;
}

function segment(key, label) {
  return `<button class="${state.route === "library" && state.libraryFilter === key ? "active" : ""}" data-filter="${key}">${label}</button>`;
}

function documentCard(document) {
  const preview = state.thumbnails.get(document.id);
  const people = cardPeople(documentCardPeople(document, state.currentProfile));
  return `<article class="document-card"><button class="document-card-main" data-document-id="${document.id}" aria-label="Open ${escapeHtml(document.title)}"><span class="document-preview">${preview ? `<img src="${preview}" alt="" width="504" height="300" loading="lazy" />` : `<span class="preview-placeholder">${icon("frame")}</span>`}</span><span class="document-meta"><strong>${escapeHtml(document.title)}</strong><span class="document-submeta"><span>${escapeHtml(libraryModuleLabel(document.module))}</span><span>Edited ${escapeHtml(relativeTime(document.updatedAt))}</span>${people}</span></span></button><button class="icon-button card-menu" data-document-menu="${document.id}" aria-label="Actions for ${escapeHtml(document.title)}">${icon("more")}</button></article>`;
}

function folderCard(folder, nested = false) {
  const people = folderPeople(folder, { inheritCurrentFolder: nested });
  const peopleCount = folderPeopleProfiles(folder, { inheritCurrentFolder: nested }).length;
  const detail = `${folder.designCount} design${folder.designCount === 1 ? "" : "s"}${nested && peopleCount ? ` · inherits ${peopleCount} ${peopleCount === 1 ? "person" : "people"}` : peopleCount ? ` · ${peopleCount} ${peopleCount === 1 ? "person" : "people"}` : ""}`;
  const elapsed = relativeTime(folder.lastOpenedAt ?? folder.updatedAt);
  const content = nested
    ? `<span><strong>${escapeHtml(folder.name)}</strong><small>${escapeHtml(detail)}</small></span>`
    : `<span class="folder-card-content"><span class="folder-card-copy"><strong>${escapeHtml(folder.name)}</strong><small>${escapeHtml(detail)}</small></span><span class="folder-card-footer"><small>${escapeHtml(elapsed)}</small>${people}</span></span>`;
  return `<article class="folder-card-shell ${nested ? "nested-folder-card-shell" : ""}"><button class="folder-card ${nested ? "nested-folder-card" : ""}" data-folder-id="${folder.id}">${nested ? `<span class="folder-icon">${icon("folder")}</span>` : ""}${content}</button><button class="icon-button card-menu" data-folder-menu="${folder.id}" aria-label="Actions for ${escapeHtml(folder.name)}">${icon("more")}</button></article>`;
}

function folderPeopleProfiles(folder, { inheritCurrentFolder = false } = {}) {
  const direct = state.folderGrants.get(folder.id) ?? [];
  const grants = direct.length || !inheritCurrentFolder || !state.currentFolder
    ? direct
    : state.folderGrants.get(state.currentFolder.id) ?? [];
  return folderCardPeople(folder, grants, state.currentProfile);
}

function folderPeople(folder, options) {
  return cardPeople(folderPeopleProfiles(folder, options), "folder-people");
}

function folderPeopleSummary(folder) {
  const profiles = [state.currentProfile, ...folderPeopleProfiles(folder)]
    .filter(Boolean)
    .filter((profile, index, all) => all.findIndex((candidate) => (candidate.id ?? candidate.accountId ?? candidate.email) === (profile.id ?? profile.accountId ?? profile.email)) === index)
    .slice(0, 3);
  if (!profiles.length) return "";
  const names = profiles.map((profile, index) => index === 0 && profile === state.currentProfile ? "You" : profile.name?.trim() || profile.email).filter(Boolean);
  const summary = names.length === 1 && names[0] === "You"
    ? "Only you"
    : names.length < 2 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `<span class="folder-people-summary">${escapeHtml(summary)}</span>`;
}

function moduleLabel(value) {
  return ({ generic: "Generic", deck: "Deck", web: "Web", mobile: "Mobile" })[value] ?? "Generic";
}

function libraryModuleLabel(value) {
  return ({ deck: "Deck", web: "Web", mobile: "Mobile" })[value] ?? "Design";
}

function moduleIcon(value) {
  return ({ generic: "generic", deck: "deck", web: "web", mobile: "mobile" })[value] ?? "generic";
}

function avatar(profile) {
  const label = profileLabel(profile);
  const source = profile.avatarUrl || naviiAvatarUrl(profile);
  return source
    ? `<img class="avatar" src="${escapeHtml(source)}" alt="${escapeHtml(label)}" width="34" height="34" loading="lazy" data-avatar-fallback-label="${escapeHtml(label)}" data-avatar-fallback-initials="${escapeHtml(initials(label))}" referrerpolicy="no-referrer" />`
    : avatarFallback(label);
}

function avatarFallback(label) {
  return `<span class="avatar avatar-fallback" aria-label="${escapeHtml(label)}">${escapeHtml(initials(label))}</span>`;
}

function cardPeople(profiles, className = "card-people") {
  if (!profiles.length) return "";
  const label = profiles.map(profileLabel).join(", ");
  return `<span class="${className}" aria-label="${escapeHtml(label)}">${profiles.map(avatar).join("")}</span>`;
}

function renderDocumentSwitcher() {
  const folderName = state.currentFolder?.name ?? "Canvas";
  const documents = state.editorDocuments;
  const rows = documents.length
    ? documents.map((document) => {
      const current = document.id === state.document.id;
      const editor = document.lastEditor?.isCurrentUser ? "you" : document.lastEditor?.name?.trim();
      const detail = current
        ? `Editing now · ${moduleLabel(document.module)}`
        : `Edited ${relativeTime(document.updatedAt)}${editor ? ` · ${editor}` : ""}`;
      return `<button class="document-switcher-item ${current ? "current" : ""}" data-switch-document="${document.id}" data-switch-title="${escapeHtml(document.title.toLowerCase())}"><span class="document-switcher-module">${icon(document.module ?? "generic")}</span><span class="document-switcher-copy"><strong>${escapeHtml(document.title)}</strong><small>${escapeHtml(detail)}</small></span>${current ? icon("check") : ""}</button>`;
    }).join("")
    : "";
  const hidden = state.documentSwitcherOpen ? "" : " hidden";
  return `<div class="document-switcher-scrim" data-action="close-document-switcher" aria-hidden="true"${hidden}></div><section class="document-switcher-panel" role="dialog" aria-modal="true" aria-label="Switch design"${hidden}><label class="document-switcher-search">${icon("search")}<input data-role="document-switcher-search" name="document-switcher-search" autocomplete="off" type="search" placeholder="Switch to another design in ${escapeHtml(folderName)}…" aria-label="Search designs in ${escapeHtml(folderName)}" /></label><div class="document-switcher-heading"><strong>IN ${escapeHtml(folderName.toUpperCase())} · ${state.editorDocuments.length}</strong><span>Recent first</span></div><div class="document-switcher-list">${rows}<p class="document-switcher-empty" ${documents.length ? "hidden" : ""}>No designs found</p></div><div class="document-switcher-footer"><button data-action="switcher-new-design">${icon("plus")}<span>New design in ${escapeHtml(folderName)}</span><kbd>⌘&nbsp;N</kbd></button><button data-action="switcher-open-folder">${icon("folder")}<span>Open ${escapeHtml(folderName)} folder</span>${icon("chevron")}</button></div></section>`;
}

function renderEditor() {
  if (state.accessRemoved) {
    return `<main class="shell empty"><div>${icon("file")}<h2>${ACCESS_REMOVED_HEADING}</h2><p>${ACCESS_REMOVED_MESSAGE}</p><div class="library-actions"><button class="button primary" data-action="back">Back to files</button></div></div></main>${renderToast()}`;
  }
  const document = currentMaterializedDocument();
  const documentNodes = currentDocumentNodes();
  const layerNodes = currentVisibleLayerNodes(documentNodes);
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
        <button class="icon-button editor-panel-toggle" data-action="toggle-layers" aria-label="${state.layersOpen ? "Hide" : "Show"} layers panel" aria-expanded="${state.layersOpen}">${icon("panel-left")}</button>
        <button class="icon-button editor-back" data-action="back" aria-label="Back to files">${icon("back")}</button>
        <div class="editor-title"><input data-role="title" name="document-title" autocomplete="off" size="${Math.min(42, Math.max(1, state.document.title.length))}" value="${escapeHtml(state.document.title)}" aria-label="Document title" /><button class="document-switcher" data-action="document-switcher" aria-label="Switch design">${icon("chevron-down")}</button></div>
        <span class="module-badge">${escapeHtml(moduleLabel(state.document.module))}</span>
        <div class="sync" data-state="${state.sync}" title="${escapeHtml(state.syncMessage)}" role="status" aria-live="polite">${state.sync === "saved" ? icon("check") : `<i class="sync-dot"></i>`}<span>${escapeHtml(state.syncMessage)}</span></div>
      </div>
      <div class="editor-header-right">
        ${editorPeople.length ? `<div class="editor-avatars" aria-label="People with access">${editorPeople.map(avatar).join("")}</div>` : ""}
        ${state.document.access === "owner" ? `<button class="button editor-share" data-action="share">${icon("person-plus")}<span>Share</span></button>` : ""}
        <button class="icon-button editor-panel-toggle" data-action="toggle-inspector" aria-label="${state.inspectorOpen ? "Hide" : "Show"} design panel" aria-expanded="${state.inspectorOpen}">${icon("panel-right")}</button>
      </div>
    </header>
    <div class="editor-body ${panelVisibilityClass}">
      <aside class="side-panel layers" ${state.layersOpen ? "" : "hidden"}>
        <div class="panel-tabs" role="group" aria-label="Library panel"><button class="${state.assetPanel === "layers" ? "active" : ""}" data-asset-panel="layers" aria-pressed="${state.assetPanel === "layers"}">Layers</button><button class="${state.assetPanel === "assets" ? "active" : ""}" data-asset-panel="assets" aria-pressed="${state.assetPanel === "assets"}">Assets</button><button class="${state.assetPanel === "variables" ? "active" : ""}" data-asset-panel="variables" aria-pressed="${state.assetPanel === "variables"}">Variables</button></div>
        ${renderLayersPanelHeader(layerNodes)}
        <div class="panel-scroll">${state.layersOpen ? renderLayersPanelContent(layerNodes) : ""}</div>
      </aside>
      <section class="viewport" data-role="viewport" data-tool="${state.activeTool}" tabindex="0" aria-label="Canvas viewport" aria-busy="${state.engineReady ? "false" : "true"}">
        <div class="openpencil-host" data-role="openpencil-surface"><div class="engine-loading" role="status" aria-live="polite">Rendering design…</div></div>
        ${state.realtimeConnection === REALTIME_RECONNECTING && navigator.onLine ? `<div class="connection-banner">${icon("refresh")}<span>Reconnecting and merging changes</span></div>` : ""}
        ${unsupported.length ? `<div class="compatibility-banner"><span>${unsupportedNodeCount} object${unsupportedNodeCount === 1 ? " needs" : "s need"} compatibility review</span><button class="button" data-action="compatibility">Review</button></div>` : ""}
      </section>
      <aside class="side-panel inspector" ${state.inspectorOpen ? "" : "hidden"}><div class="panel-tabs" role="group" aria-label="Inspector panel"><button class="${state.inspectorTab === "design" ? "active" : ""}" data-inspector-tab="design" aria-pressed="${state.inspectorTab === "design"}">Design</button><button class="${state.inspectorTab === "prototype" ? "active" : ""}" data-inspector-tab="prototype" aria-pressed="${state.inspectorTab === "prototype"}">Prototype</button><button class="${state.inspectorTab === "review" ? "active" : ""}" data-inspector-tab="review" aria-pressed="${state.inspectorTab === "review"}">Review</button></div><div class="panel-scroll">${renderInspectorPanel(selection)}</div></aside>
    </div>
    ${renderDocumentSwitcher()}
  </main>${renderDialog()}${renderToast()}`;
}

async function mountEditorSurface(generation, documentId) {
  if (state.accessRemoved || !state.model) return;
  const host = root.querySelector('[data-role="openpencil-surface"]');
  if (!host) return;
  const firstFrameStartedAt = performance.now();
  try {
    const preparation = await state.enginePreparation;
    if (preparation?.error) throw preparation.error;
    if (
      generation !== state.engineMountGeneration
      || state.route !== "editor"
      || state.document?.id !== documentId
      || !state.model
      || state.engineSurface
    ) return;
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
        host.closest('[data-role="viewport"]')?.setAttribute("aria-busy", "false");
        host.querySelector(".engine-loading")?.remove();
        scheduleCompatibilityAnalysis(documentId);
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
        if (state.deferredSnapshotUpdates > 0) {
          state.updatesSinceSnapshot += state.deferredSnapshotUpdates;
          state.deferredSnapshotUpdates = 0;
          setTimeout(() => void flushPending(), 0);
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
      onGraphHydrated: () => {
        if (state.document?.id === documentId && state.layersOpen) renderLayersTree();
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

function scheduleCompatibilityAnalysis(documentId) {
  const analyze = () => {
    if (
      state.route !== "editor"
      || state.document?.id !== documentId
      || !state.model
      || !state.engineReady
    ) return;
    const document = currentMaterializedDocument();
    if (state.compatibilityDocument === document) return;
    state.compatibilityIssues = performanceMonitor.measure(
      "document.compatibility",
      () => analyzeOpenPencilCompatibility(
        document,
        state.assets,
        currentPreparedRenderDocument(),
      ),
      { documentId, nodes: state.documentNodes?.length ?? 0 },
    );
    state.compatibilityNodeIds = new Set(state.compatibilityIssues.map((issue) => issue.nodeId));
    state.compatibilityDocument = document;
    render();
  };
  if (typeof requestIdleCallback === "function") requestIdleCallback(analyze, { timeout: 500 });
  else setTimeout(analyze, 0);
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
    void mountEditorSurface(generation, documentId);
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
  bindLayerToolbar();
  bindLayersTree();
}

function currentLayerNodes(fallback = currentDocumentNodes()) {
  const editor = state.engineSurface?.editor;
  const graph = editor?.graph;
  if (!graph) return fallback;
  const pageId = editor.state.currentPageId ?? graph.getPages()?.[0]?.id;
  const nodes = listCanvasSceneLayers(graph, pageId, {
    hasDeferredChildren: (node) => state.engineSurface?.hasDeferredInstanceDetail(node.id) === true,
  });
  return nodes.length > 0 ? nodes : fallback;
}

function currentVisibleLayerNodes(fallback = currentDocumentNodes()) {
  return visibleCanvasSceneLayers(currentLayerNodes(fallback), state.expandedLayerIds);
}

function renderLayersPanelContent(nodes) {
  if (state.assetPanel === "assets") {
    const components = Object.keys(currentMaterializedDocument()?.components ?? {});
    const assets = [...state.assets.keys()];
    const rows = [
      ...components.map((name) => `<li>${icon("component")}<span>${escapeHtml(name)}</span><small>Component</small></li>`),
      ...assets.map((name) => `<li>${icon("image")}<span>${escapeHtml(name)}</span><small>Asset</small></li>`),
    ];
    return rows.length ? `<ul class="panel-resource-list">${rows.join("")}</ul>` : panelEmpty("No components or assets yet.");
  }
  if (state.assetPanel === "variables") {
    const variables = Object.entries(currentMaterializedDocument()?.variables ?? {});
    return variables.length
      ? `<ul class="panel-resource-list">${variables.map(([name, value]) => `<li>${icon("type")}<span>${escapeHtml(name)}</span><small>${escapeHtml(variablePreview(value))}</small></li>`).join("")}</ul>`
      : panelEmpty("No document variables yet.");
  }
  const query = state.layerSearch.trim().toLocaleLowerCase();
  const visible = query ? nodes.filter(({ node }) => String(node.name ?? node.content ?? node.type).toLocaleLowerCase().includes(query)) : nodes;
  return `<div role="tree" aria-label="Document layers">${visible.map(layerRow).join("") || panelEmpty("No layers match this search.")}</div><div class="components-row">${icon("component")}<span>Components</span><span class="components-count">${componentDefinitionCount()}</span></div>`;
}

function renderLayersPanelHeader(nodes) {
  if (state.assetPanel !== "layers") return "";
  const labels = { deck: "Slides", web: "Routes", mobile: "Screens", generic: "Frames" };
  const label = labels[state.document?.module] ?? "Frames";
  const count = nodes.filter(({ depth }) => depth === 0).length;
  const lower = label.toLowerCase();
  return `<div class="layers-toolbar">${state.layerSearchOpen ? `<label class="layer-search">${icon("search")}<input type="search" name="layer-search" autocomplete="off" data-role="layer-search" value="${escapeHtml(state.layerSearch)}" placeholder="Search ${escapeHtml(lower)}…" aria-label="Search ${escapeHtml(lower)}" /></label>` : `<span>${escapeHtml(label)} <b>${count}</b></span>`}<div><button class="icon-button" data-action="toggle-layer-search" aria-label="${state.layerSearchOpen ? "Close" : "Search"} ${escapeHtml(lower)}">${icon(state.layerSearchOpen ? "close" : "search")}</button><button class="icon-button" data-action="add-root-frame" aria-label="Add ${escapeHtml(lower)}">${icon("plus")}</button></div></div>`;
}

function panelEmpty(text) {
  return `<p class="panel-empty">${escapeHtml(text)}</p>`;
}

function variablePreview(value) {
  const resolved = value && typeof value === "object" && "value" in value ? value.value : value;
  return typeof resolved === "object" ? JSON.stringify(resolved) : String(resolved ?? "");
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
  if (state.inspectorTab === "prototype") {
    const flows = currentMaterializedDocument()?.flows ?? [];
    return flows.length
      ? `<section class="section"><h3>Prototype flows</h3><ul class="inspector-list">${flows.map((flow) => `<li><strong>${escapeHtml(flow.name ?? flow.id)}</strong><span>${escapeHtml(flow.trigger?.kind ?? "Trigger")} → ${escapeHtml(flow.destination ?? flow.target ?? "Destination")}</span></li>`).join("")}</ul></section>`
      : panelEmpty("No prototype flows in this design.");
  }
  if (state.inspectorTab === "review") {
    return state.compatibilityIssues.length
      ? `<section class="section"><h3>Compatibility review</h3><ul class="inspector-list">${state.compatibilityIssues.map((issue) => `<li><strong>${escapeHtml(issue.nodeId)}</strong><span>${escapeHtml(issue.message)}</span></li>`).join("")}</ul></section>`
      : panelEmpty("No compatibility issues detected.");
  }
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
  const layersToggle = root.querySelector('[data-action="toggle-layers"]');
  layersToggle?.setAttribute("aria-label", `${state.layersOpen ? "Hide" : "Show"} layers panel`);
  layersToggle?.setAttribute("aria-expanded", String(state.layersOpen));
  const inspectorToggle = root.querySelector('[data-action="toggle-inspector"]');
  inspectorToggle?.setAttribute("aria-label", `${state.inspectorOpen ? "Hide" : "Show"} design panel`);
  inspectorToggle?.setAttribute("aria-expanded", String(state.inspectorOpen));
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
    control = `<textarea id="field-${property}" class="field field-area" name="${escapeHtml(property)}" autocomplete="off" ${attributes} ${invalid}>${escapeHtml(text)}</textarea>`;
  } else if (kind === "boolean") {
    control = `<input id="field-${property}" class="field field-check" name="${escapeHtml(property)}" type="checkbox" ${attributes} ${displayed ? "checked" : ""} ${invalid} />`;
  } else {
    control = `<input id="field-${property}" class="field" name="${escapeHtml(property)}" autocomplete="off" type="${type === "number" ? "number" : "text"}" ${attributes} value="${escapeHtml(displayed)}" ${invalid} />`;
  }
  return `<div class="field-row ${full ? "full" : ""}"><label for="field-${property}">${escapeHtml(label)}</label>${control}${error ? `<span class="field-error" id="field-${property}-error">${escapeHtml(error)}</span>` : ""}</div>`;
}

function bindCommon() {
  bindAvatarFallbacks();
  root.querySelector('[data-action="retry"]')?.addEventListener("click", () => void bootstrap());
  if (state.route === "document-unavailable") {
    root.querySelector('[data-action="back"]')?.addEventListener("click", () => void navigateToLibrary());
  }
  root.querySelectorAll("[data-action=close-dialog]").forEach((button) =>
    button.addEventListener("click", closeDialog),
  );
}

function bindAvatarFallbacks() {
  root.querySelectorAll('img[data-avatar-fallback-label]').forEach((image) => {
    const replace = () => {
      if (!image.isConnected) return;
      const fallback = document.createElement('span');
      fallback.className = 'avatar avatar-fallback';
      fallback.setAttribute('aria-label', image.dataset.avatarFallbackLabel || 'Collaborator');
      fallback.textContent = image.dataset.avatarFallbackInitials || '?';
      image.replaceWith(fallback);
    };
    image.addEventListener('error', replace, { once: true });
    if (image.complete && image.naturalWidth === 0) replace();
  });
}

function bindLibrary() {
  root.querySelector('[data-action="open-trash"]')?.addEventListener("click", () => void navigateToTrash());
  root.querySelector('[data-action="back-to-files"]')?.addEventListener("click", () => {
    clearLibrarySearch();
    void navigateToLibrary();
  });
  root.querySelector('[data-action="folder-home"]')?.addEventListener("click", () => {
    clearLibrarySearch();
    void navigateToLibrary();
  });
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
  root.querySelector('[data-action="move-designs-here"]')?.addEventListener("click", () => {
    if (state.currentFolder) void moveDesignsHere(state.currentFolder);
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
    state.searchGeneration += 1;
    state.searchTrashGeneration += 1;
    state.searchTrashMatchingCount = null;
    state.searchTrashFailed = false;
    state.error = null;
    if (!state.search.trim()) {
      state.searchScope = "everywhere";
      state.searchLoading = false;
    }
    scheduleSearchRender();
    if (state.route === "trash") {
      clearTimeout(state.trashSearchTimer);
      state.trashItems = [];
      state.trashLoaded = false;
      state.trashSearchTimer = setTimeout(() => void documentCollectionLifecycle.refresh(), 200);
    } else {
      scheduleDocumentSearch();
    }
  });
  root.querySelectorAll('[data-action="set-collection-view"]').forEach((button) => button.addEventListener("click", () => {
    const view = button.dataset.view;
    if (view !== "grid" && view !== "list") return;
    state.collectionView = view;
    render();
  }));
  root.querySelector('[data-action="choose-collection-sort"]')?.addEventListener("click", () => void chooseCollectionSort());
  root.querySelectorAll("[data-search-scope]").forEach((button) => button.addEventListener("click", () => {
    state.searchScope = button.dataset.searchScope;
    render();
  }));
  root.querySelectorAll('[data-action="clear-search"]').forEach((button) => button.addEventListener("click", () => {
    clearLibrarySearch();
    render();
    root.querySelector('[data-role="search"]')?.focus();
  }));
  root.querySelector('[data-action="create-from-search"]')?.addEventListener("click", () => {
    state.dialog = { kind: "new-design", name: state.search.trim() };
    state.dialogFocusSelector = '[data-role="design-name"]';
    render();
  });
  root.querySelector('[data-action="move-designs-here"]')?.addEventListener("click", () => void openMoveDesignsHere());
  root.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => {
    void activateLibraryTab(state.route, button.dataset.filter, {
      select: (filter) => { state.libraryFilter = filter; },
      navigateToLibrary: () => {
        clearLibrarySearch();
        return navigateToLibrary();
      },
      render,
    });
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
  root.querySelectorAll("[data-document-menu]").forEach((button) => button.addEventListener("click", () => {
    const document = [...state.documents, ...state.folderDocuments]
      .find((item) => item.id === button.dataset.documentMenu);
    if (document) void openDocumentContextMenu(document);
  }));
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
  root.querySelectorAll("[data-folder-menu]").forEach((button) => button.addEventListener("click", () => {
    const folder = [...state.folders, ...state.recentFolders, ...state.folderChildren]
      .find((item) => item.id === button.dataset.folderMenu);
    if (folder) void openFolderContextMenu(folder);
  }));
  root.querySelectorAll("[data-restore-document]").forEach((button) => button.addEventListener("click", (event) => void act(async () => {
    await api.restoreDocument(button.dataset.restoreDocument);
    await documentCollectionLifecycle.refresh();
    setToast("Document restored.");
    render();
  }, { button: event.currentTarget, key: "restore", subjectId: button.dataset.restoreDocument, label: "Restoring…" })));
  root.querySelectorAll("[data-restore-folder]").forEach((button) => button.addEventListener("click", (event) => void act(async () => {
    await api.restoreFolder(button.dataset.restoreFolder);
    await documentCollectionLifecycle.refresh();
    setToast("Folder restored.");
    render();
  }, { button: event.currentTarget, key: "restore", subjectId: button.dataset.restoreFolder, label: "Restoring…" })));
  root.querySelectorAll("[data-delete-folder]").forEach((button) => button.addEventListener("click", () => {
    const folder = state.trashItems.find((item) => item.kind === "folder" && item.id === button.dataset.deleteFolder);
    if (!folder) return;
    state.dialog = { kind: "confirm-permanently-delete-folder", folderId: folder.id, name: folder.title };
    state.dialogFocusSelector = '[data-action="cancel-folder-delete"]';
    render();
  }));
  root.querySelectorAll("[data-permanently-delete-document]").forEach((button) => button.addEventListener("click", () => {
    const document = state.trashItems.find((item) => item.kind === "document" && item.id === button.dataset.permanentlyDeleteDocument);
    if (!document) return;
    state.dialog = documentPermanentDeleteConfirmation(document);
    state.dialogFocusSelector = '[data-action="cancel-confirmation"]';
    render();
  }));
  root.querySelector('[data-action="cancel-confirmation"]')?.addEventListener("click", cancelDestructiveConfirmation);
  root.querySelector('[data-action="confirm-trash-document"]')?.addEventListener("click", (event) => void confirmDestructiveAction(event.currentTarget));
  root.querySelector('[data-action="confirm-permanently-delete-document"]')?.addEventListener("click", (event) => void confirmDestructiveAction(event.currentTarget));
  root.querySelector('[data-action="load-more-trash"]')?.addEventListener("click", () => void loadMoreTrash());
  root.querySelector('[data-action="empty-trash"]')?.addEventListener("click", () => {
    state.dialog = { kind: "confirm-empty-trash" };
    state.dialogFocusSelector = '[data-action="cancel-empty-trash"]';
    render();
  });
  bindFolderDialogs();
}

async function chooseCollectionSort() {
  const action = await runtime.contextMenu.show(COLLECTION_SORT_OPTIONS.map((option) => ({
    id: `collection-sort:${option.id}`,
    label: option.label,
  })));
  if (!action?.startsWith("collection-sort:")) return;
  const sort = action.slice("collection-sort:".length);
  if (!COLLECTION_SORT_OPTIONS.some((option) => option.id === sort)) return;
  state.collectionSort = sort;
  render();
}

async function moveDesignsHere(folder) {
  const candidates = state.documents.filter((document) => document.folderId !== folder.id);
  if (!candidates.length) {
    setToast("No other designs are available to move.");
    render();
    return;
  }
  const action = await runtime.contextMenu.show(candidates.map((document) => ({
    id: `move-document:${document.id}`,
    label: document.title,
  })));
  if (!action?.startsWith("move-document:")) return;
  const document = candidates.find((item) => item.id === action.slice("move-document:".length));
  if (!document) return;
  await act(async () => {
    const moved = await api.moveDocument(document.id, folder.id);
    upsertDocumentSummary(moved, document.folderId);
    setToast(`Moved ${moved.title} to ${folder.name}.`);
    render();
  }, { key: "move-design-into-folder", subjectId: document.id, label: "Moving…" });
}

async function openDocumentContextMenu(document) {
  const folders = await loadFolderTree();
  const action = await runtime.contextMenu.show([
    { id: "open", label: "Open" },
    ...(document.access === "owner" ? [{ id: "rename", label: "Rename" }] : []),
    { id: "duplicate", label: "Duplicate" },
    { type: "submenu", label: "Move to folder", items: [
      ...folderMoveMenu(folders, document.folderId),
      { type: "separator" },
      { id: "move:root", label: "Unfiled (Home)", enabled: document.folderId !== null },
      { id: "new-folder", label: "New folder…" },
    ] },
    ...(document.folderId ? [{ id: "remove", label: `Remove from ${knownFolder(document.folderId)?.name ?? "folder"}` }] : []),
    ...(document.access === "owner" ? [{ id: "share", label: "Share" }] : []),
    { id: "export", label: "Export" },
    { type: "separator" },
    { id: "trash", label: "Move to Trash", destructive: true },
  ]);
  if (!action) return;
  if (action === "open") return navigateToDocument(document.id);
  if (action === "rename") {
    state.dialog = { kind: "document-rename", documentId: document.id, name: document.title };
    state.dialogFocusSelector = '[data-role="document-name"]';
    return render();
  }
  if (action === "duplicate") return duplicateDocument(document);
  if (action === "new-folder") {
    state.dialog = {
      kind: "folder-form",
      mode: "create-for-document",
      document,
    };
    state.dialogFocusSelector = '[data-role="folder-name"]';
    return render();
  }
  if (action.startsWith("move:")) {
    const folderId = action === "move:root" ? null : action.slice(5);
    return act(async () => {
      const moved = await api.moveDocument(document.id, folderId);
      upsertDocumentSummary(moved, document.folderId);
      render();
    });
  }
  if (action === "remove") {
    return act(async () => {
      const moved = await api.moveDocument(document.id, null);
      upsertDocumentSummary(moved, document.folderId);
      render();
    });
  }
  if (action === "share") return openShare({ type: "document", id: document.id, name: document.title });
  if (action === "export") {
    state.dialog = { kind: "export-handoff", documentId: document.id, name: document.title };
    state.dialogFocusSelector = '[data-action="open-export-design"]';
    return render();
  }
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
      { id: "new-folder", label: "New folder inside" },
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
  if (action === "new-folder") {
    state.dialog = nestedFolderForm(folder);
    state.dialogFocusSelector = '[data-role="folder-name"]';
    return render();
  }
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
  bindLayerToolbar();
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
  root.querySelector('[data-action="document-switcher"]')?.addEventListener("click", () => {
    state.documentSwitcherOpen = !state.documentSwitcherOpen;
    root.querySelector(".document-switcher-panel").hidden = !state.documentSwitcherOpen;
    root.querySelector(".document-switcher-scrim").hidden = !state.documentSwitcherOpen;
    if (state.documentSwitcherOpen) root.querySelector('[data-role="document-switcher-search"]')?.focus();
  });
  root.querySelector('[data-action="close-document-switcher"]')?.addEventListener("click", () => {
    state.documentSwitcherOpen = false;
    root.querySelector(".document-switcher-panel").hidden = true;
    root.querySelector(".document-switcher-scrim").hidden = true;
  });
  root.querySelector('[data-role="document-switcher-search"]')?.addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    let visible = 0;
    root.querySelectorAll("[data-switch-document]").forEach((button) => {
      button.hidden = Boolean(query) && !button.dataset.switchTitle.includes(query);
      if (!button.hidden) visible += 1;
    });
    root.querySelector(".document-switcher-empty").hidden = visible !== 0;
  });
  root.querySelectorAll("[data-switch-document]").forEach((button) => button.addEventListener("click", () => {
    const documentId = button.dataset.switchDocument;
    state.documentSwitcherOpen = false;
    if (!documentId || documentId === state.document.id) {
      root.querySelector(".document-switcher-panel").hidden = true;
      root.querySelector(".document-switcher-scrim").hidden = true;
      return;
    }
    void navigateToDocument(documentId);
  }));
  root.querySelector('[data-action="switcher-new-design"]')?.addEventListener("click", () => {
    state.documentSwitcherOpen = false;
    state.dialog = { kind: "new-design" };
    state.dialogFocusSelector = '[data-role="design-name"]';
    render();
  });
  root.querySelector('[data-action="switcher-open-folder"]')?.addEventListener("click", () => {
    state.documentSwitcherOpen = false;
    void (state.document.folderId ? navigateToFolder(state.document.folderId) : navigateToLibrary());
  });
  root.querySelector('[data-action="compatibility"]')?.addEventListener("click", () => openDialog("compatibility", '[data-action="compatibility"]'));
  root.querySelector('[data-action="menu"]')?.addEventListener("click", () => void openDocumentContextMenu({ ...state.document, folderId: state.document.folderId ?? null }));
  root.querySelector('[data-action="trash-document"]')?.addEventListener("click", () => {
    state.dialog = documentTrashConfirmation(state.document);
    state.dialogFocusSelector = '[data-action="cancel-confirmation"]';
    render();
  });
  root.querySelector('[data-action="grant"]')?.addEventListener("click", (event) => void act(async () => {
    const input = root.querySelector('[data-role="share-email"]');
    const email = input?.value.trim();
    if (!email) return;
    await api.grantAccess(state.document.id, email);
    state.grants = (await api.listGrants(state.document.id)).items;
    render();
  }, { button: event.currentTarget, key: "invite", subjectId: state.document.id, label: "Inviting…" }));
  root.querySelectorAll("[data-revoke-grant]").forEach((button) => button.addEventListener("click", () => {
    const grant = state.grants.find((item) => item.id === button.dataset.revokeGrant);
    if (!grant) return;
    state.dialog = collaboratorRemovalConfirmation(grant);
    state.dialogFocusSelector = '[data-action="cancel-confirmation"]';
    render();
  }));
  root.querySelector('[data-action="cancel-confirmation"]')?.addEventListener("click", cancelDestructiveConfirmation);
  root.querySelector('[data-action="confirm-trash-document"]')?.addEventListener("click", (event) => void confirmDestructiveAction(event.currentTarget));
  root.querySelector('[data-action="confirm-remove-collaborator"]')?.addEventListener("click", (event) => void confirmDestructiveAction(event.currentTarget));
}

function bindLayerToolbar() {
  root.querySelector('[data-action="toggle-layer-search"]')?.addEventListener("click", () => {
    state.layerSearchOpen = !state.layerSearchOpen;
    if (!state.layerSearchOpen) state.layerSearch = "";
    renderLayersTree();
    if (state.layerSearchOpen) root.querySelector('[data-role="layer-search"]')?.focus();
  });
  root.querySelector('[data-role="layer-search"]')?.addEventListener("input", (event) => {
    state.layerSearch = event.target.value;
    const scroll = root.querySelector(".side-panel.layers .panel-scroll");
    if (scroll) {
      scroll.innerHTML = renderLayersPanelContent(currentVisibleLayerNodes());
      bindLayersTree();
    }
  });
  root.querySelector('[data-action="add-root-frame"]')?.addEventListener("click", addRootFrame);
}

function addRootFrame() {
  if (!state.model || !state.document) return;
  const existing = currentDocumentNodes().filter(({ depth }) => depth === 0);
  const frame = structuredClone(createBlankDocumentSource({ module: state.document.module }).children[0]);
  frame.id = crypto.randomUUID();
  frame.name = `${({ deck: "Slide", web: "Route", mobile: "Screen", generic: "Frame" })[state.document.module] ?? "Frame"} ${existing.length + 1}`;
  frame.x += existing.length * 40;
  frame.y += existing.length * 40;
  mutate(state.model, { kind: "insert-node", node: frame, parentId: null, position: existing.length }, LOCAL_ORIGIN);
  queueMicrotask(() => selectNode(frame.id, { focus: true }));
  setToast(`${frame.name} added.`);
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
      else {
        state.engineSurface?.ensureInstanceDetail(nodeId);
        state.expandedLayerIds.add(nodeId);
      }
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
      state.engineSurface?.ensureInstanceDetail(element.dataset.nodeId);
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
  const restoreButton = button ? setButtonPending(button, { key: "copy-reference", subjectId: state.selectedId, label: "Copying…" }) : null;
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
      restoreButton?.();
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
      restoreButton?.();
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
  const command = event.metaKey || event.ctrlKey;
  if (command && event.key.toLocaleLowerCase() === "k") {
    event.preventDefault();
    const search = root.querySelector('[data-role="search"]');
    if (search) search.focus();
    else if (state.route === "editor") {
      state.documentSwitcherOpen = true;
      root.querySelector(".document-switcher-panel").hidden = false;
      root.querySelector(".document-switcher-scrim").hidden = false;
      root.querySelector('[data-role="document-switcher-search"]')?.focus();
    }
    return;
  }
  if (state.documentSwitcherOpen && command && event.key.toLocaleLowerCase() === "n") {
    event.preventDefault();
    root.querySelector('[data-action="switcher-new-design"]')?.click();
    return;
  }
  if (state.documentSwitcherOpen && event.key === "Tab") {
    trapFocusWithin(event, root.querySelector(".document-switcher-panel"));
    return;
  }
  if (state.documentSwitcherOpen && event.key === "Escape") {
    event.preventDefault();
    state.documentSwitcherOpen = false;
    root.querySelector(".document-switcher-panel").hidden = true;
    root.querySelector(".document-switcher-scrim").hidden = true;
    root.querySelector('[data-action="document-switcher"]')?.focus();
    return;
  }
  if (state.route !== "editor" || !state.model || event.defaultPrevented) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
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
  for (const panel of root.querySelectorAll(".side-panel.inspector")) {
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
  state.shareLoading = true;
  state.dialogFocusSelector = '[data-role="share-email"]';
  render();
  await act(async () => {
    state.grants = await loadShareGrants(state.shareTarget);
  });
  state.shareLoading = false;
  render();
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
  if (state.dialog.kind === "document-rename") {
    return dialog(
      "Rename design",
      `<div class="field-row"><label for="document-name">Name</label><input id="document-name" class="field" name="document-name" autocomplete="off" data-role="document-name" value="${escapeHtml(state.dialog.name)}" /></div>`,
      `<button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="save-document-name">Rename</button>`,
    );
  }
  if (state.dialog.kind === "move-designs-here") {
    const candidates = sortCollection(state.documents.filter((document) => document.folderId !== state.dialog.folderId && document.access === "owner"), "name");
    const rows = candidates.map((document) => `<label class="move-design-row"><input type="checkbox" name="move-design" data-role="move-design-checkbox" value="${document.id}" /><span><strong>${escapeHtml(document.title)}</strong><small>${escapeHtml(knownFolder(document.folderId)?.name ?? "Unfiled")}</small></span></label>`).join("");
    const body = state.dialog.loading
      ? `<section class="dialog-empty" role="status"><p>Loading designs…</p></section>`
      : state.dialog.error
        ? `<section class="dialog-empty"><p class="error-copy">${escapeHtml(state.dialog.error)}</p></section>`
        : rows ? `<p class="dialog-intro">Select one or more designs. Their sharing settings stay unchanged.</p><div class="move-design-list">${rows}</div>` : `<section class="dialog-empty"><p>Every design is already in this folder.</p></section>`;
    const action = state.dialog.error
      ? `<button class="button primary" data-action="retry-move-designs">Try again</button>`
      : `<button class="button primary" data-action="confirm-move-designs" ${rows && !state.dialog.loading ? "" : "disabled"}>Move selected</button>`;
    return dialog(
      `Move designs to ${state.dialog.folderName}`,
      body,
      `<button class="button" data-action="close-dialog">Cancel</button>${action}`,
    );
  }
  if (state.dialog.kind === "export-handoff") {
    return dialog(
      "Export design",
      `<p>Canvas exports are generated by the trusted App operation so destination access and compatibility checks remain explicit. Open the design, then ask the Agent to export the required frames and format.</p>`,
      `<button class="button" data-action="close-dialog">Cancel</button><button class="button primary" data-action="open-export-design">Open design</button>`,
    );
  }
  if (state.dialog.kind === "folder-form") {
    const creating = state.dialog.mode !== "rename";
    return dialog(
      creating ? "New folder" : "Rename folder",
      `<div class="field-row"><label for="folder-name">Name</label><input id="folder-name" class="field" name="folder-name" autocomplete="off" data-role="folder-name" value="${escapeHtml(state.dialog.name ?? "")}" /></div>`,
      `<button class="button" data-action="cancel-folder-form">Cancel</button><button class="button primary" data-action="save-folder">${creating ? "Create" : "Rename"}</button>`,
    );
  }
  if (state.dialog.kind === "new-design") {
    const selectedModule = state.dialog.module ?? "deck";
    const selectedFolderId = state.dialog.folderId ?? (state.route === "folder" ? state.currentFolder?.id ?? "" : "");
    const availableFolders = state.currentFolder && !state.folders.some((folder) => folder.id === state.currentFolder.id)
      ? [...state.folders, state.currentFolder]
      : state.folders;
    const folderOptions = availableFolders.map((folder) => `<option value="${escapeHtml(folder.id)}" data-design-count="${folder.designCount}" ${folder.id === selectedFolderId ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("");
    const selectedFolder = availableFolders.find((folder) => folder.id === selectedFolderId);
    const selectedDesignCount = selectedFolder?.designCount ?? state.documents.length;
    return dialog(
      "New design",
      `<p class="dialog-intro">Choose what you’re making. Only Generic can change later.</p><div class="module-picker" role="radiogroup" aria-label="Design type">${moduleChoice("generic", "Generic", "frame", "Free canvas for flyers, social, print, anything.", selectedModule === "generic")}${moduleChoice("deck", "Deck", "deck", "Slides with a fixed 16:9 stage.", selectedModule === "deck")}${moduleChoice("web", "Web", "web", "Responsive routes and sections.", selectedModule === "web")}${moduleChoice("mobile", "Mobile", "mobile", "Phone-sized screens and flows.", selectedModule === "mobile")}</div><div class="design-fields"><div class="field-row"><label for="design-name">Name</label><input id="design-name" class="field" name="design-name" autocomplete="off" data-role="design-name" value="${escapeHtml(state.dialog.name ?? "Untitled")}" /></div><div class="field-row"><label for="design-folder">Save in</label><span class="design-folder-control">${icon("folder")}<select id="design-folder" name="design-folder" autocomplete="off" data-role="design-folder"><option value="" data-design-count="${state.documents.length}">All designs</option>${folderOptions}</select><small data-role="design-folder-count">${selectedDesignCount} design${selectedDesignCount === 1 ? "" : "s"}</small>${icon("chevron-down")}</span></div></div>`,
      `<button class="button" data-action="cancel-new-design">Cancel</button><button class="button primary" data-action="create-design">${icon("plus")}Create ${moduleLabel(selectedModule).toLowerCase()}</button>`,
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
  if (state.dialog.kind === "confirm-empty-trash") {
    return dialog(
      "Empty Trash?",
      `<p>This permanently deletes ${state.trashTotalCount} item${state.trashTotalCount === 1 ? "" : "s"}. This cannot be undone.</p>`,
      `<button class="button" data-action="cancel-empty-trash" autofocus>Cancel</button><button class="button danger" data-action="confirm-empty-trash">Empty trash</button>`,
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
  const people = shareAccessPeople(state.currentProfile, state.grants);
  const invite = state.shareLoading
    ? `<button class="button primary" data-action="grant" disabled aria-busy="true">${icon("loader")}Loading…</button>`
    : `<button class="button primary" data-action="grant">Invite</button>`;
  return `<div class="share-dialog-body"><div class="share-form"><div class="share-email-control">${icon("mail")}<input data-role="share-email" name="collaborator-email" autocomplete="email" spellcheck="false" type="email" placeholder="name@example.com…" aria-label="Collaborator email" ${state.shareLoading ? "disabled" : ""} /></div>${invite}</div><div class="share-people"><div class="share-people-heading"><strong>People with access</strong><span>${people.length}</span></div>${people.map(sharePersonRow).join("")}</div></div>`;
}

function sharePersonRow(person) {
  const name = profileLabel(person);
  const detail = person.email ?? (person.isOwner ? "Owner" : person.status === "pending" ? "Pending invitation" : "Editor");
  const inherited = person.inheritedFrom ? `<span class="share-inherited">via ${escapeHtml(person.inheritedFrom)}</span>` : "";
  return `<div class="share-person-row">${avatar(person)}<div class="share-person-copy"><div class="share-person-name"><strong>${escapeHtml(name)}</strong>${inherited}</div><span>${escapeHtml(detail)}</span></div>${person.isOwner ? `<span class="share-access-label">Owner</span>` : person.inheritedFrom ? "" : `<button class="share-remove" data-revoke-grant="${escapeHtml(person.id)}">Remove</button>`}</div>`;
}

function bindFolderDialogs() {
  root.querySelector('[data-action="save-document-name"]')?.addEventListener("click", () => void act(async () => {
    const name = root.querySelector('[data-role="document-name"]')?.value.trim();
    if (!name) return;
    const { documentId } = state.dialog;
    await api.renameDocument(documentId, name);
    const document = [...state.documents, ...state.folderDocuments].find((item) => item.id === documentId);
    if (document) upsertDocumentSummary({ ...document, title: name });
    state.dialog = null;
    setToast("Document renamed.");
    render();
  }));
  root.querySelector('[data-action="confirm-move-designs"]')?.addEventListener("click", () => void act(async () => {
    const folderId = state.dialog.folderId;
    const selected = [...root.querySelectorAll('[data-role="move-design-checkbox"]:checked')].map((input) => input.value);
    if (!selected.length) return;
    const originals = new Map(state.documents.map((document) => [document.id, document.folderId]));
    state.dialog = null;
    render();
    const moved = await Promise.all(selected.map((documentId) => api.moveDocument(documentId, folderId)));
    for (const document of moved) upsertDocumentSummary(document, originals.get(document.id));
    await refreshFolderCollection(folderId);
    setToast(`Moved ${moved.length} design${moved.length === 1 ? "" : "s"}.`);
    render();
  }));
  root.querySelector('[data-action="retry-move-designs"]')?.addEventListener("click", () => void openMoveDesignsHere());
  root.querySelector('[data-action="open-export-design"]')?.addEventListener("click", () => {
    const documentId = state.dialog.documentId;
    state.dialog = null;
    void navigateToDocument(documentId).then(() => setToast("Ask the Agent to export this design with the required format and destination."));
  });
  root.querySelectorAll('[data-role="design-module"]').forEach((control) => control.addEventListener("change", () => {
    const create = root.querySelector('[data-action="create-design"]');
    if (create) create.innerHTML = `${icon("plus")}Create ${moduleLabel(control.value).toLowerCase()}`;
  }));
  root.querySelector('[data-role="design-folder"]')?.addEventListener("change", (event) => {
    const option = event.target.selectedOptions[0];
    const count = Number(option?.dataset.designCount ?? 0);
    const label = root.querySelector('[data-role="design-folder-count"]');
    if (label) label.textContent = `${count} design${count === 1 ? "" : "s"}`;
  });
  root.querySelector('[data-action="cancel-new-design"]')?.addEventListener("click", closeDialog);
  root.querySelector('[data-action="create-design"]')?.addEventListener("click", (event) => void act(async () => {
    const title = root.querySelector('[data-role="design-name"]')?.value.trim();
    const module = root.querySelector('[data-role="design-module"]:checked')?.value;
    const folderId = root.querySelector('[data-role="design-folder"]')?.value ?? undefined;
    if (!title || !["generic", "deck", "web", "mobile"].includes(module)) return;
    state.dialog = { ...state.dialog, title, module, folderId };
    await createBlankDocument(title, module, folderId);
  }, { button: event.currentTarget, key: "create-design", label: "Creating…" }));
  root.querySelector('[data-action="cancel-folder-form"]')?.addEventListener("click", closeDialog);
  root.querySelector('[data-action="save-folder"]')?.addEventListener("click", (event) => void act(async () => {
    const name = root.querySelector('[data-role="folder-name"]')?.value.trim();
    if (!name) return;
    const form = state.dialog;
    state.dialog = { ...form, name };
    if (form.mode === "create-for-document") {
      const { folder, movedDocument } = await createFolderForDocument(api, {
        name,
        document: form.document,
      });
      upsertFolderSummary(folder);
      upsertDocumentSummary(movedDocument, form.document.folderId);
    } else {
      const folder = form.mode === "create" || form.mode === "create-child"
        ? await api.createFolder(name, folderCreationParentId(form, {
          route: state.route,
          currentFolderId: state.currentFolder?.id ?? null,
        }))
        : await api.updateFolder(form.folderId, { name });
      upsertFolderSummary(folder);
    }
    state.dialog = null;
    render();
  }, { button: event.currentTarget, key: "save-folder", subjectId: state.dialog?.folderId ?? null, label: state.dialog?.mode === "rename" ? "Renaming…" : "Creating…" }));
  root.querySelector('[data-action="cancel-folder-trash"]')?.addEventListener("click", closeDialog);
  root.querySelector('[data-action="confirm-folder-trash"]')?.addEventListener("click", (event) => void act(async () => {
    const folderId = state.dialog.folderId;
    const parentId = knownFolder(folderId)?.parentId ?? null;
    await api.deleteFolder(folderId);
    state.dialog = null;
    removeFolderSummary(folderId);
    if (state.currentFolder?.id === folderId) {
      await (parentId ? navigateToFolder(parentId) : navigateToLibrary());
    } else render();
  }, { button: event.currentTarget, key: "trash-folder", subjectId: state.dialog?.folderId, label: "Moving…" }));
  root.querySelector('[data-action="cancel-folder-delete"]')?.addEventListener("click", closeDialog);
  root.querySelector('[data-action="confirm-folder-delete"]')?.addEventListener("click", (event) => void act(async () => {
    const folderId = state.dialog.folderId;
    await api.permanentlyDeleteFolder(folderId);
    state.dialog = null;
    await documentCollectionLifecycle.refresh();
    render();
  }, { button: event.currentTarget, key: "delete-folder", subjectId: state.dialog?.folderId, label: "Deleting…" }));
  root.querySelector('[data-action="cancel-empty-trash"]')?.addEventListener("click", closeDialog);
  root.querySelector('[data-action="confirm-empty-trash"]')?.addEventListener("click", (event) => void act(async () => {
    const result = await api.emptyTrash();
    state.dialog = null;
    await documentCollectionLifecycle.refresh();
    setToast(`Permanently deleted ${result.documentCount + result.folderCount} item${result.documentCount + result.folderCount === 1 ? "" : "s"}.`);
    render();
  }, { button: event.currentTarget, key: "empty-trash", label: "Deleting…" }));
  root.querySelector('[data-action="grant"]')?.addEventListener("click", (event) => void act(async () => {
    const email = root.querySelector('[data-role="share-email"]')?.value.trim();
    if (!email || !state.shareTarget) return;
    if (state.shareTarget.type === "folder") await api.grantFolderAccess(state.shareTarget.id, email);
    else await api.grantAccess(state.shareTarget.id, email);
    state.grants = await loadShareGrants(state.shareTarget);
    render();
  }, { button: event.currentTarget, key: "invite", subjectId: state.shareTarget?.id, label: "Inviting…" }));
  root.querySelectorAll("[data-revoke-grant]").forEach((button) => button.addEventListener("click", (event) => void act(async () => {
    if (!state.shareTarget) return;
    if (state.shareTarget.type === "folder") await api.revokeFolderGrant(state.shareTarget.id, button.dataset.revokeGrant);
    else await api.revokeGrant(state.shareTarget.id, button.dataset.revokeGrant);
    state.grants = await loadShareGrants(state.shareTarget);
    render();
  }, { button: event.currentTarget, key: "remove-access", subjectId: button.dataset.revokeGrant, label: "Removing…" })));
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

async function confirmDestructiveAction(button = null) {
  if (!isDestructiveConfirmation(state.dialog)) return;
  const confirmation = state.dialog;
  const pendingLabel = confirmation.kind === "confirm-trash-document" ? "Moving…" : confirmation.kind === "confirm-remove-collaborator" ? "Removing…" : "Deleting…";
  const subjectId = confirmation.documentId ?? confirmation.grantId;
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
      await documentCollectionLifecycle.refresh();
      setToast("Document permanently deleted.");
      render();
      return;
    }
    state.grants = (await api.listGrants(state.document.id)).items;
    state.dialog = "share";
    state.dialogFocusSelector = '[data-role="share-email"]';
    render();
  }, button ? { button, key: confirmation.kind, subjectId, label: pendingLabel } : null);
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
  trapFocusWithin(event, root.querySelector('[role="dialog"]'));
}

function trapFocusWithin(event, container) {
  if (!container) return;
  const controls = [...container.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
  if (controls.length === 0) return;
  const first = controls[0];
  const last = controls.at(-1);
  if (!container.contains(document.activeElement)) {
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

async function act(action, pending = null) {
  const restoreButton = pending?.button ? setButtonPending(pending.button, pending) : null;
  try {
    state.error = null;
    await action();
  } catch (error) {
    setToast(message(error), true);
    render();
  } finally {
    restoreButton?.();
  }
}

function setButtonPending(button, options) {
  const original = {
    disabled: button.disabled,
    ariaBusy: button.getAttribute("aria-busy"),
    html: button.innerHTML,
  };
  const view = actionButtonState(
    { key: options.key, subjectId: options.subjectId ?? null },
    {
      key: options.key,
      subjectId: options.subjectId ?? null,
      label: button.textContent?.trim() ?? "",
      pendingLabel: options.label,
      icon: null,
    },
  );
  button.disabled = view.disabled;
  button.setAttribute("aria-busy", view.ariaBusy);
  button.innerHTML = `${icon(view.icon)}${escapeHtml(view.label)}`;
  return () => {
    if (!button.isConnected) return;
    button.disabled = original.disabled;
    if (original.ariaBusy === null) button.removeAttribute("aria-busy");
    else button.setAttribute("aria-busy", original.ariaBusy);
    button.innerHTML = original.html;
  };
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

function daysUntil(value) {
  const remaining = new Date(value).getTime() - Date.now();
  return Math.max(0, Math.ceil(remaining / 86_400_000));
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
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    sparkles: '<path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2zM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8zM19 14l.7 1.8 1.8.7-1.8.7L19 19l-.7-1.8-1.8-.7 1.8-.7z"/>',
    frame: '<path d="M5 5h14v14H5z"/><path d="M3 8h4M17 8h4M8 3v4M8 17v4"/>',
    folder: '<path d="M3 6h7l2 2h9v11H3z"/>',
    "folder-plus": '<path d="M3 7h7l2 2h9v10H3z"/><path d="M12 12v5M9.5 14.5h5"/>',
    "folder-input": '<path d="M3 6h7l2 2h9v11H3z"/><path d="M12 11v7M9 15l3 3 3-3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/>',
    "search-off": '<circle cx="11" cy="11" r="6"/><path d="m16 16 4 4M8.8 8.8l4.4 4.4m0-4.4-4.4 4.4"/>',
    chevron: '<path d="m9 6 6 6-6 6"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "arrow-up-down": '<path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/>',
    pencil: '<path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10z"/><path d="m14 7 3 3"/>',
    grid: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".7"/><circle cx="4" cy="12" r=".7"/><circle cx="4" cy="18" r=".7"/>',
    canvas: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8 15 11 9l2 4 2-2 2 4"/>',
    generic: '<circle cx="8" cy="8" r="3"/><rect x="13" y="5" width="6" height="6" rx="1"/><path d="m5 19 3-6 3 6zM14 14h5v5h-5z"/>',
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
    loader: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
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
