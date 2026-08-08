import assert from "node:assert/strict";
import test from "node:test";

import {
  REALTIME_CONNECTED,
  REALTIME_RECONNECTING,
  disconnectedSyncStatus,
  isTransportFailure,
  normalizePresenceCount,
  visiblePresenceCount,
} from "./collaboration-status.mjs";

test("presence is visible only while realtime collaboration is connected", () => {
  assert.equal(visiblePresenceCount(REALTIME_CONNECTED, 2), 2);
  assert.equal(visiblePresenceCount(REALTIME_RECONNECTING, 2), null);
});

test("only failures without an HTTP status are treated as transport loss", () => {
  assert.equal(isTransportFailure(new Error("socket closed")), true);
  assert.equal(isTransportFailure({ status: 503 }), false);
});

test("presence counts are bounded to a truthful human count", () => {
  assert.equal(normalizePresenceCount(3.8), 3);
  assert.equal(normalizePresenceCount(0), 1);
  assert.equal(normalizePresenceCount("not-a-number"), 1);
});

test("connection loss distinguishes reconnecting transport from offline editing", () => {
  assert.deepEqual(disconnectedSyncStatus(true), {
    sync: "reconnecting",
    message: "Reconnecting…",
  });
  assert.deepEqual(disconnectedSyncStatus(false), {
    sync: "offline",
    message: "Offline — changes stay on this device",
  });
});
