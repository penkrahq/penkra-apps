import assert from "node:assert/strict";
import test from "node:test";

import { viewportInsetsFromRects } from "./viewport-insets.mjs";

test("fit viewport excludes a visible panel that overlaps the canvas", () => {
  const viewport = { left: 0, top: 0, right: 600, bottom: 900, width: 600, height: 900 };
  const panel = { left: 0, top: 0, right: 320, bottom: 900 };

  assert.deepEqual(viewportInsetsFromRects(viewport, [panel]), {
    left: 320,
    right: 0,
    top: 0,
    bottom: 0,
  });
});

test("fit viewport ignores a side panel that does not overlap the canvas", () => {
  const viewport = { left: 238, top: 0, right: 914, bottom: 900, width: 676, height: 900 };
  const panel = { left: 0, top: 0, right: 238, bottom: 900 };

  assert.deepEqual(viewportInsetsFromRects(viewport, [panel]), {
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  });
});
