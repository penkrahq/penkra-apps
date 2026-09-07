import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MISSING_FIVE_CASE_IDS,
  MISSING_FIVE_DEVICE,
  MISSING_FIVE_LAUNCH_TIMEOUT_MS,
  MISSING_FIVE_MAX_PAIR_ATTEMPTS,
  selectMissingFiveCapturePlan,
} from "../scripts/luna-ios-grid-missing-five-capture.mjs";
import { GRID_CASE_IDS, GRID_DEVICES } from "../scripts/luna-ios-grid-production.mjs";

test("missing-five plan is exactly the five prior iPhone Large identities", () => {
  assert.deepEqual(selectMissingFiveCapturePlan(), MISSING_FIVE_CASE_IDS.map((caseID) => ({ caseID, deviceId: MISSING_FIVE_DEVICE.id, deviceKey: "iphone", contentSize: "large", scale: 3 })));
  assert.equal(new Set(MISSING_FIVE_CASE_IDS).size, 5);
  assert.deepEqual(MISSING_FIVE_CASE_IDS, [
    "grid-c100-180-r60-100-normal", "grid-c100-180-r60-100-reversed", "grid-c100-180-r60-100-only-2-2",
    "grid-c100-180-r100-60-normal", "grid-c100-180-r100-60-reversed",
  ]);
});

test("full matrix declarations remain unchanged and missing-five plan has no other device/state", () => {
  assert.equal(GRID_CASE_IDS.length, 13);
  assert.equal(GRID_DEVICES.length, 2);
  assert.ok(GRID_DEVICES.some(({ id, contentSizes }) => id === MISSING_FIVE_DEVICE.id && contentSizes.includes("large")));
  assert.ok(selectMissingFiveCapturePlan().every(({ deviceId, contentSize }) => deviceId === MISSING_FIVE_DEVICE.id && contentSize === "large"));
});

test("capture-only runner verifies the installed bundle and never installs or targets iPad", async () => {
  const source = await readFile(new URL("../scripts/luna-ios-grid-missing-five-capture.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\["simctl", "install"/u);
  assert.doesNotMatch(source, /8F053C2C-958D-4CC5-AB38-E838CFAC9442/u);
  assert.match(source, /get_app_container/u);
  assert.match(source, /installedSha256/u);
  assert.match(source, /expectedSha256/u);
  assert.match(source, /installAttempted: false/u);
});

test("capture-only runner uses one bounded launch and at most three screenshot-pair attempts", async () => {
  const source = await readFile(new URL("../scripts/luna-ios-grid-missing-five-capture.mjs", import.meta.url), "utf8");
  assert.equal(MISSING_FIVE_LAUNCH_TIMEOUT_MS, 120_000);
  assert.equal(MISSING_FIVE_MAX_PAIR_ATTEMPTS, 3);
  assert.match(source, /timeout: MISSING_FIVE_LAUNCH_TIMEOUT_MS/u);
  assert.match(source, /for \(let attemptNumber = 1; attemptNumber <= MISSING_FIVE_MAX_PAIR_ATTEMPTS/u);
  assert.equal((source.match(/\["simctl", "launch"/gu) ?? []).length, 1);
  assert.match(source, /signal: error\.signal \?\? null/u);
  assert.match(source, /killed: error\.killed \?\? false/u);
  assert.match(source, /timedOut:/u);
  assert.match(source, /stdout: error\.stdout \?\? "", stderr: error\.stderr \?\? ""/u);
});

test("capture-only runner preserves exact readiness, root crop, full-frame hashes, and comparator", async () => {
  const source = await readFile(new URL("../scripts/luna-ios-grid-missing-five-capture.mjs", import.meta.url), "utf8");
  assert.match(source, /readyReceipt\(caseID, nonce/u);
  assert.match(source, /rootGeometryReceipt\(caseID, nonce/u);
  assert.match(source, /stableScreenshotHashes\(hashes\)/u);
  assert.match(source, /cropRectFromRootReceipt\(readiness\.rootGeometry/u);
  assert.match(source, /validateFullFrameHashes\(\{ captured: capturedHashes, beforeCrop: fullBeforeCrop, afterCrop: fullAfterCrop \}\)/u);
  assert.match(source, /compareGridPixels\(expected, native, device\.scale\)/u);
});
