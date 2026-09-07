import assert from "node:assert/strict";
import test from "node:test";
import { buildExporterIR, buildExtractionIR, buildCapabilityVerificationIR } from "./exporter-ir.mjs";
import { exportSvg } from "./exporters/svg.mjs";
import { measureDocumentText } from "./document-screenshot.mjs";
import { capabilityPathInventory } from "./canvas-schema.mjs";

test("text semantics retain alignment precedence without inventing unspecified defaults", () => {
  const source = { module: "mobile", axes: {}, variables: {}, paragraphStyles: { body: { align: "end" } }, imports: {}, flows: [], children: [
    { id: "screen", type: "frame", role: "ios", width: 300, height: 300, children: [
      { id: "text", type: "text", width: 200, height: 100, content: "a\nb\nc", textAlign: "center", textAlignVertical: "bottom", paragraphs: [
        { from: 0, to: 2, style: "body", align: "start" }, { from: 2, to: 4, style: "body" }, { from: 4, to: 5 },
      ] },
      { id: "unset", type: "text", width: 100, height: 30, content: "x" },
    ] },
  ] };
  const nodes = buildCapabilityVerificationIR(source, { role: "ios", frames: ["screen"] }, capabilityPathInventory()).outputs[0].nodes;
  const text = nodes.find((node) => node.id === "text").semantics;
  assert.equal(text.textAlign, "center");
  assert.equal(text.textAlignVertical, "bottom");
  assert.deepEqual(text.paragraphs.map((paragraph) => paragraph.effectiveAlign), ["start", "end", "center"]);
  const unset = nodes.find((node) => node.id === "unset").semantics;
  assert.equal(unset.textAlign, undefined);
  assert.equal(unset.textAlignVertical, undefined);
  assert.equal(unset.paragraphs[0].effectiveAlign, undefined);
});

test("measured PDF text preserves author image overrides and unrelated raster requirements", async () => {
  const source = { version: "2.17", module: "generic", children: [{ id: "text", type: "text", width: 100, height: 40, content: "Text", fontFamily: "Inter", textAlign: "center", textGrowth: "fixed-width-height" }] };
  const preparedText = await measureDocumentText(source, ["text"]);
  const request = { nodeId: "text", format: "pdf", preparedText };
  assert.equal(buildExtractionIR(source, request).rasters.length, 0);
  source.children[0].export = "image";
  assert.deepEqual(buildExtractionIR(source, request).rasters.map((item) => item.id), ["text"]);
  source.children[0].export = "default";
  source.children[0].effect = { type: "blur", radius: 8 };
  assert.deepEqual(buildExtractionIR(source, request).rasters.map((item) => item.id), ["text"]);
  assert.deepEqual(buildExtractionIR(source, { ...request, format: "svg" }).rasters.map((item) => item.id), ["text"]);
});

test("root image override rasterizes the complete frame and default never forces native", () => {
  const source = { module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "slide", type: "frame", role: "slide", export: "image", width: 400, height: 300, physical: { w: 4, h: 3, unit: "in" }, children: [] },
  ] };
  const request = { role: "slide", frames: ["slide"] };
  let ir = buildExporterIR(source, request);
  assert.deepEqual(ir.rasters.map((raster) => raster.id), ["slide"]);
  assert.ok(ir.consequences.some((entry) => entry.node === "slide" && entry.kind === "raster"));
  source.children[0].export = "default";
  assert.equal(buildExporterIR(source, request).rasters.length, 0);
  source.children[0].effect = { type: "blur", radius: 8 };
  ir = buildExporterIR(source, request);
  assert.deepEqual(ir.rasters.map((raster) => raster.id), ["slide"]);
});

test("mobile shadow spread rasterizes instead of blocking on an unverified nested row", () => {
  for (const role of ["ios", "android"]) {
    const source = { module: "mobile", children: [
      { id: "screen", type: "frame", role, width: 320, height: 180, layout: "none", effect: { type: "shadow", shadowType: "outer", color: "#00000080", offset: { x: 2, y: 3 }, blur: 8, spread: 4 }, children: [] },
    ] };
    const ir = buildExporterIR(source, { role, frames: ["screen"] });
    assert.deepEqual(ir.rasters.map(({ id }) => id), ["screen"]);
    assert.match(ir.consequences.find(({ node, kind }) => node === "screen" && kind === "raster").why, /shadow\.spread/u);
  }
});

test("mobile capability detection keeps empty axes and singular paint out of aggregate fallbacks", () => {
  for (const role of ["ios", "android"]) {
    const source = { module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, children: [
      { id: "screen", type: "frame", role, width: 320, height: 180, layout: "none", fill: "#ffffff", children: [
        { id: "label", type: "text", x: 10, y: 10, width: 200, height: 40, content: "Raster text", fontSize: 24, paragraphs: [], marks: [] },
      ] },
    ] };
    let ir = buildExporterIR(source, { role, frames: ["screen"] });
    assert.deepEqual(ir.rasters.map(({ id }) => id), ["label"]);
    assert.equal(ir.outputs[0].root.capability.verdict, "native");

    source.children[0].fill = ["#ffffff", "#00000080"];
    ir = buildExporterIR(source, { role, frames: ["screen"] });
    assert.deepEqual(ir.rasters.map(({ id }) => id), ["screen"]);

    source.children[0].fill = "#ffffff";
    source.axes = { appearance: { modes: [{ name: "light" }, { name: "dark", media: "prefers-color-scheme: dark" }] } };
    ir = buildExporterIR(source, { role, frames: ["screen"] });
    assert.deepEqual(ir.rasters.map(({ id }) => id), ["screen"]);
  }
});

test("native candidate verification does not bypass production raster verdicts", () => {
  const source = { module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "slide", type: "frame", role: "slide", width: 400, height: 300, physical: { w: 4, h: 3, unit: "in" }, effect: { type: "blur", radius: 8 }, children: [] },
  ] };
  const request = { role: "slide", frames: ["slide"] };
  const candidate = buildCapabilityVerificationIR(source, request, ["properties.effect.blur"]);
  assert.equal(candidate.rasters.length, 0);
  for (const extra of [{}, { assumedNativePaths: ["properties.effect.blur"] }, { verification: ["properties.effect.blur"] }]) {
    assert.deepEqual(buildExporterIR(source, { ...request, ...extra }).rasters.map((item) => item.id), ["slide"]);
  }
});

test("unsupported root paint rasterizes the complete output subtree", () => {
  const source = { version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "slide", type: "frame", role: "slide", width: 400, height: 300, physical: { w: 4, h: 3, unit: "in" }, effect: { type: "blur", radius: 8 }, children: [
      { id: "child", type: "rectangle", x: 10, y: 10, width: 100, height: 50, fill: "#123456" },
    ] },
  ] };
  const ir = buildExporterIR(source, { role: "slide", frames: ["slide"] });
  assert.deepEqual(ir.rasters.map((raster) => raster.id), ["slide"]);
  assert.deepEqual(ir.outputs[0].nodes.map((node) => node.id), ["slide"]);
  assert.equal(ir.outputs[0].nodes[0].parent, ir.outputs[0].root.id);
  assert.notEqual(ir.outputs[0].root.id, "slide");
  assert.ok(ir.consequences.some((entry) => entry.node === "slide" && entry.kind === "raster"));
});

test("roleless extraction rebases raster outsets and reports raster consequences", () => {
  const source = { version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "art", type: "rectangle", x: 150, y: 240, width: 100, height: 80, fill: "#123456", export: "image", effect: { type: "shadow", shadowType: "outer", blur: 12, spread: 2, offset: { x: 4, y: 6 } } },
  ] };
  const ir = buildExtractionIR(source, { nodeId: "art", scale: 2 });
  assert.equal(ir.outputs[0].width, 140);
  assert.equal(ir.outputs[0].height, 120);
  assert.deepEqual(ir.rasters[0].outset, { left: 16, top: 14, right: 24, bottom: 26 });
  assert.equal(ir.rasters[0].pixelWidth, 280);
  assert.equal(ir.rasters[0].pixelHeight, 240);
  assert.ok(ir.consequences.some((entry) => entry.node === "art" && entry.kind === "raster"));
  for (const scale of [0, -1, Infinity, NaN]) assert.throws(() => buildExtractionIR(source, { nodeId: "art", scale }), { code: "CANVAS_EXTRACTION_SCALE" });
});

test("SVG retains depth-first paint order across nested sibling indices", () => {
  const source = { version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "art", type: "frame", width: 100, height: 100, children: [
      { id: "back", type: "rectangle", width: 100, height: 100, fill: "#000000" },
      { id: "front", type: "frame", width: 100, height: 100, fill: "#ffffff", children: [
        { id: "detail", type: "rectangle", width: 10, height: 10, fill: "#123456" },
      ] },
    ] },
  ] };
  const ir = buildExtractionIR(source, { nodeId: "art" });
  const svg = exportSvg(ir, ir.outputs[0]);
  assert.ok(svg.indexOf('id="back"') < svg.indexOf('id="front"'));
  assert.ok(svg.indexOf('id="front"') < svg.indexOf('id="detail"'));
});

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
  assert.equal(raster.id, "slide");
  assert.equal(raster.ppi, 96);
});

test("node and paint blends retain the root backdrop in raster output", () => {
  for (const paintBlend of [false, true]) {
    const source = { module: "deck", children: [{ id: "slide", type: "frame", role: "slide", width: 300, height: 200,
      physical: { w: 3, h: 2, unit: "in" }, fill: "#FFFFFF", children: [
        { id: "backdrop", type: "rectangle", width: 200, height: 150, fill: "#F4A261" },
        { id: "blend", type: "rectangle", x: 50, y: 40, width: 150, height: 100,
          ...(paintBlend ? { fill: { type: "color", color: "#336699", blendMode: "multiply" } } : { fill: "#336699", blendMode: "multiply" }) },
      ],
    }] };
    const ir = buildExporterIR(source, { role: "slide", frames: ["slide"] });
    assert.deepEqual(ir.rasters.map(raster => raster.id), ["slide"]);
    assert.equal(ir.outputs[0].nodes.length, 1);
    assert.equal(ir.outputs[0].nodes[0].capability.verdict, "raster");
    assert.equal(ir.outputs[0].nodes[0].id, "slide");
  }
});

test("raster image wrappers do not reapply baked opacity, rotation or paint", () => {
  const source = { module: "generic", children: [{ id: "root", type: "frame", width: 300, height: 200, fill: "#FFFFFF", children: [
    { id: "image", type: "rectangle", x: 80, y: 70, width: 100, height: 50, fill: "#336699", opacity: 0.5, rotation: 30, export: "image" },
  ] }] };
  const ir = buildExtractionIR(source, { format: "svg", nodeId: "root" });
  const image = ir.outputs[0].nodes.find(node => node.id === "image");
  assert.equal(image.geometry.rotation, 0);
  assert.deepEqual(image.paint, { fill: null, stroke: null, effect: null, cornerRadius: null, opacity: 1, blendMode: "normal" });
  source.children[0].children[0].rotation = 90;
  const rotated = buildExtractionIR(source, { format: "svg", nodeId: "root" }).outputs[0].nodes.find(node => node.id === "image");
  assert.ok(Math.abs(rotated.geometry.w - 50) < 0.001);
  assert.ok(Math.abs(rotated.geometry.h - 100) < 0.001);
});

test("isolated compositing contexts bound raster scope and carry computed outsets", () => {
  const document = { version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", width: 1280, height: 720, children: [{ id: "outer", type: "frame", width: 500, height: 400, children: [{ id: "isolated", type: "frame", width: 300, height: 250, opacity: 0.8, children: [{ id: "blur", type: "rectangle", width: 100, height: 80, effect: { type: "background_blur", radius: 8 } }, { id: "mesh", type: "rectangle", y: 100, width: 100, height: 80, fill: { type: "mesh_gradient" } }] }] }] }] };
  document.children[0].physical = { w: 13.333, h: 7.5, unit: "in" };
  const [raster] = buildExporterIR(document, { role: "slide", frames: ["slide"] }).rasters;
  assert.equal(raster.id, "isolated");
  assert.equal(raster.ppi, 96);
  assert.ok(Object.values(raster.outset).every(Number.isFinite));
});
