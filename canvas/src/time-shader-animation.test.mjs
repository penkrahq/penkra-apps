import assert from "node:assert/strict";
import test from "node:test";

import { createTimeShaderAnimation } from "./time-shader-animation.mjs";

function createFrameHarness() {
  let nextId = 0;
  const callbacks = new Map();
  return {
    requestFrame(callback) {
      const id = ++nextId;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      callbacks.delete(id);
    },
    step(timestamp) {
      const pending = [...callbacks.values()];
      callbacks.clear();
      for (const callback of pending) callback(timestamp);
    },
    pendingCount() {
      return callbacks.size;
    },
  };
}

test("repaints every requested animation frame without scheduling duplicates", () => {
  const frames = createFrameHarness();
  let repaints = 0;
  const animation = createTimeShaderAnimation({
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    requestRepaint: () => { repaints += 1; },
  });

  animation.setActive(true);
  animation.setActive(true);
  assert.equal(frames.pendingCount(), 1);

  frames.step(0);
  assert.equal(repaints, 1);
  frames.step(16);
  assert.equal(repaints, 2);
  frames.step(34);
  assert.equal(repaints, 3);
  assert.equal(frames.pendingCount(), 1);
});

test("stops immediately while inactive and restarts with a fresh frame", () => {
  const frames = createFrameHarness();
  let repaints = 0;
  const animation = createTimeShaderAnimation({
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
    requestRepaint: () => { repaints += 1; },
  });

  animation.setActive(true);
  frames.step(0);
  animation.setActive(false);
  assert.equal(frames.pendingCount(), 0);
  frames.step(100);
  assert.equal(repaints, 1);

  animation.setActive(true);
  frames.step(101);
  assert.equal(repaints, 2);
  animation.stop();
  assert.equal(frames.pendingCount(), 0);
});
