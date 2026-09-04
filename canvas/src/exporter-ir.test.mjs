import assert from "node:assert/strict";
import test from "node:test";
import { buildExporterIR } from "./exporter-ir.mjs";

test("resolved IR retains tree, runs, physical size and scopes leaf raster fallback", () => {
  const document = { canvasSchemaVersion: 3, version: "2.15", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, layout: "none", children: [{ id: "title", type: "text", x: 10, y: 20, width: 200, height: 40, content: "Hello", paragraphs: [{ from: 0, to: 5 }], marks: [{ type: "weight", from: 0, to: 5, value: 700 }, { type: "lang", from: 0, to: 5, value: "fr" }] }, { id: "mesh", type: "rectangle", x: 0, y: 100, width: 100, height: 100, fill: { type: "mesh_gradient", __canvasMesh: {} } }] }] };
  const ir = buildExporterIR(document, { role: "slide", frames: ["slide"] });
  assert.equal(ir.outputs[0].physical.w, 13.333);
  assert.equal(ir.outputs[0].nodes[0].semantics.runs[0].weight, 700);
  assert.equal(ir.outputs[0].nodes[0].semantics.runs[0].language, "fr");
  assert.ok(ir.outputs[0].nodes[0].capability.paths.includes("properties.text.run.language"));
  assert.deepEqual(ir.rasters.map(({ id }) => id), ["mesh"]);
  assert.equal(ir.consequences[0].kind, "raster");
});

test("backdrop dependencies widen and replace their isolated subtree", () => {
  const document = { canvasSchemaVersion: 3, version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, children: [{ id: "group", type: "frame", x: 20, y: 20, width: 300, height: 200, children: [{ id: "backdrop", type: "rectangle", x: 10, y: 10, width: 100, height: 80, effect: { type: "background_blur", radius: 12 } }, { id: "label", type: "text", x: 10, y: 100, width: 100, height: 30, content: "Inside", paragraphs: [{ from: 0, to: 6 }], marks: [] }] }] }] };
  const ir = buildExporterIR(document, { role: "slide", frames: ["slide"] });
  assert.deepEqual(ir.rasters.map(({ id }) => id), ["group"]);
  assert.deepEqual(ir.outputs[0].nodes.map(({ id }) => id), ["group"]);
  assert.equal(ir.outputs[0].nodes[0].capability.verdict, "raster");
});

test("raster scopes stop at isolation and remove subsumed descendants", () => {
  const document = { canvasSchemaVersion: 3, version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, children: [{ id: "outer", type: "frame", width: 500, height: 400, children: [{ id: "isolated", type: "frame", width: 300, height: 250, opacity: 0.8, children: [{ id: "blur", type: "rectangle", width: 100, height: 80, effect: { type: "background_blur", radius: 8 } }, { id: "mesh", type: "rectangle", y: 100, width: 100, height: 80, fill: { type: "mesh_gradient" } }] }] }] }] };
  const ir = buildExporterIR(document, { role: "slide", frames: ["slide"] });
  assert.deepEqual(ir.rasters.map(({ id }) => id), ["isolated"]);
  assert.deepEqual(ir.outputs[0].nodes.map(({ id }) => id), ["outer", "isolated"]);
});
