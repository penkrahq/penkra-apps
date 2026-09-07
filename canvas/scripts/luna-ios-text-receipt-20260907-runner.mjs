import assert from "node:assert/strict";
import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import {
  TEXT_RECEIPT_BUNDLE_ID, TEXT_RECEIPT_CASE_IDS, TEXT_RECEIPT_DEVICES,
  TEXT_RECEIPT_ROOT, prepareTextReceiptEvidence, runTextReceiptCase,
} from "./luna-ios-text-receipt-20260907.mjs";
import { measureCapture } from "./luna-ios-text-verify.mjs";

const execFile = promisify(nodeExecFile);

async function simctl(args, options = {}) {
  return execFile("xcrun", ["simctl", ...args], { timeout: options.timeoutMs ?? 30000, maxBuffer: 16 * 1024 * 1024 });
}

function commandAdapter() {
  return {
    async launch({ device, args, timeoutMs }) {
      return simctl(["launch", "--console", device.id, TEXT_RECEIPT_BUNDLE_ID, ...args], { timeoutMs });
    },
    async query({ args, timeoutMs }) { return simctl(args, { timeoutMs }); },
    async screenshot({ device, path }) { return simctl(["io", device.id, "screenshot", path], { timeoutMs: 30000 }); },
    async setContentSize({ device, contentSize }) { return simctl(["spawn", device.id, "defaults", "write", "NSGlobalDomain", "AppleContentSizeCategory", contentSize], { timeoutMs: 30000 }); },
    async shutdown({ device }) { return simctl(["shutdown", device.id], { timeoutMs: 30000 }); },
  };
}

export async function runTextReceiptMatrix({ evidenceRoot, referencesRoot, compare = measureCapture } = {}) {
  assert.ok(process.env.CANVAS_TEXT_RECEIPT_ALLOW_NATIVE === "1", "native run requires explicit CANVAS_TEXT_RECEIPT_ALLOW_NATIVE=1");
  const root = resolve(evidenceRoot);
  const command = commandAdapter();
  const results = [];
  for (const device of TEXT_RECEIPT_DEVICES) for (const contentSize of device.contentSizes) {
    for (const caseId of TEXT_RECEIPT_CASE_IDS) {
      const referencePath = join(resolve(referencesRoot), `${device.key}-${contentSize}`, `${caseId}.png`);
      results.push(await runTextReceiptCase({ evidenceRoot: root, device, contentSize, caseId, referencePath, command, screenshot: command.screenshot, compare }));
    }
  }
  await writeFile(join(root, "results.json"), `${JSON.stringify({ expectedEntries: 30, results }, null, 2)}\n`);
  return results;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const destination = process.env.CANVAS_TEXT_RECEIPT_EVIDENCE_ROOT ?? resolve(new URL(`../research/${TEXT_RECEIPT_ROOT}`, import.meta.url).pathname);
  if (process.argv.includes("--prepare")) {
    const prepared = await prepareTextReceiptEvidence(destination);
    console.log(JSON.stringify({ root: prepared.root, sourceSha256: prepared.sourceHash.sourceSha256, cases: TEXT_RECEIPT_CASE_IDS.length, nativeRun: false }, null, 2));
  } else if (process.argv.includes("--run")) {
    const references = process.env.CANVAS_TEXT_RECEIPT_REFERENCES_ROOT;
    assert.ok(references, "CANVAS_TEXT_RECEIPT_REFERENCES_ROOT is required for native run");
    const results = await runTextReceiptMatrix({ evidenceRoot: destination, referencesRoot: references });
    console.log(JSON.stringify({ expectedEntries: 30, actualEntries: results.length }, null, 2));
  } else {
    console.error("Pass --prepare for source-only preparation or --run for an explicitly authorized native run.");
    process.exitCode = 2;
  }
}
