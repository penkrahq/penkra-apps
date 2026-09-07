import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { receiptQueryArgs } from "../scripts/luna-ios-grid-receipt-window.mjs";
import { SINGLE_CASE_ID, SINGLE_DEVICE, SINGLE_LAUNCH_TIMEOUT_MS, SINGLE_MAX_PAIR_ATTEMPTS, selectSingleCapturePlan } from "../scripts/luna-ios-grid-missing-one-capture.mjs";
import { GRID_CASE_IDS, readyReceipt, rootGeometryReceipt } from "../scripts/luna-ios-grid-production.mjs";

const start = "2026-09-07T12:00:00.000Z";
const end = "2026-09-07T12:00:20.000Z";
const nonce = "nonce-[normal].$";
const ready = `LUNA_GRID_READY case=${SINGLE_CASE_ID} nonce=${nonce}\nLUNA_GRID_ROOT case=${SINGLE_CASE_ID} nonce=${nonce} frame=21.000,42.000 340.000x400.000 window=0.000,0.000 402.000x874.000 screen=0.000,0.000 402.000x874.000 scale=3.000\n`;

test("fixed receipt query uses documented epoch arguments and retains the fixed ISO bounds as caller metadata", () => {
  const args = receiptQueryArgs(SINGLE_DEVICE.id, start, end);
  assert.equal(args.includes("--last"), false);
  assert.deepEqual(args, ["simctl", "spawn", SINGLE_DEVICE.id, "log", "show", "--style", "compact", "--start", "@1788782400", "--end", "@1788782420", "--predicate", "eventMessage CONTAINS[c] \"LUNA_GRID_READY\" OR eventMessage CONTAINS[c] \"LUNA_GRID_ROOT\""]);
});

test("epoch bounds floor start and ceil end so subsecond receipt boundaries remain eligible", () => {
  const args = receiptQueryArgs(SINGLE_DEVICE.id, "2026-09-07T12:00:00.999Z", "2026-09-07T12:00:20.001Z");
  assert.equal(args[args.indexOf("--start") + 1], "@1788782400");
  assert.equal(args[args.indexOf("--end") + 1], "@1788782421");
});

test("shared production receipt parsers keep exact case and nonce filtering", () => {
  assert.equal(readyReceipt(SINGLE_CASE_ID, nonce, ready), true);
  assert.ok(rootGeometryReceipt(SINGLE_CASE_ID, nonce, ready));
  assert.equal(readyReceipt("grid-c100-180-r60-100-reversed", nonce, ready), false);
  assert.equal(readyReceipt(SINGLE_CASE_ID, "wrong", ready), false);
  assert.equal(rootGeometryReceipt(SINGLE_CASE_ID, "wrong", ready), null);
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
