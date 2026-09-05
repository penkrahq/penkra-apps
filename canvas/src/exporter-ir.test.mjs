import assert from "node:assert/strict";
import test from "node:test";
import { buildExporterIR } from "./exporter-ir.mjs";

test("mesh raster scope fails closed until role PPI is specified", () => {
  const document = { canvasSchemaVersion: 3, version: "2.15", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, layout: "none", children: [{ id: "title", type: "text", x: 10, y: 20, width: 200, height: 40, content: "Hello", paragraphs: [{ from: 0, to: 5 }], marks: [{ type: "weight", from: 0, to: 5, value: 700 }, { type: "lang", from: 0, to: 5, value: "fr" }] }, { id: "mesh", type: "rectangle", x: 0, y: 100, width: 100, height: 100, fill: { type: "mesh_gradient", __canvasMesh: {} } }] }] };
  document.children[0].physical = { w: 13.333, h: 7.5, unit: "in" };
  assert.throws(() => buildExporterIR(document, { role: "slide", frames: ["slide"] }), (error) => error.code === "CANVAS_RASTER_PPI_UNSPECIFIED");
});

test("backdrop raster fails closed until effect outsets are specified", () => {
  const document = { canvasSchemaVersion: 3, version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, children: [{ id: "group", type: "frame", x: 20, y: 20, width: 300, height: 200, children: [{ id: "backdrop", type: "rectangle", x: 10, y: 10, width: 100, height: 80, effect: { type: "background_blur", radius: 12 } }, { id: "label", type: "text", x: 10, y: 100, width: 100, height: 30, content: "Inside", paragraphs: [{ from: 0, to: 6 }], marks: [] }] }] }] };
  document.children[0].physical = { w: 13.333, h: 7.5, unit: "in" };
  assert.throws(() => buildExporterIR(document, { role: "slide", frames: ["slide"] }), (error) => error.code === "CANVAS_EFFECT_OUTSET_UNSPECIFIED");
});

test("isolated effect raster also fails closed without an outset definition", () => {
  const document = { canvasSchemaVersion: 3, version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, children: [{ id: "outer", type: "frame", width: 500, height: 400, children: [{ id: "isolated", type: "frame", width: 300, height: 250, opacity: 0.8, children: [{ id: "blur", type: "rectangle", width: 100, height: 80, effect: { type: "background_blur", radius: 8 } }, { id: "mesh", type: "rectangle", y: 100, width: 100, height: 80, fill: { type: "mesh_gradient" } }] }] }] }] };
  document.children[0].physical = { w: 13.333, h: 7.5, unit: "in" };
  assert.throws(() => buildExporterIR(document, { role: "slide", frames: ["slide"] }), (error) => error.code === "CANVAS_EFFECT_OUTSET_UNSPECIFIED");
});
