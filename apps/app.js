const plannedCatalog = [
  { id: "com.penkra.browser", name: "Browser", summary: "Browse and work with the web beside any Thread.", color: "#4a90e2", availability: "planned" },
  { id: "com.penkra.explorer", name: "Explorer", summary: "Inspect files and folders connected to your work.", color: "#e39a3b", availability: "planned" },
];

const icon = (name) => {
  const paths = {
    search: '<circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.6-3.6"></path>',
    back: '<path d="m15 18-6-6 6-6"></path>',
    forward: '<path d="m9 18 6-6-6-6"></path>',
    refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.7L20 8"></path><path d="M20 3v5h-5"></path>',
    more: '<circle cx="5" cy="12" r="1"></circle><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle>',
    package: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"></path><path d="m4.5 7.7 7.5 4.2 7.5-4.2M12 12v9"></path>',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24">${paths[name]}</svg>`;
};

const state = {
  route: "home",
  appId: null,
  query: "",
  installations: null,
  registryApps: [],
  registryDetails: new Map(),
  registryLoading: false,
  registryError: null,
  error: null,
  installingAppId: null,
};
const root = document.querySelector("#app");
const binding = globalThis.penkra?.installations;
const registry = globalThis.penkra?.registry;
let searchTimer = null;

function installedCatalog() {
  return (state.installations?.installed ?? [])
    .filter((app) => app.id !== "com.penkra.apps")
    .map((app) => ({ ...app, color: "var(--penkra-accent, #6d5dfc)", availability: "installed" }));
}
function allApps() {
  const installed = installedCatalog();
  const installedIds = new Set(installed.map((app) => app.id));
  const remote = state.registryApps.filter((app) => !installedIds.has(app.id));
  const knownIds = new Set([...installedIds, ...remote.map((app) => app.id)]);
  return [...installed, ...remote, ...plannedCatalog.filter((app) => !knownIds.has(app.id))];
}
function selectedApp() { return allApps().find((app) => app.id === state.appId) ?? null; }
function installedIds() { return new Set(state.installations?.installed?.map((app) => app.id) ?? []); }

function bar() {
  return `<header class="app-bar" aria-label="App navigation">
    <div class="bar-group">
      <button class="icon-button" data-action="back" aria-label="Back" ${state.route === "home" ? "disabled" : ""}>${icon("back")}</button>
      <button class="icon-button" aria-label="Forward" disabled>${icon("forward")}</button>
      <button class="icon-button" data-action="refresh" aria-label="Refresh">${icon("refresh")}</button>
    </div>
    <label class="search">${icon("search")}<input data-search value="${escapeHtml(state.query)}" placeholder="Search apps" aria-label="Search apps" /></label>
    <div class="bar-group"><button class="icon-button" aria-label="More options">${icon("more")}</button></div>
  </header>`;
}

function tile(app, className = "tile") { return `<span class="${className}" style="--tile:${app.color}">${icon("package")}</span>`; }
function filteredCatalog() { const query = state.query.trim().toLowerCase(); const apps = allApps(); return query ? apps.filter((app) => `${app.name} ${app.summary}`.toLowerCase().includes(query)) : apps; }

function home() {
  const apps = filteredCatalog();
  return `<main class="content">
    <section class="hero"><span class="eyebrow">Discover</span><h1>Apps for your work</h1><p class="muted">Open installed Apps or find something new.</p></section>
    ${state.registryError ? `<div class="status error">${escapeHtml(state.registryError)}</div>` : ""}
    ${state.registryLoading ? '<div class="status">Refreshing the App catalog…</div>' : ""}
    ${state.query ? results(apps) : `<section class="launcher-grid" aria-label="Featured Apps">${apps.slice(0, 6).map((app) => `<button class="launcher" data-open="${escapeHtml(app.id)}">${tile(app)}<span class="launcher-label">${escapeHtml(app.name)}</span></button>`).join("")}</section>${results(apps)}`}
  </main>`;
}

function results(apps) {
  return `<section class="section"><div class="section-heading"><h2>${state.query ? "Search results" : "Explore Apps"}</h2><span class="muted">${apps.length}</span></div>
    ${apps.length ? `<div class="result-list">${apps.map((app) => `<button class="result" data-open="${escapeHtml(app.id)}">${tile(app)}<span class="result-copy"><span class="result-name">${escapeHtml(app.name)}</span><span class="result-summary">${escapeHtml(app.summary)}</span></span><span class="button secondary">View</span></button>`).join("")}</div>` : `<div class="empty"><div><h2>No Apps found</h2><p class="muted">Try another name or description.</p></div></div>`}
  </section>`;
}

function detail(app) {
  const installed = installedIds().has(app.id);
  const registryDetail = state.registryDetails.get(app.id);
  const latest = registryDetail?.versions?.[0];
  const permissions = latest?.permissions ?? [];
  const canInstall = app.availability === "registry" && latest && binding?.installRegistry && state.installations?.currentSpaceId;
  const installing = state.installingAppId === app.id;
  const publisher = app.publisher
    ? `<p class="muted">By ${escapeHtml(app.publisher.displayName)}${app.publisher.verified ? " · Verified" : ""}</p>`
    : "";
  const registryFacts = app.availability === "registry"
    ? `<section class="facts"><span>Version ${escapeHtml(app.latestVersion)}</span><span>${app.installCount} installs</span><span>${app.rating === null ? "Not rated" : `${app.rating} (${app.ratingCount})`}</span></section>`
    : "";
  const help = registryDetail?.readme
    ? `<article class="readme"><h2>About</h2><pre>${escapeHtml(registryDetail.readme)}</pre></article>`
    : `<article class="readme"><h2>About</h2><p>${escapeHtml(app.summary)} Keep the App beside the Thread where you are working, and enable it only in the Spaces that need it.</p></article>`;
  return `<main class="content"><section class="detail-header">${tile(app)}<div class="detail-meta"><h1>${escapeHtml(app.name)}</h1><p class="muted">${escapeHtml(app.summary)}</p></div></section>
    ${publisher}${registryFacts}
    ${state.error ? `<div class="status error">${escapeHtml(state.error)}</div>` : ""}
    <div class="detail-actions"><button class="button" ${installed ? 'data-action="manage"' : canInstall && !installing ? 'data-action="install"' : "disabled"}>${installed ? "Manage" : installing ? "Installing…" : app.availability === "registry" ? "Install" : "Coming later"}</button></div>
    ${app.availability === "registry" && !state.installations?.currentSpaceId ? '<div class="status">Open Apps beside a Thread to install into its Space.</div>' : ""}
    ${help}
    <article class="readme"><h2>Permissions</h2>${permissions.length ? `<ul>${permissions.map((permission) => `<li><label><input type="checkbox" data-install-permission="${escapeHtml(permission.permission)}" ${permission.required ? "checked disabled" : ""} /> <strong>${escapeHtml(permission.permission)}</strong> — ${escapeHtml(permission.rationale)}${permission.required ? " (required)" : " (optional)"}</label></li>`).join("")}</ul>` : "<p>No permissions are declared for this version.</p>"}<h2>Privacy and data</h2><p>Each App runs in its own isolated renderer and receives separate storage for each Space.</p></article>
  </main>`;
}

function manage(app) {
  const spaceId = state.installations?.currentSpaceId;
  const enabled = spaceId
    ? (state.installations?.spaces?.find((entry) => entry.appId === app.id && entry.spaceId === spaceId)?.enabled ?? false)
    : false;
  const rows = spaceId
    ? `<div class="space-row"><div><h2>Current Space</h2><p class="muted">${enabled ? "Enabled" : "Disabled"} in this Space</p></div><button class="switch" role="switch" aria-checked="${enabled}" aria-label="Enable ${escapeHtml(app.name)} in the current Space" data-toggle-space="${escapeHtml(spaceId)}"></button></div>`
    : '<p class="muted">Open Apps beside a Thread to manage its Space access.</p>';
  return `<main class="content"><section class="detail-header">${tile(app)}<div class="detail-meta"><span class="eyebrow">Installed</span><h1>${escapeHtml(app.name)}</h1><p class="muted">Manage local access and data.</p></div></section><section class="section"><h2>Spaces</h2>${rows}</section><section class="section"><h2>Installation</h2><p class="muted">Uninstall the executable package. You can retain local App data for a later reinstall.</p><div class="detail-actions"><button class="button secondary" data-action="uninstall-retain">Uninstall</button><button class="button danger" data-action="uninstall-erase">Uninstall and erase data</button></div></section></main>`;
}

function render() {
  const app = selectedApp();
  root.innerHTML = `<div class="shell">${bar()}${state.route === "detail" && app ? detail(app) : state.route === "manage" && app ? manage(app) : home()}</div>`;
}

async function refresh() {
  state.error = null;
  if (binding?.getState) state.installations = await binding.getState();
  await refreshRegistry();
  render();
}

async function refreshRegistry() {
  if (!registry?.list) return;
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
      color: "var(--penkra-accent, #6d5dfc)",
      availability: "registry",
    }));
  } catch (error) {
    state.registryError = error instanceof Error ? error.message : String(error);
  } finally {
    state.registryLoading = false;
  }
}

async function loadRegistryDetail(app) {
  if (!registry?.get || app.availability !== "registry") return;
  state.error = null;
  try {
    const detail = await registry.get({ slug: app.slug });
    const enriched = { ...detail, readme: null };
    const readmeId = detail.versions?.[0]?.readmeArtifactId;
    if (readmeId && registry.getArtifact) {
      const help = await registry.getArtifact({ id: readmeId, source: "artifact" });
      if (help.kind === "text") enriched.readme = help.text;
    }
    state.registryDetails.set(app.id, enriched);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }
  render();
}

root.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.open) {
    state.appId = target.dataset.open;
    state.route = "detail";
    render();
    const app = selectedApp();
    if (app) void loadRegistryDetail(app);
    return;
  }
  if (target.dataset.action === "back") { state.route = state.route === "manage" ? "detail" : "home"; render(); return; }
  if (target.dataset.action === "refresh") { void refresh(); return; }
  if (target.dataset.action === "manage") { state.route = "manage"; render(); return; }
  if (target.dataset.action === "install" && binding?.installRegistry) {
    const app = selectedApp();
    const detail = app ? state.registryDetails.get(app.id) : null;
    const version = detail?.versions?.[0];
    const spaceId = state.installations?.currentSpaceId;
    if (!app || !version || !spaceId || state.installingAppId) return;
    const permissions = Object.fromEntries(version.permissions.map((permission) => [
      permission.permission,
      permission.required || Boolean(document.querySelector(`[data-install-permission="${CSS.escape(permission.permission)}"]`)?.checked)
        ? "granted"
        : "denied",
    ]));
    state.installingAppId = app.id;
    state.error = null;
    render();
    void binding.installRegistry({ slug: app.slug, version: version.version, spaceId, permissions })
      .then((snapshot) => {
        state.installations = snapshot;
        state.installingAppId = null;
        state.route = "manage";
        render();
      })
      .catch((error) => {
        state.installingAppId = null;
        state.error = error instanceof Error ? error.message : String(error);
        render();
      });
    return;
  }
  if (target.dataset.toggleSpace && binding?.setEnabled) {
    void binding.setEnabled({ appId: state.appId, spaceId: target.dataset.toggleSpace, enabled: target.getAttribute("aria-checked") !== "true" }).then((snapshot) => { state.installations = snapshot; render(); });
    return;
  }
  if (target.dataset.action?.startsWith("uninstall-") && binding?.uninstall) {
    void binding.uninstall({ appId: state.appId, retainData: target.dataset.action === "uninstall-retain" }).then((snapshot) => { state.installations = snapshot; state.route = "detail"; render(); });
  }
});

root.addEventListener("input", (event) => {
  if (!event.target.matches("[data-search]")) return;
  state.query = event.target.value;
  state.route = "home";
  render();
  document.querySelector("[data-search]")?.focus();
  if (searchTimer !== null) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    searchTimer = null;
    void refreshRegistry().then(render);
  }, 250);
});
globalThis.penkra?.tab?.onNavigate?.(({ route, state: nextState }) => { state.route = route === "/manage" ? "manage" : route === "/detail" ? "detail" : "home"; state.appId = nextState?.appId ?? state.appId; render(); });

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }

void refresh().catch((error) => { state.error = error instanceof Error ? error.message : String(error); render(); });
