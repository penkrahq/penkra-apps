import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import { decodePDFRawStream, PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";

import { buildExporterIR, buildExtractionIR } from "../src/exporter-ir.mjs";
import { readOoxmlPackage, readXmlPart } from "../src/ooxml-package.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";
import { exportPptx } from "../src/exporters/pptx.mjs";
import { exportSvg } from "../src/exporters/svg.mjs";
import { decodePng } from "../scripts/luna-extraction-artifact-fixtures.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
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
    { id: "stretch-fill", type: "rectangle", x: 145, y: 105, width: 25, height: 25, fill: { type: "image", mode: "stretch", url: "pixel.png" } },
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
  assert.match(svg, /<pattern id="fill-stretch-fill"[^>]*>[\s\S]*?preserveAspectRatio="none"/u);
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
  document.children[0].children.push({ id: "source-image", type: "ellipse", x: 125, y: 80, width: 30, height: 30, fill: { type: "image", mode: "fit", url: "pixel.png" }, stroke: { fill: "#000000", width: 2 } });
  document.children[0].children.push({ id: "pdf-gradient", type: "rectangle", x: 115, y: 15, width: 50, height: 35, fill: { type: "gradient", gradientType: "radial", center: { x: .3, y: .6 }, size: { width: .8, height: 1.2 }, colors: [{ color: "#000000", position: 0 }, { color: "#ffffff", position: 1 }] } });
  document.children[0].children.push({ id: "pdf-multi", type: "rectangle", x: 5, y: 105, width: 25, height: 25, fill: ["#ff0000", { color: "#00000080", blendMode: "multiply" }] });
  const ir = buildExtractionIR(document, { format: "pdf", nodeId: "art" });
  assert.equal(ir.rasters.length, 0);
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdf-icon-"));
  try {
    const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQw3WQAAAABJRU5ErkJggg==", "base64");
    const pdf = join(directory, "icon.pdf"); await writeFile(pdf, await exportPdf(ir, { imageData: () => imageBytes }));
    const parsed = await PDFDocument.load(await readFile(pdf));
    assert.ok(parsed.context.enumerateIndirectObjects().some(([, value]) => value?.dict?.get(PDFName.of("Subtype"))?.toString() === "/Image"));
    assert.ok(parsed.getPages()[0].node.Resources().get(PDFName.of("Shading")));
    const states = parsed.getPages()[0].node.Resources().lookup(PDFName.of("ExtGState"), PDFDict);
    assert.ok(states?.entries().some(([, value]) => parsed.context.lookup(value, PDFDict).get(PDFName.of("BM"))?.toString() === "/Multiply"));
    await execute("pdftoppm", ["-r", "192", "-singlefile", "-png", pdf, join(directory, "icon")], { timeout: 20_000, signal: context.signal });
    const { image, count } = darkPixels(await readFile(join(directory, "icon.png"))); assert.deepEqual([image.width, image.height], [480, 374]); assert.ok(count > 150, `dark pixels: ${count}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("PDF gradient shadings clip to ellipse, path and rounded geometry with stroke and radial CTM", { timeout: 30_000 }, async (context) => {
  const gradient = { type: "gradient", gradientType: "radial", center: { x: .3, y: .65 }, size: { width: .55, height: 1.25 }, rotation: 28, colors: [{ color: "#111111", position: 0 }, { color: "#eeeeee", position: 1 }] };
  const document = { version: "2.17", module: "generic", children: [{ id: "page", type: "frame", width: 180, height: 140, fill: "#ffffff", children: [
    { id: "ellipse-gradient", type: "ellipse", x: 10, y: 10, width: 55, height: 42, fill: gradient, stroke: { fill: "#ff0000", width: 3 } },
    { id: "path-gradient", type: "path", x: 80, y: 10, width: 60, height: 50, geometry: "M30 0 L60 50 L0 50 Z", viewBox: [0, 0, 60, 50], fill: gradient, stroke: { fill: "#008000", width: 3 } },
    { id: "rounded-gradient", type: "rectangle", x: 15, y: 75, width: 65, height: 48, cornerRadius: 14, fill: gradient, stroke: { fill: "#0000ff", width: 3 } },
  ] }] };
  const ir = buildExtractionIR(document, { format: "pdf", nodeId: "page" }); assert.equal(ir.rasters.length, 0);
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdf-gradients-"));
  try {
    const pdfPath = join(directory, "gradients.pdf"); await writeFile(pdfPath, await exportPdf(ir));
    await execute("pdftoppm", ["-r", "72", "-singlefile", "-png", pdfPath, join(directory, "pdf")], { timeout: 20_000, signal: context.signal });
    const actual = decodePng(await readFile(join(directory, "pdf.png"))); const [capture] = await takeDocumentScreenshots(document, [{ nodeIds: ["page"] }], new Map(), { scale: 1 }); const expected = decodePng(Buffer.from(capture.data, "base64"));
    const pixel = (image, x, y) => [...image.pixels.subarray((y * image.width + x) * image.channels, (y * image.width + x) * image.channels + 3)];
    // The resolved none-layout places the three siblings left-to-right at
    // x=0,55,115. These probes are strictly inside their bounding boxes but
    // outside the ellipse, triangle and rounded-corner masks.
    for (const [x, y] of [[3, 3], [52, 3], [58, 3], [112, 3], [118, 3]]) {
      assert.ok(pixel(expected, x, y).every((value) => value > 245), `Canvas definite exterior ${x},${y}`);
      assert.ok(pixel(actual, x, y).every((value) => value > 245), `PDF definite exterior ${x},${y}`);
    }
    for (const [x, y] of [[27, 21], [85, 35], [145, 24]]) {
      assert.ok(pixel(expected, x, y).some((value) => value < 235), `Canvas interior ${x},${y}`);
      assert.ok(pixel(actual, x, y).some((value) => value < 235), `PDF interior ${x},${y}`);
    }
    for (const [x, y, channel] of [[1, 21, 0], [85, 49, 1], [145, 1, 2]]) assert.ok(pixel(actual, x, y)[channel] > 100, `PDF stroke ${x},${y}`);
    const parsed = await PDFDocument.load(await readFile(pdfPath)); assert.ok(parsed.getPages()[0].node.Resources().get(PDFName.of("Shading")));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("PDF gradient stop alpha is a value-sensitive bounded raster lowering", () => {
  const document = structuredClone(generic); document.children[0].children.push(
    { id: "alpha-gradient", type: "ellipse", width: 20, height: 20, fill: { type: "gradient", gradientType: "linear", colors: [{ color: "#00000080", position: 0 }, { color: "#ffffff", position: 1 }] } },
    { id: "angular-gradient", type: "rectangle", width: 20, height: 20, fill: { type: "gradient", gradientType: "angular", colors: [{ color: "#000000", position: 0 }, { color: "#ffffff", position: 1 }] } },
    { id: "mesh-gradient", type: "rectangle", width: 20, height: 20, fill: { type: "mesh_gradient", patches: [] } },
    { id: "repeated-image", type: "rectangle", width: 20, height: 20, fill: { type: "image", mode: "repeat", url: "pixel.png" } },
  );
  const ir = buildExtractionIR(document, { format: "pdf", nodeId: "art" });
  assert.deepEqual(ir.rasters.map((item) => item.id), ["alpha-gradient", "angular-gradient", "mesh-gradient", "repeated-image"]);
  assert.match(ir.rasters.find((item) => item.id === "angular-gradient").reason, /no native conic\/angular shading primitive/u);
  assert.match(ir.rasters.find((item) => item.id === "repeated-image").reason, /image-pattern matrix/u);
});

test("PDF clips image fills to ellipse, path and rounded geometry and preserves their strokes", { timeout: 30_000 }, async (context) => {
  const document = { version: "2.17", module: "generic", children: [{ id: "page", type: "frame", width: 180, height: 60, fill: "#ffffff", children: [
    { id: "ellipse-image", type: "ellipse", width: 45, height: 45, fill: { type: "image", mode: "stretch", url: "pixel.png" }, stroke: { fill: "#000000", width: 3 } },
    { id: "path-image", type: "path", width: 45, height: 45, geometry: "M22.5 0 L45 45 L0 45 Z", viewBox: [0, 0, 45, 45], fill: { type: "image", mode: "fill", url: "pixel.png" }, stroke: { fill: "#000000", width: 3 } },
    { id: "rounded-image", type: "rectangle", width: 45, height: 45, cornerRadius: 12, fill: { type: "image", mode: "fit", url: "pixel.png" }, stroke: { fill: "#000000", width: 3 } },
  ] }] };
  const ir = buildExtractionIR(document, { format: "pdf", nodeId: "page" });
  const [ellipse, path, rounded] = ["ellipse-image", "path-image", "rounded-image"].map((id) => ir.outputs[0].nodes.find((node) => node.id === id));
  Object.assign(ellipse.geometry, { x: 5, y: 5 }); Object.assign(path.geometry, { x: 65, y: 5 }); Object.assign(rounded.geometry, { x: 125, y: 5 });
  const imageBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQw3WQAAAABJRU5ErkJggg==", "base64");
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdf-image-masks-"));
  try {
    const pdfPath = join(directory, "masks.pdf"); await writeFile(pdfPath, await exportPdf(ir, { imageData: () => imageBytes }));
    await execute("pdftoppm", ["-r", "72", "-singlefile", "-png", pdfPath, join(directory, "masks")], { timeout: 20_000, signal: context.signal });
    const rendered = decodePng(await readFile(join(directory, "masks.png")));
    const pixel = (x, y) => [...rendered.pixels.subarray((y * rendered.width + x) * rendered.channels, (y * rendered.width + x) * rendered.channels + 3)];
    for (const [x, y] of [[7, 7], [67, 7], [126, 6]]) assert.ok(pixel(x, y).every((value) => value > 245), `definite exterior ${x},${y}: ${pixel(x, y)}`);
    for (const [x, y] of [[27, 27], [87, 30], [147, 27]]) assert.ok(pixel(x, y).some((value) => value < 245), `image interior ${x},${y}`);
    for (const [x, y] of [[5, 27], [87, 49], [147, 5]]) assert.ok(pixel(x, y).every((value) => value < 80), `stroke ${x},${y}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("PDF emits safe annotations, language, decorations and ordered list markers and rejects unsafe links", { timeout: 30_000 }, async () => {
  const document = { version: "2.17", module: "generic", children: [{ id: "page", type: "frame", width: 180, height: 70, fill: "#ffffff", children: [{
    id: "text", type: "text", width: 140, height: 35, content: "Link Item", fontFamily: "Inter", fontSize: 18, fill: "#111111",
    paragraphs: [{ from: 0, to: 9, list: { kind: "ordered", start: 3 } }],
    marks: [{ type: "link", from: 0, to: 4, value: "https://example.test/" }, { type: "underline", from: 0, to: 4, value: true }, { type: "strikethrough", from: 5, to: 9, value: true }, { type: "lang", from: 0, to: 9, value: "en-US" }],
  }] }] };
  const fonts = { "Inter:400": await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url)) };
  const ir = buildExtractionIR(document, { format: "pdf", nodeId: "page" }); const text = ir.outputs[0].nodes.find((node) => node.id === "text"); Object.assign(text.geometry, { x: 30, y: 15 });
  const bytes = await exportPdf(ir, { fonts }); const parsed = await PDFDocument.load(bytes); const page = parsed.getPages()[0];
  const annotations = page.node.Annots(); assert.equal(annotations?.size(), 1);
  const annotation = parsed.context.lookup(annotations.get(0), PDFDict); const action = parsed.context.lookup(annotation.get(PDFName.of("A")), PDFDict);
  assert.equal(action.lookup(PDFName.of("URI")).decodeText(), "https://example.test/");
  const contents = page.node.Contents(); const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const operators = refs.map((ref) => new TextDecoder().decode(decodePDFRawStream(parsed.context.lookup(ref, PDFRawStream)).decode())).join("\n");
  assert.match(operators, /\/Lang \(en-US\)/u); assert.ok((operators.match(/\nS\n/gu) ?? []).length >= 2, operators);
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdf-text-semantics-"));
  try {
    const pdfPath = join(directory, "text.pdf"); await writeFile(pdfPath, bytes); await execute("pdftotext", [pdfPath, join(directory, "text.txt")]);
    assert.match(await readFile(join(directory, "text.txt"), "utf8"), /3\.\s*Link Item/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
  const unsafe = structuredClone(ir); unsafe.outputs[0].nodes.find((node) => node.id === "text").semantics.runs[0].link = "javascript:alert(1)";
  await assert.rejects(exportPdf(unsafe, { fonts }), { code: "CANVAS_EXPORT_LINK_UNSAFE" });
  const relative = structuredClone(ir); relative.outputs[0].nodes.find((node) => node.id === "text").semantics.runs[0].link = "../guide";
  await assert.doesNotReject(exportPdf(relative, { fonts }));
});

test("PPTX icons and promoted DrawingML features survive LibreOffice rendering", { timeout: 60_000 }, async (context) => {
  const document = { ...structuredClone(generic), module: "deck" }; const frame = document.children[0]; frame.role = "slide"; frame.physical = { w: 1.875, h: 1.458333, unit: "in" };
  frame.children.push({ id: "stroke", type: "rectangle", x: 115, y: 25, width: 45, height: 45, fill: "#ff0000", stroke: { fill: "#0000ff", width: 3, cap: "round", join: "bevel", dash: [3, 2] }, effect: { type: "blur", blur: 1 } });
  frame.children.push({ id: "native-image", type: "rectangle", x: 120, y: 85, width: 30, height: 30, fill: { type: "image", mode: "fill", url: "pixel" }, stroke: { fill: "#000000", width: 2 } });
  frame.children.push({ id: "stretch-image", type: "rectangle", x: 90, y: 85, width: 20, height: 30, fill: { type: "image", mode: "stretch", url: "pixel" } });
  frame.children.push({ id: "masked-image", type: "ellipse", x: 145, y: 85, width: 20, height: 20, fill: { type: "image", mode: "fit", url: "pixel" }, stroke: { fill: "#000000", width: 2 } });
  frame.children.push({ id: "multi-paint", type: "rectangle", x: 145, y: 110, width: 20, height: 20, fill: ["#ff0000", "#00000080"] });
  frame.children.push({ id: "gradient", type: "rectangle", x: 10, y: 115, width: 60, height: 20, fill: { type: "gradient", gradientType: "radial", center: { x: .35, y: .6 }, size: { width: .7, height: .8 }, colors: [{ color: "#ff0000", position: 0 }, { color: "#0000ff", position: 1 }] } });
  frame.children.push({ id: "aligned", type: "text", x: 75, y: 105, width: 65, height: 30, content: "Aligned", fontFamily: "Inter", fontSize: 12, lineHeight: 16, textAlign: "center", textAlignVertical: "bottom", paragraphs: [{ from: 0, to: 7, align: "center" }], marks: [] });
  frame.children.push({ id: "links", type: "text", x: 0, y: 0, width: 80, height: 15, content: "Safe Mail", fontFamily: "Inter", fontSize: 8, paragraphs: [{ from: 0, to: 9 }], marks: [{ type: "link", from: 0, to: 4, value: "https://example.test/" }, { type: "link", from: 5, to: 9, value: "mailto:test@example.test" }] });
  const ir = buildExporterIR(document, { role: "slide", frames: ["art"] }); assert.deepEqual(ir.rasters.map((item) => item.id), ["masked-image"]);
  const imageData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQw3WQAAAABJRU5ErkJggg==";
  const regular = await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
  const unsafeIr = structuredClone(ir); unsafeIr.outputs[0].nodes.find((node) => node.id === "links").semantics.runs[0].link = "javascript:alert(1)";
  await assert.rejects(exportPptx(unsafeIr, { imageData: () => imageData, rasterize: async () => ({ data: imageData }), fonts: [{ typeface: "Inter", faces: { regular } }] }), { code: "CANVAS_EXPORT_LINK_UNSAFE" });
  const bytes = await exportPptx(ir, { imageData: () => imageData, rasterize: async () => ({ data: imageData }), fonts: [{ typeface: "Inter", faces: { regular } }] }); const parts = readOoxmlPackage(bytes); const xml = readXmlPart(parts, "ppt/slides/slide1.xml"); const rels = readXmlPart(parts, "ppt/slides/_rels/slide1.xml.rels");
  assert.match(xml, /name="native-icon"[\s\S]*?<a:custGeom>/u); assert.equal((xml.match(/<p:pic>/gu) ?? []).length, 3); assert.match(xml, /<a:srcRect/u); assert.match(xml, /name="native-image:stroke"/u); const stretchPicture = (xml.match(/<p:pic>[\s\S]*?<\/p:pic>/gu) ?? []).find((part) => part.includes('name="stretch-image"')); assert.ok(stretchPicture); assert.doesNotMatch(stretchPicture, /<a:srcRect/u); assert.match(xml, /name="multi-paint:paint:0"/u); assert.match(xml, /name="multi-paint:paint:1"/u); assert.match(xml, /<a:blur\b/u); assert.match(xml, /<a:custDash>/u); assert.match(xml, /<a:bevel\/>/u);
  assert.match(xml, /<a:fillToRect l="0" t="(?:19999|20000)" r="30000" b="0"\/>/u); assert.match(xml, /anchor="b"/u); assert.match(xml, /algn="ctr"/u); assert.match(xml, /<a:lnSpc><a:spcPts val="1200"\/>/u);
  assert.match(rels, /Target="https:\/\/example\.test\/"/u); assert.match(rels, /Target="mailto:test@example\.test"/u); assert.doesNotMatch(rels, /javascript:/iu);
  const directory = await mkdtemp(join(tmpdir(), "canvas-pptx-native-"));
  try {
    const input = join(directory, "native.pptx"); const output = join(directory, "rendered"); await mkdir(output); await writeFile(input, bytes);
    await execute("/opt/homebrew/bin/soffice", ["--headless", "--convert-to", "pdf", "--outdir", output, input], { timeout: 30_000, signal: context.signal });
    const pdf = join(output, "native.pdf"); await execute("pdftoppm", ["-r", "192", "-singlefile", "-png", pdf, join(directory, "native")], { timeout: 20_000, signal: context.signal });
    const { image, count } = darkPixels(await readFile(join(directory, "native.png"))); assert.ok(image.width >= 350 && image.height >= 270); assert.ok(count > 100, `dark pixels: ${count}`);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
