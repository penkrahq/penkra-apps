import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { buildExporterIR, buildExtractionIR, buildCapabilityVerificationIR } from "../exporter-ir.mjs";
import { capabilityPathInventory } from "../canvas-schema.mjs";
import { readOoxmlPackage, readXmlPart } from "../ooxml-package.mjs";
import { exportPptx } from "./pptx.mjs";
import { exportPdf } from "./pdf.mjs";
import { exportWeb } from "./web.mjs";
import { exportCompose, exportSwiftUI } from "./mobile.mjs";
import { exportSvg } from "./svg.mjs";

test("SwiftUI container descriptions retain descendant accessibility labels", () => {
  const doc = { version: "2.17", module: "mobile", children: [{ id: "screen", name: "Nested Screen", type: "frame", role: "ios", width: 300, height: 200, children: [
    { id: "group", type: "frame", width: 200, height: 100, description: "Group label", children: [{ id: "child", type: "rectangle", width: 30, height: 30, description: "Child label" }] },
  ] }] };
  const files = exportSwiftUI(buildCapabilityVerificationIR(doc, { role: "ios", frames: ["screen"] }, capabilityPathInventory()));
  const swift = files.get("NestedScreen.swift");
  assert.match(swift, /\.accessibilityElement\(children: \.contain\)\.accessibilityLabel\("Group label"\)/u);
  assert.match(swift, /\.accessibilityLabel\("Child label"\)/u);
});

test("mobile rectangles and container backgrounds preserve independent corner geometry", () => {
  const doc = { version: "2.17", module: "mobile", children: [{ id: "screen", name: "Corner Screen", type: "frame", role: "ios", width: 300, height: 200, cornerRadius: [10, 20, 30, 40], fill: "#123456", children: [
    { id: "shape", type: "rectangle", width: 100, height: 60, cornerRadius: [0, 10, 20, 30], fill: "#654321" },
  ] }] };
  const make = (role) => { doc.children[0].role = role; return buildCapabilityVerificationIR(doc, { role, frames: ["screen"] }, capabilityPathInventory()); };
  const swift = exportSwiftUI(make("ios")).get("CornerScreen.swift");
  assert.match(swift, /\.background\(alignment: \.topLeading\) \{ Path/u);
  assert.equal((swift.match(/path\.addCurve\(/gu) ?? []).length, 7);
  assert.doesNotMatch(swift, /NaN|Infinity/u);
  const kotlin = exportCompose(make("android")).get("CornerScreen.kt");
  assert.equal((kotlin.match(/GenericShape \{/gu) ?? []).length, 2);
  assert.equal((kotlin.match(/cubicTo\(/gu) ?? []).length, 7);
  assert.doesNotMatch(kotlin, /NaN|Infinity/u);
});

test("mobile layouts use independent row and column gap overrides", () => {
  const doc = { version: "2.17", module: "mobile", children: [{ id: "screen", name: "Gap Screen", type: "frame", role: "ios", width: 300, height: 600, layout: "vertical", children: ["horizontal", "vertical", "grid", "wrap"].map((kind) => ({
    id: kind, type: "frame", width: 300, height: 100, layout: kind === "wrap" ? "horizontal" : kind, wrap: kind === "wrap", gridTemplateColumns: kind === "grid" ? [140, 140] : undefined, gap: 7, rowGap: 25, columnGap: 30,
    children: [{ id: `${kind}-child`, type: "rectangle", width: 40, height: 30, fill: "#123456" }],
  })) }] };
  const make = (role) => { doc.children[0].role = role; return buildCapabilityVerificationIR(doc, { role, frames: ["screen"] }, capabilityPathInventory()); };
  const swift = [...exportSwiftUI(make("ios")).values()].join("\n");
  assert.match(swift, /HStack\(alignment: \.top, spacing: 30\)/u);
  assert.match(swift, /VStack\(alignment: \.leading, spacing: 25\)/u);
  assert.match(swift, /FlowLayout\(spacing: 30, rowSpacing: 25\)/u);
  assert.match(swift, /GridItem\(\.flexible\(\), spacing: 30\), count: 2\), spacing: 25/u);
  const kotlin = [...exportCompose(make("android")).values()].join("\n");
  assert.match(kotlin, /horizontalArrangement = Arrangement\.spacedBy\(30\.dp\)/u);
  assert.match(kotlin, /verticalArrangement = Arrangement\.spacedBy\(25\.dp\)/u);
});

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
  const pageDocument = structuredClone(document); pageDocument.module = "generic"; delete pageDocument.children[0].role; pageDocument.children[0].size = "a4"; pageDocument.children[0].width = 794; pageDocument.children[0].height = 1123;
  pageDocument.children[0].physical = { w: 210, h: 297, unit: "mm" };
  pageDocument.children[0].bleed = 0;
  pageDocument.children[0].children[1].effect = undefined;
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lQw3WQAAAABJRU5ErkJggg==", "base64");
  const outputIntent = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
  const bytes = await exportPdf(buildExtractionIR(pageDocument, { format: "pdf", nodeId: "slide" }), { outputIntent, fonts: { "Inter:400": interRegular }, rasterizeNode: async () => png });
  const pdf = await PDFDocument.load(bytes); const [page] = pdf.getPages();
  assert.ok(Math.abs(page.getWidth() - 595.276) < 0.01);
  assert.ok(Math.abs(page.getHeight() - 841.89) < 0.01);
  assert.ok(pdf.catalog.lookup(PDFName.of("OutputIntents")));
  assert.ok(pdf.context.enumerateIndirectObjects().some(([, object]) => object?.has?.(PDFName.of("FontFile2"))));
});

test("PDF bleed expands the medium while preserving the declared trim box", async () => {
  const pageDocument = structuredClone(document);
  Object.assign(pageDocument, { module: "generic" });
  delete pageDocument.children[0].role;
  Object.assign(pageDocument.children[0], {
    size: "a4", width: 794, height: 1123,
    physical: { w: 210, h: 297, unit: "mm" }, bleed: 9, folds: [397],
  });
  pageDocument.children[0].children[1].effect = undefined;
  const outputIntent = await readFile(new URL("../../assets/color/sRGB2014.icc", import.meta.url));
  const bytes = await exportPdf(buildExtractionIR(pageDocument, { format: "pdf", nodeId: "slide" }), {
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

test("PDF accepts arbitrary declared millimetre sizes without a paper-name whitelist", async () => {
  const source = { version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "poster", type: "frame", width: 841, height: 1189, physical: { w: 841, h: 1189, unit: "mm" }, bleed: 0, children: [] },
  ] };
  const bytes = await exportPdf(buildExtractionIR(source, { format: "pdf", nodeId: "poster" }), { fonts: {} });
  const [page] = (await PDFDocument.load(bytes)).getPages();
  assert.ok(Math.abs(page.getWidth() - 841 * 72 / 25.4) < 0.001);
  assert.ok(Math.abs(page.getHeight() - 1189 * 72 / 25.4) < 0.001);
});

test("web source retains semantic constructs and accessibility", () => {
  const route = structuredClone(document); route.module = "web"; route.children[0].role = "route";
  route.axes = { appearance: { modes: [{ name: "light" }, { name: "dark", media: "prefers-color-scheme: dark" }] }, viewport: { modes: [{ name: "mobile", minWidth: 0 }, { name: "wide", minWidth: 900 }] } };
  route.children[0].children[1] = { ...route.children[0].children[1], type: "frame", effect: undefined, layout: "grid", gridTemplateColumns: ["1fr", "2fr"], fill: [{ value: "#123456" }, { value: "#000000", when: { appearance: "dark" } }], gap: [{ value: 8 }, { value: 24, when: { viewport: "wide" } }], children: [] };
  const webIr = buildExporterIR(route, { role: "route", frames: ["slide"] }); const files = exportWeb(webIr, { rasterHref: (id) => `assets/${id}.png` });
  assert.match(files.get("styles.css"), /prefers-color-scheme/u); assert.match(files.get("styles.css"), /min-width: 900px/u); assert.doesNotMatch(files.get("styles.css"), /:hover/u); assert.match(files.get("title.html"), /canvas-grid/u); assert.match(files.get("title.html"), /grid-template-columns:1fr 2fr/u); assert.match(files.get("title.html"), /<h1/u); assert.match(files.get("title.html"), /aria-label="Deck title"/u);
});

test("mobile grid candidate emits source for device verification", () => {
  const route = structuredClone(document); route.module = "mobile"; route.children[0].role = "ios";
  route.children[0].children[1] = { ...route.children[0].children[1], type: "frame", effect: undefined, layout: "grid", gridTemplateColumns: ["1fr", "2fr"], children: [] };
  const iosFiles = exportSwiftUI(buildCapabilityVerificationIR(route, { role: "ios", frames: ["slide"] }, capabilityPathInventory()));
  assert.match(iosFiles.get("Title.swift"), /LazyVGrid/u);
  const android = structuredClone(route); android.children[0].role = "android";
  const androidFiles = exportCompose(buildCapabilityVerificationIR(android, { role: "android", frames: ["slide"] }, capabilityPathInventory()));
  assert.match(androidFiles.get("Title.kt"), /LazyVerticalGrid/u);
});

test("Compose fixed-size grid children release the cell minimum before sizing", () => {
  const mobile = structuredClone(document); mobile.module = "mobile"; mobile.children[0].role = "android";
  mobile.children[0].children = [{ id: "grid", type: "frame", width: 340, height: 220, layout: "grid", gridTemplateColumns: [160, 160], children: [
    { id: "circle", type: "ellipse", width: 96, height: 96, fill: "#F4A261" },
  ] }];
  const ir = buildCapabilityVerificationIR(mobile, { role: "android", frames: ["slide"] }, capabilityPathInventory());
  const source = exportCompose(ir).get("Title.kt");
  assert.match(source, /wrapContentSize\(androidx\.compose\.ui\.Alignment\.TopStart\)\.size\(96\.dp, 96\.dp\)/u);
});

test("Compose root descriptions and decorative text retain distinct accessibility behavior", () => {
  const mobile = structuredClone(document); mobile.module = "mobile"; mobile.children[0].role = "android";
  mobile.children[0].description = "Root label";
  mobile.children[0].children = [{ id: "decoration", type: "text", width: 100, height: 20, content: "Watermark", decorative: true, description: "Not an accessible label", paragraphs: [{ from: 0, to: 9 }], marks: [] }];
  const ir = buildCapabilityVerificationIR(mobile, { role: "android", frames: ["slide"] }, capabilityPathInventory());
  const source = exportCompose(ir).get("Title.kt");
  assert.match(source, /contentDescription = "Root label"/u);
  assert.match(source, /clearAndSetSemantics \{ \}/u);
  assert.doesNotMatch(source, /contentDescription = "Not an accessible label"/u);
  assert.match(source, /append\("Watermark"\)/u);
});

test("SwiftUI applies root labels and gives decorative hiding precedence", () => {
  const mobile = structuredClone(document); mobile.module = "mobile"; mobile.children[0].role = "ios";
  mobile.children[0].description = "Root label";
  mobile.children[0].children = [{ id: "decoration", type: "text", width: 100, height: 20, content: "Watermark", decorative: true, description: "Hidden label", paragraphs: [{ from: 0, to: 9 }], marks: [] }];
  const ir = buildCapabilityVerificationIR(mobile, { role: "ios", frames: ["slide"] }, capabilityPathInventory());
  const source = exportSwiftUI(ir).get("Title.swift");
  assert.match(source, /accessibilityElement\(children: \.contain\)\.accessibilityLabel\("Root label"\)/u);
  assert.match(source, /accessibilityHidden\(true\)/u);
  assert.match(source, /accessibilityRepresentation \{ EmptyView\(\) \}/u);
  assert.doesNotMatch(source, /accessibilityLabel\("Hidden label"\)/u);
});

test("mobile linear containers retain cross-axis alignment at stack and frame boundaries", () => {
  for (const layout of ["vertical", "horizontal"]) for (const alignItems of ["start", "center", "end"]) {
    const mobile = structuredClone(document); mobile.module = "mobile";
    Object.assign(mobile.children[0], { layout, alignItems, justifyContent: "start" });
    mobile.children[0].children = [{ id: "box", type: "rectangle", width: 50, height: 30, fill: "#123456", layoutPosition: "relative" }];
    for (const role of ["ios", "android"]) {
      mobile.children[0].role = role;
      const ir = buildCapabilityVerificationIR(mobile, { role, frames: ["slide"] }, capabilityPathInventory());
      assert.equal(ir.outputs[0].root.layout.alignItems, alignItems);
      assert.equal(ir.outputs[0].root.layout.justifyContent, "start");
      assert.equal(ir.outputs[0].nodes[0].layout.layoutPosition, "relative");
      const index = ["start", "center", "end"].indexOf(alignItems);
      if (role === "ios") {
        const source = exportSwiftUI(ir).get("Title.swift");
        const stackAlignment = (layout === "vertical" ? ["leading", "center", "trailing"] : ["top", "center", "bottom"])[index];
        const frameAlignment = (layout === "vertical" ? ["topLeading", "top", "topTrailing"] : ["topLeading", "leading", "bottomLeading"])[index];
        assert.ok(source.includes(`${layout === "vertical" ? "V" : "H"}Stack(alignment: .${stackAlignment},`));
        assert.ok(source.includes(`alignment: .${frameAlignment})`));
      } else {
        const source = exportCompose(ir).get("Title.kt");
        const alignment = (layout === "vertical" ? ["Start", "CenterHorizontally", "End"] : ["Top", "CenterVertically", "Bottom"])[index];
        assert.ok(source.includes(`${layout === "vertical" ? "horizontal" : "vertical"}Alignment = androidx.compose.ui.Alignment.${alignment}`));
      }
    }
  }
});

test("SwiftUI container paint follows authored sizing and precedes absolute positioning", () => {
  const mobile = structuredClone(document); mobile.module = "mobile"; mobile.children[0].role = "ios"; mobile.children[0].layout = "none";
  mobile.children[0].children = [{ id: "container", type: "frame", x: 12, y: 16, width: 300, height: 90, layout: "vertical", alignItems: "end", fill: "#0B4A6F", children: [{ id: "box", type: "rectangle", width: 60, height: 30, fill: "#F4A261" }] }];
  const source = exportSwiftUI(buildCapabilityVerificationIR(mobile, { role: "ios", frames: ["slide"] }, capabilityPathInventory())).get("Title.swift");
  assert.match(source, /frame\(width: 300, height: 90, alignment: \.topTrailing\)\.background\(Color\([^\n]+?\), ignoresSafeAreaEdges: \[\]\)\.compositingGroup\(\)\.opacity\(1\)\.position\(x: 162, y: 61\)/u);
});

test("mobile clipping is applied after container paint and before compositing", () => {
  const mobile = structuredClone(document); mobile.module = "mobile";
  mobile.children[0].children = [{ id: "clip", type: "frame", x: 12, y: 16, width: 100, height: 80, layout: "none", clip: true, fill: "#0B4A6F", children: [
    { id: "overflow", type: "rectangle", x: 70, y: 20, width: 60, height: 30, fill: "#F4A261" },
  ] }];
  mobile.children[0].role = "ios";
  const swift = exportSwiftUI(buildCapabilityVerificationIR(mobile, { role: "ios", frames: ["slide"] }, capabilityPathInventory())).get("Title.swift");
  assert.match(swift, /background\([^\n]+\)\.clipped\(\)\.compositingGroup\(\)/u);
  mobile.children[0].role = "android";
  const kotlin = exportCompose(buildCapabilityVerificationIR(mobile, { role: "android", frames: ["slide"] }, capabilityPathInventory())).get("Title.kt");
  assert.match(kotlin, /\.background\([^\n]+\)\.canvasClipToBounds\(\)/u);
});

test("mobile shape and container opacity includes background paint; ellipses are not capsules", () => {
  const mobile = structuredClone(document); mobile.module = "mobile";
  Object.assign(mobile.children[0], { opacity: 0.5, fill: "#0B4A6F", children: [
    { id: "rectangle", type: "rectangle", width: 300, height: 100, fill: "#0B4A6F", opacity: 0.5 },
    { id: "ellipse", type: "ellipse", width: 300, height: 100, fill: "#0B4A6F", opacity: 0.5 },
  ] });
  for (const role of ["ios", "android"]) {
    mobile.children[0].role = role;
    const ir = buildCapabilityVerificationIR(mobile, { role, frames: ["slide"] }, capabilityPathInventory());
    if (role === "ios") assert.match(exportSwiftUI(ir).get("Title.swift"), /background\([^\n]+\.compositingGroup\(\)\.opacity\(0.5\)/u);
    else {
      const source = exportCompose(ir).get("Title.kt");
      assert.match(source, /Box\(modifier = [^\n]+\.alpha\(0.5f\)\.background\(/u);
      assert.match(source, /Spacer\([^\n]+\.alpha\(0.5f\)\.background\(/u);
      assert.match(source, /Canvas\(modifier = [^\n]+\.size\(300.dp, 100.dp\)\.alpha\(0.5f\)\) \{ drawOval\(/u);
    }
  }
});

test("mobile padding shorthand is inside authored bounds and outside the children", () => {
  for (const [padding, expected] of [[8, [8, 8, 8, 8]], [[8], [8, 8, 8, 8]], [[8, 12], [8, 12, 8, 12]], [[8, 12, 16], [8, 12, 16, 12]], [[8, 12, 16, 20], [8, 12, 16, 20]]]) {
    const mobile = structuredClone(document); mobile.module = "mobile";
    Object.assign(mobile.children[0], { layout: "vertical", padding, fill: "#FFFFFF" });
    const [top, right, bottom, left] = expected;
    for (const role of ["ios", "android"]) {
      mobile.children[0].role = role;
      const ir = buildCapabilityVerificationIR(mobile, { role, frames: ["slide"] }, capabilityPathInventory());
      if (role === "ios") {
        const source = exportSwiftUI(ir).get("Title.swift");
        assert.ok(source.includes(`.padding(EdgeInsets(top: ${top}, leading: ${left}, bottom: ${bottom}, trailing: ${right})).frame(`));
        assert.ok(source.includes("ignoresSafeAreaEdges: []"));
      } else {
        const source = exportCompose(ir).get("Title.kt");
        assert.ok(source.includes(`.padding(start = ${left}.dp, top = ${top}.dp, end = ${right}.dp, bottom = ${bottom}.dp)`));
        assert.ok(source.indexOf(".size(") < source.indexOf(".background("));
        assert.ok(source.indexOf(".background(") < source.indexOf(".padding("));
      }
    }
  }
});

test("mobile text opacity applies to the complete rich text expression", () => {
  const mobile = structuredClone(document); mobile.module = "mobile";
  mobile.children[0].children = [{ id: "text", type: "text", width: 300, height: 100, content: "ABC", opacity: 0.5, fontSize: 28, fill: "#0B4A6F", marks: [{ type: "weight", from: 0, to: 1, value: 700 }] }];
  for (const role of ["ios", "android"]) {
    mobile.children[0].role = role;
    const ir = buildCapabilityVerificationIR(mobile, { role, frames: ["slide"] }, capabilityPathInventory());
    if (role === "ios") assert.match(exportSwiftUI(ir).get("Title.swift"), /\(Text\("A"\)[^\n]+ \+ Text\("BC"\)[^\n]+\)\.opacity\(0.5\)\.frame/u);
    else assert.match(exportCompose(ir).get("Title.kt"), /Text\(buildAnnotatedString[^\n]+modifier = [^\n]+\.alpha\(0.5f\)\)/u);
  }
});

test("Compose mixed-size runs use density-resolved relative spans without integer rounding", () => {
  const mobile = structuredClone(document); mobile.module = "mobile";
  mobile.children[0].role = "android";
  mobile.children[0].children = [{ id: "text", type: "text", width: 300, height: 100, content: "AB", fontSize: 24,
    marks: [{ type: "fontSize", from: 1, to: 2, value: 28.25 }] }];
  const ir = buildCapabilityVerificationIR(mobile, { role: "android", frames: ["slide"] }, capabilityPathInventory());
  const source = exportCompose(ir).get("Title.kt");
  assert.match(source, /val canvasDensity = androidx\.compose\.ui\.platform\.LocalDensity\.current/u);
  assert.ok(source.includes("fontSize = with(canvasDensity) { (28.25.sp.toPx() / 24.sp.toPx()).em }"));
  assert.ok(source.includes("import androidx.compose.ui.unit.em"));
  assert.doesNotMatch(source, /fontSize = 28\.25\.sp[,)]/u);
  mobile.children[0].children[0].fontSize = 0;
  const zeroFirst = exportCompose(buildCapabilityVerificationIR(mobile, { role: "android", frames: ["slide"] }, capabilityPathInventory())).get("Title.kt");
  assert.ok(zeroFirst.includes("(0.sp.toPx() / 28.25.sp.toPx()).em"));
  assert.doesNotMatch(zeroFirst, /\/ 0\.sp\.toPx\(\)/u);
});

test("mobile solid paints preserve shorthand alpha and paint opacity", () => {
  for (const [fill, expected] of [
    ["#abcd", "DDAABBCC"], ["transparent", "00000000"],
    ["rgba(11,74,111,0.5)", "800B4A6F"],
    [{ type: "color", color: "#0B4A6F80", opacity: 0.5 }, "400B4A6F"],
    [[{ type: "color", color: "#0B4A6F", opacity: 0.5 }], "800B4A6F"],
  ]) {
    const mobile = structuredClone(document); mobile.module = "mobile";
    mobile.children[0].children = [{ id: "color", type: "rectangle", width: 100, height: 100, fill }];
    for (const role of ["ios", "android"]) {
      mobile.children[0].role = role;
      const ir = buildCapabilityVerificationIR(mobile, { role, frames: ["slide"] }, capabilityPathInventory());
      const source = role === "ios" ? exportSwiftUI(ir).get("Title.swift") : exportCompose(ir).get("Title.kt");
      assert.doesNotMatch(source, /NaN/u);
      if (role === "android") assert.ok(source.includes(`Color(0x${expected})`));
    }
  }
  for (const fill of ["not-a-color", { type: "color", color: "#0B4A6F", opacity: -1 }, ["#FFFFFF", "#000000"]]) {
    const mobile = structuredClone(document); mobile.module = "mobile"; mobile.children[0].role = "android";
    mobile.children[0].children = [{ id: "invalid", type: "rectangle", width: 100, height: 100, fill }];
    assert.throws(() => exportCompose(buildCapabilityVerificationIR(mobile, { role: "android", frames: ["slide"] }, capabilityPathInventory())));
  }
});

test("mobile text growth modes preserve authored sizing intent", () => {
  const mobile = structuredClone(document); mobile.module = "mobile";
  mobile.children[0].children = ["auto", "fixed-width", "fixed-width-height"].map((textGrowth, index) => ({ id: `text${index}`, type: "text", width: 90, height: 22, content: "Growing text", textGrowth, paragraphs: [{ from: 0, to: 12 }], marks: [] }));
  for (const role of ["ios", "android"]) {
    mobile.children[0].role = role;
    const ir = buildCapabilityVerificationIR(mobile, { role, frames: ["slide"] }, capabilityPathInventory());
    assert.deepEqual(ir.outputs[0].nodes.map((node) => node.layout.textGrowth), ["auto", "fixed-width", "fixed-width-height"]);
    const source = role === "ios" ? exportSwiftUI(ir).get("Title.swift") : exportCompose(ir).get("Title.kt");
    if (role === "ios") {
      assert.match(source, /fixedSize\(horizontal: true, vertical: true\)/u);
      assert.match(source, /fixedSize\(horizontal: false, vertical: true\)/u);
      assert.match(source, /height: 22/u);
    } else {
      assert.match(source, /wrapContentSize\(androidx.compose.ui.Alignment.TopStart, unbounded = true\)/u);
      assert.match(source, /wrapContentHeight\(androidx.compose.ui.Alignment.Top, unbounded = true\)/u);
      assert.match(source, /22\.dp/u);
    }
  }
});

test("SVG remains vector for native text and shapes", () => {
  const ir = buildExporterIR(document, { role: "slide", frames: ["slide"] }); const svg = exportSvg(ir, ir.outputs[0]);
  assert.match(svg, /<text/u); assert.match(svg, /<rect/u); assert.doesNotMatch(svg, /<image/u);
});

test("mobile vectors emit separate open-path strokes and group opacity", () => {
  const mobile = structuredClone(document); mobile.module = "mobile";
  mobile.children[0].children = [{ id: "outline", type: "path", width: 200, height: 100, geometry: "M20 20 H180 V80", viewBox: [0, 0, 200, 100], fill: "#F4A261", opacity: 0.5, stroke: { fill: "#0B4A6F", thickness: 8, cap: "round", join: "bevel", align: "center" } }];
  for (const role of ["ios", "android"]) {
    mobile.children[0].role = role;
    const ir = buildCapabilityVerificationIR(mobile, { role, frames: ["slide"] }, capabilityPathInventory());
    const source = role === "ios" ? exportSwiftUI(ir).get("Title.swift") : exportCompose(ir).get("Title.kt");
    if (role === "ios") {
      assert.match(source, /StrokeStyle\(lineWidth: 8, lineCap: \.round, lineJoin: \.bevel, miterLimit: 4, dash: \[\]\)/u);
      assert.match(source, /compositingGroup\(\)\.opacity\(0.5\)/u);
      assert.doesNotMatch(source, /closeSubpath/u);
    } else {
      assert.match(source, /Stroke\(width = 8.0f, cap = androidx.compose.ui.graphics.StrokeCap.Round, join = androidx.compose.ui.graphics.StrokeJoin.Bevel\)/u);
      assert.match(source, /saveLayer\(path.getBounds\(\).inflate\(33.0f\), androidx.compose.ui.graphics.Paint\(\).apply \{ alpha = 0.5f \}\)/u);
      assert.doesNotMatch(source, /Canvas\(modifier = [^\n]*\.alpha\(0.5f\)/u);
      assert.doesNotMatch(source, /close\(\)/u);
    }
    ir.outputs[0].nodes[0].paint.stroke.align = "inside";
    const inside = role === "ios" ? exportSwiftUI(ir).get("Title.swift") : exportCompose(ir).get("Title.kt");
    assert.ok(inside.includes(role === "ios" ? "context.clip(to: path" : "ClipOp.Intersect"));
    assert.ok(inside.includes(role === "ios" ? "lineWidth: 16" : "width = 16.0f"));
    ir.outputs[0].nodes[0].paint.stroke.align = "outside";
    const outside = role === "ios" ? exportSwiftUI(ir).get("Title.swift") : exportCompose(ir).get("Title.kt");
    assert.ok(outside.includes(role === "ios" ? "options: .inverse" : "ClipOp.Difference"));
    ir.outputs[0].nodes[0].paint.stroke.align = "center";
    ir.outputs[0].nodes[0].paint.stroke.dash = [12, 6];
    const dashed = role === "ios" ? exportSwiftUI(ir).get("Title.swift") : exportCompose(ir).get("Title.kt");
    assert.ok(dashed.includes(role === "ios" ? "dash: [12, 6]" : "dashPathEffect(floatArrayOf(12.0f, 6.0f))"));
    ir.outputs[0].nodes[0].paint.stroke.dash = [12];
    const repeated = role === "ios" ? exportSwiftUI(ir).get("Title.swift") : exportCompose(ir).get("Title.kt");
    assert.ok(repeated.includes(role === "ios" ? "dash: [12, 12]" : "dashPathEffect(floatArrayOf(12.0f, 12.0f))"));
  }
});

test("candidate path emitters serialize vector geometry without image substitution", async () => {
  const deck = structuredClone(document);
  deck.children[0].children = [{ id: "logo", type: "path", x: 100, y: 100, width: 240, height: 160, geometry: "M0 0 H100 V100 H0 Z M25 25 H75 V75 H25 Z", viewBox: [0, 0, 100, 100], fillRule: "evenodd", fill: "#0B4A6F" }];
  const candidates = ["nodes.path", "nodes.polygon", "properties.geometry", "properties.viewBox", "properties.fillRule"];
  const deckIr = buildExporterIR(deck, { role: "slide", frames: ["slide"] });
  assert.equal(deckIr.rasters.length, 0);
  const slideXml = readXmlPart(readOoxmlPackage(await exportDeck(deckIr)), "ppt/slides/slide1.xml");
  assert.match(slideXml, /name="logo"[\s\S]*?<a:custGeom>[\s\S]*?<a:pathLst>[\s\S]*?<a:lnTo>/u);
  assert.doesNotMatch(slideXml, /<p:pic>/u);

  const print = structuredClone(deck); print.module = "generic"; delete print.children[0].role; print.children[0].physical = { w: 210, h: 297, unit: "mm" }; print.children[0].bleed = 0;
  const pdfBytes = await exportPdf(buildExtractionIR(print, { format: "pdf", nodeId: "slide" }), { fonts: {} });
  assert.doesNotMatch(Buffer.from(pdfBytes).toString("latin1"), /\/Subtype\s*\/Image/u);

  const web = structuredClone(deck); web.module = "web"; web.children[0].role = "route";
  const webFiles = exportWeb(buildCapabilityVerificationIR(web, { role: "route", frames: ["slide"] }, candidates));
  assert.match(webFiles.get("title.html"), /<svg[^>]*viewBox="0 0 100 100"[\s\S]*?<path[^>]*fill-rule="evenodd"/u);

  const ios = structuredClone(deck); ios.module = "mobile"; ios.children[0].role = "ios";
  assert.match(exportSwiftUI(buildCapabilityVerificationIR(ios, { role: "ios", frames: ["slide"] }, capabilityPathInventory())).get("Title.swift"), /Path \{ path in[\s\S]*FillStyle\(eoFill: true\)/u);
  const android = structuredClone(ios); android.children[0].role = "android";
  assert.match(exportCompose(buildCapabilityVerificationIR(android, { role: "android", frames: ["slide"] }, capabilityPathInventory())).get("Title.kt"), /PathFillType\.EvenOdd/u);

  const svgIr = buildExtractionIR(deck, { format: "svg", nodeId: "slide" });
  const svg = exportSvg(svgIr, svgIr.outputs[0]);
  assert.match(svg, /<path[^>]*fill-rule="evenodd"/u);
  assert.doesNotMatch(svg, /<image/u);
});
