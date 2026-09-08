import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import test from "node:test";
import { buildExtractionIR } from "./exporter-ir.mjs";
import { extractDocumentNode, extractDocumentNodes } from "./export-service.mjs";
import { prepareScrollContentDocument } from "./scroll-content.mjs";

function scrollingDocument() {
  return {
    version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "viewport", type: "frame", width: 100, height: 80, fill: "#ffffff", overflow: "scroll-both",
      children: [
        { id: "wide", type: "rectangle", x: -20, y: 10, width: 240, height: 20, layoutPosition: "absolute", fill: "#123456" },
        { id: "tall", type: "rectangle", x: 10, y: 70, width: 20, height: 150, layoutPosition: "absolute", fill: "#654321" },
      ],
    }],
  };
}

test("scroll extraction defaults to a clipped viewport and full expands descendant bounds without mutating input", () => {
  const document = scrollingDocument();
  const viewport = prepareScrollContentDocument(document, { nodeId: "viewport", format: "svg" });
  assert.equal(viewport.children[0].overflow, "scroll-both");
  assert.equal(viewport.children[0].clip, true);
  const viewportIr = buildExtractionIR(viewport, { nodeId: "viewport", format: "svg" });
  assert.deepEqual({ width: viewportIr.outputs[0].width, height: viewportIr.outputs[0].height }, { width: 100, height: 80 });
  const full = prepareScrollContentDocument(document, { nodeId: "viewport", format: "svg", mode: "full" });
  assert.equal(Object.hasOwn(full.children[0], "overflow"), false);
  assert.equal(Object.hasOwn(full.children[0], "clip"), false);
  const fullIr = buildExtractionIR(full, { nodeId: "viewport", format: "svg" });
  assert.deepEqual({ width: fullIr.outputs[0].width, height: fullIr.outputs[0].height }, { width: 240, height: 220 });
  assert.equal(document.children[0].overflow, "scroll-both");
  assert.equal(Object.hasOwn(document.children[0], "clip"), false);
});

test("PNG, SVG, PDF, multi-page PDF, and directory extraction honor full scroll bounds", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-scroll-extract-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const document = scrollingDocument();
  const png = await extractDocumentNode(document, { nodeId: "viewport", format: "png", destination: join(directory, "viewport.png"), scrollContent: "full" }, { assets: new Map() });
  assert.deepEqual({ width: png.width, height: png.height }, { width: 240, height: 220 });
  const svgPath = join(directory, "viewport.svg");
  await extractDocumentNode(document, { nodeId: "viewport", format: "svg", destination: svgPath, scrollContent: "full" }, { assets: new Map() });
  assert.match(await readFile(svgPath, "utf8"), /viewBox="0 0 240 220"/u);
  const pdfPath = join(directory, "viewport.pdf");
  await extractDocumentNode(document, { nodeId: "viewport", format: "pdf", destination: pdfPath, scrollContent: "full" }, { assets: new Map() });
  assert.deepEqual((await PDFDocument.load(await readFile(pdfPath))).getPages()[0].getSize(), { width: 240, height: 220 });

  const second = { id: "small", type: "rectangle", width: 20, height: 30, fill: "#abcdef" };
  const multi = structuredClone(document);
  multi.children.push(second);
  const multiPath = join(directory, "multi.pdf");
  await extractDocumentNodes(multi, { node: ["viewport", "small"], format: "pdf", destination: multiPath, scrollContent: "full" }, { assets: new Map() });
  assert.deepEqual((await PDFDocument.load(await readFile(multiPath))).getPages().map((page) => page.getSize()), [{ width: 240, height: 220 }, { width: 20, height: 30 }]);
  const outputDirectory = `${join(directory, "units")}/`;
  await extractDocumentNodes(multi, { node: ["viewport", "small"], format: "svg", destination: outputDirectory, scrollContent: "full" }, { assets: new Map() });
  assert.deepEqual((await readdir(outputDirectory)).sort(), ["small.svg", "viewport.svg"]);
});

test("full physical PDF scroll extraction fails before destination publication", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-scroll-physical-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const document = scrollingDocument();
  Object.assign(document.children[0], { physical: { w: 2, h: 2, unit: "in" } });
  const destination = join(directory, "physical.pdf");
  await assert.rejects(
    extractDocumentNode(document, { nodeId: "viewport", format: "pdf", destination, scrollContent: "full" }, { assets: new Map() }),
    { code: "CANVAS_EXTRACT_SCROLL_PHYSICAL" },
  );
  await assert.rejects(readFile(destination), { code: "ENOENT" });
  const noScroll = structuredClone(document);
  delete noScroll.children[0].overflow;
  await extractDocumentNode(noScroll, { nodeId: "viewport", format: "pdf", destination, scrollContent: "full" }, { assets: new Map() });
  assert.deepEqual((await PDFDocument.load(await readFile(destination))).getPages()[0].getSize(), { width: 144, height: 144 });
});

test("plain clip is unaffected and invalid scrollContent is rejected", async () => {
  const document = scrollingDocument();
  document.children[0].overflow = "clip";
  const clipped = prepareScrollContentDocument(document, { nodeId: "viewport", format: "svg", mode: "full" });
  assert.equal(clipped.children[0].overflow, "clip");
  assert.equal(Object.hasOwn(clipped.children[0], "clip"), false);
  await assert.rejects(
    () => extractDocumentNode(document, { nodeId: "viewport", format: "svg", destination: "/tmp/never-written.svg", scrollContent: "sideways" }),
    { code: "CANVAS_EXTRACT_SCROLL_CONTENT" },
  );
});
