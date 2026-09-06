import assert from "node:assert/strict";
import test from "node:test";

import { connectCdp, measurementCount, runnerExitCode, waitForChildExit } from "../scripts/luna-html-batch-browser.mjs";

function successfulResult() {
  return {
    infrastructureFailures: [],
    browser: { terminated: true, observedExit: true, exit: { code: null, signal: "SIGKILL" } },
    screenshotCount: measurementCount,
    observations: Array.from({ length: measurementCount }, (_, index) => ({
      schoolIndex: Math.floor(index / 3) + 1,
      width: [800, 1200, 1600][index % 3],
      status: "pass",
      screenshot: { relativePath: `screenshots/${index}.png` },
    })),
  };
}

test("runner gate returns zero only for a complete successful 120-entry result", () => {
  assert.equal(runnerExitCode(successfulResult()), 0);
});

test("runner gate returns nonzero for mismatch, missing observation, missing screenshot, and infrastructure failure", () => {
  const mismatch = successfulResult();
  mismatch.observations[0].status = "mismatch";
  assert.equal(runnerExitCode(mismatch), 1);

  const missingObservation = successfulResult();
  missingObservation.observations.pop();
  assert.equal(runnerExitCode(missingObservation), 1);

  const missingScreenshot = successfulResult();
  delete missingScreenshot.observations[0].screenshot;
  assert.equal(runnerExitCode(missingScreenshot), 1);

  const infrastructureFailure = successfulResult();
  infrastructureFailure.infrastructureFailures.push({ message: "CDP timeout" });
  assert.equal(runnerExitCode(infrastructureFailure), 1);
});

test("confirmed child exit is successful and clears the graceful wait without forcing", async () => {
  const signals = [];
  const result = await waitForChildExit(Promise.resolve({ code: 0, signal: null }), { kill: (signal) => signals.push(signal) }, { gracefulTimeoutMs: 20, forcedTimeoutMs: 20 });
  assert.deepEqual(result, { terminated: true, observedExit: true, forced: false, exit: { code: 0, signal: null } });
  assert.deepEqual(signals, []);
});

test("unobserved forced-exit timeout is explicit failure and never fabricates a SIGKILL exit", async () => {
  const signals = [];
  const result = await waitForChildExit(new Promise(() => {}), { kill: (signal) => signals.push(signal) }, { gracefulTimeoutMs: 2, forcedTimeoutMs: 2 });
  assert.equal(result.terminated, false);
  assert.equal(result.observedExit, false);
  assert.equal(result.exit, null);
  assert.equal(result.failure, "Child exit was not observed after forced termination.");
  assert.deepEqual(signals, ["SIGKILL"]);
});

test("exit observed after forced signal is successful but marked forced", async () => {
  let resolveExit;
  const exit = new Promise((resolve) => { resolveExit = resolve; });
  const signals = [];
  setTimeout(() => resolveExit({ code: null, signal: "SIGKILL" }), 5);
  const result = await waitForChildExit(exit, { kill: (signal) => signals.push(signal) }, { gracefulTimeoutMs: 1, forcedTimeoutMs: 50 });
  assert.deepEqual(result, { terminated: true, observedExit: true, forced: true, exit: { code: null, signal: "SIGKILL" } });
  assert.deepEqual(signals, ["SIGKILL"]);
});

class FakeSocket {
  constructor(_url, opens = true) {
    this.listeners = new Map();
    if (opens) queueMicrotask(() => this.emit("open", {}));
  }

  addEventListener(type, listener) {
    const current = this.listeners.get(type) ?? [];
    current.push(listener);
    this.listeners.set(type, current);
  }

  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((entry) => entry !== listener));
  }

  emit(type, value) {
    for (const listener of this.listeners.get(type) ?? []) listener(value);
  }

  send(_message) {}

  close() { this.emit("close", {}); }
}

test("CDP open, command, and event waits are bounded and reject with stable timeout code", async () => {
  class NeverOpensSocket extends FakeSocket { constructor(url) { super(url, false); } }
  const unopened = connectCdp("ws://fake", { WebSocketImpl: NeverOpensSocket, openTimeoutMs: 2 });
  await assert.rejects(unopened.send("Runtime.enable"), { code: "CANVAS_BROWSER_TIMEOUT" });
  await unopened.close();

  const connected = connectCdp("ws://fake", { WebSocketImpl: FakeSocket, openTimeoutMs: 20 });
  await assert.rejects(connected.send("Runtime.enable", {}, { timeoutMs: 2 }), { code: "CANVAS_BROWSER_TIMEOUT" });
  await assert.rejects(connected.once("Page.loadEventFired", { timeoutMs: 2 }), { code: "CANVAS_BROWSER_TIMEOUT" });
  await connected.close();
});
