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
