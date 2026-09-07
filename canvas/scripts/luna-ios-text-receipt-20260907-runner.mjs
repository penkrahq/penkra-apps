import assert from "node:assert/strict";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  TEXT_RECEIPT_BUNDLE_ID, TEXT_RECEIPT_CASE_IDS, TEXT_RECEIPT_DEVICES,
  TEXT_RECEIPT_ROOT, boundedSleep, prepareTextReceiptEvidence, requireFreshEvidenceRoot, runTextReceiptCase,
} from "./luna-ios-text-receipt-20260907.mjs";
import { measureCapture } from "./luna-ios-text-verify.mjs";

const defaultExecFile = promisify(nodeExecFile);

export function createCommandAdapter({ execFile = defaultExecFile } = {}) {
  async function simctl(args, options = {}) {
    return execFile("xcrun", ["simctl", ...args], { timeout: options.timeoutMs ?? 30000, maxBuffer: 16 * 1024 * 1024 });
  }
  return {
    async listDevices() { return JSON.parse((await simctl(["list", "devices", "-j"])).stdout); },
    async readContentSize({ device }) { return (await simctl(["ui", device.id, "content_size"], { timeoutMs: 30000 })).stdout.trim(); },
    async boot({ device }) { return simctl(["boot", device.id], { timeoutMs: 30000 }); },
    async bootstatus({ device }) { return simctl(["bootstatus", device.id, "-b"], { timeoutMs: 60000 }); },
    async setContentSize({ device, contentSize }) { return simctl(["ui", device.id, "content_size", contentSize], { timeoutMs: 30000 }); },
    async shutdown({ device }) { return simctl(["shutdown", device.id], { timeoutMs: 30000 }); },
    async launch({ device, args, timeoutMs }) {
      return simctl(["launch", "--terminate-running-process", device.id, TEXT_RECEIPT_BUNDLE_ID, ...args], { timeoutMs });
    },
    async query({ args, timeoutMs }) { return simctl(args, { timeoutMs }); },
    async screenshot({ device, path }) { return simctl(["io", device.id, "screenshot", "--type=png", path], { timeoutMs: 30000 }); },
  };
}

export async function runTextReceiptMatrix({ evidenceRoot, referencesRoot, compare = measureCapture, command = null, runCase = runTextReceiptCase, sleep = boundedSleep } = {}) {
  assert.ok(evidenceRoot, "native evidence root is required");
  if (!command) assert.equal(process.env.CANVAS_TEXT_RECEIPT_ALLOW_NATIVE, "1", "native run requires explicit CANVAS_TEXT_RECEIPT_ALLOW_NATIVE=1");
  const root = await requireFreshEvidenceRoot(evidenceRoot);
  const actualCommand = command ?? createCommandAdapter();
  const listed = await actualCommand.listDevices();
  const snapshots = new Map();
  const results = [];
  try {
    for (const declared of TEXT_RECEIPT_DEVICES) {
      const record = Object.values(listed.devices ?? {}).flat().find(({ udid }) => udid === declared.id);
      assert.ok(record, `assigned device ${declared.id} is not present`);
      const device = { ...declared, state: record.state ?? "unknown" };
      const bootedByRunner = device.state === "Shutdown";
      snapshots.set(device.key, { device, observedContentSize: null, bootedByRunner });
      if (bootedByRunner) await actualCommand.boot({ device });
      await actualCommand.bootstatus({ device });
      const observedContentSize = await actualCommand.readContentSize({ device });
      assert.ok(observedContentSize, `content size was not observed for ${device.id}`);
      snapshots.set(device.key, { device, observedContentSize, bootedByRunner });
    }
    for (const { device } of snapshots.values()) for (const contentSize of device.contentSizes) {
      await actualCommand.setContentSize({ device, contentSize });
      assert.equal(await actualCommand.readContentSize({ device }), contentSize, `content size did not read back as ${contentSize} for ${device.id}`);
      for (const caseId of TEXT_RECEIPT_CASE_IDS) {
        const referencePath = join(resolve(referencesRoot), `${device.key}-${contentSize}`, `${caseId}.png`);
        results.push(await runCase({ evidenceRoot: root, device, contentSize, caseId, referencePath, command: actualCommand, screenshot: actualCommand.screenshot, compare, sleep }));
      }
    }
  } finally {
    const restoration = {};
    for (const { device, observedContentSize, bootedByRunner } of snapshots.values()) {
      const operations = [];
      if (observedContentSize) {
        try { await actualCommand.setContentSize({ device, contentSize: observedContentSize }); operations.push({ operation: "content_size", status: "restored", contentSize: observedContentSize }); }
        catch (error) { operations.push({ operation: "content_size", status: "failed", error: { name: error.name, message: error.message, code: error.code ?? null } }); }
      } else operations.push({ operation: "content_size", status: "unobserved" });
      if (bootedByRunner) {
        try { await actualCommand.shutdown({ device }); operations.push({ operation: "shutdown", status: "restored" }); }
        catch (error) { operations.push({ operation: "shutdown", status: "failed", error: { name: error.name, message: error.message, code: error.code ?? null } }); }
      }
      restoration[device.key] = { observedContentSize, bootedByRunner, operations };
    }
    await writeFile(join(root, "restoration.json"), `${JSON.stringify({ snapshots: [...snapshots.values()], restoration }, null, 2)}\n`);
  }
  await writeFile(join(root, "results.json"), `${JSON.stringify({ expectedEntries: 30, results }, null, 2)}\n`);
  return results;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const sourceDestination = resolve(new URL(`../research/${TEXT_RECEIPT_ROOT}`, import.meta.url).pathname);
  if (process.argv.includes("--prepare")) {
    const prepared = await prepareTextReceiptEvidence(process.env.CANVAS_TEXT_RECEIPT_SOURCE_ROOT ?? sourceDestination);
    console.log(JSON.stringify({ root: prepared.root, sourceSha256: prepared.sourceHash.sourceSha256, cases: TEXT_RECEIPT_CASE_IDS.length, nativeRun: false }, null, 2));
  } else if (process.argv.includes("--run")) {
    const references = process.env.CANVAS_TEXT_RECEIPT_REFERENCES_ROOT;
    assert.ok(references, "CANVAS_TEXT_RECEIPT_REFERENCES_ROOT is required for native run");
    const destination = process.env.CANVAS_TEXT_RECEIPT_EVIDENCE_ROOT ?? join(sourceDestination, "native");
    const results = await runTextReceiptMatrix({ evidenceRoot: destination, referencesRoot: references, sleep: boundedSleep });
    console.log(JSON.stringify({ expectedEntries: 30, actualEntries: results.length }, null, 2));
  } else {
    console.error("Pass --prepare for source-only preparation or --run for an explicitly authorized native run.");
    process.exitCode = 2;
  }
}
