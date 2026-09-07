import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readOoxmlPackage, readXmlPart } from "./ooxml-package.mjs";
import { exportDocumentBatch } from "./export-service.mjs";
import { bindingsForExportSet, exportRoleForFormat, resolveExportDestinations } from "./export-delivery.mjs";

const formats = [
  { format: "pptx", module: "deck", role: "slide" },
  { format: "html", module: "web", role: "route" },
  { format: "swift", module: "mobile", role: "ios" },
  { format: "kotlin", module: "mobile", role: "android" },
];

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function templateFor(module, role) {
  return {
    version: "2.17", module, axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [{
      id: "slide", type: "frame", role, width: 800, height: 450,
      physical: { w: 10, h: 5.625, unit: "in" }, layout: "horizontal", gap: 10,
      children: [
        { id: "school", type: "text", width: "${cardWidth}", height: 50, content: "${schoolName}", fontFamily: "Inter", fontSize: 24, paragraphs: [], marks: [] },
        { id: "marker", type: "rectangle", width: 20, height: 20, fill: "#123456" },
      ],
    }],
  };
}

function setsForForty() {
  return Array.from({ length: 40 }, (_, index) => ({
    output: `School ${index + 1}`,
    schoolName: `School ${index + 1}`,
    cardWidth: 100 + index,
  }));
}

async function expectCode(action, code) {
  await assert.rejects(action, { code });
}

async function assertMissing(path) { await assert.rejects(readdir(path), { code: "ENOENT" }); }

test("forty-set publication generates 80 distinct native/editable artifacts across PPTX and HTML", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-four-format-batch-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sets = setsForForty();
  const topLevel = [];

  for (const { format, module, role } of formats.slice(0, 2)) {
    assert.equal(exportRoleForFormat(format), role);
    const document = deepFreeze(templateFor(module, role));
    const before = structuredClone(document);
    const parent = join(root, format);
    const destinations = resolveExportDestinations(`${parent}/`, sets, format);
    const requests = sets.map((set, index) => ({
      role, frames: ["slide"], destination: destinations[index], bindings: bindingsForExportSet(set),
    }));
    const result = await exportDocumentBatch(document, requests, { assets: new Map(), title: `Forty ${format}` });
    assert.deepEqual(document, before, `${format} template was mutated`);

    const expectedNames = Array.from({ length: 40 }, (_, index) => `School ${index + 1}${format === "pptx" ? ".pptx" : ""}`);
    assert.deepEqual((await readdir(parent)).sort(), [...expectedNames].sort(), `${format} top-level output names`);
    assert.equal(new Set(expectedNames).size, 40);
    topLevel.push(...expectedNames.map((name) => join(parent, name)));
    for (const destination of destinations) assert.ok((await readdir(parent)).includes(destination.split("/").at(-1)));
    const markerPositions = new Set();

    for (let index = 0; index < 40; index += 1) {
      const school = `School ${index + 1}`;
      const width = 100 + index;
      const destination = destinations[index];
      if (format === "pptx") {
        const xml = readXmlPart(readOoxmlPackage(await readFile(destination)), "ppt/slides/slide1.xml");
        assert.match(xml, new RegExp(`<a:t>${school}</a:t>`, "u"));
        assert.doesNotMatch(xml, /\$\{(?:schoolName|cardWidth)\}/u);
        assert.doesNotMatch(xml, /<p:pic>/u);
        const marker = xml.match(/name="marker"[\s\S]*?<a:off x="(\d+)"/u);
        assert.ok(marker);
        markerPositions.add(marker[1]);
      } else if (format === "html") {
        const html = await readFile(join(destination, "slide.html"), "utf8");
        assert.match(html, new RegExp(school, "u"));
        assert.match(html, new RegExp(`id="school"[^>]*width:${width}px;height:50px`, "u"));
        assert.match(html, /id="marker"[^>]*width:20px;height:20px/u);
        assert.doesNotMatch(html, /\$\{(?:schoolName|cardWidth)\}/u);
      } else if (format === "swift") {
        const swift = await readFile(join(destination, "Slide.swift"), "utf8");
        assert.match(swift, new RegExp(`Text\\(\"${school}\"\\)`, "u"));
        assert.match(swift, new RegExp(`\\.frame\\(width: ${width}, height: 50`, "u"));
        assert.match(swift, /\.frame\(width: 20, height: 20/u);
        assert.doesNotMatch(swift, /\$\{(?:schoolName|cardWidth)\}/u);
      } else {
        const kotlin = await readFile(join(destination, "Slide.kt"), "utf8");
        assert.match(kotlin, new RegExp(`append\\(\"${school}\"\\)`, "u"));
        assert.match(kotlin, new RegExp(`\\.size\\(${width}\\.dp, 50\\.dp\\)`, "u"));
        assert.match(kotlin, /\.size\(20\.dp, 20\.dp\)/u);
        assert.doesNotMatch(kotlin, /\$\{(?:schoolName|cardWidth)\}/u);
      }
    }
    if (format === "pptx") assert.equal(markerPositions.size, 40);
    assert.equal(result.artifacts.length > 0, true);
  }

  assert.equal(new Set(topLevel).size, 80);
  for (const format of formats.slice(0, 2)) {
    const parent = join(root, format.format);
    const siblings = await readdir(parent);
    assert.equal(siblings.some((name) => name.startsWith(".")), false, `${format.format} staging sibling`);
  }
});

async function assertMobileCapabilityGate(format, module, role, context) {
  const root = await mkdtemp(join(tmpdir(), `canvas-${format}-gate-`));
  context.after(() => rm(root, { recursive: true, force: true }));
  const sets = setsForForty();
  const parent = join(root, format);
  const destinations = resolveExportDestinations(`${parent}/`, sets, format);
  const error = await (async () => {
    try {
      await exportDocumentBatch(deepFreeze(templateFor(module, role)), sets.map((set, index) => ({
        role, frames: ["slide"], destination: destinations[index], bindings: bindingsForExportSet(set),
      })), { assets: new Map(), title: `Forty ${format} gate` });
    } catch (caught) { return caught; }
    return null;
  })();
  assert.ok(error, `${format} unexpectedly generated artifacts`);
  assert.equal(error.code, "CANVAS_CAPABILITY_UNVERIFIED");
  assert.match(error.message, /root\.axes/u);
  assert.doesNotMatch(error.message, /properties\.layout/u);
  await assertMissing(parent);
}

test("Swift forty-set exact template remains blocked by the observed capability gate", async (context) => {
  await assertMobileCapabilityGate("swift", "mobile", "ios", context);
});

test("Kotlin forty-set exact template remains blocked by the observed capability gate", async (context) => {
  await assertMobileCapabilityGate("kotlin", "mobile", "android", context);
});

test("each deliverable format rejects colliding destinations before missing-frame rendering", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-four-format-collision-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  for (const { format, module, role } of formats) {
    const parent = join(root, format);
    const suffix = format === "pptx" ? ".pptx" : "";
    const destinations = [join(parent, `A${suffix}`), join(parent, `a${suffix}`)];
    await expectCode(() => exportDocumentBatch(templateFor(module, role), destinations.map((destination) => ({ role, frames: ["missing"], destination })), { assets: new Map() }), "CANVAS_EXPORT_COLLISION");
    await assertMissing(parent);
  }
});
