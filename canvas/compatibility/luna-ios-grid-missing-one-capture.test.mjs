import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { exactReceiptInWindow, receiptQueryArgs } from "../scripts/luna-ios-grid-receipt-window.mjs";
import { SINGLE_CASE_ID, SINGLE_DEVICE, SINGLE_LAUNCH_TIMEOUT_MS, SINGLE_MAX_PAIR_ATTEMPTS, selectSingleCapturePlan } from "../scripts/luna-ios-grid-missing-one-capture.mjs";
import { GRID_CASE_IDS } from "../scripts/luna-ios-grid-production.mjs";

const start = "2026-09-07T12:00:00.000Z";
const end = "2026-09-07T12:00:20.000Z";
const nonce = "nonce-[normal].$";
const ready = `2026-09-07T12:00:06.000Z LUNA_GRID_READY case=${SINGLE_CASE_ID} nonce=${nonce}\nLUNA_GRID_ROOT case=${SINGLE_CASE_ID} nonce=${nonce} frame=21.000,42.000 340.000x400.000 window=0.000,0.000 402.000x874.000 screen=0.000,0.000 402.000x874.000 scale=3.000\n`;

test("fixed receipt query keeps a valid event older than five seconds eligible", () => {
  const args = receiptQueryArgs(SINGLE_DEVICE.id, start, end);
  assert.equal(args.includes("--last"), false);
  assert.equal(args[args.indexOf("--start") + 1], start);
  assert.equal(args[args.indexOf("--end") + 1], end);
  assert.equal(exactReceiptInWindow({ logText: ready, caseID: SINGLE_CASE_ID, nonce, eventTimestamp: "2026-09-07T12:00:06.000Z", startTimestamp: start, endTimestamp: end }).caseID, SINGLE_CASE_ID);
});

test("fixed receipt window excludes wrong case, wrong nonce, and events outside the window", () => {
  assert.equal(exactReceiptInWindow({ logText: ready, caseID: "grid-c100-180-r60-100-reversed", nonce, eventTimestamp: "2026-09-07T12:00:06.000Z", startTimestamp: start, endTimestamp: end }), null);
  assert.equal(exactReceiptInWindow({ logText: ready, caseID: SINGLE_CASE_ID, nonce: "wrong", eventTimestamp: "2026-09-07T12:00:06.000Z", startTimestamp: start, endTimestamp: end }), null);
  assert.throws(() => exactReceiptInWindow({ logText: ready, caseID: SINGLE_CASE_ID, nonce, eventTimestamp: "2026-09-07T11:59:59.999Z", startTimestamp: start, endTimestamp: end }), /outside/u);
  assert.throws(() => exactReceiptInWindow({ logText: ready, caseID: SINGLE_CASE_ID, nonce, eventTimestamp: "2026-09-07T12:00:20.001Z", startTimestamp: start, endTimestamp: end }), /outside/u);
});

test("single-case filter is exactly the still-unmeasured iPhone Large identity", () => {
  assert.deepEqual(selectSingleCapturePlan(), [{ caseID: SINGLE_CASE_ID, deviceId: SINGLE_DEVICE.id, contentSize: "large", scale: 3 }]);
  assert.equal(SINGLE_CASE_ID, "grid-c100-180-r60-100-normal");
  assert.equal(GRID_CASE_IDS.includes(SINGLE_CASE_ID), true);
  assert.equal(SINGLE_LAUNCH_TIMEOUT_MS, 120_000);
  assert.equal(SINGLE_MAX_PAIR_ATTEMPTS, 3);
});

test("single-case runner has no build/install/iPad path and reuses one launch start across pair attempts", async () => {
  const source = await readFile(new URL("../scripts/luna-ios-grid-missing-one-capture.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /xcodebuild|swiftc|\["simctl", "install"/u);
  assert.doesNotMatch(source, /8F053C2C-958D-4CC5-AB38-E838CFAC9442/u);
  assert.equal((source.match(/\["simctl", "launch"/gu) ?? []).length, 1);
  assert.match(source, /const launchStartTimestamp = new Date\(\)\.toISOString\(\);[\s\S]{0,500}command\("xcrun", launchArgs/u);
  assert.match(source, /capturePair\(expected\[SINGLE_CASE_ID\], referencePath, stateDir, nonce, launchStartTimestamp, attemptNumber\)/u);
  assert.match(source, /receiptQueryArgs\(SINGLE_DEVICE\.id, launchStartTimestamp, endTimestamp\)/u);
  assert.doesNotMatch(source, /--last/u);
  assert.match(source, /get_app_container/u);
  assert.match(source, /installedSha256/u);
});
