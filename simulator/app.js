import {
  CLOSED_SESSION,
  canDestructivelyChange,
  chooseSelectedDevice,
  classifySimulatorError,
  createSingleFlight,
  deviceGlyph,
  isReadyControlAction,
  isIntentionalStartupCancellation,
  lifecycleCopy,
  newestInstallableRuntime,
  normalizedViewportPoint,
  phaseTone,
  platformName,
  reduceControlErrorNotice,
  resolveNewDeviceState,
  runtimeSetupCopy,
  simulatorSetupRequest,
  splitDevices,
  targetIdentifier,
} from "./simulator-model.mjs";

const root = document.querySelector("#app");
const runtime = globalThis.penkra;
if (!runtime?.simulator) {
  root.innerHTML = `<main class="center-state"><section class="state-card failure-card"><span class="state-icon danger">△</span><span class="status-pill danger">Host unavailable</span><h1>Simulator could not start</h1><p>This Penkra build does not expose the hosted simulator service. Rebuild or update Penkra Dev, then reopen this App.</p></section></main>`;
  throw new Error("Simulator requires Penkra's hosted simulator service.");
}

let environment = { platforms: [], runtimes: [] };
let runtimes = [];
let deviceTypes = [];
let devices = [];
let session = { ...CLOSED_SESSION };
let selectedId = null;
let modal = null;
let transientState = null;
let notice = null;
let controlErrorNotice = null;
let wasReady = false;
let pointerStart = null;
let frameTimer = null;
let frameGeneration = 0;
let setupAttemptGeneration = 0;
let openAttemptGeneration = 0;
let startupCancellationPending = false;
const createDeviceFlight = createSingleFlight(createDeviceOnce);

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

const selectedDevice = () => chooseSelectedDevice(devices, selectedId);
const selectedRuntime = (device = selectedDevice()) => runtimes.find((candidate) => candidate.id === device?.runtimeId) ?? null;
const deviceType = (device = selectedDevice()) => deviceTypes.find((candidate) => candidate.id === device?.deviceTypeId) ?? null;
const platformAvailability = (platform) => environment.platforms.find((candidate) => candidate.platform === platform);

function iconButton(action, label, icon, options = {}) {
  const disabled = options.disabled ? "disabled" : "";
  const pressed = options.pressed === undefined ? "" : `aria-pressed="${options.pressed}"`;
  return `<button class="icon-button" type="button" data-action="${action}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}" ${pressed} ${disabled}>${icon}</button>`;
}

function appBar() {
  const active = session.open ? session.device : null;
  const status = active
    ? `<span class="status-pill ${phaseTone(session.phase)}"><span class="status-dot"></span>${escapeHtml(session.phase)}</span>`
    : "";
  return `<header class="app-bar">
    <div class="app-identity"><img src="assets/icon.svg" alt="" /><span>${escapeHtml(active?.name || "Simulator")}</span>${status}</div>
    <div class="app-actions">
      ${iconButton("refresh", "Refresh devices", "↻")}
      <button class="primary compact" type="button" data-action="new-device"><span aria-hidden="true">＋</span> New</button>
      ${iconButton("more", "More", "•••")}
    </div>
  </header>`;
}

function deviceList() {
  const groups = splitDevices(devices);
  const renderGroup = (label, entries) => entries.length ? `<section class="device-group">
    <h2>${label}</h2>
    ${entries.map(deviceRow).join("")}
  </section>` : "";
  return `<aside class="device-library" aria-label="Saved devices">
    <div class="library-heading"><strong>Saved devices</strong><button class="primary mini" type="button" data-action="new-device">＋ New</button></div>
    <div class="device-scroll">
      ${renderGroup("Apple", groups.apple)}
      ${renderGroup("Android", groups.android)}
      ${devices.length ? "" : `<div class="library-empty">No saved devices</div>`}
    </div>
    <p class="persistence-note"><span aria-hidden="true">▣</span> Closing this App tab stops its system session, not saved devices.</p>
  </aside>`;
}

function deviceRow(device) {
  const active = selectedDevice()?.id === device.id;
  const leasedHere = session.open && session.device?.id === device.id;
  const state = leasedHere ? session.phase : device.state;
  return `<button class="device-row ${active ? "selected" : ""}" type="button" data-action="select-device" data-device-id="${escapeHtml(device.id)}">
    <span class="device-glyph ${device.platform}">${deviceGlyph(device)}</span>
    <span class="device-row-copy"><strong>${escapeHtml(device.name)}</strong><small>${escapeHtml(platformName(device.platform, device.formFactor))} · ${escapeHtml(selectedRuntime(device)?.version || "Saved")}</small></span>
    <span class="status-pill ${phaseTone(state)}">${escapeHtml(state)}</span>
  </button>`;
}

function mainContent() {
  const device = selectedDevice();
  if (modal?.kind === "setup") return setupRequired(modal);
  if (transientState?.kind === "busy") return busyState(device, transientState.message);
  if (["unsupported", "unavailable"].includes(transientState?.kind)) return unsupportedState(transientState.platform, transientState.message);
  if (transientState?.kind === "failed") return failureState(device, transientState.message, transientState.crashed);
  if (session.open && ["preparing", "booting", "stopping"].includes(session.phase)) return lifecycleState(session.phase, session.device);
  if (session.open && session.phase === "failed") return failureState(session.device, session.lastError, wasReady);
  if (session.open && session.phase === "ready") return liveSession();
  if (!devices.length) return emptyState();
  return savedDeviceDetail(device);
}

function savedDeviceDetail(device) {
  const runtimeInfo = selectedRuntime(device);
  const type = deviceType(device);
  const mutable = canDestructivelyChange(device, session);
  return `<main class="detail-page">
    <div class="detail-title-row">
      <div class="device-title"><span class="device-glyph large ${device.platform}">${deviceGlyph(device)}</span><div><h1>${escapeHtml(device.name)}</h1><p>${escapeHtml(platformName(device.platform, device.formFactor))} ${escapeHtml(runtimeInfo?.version || "")} · ${escapeHtml(type?.name || (device.formFactor === "tablet" ? "Tablet" : "Phone"))}</p></div></div>
      <div class="detail-actions"><span class="status-pill neutral">${escapeHtml(device.state)}</span><button class="primary" type="button" data-action="open-device">▷ Open</button></div>
    </div>
    <div class="detail-grid">
      <section class="card"><h2>Configuration</h2>${infoRow("Runtime", runtimeInfo ? `${runtimeInfo.name} ${runtimeInfo.version}` : "Saved runtime")}${infoRow("Device type", type?.name || (device.formFactor === "tablet" ? "Tablet" : "Phone"))}${infoRow("Platform", platformName(device.platform, device.formFactor))}</section>
      <section class="card"><h2>Device data</h2><p class="muted">OS data remains saved when you stop or close this App tab.</p><div class="button-row"><button type="button" data-action="confirm-erase" ${mutable ? "" : "disabled"}>Erase</button><button class="danger-quiet" type="button" data-action="confirm-delete" ${mutable ? "" : "disabled"}>Delete</button></div></section>
    </div>
    <div class="info-banner">Simulator preserves this device and its OS data until you explicitly erase or delete it.</div>
  </main>`;
}

function infoRow(label, value) {
  return `<div class="info-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function lifecycleState(phase, device) {
  const copy = lifecycleCopy(phase, device?.name);
  return `<main class="center-state"><section class="state-card lifecycle-card">
    <span class="state-icon active" aria-hidden="true">◔</span>
    <span class="status-pill active">${escapeHtml(phase)}</span>
    <h1>${escapeHtml(copy.title)}</h1><p>${escapeHtml(copy.detail)}</p>
    <div class="progress" aria-label="${copy.progress}% complete"><span style="width:${copy.progress}%"></span></div>
    <button type="button" data-action="stop-device">Cancel</button>
  </section></main>`;
}

function liveSession() {
  const device = session.device;
  const identifier = targetIdentifier(session.target);
  const isAndroid = device.platform === "android";
  const isTablet = device.formFactor === "tablet";
  return `<main class="live-layout ${isTablet ? "tablet" : "phone"}">
    ${deviceList()}
    <section class="viewer-column">
      <div class="session-toolbar">
        <span class="status-pill success"><span class="status-dot"></span>Ready</span>
        <span class="session-name">${escapeHtml(device.name)} · ${escapeHtml(session.orientation)}</span>
        <button type="button" data-action="rotate">↻ Rotate</button>
        <button type="button" data-action="capture">▣ Capture</button>
        <button type="button" data-action="stop-device">■ Stop</button>
        ${responsiveControls(device, identifier, isAndroid)}
      </div>
      <div class="viewer-stage">
        <div class="device-shell ${isAndroid ? "android" : "ios"} ${isTablet ? "tablet" : "phone"} ${session.orientation}">
          <div class="hosted-display" id="simulator-viewport" tabindex="0" aria-label="Interactive ${escapeHtml(platformName(device.platform, device.formFactor))} display"><span class="frame-status">Starting device…</span><img id="simulator-frame" alt="Simulated device" /></div>
        </div>
      </div>
    </section>
    <aside class="hardware-panel">${hardwareControls(device, identifier, isAndroid, "panel")}</aside>
  </main>`;
}

function responsiveControls(device, identifier, isAndroid) {
  return `<details class="responsive-controls">
    <summary>Controls</summary>
    <div class="responsive-controls-sheet" role="group" aria-label="${escapeHtml(device.name)} controls">
      ${hardwareControls(device, identifier, isAndroid, "sheet")}
    </div>
  </details>`;
}

function hardwareControls(_device, identifier, isAndroid, surface) {
  const inputId = `type-input-${surface}`;
  return `<h2>Controls</h2>
    <div class="control-grid">
      ${iconButton("home", "Home", "⌂")}${iconButton("power", "Power", "⏻")}
      ${isAndroid ? iconButton("back", "Back", "←") : iconButton("volume-up", "Volume up", "+")}
      ${isAndroid ? iconButton("app-switcher", "App switcher", "▢") : iconButton("volume-down", "Volume down", "−")}
      ${iconButton("rotate", "Rotate", "↻")}${iconButton("capture", "Capture", "▣")}
    </div>
    <section class="target-card"><span>${escapeHtml(identifier?.label || "Target")}</span><code>${escapeHtml(identifier?.value || "Preparing target…")}</code><button type="button" data-action="copy-target" ${identifier ? "" : "disabled"}>Copy</button></section>
    <form class="type-form" id="type-form-${surface}" data-type-form><label for="${inputId}">Type into device</label><div><input id="${inputId}" data-type-input autocomplete="off" placeholder="Text"/><button class="primary" type="submit">Send</button></div></form>
    <p class="trust-note">Tap, swipe, and typing are sent only to this tab's leased device.</p>`;
}

function emptyState() {
  return `<main class="center-state"><section class="state-card"><span class="state-icon">▯</span><h1>Create your first device</h1><p>Save an iPhone, iPad, or Android device. There is no project to choose, and OS data remains available after this tab closes.</p><button class="primary" type="button" data-action="new-device">＋ New device</button></section></main>`;
}

function setupRequired(setup) {
  const runtimeInfo = setup.runtime;
  const copy = runtimeSetupCopy(runtimeInfo);
  const isAndroid = runtimeInfo?.platform === "android";
  const installable = runtimeInfo?.installable === true;
  const installing = setup.installing === true;
  const cancelling = setup.cancelling === true;
  return `<main class="center-state"><section class="state-card setup-card"><span class="state-icon ${installing ? "active" : "warning"}">${installing ? "◔" : "⌕"}</span><span class="status-pill ${installing ? "active" : "warning"}">${cancelling ? "Cancelling" : installing ? "Installing" : "Setup required"}</span><h1>${escapeHtml(cancelling ? `Cancelling ${runtimeInfo.name} setup` : installing ? `Installing ${runtimeInfo.name}` : copy.title)}</h1><p>${escapeHtml(installing ? "Penkra is preparing this simulator runtime. You can cancel and try again later." : setup.message || copy.description)}</p><div class="runtime-card"><span class="device-glyph ${isAndroid ? "android" : "ios"}">${isAndroid ? "◆" : "▯"}</span><div><strong>${escapeHtml(runtimeInfo?.name || "Required runtime")}</strong><small>${escapeHtml(runtimeInfo?.version || platformName(runtimeInfo?.platform))}</small></div><span class="status-pill ${installing ? "active" : "warning"}">${cancelling ? "Cancelling" : installing ? "Installing" : "Missing"}</span></div>${installing ? `<div class="progress" aria-label="${cancelling ? "Cancelling setup" : "Installing runtime"}"><span style="width:68%"></span></div>` : `<p class="impact">${escapeHtml(copy.impact)}</p>`}${setup.error ? `<code class="error-code">${escapeHtml(setup.error)}</code>` : ""}<div class="button-row centered">${installing ? `<button type="button" data-action="cancel-setup" ${cancelling ? "disabled" : ""}>${cancelling ? "Cancelling…" : "Cancel setup"}</button>` : `${installable ? `<button class="primary" type="button" data-action="install-runtime">⇩ ${escapeHtml(copy.title)}</button>` : `<button type="button" data-action="refresh">Check again</button>`}<button type="button" data-action="cancel-state">Cancel</button>`}</div><small>${installing ? "The host owns the download and installation." : installable ? "Penkra presents the trusted prerequisite prompt." : "Installation is not available from this host."}</small></section></main>`;
}

function busyState(device, message) {
  return `<main class="center-state"><section class="state-card"><span class="state-icon active">▣</span><span class="status-pill active">Busy</span><h1>${escapeHtml(device?.name || "This device")} is open in another tab</h1><p>A saved device can have one live lease. Stop it in the owning tab before opening it here.</p><code class="error-code">${escapeHtml(message)}</code><div class="button-row centered"><button type="button" data-action="refresh">Check again</button><button class="primary" type="button" data-action="cancel-state">Back to devices</button></div></section></main>`;
}

function unsupportedState(platform, message) {
  const label = platform === "android" ? "Android" : "iOS";
  return `<main class="center-state"><section class="state-card"><span class="state-icon">⊘</span><span class="status-pill neutral">Unavailable</span><h1>${label} simulator is unavailable on this computer</h1><p>${escapeHtml(message || (platform === "ios" ? "Apple simulator support requires macOS with Xcode components installed." : "This Android runtime is not supported on this computer."))}</p><button type="button" data-action="cancel-state">Back to devices</button></section></main>`;
}

function failureState(device, message, crashed = false) {
  return `<main class="center-state"><section class="state-card failure-card"><span class="state-icon danger">△</span><span class="status-pill danger">Failed</span><h1>${crashed ? "The live session exited unexpectedly" : `${escapeHtml(device?.name || "Device")} could not start`}</h1><p>${crashed ? "Your saved device and OS data are intact. Reopen it to start a new native session." : "The saved device is still available. Review the failure and try again."}</p><code class="error-code">${escapeHtml(message || "The native simulator session ended unexpectedly.")}</code><div class="button-row centered"><button type="button" data-action="cancel-state">Back to devices</button><button class="primary" type="button" data-action="open-device">↻ Try again</button></div></section></main>`;
}

function newDeviceDialog() {
  if (modal?.kind !== "new") return "";
  const availablePlatforms = environment.platforms.filter((item) => item.status !== "unsupported");
  const platform = modal.platform || availablePlatforms[0]?.platform || "ios";
  const matchingRuntimes = runtimes.filter((item) => item.platform === platform && item.status === "available");
  const runtimeId = modal.runtimeId || matchingRuntimes[0]?.id || "";
  const matchingTypes = deviceTypes.filter((item) => item.runtimeId === runtimeId);
  const selectedType = modal.deviceTypeId || matchingTypes[0]?.id || "";
  return `<div class="scrim" role="presentation"><form class="dialog" id="new-device-form" aria-labelledby="new-device-title">
    <h1 id="new-device-title">New simulated device</h1>
    <label>Platform<select id="platform-select">${availablePlatforms.map((item) => `<option value="${item.platform}" ${item.platform === platform ? "selected" : ""}>${platformName(item.platform)}</option>`).join("")}</select></label>
    <label>Runtime<select id="runtime-select">${matchingRuntimes.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === runtimeId ? "selected" : ""}>${escapeHtml(item.name)} ${escapeHtml(item.version)}${item.status === "missing" ? " — setup required" : ""}</option>`).join("")}</select></label>
    <label>Device type<select id="device-type-select">${matchingTypes.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedType ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
    <label>Name <span class="optional">Optional</span><input id="device-name" maxlength="80" placeholder="${platform === "android" ? "Pixel 9" : "iPhone 16 Pro"}" value="${escapeHtml(modal.name || "")}" /></label>
    <p class="dialog-note">This device is saved in this Space. There is no project association.</p>
    <div class="dialog-actions"><button type="button" data-action="close-modal">Cancel</button><button class="primary" type="submit" ${runtimeId && selectedType && !createDeviceFlight.pending ? "" : "disabled"}>${createDeviceFlight.pending ? "Creating…" : "＋ Create"}</button></div>
  </form></div>`;
}

function confirmationDialog() {
  if (!modal || !["erase", "delete"].includes(modal.kind)) return "";
  const device = selectedDevice();
  const deleting = modal.kind === "delete";
  return `<div class="scrim"><section class="dialog confirmation" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><h1 id="confirm-title">${deleting ? "Delete device?" : "Erase device?"}</h1><p>${deleting ? "Remove this saved device and all of its OS data. This action cannot be undone." : "Reset this device to a clean OS state. The saved device remains available."}</p><div class="confirm-device"><span class="device-glyph ${device.platform}">${deviceGlyph(device)}</span><strong>${escapeHtml(device.name)}</strong></div><div class="dialog-actions"><button type="button" data-action="close-modal">Cancel</button><button class="danger" type="button" data-action="${deleting ? "delete-device" : "erase-device"}">${deleting ? "Delete" : "Erase"}</button></div></section></div>`;
}

function noticeBanner() {
  const message = controlErrorNotice || notice;
  return message ? `<div class="notice" role="status">${escapeHtml(message)}<button type="button" data-action="dismiss-notice" aria-label="Dismiss">×</button></div>` : "";
}

function render() {
  const live = session.open && session.phase === "ready";
  const mountedViewport = root.querySelector("#simulator-viewport");
  const preserveViewport = Boolean(mountedViewport && live);
  if (preserveViewport) mountedViewport.remove();
  else stopViewportFrames();
  root.innerHTML = `<div class="simulator">${appBar()}${live ? mainContent() : `<div class="standard-workspace">${deviceList()}${mainContent()}</div>`}${noticeBanner()}${newDeviceDialog()}${confirmationDialog()}</div>`;
  if (preserveViewport) {
    const viewportPlaceholder = root.querySelector("#simulator-viewport");
    if (viewportPlaceholder) viewportPlaceholder.replaceWith(mountedViewport);
  }
  bindEvents();
  if (!preserveViewport) syncViewport();
}

function stopViewportFrames() {
  frameGeneration += 1;
  if (frameTimer !== null) clearTimeout(frameTimer);
  frameTimer = null;
  void runtime.simulator.setViewport(null);
}

function syncViewport() {
  stopViewportFrames();
  const generation = frameGeneration;
  const viewport = document.querySelector("#simulator-viewport");
  const frame = document.querySelector("#simulator-frame");
  let status = viewport?.querySelector(".frame-status");
  if (!viewport || !frame || !session.open || session.phase !== "ready") return;
  const update = async () => {
    try {
      const { dataUrl } = await runtime.simulator.capture();
      if (generation !== frameGeneration || !frame.isConnected) return;
      frame.onload = () => {
        status?.remove();
        status = null;
      };
      frame.src = dataUrl;
    } catch {
      status ??= document.createElement("span");
      status.className = "frame-status";
      status.textContent = "Waiting for device frame…";
      if (!status.isConnected) viewport.append(status);
    }
    if (generation === frameGeneration && frame.isConnected) {
      frameTimer = setTimeout(() => void update(), 300);
    }
  };
  void update();
}

async function refreshAll() {
  const [nextEnvironment, nextRuntimes, nextTypes, nextDevices, nextSession] = await Promise.all([
    runtime.simulator.getEnvironment(), runtime.simulator.listRuntimes(), runtime.simulator.listDeviceTypes(),
    runtime.simulator.listDevices(), runtime.simulator.getState(),
  ]);
  environment = nextEnvironment;
  runtimes = [...nextRuntimes];
  deviceTypes = [...nextTypes];
  devices = [...nextDevices];
  session = nextSession;
  selectedId = chooseSelectedDevice(devices, selectedId)?.id ?? null;
}

async function execute(action, target) {
  const device = selectedDevice();
  const activeSetup = modal?.kind === "setup" ? modal : null;
  clearStaleNotices();
  try {
    if (action === "refresh") { transientState = null; await refreshAll(); }
    if (action === "new-device") openNewDevice();
    if (action === "close-modal") modal = null;
    if (action === "cancel-state") { modal = null; transientState = null; }
    if (action === "dismiss-notice") { notice = null; controlErrorNotice = null; }
    if (action === "select-device") { selectedId = target.dataset.deviceId; transientState = null; await runtime.tab?.setRoute?.({ route: "/devices", state: { deviceId: selectedId } }); }
    if (action === "open-device" && device) { await openDevice(device); return; }
    if (action === "stop-device") { await stopDevice(); return; }
    if (action === "confirm-erase" && device) modal = { kind: "erase", deviceId: device.id };
    if (action === "confirm-delete" && device) modal = { kind: "delete", deviceId: device.id };
    if (action === "erase-device" && device) { await runtime.simulator.eraseDevice(device.id); modal = null; notice = `${device.name} was erased and remains saved.`; await refreshDevicesOnly(); }
    if (action === "delete-device" && device) { await runtime.simulator.deleteDevice(device.id); modal = null; notice = `${device.name} was deleted.`; await refreshDevicesOnly(); }
    if (action === "install-runtime" && activeSetup?.runtime?.installable) { await installRuntime(activeSetup); return; }
    if (action === "cancel-setup" && activeSetup?.installing) { await cancelRuntimeSetup(activeSetup); return; }
    if (action === "rotate") {
      session = await runtime.simulator.rotate(session.orientation === "portrait" ? "landscape" : "portrait");
      syncLiveOrientation();
      return;
    }
    if (["home", "back", "app-switcher", "power", "volume-up", "volume-down"].includes(action)) {
      await runtime.simulator.press(action);
      return;
    }
    if (action === "capture") await captureDisplay();
    if (action === "copy-target") await copyTarget();
  } catch (cause) {
    const classified = classifySimulatorError(cause);
    if (isReadyControlAction(action, session)) {
      controlErrorNotice = reduceControlErrorNotice(controlErrorNotice, { type: "failed", message: classified.message });
      render();
      return;
    }
    if (classified.kind === "setup") {
      const missing = newestInstallableRuntime(runtimes, device?.platform, device?.runtimeId) ?? newestInstallableRuntime(runtimes);
      if (missing) modal = { kind: "setup", runtime: missing, message: platformAvailability(missing.platform)?.message, error: classified.message };
      else transientState = { kind: "unavailable", platform: device?.platform || "ios", message: platformAvailability(device?.platform)?.message || classified.message };
    } else if (classified.kind === "unsupported") transientState = { ...classified, platform: device?.platform || "ios" };
    else transientState = { ...classified, crashed: wasReady };
  }
  render();
}

async function openDevice(device) {
  const generation = ++openAttemptGeneration;
  startupCancellationPending = false;
  transientState = null;
  try {
    const opened = await runtime.simulator.open(device.id);
    if (generation !== openAttemptGeneration) return;
    session = opened;
    selectedId = device.id;
  } catch (cause) {
    if (generation !== openAttemptGeneration) return;
    throw cause;
  }
  render();
}

async function stopDevice() {
  const cancellingStartup = session.open && ["preparing", "booting"].includes(session.phase);
  openAttemptGeneration += 1;
  startupCancellationPending = cancellingStartup;
  transientState = null;
  try {
    await runtime.simulator.close();
    session = { ...CLOSED_SESSION };
    await refreshDevicesOnly();
  } catch (cause) {
    const classified = classifySimulatorError(cause);
    transientState = { ...classified, crashed: wasReady };
  } finally {
    startupCancellationPending = false;
  }
  render();
}

async function installRuntime(setup) {
  const generation = ++setupAttemptGeneration;
  modal = { ...setup, installing: true, error: null };
  render();
  try {
    await runtime.simulator.requestSetup(simulatorSetupRequest(setup.runtime));
    if (generation !== setupAttemptGeneration) return;
    await refreshAll();
    if (generation !== setupAttemptGeneration) return;
    modal = null;
    notice = `${setup.runtime.name} setup completed.`;
  } catch (cause) {
    if (generation !== setupAttemptGeneration) return;
    modal = {
      ...setup,
      installing: false,
      error: classifySimulatorError(cause).message,
    };
  }
  render();
}

async function cancelRuntimeSetup(setup) {
  setupAttemptGeneration += 1;
  modal = { ...setup, installing: true, cancelling: true, error: null };
  render();
  try {
    await runtime.simulator.cancelSetup();
    modal = {
      ...setup,
      installing: false,
      cancelling: false,
      error: "Setup was cancelled. You can try again when ready.",
    };
  } catch (cause) {
    modal = {
      ...setup,
      installing: false,
      cancelling: false,
      error: classifySimulatorError(cause).message,
    };
  }
  render();
}

function openNewDevice(preferredPlatform = null) {
  const next = resolveNewDeviceState({
    platforms: environment.platforms,
    runtimes,
    deviceTypes,
    preferredPlatform,
  });
  transientState = null;
  if (next.kind === "form") {
    modal = { kind: "new", platform: next.platform, runtimeId: next.runtimeId };
  } else if (next.kind === "setup") {
    modal = { kind: "setup", runtime: next.runtime, message: next.message, error: null };
  } else {
    modal = null;
    transientState = next;
  }
}

async function refreshDevicesOnly() {
  devices = [...await runtime.simulator.listDevices()];
  selectedId = chooseSelectedDevice(devices, selectedId)?.id ?? null;
}

async function captureDisplay() {
  const { dataUrl } = await runtime.simulator.capture();
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = `${session.device?.name || "simulator"}-capture.png`;
  anchor.click();
  notice = "Screenshot captured.";
}

async function copyTarget() {
  const identifier = targetIdentifier(session.target || await runtime.simulator.getTarget());
  if (!identifier) return;
  await navigator.clipboard.writeText(identifier.value);
  notice = `${identifier.label} copied.`;
}

function createDevice(form) {
  clearStaleNotices();
  const input = {
    runtimeId: form.querySelector("#runtime-select").value,
    deviceTypeId: form.querySelector("#device-type-select").value,
    name: form.querySelector("#device-name").value.trim(),
  };
  const creating = createDeviceFlight.run(input);
  render();
  return creating.finally(() => render());
}

async function createDeviceOnce({ runtimeId, deviceTypeId, name }) {
  const runtimeInfo = runtimes.find((candidate) => candidate.id === runtimeId);
  if (runtimeInfo?.status === "missing") { modal = { kind: "setup", runtime: runtimeInfo }; render(); return; }
  const device = await runtime.simulator.createDevice({ runtimeId, deviceTypeId, ...(name ? { name } : {}) });
  devices = [...await runtime.simulator.listDevices()];
  selectedId = device.id;
  modal = null;
  notice = `${device.name} was created.`;
  render();
}

function bindEvents() {
  root.querySelectorAll("[data-action]").forEach((element) => element.addEventListener("click", () => void execute(element.dataset.action, element)));
  const newForm = document.querySelector("#new-device-form");
  newForm?.addEventListener("submit", (event) => { event.preventDefault(); void createDevice(newForm).catch(handleUnhandled); });
  document.querySelector("#platform-select")?.addEventListener("change", (event) => { openNewDevice(event.target.value); render(); });
  document.querySelector("#runtime-select")?.addEventListener("change", (event) => { modal = { ...modal, runtimeId: event.target.value, deviceTypeId: null }; render(); });
  document.querySelector("#device-type-select")?.addEventListener("change", (event) => { modal = { ...modal, deviceTypeId: event.target.value }; });
  document.querySelector("#device-name")?.addEventListener("input", (event) => { modal = { ...modal, name: event.target.value }; });
  document.querySelectorAll("[data-type-form]").forEach((form) => form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("[data-type-input]");
    if (!input?.value) return;
    const value = input.value;
    clearStaleNotices();
    void runtime.simulator.type(value).then(
      () => {
        controlErrorNotice = reduceControlErrorNotice(controlErrorNotice, { type: "action-succeeded" });
        input.value = "";
      },
      (cause) => handleControlError("type", cause),
    );
  }));
  const viewport = document.querySelector("#simulator-viewport");
  if (!viewport || viewport.dataset.inputBound === "true") return;
  viewport.dataset.inputBound = "true";
  viewport.addEventListener("pointerdown", (event) => { pointerStart = viewportPoint(event, viewport); viewport.setPointerCapture(event.pointerId); });
  viewport.addEventListener("pointerup", (event) => {
    const end = viewportPoint(event, viewport);
    const start = pointerStart;
    pointerStart = null;
    if (!start) return;
    const distance = Math.hypot(end.x - start.x, end.y - start.y);
    const action = distance < 8 ? "tap" : "swipe";
    clearStaleNotices();
    void (action === "tap" ? runtime.simulator.tap(end) : runtime.simulator.swipe({ from: start, to: end, durationMs: 280 })).then(
      () => { controlErrorNotice = reduceControlErrorNotice(controlErrorNotice, { type: "action-succeeded" }); },
      (cause) => handleControlError(action, cause),
    );
  });
}

function syncLiveOrientation() {
  const shell = document.querySelector(".device-shell");
  const name = document.querySelector(".session-name");
  if (!shell || !name || !session.device) return;
  shell.classList.remove("portrait", "landscape");
  shell.classList.add(session.orientation);
  name.textContent = `${session.device.name} · ${session.orientation}`;
}

function clearStaleNotices() {
  if (!controlErrorNotice && !notice) return;
  controlErrorNotice = reduceControlErrorNotice(controlErrorNotice, { type: "action-started" });
  notice = null;
  render();
}

function handleControlError(action, cause) {
  if (!isReadyControlAction(action, session)) { handleUnhandled(cause); return; }
  controlErrorNotice = reduceControlErrorNotice(controlErrorNotice, { type: "failed", message: classifySimulatorError(cause).message });
  render();
}

function viewportPoint(event, viewport) {
  const bounds = viewport.getBoundingClientRect();
  return normalizedViewportPoint({ x: event.clientX, y: event.clientY }, bounds);
}

function handleUnhandled(cause) {
  const classified = classifySimulatorError(cause);
  transientState = { ...classified, crashed: wasReady };
  render();
}

runtime.simulator.onState((next) => {
  if (isIntentionalStartupCancellation(next, startupCancellationPending)) return;
  const unexpectedlyExited = wasReady && next.phase === "failed";
  session = next;
  if (next.device?.id) selectedId = next.device.id;
  if (next.phase === "ready") wasReady = true;
  if (unexpectedlyExited) transientState = { kind: "failed", message: next.lastError || "The native simulator session exited unexpectedly.", crashed: true };
  if (next.phase === "closed") {
    startupCancellationPending = false;
    wasReady = false;
  }
  render();
});

runtime.tab?.onNavigate?.(async ({ state }) => {
  if (typeof state?.deviceId === "string") {
    selectedId = state.deviceId;
    render();
  }
});

window.addEventListener("beforeunload", () => {
  stopViewportFrames();
  void runtime.simulator.close();
});

try {
  await refreshAll();
  const unsupported = environment.platforms.find((item) => item.status === "unsupported" && environment.platforms.every((candidate) => candidate.status === "unsupported"));
  if (unsupported) transientState = { kind: "unsupported", platform: unsupported.platform, message: unsupported.message };
  render();
} catch (cause) {
  handleUnhandled(cause);
}
