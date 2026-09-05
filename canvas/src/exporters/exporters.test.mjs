import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { buildCapabilityVerificationIR, buildExporterIR } from "../exporter-ir.mjs";
import { readOoxmlPackage, readXmlPart } from "../ooxml-package.mjs";
import { exportPptx } from "./pptx.mjs";
import { exportPdf } from "./pdf.mjs";
import { exportWeb } from "./web.mjs";
import { exportCompose, exportSwiftUI } from "./mobile.mjs";
import { exportSvg } from "./svg.mjs";

const document = { version: "2.15", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", name: "Title", width: 1280, height: 720, layout: "none", children: [{ id: "title", type: "text", x: 80, y: 60, width: 600, height: 80, content: "Editable title", fontFamily: "Inter", fontSize: 48, paragraphs: [{ from: 0, to: 14, headingLevel: 1 }], marks: [{ type: "weight", from: 0, to: 8, value: 700 }], description: "Deck title" }, { id: "box", type: "rectangle", x: 80, y: 180, width: 300, height: 120, fill: "#123456", effect: { type: "shadow", shadowType: "outer", color: "#00000055", offset: { x: 4, y: 6 }, blur: 12 } }] }] };
const interRegular = await readFile(new URL("../../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
const interBold = await readFile(new URL("../../vendor/open-pencil/fonts/Inter-Bold.ttf", import.meta.url));
document.children[0].physical = { w: 13.333, h: 7.5, unit: "in" };
const exportDeck = (ir) => exportPptx(ir, { fonts: [{ typeface: "Inter", faces: { regular: interRegular, bold: interBold } }] });

test("PPTX contains editable DrawingML text and native shapes", async () => {
  const bytes = await exportDeck(buildExporterIR(document, { role: "slide", frames: ["slide"] }));
  const parts = readOoxmlPackage(bytes);
  const xml = readXmlPart(parts, "ppt/slides/slide1.xml");
  assert.match(xml, /<a:t>Editable<\/a:t>/u);
  assert.match(xml, /<a:t> title<\/a:t>/u);
  assert.match(xml, /<a:outerShdw\b/u);
  assert.match(xml, /name="title"[^>]*descr="Deck title"/u);
  assert.doesNotMatch(xml, /<p:pic>/u);
});

test("PPTX emits speaker notes while flow lowering remains deferred", async () => {
  const deck = structuredClone(document);
  deck.children.push(
    { id: "slide-2", type: "frame", role: "slide", name: "Second", x: 1400, width: 1280, height: 720, children: [] },
    { id: "slide-notes", type: "text", notesFor: "slide", x: 0, y: 800, width: 600, height: 80, content: "Say this aloud.", paragraphs: [{ from: 0, to: 15 }], marks: [] },
  );
  deck.children.find((node) => node.id === "slide-2").physical = { w: 13.333, h: 7.5, unit: "in" };
  const bytes = await exportDeck(buildExporterIR(deck, { role: "slide", frames: ["slide", "slide-2"] }));
  const parts = readOoxmlPackage(bytes);
  assert.doesNotMatch(readXmlPart(parts, "ppt/slides/slide1.xml"), /hlinkClick/u);
  assert.match(readXmlPart(parts, "ppt/notesSlides/notesSlide1.xml"), /Say this aloud\./u);
});

test("PPTX emits paragraph bullets with native hanging indentation", async () => {
  const deck = structuredClone(document);
  deck.children[0].children.push({ id: "list", type: "text", x: 500, y: 180, width: 500, height: 180, content: "First\nSecond", fontFamily: "Inter", fontSize: 24, marks: [], paragraphs: [{ from: 0, to: 6, list: { kind: "bullet", level: 0 } }, { from: 6, to: 12, list: { kind: "number", level: 1 } }] });
  const bytes = await exportDeck(buildExporterIR(deck, { role: "slide", frames: ["slide"] }));
  const xml = readXmlPart(readOoxmlPackage(bytes), "ppt/slides/slide1.xml");
  assert.match(xml, /<a:buChar char="&#x2022;"\/>/u);
  assert.match(xml, /<a:buAutoNum type="arabicPeriod"/u);
  assert.match(xml, /marL="(228600|457200)" indent="-(228600|457200)"/u);
});

test("PPTX emits measured DrawingML linear and radial gradients for the native subset", async () => {
  const deck = structuredClone(document);
  deck.children[0].children.push(
    { id: "linear", type: "rectangle", x: 500, y: 400, width: 200, height: 100, fill: { type: "gradient", gradientType: "linear", rotation: 45, colors: [{ color: "#FF0000", position: 0 }, { color: "#0000FF", position: 1 }] } },
    { id: "radial", type: "ellipse", x: 750, y: 400, width: 200, height: 100, fill: { type: "gradient", gradientType: "radial", colors: [{ color: "#FFFFFF", position: 0 }, { color: "#000000", position: 1 }] } },
  );
  const ir = buildExporterIR(deck, { role: "slide", frames: ["slide"] });
  assert.equal(ir.rasters.length, 0);
  const xml = readXmlPart(readOoxmlPackage(await exportDeck(ir)), "ppt/slides/slide1.xml");
  assert.match(xml, /name="linear"[\s\S]*?<a:gradFill[\s\S]*?<a:lin ang="2700000"/u);
  assert.match(xml, /name="radial"[\s\S]*?<a:gradFill[\s\S]*?<a:path path="circle"/u);
});

test("PDF output has the declared A4 physical dimensions", async () => {
  const pageDocument = structuredClone(document); pageDocument.module = "print"; pageDocument.children[0].role = "page"; pageDocument.children[0].size = "a4"; pageDocument.children[0].width = 794; pageDocument.children[0].height = 1123;
  pageDocument.children[0].physical = { w: 210, h: 297, unit: "mm" };
  pageDocument.children[0].bleed = 0;
  pageDocument.children[0].children[1].effect = undefined;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQw3WQAAAABJRU5ErkJggg==", "base64");
  const outputIntent = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
  const bytes = await exportPdf(buildExporterIR(pageDocument, { role: "page", frames: ["slide"] }), { outputIntent, fonts: { "Inter:400": interRegular }, rasterizeNode: async () => png });
  const pdf = await PDFDocument.load(bytes); const [page] = pdf.getPages();
  assert.ok(Math.abs(page.getWidth() - 595.276) < 0.01);
  assert.ok(Math.abs(page.getHeight() - 841.89) < 0.01);
  assert.ok(pdf.catalog.lookup(PDFName.of("OutputIntents")));
  assert.ok(pdf.context.enumerateIndirectObjects().some(([, object]) => object?.has?.(PDFName.of("FontFile2"))));
});

test("PDF bleed expands the medium while preserving the declared trim box", async () => {
  const pageDocument = structuredClone(document);
  Object.assign(pageDocument, { module: "print" });
  Object.assign(pageDocument.children[0], {
    role: "page", size: "a4", width: 794, height: 1123,
    physical: { w: 210, h: 297, unit: "mm" }, bleed: 9, folds: [397],
  });
  pageDocument.children[0].children[1].effect = undefined;
  const outputIntent = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
  const bytes = await exportPdf(buildExporterIR(pageDocument, { role: "page", frames: ["slide"] }), {
    outputIntent, fonts: { "Inter:400": interRegular },
  });
  const pdf = await PDFDocument.load(bytes); const [page] = pdf.getPages();
  const media = page.getMediaBox();
  assert.ok(Math.abs(media.width - 613.2755905511812) < 0.001 && Math.abs(media.height - 859.8897637795277) < 0.001);
  assert.deepEqual(page.getCropBox(), page.getMediaBox());
  assert.deepEqual(page.getBleedBox(), page.getMediaBox());
  const trim = page.getTrimBox();
  assert.ok(Math.abs(trim.x - 9) < 0.001 && Math.abs(trim.y - 9) < 0.001);
  assert.ok(Math.abs(trim.width - 595.2755905511812) < 0.001 && Math.abs(trim.height - 841.8897637795277) < 0.001);
  assert.equal(page.node.has(PDFName.of("ArtBox")), false);
});

test("web source retains semantic constructs and accessibility", () => {
  const route = structuredClone(document); route.module = "web"; route.children[0].role = "route";
  route.axes = { appearance: { modes: [{ name: "light" }, { name: "dark", media: "prefers-color-scheme: dark" }] }, viewport: { modes: [{ name: "mobile", minWidth: 0 }, { name: "wide", minWidth: 900 }] }, interaction: { modes: [{ name: "default" }, { name: "hover", selector: ":hover" }] } };
  route.children[0].children[1] = { ...route.children[0].children[1], type: "frame", effect: undefined, layout: "grid", gridTemplateColumns: ["1fr", "2fr"], fill: [{ value: "#123456" }, { value: "#000000", when: { appearance: "dark" } }], gap: [{ value: 8 }, { value: 24, when: { viewport: "wide" } }, { value: 32, when: { interaction: "hover" } }], children: [] };
  const webIr = buildExporterIR(route, { role: "route", frames: ["slide"] }); const files = exportWeb(webIr, { rasterHref: (id) => `assets/${id}.png` });
  assert.match(files.get("styles.css"), /prefers-color-scheme/u); assert.match(files.get("styles.css"), /min-width: 900px/u); assert.match(files.get("styles.css"), /#box:hover/u); assert.match(files.get("title.html"), /canvas-grid/u); assert.match(files.get("title.html"), /grid-template-columns:1fr 2fr/u); assert.match(files.get("title.html"), /<h1/u); assert.match(files.get("title.html"), /aria-label="Deck title"/u);
});

test("mobile grid remains verification-only until UI snapshots exist", () => {
  const route = structuredClone(document); route.module = "mobile"; route.children[0].role = "ios";
  route.children[0].children[1] = { ...route.children[0].children[1], type: "frame", effect: undefined, layout: "grid", gridTemplateColumns: ["1fr", "2fr"], children: [] };
  assert.throws(() => buildExporterIR(route, { role: "ios", frames: ["slide"] }), (error) => error.code === "CANVAS_CAPABILITY_UNVERIFIED");
  const assumed = ["root.axes", "nodes.frame", "nodes.text", "properties.layout", "properties.gridTemplateColumns", "properties.fill", "properties.fill.solid", "properties.accessibility.description", "properties.content", "properties.fontFamily", "properties.fontSize", "properties.marks", "properties.paragraphs", "properties.text.paragraph.headingLevel", "properties.text.run.fontFamily", "properties.text.run.fontSize", "properties.text.run.weight", "properties.fontWeight"];
  const iosFiles = exportSwiftUI(buildCapabilityVerificationIR(route, { role: "ios", frames: ["slide"] }, assumed));
  assert.match(iosFiles.get("Title.swift"), /LazyVGrid/u);
  const android = structuredClone(route); android.children[0].role = "android";
  const androidFiles = exportCompose(buildCapabilityVerificationIR(android, { role: "android", frames: ["slide"] }, assumed));
  assert.match(androidFiles.get("Title.kt"), /LazyVerticalGrid/u);
});

test("SVG remains vector for native text and shapes", () => {
  const ir = buildExporterIR(document, { role: "slide", frames: ["slide"] }); const svg = exportSvg(ir, ir.outputs[0]);
  assert.match(svg, /<text/u); assert.match(svg, /<rect/u); assert.doesNotMatch(svg, /<image/u);
});
