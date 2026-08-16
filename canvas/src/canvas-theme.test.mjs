import assert from "node:assert/strict";
import test from "node:test";

import { bindCanvasThemeBackground, parseCssColor } from "./canvas-theme.mjs";

test("parses computed RGB and RGBA colors for CanvasKit", () => {
  assert.deepEqual(parseCssColor("rgb(32, 40, 48)"), {
    r: 32 / 255,
    g: 40 / 255,
    b: 48 / 255,
    a: 1,
  });
  assert.deepEqual(parseCssColor("rgba(255, 128, 0, 0.5)"), {
    r: 1,
    g: 128 / 255,
    b: 0,
    a: 0.5,
  });
  assert.equal(parseCssColor("transparent"), null);
});

test("keeps the CanvasKit page color synchronized with semantic theme changes", (context) => {
  let backgroundColor = "rgb(240, 240, 240)";
  let transitionListener;
  const colors = [];
  const element = {
    addEventListener: (_type, listener) => { transitionListener = listener; },
    removeEventListener: () => {},
  };
  const originalGetComputedStyle = globalThis.getComputedStyle;
  const originalMatchMedia = globalThis.matchMedia;
  globalThis.getComputedStyle = () => ({ backgroundColor });
  globalThis.matchMedia = () => ({
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  context.after(() => {
    if (originalGetComputedStyle) globalThis.getComputedStyle = originalGetComputedStyle;
    else delete globalThis.getComputedStyle;
    if (originalMatchMedia) globalThis.matchMedia = originalMatchMedia;
    else delete globalThis.matchMedia;
  });

  const dispose = bindCanvasThemeBackground({ setPageColor: (color) => colors.push(color) }, element);
  backgroundColor = "rgb(24, 24, 24)";
  transitionListener({ propertyName: "background-color" });
  dispose();

  assert.deepEqual(colors, [
    { r: 240 / 255, g: 240 / 255, b: 240 / 255, a: 1 },
    { r: 24 / 255, g: 24 / 255, b: 24 / 255, a: 1 },
  ]);
});
