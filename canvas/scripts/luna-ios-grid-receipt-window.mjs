import assert from "node:assert/strict";

import { readyReceipt, rootGeometryReceipt } from "./luna-ios-grid-production.mjs";

export const GRID_RECEIPT_PREDICATE = "eventMessage CONTAINS[c] \"LUNA_GRID_READY\" OR eventMessage CONTAINS[c] \"LUNA_GRID_ROOT\"";

export function receiptQueryArgs(deviceId, startTimestamp, endTimestamp = new Date().toISOString()) {
  assert.ok(typeof deviceId === "string" && deviceId.length > 0, "device ID is required");
  assert.ok(typeof startTimestamp === "string" && !Number.isNaN(Date.parse(startTimestamp)), "receipt start timestamp must be an ISO timestamp");
  assert.ok(typeof endTimestamp === "string" && !Number.isNaN(Date.parse(endTimestamp)), "receipt end timestamp must be an ISO timestamp");
  assert.ok(Date.parse(endTimestamp) >= Date.parse(startTimestamp), "receipt end timestamp must not precede start timestamp");
  return ["simctl", "spawn", deviceId, "log", "show", "--style", "compact", "--start", startTimestamp, "--end", endTimestamp, "--predicate", GRID_RECEIPT_PREDICATE];
}

export function exactReceiptInWindow({ logText, caseID, nonce, eventTimestamp, startTimestamp, endTimestamp }) {
  assert.ok(typeof logText === "string", "receipt log text is required");
  assert.ok(typeof eventTimestamp === "string" && !Number.isNaN(Date.parse(eventTimestamp)), "receipt event timestamp must be an ISO timestamp");
  const event = Date.parse(eventTimestamp);
  assert.ok(event >= Date.parse(startTimestamp) && event <= Date.parse(endTimestamp), "receipt event is outside the fixed query window");
  const rootGeometry = rootGeometryReceipt(caseID, nonce, logText);
  return readyReceipt(caseID, nonce, logText) && rootGeometry ? { caseID, nonce, rootGeometry } : null;
}
