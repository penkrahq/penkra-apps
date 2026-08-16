import {
  escapeHtml,
  extensionOf,
  looksLikeText,
  matchesQuery,
  parentRelative,
  previewKind,
  renderMarkdown,
  sortEntries,
} from "./explorer-model.mjs";
import {
  chooseExplorerRoot,
  createDirectory,
  forgetExplorerRoot,
  listDirectory,
  readEntry,
  rememberExplorerRoot,
  restoreExplorerRoot,
  statEntry,
  writeTextEntry,
} from "./explorer-files.mjs";

const runtime = globalThis.penkra;
if (!runtime?.tab || !globalThis.showDirectoryPicker) {
  throw new Error("Explorer requires the Penkra App runtime and File System Access API.");
}

const icons = {
  back: '<path d="m15 18-6-6 6-6"/>',
  forward: '<path d="m9 18 6-6-6-6"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  folder: '<path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6Z"/>',
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

const state = {
  handle: null,
  root: null,
  directoryCache: new Map(),
  expanded: new Set(),
  selected: null,
  query: "",
  searchResults: [],
  searchBusy: false,
  loading: true,
  error: null,
  preview: null,
  markdownMode: "preview",
  history: [],
  historyIndex: -1,
  newFolder: false,
  menuOpen: false,
};

const root = document.querySelector("#app");
let objectUrl = null;
let searchSequence = 0;
let activationSequence = 0;

function icon(name, className = "") {
  return `<svg class="${className}" aria-hidden="true" viewBox="0 0 24 24">${icons[name]}</svg>`;
}

function cleanupObjectUrl() {
  if (objectUrl) URL.revokeObjectURL(objectUrl);
  objectUrl = null;
}

function currentPath() {
  return state.selected?.relativePath ?? "";
}

function pushHistory(path) {
  if (state.history[state.historyIndex] === path) return;
  state.history = state.history.slice(0, state.historyIndex + 1);
  state.history.push(path);
  state.historyIndex = state.history.length - 1;
}

async function activateHandle(handle) {
  if (!handle) return;
  const sequence = ++activationSequence;
  cleanupObjectUrl();
  Object.assign(state, {
    handle,
    root: null,
    directoryCache: new Map(),
    expanded: new Set(),
    selected: null,
    preview: null,
    error: null,
    loading: true,
    history: [],
    historyIndex: -1,
  });
  render();
  try {
    const nextRoot = await statEntry(handle);
    if (sequence !== activationSequence) return;
    state.root = nextRoot;
    if (state.root.kind === "directory") {
      state.expanded.add("");
      await loadDirectory("");
    } else {
      state.selected = state.root;
      pushHistory("");
      await loadPreview(state.root);
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
  const paths = [...state.directoryCache.keys()];
  await Promise.all(paths.map((path) => loadDirectory(path, true).catch(() => undefined)));
  if (state.query) await runSearch(state.query);
  render();
}

async function loadDirectory(path, refresh = false) {
  const handle = state.handle;
  const sequence = activationSequence;
  if (!handle || (!refresh && state.directoryCache.has(path))) return;
  const entries = sortEntries(await listDirectory(handle, path));
  if (sequence !== activationSequence || handle !== state.handle) return;
  state.directoryCache.set(path, entries);
}

async function selectEntry(entry, recordHistory = true) {
  state.selected = entry;
  state.error = null;
  state.preview = null;
  state.menuOpen = false;
  if (recordHistory) pushHistory(entry.relativePath);
  if (entry.kind === "directory") {
    state.expanded.add(entry.relativePath);
    await loadDirectory(entry.relativePath);
  } else {
    await loadPreview(entry);
  }
  render();
}

async function selectPath(path, recordHistory = false) {
  if (!state.handle) return;
  try {
    const entry = await statEntry(state.handle, path);
    await selectEntry(entry, recordHistory);
  } catch (error) {
    state.error = friendlyError(error, "This item is no longer available.");
    render();
  }
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
  if (kind === "text" || kind === "markdown") {
    const source = await (await readEntry(handle, entry.relativePath)).text();
    if (sequence !== activationSequence || handle !== state.handle) return;
    cleanupObjectUrl();
    state.preview = { kind, source };
    return;
  }
  if (kind === "image" || kind === "pdf") {
    const file = await readEntry(handle, entry.relativePath);
    if (file.size > 64 * 1024 * 1024) throw new Error("Preview exceeds Explorer's 64 MB limit.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (sequence !== activationSequence || handle !== state.handle) return;
    cleanupObjectUrl();
    const mime = mimeFor(entry.name);
    objectUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
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
  await loadDirectory(path);
  for (const entry of state.directoryCache.get(path) ?? []) {
    output.push(entry);
    seen.count += 1;
    if (entry.kind === "directory" && seen.count < 5000) await enumerate(entry.relativePath, output, seen);
  }
  return output;
}

async function runSearch(query) {
  const sequence = ++searchSequence;
  state.query = query;
  if (!query.trim()) {
    state.searchResults = [];
    state.searchBusy = false;
    render();
    return;
  }
  state.searchBusy = true;
  render();
  try {
    const entries = await enumerate();
    if (sequence !== searchSequence) return;
    state.searchResults = entries.filter((entry) => matchesQuery(entry, query)).slice(0, 250);
  } catch (error) {
    if (sequence === searchSequence) state.error = friendlyError(error, "Search could not finish.");
  } finally {
    if (sequence === searchSequence) {
      state.searchBusy = false;
      render();
    }
  }
}

function treeRows(path = "", depth = 0) {
  return (state.directoryCache.get(path) ?? []).map((entry) => {
    const selected = state.selected?.relativePath === entry.relativePath;
    const expanded = entry.kind === "directory" && state.expanded.has(entry.relativePath);
    const row = `<button class="tree-row${selected ? " is-selected" : ""}" style="--depth:${depth}" data-path="${escapeHtml(entry.relativePath)}" data-kind="${entry.kind}">
      <span class="disclosure">${entry.kind === "directory" ? icon("chevron", expanded ? "is-open" : "") : ""}</span>
      ${icon(entry.kind === "directory" ? (expanded ? "folderOpen" : "folder") : previewKind(entry) === "image" ? "image" : "file")}
      <span>${escapeHtml(entry.name)}</span>
    </button>`;
    return row + (expanded ? treeRows(entry.relativePath, depth + 1) : "");
  }).join("");
}

function appBar() {
  const label = state.handle ? [state.handle.name, currentPath()].filter(Boolean).join(" / ") : "Choose a folder";
  return `<header class="app-bar">
    <nav class="bar-group" aria-label="History">
      <button class="icon-button" data-action="back" aria-label="Back" ${state.historyIndex <= 0 ? "disabled" : ""}>${icon("back")}</button>
      <button class="icon-button" data-action="forward" aria-label="Forward" ${state.historyIndex >= state.history.length - 1 ? "disabled" : ""}>${icon("forward")}</button>
      <button class="icon-button" data-action="up" aria-label="Parent folder" ${!currentPath() ? "disabled" : ""}>${icon("up")}</button>
    </nav>
    <div class="location">${icon("folder")}<span>${escapeHtml(label)}</span></div>
    <nav class="bar-group" aria-label="Explorer actions">
      <button class="icon-button" data-action="choose" aria-label="Choose folder">${icon("folderOpen")}</button>
      <button class="icon-button" data-action="new-folder" aria-label="New folder" ${state.root?.kind !== "directory" ? "disabled" : ""}>${icon("folderPlus")}</button>
      <button class="icon-button" data-action="menu" aria-label="More actions">${icon("more")}</button>
    </nav>
    ${state.menuOpen ? `<div class="menu"><button data-action="refresh">${icon("refresh")}Refresh</button>${state.handle ? `<button data-action="forget">${icon("close")}Forget this location</button>` : ""}</div>` : ""}
  </header>`;
}

function rail() {
  if (!state.handle) return `<aside class="tree-rail"><div class="search-box">${icon("search")}<input disabled placeholder="Search files…" /></div>${railState("folder", "No workspace", "Open a folder to browse files.")}</aside>`;
  const body = state.query
    ? searchRows()
    : state.root?.kind === "file"
      ? `<button class="tree-row is-selected" data-path="" data-kind="file">${icon("file")}<span>${escapeHtml(state.root.name)}</span></button>`
      : treeRows() || railState("folder", "Empty folder", "This folder doesn’t contain any files yet.");
  return `<aside class="tree-rail"><label class="search-box">${icon("search")}<input data-search value="${escapeHtml(state.query)}" placeholder="Search files…" /></label>
    ${state.newFolder ? `<form class="new-folder-form" data-new-folder><input name="name" autofocus placeholder="Folder name" /><button>Save</button><button type="button" data-action="cancel-new-folder">Cancel</button></form>` : ""}
    <div class="tree-scroll">${body}</div></aside>`;
}

function railState(iconName, title, detail) {
  return `<div class="rail-state">${icon(iconName)}<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span></div>`;
}

function searchRows() {
  if (state.searchBusy) return railState("refresh", "Searching…", "Checking this location.");
  if (!state.searchResults.length) return railState("search", "No results", "Try another file name or path.");
  return state.searchResults.map((entry) => `<button class="search-row${state.selected?.relativePath === entry.relativePath ? " is-selected" : ""}" data-path="${escapeHtml(entry.relativePath)}" data-kind="${entry.kind}">${icon(entry.kind === "directory" ? "folder" : "file")}<span><strong>${escapeHtml(entry.name)}</strong><small>${escapeHtml(entry.relativePath)}</small></span></button>`).join("");
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
  return `<header class="preview-header"><div class="file-path">${escapeHtml(state.selected.relativePath || state.selected.name)}</div>
    <div class="preview-actions">${markdown ? `<div class="view-switch"><button data-mode="source" class="${state.markdownMode === "source" ? "is-active" : ""}">Source</button><button data-mode="preview" class="${state.markdownMode === "preview" ? "is-active" : ""}">Preview</button></div>` : ""}
    </div></header>`;
}

function previewBody() {
  const preview = state.preview;
  if (!preview) return mainStateContent("refresh", "Loading preview…", "");
  if (preview.kind === "unsupported") return mainStateContent("warning", "Unsupported file type", "Open it with another App or the system.");
  if (preview.kind === "image") return `<div class="media-preview"><img src="${escapeHtml(preview.url)}" alt="${escapeHtml(state.selected.name)}" /></div>`;
  if (preview.kind === "pdf") return `<object class="pdf-preview" data="${escapeHtml(preview.url)}" type="application/pdf"><p>PDF preview is unavailable.</p></object>`;
  if (preview.kind === "markdown" && state.markdownMode === "preview") return `<article class="markdown-preview">${renderMarkdown(preview.source)}</article>`;
  return `<div class="source-editor"><textarea data-source spellcheck="false">${escapeHtml(preview.source)}</textarea><button class="save-button" data-action="save">Save</button></div>`;
}

function mainState(iconName, title, detail, spinning = false) {
  return `<main class="preview-pane centered">${mainStateContent(iconName, title, detail, spinning)}</main>`;
}

function mainStateContent(iconName, title, detail, spinning = false) {
  return `<div class="main-state">${icon(iconName, spinning ? "spin" : "")}<strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</div>`;
}

function render() {
  root.innerHTML = `${appBar()}<div class="surface">${rail()}${preview()}</div>`;
}

function friendlyError(error, fallback) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (/revok|handle|access|permission/i.test(message)) {
    return state.handle?.kind === "file"
      ? "Open this file again to restore access."
      : "Choose this folder again to restore access.";
  }
  return message || fallback;
}

async function chooseFolder() {
  const handle = await chooseExplorerRoot();
  if (!handle) return;
  await rememberExplorerRoot(handle);
  await activateHandle(handle);
}

async function createFolder(form) {
  const name = String(new FormData(form).get("name") ?? "").trim();
  if (!name || name.includes("/") || name.includes("\\")) return;
  const base = state.selected?.kind === "directory" ? state.selected.relativePath : parentRelative(currentPath());
  await createDirectory(state.handle, base, name);
  state.newFolder = false;
  await loadDirectory(base, true);
  render();
}

root.addEventListener("click", (event) => {
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
  if (action === "forget" && state.handle) void forgetExplorerRoot().then(() => { state.handle = null; state.root = null; state.selected = null; render(); });
  if (action === "save" && state.selected) {
    const source = root.querySelector("[data-source]")?.value ?? "";
    void writeTextEntry(state.handle, state.selected.relativePath, source).then(() => { state.preview = { ...state.preview, source }; render(); });
  }
  if (button.dataset.mode) { state.markdownMode = button.dataset.mode; render(); }
  if (button.dataset.path !== undefined) {
    const path = button.dataset.path;
    if (button.dataset.kind === "directory" && state.expanded.has(path)) {
      state.expanded.delete(path);
      state.selected = state.directoryCache.get(parentRelative(path))?.find((entry) => entry.relativePath === path) ?? state.selected;
      render();
    } else void selectPath(path, true);
  }
});

root.addEventListener("input", (event) => {
  if (event.target.matches("[data-search]")) void runSearch(event.target.value);
});

root.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-new-folder]")) return;
  event.preventDefault();
  void createFolder(event.target);
});

async function bootstrap() {
  const sequence = activationSequence;
  try {
    const initial = await restoreExplorerRoot();
    if (sequence !== activationSequence) return;
    if (initial) await activateHandle(initial);
    else { state.loading = false; render(); }
  } catch (error) {
    state.loading = false;
    state.error = friendlyError(error, "Explorer could not restore file access.");
    render();
  }
}

render();
void bootstrap();
