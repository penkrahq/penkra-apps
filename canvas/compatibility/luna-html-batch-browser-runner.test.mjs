import assert from "node:assert/strict";
import test from "node:test";

import { connectCdp, createPageController, measurementCount, runnerExitCode, waitForChildExit } from "../scripts/luna-html-batch-browser.mjs";

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

class FakeNavigationPage {
  constructor(mode) {
    this.mode = mode;
    this.waiters = new Set();
  }

  on(_method, _listener) {}

  once(_method) {
    let resolvePromise;
    let rejectPromise;
    let timer;
    const waiter = {
      cancel: () => {
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolvePromise({ cancelled: true });
      },
    };
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
      if (this.mode === "stall") {
        timer = setTimeout(() => {
          this.waiters.delete(waiter);
          rejectPromise(new Error("event timeout"));
        }, 2);
      }
    });
    this.waiters.add(waiter);
    promise.cancel = waiter.cancel;
    return promise;
  }

  async send(method) {
    if (method === "Emulation.setDeviceMetricsOverride") return {};
    if (method === "Page.navigate") {
      if (this.mode === "reject") throw new Error("navigation rejected");
      await new Promise((resolve) => setTimeout(resolve, 10));
      return {};
    }
    if (method === "Runtime.evaluate") {
      if (arguments.length === 0) return { result: { value: true } };
      return { result: { value: { school: { textContent: "School 1", tag: "P", bounds: { left: 0, top: 0, width: 100, height: 50 } }, marker: { textContent: "", tag: "DIV", bounds: { left: 110, top: 0, width: 20, height: 20 } }, fontFamily: "Inter", fontSize: "24px", visibleText: "School 1", tags: ["P", "DIV"] } } };
    }
    return {};
  }

  async close() {}
}

async function assertNoUnhandledRejection(action) {
  const rejections = [];
  const listener = (reason) => rejections.push(reason);
  process.on("unhandledRejection", listener);
  try {
    await action();
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off("unhandledRejection", listener);
  }
  assert.deepEqual(rejections, []);
}

test("navigation rejection cancels the load waiter without an unhandled rejection", async () => {
  const page = new FakeNavigationPage("reject");
  const controller = createPageController(page);
  let observation;
  await assertNoUnhandledRejection(async () => { observation = await controller.measure({ schoolIndex: 1, width: 800, url: "file:///fake", displayPath: "bundles/School 1/slide.html" }); });
  assert.ok(observation.navigationError);
  assert.equal(page.waiters.size, 0);
});

test("load event timeout while navigation is pending is observed and cleans its waiter", async () => {
  const page = new FakeNavigationPage("stall");
  const controller = createPageController(page);
  let observation;
  await assertNoUnhandledRejection(async () => { observation = await controller.measure({ schoolIndex: 1, width: 800, url: "file:///fake", displayPath: "bundles/School 1/slide.html" }); });
  assert.ok(observation.navigationError);
  assert.equal(page.waiters.size, 0);
});

test("synchronous CDP socket send failure rejects and removes its pending request", async () => {
  class ThrowingSocket extends FakeSocket {
    send() { throw new Error("send failure"); }
  }
  const cdp = connectCdp("ws://fake", { WebSocketImpl: ThrowingSocket, openTimeoutMs: 20 });
  await assert.rejects(cdp.send("Runtime.enable"));
  await cdp.close();
});

test("CDP close before open rejects immediately and does not wait for open timeout", async () => {
  class ClosesSocket extends FakeSocket {
    constructor(url) {
      super(url, false);
      queueMicrotask(() => this.emit("close", {}));
    }
  }
  const cdp = connectCdp("ws://fake", { WebSocketImpl: ClosesSocket, openTimeoutMs: 100 });
  await assert.rejects(cdp.send("Runtime.enable"));
  await cdp.close();
});
