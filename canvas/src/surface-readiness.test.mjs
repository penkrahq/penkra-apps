import assert from "node:assert/strict";
import test from "node:test";

import { createLayeredSurfaceReadiness } from "./surface-readiness.mjs";

test("layered Canvas reveals once after both independently initialized layers are ready", () => {
  const events = [];
  const onLayerReady = createLayeredSurfaceReadiness({
    layerCount: 2,
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

  assert.deepEqual(events, ["viewport", "render", "schedule-reveal", "reveal"]);
});
