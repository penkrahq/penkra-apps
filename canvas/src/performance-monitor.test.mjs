import assert from "node:assert/strict";
import test from "node:test";

import { createPerformanceMonitor } from "./performance-monitor.mjs";

test("keeps a bounded diagnostics buffer and logs slow work", () => {
  const warnings = [];
  const target = {};
  const monitor = createPerformanceMonitor({
    scope: "canvas-test",
    slowThresholdMs: 10,
    maxEntries: 2,
    logger: { warn: (message) => warnings.push(message) },
    target,
  });

  monitor.record("fast", 2);
  monitor.record("slow", 12, { nodes: 3 });
  monitor.record("latest", 1);

  assert.deepEqual(monitor.snapshot().map(({ name }) => name), ["slow", "latest"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /"name":"slow"/);
  assert.equal(target.__penkraPerformance["canvas-test"], monitor);
});

test("measure records elapsed synchronous work and returns its result", () => {
  const monitor = createPerformanceMonitor({ logger: {}, target: {} });
  const result = monitor.measure("derive", () => 42, { documentId: "doc" });

  assert.equal(result, 42);
  assert.equal(monitor.entries[0].name, "derive");
  assert.equal(monitor.entries[0].documentId, "doc");
});

test("measureAsync records elapsed asynchronous work and returns its result", async () => {
  const target = {};
  const monitor = createPerformanceMonitor({ target, slowThresholdMs: Infinity });

  const result = await monitor.measureAsync("async-work", async () => "done", { stage: 2 });

  assert.equal(result, "done");
  assert.equal(monitor.entries.length, 1);
  assert.equal(monitor.entries[0].name, "async-work");
  assert.equal(monitor.entries[0].stage, 2);
  assert.ok(monitor.entries[0].durationMs >= 0);
});
