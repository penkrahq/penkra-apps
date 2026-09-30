import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { getCanvasKit, SkiaRenderer } from "../vendor/open-pencil/engine.source.mjs";
import { createOpenPencilGraph } from "./openpencil-engine.mjs";

test("frame titles retain finite opaque colors across select and deselect", () => {
  const graph = createOpenPencilGraph({ children: [
    { id: "frame", type: "frame", name: "Example", width: 400, height: 300 },
  ] }, new Map());
  const node = graph.getNode("frame");
  const selectedColor = new Float32Array([0.3, 0.5, 1, 1]);
  let paintColor;
  const draws = [];
  const font = {
    getGlyphIDs: (text) => [...text].map((_, i) => i),
    getGlyphWidths: (ids) => ids.map(() => 6),
  };
  const renderer = Object.assign(Object.create(SkiaRenderer.prototype), {
    zoom: 1, panX: 0, panY: 0,
    labelFont: font, sizeFont: font,
    labelCache: { getFrames: () => [{ node }] },
    auxFill: { setColor: (color) => { paintColor = color; } },
    selColor: () => selectedColor,
    ck: {
      Color4f: (...rgba) => new Float32Array(rgba),
      WHITE: new Float32Array([1, 1, 1, 1]),
      Matrix: { mapPoints: (matrix, points) => points },
      LTRBRect: (...rect) => rect,
      RRectXY: (rect) => rect,
    },
  });
  const canvas = {
    save() {}, restore() {}, translate() {}, rotate() {}, drawRRect() {},
    drawText(text, x, y) { draws.push({ text, y, color: [...paintColor] }); },
  };
  const titleColor = () => {
    const title = draws.find((draw) => draw.y < 0);
    assert.ok(title, "frame title was drawn");
    assert.ok(title.color.every(Number.isFinite), "title color has finite channels");
    assert.equal(title.color[3], 1, "title is opaque");
    return title.color;
  };

  renderer.drawFrameTitles(canvas, graph, new Set());
  const restingColor = titleColor();
  draws.length = 0;
  renderer.drawFrameTitles(canvas, graph, new Set([node.id]));
  renderer.drawSelectionLabels(canvas, graph, new Set([node.id]), {});
  assert.deepEqual(titleColor(), [...selectedColor]);
  draws.length = 0;
  renderer.drawFrameTitles(canvas, graph, new Set());
  assert.deepEqual(titleColor(), restingColor);
});

test("selected frame title paints visible pixels at different zoom levels", async () => {
  const require = createRequire(import.meta.url);
  const ck = await getCanvasKit({ locateFile: () => require.resolve("canvaskit-wasm/bin/canvaskit.wasm") });
  const surface = ck.MakeSurface(500, 300);
  const renderer = new SkiaRenderer(ck, surface);
  const bytes = await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
  const typeface = ck.Typeface.MakeFreeTypeFaceFromData(bytes);
  renderer.labelFont = new ck.Font(typeface, 12);
  renderer.sizeFont = new ck.Font(typeface, 12);
  renderer.panX = 40;
  renderer.panY = 60;
  const graph = createOpenPencilGraph({ children: [
    { id: "frame", type: "frame", name: "Example", width: 400, height: 300 },
  ] }, new Map());
  const id = graph.getNode("frame").id;
  renderer.viewportWidth = 500;
  renderer.viewportHeight = 300;
  renderer.labelCache.update(graph, graph.getPages()[0].id, 1);
  const canvas = surface.getCanvas();
  const titleInk = (selected = false) => {
    surface.flush();
    const image = surface.makeImageSnapshot();
    try {
      const pixels = image.readPixels(0, 0, { width: 500, height: 300,
        colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul,
        colorSpace: ck.ColorSpace.SRGB });
      let ink = 0;
      for (let y = 30; y < 60; y++) for (let x = 40; x < 160; x++) {
        const offset = (y * 500 + x) * 4;
        if (pixels[offset + 3] > 0 && (!selected || pixels[offset + 2] > pixels[offset] + 20)) ink++;
      }
      return ink;
    } finally { image.delete(); }
  };
  try {
    for (const zoom of [0.5, 1, 2]) {
      renderer.zoom = zoom;
      canvas.clear(ck.TRANSPARENT);
      renderer.drawFrameTitles(canvas, graph, new Set());
      const resting = titleInk();
      assert.ok(resting > 10);
      canvas.clear(ck.TRANSPARENT);
      renderer.drawFrameTitles(canvas, graph, new Set([id]));
      renderer.drawSelectionLabels(canvas, graph, new Set([id]), {});
      assert.equal(titleInk(true), resting, `selected title retains its glyph pixels at zoom ${zoom}`);
      canvas.clear(ck.TRANSPARENT);
      renderer.drawFrameTitles(canvas, graph, new Set());
      assert.equal(titleInk(), resting);
    }
  } finally { renderer.destroy(); typeface.delete(); }
});
