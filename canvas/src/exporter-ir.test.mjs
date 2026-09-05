import assert from "node:assert/strict";
import test from "node:test";
import { buildExporterIR } from "./exporter-ir.mjs";

test("slide raster scopes carry the measured 96-PPI policy", () => {
  const document = { version: "2.15", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, layout: "none", children: [{ id: "title", type: "text", x: 10, y: 20, width: 200, height: 40, content: "Hello", paragraphs: [{ from: 0, to: 5 }], marks: [{ type: "weight", from: 0, to: 5, value: 700 }, { type: "lang", from: 0, to: 5, value: "fr" }] }, { id: "mesh", type: "rectangle", x: 100, y: 100, width: 100, height: 80, fill: { type: "mesh_gradient", __canvasMesh: {} }, effect: { type: "shadow", shadowType: "outer", blur: 12, spread: 2, offset: { x: 4, y: 6 } } }] }] };
  document.children[0].physical = { w: 13.333, h: 7.5, unit: "in" };
  const [raster] = buildExporterIR(document, { role: "slide", frames: ["slide"] }).rasters;
  assert.equal(raster.ppi, 96);
  assert.deepEqual(raster.outset, { left: 16, top: 14, right: 24, bottom: 26 });
  assert.deepEqual(raster.variants, [{ name: "1x", ppi: 96, scale: 1, pixelWidth: 140, pixelHeight: 120 }]);
});

test("backdrop raster scope expands to the containing compositing context", () => {
  const document = { version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, children: [{ id: "group", type: "frame", x: 20, y: 20, width: 300, height: 200, children: [{ id: "backdrop", type: "rectangle", x: 10, y: 10, width: 100, height: 80, effect: { type: "background_blur", radius: 12 } }, { id: "label", type: "text", x: 10, y: 100, width: 100, height: 30, content: "Inside", paragraphs: [{ from: 0, to: 6 }], marks: [] }] }] }] };
  document.children[0].physical = { w: 13.333, h: 7.5, unit: "in" };
  const [raster] = buildExporterIR(document, { role: "slide", frames: ["slide"] }).rasters;
  assert.equal(raster.id, "group");
  assert.equal(raster.ppi, 96);
});

test("isolated compositing contexts bound raster scope and carry computed outsets", () => {
  const document = { version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, children: [{ id: "outer", type: "frame", width: 500, height: 400, children: [{ id: "isolated", type: "frame", width: 300, height: 250, opacity: 0.8, children: [{ id: "blur", type: "rectangle", width: 100, height: 80, effect: { type: "background_blur", radius: 8 } }, { id: "mesh", type: "rectangle", y: 100, width: 100, height: 80, fill: { type: "mesh_gradient" } }] }] }] }] };
  document.children[0].physical = { w: 13.333, h: 7.5, unit: "in" };
  const [raster] = buildExporterIR(document, { role: "slide", frames: ["slide"] }).rasters;
  assert.equal(raster.id, "isolated");
  assert.equal(raster.ppi, 96);
  assert.ok(Object.values(raster.outset).every(Number.isFinite));
});
