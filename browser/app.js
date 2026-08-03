import { displayAddress, normalizeAddress, pageLabel } from "./browser-model.mjs";

const runtime = globalThis.penkra;
if (!runtime?.browser) throw new Error("Browser requires Penkra's hosted browser service.");

const root = document.querySelector("#app");
let state = { version: 0, open: false, activePageId: null, pages: [], lastError: null };
let findOpen = false;
let moreOpen = false;
let findResult = { activeMatchOrdinal: 0, matches: 0 };
let addressDraft = "";
let findDraft = "";
let resizeObserver;

const activePage = () => state.pages.find((page) => page.id === state.activePageId) ?? null;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

function iconButton(action, label, symbol, disabled = false) {
  return `<button class="icon-button" data-action="${action}" aria-label="${label}" title="${label}" ${disabled ? "disabled" : ""}>${symbol}</button>`;
}

function render() {
  const page = activePage();
  const focusedAddress = document.activeElement?.id === "address";
  const focusedFind = document.activeElement?.id === "find-input";
  if (!focusedAddress) addressDraft = displayAddress(page?.url ?? "about:blank");
  const tabs = state.pages.map((candidate) => `
    <button class="page-tab ${candidate.id === state.activePageId ? "active" : ""}" data-page="${candidate.id}" title="${escapeHtml(candidate.title || candidate.url)}">
      ${candidate.faviconUrl ? `<img class="favicon" src="${escapeHtml(candidate.faviconUrl)}" alt="" />` : `<span class="fallback">◎</span>`}
      <span class="label">${escapeHtml(pageLabel(candidate))}</span>
      <span class="close" data-close-page="${candidate.id}" role="button" aria-label="Close page">×</span>
    </button>`).join("");
  root.innerHTML = `<div class="browser">
    <nav class="page-tabs" aria-label="Pages">${tabs}<button class="new-page" data-action="new" aria-label="New page" title="New page">＋</button></nav>
    <header class="app-bar">
      ${iconButton("back", "Back", "‹", !page?.canGoBack)}
      ${iconButton("forward", "Forward", "›", !page?.canGoForward)}
      ${iconButton("reload", page?.isLoading ? "Stop" : "Reload", page?.isLoading ? "×" : "↻", !page)}
      <form class="address-form" id="address-form"><input class="address" id="address" value="${escapeHtml(addressDraft)}" placeholder="Enter a URL or search" autocomplete="off" spellcheck="false" /></form>
      ${iconButton("find", "Find in page", "⌕", !page || page.url === "about:blank")}
      ${iconButton("more", "More", "⋮", false)}
      ${moreOpen ? `<div class="more-menu" role="menu"><button type="button" data-action="new" role="menuitem">New page</button><button type="button" data-action="find" role="menuitem" ${!page || page.url === "about:blank" ? "disabled" : ""}>Find in page</button></div>` : ""}
      ${findOpen ? `<form class="find-popover" id="find-form"><input id="find-input" value="${escapeHtml(findDraft)}" placeholder="Find in page" autocomplete="off" /><span class="find-count">${findResult.matches ? `${findResult.activeMatchOrdinal}/${findResult.matches}` : "0/0"}</span><button class="icon-button" type="button" data-action="find-prev">‹</button><button class="icon-button" type="button" data-action="find-next">›</button><button class="icon-button" type="button" data-action="find-close">×</button></form>` : ""}
    </header>
    <main class="viewport" id="viewport">
      ${page?.isLoading ? '<div class="loading-line"></div>' : ""}
      ${!page || page.url === "about:blank" ? '<div class="start"><img class="app-logo" src="assets/logo.svg" alt="" /><strong>Browse the web</strong><p>Enter an address or search above. Pages stay isolated inside this Browser tab.</p></div>' : ""}
      ${page?.lastError ? `<div class="status error"><strong>Couldn’t load this page</strong><p>${escapeHtml(page.lastError)}</p></div>` : ""}
    </main>
  </div>`;
  bindEvents();
  observeViewport();
  if (focusedAddress) { const input = document.querySelector("#address"); input?.focus(); input?.setSelectionRange(addressDraft.length, addressDraft.length); }
  if (focusedFind) document.querySelector("#find-input")?.focus();
}

function observeViewport() {
  resizeObserver?.disconnect();
  const viewport = document.querySelector("#viewport");
  const sync = () => {
    const page = activePage();
    if (!viewport || !page || page.url === "about:blank" || page.lastError) {
      void runtime.browser.setViewport(null);
      return;
    }
    const bounds = viewport.getBoundingClientRect();
    void runtime.browser.setViewport({ x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height });
  };
  resizeObserver = new ResizeObserver(sync);
  if (viewport) resizeObserver.observe(viewport);
  requestAnimationFrame(sync);
}

async function run(action, data) {
  const page = activePage();
  if (action === "more") { moreOpen = !moreOpen; render(); return; }
  if (action === "new") { moreOpen = false; await runtime.browser.newPage({ activate: true }); }
  if (action === "back" && page) await runtime.browser.back(page.id);
  if (action === "forward" && page) await runtime.browser.forward(page.id);
  if (action === "reload" && page) await (page.isLoading ? runtime.browser.stop(page.id) : runtime.browser.reload(page.id));
  if (action === "find") { moreOpen = false; findOpen = true; render(); requestAnimationFrame(() => document.querySelector("#find-input")?.focus()); }
  if (action === "find-close") { findOpen = false; findDraft = ""; findResult = { activeMatchOrdinal: 0, matches: 0 }; if (page) await runtime.browser.stopFind(page.id); render(); }
  if ((action === "find-next" || action === "find-prev") && page && findDraft) {
    findResult = await runtime.browser.find({ pageId: page.id, text: findDraft, action: action === "find-next" ? "next" : "previous" }); render();
  }
  if (action === "select") await runtime.browser.selectPage(data);
  if (action === "close") await runtime.browser.closePage(data);
}

function bindEvents() {
  root.querySelectorAll("[data-action]").forEach((button) => button.addEventListener("click", () => void run(button.dataset.action)));
  root.querySelectorAll("[data-page]").forEach((button) => button.addEventListener("click", (event) => {
    if (event.target.closest("[data-close-page]")) return;
    void run("select", button.dataset.page);
  }));
  root.querySelectorAll("[data-close-page]").forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); void run("close", button.dataset.closePage); }));
  document.querySelector("#address")?.addEventListener("input", (event) => { addressDraft = event.target.value; });
  document.querySelector("#address-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const page = activePage();
    const url = normalizeAddress(addressDraft);
    void (page ? runtime.browser.navigate({ pageId: page.id, url }) : runtime.browser.open(url));
  });
  document.querySelector("#find-input")?.addEventListener("input", (event) => { findDraft = event.target.value; });
  document.querySelector("#find-form")?.addEventListener("submit", (event) => { event.preventDefault(); const page = activePage(); if (page && findDraft) void runtime.browser.find({ pageId: page.id, text: findDraft, action: "search" }).then((result) => { findResult = result; render(); }); });
}

runtime.browser.onState((next) => { state = next; render(); });
runtime.tab.handle("pages.open", async (input) => runtime.browser.open(normalizeAddress(input.url)));
runtime.tab.handle("pages.navigate", async (input) => runtime.browser.navigate({ url: normalizeAddress(input.url), ...(input.pageId ? { pageId: input.pageId } : {}) }));
runtime.tab.handle("pages.evaluate", async (input) => runtime.browser.evaluate(input));
runtime.tab.handle("pages.screenshot", async (input) => runtime.browser.capture(input.pageId));
runtime.tab.handle("pages.snapshot", async (input) => runtime.browser.evaluate({
  pageId: input.pageId,
  expression: `(() => ({ title: document.title, url: location.href, text: (document.body?.innerText ?? "").slice(0, 50000), interactive: [...document.querySelectorAll("a,button,input,textarea,select,[role=button]")].slice(0, 500).map((element, index) => ({ index, tag: element.tagName.toLowerCase(), text: (element.innerText || element.getAttribute("aria-label") || element.getAttribute("placeholder") || "").trim().slice(0, 500), id: element.id || null, name: element.getAttribute("name") })) }))()`,
}));
runtime.tab.handle("pages.click", async (input) => runtime.browser.evaluate({
  pageId: input.pageId,
  expression: `(() => { const element = document.querySelector(${JSON.stringify(input.selector)}); if (!element) throw new Error("Selector did not match an element."); element.click(); return true; })()`,
}));
runtime.tab.handle("pages.type", async (input) => runtime.browser.evaluate({
  pageId: input.pageId,
  expression: `(() => { const element = document.querySelector(${JSON.stringify(input.selector)}); if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) throw new Error("Selector must match a text control."); const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set; setter?.call(element, ${JSON.stringify(input.text)}); element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); element.focus(); return true; })()`,
}));
runtime.tab.handle("pages.scroll", async (input) => runtime.browser.evaluate({
  pageId: input.pageId,
  expression: `(() => { window.scrollBy({ left: ${Number(input.deltaX ?? 0)}, top: ${Number(input.deltaY)}, behavior: "instant" }); return { x: scrollX, y: scrollY }; })()`,
}));
runtime.tab.handle("pages.wait", async (input) => runtime.browser.evaluate({
  pageId: input.pageId,
  expression: `new Promise((resolve, reject) => { const selector = ${JSON.stringify(input.selector)}; const deadline = Date.now() + ${Number(input.timeoutMs ?? 10000)}; const check = () => { if (document.querySelector(selector)) resolve(true); else if (Date.now() >= deadline) reject(new Error("Timed out waiting for selector.")); else setTimeout(check, 50); }; check(); })`,
}));
runtime.tab.onNavigate(async ({ state: navigationState }) => {
  if (navigationState?.url) await runtime.browser.open(normalizeAddress(navigationState.url));
});

state = await runtime.browser.open();
render();
