import assert from "node:assert/strict";
import test from "node:test";

import { createLayeredSurfaceReadiness } from "./surface-readiness.mjs";

test("layered Canvas finalizes exact-font layout once before its first visible frame", () => {
  const events = [];
  const onLayerReady = createLayeredSurfaceReadiness({
    layerCount: 2,
    finalizeLayout: () => events.push("layout"),
    prepareViewport: () => events.push("viewport"),
    requestRender: () => events.push("render"),
    scheduleReveal: (reveal) => {
      events.push("schedule-reveal");
      reveal();
    },
    reveal: () => events.push("reveal"),
  });

  onLayerReady();
  assert.deepEqual(events, []);
  onLayerReady();
  onLayerReady();

  assert.deepEqual(events, ["layout", "viewport", "render", "schedule-reveal", "reveal"]);
});
