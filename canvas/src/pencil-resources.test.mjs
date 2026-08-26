import assert from "node:assert/strict";
import test from "node:test";

import {
  collectPencilDocumentFonts,
  collectPencilResourceReferences,
  pencilResourceAsset,
  pencilResourceMimeType,
  resolvePencilResourcePath,
} from "./pencil-resources.mjs";

test("collects every typed Pencil 2.17 external resource exactly once", () => {
  const document = {
    fonts: [{ name: "Brand Sans", url: "fonts/brand.woff2" }],
    imports: { kit: "../libraries/kit.lib.pen" },
    children: [{
      id: "root",
      type: "frame",
      fill: [
        { type: "image", url: "./assets/hero.png" },
        { type: "shader", url: "shaders/noise.glsl" },
      ],
      children: [{ id: "chart", type: "script", scriptUri: "scripts/chart.js" }],
    }],
  };

  assert.deepEqual(collectPencilResourceReferences(document), [
    { path: "fonts/brand.woff2", kind: "font" },
    { path: "../libraries/kit.lib.pen", kind: "library" },
    { path: "./assets/hero.png", kind: "image" },
    { path: "shaders/noise.glsl", kind: "shader" },
    { path: "scripts/chart.js", kind: "script" },
  ]);
});

test("collects exact document fonts from the document and imported libraries", () => {
  const library = new TextEncoder().encode(JSON.stringify({
    version: "2.17",
    fonts: [{ name: "Library Serif", url: "fonts/serif.woff2" }],
    children: [],
  }));
  const assets = new Map([
    ["brand.woff2", { bytes: new Uint8Array([1, 2, 3, 4]), sha256: "a".repeat(64) }],
    ["libraries/kit.pen", { bytes: library, sha256: "b".repeat(64) }],
    ["libraries/fonts/serif.woff2", { bytes: new Uint8Array([5, 6, 7, 8]), sha256: "c".repeat(64) }],
  ]);
  const fonts = collectPencilDocumentFonts({
    fonts: [{ name: "Brand Sans", url: "brand.woff2" }],
    imports: { kit: "libraries/kit.pen" },
  }, assets);
  assert.deepEqual(fonts.map(({ family, url }) => [family, url]), [
    ["Brand Sans", "brand.woff2"],
    ["Library Serif", "libraries/fonts/serif.woff2"],
  ]);
});

test("resolves nested library resources against their containing .pen path", () => {
  assert.equal(resolvePencilResourcePath("../libraries/kit.lib.pen", "./icons/check.svg"), "../libraries/icons/check.svg");
  assert.equal(resolvePencilResourcePath("", "./assets/hero.png"), "assets/hero.png");
  const asset = { bytes: new Uint8Array([1]) };
  assert.equal(pencilResourceAsset(new Map([["../libraries/icons/check.svg", asset]]), "./icons/check.svg", "../libraries/kit.lib.pen"), asset);
});

test("assigns executable and design-library MIME types explicitly", () => {
  assert.equal(pencilResourceMimeType("chart.js", "script"), "text/javascript");
  assert.equal(pencilResourceMimeType("effect.glsl", "shader"), "text/x-glsl");
  assert.equal(pencilResourceMimeType("kit.lib.pen", "library"), "application/x-pencil+json");
  assert.equal(pencilResourceMimeType("brand.woff2", "font"), "font/woff2");
});
