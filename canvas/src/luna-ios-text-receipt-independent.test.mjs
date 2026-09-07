import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, stat, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const LOCAL_CANVAS_ROOT = resolve(import.meta.dirname, "..");
const HARNESS_SCRIPTS_ROOT = resolve(process.env.CANVAS_IOS_TEXT_RECEIPT_HARNESS_ROOT ?? join(LOCAL_CANVAS_ROOT, "scripts"));
const HARNESS_CANVAS_ROOT = resolve(HARNESS_SCRIPTS_ROOT, "..");
const harnessModule = (name) => pathToFileURL(join(HARNESS_SCRIPTS_ROOT, name)).href;
const harnessCanvasModule = (name) => pathToFileURL(join(HARNESS_CANVAS_ROOT, name)).href;
const RECEIPT = "LUNA_TEXT_READY case=case-01 nonce=n+1 regularPostScript=Inter-Regular boldPostScript=Inter-Bold\n"
  + "LUNA_TEXT_ROOT case=case-01 nonce=n+1 frame=0,0 340x180 window=0,0 340x180 screen=0,0 340x180 scale=1\n";

const {
  TEXT_RECEIPT_DEVICES,
  prepareTextReceiptEvidence,
  runTextReceiptCase,
} = await import(harnessModule("luna-ios-text-receipt-20260907.mjs"));
const { createCommandAdapter, runTextReceiptMatrix } = await import(harnessModule("luna-ios-text-receipt-20260907-runner.mjs"));
const { measureCapture } = await import(harnessModule("luna-ios-text-verify.mjs"));
const { encodeRgbaPng } = await import(harnessModule("luna-ios-grid-capture-utils-20260907.mjs"));
const { getCanvasKit } = await import(harnessCanvasModule("vendor/open-pencil/engine.source.mjs"));

function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function tempRoot() { return mkdtemp(join(tmpdir(), "canvas-ios-receipt-independent-")); }

async function solidPng(color = [18, 52, 86, 255]) {
  const kit = await getCanvasKit();
  const pixels = new Uint8Array(340 * 180 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(color, offset);
  return encodeRgbaPng({ width: 340, height: 180, pixels }, kit);
}

function fakeReceiptCommand({ bytes, launchError = null, queryError = null, screenshotError = null } = {}) {
  let launches = 0;
  let screenshots = 0;
  return {
    get counts() { return { launches, screenshots }; },
    async launch() { launches += 1; if (launchError) throw launchError; return { pid: "receipt-test" }; },
    async query() { if (queryError) throw queryError; return { stdout: RECEIPT, stderr: "", exitCode: 0 }; },
    async screenshot({ path }) {
      screenshots += 1;
      if (screenshotError) throw screenshotError;
      await writeFile(path, bytes);
    },
  };
}

test("receipt source hashes match generated files and all project font paths exist", async () => {
  const root = await tempRoot();
  try {
    const prepared = await prepareTextReceiptEvidence(join(root, "prepared"));
    const provenance = JSON.parse(await readFile(join(prepared.root, "source-hashes.json"), "utf8"));
    const fontManifest = JSON.parse(await readFile(join(prepared.root, "font-sources.json"), "utf8"));
    const project = await readFile(join(prepared.root, "project.yml"), "utf8");
    const fontByName = new Map(fontManifest.fonts.map((font) => [font.filename, font]));
    const actualPath = (entryPath) => {
      if (entryPath === "project.yml") return join(prepared.root, entryPath);
      if (entryPath === "SimulatorHost/App.swift") return join(prepared.root, "swift", entryPath);
      if (entryPath.startsWith("Fonts/")) return resolve(HARNESS_CANVAS_ROOT, "research", "luna-ios-text-receipt-20260907", fontByName.get(entryPath.slice("Fonts/".length)).sourcePath);
      const sourcePath = entryPath.startsWith("_canvas/") ? entryPath.slice("_canvas/".length) : entryPath;
      return join(prepared.root, "swift", "Sources", "CanvasTextReceipt", sourcePath);
    };
    const materialized = [];
    for (const entry of provenance.files) {
      const path = actualPath(entry.path);
      const bytes = await readFile(path);
      assert.equal(bytes.byteLength, entry.bytes, `byte count for ${entry.path}`);
      assert.equal(sha256(bytes), entry.sha256, `hash for ${entry.path}`);
      materialized.push({ path: entry.path, sha256: entry.sha256 });
    }
    const aggregate = sha256(materialized.sort((a, b) => a.path.localeCompare(b.path)).map(({ path, sha256: digest }) => `${path}:${digest}\n`).join(""));
    assert.equal(aggregate, provenance.sourceSha256);
    assert.match(project, /- swift\/Sources\/CanvasTextReceipt\n/u);
    assert.match(project, /- swift\/SimulatorHost\/App\.swift\n/u);
    const fontDirectory = project.match(/path: (\.\.\/[^\n]+\/Fonts)\n/u)?.[1];
    assert.ok(fontDirectory, "project must declare its exact font directory");
    await access(resolve(HARNESS_CANVAS_ROOT, "research", "luna-ios-text-receipt-20260907", fontDirectory));
    for (const font of fontManifest.fonts) {
      const path = resolve(HARNESS_CANVAS_ROOT, "research", "luna-ios-text-receipt-20260907", font.sourcePath);
      const bytes = await readFile(path);
      assert.equal(bytes.byteLength, font.bytes, `font bytes for ${font.filename}`);
      assert.equal(sha256(bytes), font.sha256, `font hash for ${font.filename}`);
    }
    const helper = await readFile(join(prepared.root, "swift", "Sources", "CanvasTextReceipt", "CanvasFonts.swift"), "utf8");
    const host = await readFile(join(prepared.root, "swift", "SimulatorHost", "App.swift"), "utf8");
    assert.match(helper, /register\(\)/u);
    assert.match(host, /CanvasFonts\.register\(\)/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("real measureCapture translates identical and mismatched PNGs to pass and mismatch", async () => {
  const root = await tempRoot();
  try {
    const reference = join(root, "reference.png");
    const identical = join(root, "identical.png");
    const changed = join(root, "changed.png");
    const bytes = await solidPng();
    await writeFile(reference, bytes);
    await writeFile(identical, bytes);
    await writeFile(changed, await solidPng([40, 52, 86, 255]));
    const pass = await measureCapture(reference, identical, 1);
    const mismatch = await measureCapture(reference, changed, 1);
    assert.equal(pass.status, "pass");
    assert.ok(pass.comparedPixels > 0);
    assert.equal(mismatch.status, "mismatch");
    assert.ok(mismatch.comparedPixels > 0);
    assert.ok(mismatch.mismatchedPixels > 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runTextReceiptCase preserves raw PNGs and cannot pass crop, compare, query, launch, screenshot, or filesystem failures", async () => {
  const root = await tempRoot();
  const bytes = await solidPng();
  try {
    const command = fakeReceiptCommand({ bytes });
    const measured = await runTextReceiptCase({
      evidenceRoot: join(root, "pass"), device: { ...TEXT_RECEIPT_DEVICES[0], scale: 1 }, contentSize: "large",
      caseId: "case-01", nonce: "n+1", command, screenshot: command.screenshot,
      compare: async () => ({ status: "pass", comparedPixels: 100, mismatchedPixels: 0 }),
      receiptPollAttempts: 1, pairAttempts: 1, settleMs: 0, sleep: async () => {},
    });
    assert.equal(measured.status, "pass");
    const fullA = join(root, "pass", measured.attempts[0].paths.fullA);
    const fullB = join(root, "pass", measured.attempts[0].paths.fullB);
    assert.deepEqual(await readFile(fullA), bytes, "crop must not overwrite full-a");
    assert.deepEqual(await readFile(fullB), bytes, "crop must not overwrite full-b");
    assert.ok((await stat(join(root, "pass", measured.attempts[0].paths.cropB))).size > 0);

    const failureCases = [
      ["crop", { crop: async () => { throw Object.assign(new Error("crop failed"), { code: "CROP_FAIL" }); } }],
      ["compare", { compare: async () => { throw Object.assign(new Error("compare failed"), { code: "COMPARE_FAIL" }); } }],
      ["query", { command: fakeReceiptCommand({ bytes, queryError: Object.assign(new Error("query failed"), { code: "QUERY_FAIL" }) }) }],
      ["launch", { command: fakeReceiptCommand({ bytes, launchError: Object.assign(new Error("launch failed"), { code: "LAUNCH_FAIL" }) }) }],
      ["screenshot", { command: fakeReceiptCommand({ bytes, screenshotError: Object.assign(new Error("screenshot failed"), { code: "SCREENSHOT_FAIL" }) }) }],
    ];
    for (const [name, options] of failureCases) {
      const failingCommand = options.command ?? command;
      const result = await runTextReceiptCase({
        evidenceRoot: join(root, name), device: { ...TEXT_RECEIPT_DEVICES[0], scale: 1 }, contentSize: "large",
        caseId: "case-01", nonce: `n-${name}`, command: failingCommand, screenshot: failingCommand.screenshot,
        compare: options.compare ?? (async () => ({ status: "pass", comparedPixels: 100, mismatchedPixels: 0 })),
        crop: options.crop, receiptPollAttempts: 1, pairAttempts: 1, settleMs: 0, sleep: async () => {},
      });
      assert.notEqual(result.status, "pass", `${name} failure must not pass`);
    }

    const occupied = join(root, "occupied");
    await writeFile(occupied, "file");
    await assert.rejects(() => runTextReceiptCase({
      evidenceRoot: occupied, device: TEXT_RECEIPT_DEVICES[0], contentSize: "large", caseId: "case-01",
      command, screenshot: command.screenshot,
    }), /EEXIST|ENOTDIR/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function matrixCommand({ failure = null } = {}) {
  const calls = [];
  const sizes = new Map(TEXT_RECEIPT_DEVICES.map(({ id }) => [id, "large"]));
  const states = new Map([[TEXT_RECEIPT_DEVICES[0].id, "Shutdown"], [TEXT_RECEIPT_DEVICES[1].id, "Booted"]]);
  let reads = 0;
  let sets = 0;
  const command = {
    calls,
    async listDevices() { calls.push(["list"]); if (failure === "observe") throw new Error("list failed"); return { devices: { iOS: TEXT_RECEIPT_DEVICES.map(({ id }) => ({ udid: id, state: states.get(id) })) } }; },
    async boot({ device }) { calls.push(["boot", device.id]); if (failure === "boot") throw new Error("boot failed"); states.set(device.id, "Booted"); },
    async bootstatus({ device }) { calls.push(["bootstatus", device.id]); if (failure === "bootstatus") throw new Error("bootstatus failed"); },
    async readContentSize({ device }) { calls.push(["read", device.id]); reads += 1; if (failure === "read" && reads === 1) throw new Error("initial read failed"); if (failure === "readback" && reads > TEXT_RECEIPT_DEVICES.length) throw new Error("readback failed"); return sizes.get(device.id); },
    async setContentSize({ device, contentSize }) { calls.push(["set", device.id, contentSize]); sets += 1; if (failure === "setting" && sets === 1) throw new Error("set failed"); sizes.set(device.id, contentSize); },
    async shutdown({ device }) { calls.push(["shutdown", device.id]); states.set(device.id, "Shutdown"); },
  };
  return command;
}

test("matrix finally restores observed settings and runner-booted devices across lifecycle failures", async () => {
  const root = await tempRoot();
  try {
    for (const failure of ["boot", "bootstatus", "read", "setting", "readback", "case"]) {
      const command = matrixCommand({ failure: failure === "case" ? null : failure });
      const evidence = join(root, failure);
      const runCase = failure === "case" ? async () => { throw new Error("case failed"); } : async () => ({ status: "pass" });
      await assert.rejects(() => runTextReceiptMatrix({ evidenceRoot: evidence, referencesRoot: root, command, runCase, sleep: async () => {} }), /failed/u);
      const restoration = JSON.parse(await readFile(join(evidence, "restoration.json"), "utf8"));
      assert.ok(Object.values(restoration.restoration).every(({ operations }) => operations.length > 0), failure);
      if (failure !== "readback" && failure !== "setting" && failure !== "case") assert.ok(command.calls.some(([name]) => name === "shutdown"), failure);
    }
    const observeCommand = matrixCommand({ failure: "observe" });
    const observeRoot = join(root, "observe");
    await assert.rejects(() => runTextReceiptMatrix({ evidenceRoot: observeRoot, referencesRoot: root, command: observeCommand }), /list failed/u);
    assert.equal(observeCommand.calls.filter(([name]) => name === "boot" || name === "shutdown").length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("command adapter emits one correct content_size argv and non-attached launch", async () => {
  const calls = [];
  const adapter = createCommandAdapter({ execFile: async (file, args, options) => { calls.push({ file, args, options }); return { stdout: "large\n", stderr: "" }; } });
  await adapter.setContentSize({ device: TEXT_RECEIPT_DEVICES[0], contentSize: "accessibility-extra-extra-large" });
  await adapter.launch({ device: TEXT_RECEIPT_DEVICES[0], args: ["--canvas-case", "case-01", "--canvas-nonce", "n"], timeoutMs: 1234 });
  assert.deepEqual(calls[0].args, ["simctl", "ui", TEXT_RECEIPT_DEVICES[0].id, "content_size", "accessibility-extra-extra-large"]);
  assert.deepEqual(calls[1].args, ["simctl", "launch", "--terminate-running-process", TEXT_RECEIPT_DEVICES[0].id, "com.penkra.canvas.qa.textreceipt", "--canvas-case", "case-01", "--canvas-nonce", "n"]);
  assert.equal(calls[1].args.includes("--console"), false);
  assert.equal(calls[1].options.timeout, 1234);
});
