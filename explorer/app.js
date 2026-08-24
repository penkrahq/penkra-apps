import {
  escapeHtml, extensionOf, fileIconName, finderRelativePath, joinRelative, looksLikeText,
  matchesQuery, parentRelative, previewKind, sortEntries, treeRowIndent,
} from "./explorer-model.mjs";
import {
  chooseExplorerRoot, createDirectory, forgetExplorerRoot, listDirectory, readEntry,
  rememberExplorerRoot, restoreExplorerRoot, statEntry, watchEntry, writeTextEntry,
} from "./explorer-files.mjs";
import { createEditor, renderMarkdown, runEditorHistoryShortcut } from "./vendor/editor-runtime.mjs";

const runtime = globalThis.penkra;
if (!runtime?.files || !runtime?.tab) throw new Error("Explorer requires the Penkra App runtime.");

const icons = {
  back: '<path d="m15 18-6-6 6-6"/>', forward: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>', folder: '<path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
  folderOpen: '<path d="M3 7h6l2 2h10l-2 9H5L3 7Z"/>',
  folderPlus: '<path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/><path d="M12 11v6m-3-3h6"/>',
  file: '<path d="M6 2h8l4 4v16H6V2Z"/><path d="M14 2v5h5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m3 16 5-5 4 4 2-2 7 7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.4-5.7L20 8"/><path d="M20 3v5h-5"/>',
  warning: '<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
};

const savedRailWidth = Number(localStorage.getItem("explorer.railWidth"));
const state = {
  handle: null, root: null, directoryCache: new Map(), expanded: new Set(), selected: null,
  query: "", searchResults: [], searchBusy: false, loading: true, error: null, preview: null,
  markdownMode: "preview", svgMode: "preview", history: [], historyIndex: -1, newFolder: false, menuOpen: false,
  drafts: new Map(), watchers: new Map(), watchTimers: new Map(), railScroll: new Map(),
  railWidth: Number.isFinite(savedRailWidth) ? Math.min(520, Math.max(180, savedRailWidth)) : 240,
  focusedPath: null,
};

const root = document.querySelector("#app");
let objectUrl = null;
let markdownUrls = new Set();
let editorView = null;
let editorPath = null;
let searchSequence = 0;
let activationSequence = 0;
let searchTimer = null;
let typeahead = { value: "", timer: null };
let resizing = null;

function icon(name, className = "") {
  return `<svg class="${className}" aria-hidden="true" viewBox="0 0 24 24">${icons[name]}</svg>`;
}

function entryIcon(entry, expanded = false) {
  const name = fileIconName(entry, expanded);
  return name
    ? `<img class="file-type-icon" src="assets/file-icons/${name}.svg" alt="" />`
    : icon(entry.kind === "directory" ? (expanded ? "folderOpen" : "folder") : "file", "tree-file-icon");
}

function cleanupObjectUrl() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function cleanupMarkdownUrls() {
  for (const url of markdownUrls) void runtime.files.closeUrl(url).catch(() => undefined);
  markdownUrls = new Set();
}

function cleanupEditor() {
  if (!editorView) return;
  const draft = state.drafts.get(editorPath);
  if (draft) draft.editorState = editorView.state;
  editorView.destroy();
  editorView = null;
  editorPath = null;
}

function cleanupWatchers() {
  for (const unsubscribe of state.watchers.values()) unsubscribe();
  for (const timer of state.watchTimers.values()) clearTimeout(timer);
  state.watchers.clear();
  state.watchTimers.clear();
}

function currentPath() { return state.selected?.relativePath ?? ""; }

function pushHistory(path) {
  if (state.history[state.historyIndex] === path) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(path);
  state.historyIndex = state.history.length - 1;
}

function draftFor(path = currentPath()) { return state.drafts.get(path) ?? null; }
function hasDirtyDrafts() { return [...state.drafts.values()].some((draft) => draft.dirty); }

function makeDraft(source) {
  return { source, savedSource: source, dirty: false, saving: false, saveError: null, editorState: null, conflict: null, showDiff: false };
}

async function activateHandle(handle) {
  if (!handle) return;
  const sequence = ++activationSequence;
  cleanupObjectUrl(); cleanupMarkdownUrls(); cleanupEditor(); cleanupWatchers();
  Object.assign(state, {
    handle, root: null, directoryCache: new Map(), expanded: new Set(), selected: null,
    preview: null, error: null, loading: true, history: [], historyIndex: -1, drafts: new Map(),
  });
  render();
  try {
    const nextRoot = await statEntry(handle);
    if (sequence !== activationSequence) return;
    state.root = nextRoot;
    if (state.root.kind === "directory") {
      state.expanded.add("");
      await loadDirectory("", false, true);
    } else {
      state.selected = state.root;
      pushHistory("");
      await loadPreview(state.root);
      void ensureWatcher("");
    }
  } catch (error) {
    if (sequence !== activationSequence) return;
    console.error("[explorer] Could not activate scoped resource.", error);
    state.error = friendlyError(error, "Explorer could not open this location.");
  } finally {
    if (sequence !== activationSequence) return;
    state.loading = false;
    render();
  }
}

async function refreshAll() {
  if (!state.handle || state.root?.kind !== "directory") return;
  await Promise.all([...state.directoryCache.keys()].map((path) => refreshDirectory(path).catch(() => undefined)));
  if (state.query) await runSearch(state.query);
  render();
}

async function loadDirectory(path, refresh = false, observe = state.expanded.has(path) || path === "") {
  const handle = state.handle;
  const sequence = activationSequence;
  if (!handle || (!refresh && state.directoryCache.has(path))) {
    if (observe) void ensureWatcher(path);
    return;
  }
  const entries = sortEntries(await listDirectory(handle, path));
  if (sequence !== activationSequence || handle !== state.handle) return;
  state.directoryCache.set(path, entries);
  if (path === "" && state.focusedPath === null && entries[0]) state.focusedPath = entries[0].relativePath;
  if (observe) void ensureWatcher(path);
}

async function ensureWatcher(path) {
  if (!state.handle || state.watchers.has(path)) return;
  const handle = state.handle;
  const sequence = activationSequence;
  state.watchers.set(path, () => undefined);
  try {
    const listener = state.root?.kind === "file" && path === "" ? scheduleRootFileRefresh : () => scheduleDirectoryRefresh(path);
    const unsubscribe = await watchEntry(handle, path, listener);
    if (sequence !== activationSequence || handle !== state.handle) { unsubscribe(); return; }
    state.watchers.set(path, unsubscribe);
  } catch (error) {
    state.watchers.delete(path);
    console.warn("[explorer] Could not watch directory.", path, error);
  }
}

function scheduleRootFileRefresh() {
  clearTimeout(state.watchTimers.get("@root-file"));
  state.watchTimers.set("@root-file", setTimeout(() => {
    state.watchTimers.delete("@root-file");
    void refreshRootFile().catch((error) => console.warn("[explorer] Could not refresh watched file.", error));
  }, 120));
}

async function refreshRootFile() {
  if (!state.handle || state.root?.kind !== "file") return;
  let replacement;
  try { replacement = await statEntry(state.handle); }
  catch {
    const draft = draftFor("");
    if (draft?.dirty) { draft.conflict = { kind: "deleted", diskSource: null }; draft.showDiff = false; }
    else { state.error = `“${state.root.name}” was removed.`; state.preview = null; }
    render();
    return;
  }
  await reconcileSelectedEntry("", [replacement]);
  render();
}

function scheduleDirectoryRefresh(path) {
  clearTimeout(state.watchTimers.get(path));
  state.watchTimers.set(path, setTimeout(() => {
    state.watchTimers.delete(path);
    void refreshDirectory(path).catch((error) => console.warn("[explorer] Could not refresh watched directory.", path, error));
  }, 120));
}

function discardCachedBranch(path) {
  for (const cachedPath of [...state.directoryCache.keys()]) {
    if (cachedPath === path || cachedPath.startsWith(`${path}/`)) state.directoryCache.delete(cachedPath);
  }
  for (const [watchedPath, unsubscribe] of [...state.watchers]) {
    if (watchedPath === path || watchedPath.startsWith(`${path}/`)) { unsubscribe(); state.watchers.delete(watchedPath); }
  }
  for (const expandedPath of [...state.expanded]) {
    if (expandedPath === path || expandedPath.startsWith(`${path}/`)) state.expanded.delete(expandedPath);
  }
}

async function refreshDirectory(path) {
  if (!state.handle) return;
  const before = state.directoryCache.get(path) ?? [];
  let after;
  try { after = sortEntries(await listDirectory(state.handle, path)); }
  catch (error) { if (path) discardCachedBranch(path); throw error; }
  state.directoryCache.set(path, after);
  const nextPaths = new Set(after.map((entry) => entry.relativePath));
  for (const entry of before) if (entry.kind === "directory" && !nextPaths.has(entry.relativePath)) discardCachedBranch(entry.relativePath);
  await reconcileSelectedEntry(path, after);
  if (state.query) await runSearch(state.query); else render();
}

async function reconcileSelectedEntry(parentPath, entries) {
  const selected = state.selected;
  if (!selected || parentRelative(selected.relativePath) !== parentPath) return;
  const replacement = entries.find((entry) => entry.relativePath === selected.relativePath);
  const draft = draftFor(selected.relativePath);
  if (!replacement) {
    if (draft?.dirty) { draft.conflict = { kind: "deleted", diskSource: null }; draft.showDiff = false; }
    else { state.error = `“${selected.name}” was removed from this folder.`; state.preview = null; }
    return;
  }
  state.error = null;
  if (replacement.modifiedAt === selected.modifiedAt && replacement.size === selected.size) return;
  state.selected = replacement;
  if (selected.kind !== "file") return;
  const kind = state.preview?.kind ?? previewKind(replacement);
  if (kind !== "text" && kind !== "markdown" && kind !== "svg") { await loadPreview(replacement); return; }
  const diskSource = await (await readEntry(state.handle, replacement.relativePath)).text();
  if (draft?.saving && diskSource === draft.source) {
    draft.savedSource = diskSource; draft.dirty = false; draft.conflict = null;
    state.preview = { kind, source: diskSource };
    return;
  }
  if (draft?.dirty && diskSource !== draft.savedSource) {
    draft.conflict = { kind: "modified", diskSource }; draft.showDiff = false; return;
  }
  state.drafts.set(replacement.relativePath, makeDraft(diskSource));
  state.preview = { kind, source: diskSource };
}

async function selectEntry(entry, recordHistory = true) {
  state.selected = entry; state.focusedPath = entry.relativePath; state.error = null;
  state.preview = null; state.menuOpen = false;
  if (recordHistory) pushHistory(entry.relativePath);
  if (entry.kind === "directory") {
    state.expanded.add(entry.relativePath);
    await loadDirectory(entry.relativePath, false, true);
  } else {
    await loadPreview(entry);
    if (state.root?.kind === "directory") void ensureWatcher(parentRelative(entry.relativePath));
  }
  render();
}

async function selectPath(path, recordHistory = false) {
  if (!state.handle) return;
  try { await selectEntry(await statEntry(state.handle, path), recordHistory); }
  catch (error) { state.error = friendlyError(error, "This item is no longer available."); render(); }
}

async function moveHistory(delta) {
  const next = state.historyIndex + delta;
  if (next < 0 || next >= state.history.length) return;
  state.historyIndex = next;
  await selectPath(state.history[next]);
}

async function loadPreview(entry) {
  const handle = state.handle;
  const sequence = activationSequence;
  if (!handle) return;
  let kind = previewKind(entry);
  if (kind === "unsupported") {
    const file = await readEntry(handle, entry.relativePath);
    const bytes = new Uint8Array(await file.slice(0, 64 * 1024).arrayBuffer());
    if (sequence !== activationSequence || handle !== state.handle) return;
    if (looksLikeText(bytes, bytes.byteLength < file.size)) kind = "text";
  }
  if (kind === "text" || kind === "markdown" || kind === "svg") {
    const source = await (await readEntry(handle, entry.relativePath)).text();
    if (sequence !== activationSequence || handle !== state.handle) return;
    cleanupObjectUrl();
    if (!state.drafts.has(entry.relativePath)) state.drafts.set(entry.relativePath, makeDraft(source));
    state.preview = { kind, source };
    return;
  }
  if (kind === "image" || kind === "pdf") {
    const file = await readEntry(handle, entry.relativePath);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (sequence !== activationSequence || handle !== state.handle) return;
    cleanupObjectUrl();
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: mimeFor(entry.name) }));
    state.preview = { kind, url: objectUrl };
    return;
  }
  cleanupObjectUrl();
  state.preview = { kind: "unsupported" };
}

function mimeFor(name) {
  return ({ gif: "image/gif", jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", svg: "image/svg+xml", webp: "image/webp", pdf: "application/pdf" })[extensionOf(name)] ?? "application/octet-stream";
}

async function enumerate(path = "", output = [], seen = { count: 0 }) {
  if (seen.count >= 5000) return output;
  await loadDirectory(path, false, false);
  for (const entry of state.directoryCache.get(path) ?? []) {
    output.push(entry); seen.count += 1;
    if (entry.kind === "directory" && seen.count < 5000) await enumerate(entry.relativePath, output, seen);
  }
  return output;
}

async function runSearch(query) {
  const sequence = ++searchSequence;
  state.query = query;
  if (!query.trim()) { state.searchResults = []; state.searchBusy = false; renderRailBody(); return; }
  state.searchBusy = true; renderRailBody();
  try {
    const entries = await enumerate();
    if (sequence !== searchSequence) return;
    state.searchResults = entries.filter((entry) => matchesQuery(entry, query)).slice(0, 250);
  } catch (error) {
    if (sequence === searchSequence) state.error = friendlyError(error, "Search could not finish.");
  } finally {
    if (sequence === searchSequence) { state.searchBusy = false; renderRailBody(); }
  }
}

function treeRows(path = "", depth = 0) {
  return (state.directoryCache.get(path) ?? []).map((entry) => {
    const selected = state.selected?.relativePath === entry.relativePath;
    const expanded = entry.kind === "directory" && state.expanded.has(entry.relativePath);
    const row = `<button class="tree-row${selected ? " is-selected" : ""}" style="--indent:${treeRowIndent(depth)}" data-path="${escapeHtml(entry.relativePath)}" data-kind="${entry.kind}" role="treeitem" aria-level="${depth + 1}" ${entry.kind === "directory" ? `aria-expanded="${expanded}"` : ""} aria-selected="${selected}" tabindex="${state.focusedPath === entry.relativePath ? "0" : "-1"}"><span class="disclosure">${entry.kind === "directory" ? icon("chevron", expanded ? "is-open" : "") : ""}</span>${entryIcon(entry, expanded)}<span class="tree-label">${escapeHtml(entry.name)}</span></button>`;
    return row + (expanded ? treeRows(entry.relativePath, depth + 1) : "");
  }).join("");
}

function appBar() {
  const label = state.handle ? [state.handle.name, currentPath()].filter(Boolean).join(" / ") : "Choose a folder";
  return `<header class="app-bar"><nav class="bar-group" aria-label="History"><button class="icon-button" data-action="back" aria-label="Back" ${state.historyIndex <= 0 ? "disabled" : ""}>${icon("back")}</button><button class="icon-button" data-action="forward" aria-label="Forward" ${state.historyIndex >= state.history.length - 1 ? "disabled" : ""}>${icon("forward")}</button><button class="icon-button" data-action="up" aria-label="Parent folder" ${!currentPath() ? "disabled" : ""}>${icon("up")}</button></nav><div class="location">${icon("folder")}<span>${escapeHtml(label)}</span></div><nav class="bar-group" aria-label="Explorer actions"><button class="icon-button" data-action="choose" aria-label="Choose folder">${icon("folderOpen")}</button><button class="icon-button" data-action="new-folder" aria-label="New folder" ${state.root?.kind !== "directory" ? "disabled" : ""}>${icon("folderPlus")}</button><button class="icon-button" data-action="menu" aria-label="More actions" aria-expanded="${state.menuOpen}">${icon("more")}</button></nav>${state.menuOpen ? `<div class="menu"><button data-action="refresh">${icon("refresh")}Refresh</button>${state.handle ? `<button data-action="forget">${icon("close")}Forget this location</button>` : ""}</div>` : ""}</header>`;
}

function rail() {
  if (!state.handle) return `<aside class="tree-rail"><div class="search-box">${icon("search")}<input disabled placeholder="Search files…" /></div>${railState("folder", "No workspace", "Open a folder to browse files.")}</aside>`;
  return `<aside class="tree-rail"><label class="search-box">${icon("search")}<input data-search value="${escapeHtml(state.query)}" placeholder="Search files…" aria-label="Search files" /></label>${state.newFolder ? `<form class="new-folder-form" data-new-folder><input name="name" autofocus placeholder="Folder name" /><button>Save</button><button type="button" data-action="cancel-new-folder">Cancel</button></form>` : ""}<div class="tree-scroll" role="tree" aria-label="Files">${railBody()}</div></aside>`;
}

function railBody() {
  return state.query ? searchRows() : state.root?.kind === "file"
    ? `<button class="tree-row is-selected" data-path="" data-kind="file" role="treeitem" aria-selected="true" tabindex="0">${entryIcon(state.root)}<span class="tree-label">${escapeHtml(state.root.name)}</span></button>`
    : treeRows() || railState("folder", "Empty folder", "This folder doesn’t contain any files yet.");
}

function renderRailBody() {
  const treeScroll = root.querySelector(".tree-scroll");
  if (!treeScroll) return;
  const { scrollTop, scrollLeft } = treeScroll;
  treeScroll.innerHTML = railBody();
  treeScroll.scrollTop = scrollTop; treeScroll.scrollLeft = scrollLeft;
}

function railState(iconName, title, detail) { return `<div class="rail-state">${icon(iconName)}<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`; }

function searchRows() {
  if (state.searchBusy) return railState("refresh", "Searching…", "Checking this location.");
  if (!state.searchResults.length) return railState("search", "No results", "Try another file name or path.");
  return state.searchResults.map((entry, index) => `<button class="search-row${state.selected?.relativePath === entry.relativePath ? " is-selected" : ""}" data-path="${escapeHtml(entry.relativePath)}" data-kind="${entry.kind}" role="treeitem" aria-selected="${state.selected?.relativePath === entry.relativePath}" tabindex="${index === 0 ? "0" : "-1"}">${entryIcon(entry)}<span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.relativePath)}</small></span></button>`).join("");
}

function preview() {
  if (state.loading) return mainState("refresh", "Loading Explorer", "Restoring scoped file access.", true);
  if (state.error) return mainState("warning", "Couldn’t open this item", state.error);
  if (!state.handle) return `<main class="preview-pane centered"><div class="main-state"><img class="app-logo" src="assets/logo.svg" alt="" /><strong>No workspace is open</strong><span>Choose a folder to browse and preview its files.</span></div></main>`;
  if (!state.selected) return mainState("file", "Select a file", "Choose a file from the tree to view it.");
  if (state.selected.kind === "directory") {
    const entries = state.directoryCache.get(state.selected.relativePath) ?? [];
    return entries.length ? mainState("folderOpen", state.selected.name, `${entries.length} item${entries.length === 1 ? "" : "s"}`) : mainState("folder", "This folder is empty", "Create a folder or add files to begin.");
  }
  return `<main class="preview-pane">${previewHeader()}<section class="preview-content">${previewBody()}</section></main>`;
}

function previewHeader() {
  const markdown = state.preview?.kind === "markdown";
  const svg = state.preview?.kind === "svg";
  const switchable = markdown || svg;
  const mode = svg ? state.svgMode : state.markdownMode;
  const editable = state.preview?.kind === "text" || switchable;
  const draft = draftFor();
  const status = draft?.saving ? "Saving…" : draft?.saveError ? "Save failed" : draft?.dirty ? "Unsaved" : editable ? "Saved" : "";
  return `<header class="preview-header"><div class="file-path">${escapeHtml(state.selected.relativePath || state.selected.name)}</div><div class="preview-actions">${draft?.dirty ? '<span class="dirty-dot" aria-label="Unsaved changes"></span>' : ""}${status ? `<span class="editor-status${draft?.saveError ? " is-error" : ""}" data-editor-status>${escapeHtml(status)}</span>` : ""}${switchable ? `<div class="view-switch"><button data-mode="source" class="${mode === "source" ? "is-active" : ""}">Source</button><button data-mode="preview" class="${mode === "preview" ? "is-active" : ""}">Preview</button></div>` : ""}${editable ? `<button class="save-button" data-action="save" ${draft?.saving || draft?.conflict || !draft?.dirty ? "disabled" : ""}>Save</button>` : ""}</div></header>`;
}

function conflictBanner(draft) {
  if (!draft?.conflict) return "";
  const deleted = draft.conflict.kind === "deleted";
  return `<div class="conflict-banner" role="alert"><div>${icon("warning")}<span><strong>${deleted ? "File removed on disk" : "File changed on disk"}</strong><small>${deleted ? "Your unsaved version is still available." : "Choose which version to keep before saving."}</small></span></div><div class="conflict-actions">${deleted ? `<button data-action="close-deleted">Close file</button>` : `<button data-action="reload-disk">Reload</button><button data-action="compare-disk" aria-pressed="${draft.showDiff}">Compare</button>`}<button class="primary" data-action="keep-mine">Keep mine</button></div></div>`;
}

function numberedSource(source) {
  return String(source).split("\n").map((line, index) => `<span data-line="${index + 1}">${escapeHtml(line) || " "}</span>`).join("");
}

function conflictDiff(draft) {
  if (!draft?.conflict || !draft.showDiff || draft.conflict.diskSource === null) return "";
  return `<div class="diff-panel"><section><header>Your unsaved version</header><pre>${numberedSource(draft.source)}</pre></section><section><header>Version on disk</header><pre>${numberedSource(draft.conflict.diskSource)}</pre></section></div>`;
}

function previewBody() {
  const preview = state.preview;
  if (!preview) return mainStateContent("refresh", "Loading preview…", "");
  if (preview.kind === "unsupported") return mainStateContent("warning", "Unsupported file type", "Open it with another App or the system.");
  if (preview.kind === "image") return `<div class="media-preview"><img src="${escapeHtml(preview.url)}" alt="${escapeHtml(state.selected.name)}" /></div>`;
  if (preview.kind === "pdf") return `<object class="pdf-preview" data="${escapeHtml(preview.url)}" type="application/pdf"><p>PDF preview is unavailable.</p></object>`;
  const draft = draftFor();
  if (preview.kind === "markdown" && state.markdownMode === "preview") return `<article class="markdown-preview">${renderMarkdown(draft?.source ?? preview.source)}</article>`;
  if (preview.kind === "svg" && state.svgMode === "preview") {
    cleanupObjectUrl();
    return `<figure class="svg-preview"><div class="svg-canvas"><div class="svg-document" data-svg-preview aria-label="Preview of ${escapeHtml(state.selected.name)}"></div></div><figcaption>Scalable vector graphic</figcaption></figure>`;
  }
  if (preview.kind === "svg") cleanupObjectUrl();
  return `<div class="editor-shell">${conflictBanner(draft)}${conflictDiff(draft)}<div class="source-editor" data-editor></div></div>`;
}

function mainState(iconName, title, detail, spinning = false) { return `<main class="preview-pane centered">${mainStateContent(iconName, title, detail, spinning)}</main>`; }
function mainStateContent(iconName, title, detail, spinning = false) { return `<div class="main-state">${icon(iconName, spinning ? "spin" : "")}<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</div>`; }
function scrollKey() { return `${state.handle?.id ?? "none"}:${state.query ? "search" : "tree"}`; }

function render() {
  const treeScroll = root.querySelector(".tree-scroll");
  if (treeScroll) state.railScroll.set(scrollKey(), { top: treeScroll.scrollTop, left: treeScroll.scrollLeft });
  const activeSearch = root.querySelector("[data-search]:focus");
  const searchSelection = activeSearch ? { start: activeSearch.selectionStart, end: activeSearch.selectionEnd, direction: activeSearch.selectionDirection } : null;
  const activePath = document.activeElement?.dataset?.path;
  if (activePath !== undefined) state.focusedPath = activePath;
  cleanupEditor(); cleanupMarkdownUrls();
  root.innerHTML = `${appBar()}<div class="surface" style="--rail-width:${state.railWidth}px">${rail()}<div class="rail-resizer" data-resizer role="separator" aria-label="Resize file tree" aria-orientation="vertical" tabindex="0"></div>${preview()}</div>`;
  const nextTree = root.querySelector(".tree-scroll");
  const savedScroll = state.railScroll.get(scrollKey());
  if (nextTree && savedScroll) { nextTree.scrollTop = savedScroll.top; nextTree.scrollLeft = savedScroll.left; }
  if (searchSelection) {
    const nextSearch = root.querySelector("[data-search]");
    nextSearch?.focus({ preventScroll: true });
    if (nextSearch && searchSelection.start !== null && searchSelection.end !== null) nextSearch.setSelectionRange(searchSelection.start, searchSelection.end, searchSelection.direction ?? "none");
  } else if (state.focusedPath !== null) focusTreePath(state.focusedPath, false);
  mountEditor();
  void hydrateMarkdownPreview();
  hydrateSvgPreview();
}

const SVG_ELEMENTS = new Set([
  "circle", "clippath", "defs", "desc", "ellipse", "feblend", "fecolormatrix",
  "fecomponenttransfer", "fecomposite", "feconvolvematrix", "fediffuselighting",
  "fedisplacementmap", "fedistantlight", "fedropshadow", "feflood", "fefunca", "fefuncb",
  "fefuncg", "fefuncr", "fegaussianblur", "feimage", "femerge", "femergenode",
  "femorphology", "feoffset", "fepointlight", "fespecularlighting", "fespotlight", "fetile",
  "feturbulence", "filter", "g", "line", "lineargradient", "marker", "mask", "path",
  "pattern", "polygon", "polyline", "radialgradient", "rect", "stop", "svg", "symbol",
  "text", "textpath", "title", "tspan", "use",
]);

function unsafeSvgValue(value) {
  if (/(?:javascript|vbscript|data|https?|file):|@import|expression\s*\(/i.test(value)) return true;
  return [...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].some((match) => !match[2].startsWith("#"));
}

function sanitizedSvg(source) {
  const parsed = new DOMParser().parseFromString(String(source), "image/svg+xml");
  const svg = parsed.documentElement;
  if (svg.localName.toLowerCase() !== "svg" || parsed.querySelector("parsererror")) throw new Error("Invalid SVG");
  for (const element of [svg, ...svg.querySelectorAll("*")]) {
    if (!SVG_ELEMENTS.has(element.localName.toLowerCase())) { element.remove(); continue; }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim();
      if (name.startsWith("on") || name === "src" || (["href", "xlink:href"].includes(name) && !value.startsWith("#")) || unsafeSvgValue(value)) {
        element.removeAttribute(attribute.name);
      }
    }
  }
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Preview of ${state.selected?.name ?? "SVG"}`);
  return document.importNode(svg, true);
}

function hydrateSvgPreview() {
  const target = root.querySelector("[data-svg-preview]");
  const draft = draftFor();
  if (!target || state.preview?.kind !== "svg") return;
  try { target.append(sanitizedSvg(draft?.source ?? state.preview.source)); }
  catch {
    target.classList.add("is-invalid");
    target.textContent = "This SVG could not be rendered. Open Source to inspect or repair it.";
  }
}

function mountEditor() {
  const parent = root.querySelector("[data-editor]");
  const selected = state.selected;
  const draft = draftFor();
  if (!parent || !selected || !draft) return;
  const path = selected.relativePath;
  editorPath = path;
  editorView = createEditor({
    parent, name: selected.name, doc: draft.source, editorState: draft.editorState,
    onChange(source, editorState) {
      const current = state.drafts.get(path);
      if (!current) return;
      current.source = source; current.editorState = editorState; current.dirty = source !== current.savedSource; current.saveError = null;
      syncEditorStatus(current);
    },
    onSave() { void savePath(path); },
  });
}

function syncEditorStatus(draft) {
  const status = root.querySelector("[data-editor-status]");
  if (status) {
    status.textContent = draft.saving ? "Saving…" : draft.saveError ? "Save failed" : draft.dirty ? "Unsaved" : "Saved";
    status.classList.toggle("is-error", Boolean(draft.saveError));
  }
  const dirtyDot = root.querySelector(".dirty-dot");
  if (draft.dirty && !dirtyDot) root.querySelector(".preview-actions")?.insertAdjacentHTML("afterbegin", '<span class="dirty-dot" aria-label="Unsaved changes"></span>');
  else if (!draft.dirty) dirtyDot?.remove();
  const save = root.querySelector('[data-action="save"]');
  if (save) save.disabled = draft.saving || Boolean(draft.conflict) || !draft.dirty;
}

async function hydrateMarkdownPreview() {
  const article = root.querySelector(".markdown-preview");
  if (!article || !state.handle || !state.selected) return;
  const base = parentRelative(state.selected.relativePath);
  const sequence = activationSequence;
  for (const image of article.querySelectorAll("img[src]")) {
    const source = image.getAttribute("src") ?? "";
    if (!isRelativeUrl(source)) {
      image.removeAttribute("src"); image.classList.add("is-unavailable"); image.title = "Remote images are not loaded in Explorer."; continue;
    }
    const relativePath = resolveMarkdownPath(base, source);
    if (!relativePath) continue;
    try {
      const url = await runtime.files.open(state.handle.id, relativePath);
      if (sequence !== activationSequence || !image.isConnected) { await runtime.files.closeUrl(url).catch(() => undefined); continue; }
      markdownUrls.add(url); image.src = url;
    } catch { image.removeAttribute("src"); image.classList.add("is-unavailable"); }
  }
  for (const anchor of article.querySelectorAll("a[href]")) {
    const href = anchor.getAttribute("href") ?? "";
    if (!href.startsWith("#") && !isRelativeUrl(href)) { anchor.target = "_blank"; anchor.rel = "noreferrer noopener"; }
  }
}

function isRelativeUrl(value) { return Boolean(value) && !value.startsWith("#") && !value.startsWith("/") && !value.startsWith("//") && !/^[a-z][a-z\d+.-]*:/i.test(value); }

function resolveMarkdownPath(base, value) {
  const plain = value.split(/[?#]/, 1)[0];
  try {
    const parts = [];
    for (const part of `${base}/${decodeURIComponent(plain)}`.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") parts.pop(); else parts.push(part);
    }
    return joinRelative(parts);
  } catch { return ""; }
}

function friendlyError(error, fallback) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/revok|handle|access|permission/i.test(message)) return state.handle?.kind === "file" ? "Open this file again to restore access." : "Choose this folder again to restore access.";
  return message || fallback;
}

async function chooseFolder() {
  const handle = await chooseExplorerRoot();
  if (!handle) return;
  await rememberExplorerRoot(handle); await activateHandle(handle);
}

async function createFolder(form) {
  const name = String(new FormData(form).get("name") ?? "").trim();
  if (!name || name.includes("/") || name.includes("\\")) return;
  const base = state.selected?.kind === "directory" ? state.selected.relativePath : parentRelative(currentPath());
  await createDirectory(state.handle, base, name);
  state.newFolder = false; await loadDirectory(base, true, true); render();
}

async function showInFinder(entry) {
  if (!state.handle) return;
  const relativePath = finderRelativePath(entry);
  await runtime.open({ handleId: state.handle.id, ...(relativePath ? { relativePath } : {}), with: "system" });
}

async function savePath(path = currentPath()) {
  const draft = state.drafts.get(path);
  if (!draft || !state.handle || draft.saving || draft.conflict || !draft.dirty) return;
  draft.saving = true; draft.saveError = null; syncEditorStatus(draft);
  try {
    await writeTextEntry(state.handle, path, draft.source);
    draft.savedSource = draft.source; draft.dirty = false;
    if (state.selected?.relativePath === path) { state.preview = { ...state.preview, source: draft.source }; state.selected = await statEntry(state.handle, path); }
  } catch (error) { draft.saveError = friendlyError(error, "Explorer could not save this file."); }
  finally { draft.saving = false; syncEditorStatus(draft); }
}

function focusTreePath(path, scroll = true) {
  const target = [...root.querySelectorAll("button[data-path]")].find((row) => row.dataset.path === path);
  if (!target) return;
  for (const row of root.querySelectorAll("button[data-path]")) row.tabIndex = row === target ? 0 : -1;
  target.focus({ preventScroll: !scroll }); state.focusedPath = path;
}

async function toggleDirectory(path, forceOpen) {
  const shouldOpen = forceOpen ?? !state.expanded.has(path);
  if (shouldOpen) { state.expanded.add(path); await loadDirectory(path, false, true); }
  else state.expanded.delete(path);
  state.focusedPath = path; render();
}

function handleTreeKeydown(event, row) {
  const rows = [...root.querySelectorAll(".tree-row, .search-row")];
  const index = rows.indexOf(row);
  const path = row.dataset.path ?? "";
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const next = event.key === "Home" ? rows[0] : event.key === "End" ? rows.at(-1) : rows[index + (event.key === "ArrowDown" ? 1 : -1)];
    if (next) focusTreePath(next.dataset.path ?? ""); return;
  }
  if (event.key === "ArrowRight" && row.dataset.kind === "directory") {
    event.preventDefault();
    if (!state.expanded.has(path)) void toggleDirectory(path, true); else if (rows[index + 1]) focusTreePath(rows[index + 1].dataset.path ?? "");
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    if (row.dataset.kind === "directory" && state.expanded.has(path)) void toggleDirectory(path, false); else focusTreePath(parentRelative(path));
    return;
  }
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (row.dataset.kind === "directory") void toggleDirectory(path); else void selectPath(path, true);
    return;
  }
  if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
    clearTimeout(typeahead.timer); typeahead.value += event.key.toLocaleLowerCase();
    typeahead.timer = setTimeout(() => { typeahead.value = ""; }, 600);
    const match = [...rows.slice(index + 1), ...rows.slice(0, index + 1)].find((candidate) => candidate.querySelector(".tree-label, strong")?.textContent?.toLocaleLowerCase().startsWith(typeahead.value));
    if (match) focusTreePath(match.dataset.path ?? "");
  }
}

root.addEventListener("click", (event) => {
  const markdownLink = event.target.closest(".markdown-preview a[href]");
  if (markdownLink) {
    const href = markdownLink.getAttribute("href") ?? "";
    if (!href.startsWith("#") && isRelativeUrl(href)) {
      event.preventDefault(); const path = resolveMarkdownPath(parentRelative(currentPath()), href); if (path) void selectPath(path, true);
    }
    return;
  }
  const button = event.target.closest("button");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "back") void moveHistory(-1);
  if (action === "forward") void moveHistory(1);
  if (action === "up") void selectPath(parentRelative(currentPath()), true);
  if (action === "choose") void chooseFolder();
  if (action === "new-folder") { state.newFolder = true; state.menuOpen = false; render(); }
  if (action === "cancel-new-folder") { state.newFolder = false; render(); }
  if (action === "menu") { state.menuOpen = !state.menuOpen; render(); }
  if (action === "refresh") { state.menuOpen = false; void refreshAll(); }
  if (action === "forget" && state.handle) void forgetExplorerRoot(state.handle).then(() => { cleanupWatchers(); state.handle = null; state.root = null; state.selected = null; render(); });
  if (action === "save") void savePath();
  if (action === "reload-disk") {
    const draft = draftFor();
    if (draft?.conflict?.diskSource !== null && draft?.conflict?.diskSource !== undefined) {
      const diskSource = draft.conflict.diskSource; state.drafts.set(currentPath(), makeDraft(diskSource)); state.preview = { ...state.preview, source: diskSource }; render();
    }
  }
  if (action === "keep-mine") { const draft = draftFor(); if (draft) { draft.conflict = null; draft.showDiff = false; draft.dirty = true; render(); } }
  if (action === "compare-disk") { const draft = draftFor(); if (draft) { draft.showDiff = !draft.showDiff; render(); } }
  if (action === "close-deleted") { state.drafts.delete(currentPath()); state.selected = null; state.preview = null; render(); }
  if (button.dataset.mode) {
    if (state.preview?.kind === "svg") state.svgMode = button.dataset.mode;
    else state.markdownMode = button.dataset.mode;
    render();
  }
  if (button.dataset.path !== undefined) {
    const path = button.dataset.path; state.focusedPath = path;
    if (button.dataset.kind === "directory") void toggleDirectory(path); else void selectPath(path, true);
  }
});

root.addEventListener("input", (event) => {
  if (!event.target.matches("[data-search]")) return;
  state.query = event.target.value; clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void runSearch(event.target.value), 160);
});

root.addEventListener("keydown", (event) => {
  if (event.target.matches("[data-search]")) {
    if (event.key === "Escape" && state.query) { event.preventDefault(); clearTimeout(searchTimer); state.query = ""; state.searchResults = []; render(); }
    else if (event.key === "Enter" && state.searchResults[0]) { event.preventDefault(); void selectPath(state.searchResults[0].relativePath, true); }
    return;
  }
  const row = event.target.closest(".tree-row, .search-row");
  if (row) handleTreeKeydown(event, row);
  if (event.target.matches("[data-resizer]") && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
    event.preventDefault(); state.railWidth = Math.min(520, Math.max(180, state.railWidth + (event.key === "ArrowRight" ? 12 : -12)));
    root.querySelector(".surface")?.style.setProperty("--rail-width", `${state.railWidth}px`); localStorage.setItem("explorer.railWidth", String(state.railWidth));
  }
});

root.addEventListener("pointerdown", (event) => {
  if (!event.target.matches("[data-resizer]")) return;
  event.preventDefault(); resizing = { startX: event.clientX, width: state.railWidth };
  event.target.setPointerCapture(event.pointerId); document.documentElement.classList.add("is-resizing");
});

root.addEventListener("pointermove", (event) => {
  if (!resizing) return;
  state.railWidth = Math.min(520, Math.max(180, resizing.width + event.clientX - resizing.startX));
  root.querySelector(".surface")?.style.setProperty("--rail-width", `${state.railWidth}px`);
});

root.addEventListener("pointerup", (event) => {
  if (!resizing) return;
  resizing = null; event.target.releasePointerCapture?.(event.pointerId); document.documentElement.classList.remove("is-resizing");
  localStorage.setItem("explorer.railWidth", String(Math.round(state.railWidth)));
});

root.addEventListener("contextmenu", (event) => {
  const target = event.target.closest?.("button[data-path]");
  if (!target || !runtime.contextMenu?.show) return;
  event.preventDefault();
  const entry = { kind: target.dataset.kind === "directory" ? "directory" : "file", relativePath: target.dataset.path ?? "" };
  void runtime.contextMenu.show([{ id: "open", label: "Open" }, { id: "show-in-finder", label: "Show in Finder", separatorBefore: true }]).then((action) => {
    if (action === "open") return selectPath(entry.relativePath, true);
    if (action === "show-in-finder") return showInFinder(entry);
  }).catch((error) => { state.error = friendlyError(error, "Explorer could not open this item in Finder."); render(); });
});

root.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-new-folder]")) return;
  event.preventDefault(); void createFolder(event.target);
});

window.addEventListener("keydown", (event) => {
  if (runEditorHistoryShortcut(event, editorView)) {
    event.preventDefault(); event.stopImmediatePropagation(); return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "s") { event.preventDefault(); void savePath(); }
}, true);
window.addEventListener("beforeunload", (event) => { if (hasDirtyDrafts()) { event.preventDefault(); event.returnValue = ""; } });

runtime.tab.onNavigate(async ({ route, state: navigationState }) => {
  if (route === "/open" && navigationState?.id) await activateHandle(navigationState);
});

async function bootstrap() {
  const sequence = activationSequence;
  try {
    const initial = await restoreExplorerRoot();
    if (sequence !== activationSequence) return;
    if (initial) await activateHandle(initial); else { state.loading = false; render(); }
  } catch (error) { state.loading = false; state.error = friendlyError(error, "Explorer could not restore file access."); render(); }
}

render();
void bootstrap();
