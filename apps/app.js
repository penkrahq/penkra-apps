import { appAction, escapeHtml, permissionGrants, renderMarkdown } from "./ui-model.mjs";

const iconPaths = {
  search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path>',
  back: '<path d="m15 18-6-6 6-6"></path>',
  forward: '<path d="m9 18 6-6-6-6"></path>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"></path><path d="M20 3v5h-5"></path>',
  package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"></path><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9"></path>',
  offline: '<path d="m2 2 20 20"></path><path d="M8.5 8.5a5 5 0 0 1 7 0"></path><path d="M5 5a10 10 0 0 1 14 0"></path><path d="M12 18h.01"></path>',
  spinner: '<path d="M21 12a9 9 0 1 1-6.22-8.56"></path>',
};

const state = {
  route: "launcher",
  appId: null,
  detailTab: "description",
  query: "",
  installations: null,
  registryApps: [],
  registryDetails: new Map(),
  readmes: new Map(),
  iconUrls: new Map(),
  optionalPermissions: new Map(),
  registryLoading: false,
  registryError: null,
  error: null,
  busyAppId: null,
  busyKind: null,
  busyPermissionKey: null,
  history: [{ route: "launcher", appId: null, detailTab: "description", query: "" }],
  historyIndex: 0,
};

const root = document.querySelector("#app");
const binding = globalThis.penkra?.installations;
const registry = globalThis.penkra?.registry;
const appHost = globalThis.penkra?.apps;
let searchTimer = null;

function icon(name, className = "") {
  return `<svg class="${className}" aria-hidden="true" viewBox="0 0 24 24">${iconPaths[name]}</svg>`;
}

function installedById() {
  return new Map((state.installations?.installed ?? []).map((app) => [app.id, app]));
}

function allApps() {
  const installed = installedById();
  const currentSpaceId = state.installations?.currentSpaceId;
  const enabledAppIds = new Set(
    (state.installations?.spaces ?? [])
      .filter((entry) => entry.spaceId === currentSpaceId && entry.enabled)
      .map((entry) => entry.appId),
  );
  const inCurrentSpace = (appId) => !currentSpaceId || enabledAppIds.has(appId);
  const merged = state.registryApps.map((app) => {
    const local = installed.get(app.id) ?? null;
    return { ...app, installed: local, enabled: Boolean(local && inCurrentSpace(app.id)) };
  });
  const registryIds = new Set(merged.map((app) => app.id));
  for (const app of installed.values()) {
    if (!registryIds.has(app.id) && app.id !== "com.penkra.apps") {
      merged.push({
        ...app,
        displayName: app.name,
        latestVersion: app.version,
        availability: "installed",
        installed: app,
        enabled: inCurrentSpace(app.id),
        publisher: null,
        rating: null,
        ratingCount: 0,
      });
    }
  }
  return merged;
}

function selectedApp() {
  return allApps().find((app) => app.id === state.appId) ?? null;
}

function filteredApps() {
  const query = state.query.trim().toLocaleLowerCase();
  if (!query) return allApps();
  return allApps().filter((app) => `${app.name} ${app.summary} ${app.publisher?.displayName ?? ""}`.toLocaleLowerCase().includes(query));
}

function snapshot() {
  return { route: state.route, appId: state.appId, detailTab: state.detailTab, query: state.query };
}

function applySnapshot(next) {
  state.route = next.route;
  state.appId = next.appId;
  state.detailTab = next.detailTab;
  state.query = next.query;
}

function navigate(next, { replace = false } = {}) {
  const value = { ...snapshot(), ...next };
  applySnapshot(value);
  if (replace) state.history[state.historyIndex] = value;
  else {
    state.history = state.history.slice(0, state.historyIndex + 1);
    state.history.push(value);
    state.historyIndex = state.history.length - 1;
  }
  render();
}

function moveHistory(delta) {
  const nextIndex = state.historyIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.history.length) return;
  state.historyIndex = nextIndex;
  applySnapshot(state.history[nextIndex]);
  render();
}

function appBar() {
  return `<header class="app-bar" aria-label="App navigation">
    <nav class="bar-group" aria-label="History">
      <button class="icon-button" data-action="back" aria-label="Back" ${state.historyIndex === 0 ? "disabled" : ""}>${icon("back")}</button>
      <button class="icon-button" data-action="forward" aria-label="Forward" ${state.historyIndex >= state.history.length - 1 ? "disabled" : ""}>${icon("forward")}</button>
      <button class="icon-button" data-action="refresh" aria-label="Refresh">${icon("refresh")}</button>
    </nav>
    <label class="app-search">${icon("search")}<input data-search value="${escapeHtml(state.query)}" placeholder="Search apps" aria-label="Search apps" autocomplete="off" /></label>
    <span class="bar-end" aria-hidden="true"></span>
  </header>`;
}

function appIcon(app, size = "regular") {
  const source = state.iconUrls.get(app.id);
  const content = source
    ? `<img src="${escapeHtml(source)}" alt="" />`
    : icon("package");
  return `<span class="app-icon app-icon-${size}" style="--app-icon-color:${app.color ?? "var(--apps-accent)"}">${content}</span>`;
}

function launcherView() {
  if (showOffline()) return offlineView();
  const apps = allApps().slice(0, 9);
  if (!apps.length && state.registryLoading) return loadingView("Loading Apps…");
  return `<main class="panel-content launcher-view">
    ${apps.length ? `<section class="launcher-grid" aria-label="Apps">${apps.map((app) => `<button class="launcher-item" data-launch="${escapeHtml(app.id)}">${appIcon(app, "launcher")}<span>${escapeHtml(app.name)}</span></button>`).join("")}</section>` : emptyView("No Apps available", "Refresh when you are connected to load the catalog.")}
  </main>`;
}

function searchView() {
  if (showOffline()) return offlineView();
  const apps = filteredApps();
  if (state.registryLoading && !apps.length) return loadingView("Searching Apps…");
  return `<main class="panel-content search-view">
    ${apps.length ? `<section class="result-list" aria-label="Search results">${apps.map(resultRow).join("")}</section>` : emptyView("No Apps found", "Try another name or description.")}
  </main>`;
}

function resultRow(app) {
  const action = appAction(app, app.installed, state.busyAppId, state.busyKind, app.enabled);
  return `<article class="result-row">
    <button class="result-main" data-open-detail="${escapeHtml(app.id)}" aria-label="View ${escapeHtml(app.name)} details">
      ${appIcon(app, "row")}
      <span class="result-copy"><span class="result-title-line"><strong>${escapeHtml(app.name)}</strong>${ratingBadge(app)}</span><span>${escapeHtml(app.summary)}</span></span>
    </button>
    ${actionButton(app, action, "result-action")}
  </article>`;
}

function detailView(app) {
  const detail = state.registryDetails.get(app.id);
  const version = detail?.versions?.[0];
  const action = appAction(app, app.installed, state.busyAppId, state.busyKind, app.enabled);
  return `<main class="panel-content detail-view">
    <section class="detail-head">
      ${appIcon(app, "detail")}
      <div class="detail-copy"><h1>${escapeHtml(app.name)}</h1><div class="publisher-line"><span>${escapeHtml(app.publisher?.displayName ?? "Installed locally")}</span>${ratingBadge(app)}</div><p>${escapeHtml(app.summary)}</p></div>
      ${actionButton(app, action, "detail-action")}
    </section>
    ${state.error ? `<p class="inline-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
    <nav class="detail-tabs" aria-label="App details">
      ${tabButton("description", "Description")}${tabButton("permissions", "Permissions")}${tabButton("developer", "Developer")}
    </nav>
    <section class="tab-body">${detailTabContent(app, detail, version)}</section>
  </main>`;
}

function tabButton(key, label) {
  const selected = state.detailTab === key;
  return `<button class="detail-tab${selected ? " is-active" : ""}" data-detail-tab="${key}" role="tab" aria-selected="${selected}">${label}</button>`;
}

function detailTabContent(app, detail, version) {
  if (state.detailTab === "permissions") return permissionsContent(app, version?.permissions ?? []);
  if (state.detailTab === "developer") return developerContent(app, detail, version);
  const readme = state.readmes.get(app.id);
  if (!detail && app.availability === "registry") return loadingView("Loading README…", false);
  return `<article class="markdown-body">${renderMarkdown(readme ?? app.summary)}</article>`;
}

function permissionsContent(app, permissions) {
  if (!permissions.length) return emptyView("No special permissions", "This version does not declare additional Penkra authority.");
  const currentSpace = state.installations?.spaces?.find((entry) => entry.appId === app.id && entry.spaceId === state.installations?.currentSpaceId);
  return `<div class="permission-list">${permissions.map((permission) => {
    const selected = optionalPermissionSelected(app.id, permission, currentSpace?.permissions ?? {});
    const changing = state.busyPermissionKey === `${app.id}:${permission.permission}`;
    return `<div class="permission-row"><div><strong>${escapeHtml(permissionTitle(permission.permission))}</strong><p>${escapeHtml(permission.rationale)}</p><span>${permission.required ? "Required" : "Optional"}</span></div>${permission.required ? '<span class="required-mark">Required</span>' : `<button class="switch" role="switch" aria-checked="${selected}" data-permission="${escapeHtml(permission.permission)}" aria-label="Allow ${escapeHtml(permissionTitle(permission.permission))}" ${changing ? "disabled" : ""}><span></span></button>`}</div>`;
  }).join("")}</div>`;
}

function developerContent(app, detail, version) {
  const facts = [
    ["Developer", app.publisher?.displayName ?? "Local developer"],
    ["Website", app.publisher?.domain ?? "Not provided"],
    ["App ID", app.id],
    ["Version", version?.version ?? app.installed?.version ?? app.latestVersion ?? "Unknown"],
    ["Package digest", version?.packageDigest ? `${version.packageDigest.slice(0, 12)}…` : "Not available"],
    ["Updated", formatDate(version?.publishedAt)],
  ];
  return `<div class="developer-info"><h2>Developer information</h2><p>Publisher and package details supplied with this App version.</p><dl>${facts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>${detail?.publisher?.verified ? '<span class="verified-publisher">Verified publisher</span>' : ""}</div>`;
}

function actionButton(app, action, className) {
  const iconMarkup = action.kind === "busy" ? icon("spinner", "spin") : "";
  const disabled = action.disabled || state.busyPermissionKey?.startsWith(`${app.id}:`);
  return `<button class="install-button ${className}" data-app-action="${escapeHtml(action.kind)}" data-app-id="${escapeHtml(app.id)}" ${disabled ? "disabled" : ""}>${iconMarkup}<span>${escapeHtml(action.label)}</span></button>`;
}

function ratingBadge(app) {
  return app.rating === null || app.rating === undefined ? "" : `<span class="rating" aria-label="Rated ${escapeHtml(app.rating)} out of 5">★ ${escapeHtml(app.rating)}</span>`;
}

function offlineView() {
  return `<main class="panel-content centered-state"><div>${icon("offline")}<strong>No internet</strong></div></main>`;
}

function loadingView(label, wrap = true) {
  const content = `<div class="loading-state">${icon("spinner", "spin")}<span>${escapeHtml(label)}</span></div>`;
  return wrap ? `<main class="panel-content centered-state">${content}</main>` : content;
}

function emptyView(title, description) {
  return `<div class="empty-state"><strong>${escapeHtml(title)}</strong><p>${escapeHtml(description)}</p></div>`;
}

function showOffline() {
  return Boolean(state.registryError) && state.registryApps.length === 0;
}

function render() {
  const activeElement = document.activeElement;
  const searchWasFocused = activeElement?.matches?.("[data-search]") ?? false;
  const selectionStart = searchWasFocused ? activeElement.selectionStart : null;
  const app = selectedApp();
  const view = state.route === "detail" && app ? detailView(app) : state.route === "search" ? searchView() : launcherView();
  root.innerHTML = `<div class="app-shell">${appBar()}${view}</div>`;
  if (searchWasFocused) {
    const input = root.querySelector("[data-search]");
    input?.focus();
    if (selectionStart !== null) input?.setSelectionRange(selectionStart, selectionStart);
  }
}

async function refresh() {
  state.error = null;
  if (binding?.getState) state.installations = await binding.getState();
  await refreshRegistry();
  const app = selectedApp();
  if (state.route === "detail" && app?.availability === "registry" && !state.registryDetails.has(app.id)) {
    await loadRegistryDetail(app);
  }
  render();
}

async function refreshRegistry() {
  if (!registry?.list) {
    state.registryError = "The App catalog is unavailable.";
    return;
  }
  state.registryLoading = true;
  state.registryError = null;
  render();
  try {
    const response = await registry.list({ query: state.query || undefined, limit: 30 });
    state.registryApps = response.items.map((app) => ({
      ...app,
      id: app.identifier,
      registryId: app.id,
      name: app.displayName,
      availability: "registry",
      color: "var(--apps-accent)",
    }));
    await Promise.allSettled(state.registryApps.map(loadIcon));
  } catch (error) {
    state.registryError = errorMessage(error);
  } finally {
    state.registryLoading = false;
  }
}

async function loadIcon(app) {
  if (!registry?.getArtifact || !app.iconAssetId || state.iconUrls.has(app.id)) return;
  const asset = await registry.getArtifact({ id: app.iconAssetId, source: "asset" });
  if (asset.kind === "image") state.iconUrls.set(app.id, asset.dataUrl);
}

async function loadRegistryDetail(app) {
  if (!registry?.get || app.availability !== "registry") return;
  state.error = null;
  try {
    const detail = await registry.get({ slug: app.slug });
    state.registryDetails.set(app.id, detail);
    const readmeId = detail.versions?.[0]?.readmeArtifactId;
    if (readmeId && registry.getArtifact) {
      const readme = await registry.getArtifact({ id: readmeId, source: "artifact" });
      if (readme.kind === "text") state.readmes.set(app.id, readme.text);
    }
    if (!state.iconUrls.has(app.id)) await loadIcon(app);
  } catch (error) {
    state.error = errorMessage(error);
  }
  render();
}

async function performAppAction(app, kind) {
  if (kind === "open") {
    if (!appHost?.open || state.busyAppId || state.busyPermissionKey) return;
    state.busyAppId = app.id;
    state.busyKind = kind;
    state.error = null;
    render();
    try {
      await appHost.open({ appId: app.id });
    } catch (error) {
      state.error = errorMessage(error);
    } finally {
      state.busyAppId = null;
      state.busyKind = null;
      render();
    }
    return;
  }
  const detail = state.registryDetails.get(app.id);
  const version = detail?.versions?.[0];
  if (!binding || state.busyAppId || state.busyPermissionKey) return;
  if (kind !== "enable" && !version) return;
  state.busyAppId = app.id;
  state.busyKind = kind;
  state.error = null;
  render();
  try {
    if (kind === "enable" && binding.setEnabled) {
      const spaceId = state.installations?.currentSpaceId;
      if (!spaceId) throw new Error("Open Apps beside a Thread to install into its Space.");
      state.installations = await binding.setEnabled({ appId: app.id, spaceId, enabled: true });
    } else if (kind === "install" && binding.installRegistry) {
      const spaceId = state.installations?.currentSpaceId;
      if (!spaceId) throw new Error("Open Apps beside a Thread to install into its Space.");
      state.installations = await binding.installRegistry({
        slug: app.slug,
        version: version.version,
        spaceId,
        permissions: grantsFor(app, version.permissions, {}),
      });
    } else if (kind === "update" && binding.updateRegistry) {
      const enabledSpaces = (state.installations?.spaces ?? []).filter((entry) => entry.appId === app.id && entry.enabled);
      state.installations = await binding.updateRegistry({
        slug: app.slug,
        version: version.version,
        permissionsBySpace: Object.fromEntries(enabledSpaces.map((space) => [space.spaceId, grantsFor(app, version.permissions, space.permissions)])),
      });
    }
  } catch (error) {
    state.error = errorMessage(error);
  } finally {
    state.busyAppId = null;
    state.busyKind = null;
    render();
  }
}

function grantsFor(app, permissions, existing) {
  return permissionGrants(permissions, existing, Object.fromEntries(permissions.map((permission) => [permission.permission, optionalPermissionSelected(app.id, permission, existing)])));
}

function optionalPermissionSelected(appId, permission, existing) {
  if (permission.required) return true;
  const key = `${appId}:${permission.permission}`;
  if (state.optionalPermissions.has(key)) return state.optionalPermissions.get(key);
  return existing[permission.permission] === "granted";
}

async function toggleOptionalPermission(app, permission, nextSelected) {
  const key = `${app.id}:${permission}`;
  if (!app.installed) {
    state.optionalPermissions.set(key, nextSelected);
    render();
    return;
  }
  const spaceId = state.installations?.currentSpaceId;
  if (!spaceId || !binding?.setPermission || state.busyAppId || state.busyPermissionKey) return;
  state.busyPermissionKey = key;
  state.error = null;
  render();
  try {
    state.installations = await binding.setPermission({
      appId: app.id,
      spaceId,
      permission,
      grant: nextSelected ? "granted" : "denied",
    });
    state.optionalPermissions.delete(key);
  } catch (error) {
    state.error = errorMessage(error);
  } finally {
    state.busyPermissionKey = null;
    render();
  }
}

function permissionTitle(value) {
  const known = {
    "network-fetch": "Connect to the internet",
    "raw-socket": "Open network sockets",
    "process-spawn": "Run approved processes",
  };
  if (known[value]) return known[value];
  return String(value).split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : "").join(" ");
}

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(date);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

root.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.action === "back") return moveHistory(-1);
  if (target.dataset.action === "forward") return moveHistory(1);
  if (target.dataset.action === "refresh") return void refresh();
  if (target.dataset.openDetail) {
    const app = allApps().find((entry) => entry.id === target.dataset.openDetail);
    if (!app) return;
    navigate({ route: "detail", appId: app.id, detailTab: "description" });
    return void loadRegistryDetail(app);
  }
  if (target.dataset.launch) {
    const app = allApps().find((entry) => entry.id === target.dataset.launch);
    if (!app) return;
    navigate({ route: "detail", appId: app.id, detailTab: "description" });
    return void loadRegistryDetail(app);
  }
  if (target.dataset.detailTab) {
    navigate({ detailTab: target.dataset.detailTab }, { replace: true });
    return;
  }
  if (target.dataset.permission) {
    const app = selectedApp();
    if (!app) return;
    return void toggleOptionalPermission(
      app,
      target.dataset.permission,
      target.getAttribute("aria-checked") !== "true",
    );
  }
  if (target.dataset.appAction && target.dataset.appId) {
    const app = allApps().find((entry) => entry.id === target.dataset.appId);
    if (app) void performAppAction(app, target.dataset.appAction);
  }
});

root.addEventListener("input", (event) => {
  if (!event.target.matches("[data-search]")) return;
  state.query = event.target.value;
  state.route = state.query.trim() ? "search" : "launcher";
  state.appId = null;
  state.detailTab = "description";
  state.history[state.historyIndex] = snapshot();
  render();
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void refreshRegistry().then(render);
  }, 250);
});

globalThis.penkra?.tab?.onNavigate?.(({ route, state: nextState }) => {
  const nextRoute = route === "/detail" ? "detail" : route === "/search" ? "search" : "launcher";
  navigate({
    route: nextRoute,
    appId: nextState?.appId ?? null,
    detailTab: nextState?.tab ?? "description",
    query: nextState?.query ?? "",
  });
  const app = selectedApp();
  if (app && nextRoute === "detail") void loadRegistryDetail(app);
});

void refresh().catch((error) => {
  state.registryError = errorMessage(error);
  state.registryLoading = false;
  render();
});
