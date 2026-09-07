import assert from "node:assert/strict";

export const GRID_RECEIPT_PREDICATE = "eventMessage CONTAINS[c] \"LUNA_GRID_READY\" OR eventMessage CONTAINS[c] \"LUNA_GRID_ROOT\"";

export function receiptQueryArgs(deviceId, startTimestamp, endTimestamp = new Date().toISOString()) {
  assert.ok(typeof deviceId === "string" && deviceId.length > 0, "device ID is required");
  const startMillis = Date.parse(startTimestamp);
  const endMillis = Date.parse(endTimestamp);
  assert.ok(typeof startTimestamp === "string" && Number.isFinite(startMillis), "receipt start timestamp must be an ISO timestamp");
  assert.ok(typeof endTimestamp === "string" && Number.isFinite(endMillis), "receipt end timestamp must be an ISO timestamp");
  assert.ok(endMillis >= startMillis, "receipt end timestamp must not precede start timestamp");
  const startEpoch = Math.floor(startMillis / 1000);
  const endEpoch = Math.ceil(endMillis / 1000);
  return ["simctl", "spawn", deviceId, "log", "show", "--style", "compact", "--start", `@${startEpoch}`, "--end", `@${endEpoch}`, "--predicate", GRID_RECEIPT_PREDICATE];
}
