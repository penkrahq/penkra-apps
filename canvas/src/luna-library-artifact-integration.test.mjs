import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { openBrowser } from "../compatibility/browser-fixture.mjs";
import { exportDocumentBatch, extractDocumentNode } from "./export-service.mjs";
import { loadCanvasImports } from "./canvas-imports.mjs";
import { createLibraryRelease } from "./library-publication.mjs";
import { resolveCanvasDocument } from "./canvas-resolver.mjs";
import { readOoxmlPackage, readXmlPart } from "./ooxml-package.mjs";
import {
  DARK_V1, DARK_V2, LIGHT_V1, LIGHT_V2, LOCAL_BODY, LOCAL_ACCENT, allNodes, consumerDocument, loadResolved,
  publicationFixture,
} from "../scripts/luna-library-artifact-fixtures.mjs";
import { colorBounds, decodePng, inspectPdf, parseSvg, runTool } from "../scripts/luna-extraction-artifact-fixtures.mjs";

const ASSETS = { assets: new Map() };

function node(document, id) { return allNodes(document).find((candidate) => candidate.id === id); }
function style(document, id) { return document.paragraphStyles[node(document, id).paragraphs[0].style]; }
function importRecord(document, record) { document.imports.ui = record; return document; }

test("published release selection is an in-memory reader boundary and explicit v2 changes resolved artifacts", async () => {
  const fixture = publicationFixture();
  const consumer = consumerDocument(fixture.v1Record);
  const sourceBefore = structuredClone(fixture.sourceV1);
  const consumerBefore = structuredClone(consumer);
  fixture.registry.publish(fixture.releaseV1);

  const first = await loadResolved(consumer, fixture);
  assert.equal(first.loaded.releases[0].releaseId, "v1");
  assert.equal(first.loaded.releases[0].contentHash, fixture.releaseV1.contentHash);
  fixture.registry.publish(fixture.releaseV2);
  const acceptedStillV1 = await loadResolved(consumer, fixture);
  assert.equal(acceptedStillV1.loaded.releases[0].releaseId, "v1");
  assert.equal(acceptedStillV1.loaded.releases[0].contentHash, fixture.releaseV1.contentHash);

  const explicitV2 = consumerDocument(fixture.v2Record);
  const second = await loadResolved(explicitV2, fixture);
  assert.equal(second.loaded.releases[0].releaseId, "v2");
  assert.equal(second.loaded.releases[0].contentHash, fixture.releaseV2.contentHash);
  assert.notEqual(node(acceptedStillV1.resolved.document, "slide-card/card-rectangle").fill, node(second.resolved.document, "slide-card/card-rectangle").fill);
  assert.equal(node(acceptedStillV1.resolved.document, "slide-card/card-rectangle").fill, LIGHT_V1);
  assert.equal(node(second.resolved.document, "slide-card/card-rectangle").fill, LIGHT_V2);
  assert.deepEqual(fixture.sourceV1, sourceBefore);
  assert.deepEqual(consumer, consumerBefore);
});

test("qualified public variable/style/component resolution keeps source identity, consumer modes, and local overrides", async () => {
  const fixture = publicationFixture();
  fixture.registry.publish(fixture.releaseV1);
  const consumer = consumerDocument(fixture.v1Record);
  const before = structuredClone(consumer);
  const { resolved } = await loadResolved(consumer, { ...fixture, modes: { appearance: "light" } });
  const output = resolved.document;

  assert.equal(node(output, "slide-qualified-variable").fill, LIGHT_V1);
  assert.equal(style(output, "slide-qualified-style").fill, LIGHT_V1);
  assert.equal(node(output, "slide-card/card-rectangle").fill, LIGHT_V1);
  assert.equal(style(output, "slide-card/card-label").fill, LIGHT_V1);
  assert.equal(node(output, "slide-dark-card/card-rectangle").fill, DARK_V1);
  assert.equal(style(output, "slide-dark-card/card-label").fill, DARK_V1);
  assert.equal(style(output, "slide-local-text").fill, LOCAL_BODY);
  assert.equal(output.paragraphStyles.body.fill, LOCAL_BODY);
  assert.equal(node(output, "slide-local-text").content, "Local style");
  assert.equal(output.children.some((root) => allNodes(root).some((candidate) => candidate.id.includes("private"))), false);
  assert.equal(JSON.stringify(output).includes("private/image.png"), false);
  assert.equal(JSON.stringify(output).includes(LOCAL_ACCENT), true);
  assert.deepEqual(consumer, before);
});

test("private, missing, and wrong-identity imports fail without mutating the consumer", async () => {
  const fixture = publicationFixture();
  fixture.registry.publish(fixture.releaseV1);
  const cases = [
    ["private-variable", (document) => { document.children[0].children[0].fill = "${ui:privateUnused}"; }, "CANVAS_LIBRARY_ITEM_PRIVATE"],
    ["missing-public-variable", (document) => { document.children[0].children[0].fill = "${ui:missing}"; }, "CANVAS_LIBRARY_ITEM_PRIVATE"],
    ["wrong-hash", (document) => { document.imports.ui.contentHash = "0".repeat(64); }, "CANVAS_LIBRARY_INTEGRITY"],
  ];
  for (const [name, mutate, code] of cases) {
    const consumer = consumerDocument(fixture.v1Record);
    mutate(consumer);
    const before = structuredClone(consumer);
    await assert.rejects(loadCanvasImports({}, consumer, { resolveRelease: fixture.registry.resolve }), { code }, name);
    assert.deepEqual(consumer, before, name);
  }
});

test("published library content reaches PPTX/HTML and roleless SVG/PDF artifacts", async (context) => {
  const fixture = publicationFixture();
  fixture.registry.publish(fixture.releaseV1);
  const consumer = consumerDocument(fixture.v1Record);
  const loaded = await loadCanvasImports({}, consumer, { resolveRelease: fixture.registry.resolve });
  assert.equal(loaded.releases[0].releaseId, "v1");
  const consumerBefore = structuredClone(consumer);
  const directory = await mkdtemp(join(tmpdir(), "canvas-library-artifact-integration-"));
  let browser;
  try {
    const pptxPath = join(directory, "library.pptx");
    const htmlDirectory = join(directory, "html");
    const publication = await exportDocumentBatch(consumer, [
      { role: "slide", frames: ["slide"], destination: pptxPath, imports: loaded.imports, modes: { appearance: "light" } },
    ], { assets: new Map(), title: "Published library integration" });
    assert.equal(publication.artifacts.some((path) => path === pptxPath), true);

    const htmlPublication = await exportDocumentBatch(consumer, [
      { role: "route", frames: ["route"], destination: htmlDirectory, imports: loaded.imports, modes: { appearance: "light" } },
    ], { assets: new Map(), title: "Published library integration" });
    assert.ok(htmlPublication.artifacts.some((path) => path.endsWith("/export-report.json")));

    const pptxXml = readXmlPart(readOoxmlPackage(await readFile(pptxPath)), "ppt/slides/slide1.xml");
    assert.match(pptxXml, /Library card/u);
    assert.match(pptxXml, /Qualified style/u);
    assert.match(pptxXml, /123456/iu);
    assert.match(pptxXml, /abcdef/iu);
    assert.doesNotMatch(pptxXml, /<p:pic>/u);

    browser = await openBrowser(join(directory, "chrome"), context.signal);
    const htmlName = (await readdir(htmlDirectory)).find((name) => name.endsWith(".html"));
    const htmlPath = join(htmlDirectory, htmlName);
    const html = await readFile(htmlPath, "utf8");
    const css = await readFile(join(htmlDirectory, "styles.css"), "utf8");
    assert.match(html, /route-card\/card-label/u);
    assert.match(html, /route-qualified-style/u);
    assert.match(`${html}\n${css}`, /#123456/iu);
    assert.match(`${html}\n${css}`, /#abcdef/iu);
    assert.doesNotMatch(`${html}\n${css}`, /ui:/u);
    assert.match(html, /route-card\/card-rectangle/u);
    const assetsDirectory = join(htmlDirectory, "assets");
    const assets = (await readdir(assetsDirectory)).filter((name) => name.startsWith("raster-") && name.endsWith(".png"));
    assert.ok(assets.length >= 3);
    assert.equal(new Set(assets).size, assets.length);
    for (const asset of assets) assert.deepEqual((await readFile(join(assetsDirectory, asset))).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const htmlImage = decodePng(await browser.screenshot(pathToFileURL(htmlPath).href, 420, 240, 1));
    assert.ok(colorBounds(htmlImage, LIGHT_V1).samples > 0);
    assert.ok(colorBounds(htmlImage, DARK_V1).samples > 0);
    assert.ok(colorBounds(htmlImage, LOCAL_BODY).samples > 0);

    const svgPath = join(directory, "library.svg");
    await extractDocumentNode(consumer, { nodeId: "art", format: "svg", destination: svgPath, modes: { appearance: "light" } }, { ...ASSETS, imports: loaded.imports });
    const svgText = await readFile(svgPath, "utf8");
    const svg = parseSvg(svgText);
    assert.equal(svg.hasImage, true);
    assert.match(svgText, /#123456/iu);
    assert.match(svgText, /#abcdef/iu);
    assert.match(svgText, /<rect\b/u);
    const svgImage = decodePng(await browser.screenshot(pathToFileURL(svgPath).href, 420, 240, 1));
    assert.ok(colorBounds(svgImage, LIGHT_V1).samples > 0);
    assert.ok(colorBounds(svgImage, DARK_V1).samples > 0);

    const pdfPath = join(directory, "library.pdf");
    await extractDocumentNode(consumer, { nodeId: "art", format: "pdf", destination: pdfPath, modes: { appearance: "light" } }, { ...ASSETS, imports: loaded.imports });
    const pdf = await inspectPdf(pdfPath, { x: 0, y: 0, width: 1, height: 1, samples: 1 });
    assert.equal(pdf.pages, 1);
    assert.ok(pdf.marker.samples > 0);
    assert.equal(pdf.imageXObjectLines.length, 0);
    const pdfText = await runTool("pdftotext", [pdfPath, "-"]);
    assert.match(pdfText, /Library card/u);
    assert.match(await runTool("pdffonts", [pdfPath]), /Inter[\s\S]*\byes\b/u);
    assert.equal((await readdir(directory)).some((name) => /staging|\.tmp/u.test(name)), false);
    assert.deepEqual(consumer, consumerBefore);
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("library artifact collision preflight and honest mobile capability gates publish nothing", async () => {
  const fixture = publicationFixture();
  fixture.registry.publish(fixture.releaseV1);
  const consumer = consumerDocument(fixture.v1Record);
  const loaded = await loadCanvasImports({}, consumer, { resolveRelease: fixture.registry.resolve });
  const directory = await mkdtemp(join(tmpdir(), "canvas-library-artifact-failures-"));
  try {
    const collision = join(directory, "collision.pptx");
    await assert.rejects(exportDocumentBatch(consumer, [
      { role: "slide", frames: ["slide"], destination: collision, imports: loaded.imports, modes: { appearance: "light" } },
      { role: "slide", frames: ["slide"], destination: collision, imports: loaded.imports, modes: { appearance: "light" } },
    ], { assets: new Map() }), { code: "CANVAS_EXPORT_COLLISION" });
    await assert.rejects(readFile(collision), { code: "ENOENT" });
    for (const role of ["ios", "android"]) {
      const destination = join(directory, `${role}-bundle`);
      await assert.rejects(exportDocumentBatch(consumer, [{ role, frames: [role], destination, imports: loaded.imports, modes: { appearance: "light" } }], { assets: new Map() }), { code: "CANVAS_CAPABILITY_UNVERIFIED" });
      await assert.rejects(readFile(destination), { code: "ENOENT" });
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("web raster assets use distinct ordinals for slash-qualified IDs that hyphen replacement would collide", async () => {
  const fixture = publicationFixture();
  const source = structuredClone(fixture.sourceV1);
  source.children.push(
    { id: "a", type: "frame", layout: "none", width: 120, height: 40, children: [{ id: "b-c", type: "text", x: 0, y: 0, width: 120, height: 40, content: "First", style: "body", paragraphs: [{ from: 0, to: 5, style: "body" }], marks: [] }] },
    { id: "a-b", type: "frame", layout: "none", width: 120, height: 40, children: [{ id: "c", type: "text", x: 0, y: 0, width: 120, height: 40, content: "Second", style: "body", paragraphs: [{ from: 0, to: 6, style: "body" }], marks: [] }] },
  );
  source.library.public.push({ kind: "component", id: "a" }, { kind: "component", id: "a-b" });
  const release = createLibraryRelease(source, { libraryId: "collision-library", releaseId: "v1" });
  fixture.registry.publish(release);
  const record = { documentId: release.libraryId, updatePolicy: "follow", releaseId: release.releaseId, contentHash: release.contentHash };
  const consumer = consumerDocument(record);
  consumer.children.find((root) => root.id === "route").children.push(
    { id: "route-a", type: "ref", ref: "ui:a", x: 0, y: 190 },
    { id: "route-a-b", type: "ref", ref: "ui:a-b", x: 150, y: 190 },
  );
  const loaded = await loadCanvasImports({}, consumer, { resolveRelease: fixture.registry.resolve });
  const directory = await mkdtemp(join(tmpdir(), "canvas-library-raster-ordinal-"));
  try {
    const sentinel = join(directory, "sentinel.txt");
    await writeFile(sentinel, "preserve me");
    const destination = join(directory, "route");
    await exportDocumentBatch(consumer, [{ role: "route", frames: ["route"], destination, imports: loaded.imports, modes: { appearance: "light" } }], { assets: new Map() });
    assert.equal(await readFile(sentinel, "utf8"), "preserve me");
    const htmlName = (await readdir(destination)).find((name) => name.endsWith(".html"));
    const html = await readFile(join(destination, htmlName), "utf8");
    const first = html.match(/id="route-a\/b-c"[^>]*src="([^"]+)"/u)?.[1];
    const second = html.match(/id="route-a-b\/c"[^>]*src="([^"]+)"/u)?.[1];
    assert.ok(first);
    assert.ok(second);
    assert.notEqual(first, second);
    assert.match(first, /^assets\/raster-\d+\.png$/u);
    assert.match(second, /^assets\/raster-\d+\.png$/u);
    for (const asset of new Set([first, second])) {
      const bytes = await readFile(join(destination, asset));
      assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    assert.match(html, /route-a\/b-c/u);
    assert.match(html, /route-a-b\/c/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
