import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openBrowser } from "./browser-fixture.mjs";

test("browser startup timeout observes termination of its exact owned process", { timeout: 10_000 }, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-browser-deadline-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  let observed;
  await assert.rejects(openBrowser(directory, context.signal, {
    command: process.execPath,
    args: ["-e", "setInterval(() => {}, 1000)"],
    startupTimeoutMs: 150,
    terminateGraceMs: 100,
    terminationTimeoutMs: 2000,
  }), error => {
    observed = error;
    return error.code === "BROWSER_STARTUP_TIMEOUT";
  });
  assert.equal(observed.termination.closed, true);
  assert.ok(Number.isInteger(observed.termination.pid));
  assert.throws(() => process.kill(observed.termination.pid, 0), { code: "ESRCH" });
});

test("browser cleanup escalates only its owned child when graceful termination is ignored", { timeout: 10_000 }, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-browser-escalation-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  let observed;
  await assert.rejects(openBrowser(directory, context.signal, {
    command: process.execPath,
    args: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
    startupTimeoutMs: 500,
    terminateGraceMs: 100,
    terminationTimeoutMs: 2000,
  }), error => { observed = error; return error.code === "BROWSER_STARTUP_TIMEOUT"; });
  assert.equal(observed.termination.closed, true);
  assert.equal(observed.termination.signal, "SIGKILL");
  assert.throws(() => process.kill(observed.termination.pid, 0), { code: "ESRCH" });
});

test("actual isolated browser closes idempotently with a process receipt", { timeout: 30_000 }, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-browser-close-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const browser = await openBrowser(directory, context.signal);
  try {
    const bytes = await browser.screenshot("data:text/html,<body style='background:rgb(18,52,86)'>", 40, 30, 1);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  } finally {
    const first = await browser.close();
    assert.equal(first.closed, true);
    assert.deepEqual(await browser.close(), first);
    assert.throws(() => process.kill(first.pid, 0), { code: "ESRCH" });
  }
});
