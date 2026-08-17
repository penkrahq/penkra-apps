export const REALTIME_CONNECTED = "connected";
export const REALTIME_RECONNECTING = "reconnecting";

export function realtimeStateAfterSignal(currentState, signal) {
  return signal === REALTIME_CONNECTED || signal === REALTIME_RECONNECTING
    ? signal
    : currentState;
}

export function normalizePresenceCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 1 ? Math.floor(count) : 1;
}

export function visiblePresenceCount(connectionState, presenceCount) {
  return connectionState === REALTIME_CONNECTED
    ? normalizePresenceCount(presenceCount)
    : null;
}

export function disconnectedSyncStatus(online) {
  return online
    ? { sync: "reconnecting", message: "Reconnecting…" }
    : { sync: "offline", message: "Offline — changes stay on this device" };
}

export function isTransportFailure(error) {
  return !Number.isFinite(Number(error?.status));
}
