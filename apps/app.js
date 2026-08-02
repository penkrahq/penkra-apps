const catalog = [
  { id: "com.penkra.browser", name: "Browser", summary: "Browse and work with the web beside any Thread.", color: "#4a90e2", installed: false },
  { id: "com.penkra.explorer", name: "Explorer", summary: "Inspect files and folders connected to your work.", color: "#e39a3b", installed: false },
  { id: "com.figma.app", name: "Figma", summary: "Create, review, and update product designs.", color: "#a259ff", installed: false },
  { id: "com.linear.app", name: "Linear", summary: "Plan work and manage issues with your team.", color: "#5e6ad2", installed: false },
  { id: "com.github.app", name: "GitHub", summary: "Work with repositories, issues, and pull requests.", color: "#333", installed: false },
  { id: "com.slack.app", name: "Slack", summary: "Find and share team conversations.", color: "#36c5f0", installed: false },
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

const state = { route: "home", appId: null, query: "", installations: null, busy: false, error: null };
const root = document.querySelector("#app");
const binding = globalThis.penkra?.installations;

function selectedApp() { return catalog.find((app) => app.id === state.appId) ?? null; }
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
function filteredCatalog() { const query = state.query.trim().toLowerCase(); return query ? catalog.filter((app) => `${app.name} ${app.summary}`.toLowerCase().includes(query)) : catalog; }

function home() {
  const apps = filteredCatalog();
  return `<main class="content">
    <section class="hero"><span class="eyebrow">Discover</span><h1>Apps for your work</h1><p class="muted">Open installed Apps or find something new.</p></section>
    ${state.query ? results(apps) : `<section class="launcher-grid" aria-label="Featured Apps">${apps.slice(0, 6).map((app) => `<button class="launcher" data-open="${app.id}">${tile(app)}<span class="launcher-label">${app.name}</span></button>`).join("")}</section>${results(apps)}`}
  </main>`;
}

function results(apps) {
  return `<section class="section"><div class="section-heading"><h2>${state.query ? "Search results" : "Explore Apps"}</h2><span class="muted">${apps.length}</span></div>
    ${apps.length ? `<div class="result-list">${apps.map((app) => `<button class="result" data-open="${app.id}">${tile(app)}<span class="result-copy"><span class="result-name">${app.name}</span><span class="result-summary">${app.summary}</span></span><span class="button secondary">View</span></button>`).join("")}</div>` : `<div class="empty"><div><h2>No Apps found</h2><p class="muted">Try another name or description.</p></div></div>`}
  </section>`;
}

function detail(app) {
  const installed = installedIds().has(app.id);
  return `<main class="content"><section class="detail-header">${tile(app)}<div class="detail-meta"><h1>${app.name}</h1><p class="muted">${app.summary}</p></div></section>
    ${state.error ? `<div class="status error">${escapeHtml(state.error)}</div>` : ""}
    <div class="detail-actions"><button class="button" data-action="${installed ? "manage" : "install"}" ${state.busy ? "disabled" : ""}>${state.busy ? "Installing…" : installed ? "Manage" : "Install"}</button></div>
    ${state.busy ? '<div class="progress" aria-label="Installing"><span></span></div>' : ""}
    <article class="readme"><h2>About</h2><p>${app.summary} Keep the App beside the Thread where you are working, and enable it only in the Spaces that need it.</p><h2>Permissions</h2><p>Permissions are reviewed before installation and can be inspected or revoked later in Penkra Settings.</p><h2>Privacy and data</h2><p>Each App runs in its own isolated renderer and receives separate storage for each Space.</p></article>
  </main>`;
}

function manage(app) {
  const spaces = state.installations?.spaces?.filter((entry) => entry.appId === app.id) ?? [];
  const rows = ["Personal", "Work"].map((name, index) => {
    const spaceId = name.toLowerCase();
    const enabled = spaces.find((entry) => entry.spaceId === spaceId)?.enabled ?? index === 0;
    return `<div class="space-row"><div><h2>${name}</h2><p class="muted">${enabled ? "Enabled" : "Disabled"} in this Space</p></div><button class="switch" role="switch" aria-checked="${enabled}" aria-label="Enable ${app.name} in ${name}" data-toggle-space="${spaceId}"></button></div>`;
  }).join("");
  return `<main class="content"><section class="detail-header">${tile(app)}<div class="detail-meta"><span class="eyebrow">Installed</span><h1>${app.name}</h1><p class="muted">Manage local access and data.</p></div></section><section class="section"><h2>Spaces</h2>${rows}</section><section class="section"><h2>Installation</h2><p class="muted">Uninstall the executable package. You can retain local App data for a later reinstall.</p><div class="detail-actions"><button class="button secondary" data-action="uninstall-retain">Uninstall</button><button class="button danger" data-action="uninstall-erase">Uninstall and erase data</button></div></section></main>`;
}

function render() {
  const app = selectedApp();
  root.innerHTML = `<div class="shell">${bar()}${state.route === "detail" && app ? detail(app) : state.route === "manage" && app ? manage(app) : home()}</div>`;
}

async function refresh() {
  state.error = null;
  if (binding?.getState) state.installations = await binding.getState();
  render();
}

async function install(appId) {
  if (!binding?.install) { state.error = "The Apps installation service is unavailable in this host."; render(); return; }
  state.busy = true; render();
  try { state.installations = await binding.install({ appId }); }
  catch (error) { state.error = error instanceof Error ? error.message : String(error); }
  finally { state.busy = false; render(); }
}

root.addEventListener("click", (event) => {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.dataset.open) { state.appId = target.dataset.open; state.route = "detail"; render(); return; }
  if (target.dataset.action === "back") { state.route = state.route === "manage" ? "detail" : "home"; render(); return; }
  if (target.dataset.action === "refresh") { void refresh(); return; }
  if (target.dataset.action === "manage") { state.route = "manage"; render(); return; }
  if (target.dataset.action === "install") { void install(state.appId); return; }
  if (target.dataset.toggleSpace && binding?.setEnabled) {
    void binding.setEnabled({ appId: state.appId, spaceId: target.dataset.toggleSpace, enabled: target.getAttribute("aria-checked") !== "true" }).then((snapshot) => { state.installations = snapshot; render(); });
    return;
  }
  if (target.dataset.action?.startsWith("uninstall-") && binding?.uninstall) {
    void binding.uninstall({ appId: state.appId, retainData: target.dataset.action === "uninstall-retain" }).then((snapshot) => { state.installations = snapshot; state.route = "detail"; render(); });
  }
});

root.addEventListener("input", (event) => { if (event.target.matches("[data-search]")) { state.query = event.target.value; state.route = "home"; render(); document.querySelector("[data-search]")?.focus(); } });
globalThis.penkra?.tab?.onNavigate?.(({ route, state: nextState }) => { state.route = route === "/manage" ? "manage" : route === "/detail" ? "detail" : "home"; state.appId = nextState?.appId ?? state.appId; render(); });

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }

void refresh().catch((error) => { state.error = error instanceof Error ? error.message : String(error); render(); });
