import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { encodeRgbaPng } from "../scripts/luna-ios-grid-capture-utils-20260907.mjs";
import { createCommandAdapter, runTextReceiptMatrix } from "../scripts/luna-ios-text-receipt-20260907-runner.mjs";
import {
  TEXT_RECEIPT_CASE_IDS, TEXT_RECEIPT_DEVICES, createExclusiveAttemptDir, evidenceRelative,
  parseTextReadyReceipt, parseTextRootReceipt, prepareTextReceiptEvidence, requireFreshEvidenceRoot,
  restoreTextReceiptDevice, runTextReceiptCase, stableTextScreenshotHashes, textReceiptQueryArgs,
} from "../scripts/luna-ios-text-receipt-20260907.mjs";

const device = TEXT_RECEIPT_DEVICES[0];
const rootReceipt = "LUNA_TEXT_READY case=case-01 nonce=n+1 regularPostScript=Inter-Regular boldPostScript=Inter-Bold\nLUNA_TEXT_ROOT case=case-01 nonce=n+1 frame=0,0 340x180 window=0,0 340x180 screen=0,0 340x180 scale=1\n";

async function pngBytes(color = [18, 52, 86, 255]) {
  const kit = await getCanvasKit();
  const pixels = new Uint8Array(340 * 180 * 4);
  for (let index = 0; index < pixels.length; index += 4) pixels.set(color, index);
  return encodeRgbaPng({ width: 340, height: 180, pixels }, kit);
}

function fakeCommand({ logs = [rootReceipt], launchError = null, queryError = null, screenshotError = null, bytes } = {}) {
  let launches = 0; let queries = 0; let screenshots = 0;
  return {
    get counts() { return { launches, queries, screenshots }; },
    async launch() { launches += 1; if (launchError) throw launchError; return { pid: "123", stdout: "", stderr: "" }; },
    async query() { const value = logs[Math.min(queries++, logs.length - 1)] ?? ""; if (queryError) throw queryError; return { stdout: value, stderr: "", exitCode: 0 }; },
    async screenshot({ path }) { screenshots += 1; if (screenshotError) throw screenshotError; await writeFile(path, bytes); },
  };
}

async function tempRoot() { return mkdtemp(join(tmpdir(), "canvas-text-receipt-")); }

test("text receipt matrix is exact ten-case Cartesian plan and preparation retains generated sources", async () => {
  assert.equal(TEXT_RECEIPT_CASE_IDS.length, 10);
  assert.ok(!TEXT_RECEIPT_CASE_IDS.includes("case-05"));
  assert.ok(!TEXT_RECEIPT_CASE_IDS.includes("case-09"));
  assert.equal(TEXT_RECEIPT_DEVICES.flatMap(({ contentSizes }) => contentSizes).length, 3);
  const root = await tempRoot();
  try {
    const result = await prepareTextReceiptEvidence(join(root, "source"));
    const matrix = JSON.parse(await readFile(join(result.root, "case-matrix.json"), "utf8"));
    const plan = JSON.parse(await readFile(join(result.root, "capture-plan.json"), "utf8"));
    const provenance = JSON.parse(await readFile(join(result.root, "source-hashes.json"), "utf8"));
    assert.deepEqual(matrix.caseIds, TEXT_RECEIPT_CASE_IDS);
    assert.equal(matrix.expectedEntries, 30);
    assert.equal(plan.nativeRun, false);
    assert.ok(provenance.files.some(({ path }) => path === "SimulatorHost/App.swift"));
    assert.ok(provenance.files.some(({ path }) => path === "project.yml"));
    assert.equal(provenance.files.filter(({ path }) => path.startsWith("Fonts/")).length, 2);
    assert.match(await readFile(join(result.root, "swift", "SimulatorHost", "App.swift"), "utf8"), /CanvasFonts\.register\(\)/u);
    assert.match(await readFile(join(result.root, "swift", "SimulatorHost", "App.swift"), "utf8"), /LUNA_TEXT_ROOT/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("receipt args use fixed epoch window and exact case/nonce parsing", () => {
  const args = textReceiptQueryArgs(device.id, "2026-09-07T10:00:00.250Z", "2026-09-07T10:00:05.001Z");
  assert.deepEqual(args.slice(0, 10), ["spawn", device.id, "log", "show", "--style", "compact", "--start", "@1788775200", "--end", "@1788775206"]);
  assert.ok(parseTextReadyReceipt("case.+", "nonce[1]", "LUNA_TEXT_READY case=case.+ nonce=nonce[1] regularPostScript=Inter-Regular boldPostScript=Inter-Bold\n"));
  assert.equal(parseTextReadyReceipt("case.+", "wrong", "LUNA_TEXT_READY case=case.+ nonce=nonce[1] regularPostScript=Inter-Regular boldPostScript=Inter-Bold\n"), null);
  assert.ok(parseTextRootReceipt("case-01", "n+1", rootReceipt));
  assert.equal(parseTextRootReceipt("case-02", "n+1", rootReceipt), null);
});

test("fresh output and exclusive attempt parents are enforced", async () => {
  const root = await tempRoot();
  try {
    const evidence = await requireFreshEvidenceRoot(join(root, "new"));
    assert.equal(evidence, join(root, "new"));
    await writeFile(join(evidence, "marker"), "occupied");
    await assert.rejects(() => requireFreshEvidenceRoot(evidence), /fresh/u);
    const state = join(root, "state");
    const attempt = await createExclusiveAttemptDir(state, "case-01", "nonce");
    assert.equal(evidenceRelative(root, attempt), "state/attempts/case-01/nonce");
    await assert.rejects(() => createExclusiveAttemptDir(state, "case-01", "nonce"), /EEXIST/u);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("successful injected launch receipt pair and crop use the actual runner path", async () => {
  const root = await tempRoot(); const bytes = await pngBytes();
  try {
    const command = fakeCommand({ bytes });
    const result = await runTextReceiptCase({ evidenceRoot: root, device: { ...device, scale: 1 }, contentSize: "large", caseId: "case-01", nonce: "n+1", command, screenshot: command.screenshot, compare: async () => ({ status: "pass", comparedPixels: 1, mismatchedPixels: 0 }), now: () => new Date("2026-09-07T10:00:00.250Z"), sleep: async () => {}, settleMs: 0, receiptPollAttempts: 1, pairAttempts: 1 });
    assert.equal(result.status, "pass");
    assert.equal(command.counts.launches, 1);
    assert.equal(command.counts.screenshots, 2);
    assert.ok(result.attempts[0].paths.cropB.endsWith("crop-b.png"));
    assert.ok(result.attempts[0].fullHashes.stable);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("launch timeout, missing/late/wrong receipt and malformed root remain unmeasured with bounded one launch", async () => {
  const root = await tempRoot();
  try {
    const timeout = fakeCommand({ launchError: Object.assign(new Error("timed out"), { code: "ETIMEDOUT", killed: true }) });
    const timed = await runTextReceiptCase({ evidenceRoot: join(root, "timeout"), device, contentSize: "large", caseId: "case-01", command: timeout, screenshot: timeout.screenshot, sleep: async () => {}, settleMs: 0 });
    assert.equal(timed.phase, "launch"); assert.equal(timed.launch.failure.code, "ETIMEDOUT");
    const wrong = fakeCommand({ logs: ["LUNA_TEXT_READY case=case-01 nonce=wrong regularPostScript=Inter-Regular boldPostScript=Inter-Bold\n"] });
    const missing = await runTextReceiptCase({ evidenceRoot: join(root, "missing"), device, contentSize: "large", caseId: "case-01", command: wrong, screenshot: wrong.screenshot, sleep: async () => {}, receiptPollAttempts: 2, settleMs: 0 });
    assert.equal(missing.status, "unmeasured"); assert.equal(wrong.counts.launches, 1); assert.equal(wrong.counts.screenshots, 0);
    const late = fakeCommand({ logs: ["", rootReceipt], bytes: await pngBytes() });
    const acceptedLate = await runTextReceiptCase({ evidenceRoot: join(root, "late"), device: { ...device, scale: 1 }, contentSize: "large", caseId: "case-01", nonce: "n+1", command: late, screenshot: late.screenshot, compare: async () => ({ status: "pass", comparedPixels: 1, mismatchedPixels: 0 }), sleep: async () => {}, receiptPollAttempts: 2, pairAttempts: 1, settleMs: 0, now: () => new Date("2026-09-07T10:00:00.250Z") });
    assert.equal(acceptedLate.status, "pass");
    const malformed = fakeCommand({ logs: [rootReceipt.replace("frame=0,0 340x180", "frame=NaN,0 340x180")], bytes: await pngBytes() });
    const badRoot = await runTextReceiptCase({ evidenceRoot: join(root, "malformed"), device, contentSize: "large", caseId: "case-01", nonce: "n+1", command: malformed, screenshot: malformed.screenshot, sleep: async () => {}, receiptPollAttempts: 1, settleMs: 0 });
    assert.equal(badRoot.status, "unmeasured");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("unstable frames and postlaunch errors retain phase metadata and no second launch", async () => {
  const root = await tempRoot(); const first = await pngBytes([18, 52, 86, 255]); const second = await pngBytes([19, 52, 86, 255]);
  try {
    let screenshotCount = 0;
    const unstable = fakeCommand({ bytes: first });
    unstable.screenshot = async ({ path }) => { await writeFile(path, screenshotCount++ % 2 ? second : first); };
    const unstableResult = await runTextReceiptCase({ evidenceRoot: join(root, "unstable"), device: { ...device, scale: 1 }, contentSize: "large", caseId: "case-01", nonce: "n+1", command: unstable, screenshot: unstable.screenshot, sleep: async () => {}, receiptPollAttempts: 1, pairAttempts: 3, settleMs: 0 });
    assert.equal(unstableResult.status, "unmeasured"); assert.equal(unstable.counts.launches, 1);
    const failure = Object.assign(new Error("postlaunch write failed"), { code: "EIO" });
    const post = fakeCommand({ bytes: first, screenshotError: failure });
    const postResult = await runTextReceiptCase({ evidenceRoot: join(root, "post"), device: { ...device, scale: 1 }, contentSize: "large", caseId: "case-01", nonce: "n+1", command: post, screenshot: post.screenshot, sleep: async () => {}, receiptPollAttempts: 1, pairAttempts: 2, settleMs: 0 });
    assert.equal(postResult.phase, "postlaunch"); assert.equal(postResult.attempts[0].failure.phase, "postlaunch"); assert.equal(postResult.attempts[0].failure.code, "EIO");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("stable screenshot hash contract rejects missing blank nonhash and differing frames", () => {
  const valid = "a".repeat(64);
  assert.equal(stableTextScreenshotHashes([valid, valid]), true);
  for (const value of [[undefined, undefined], ["", ""], ["not-a-hash", valid], [valid, "b".repeat(64)], [valid]]) assert.equal(stableTextScreenshotHashes(value), false);
});

test("restoration records observed setting and shutdown only for runner-booted device", async () => {
  const operations = []; const command = { async setContentSize(value) { operations.push(["size", value.contentSize]); }, async shutdown() { operations.push(["shutdown"]); } };
  await restoreTextReceiptDevice({ device, observedContentSize: "accessibility-extra-extra-large", bootedByRunner: true, command });
  await restoreTextReceiptDevice({ device, observedContentSize: "large", bootedByRunner: false, command });
  assert.deepEqual(operations, [["size", "accessibility-extra-extra-large"], ["shutdown"], ["size", "large"]]);
});

test("command adapter has one simctl boundary and uses non-attached launch", async () => {
  const calls = [];
  const execFile = async (file, args, options) => { calls.push({ file, args, options }); return { stdout: "large\n", stderr: "" }; };
  const command = createCommandAdapter({ execFile });
  await command.query({ args: ["spawn", device.id, "log", "show"], timeoutMs: 4321 });
  await command.launch({ device, args: ["--canvas-case", "case-01", "--canvas-nonce", "nonce"], timeoutMs: 9876 });
  assert.deepEqual(calls[0].args, ["simctl", "spawn", device.id, "log", "show"]);
  assert.deepEqual(calls[1].args, ["simctl", "launch", "--terminate-running-process", device.id, "com.penkra.canvas.qa.textreceipt", "--canvas-case", "case-01", "--canvas-nonce", "nonce"]);
  assert.equal(calls[1].args.includes("--console"), false);
  assert.equal(calls[1].options.timeout, 9876);
});

test("font receipt mismatch is unmeasured before screenshot", async () => {
  const root = await tempRoot(); const bytes = await pngBytes();
  const command = fakeCommand({ bytes, logs: [rootReceipt.replace("Inter-Regular", "Fallback-Regular")] });
  try {
    const result = await runTextReceiptCase({ evidenceRoot: root, device: { ...device, scale: 1 }, contentSize: "large", caseId: "case-01", nonce: "n+1", command, screenshot: command.screenshot, compare: async () => ({ status: "pass", comparedPixels: 1, mismatchedPixels: 0 }), sleep: async () => {}, receiptPollAttempts: 1, pairAttempts: 1, settleMs: 0 });
    assert.equal(result.status, "unmeasured");
    assert.equal(result.phase, "font-receipt");
    assert.equal(command.counts.screenshots, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

function matrixFakeCommand(calls) {
  const sizes = new Map([[TEXT_RECEIPT_DEVICES[0].id, "large"], [TEXT_RECEIPT_DEVICES[1].id, "large"]]);
  const state = new Map([[TEXT_RECEIPT_DEVICES[0].id, "Shutdown"], [TEXT_RECEIPT_DEVICES[1].id, "Booted"]]);
  return {
    async listDevices() { calls.push(["list"]); return { devices: { iOS: TEXT_RECEIPT_DEVICES.map((item) => ({ udid: item.id, state: state.get(item.id) })) } }; },
    async boot({ device: item }) { calls.push(["boot", item.id]); state.set(item.id, "Booted"); },
    async bootstatus({ device: item }) { calls.push(["bootstatus", item.id]); },
    async readContentSize({ device: item }) { calls.push(["read", item.id]); return sizes.get(item.id); },
    async setContentSize({ device: item, contentSize }) { calls.push(["set", item.id, contentSize]); sizes.set(item.id, contentSize); },
    async shutdown({ device: item }) { calls.push(["shutdown", item.id]); state.set(item.id, "Shutdown"); },
  };
}

test("matrix lifecycle snapshots, sets/read-backs, restores and refuses occupied roots", async () => {
  const root = await tempRoot(); const occupied = join(root, "occupied"); await (await import("node:fs/promises")).mkdir(occupied); await writeFile(join(occupied, "existing"), "keep");
  const calls = []; const command = matrixFakeCommand(calls);
  await assert.rejects(() => runTextReceiptMatrix({ evidenceRoot: occupied, referencesRoot: root, command }), /fresh/u);
  assert.equal(calls.length, 0);
  const results = await runTextReceiptMatrix({ evidenceRoot: join(root, "fresh"), referencesRoot: root, command, sleep: async () => {}, runCase: async ({ device: item, contentSize, caseId }) => ({ device: item.key, contentSize, caseId, status: "pass", measurementStatus: "measured", comparison: { status: "pass", comparedPixels: 1 } }) });
  assert.equal(results.length, 30);
  assert.ok(calls.some(([name, id]) => name === "boot" && id === TEXT_RECEIPT_DEVICES[0].id));
  assert.equal(calls.filter(([name, id]) => name === "boot" && id === TEXT_RECEIPT_DEVICES[1].id).length, 0);
  assert.ok(calls.some(([name, id, size]) => name === "set" && id === TEXT_RECEIPT_DEVICES[0].id && size === "accessibility-extra-extra-large"));
  assert.equal(calls.filter(([name]) => name === "shutdown").length, 1);
  assert.deepEqual([...calls].filter(([name]) => name === "set").slice(-2).map(([, , size]) => size), ["large", "large"]);
  await rm(root, { recursive: true, force: true });
});

test("matrix finally restores devices when a case runner throws", async () => {
  const root = await tempRoot(); const calls = []; const command = matrixFakeCommand(calls);
  try {
    await assert.rejects(() => runTextReceiptMatrix({ evidenceRoot: join(root, "failure"), referencesRoot: root, command, runCase: async () => { throw new Error("injected case failure"); }, sleep: async () => {} }), /injected case failure/u);
    assert.equal(calls.filter(([name]) => name === "shutdown").length, 1);
    assert.deepEqual([...calls].filter(([name]) => name === "set").slice(-2).map(([, , size]) => size), ["large", "large"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
