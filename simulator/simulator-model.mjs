export const CLOSED_SESSION = Object.freeze({
  version: 0,
  open: false,
  phase: "closed",
  device: null,
  target: null,
  orientation: "portrait",
  lastError: null,
});

export function platformName(platform, formFactor = "phone") {
  if (platform === "android") return "Android";
  return formFactor === "tablet" ? "iPadOS" : "iOS";
}

export function deviceGlyph(device) {
  if (device?.platform === "android") return "◆";
  return device?.formFactor === "tablet" ? "▭" : "▯";
}

export function targetIdentifier(target) {
  if (!target) return null;
  return target.platform === "ios"
    ? { label: "UDID", value: target.udid }
    : { label: "ADB serial", value: target.serial };
}

export function classifySimulatorError(cause) {
  const raw = extractRawSimulatorErrorMessage(cause);
  const message = unwrapTransportWrapperMessage(raw);
  const normalized = message.toLowerCase();
  if (/(busy|lease|another tab|already open|already running|owned by)/.test(normalized)) return { kind: "busy", message };
  if (/(unsupported|not available on|requires mac|platform)/.test(normalized)) return { kind: "unsupported", message };
  if (/(runtime|system image|setup|not installed|missing)/.test(normalized)) return { kind: "setup", message };
  return { kind: "failed", message };
}

function extractRawSimulatorErrorMessage(cause) {
  let next = cause;
  let fallback = "Unknown simulator error";
  let hops = 0;
  while (next && typeof next === "object" && hops < 6) {
    if (typeof next.message === "string" && next.message.trim()) {
      fallback = next.message;
    }
    next = next.cause;
    hops += 1;
  }
  if (typeof cause === "string") return cause;
  if (typeof cause === "number" || typeof cause === "boolean") return String(cause);
  return fallback;
}

function unwrapTransportWrapperMessage(message) {
  const direct = typeof message === "string" ? message : String(message ?? "Unknown simulator error");
  const trimmed = direct.trim();
  const transportWrapped = trimmed.match(/^(?:error invoking|failed to invoke)\s+['"]?[^'":]+['"]?\s*:\s*(?:error:\s*)?(.*)$/i);
  if (transportWrapped && transportWrapped[1]) return transportWrapped[1].trim();
  const electronWrapped = trimmed.match(/^error invoking.*?:\s*(.*)$/i);
  if (electronWrapped && electronWrapped[1]) return electronWrapped[1].trim();
  const cleanErrorPrefix = trimmed.match(/^error:\s*(.*)$/i);
  return cleanErrorPrefix ? cleanErrorPrefix[1].trim() : trimmed;
}

export function createSingleFlight(task) {
  let pending = null;
  return {
    get pending() {
      return pending !== null;
    },
    run(...args) {
      pending ??= Promise.resolve().then(() => task(...args)).finally(() => {
        pending = null;
      });
      return pending;
    },
  };
}

export function resolveNewDeviceState({
  platforms,
  runtimes,
  deviceTypes,
  preferredPlatform = null,
  preferredRuntimeId = null,
}) {
  const supported = platforms.filter((platform) => platform.status !== "unsupported");
  const candidates = preferredPlatform
    ? supported.filter((platform) => platform.platform === preferredPlatform)
    : supported;
  const inspect = (platform) => {
    const platformRuntimes = runtimes.filter((runtime) => runtime.platform === platform.platform);
    const usableRuntime = platformRuntimes.find(
      (runtime) =>
        runtime.status === "available" &&
        deviceTypes.some((type) => type.runtimeId === runtime.id),
    );
    if (usableRuntime) {
      return { kind: "form", platform: platform.platform, runtimeId: usableRuntime.id };
    }
    const installableRuntime = newestInstallableRuntime(
      platformRuntimes,
      platform.platform,
      preferredRuntimeId,
    );
    if (installableRuntime) {
      return {
        kind: "setup",
        platform: platform.platform,
        runtime: installableRuntime,
        message: platform.message || installableRuntime.message,
      };
    }
    return {
      kind: "unavailable",
      platform: platform.platform,
      message:
        platform.message ||
        platformRuntimes.find((runtime) => runtime.message)?.message ||
        `No usable ${platformName(platform.platform)} simulator runtime is available.`,
    };
  };

  const outcomes = candidates.map(inspect);
  if (preferredPlatform) {
    return outcomes[0] ?? {
      kind: "unavailable",
      platform: preferredPlatform,
      message:
        platforms.find((platform) => platform.platform === preferredPlatform)?.message ||
        `${platformName(preferredPlatform)} simulator is unavailable on this computer.`,
    };
  }
  return (
    outcomes.find((outcome) => outcome.kind === "form") ??
    outcomes.find((outcome) => outcome.kind === "setup") ??
    outcomes[0] ?? {
      kind: "unavailable",
      platform: platforms[0]?.platform || "ios",
      message:
        platforms[0]?.message || "No supported simulator platform is available on this computer.",
    }
  );
}

export function newestInstallableRuntime(runtimes, platform = null, preferredRuntimeId = null) {
  const candidates = runtimes.filter(
    (runtime) =>
      (!platform || runtime.platform === platform) &&
      runtime.status === "missing" &&
      runtime.installable === true,
  );
  const preferred = preferredRuntimeId
    ? candidates.find((runtime) => runtime.id === preferredRuntimeId)
    : null;
  if (preferred) return preferred;
  return [...candidates].sort(compareRuntimeVersionDescending)[0] ?? null;
}

function compareRuntimeVersionDescending(left, right) {
  const leftParts = runtimeVersionParts(left);
  const rightParts = runtimeVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (rightParts[index] ?? 0) - (leftParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return String(right.name || right.id).localeCompare(String(left.name || left.id));
}

function runtimeVersionParts(runtime) {
  return (String(runtime.version || runtime.name || runtime.id).match(/\d+/g) || []).map(Number);
}

export function simulatorSetupRequest(runtime) {
  return {
    platform: runtime.platform,
    runtimeId: runtime.id,
  };
}

export function isIntentionalStartupCancellation(state, cancellationPending) {
  if (!cancellationPending || state?.phase !== "failed") return false;
  const message = String(state.lastError || state.device?.lastError || "").toLowerCase();
  return /(cancelled|canceled|session closed|startup was cancelled)/.test(message);
}

export function runtimeSetupCopy(runtime) {
  const name = runtime?.name || (runtime?.platform === "android" ? "Android 16" : "Required runtime");
  if (runtime?.platform === "android") {
    return {
      title: `Install ${name.includes("image") ? name : `${name} image`}`,
      description: "Download the Google APIs system image before creating this Android device.",
      impact: "Download and disk usage are shown in Penkra's trusted setup prompt before installation.",
    };
  }
  return {
    title: `Install ${name}`,
    description: "Install the required Apple simulator runtime before creating this device.",
    impact: "Penkra will show the trusted prerequisite prompt before installation.",
  };
}

export function normalizedViewportPoint(input, bounds) {
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return { x: 0, y: 0 };
  return {
    x: Math.min(1, Math.max(0, (input.x - bounds.left) / bounds.width)),
    y: Math.min(1, Math.max(0, (input.y - bounds.top) / bounds.height)),
  };
}

export function lifecycleCopy(phase, deviceName = "device") {
  if (phase === "preparing") return { title: "Preparing the simulator", detail: `Creating the saved runtime for ${deviceName}.`, progress: 35 };
  if (phase === "booting") return { title: "Booting the simulator", detail: "Starting the full operating system. This can take a moment.", progress: 68 };
  if (phase === "stopping") return { title: "Stopping the simulator", detail: "Releasing this tab's live-device lease.", progress: 84 };
  return null;
}

export function isDeviceLeased(device, session) {
  return Boolean(session?.open && session.device?.id === device?.id && session.phase !== "closed");
}

export function canDestructivelyChange(device, session) {
  return !isDeviceLeased(device, session) && !["preparing", "booting", "stopping", "ready"].includes(device?.state);
}

export function chooseSelectedDevice(devices, selectedId) {
  return devices.find((device) => device.id === selectedId) ?? devices[0] ?? null;
}

export function splitDevices(devices) {
  return {
    apple: devices.filter((device) => device.platform === "ios"),
    android: devices.filter((device) => device.platform === "android"),
  };
}

export function phaseTone(phase) {
  if (phase === "ready") return "success";
  if (["preparing", "booting", "stopping"].includes(phase)) return "active";
  if (phase === "failed") return "danger";
  return "neutral";
}

const INTERACTIVE_CONTROL_ACTIONS = new Set([
  "rotate", "capture", "copy-target", "home", "back", "app-switcher", "power",
  "volume-up", "volume-down", "tap", "swipe", "type",
]);

export function isReadyControlAction(action, session) {
  return INTERACTIVE_CONTROL_ACTIONS.has(action) && session?.open === true && session.phase === "ready";
}

export function reduceControlErrorNotice(current, event) {
  if (event.type === "failed") return event.message;
  if (event.type === "action-started" || event.type === "action-succeeded") return null;
  return current;
}
