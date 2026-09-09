import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";

import { buildExporterIR, buildExtractionIR } from "../src/exporter-ir.mjs";
import { readOoxmlPackage, readXmlPart } from "../src/ooxml-package.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";
import { exportPptx } from "../src/exporters/pptx.mjs";
import { exportSvg } from "../src/exporters/svg.mjs";
import { decodePng } from "../scripts/luna-extraction-artifact-fixtures.mjs";
import { openBrowser } from "./browser-fixture.mjs";

const execute = promisify(execFile);
const icon = { id: "native-icon", type: "icon", x: 30, y: 30, width: 80, height: 80, library: "lucide", icon: "check", weight: 400, fill: "#111111" };
const generic = { version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{
  id: "art", type: "frame", width: 180, height: 140, layout: "none", fill: "#ffffff", children: [icon],
}] };

function darkPixels(bytes) {
  const image = decodePng(bytes); let count = 0;
  for (let offset = 0; offset < image.pixels.length; offset += image.channels) if (image.pixels[offset] < 80 && image.pixels[offset + 1] < 80 && image.pixels[offset + 2] < 80) count += 1;
  return { image, count };
}

test("standalone SVG emits and Chromium renders native icon, gradient, filter, clip, flip, dash and link features", { timeout: 60_000 }, async (context) => {
  const document = structuredClone(generic);
  document.children[0].overflow = "clip";
  document.children[0].children.push(
    { id: "gradient", type: "rectangle", x: 100, y: 10, width: 100, height: 50, flipX: true, fill: { type: "gradient", gradientType: "linear", rotation: 25, center: { x: .4, y: .5 }, size: { width: .7, height: 1 }, colors: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1 }] }, effect: { type: "blur", blur: 2 } },
    { id: "line", type: "line", x: 20, y: 120, width: 130, height: 0, stroke: { fill: "#008000", width: 5, cap: "round", join: "bevel", dash: [8, 4] } },
    { id: "link", type: "text", x: 115, y: 75, width: 60, height: 30, content: "Link", fontSize: 18, marks: [{ type: "link", from: 0, to: 4, value: "https://example.test/" }], paragraphs: [{ from: 0, to: 4, headingLevel: 2 }], landmark: "region", linkName: "Example" },
    { id: "image-fill", type: "ellipse", x: 145, y: 105, width: 25, height: 25, fill: { type: "image", mode: "fill", url: "pixel.png" } },
    { id: "radial", type: "rectangle", x: 5, y: 5, width: 20, height: 20, fill: { type: "gradient", gradientType: "radial", center: { x: .25, y: .7 }, size: { width: .6, height: 1.3 }, rotation: 31, colors: [{ color: "#000000", position: 0 }, { color: "#ffffff", position: 1 }] } },
    { id: "multi", type: "rectangle", x: 5, y: 35, width: 20, height: 20, fill: ["#ff0000", "#00000080"] },
    { id: "aligned-list", type: "text", x: 60, y: 70, width: 70, height: 45, content: "Item", fontSize: 12, lineHeight: 18, textAlign: "center", textAlignVertical: "bottom", textGrowth: "fixed-width-height", paragraphs: [{ from: 0, to: 4, align: "center", list: { kind: "bullet" } }], marks: [] },
  );
  const ir = buildExtractionIR(document, { format: "svg", nodeId: "art" });
  assert.equal(ir.rasters.length, 0);
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQw3WQAAAABJRU5ErkJggg==";
  const svg = exportSvg(ir, ir.outputs[0], { imageHref: () => pixel });
  assert.match(svg, /<linearGradient\b/u); assert.match(svg, /<feGaussianBlur\b/u); assert.match(svg, /<clipPath\b/u);
  assert.match(svg, /scale\(-1 1\)/u); assert.match(svg, /stroke-dasharray="8 4"/u); assert.match(svg, /<a href="https:\/\/example\.test\/"/u);
  assert.match(svg, /role="region"/u); assert.match(svg, /aria-level="2"/u); assert.doesNotMatch(svg, /<image\b[^>]*id=/u);
  assert.match(svg, /<pattern id="fill-image-fill"[\s\S]*?<image href="data:image\/png;base64,/u);
  assert.match(svg, /<pattern id="fill-image-fill"[^>]*>[\s\S]*?<image[^>]*width="1" height="1"/u);
  assert.match(svg, /gradientTransform="translate\(0\.25 0\.7\) rotate\(31\) scale\(0\.6 1\.3\) translate\(-0\.25 -0\.7\)"/u);
  assert.match(svg, /id="multi-paint-0"/u); assert.match(svg, /id="multi-paint-1"/u);
  assert.match(svg, /id="aligned-list"[\s\S]*?x="95" y="109" text-anchor="middle">• /u);
  const directory = await mkdtemp(join(tmpdir(), "canvas-svg-native-")); let browser;
  try {
    const path = join(directory, "native.svg"); await writeFile(path, svg);
    browser = await openBrowser(join(directory, "chrome"), context.signal);
    const rendered = await browser.screenshot(pathToFileURL(path).href, 180, 140, 2);
    const { image, count } = darkPixels(rendered); assert.deepEqual([image.width, image.height], [360, 280]); assert.ok(count > 250, `dark pixels: ${count}`);
  } finally { await browser?.close(); await rm(directory, { recursive: true, force: true }); }
});

test("PDF keeps icons native, embeds source images, and Poppler renders transformed geometry", { timeout: 30_000 }, async (context) => {
  const document = structuredClone(generic); Object.assign(document.children[0].children[0], { width: 100, height: 50, rotation: 25, flipX: true });
  document.children[0].children.push({ id: "source-image", type: "rectangle", x: 125, y: 80, width: 30, height: 30, fill: { type: "image", mode: "fit", url: "pixel.png" } });
  document.children[0].children.push({ id: "pdf-gradient", type: "rectangle", x: 115, y: 15, width: 50, height: 35, fill: { type: "gradient", gradientType: "radial", center: { x: .3, y: .6 }, size: { width: .8, height: 1.2 }, colors: [{ color: "#000000", position: 0 }, { color: "#ffffff", position: 1 }] } });
  document.children[0].children.push({ id: "pdf-multi", type: "rectangle", x: 5, y: 105, width: 25, height: 25, fill: ["#ff0000", "#00000080"] });
  const ir = buildExtractionIR(document, { format: "pdf", nodeId: "art" });
  assert.equal(ir.rasters.length, 0);
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdf-icon-"));
  try {
    const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQw3WQAAAABJRU5ErkJggg==", "base64");
    const pdf = join(directory, "icon.pdf"); await writeFile(pdf, await exportPdf(ir, { imageData: () => imageBytes }));
    const parsed = await PDFDocument.load(await readFile(pdf));
    assert.ok(parsed.context.enumerateIndirectObjects().some(([, value]) => value?.dict?.get(PDFName.of("Subtype"))?.toString() === "/Image"));
    assert.ok(parsed.getPages()[0].node.Resources().get(PDFName.of("Shading")));
    await execute("pdftoppm", ["-r", "192", "-singlefile", "-png", pdf, join(directory, "icon")], { timeout: 20_000, signal: context.signal });
    const { image, count } = darkPixels(await readFile(join(directory, "icon.png"))); assert.deepEqual([image.width, image.height], [480, 374]); assert.ok(count > 150, `dark pixels: ${count}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("PPTX icons and promoted DrawingML features survive LibreOffice rendering", { timeout: 60_000 }, async (context) => {
  const document = { ...structuredClone(generic), module: "deck" }; const frame = document.children[0]; frame.role = "slide"; frame.physical = { w: 1.875, h: 1.458333, unit: "in" };
  frame.children.push({ id: "stroke", type: "rectangle", x: 115, y: 25, width: 45, height: 45, fill: "#ff0000", stroke: { fill: "#0000ff", width: 3, cap: "round", join: "bevel", dash: [3, 2] }, effect: { type: "blur", blur: 1 } });
  frame.children.push({ id: "native-image", type: "rectangle", x: 120, y: 85, width: 30, height: 30, fill: { type: "image", mode: "fill", url: "pixel" } });
  frame.children.push({ id: "masked-image", type: "ellipse", x: 145, y: 85, width: 20, height: 20, fill: { type: "image", mode: "fit", url: "pixel" }, stroke: { fill: "#000000", width: 2 } });
  frame.children.push({ id: "multi-paint", type: "rectangle", x: 145, y: 110, width: 20, height: 20, fill: ["#ff0000", "#00000080"] });
  frame.children.push({ id: "gradient", type: "rectangle", x: 10, y: 115, width: 60, height: 20, fill: { type: "gradient", gradientType: "radial", center: { x: .35, y: .6 }, size: { width: .7, height: .8 }, colors: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1 }] } });
  frame.children.push({ id: "aligned", type: "text", x: 75, y: 105, width: 65, height: 30, content: "Aligned", fontFamily: "Inter", fontSize: 12, lineHeight: 16, textAlign: "center", textAlignVertical: "bottom", paragraphs: [{ from: 0, to: 7, align: "center" }], marks: [] });
  const ir = buildExporterIR(document, { role: "slide", frames: ["art"] }); assert.deepEqual(ir.rasters.map((item) => item.id), ["masked-image"]);
  const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQw3WQAAAABJRU5ErkJggg==";
  const regular = await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
  const bytes = await exportPptx(ir, { imageData: () => imageData, rasterize: async () => ({ data: imageData }), fonts: [{ typeface: "Inter", faces: { regular } }] }); const xml = readXmlPart(readOoxmlPackage(bytes), "ppt/slides/slide1.xml");
  assert.match(xml, /name="native-icon"[\s\S]*?<a:custGeom>/u); assert.equal((xml.match(/<p:pic>/gu) ?? []).length, 2); assert.match(xml, /<a:srcRect/u); assert.match(xml, /name="multi-paint:paint:0"/u); assert.match(xml, /name="multi-paint:paint:1"/u); assert.match(xml, /<a:blur\b/u); assert.match(xml, /<a:custDash>/u); assert.match(xml, /<a:bevel\/>/u);
  assert.match(xml, /<a:fillToRect l="0" t="(?:19999|20000)" r="30000" b="0"\/>/u); assert.match(xml, /anchor="b"/u); assert.match(xml, /algn="ctr"/u); assert.match(xml, /<a:lnSpc><a:spcPts val="1200"\/>/u);
  const directory = await mkdtemp(join(tmpdir(), "canvas-pptx-native-"));
  try {
    const input = join(directory, "native.pptx"); const output = join(directory, "rendered"); await mkdir(output); await writeFile(input, bytes);
    await execute("/opt/homebrew/bin/soffice", ["--headless", "--convert-to", "pdf", "--outdir", output, input], { timeout: 30_000, signal: context.signal });
    const pdf = join(output, "native.pdf"); await execute("pdftoppm", ["-r", "192", "-singlefile", "-png", pdf, join(directory, "native")], { timeout: 20_000, signal: context.signal });
    const { image, count } = darkPixels(await readFile(join(directory, "native.png"))); assert.ok(image.width >= 350 && image.height >= 270); assert.ok(count > 100, `dark pixels: ${count}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
