import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { readOoxmlPackage, readXmlPart } from "./ooxml-package.mjs";

import { exportDocumentBatch, extractDocumentNode, extractDocumentNodes, publishPreparedDocumentExports } from "./export-service.mjs";

const document = {
  version: "2.17",
  module: "generic",
  axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
  children: [{
    id: "art", type: "frame", name: "Artwork", width: 320, height: 180,
    fill: "#ffffff", children: [{ id: "box", type: "rectangle", x: 20, y: 20, width: 80, height: 60, fill: "#123456" }],
  }],
};

test("documents.extract writes one scaled PNG and one roleless SVG subtree", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-image-export-"));
  try {
    const pngPath = join(directory, "art.png");
    const png = await extractDocumentNode(document, { nodeId: "art", format: "png", scale: 2, destination: pngPath }, { assets: new Map() });
    assert.deepEqual({ width: png.width, height: png.height, format: png.format }, { width: 640, height: 360, format: "png" });
    assert.deepEqual([...await readFile(pngPath)].slice(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]);

    const svgPath = join(directory, "art.svg");
    const svg = await extractDocumentNode(document, { nodeId: "art", format: "svg", destination: svgPath }, { assets: new Map() });
    assert.equal(svg.format, "svg");
    assert.match(await readFile(svgPath, "utf8"), /<svg[\s\S]*<rect id="box"/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("documents.extract requires one exact node", async () => {
  await assert.rejects(() => extractDocumentNode(document, { format: "png", destination: "/tmp/ambiguous.png" }), /nodeId/u);
});

test("extraction rejects occupied destinations before resolving or rendering nodes", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-extract-preflight-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const destination = join(directory, "existing.svg");
  await writeFile(destination, "preserved", { flag: "wx" });
  for (const request of [{ nodeId: "missing", format: "svg", destination }, { nodeId: "missing", format: "png", destination }]) {
    await assert.rejects(extractDocumentNode(document, request), { code: "CANVAS_EXPORT_EXISTS" });
  }
  await assert.rejects(extractDocumentNodes(document, { node: ["missing"], format: "svg", destination: `${directory}/` }), { code: "CANVAS_EXPORT_EXISTS" });
  assert.equal(await readFile(destination, "utf8"), "preserved");
});

test("directory extraction names artifacts by node ID and rejects collisions before writing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-directory-extract-"));
  try {
    const destination = `${join(directory, "images")}/`;
    const result = await extractDocumentNodes(document, { node: ["box", "art"], format: "svg", destination });
    assert.deepEqual(result.artifacts, [join(destination, "box.svg"), join(destination, "art.svg")]);
    assert.deepEqual((await readdir(destination)).sort(), ["art.svg", "box.svg"]);
    assert.match(await readFile(result.artifacts[0], "utf8"), /<svg/u);
    await assert.rejects(extractDocumentNodes(document, { node: ["art"], format: "svg", destination }), { code: "CANVAS_EXPORT_EXISTS" });
    for (const node of [["art", "art"], ["art", "ART"], ["art", "../escape"], ["art", "missing"]]) {
      const invalid = `${join(directory, "invalid")}/`;
      await assert.rejects(extractDocumentNodes(document, { node, format: "svg", destination: invalid }));
      await assert.rejects(readdir(invalid), { code: "ENOENT" });
    }
    const single = await extractDocumentNode(document, { nodeId: "box", format: "svg", destination: `${join(directory, "single")}/` });
    assert.deepEqual(single.artifacts, [join(directory, "single", "box.svg")]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("documents.extract writes roleless PDF at 72 DPI or declared physical trim size", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdf-extract-"));
  try {
    const destination = join(directory, "art.pdf");
    const result = await extractDocumentNode(document, { nodeId: "art", format: "pdf", destination });
    assert.equal(result.format, "pdf");
    assert.deepEqual((await PDFDocument.load(await readFile(destination))).getPages()[0].getSize(), { width: 320, height: 180 });
    const physical = structuredClone(document);
    Object.assign(physical.children[0], { physical: { w: 4, h: 3, unit: "in" }, bleed: 9 });
    const physicalPath = join(directory, "physical.pdf");
    await extractDocumentNode(physical, { nodeId: "art", format: "pdf", destination: physicalPath });
    const page = (await PDFDocument.load(await readFile(physicalPath))).getPages()[0];
    assert.deepEqual(page.getTrimBox(), { x: 9, y: 9, width: 288, height: 216 });
    await assert.rejects(extractDocumentNode(document, { nodeId: "art", format: "pdf", scale: 2, destination: join(directory, "invalid.pdf") }), { code: "CANVAS_EXTRACT_SCALE_UNSUPPORTED" });
    // No caller-supplied ICC is needed: the bundled default reaches the
    // conformance gate, which must still prevent publication.
    const unverifiedPath = join(directory, "unverified.pdf");
    await assert.rejects(extractDocumentNode(document, { nodeId: "art", format: "pdf", profile: "PDF/X-4", destination: unverifiedPath }), { code: "CANVAS_PDF_PROFILE_UNVERIFIED" });
    await assert.rejects(readFile(unverifiedPath), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("multi-node extraction makes ordered differently sized PDF units and rejects multi-unit PNG/SVG files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-multiple-pdf-"));
  try {
    const destination = join(directory, "units.pdf");
    const result = await extractDocumentNodes(document, { node: ["box", "art"], format: "pdf", destination });
    assert.equal(result.units, 2);
    const pages = (await PDFDocument.load(await readFile(destination))).getPages();
    assert.deepEqual(pages.map((page) => page.getSize()), [{ width: 80, height: 60 }, { width: 320, height: 180 }]);
    for (const format of ["png", "svg"]) await assert.rejects(extractDocumentNodes(document, { node: ["box", "art"], format, destination: join(directory, `invalid.${format}`) }), { code: "CANVAS_EXTRACT_FORMAT_SINGLE_UNIT" });
    await assert.rejects(extractDocumentNodes(document, { node: ["art", "missing"], format: "pdf", destination: join(directory, "missing.pdf") }));
    await assert.rejects(readFile(join(directory, "missing.pdf")), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("forty binding sets produce distinct editable decks after independent resolution and layout", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-forty-decks-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const template = {
    version: "2.17", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "slide", type: "frame", role: "slide", width: 800, height: 450,
      physical: { w: 10, h: 5.625, unit: "in" }, layout: "horizontal", gap: 10,
      children: [
        { id: "school", type: "text", width: "${cardWidth}", height: 50, content: "${schoolName}", fontFamily: "Inter", fontSize: 24, paragraphs: [], marks: [] },
        { id: "marker", type: "rectangle", width: 20, height: 20, fill: "#123456" },
      ],
    }],
  };
  const requests = Array.from({ length: 40 }, (_, index) => ({
    role: "slide", frames: ["slide"], destination: join(directory, `school-${index + 1}.pptx`),
    bindings: { schoolName: `School ${index + 1}`, cardWidth: 100 + index },
  }));
  const result = await exportDocumentBatch(template, requests, { assets: new Map(), title: "Forty schools" });
  assert.equal(result.artifacts.length, 40);
  const observedPositions = new Set();
  for (let index = 0; index < result.artifacts.length; index += 1) {
    const xml = readXmlPart(readOoxmlPackage(await readFile(result.artifacts[index])), "ppt/slides/slide1.xml");
    assert.match(xml, new RegExp(`<a:t>School ${index + 1}</a:t>`, "u"));
    assert.doesNotMatch(xml, /<p:pic>/u);
    const marker = xml.match(/name="marker"[\s\S]*?<a:off x="(\d+)"/u);
    assert.ok(marker, `marker geometry is present in deck ${index + 1}`);
    observedPositions.add(marker[1]);
  }
  assert.equal(observedPositions.size, 40);
});

test("batch publication cleans only its completed artifacts after a later destination race", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-batch-cleanup-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const first = join(directory, "first.txt");
  const raced = join(directory, "raced.txt");
  await writeFile(raced, "other actor", { flag: "wx" });
  const report = (destination) => ({ artifacts: [destination], consequences: [], lowered: [], embeddedFonts: [], bundledFonts: [], rasterized: [] });
  await assert.rejects(publishPreparedDocumentExports([
    { destination: first, artifact: Buffer.from("owned"), report: report(first) },
    { destination: raced, artifact: Buffer.from("ours"), report: report(raced) },
  ]), { code: "CANVAS_EXPORT_EXISTS" });
  await assert.rejects(readFile(first), { code: "ENOENT" });
  assert.equal(await readFile(raced, "utf8"), "other actor");
});
