import assert from "node:assert/strict";
import test from "node:test";

import {
  browserSurfaceInsets,
  browserSurfaceInsetsSignature,
} from "./browser-surface.mjs";

test("edge constraints stay constant while an edge-anchored viewport resizes", () => {
  const layouts = [320, 900, 480, 1200].map((frameWidth) =>
    browserSurfaceInsets(
      { top: 96, right: frameWidth, bottom: 700, left: 0 },
      frameWidth,
      700,
    ),
  );

  assert.deepEqual(layouts, layouts.map(() => ({ top: 96, right: 0, bottom: 0, left: 0 })));
  assert.equal(new Set(layouts.map(browserSurfaceInsetsSignature)).size, 1);
});

test("normalizes harmless subpixel noise without losing real structural insets", () => {
  const insets = browserSurfaceInsets(
    { top: 44.0001, right: 793.9999, bottom: 596.0001, left: 7.9999 },
    800,
    600,
  );

  assert.deepEqual(insets, { top: 44, right: 6, bottom: 4, left: 8 });
});

test("rejects non-finite geometry instead of poisoning host layout", () => {
  assert.throws(
    () => browserSurfaceInsets({ top: 0, right: Infinity, bottom: 1, left: 0 }, 1, 1),
    /must be finite/,
  );
});
