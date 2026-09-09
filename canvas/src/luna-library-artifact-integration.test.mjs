import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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
const RESEARCH_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../research/luna-library-artifact-integration-20260907");
const CORRECTED_CORPUS = join(RESEARCH_ROOT, "corrected");

function node(document, id) { return allNodes(document).find((candidate) => candidate.id === id); }
function style(document, id) { return document.paragraphStyles[node(document, id).paragraphs[0].style]; }
function importRecord(document, record) { document.imports.ui = record; return document; }

function bounded(promise, label, timeoutMs = 20_000) {
  // Observation timeout only: Promise.race does not cancel the underlying operation.
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
}

function crop(image, region) {
  const pixels = Buffer.alloc(region.width * region.height * image.channels);
  for (let y = 0; y < region.height; y += 1) {
    const sourceStart = ((region.y + y) * image.width + region.x) * image.channels;
    const destinationStart = y * region.width * image.channels;
    image.pixels.copy(pixels, destinationStart, sourceStart, sourceStart + region.width * image.channels);
  }
  return { width: region.width, height: region.height, channels: image.channels, pixels };
}

function assertColorRegion(image, color, region, label) {
  const observed = colorBounds(crop(image, region), color);
  assert.ok(Number.isFinite(observed.samples) && observed.samples > 0, `${label}: expected finite positive samples within expected region`);
  return observed;
}

function localReferences(html) {
  return [...html.matchAll(/\b(?:src|href)="([^"]+)"/gu)].map((match) => match[1]).filter((value) => !/^(?:[a-z][a-z0-9+.-]*:|#|\/)/iu.test(value));
}

async function validateRetainedCorpus(root, manifest, omitted = new Set()) {
  assert.equal(manifest.artifactCount, manifest.artifacts.length);
  const paths = new Set();
  for (const artifact of manifest.artifacts) {
    assert.equal(paths.has(artifact.path), false, `duplicate retained path ${artifact.path}`);
    paths.add(artifact.path);
    if (omitted.has(artifact.path)) throw new Error(`missing retained file ${artifact.path}`);
    const bytes = await readFile(join(root, artifact.path));
    assert.equal(bytes.length, artifact.bytes, artifact.path);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), artifact.sha256, artifact.path);
  }
  const htmlRecord = manifest.artifacts.find((artifact) => artifact.path.endsWith(".html"));
  assert.ok(htmlRecord, "retained HTML artifact is missing");
  const html = await readFile(join(root, htmlRecord.path), "utf8");
  for (const resource of localReferences(html)) {
    const resolvedPath = resolve(dirname(join(root, htmlRecord.path)), resource);
    assert.ok(resolvedPath === root || resolvedPath.startsWith(`${root}/`), `HTML resource escapes corpus: ${resource}`);
    const corpusRelative = relative(root, resolvedPath);
    assert.equal(paths.has(corpusRelative), true, `HTML resource omitted from manifest: ${resource}`);
    if (omitted.has(corpusRelative)) throw new Error(`missing retained file ${corpusRelative}`);
    await readFile(resolvedPath);
  }
  return { htmlRecord, html, paths };
}

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

    browser = await bounded(openBrowser(join(directory, "chrome"), context.signal), "integration browser startup");
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
    assert.equal(htmlPublication.rasterized.length, 0);
    assert.doesNotMatch(html, /class="node raster"/u);
    const htmlImage = decodePng(await bounded(browser.screenshot(pathToFileURL(htmlPath).href, 420, 240, 1), "integration HTML screenshot"));
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
    const svgImage = decodePng(await bounded(browser.screenshot(pathToFileURL(svgPath).href, 420, 240, 1), "integration SVG screenshot"));
    assert.ok(colorBounds(svgImage, LIGHT_V1).samples > 0);
    assert.ok(colorBounds(svgImage, DARK_V1).samples > 0);

    for (const mode of ["light", "dark"]) {
      const pdfPath = join(directory, `library-${mode}.pdf`);
      await extractDocumentNode(consumer, { nodeId: "art", format: "pdf", destination: pdfPath, modes: { appearance: mode } }, { ...ASSETS, imports: loaded.imports });
      const pdf = await inspectPdf(pdfPath);
      assert.equal(pdf.pages, 1);
      assert.equal(pdf.imageXObjectLines.length, 0);
      const pdfText = await runTool("pdftotext", [pdfPath, "-"]);
      for (const expectedText of ["Qualified style", "Library card", "Local style"]) assert.match(pdfText, new RegExp(expectedText, "u"));
      assert.match(await runTool("pdffonts", [pdfPath]), /Inter[\s\S]*\byes\b/u);
      const renderPrefix = join(directory, `library-${mode}-render`);
      await runTool("pdftoppm", ["-r", "72", "-png", pdfPath, renderPrefix]);
      const rendered = decodePng(await readFile(`${renderPrefix}-1.png`));
      assert.equal(rendered.width, 420);
      assert.equal(rendered.height, 240);
      assertColorRegion(rendered, mode === "light" ? LIGHT_V1 : DARK_V1, { x: 12, y: 12, width: 70, height: 40 }, `${mode} qualified variable`);
      assertColorRegion(rendered, DARK_V1, { x: 170, y: 65, width: 140, height: 70 }, `${mode} source-local dark card`);
      assertColorRegion(rendered, LOCAL_BODY, { x: 12, y: 150, width: 140, height: 30 }, `${mode} consumer-local text`);
    }
    assert.equal((await readdir(directory)).some((name) => /staging|\.tmp/u.test(name)), false);
    assert.deepEqual(consumer, consumerBefore);
  } finally {
    if (browser) await bounded(browser.close(), "integration browser close");
    await rm(directory, { recursive: true, force: true });
  }
});

test("library artifact collision preflight is atomic and mobile fallbacks publish complete bundles", async () => {
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
      const result = await exportDocumentBatch(consumer, [{ role, frames: [role], destination, imports: loaded.imports, modes: { appearance: "light" } }], { assets: new Map() });
      assert.equal(result.rasterized.length > 0, true);
      assert.equal((await readdir(destination)).length > 0, true);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("web semantic nodes retain distinct slash-qualified IDs that hyphen replacement would collide", async () => {
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
    assert.match(html, /<p id="route-a\/b-c"[^>]*>[^<]*<span[^>]*>First/u);
    assert.match(html, /<p id="route-a-b\/c"[^>]*>[^<]*<span[^>]*>Second/u);
    assert.doesNotMatch(html, /class="node raster"/u);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("corrected retained corpus hashes every file, resolves every HTML resource, and passes semantic checks", { timeout: 60_000 }, async (context) => {
  const manifest = JSON.parse(await readFile(join(CORRECTED_CORPUS, "manifest.json"), "utf8"));
  const retained = await validateRetainedCorpus(CORRECTED_CORPUS, manifest);
  await assert.rejects(validateRetainedCorpus(CORRECTED_CORPUS, manifest, new Set(["html/assets/raster-4.png"])), /missing retained file/u);

  for (const artifact of manifest.artifacts.filter(({ path }) => path.endsWith(".png"))) {
    assert.deepEqual((await readFile(join(CORRECTED_CORPUS, artifact.path))).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  const pptxPath = join(CORRECTED_CORPUS, "library.pptx");
  const pptxXml = readXmlPart(readOoxmlPackage(await readFile(pptxPath)), "ppt/slides/slide1.xml");
  for (const expectedText of ["Qualified style", "Library card"]) assert.match(pptxXml, new RegExp(expectedText, "u"));
  assert.match(pptxXml, /123456/iu);
  assert.match(pptxXml, /abcdef/iu);
  assert.doesNotMatch(pptxXml, /<p:pic>/u);

  const svgText = await readFile(join(CORRECTED_CORPUS, "library.svg"), "utf8");
  const svg = parseSvg(svgText);
  assert.deepEqual(svg.viewBox, [0, 0, 420, 240]);
  assert.equal(svg.hasImage, true);
  assert.match(svgText, /#123456/iu);
  assert.match(svgText, /#abcdef/iu);
  assert.match(svgText, /<rect\b/u);

  const pdfPath = join(CORRECTED_CORPUS, "library.pdf");
  const pdf = await inspectPdf(pdfPath);
  assert.equal(pdf.pages, 1);
  assert.equal(pdf.imageXObjectLines.length, 0);
  const pdfText = await runTool("pdftotext", [pdfPath, "-"]);
  for (const expectedText of ["Qualified style", "Library card", "Local style"]) assert.match(pdfText, new RegExp(expectedText, "u"));
  assert.match(await runTool("pdffonts", [pdfPath]), /Inter[\s\S]*\byes\b/u);
  const pdfTemp = await mkdtemp(join(tmpdir(), "canvas-library-retained-pdf-"));
  try {
    const renderPrefix = join(pdfTemp, "library");
    await runTool("pdftoppm", ["-r", "72", "-png", pdfPath, renderPrefix]);
    const rendered = decodePng(await readFile(`${renderPrefix}-1.png`));
    assert.equal(rendered.width, 420);
    assert.equal(rendered.height, 240);
    assertColorRegion(rendered, LIGHT_V1, { x: 12, y: 12, width: 70, height: 40 }, "retained qualified variable");
    assertColorRegion(rendered, DARK_V1, { x: 170, y: 65, width: 140, height: 70 }, "retained source-local dark card");
    assertColorRegion(rendered, LOCAL_BODY, { x: 12, y: 150, width: 140, height: 30 }, "retained consumer-local text");
  } finally { await rm(pdfTemp, { recursive: true, force: true }); }

  const profile = await mkdtemp(join(tmpdir(), "canvas-library-retained-browser-"));
  let browser;
  try {
    browser = await bounded(openBrowser(profile, context.signal), "retained browser startup");
    const htmlImage = decodePng(await bounded(browser.screenshot(pathToFileURL(join(CORRECTED_CORPUS, retained.htmlRecord.path)).href, 420, 240, 1), "retained HTML screenshot"));
    assertColorRegion(htmlImage, LIGHT_V1, { x: 12, y: 12, width: 70, height: 40 }, "retained HTML light variable");
    assertColorRegion(htmlImage, DARK_V1, { x: 170, y: 65, width: 140, height: 70 }, "retained HTML dark component");
    assertColorRegion(htmlImage, LOCAL_BODY, { x: 12, y: 150, width: 140, height: 30 }, "retained HTML local text");
  } finally {
    if (browser) await bounded(browser.close(), "retained browser close");
    await rm(profile, { recursive: true, force: true });
  }
});
