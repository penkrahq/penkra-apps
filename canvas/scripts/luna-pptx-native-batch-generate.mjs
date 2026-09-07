import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { readOoxmlPackage, readXmlPart } from "../src/ooxml-package.mjs";
import { exportDocumentBatch } from "../src/export-service.mjs";
import { bindingsForExportSet, resolveExportDestinations } from "../src/export-delivery.mjs";

export const fortyCount = 40;
export const slideWidth = 800;
export const slideHeight = 450;
export const markerSize = 20;
export const markerColor = "#123456";

export function templateForDeckSlide() {
  return {
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
}

export function setsForForty() {
  return Array.from({ length: fortyCount }, (_, index) => ({
    output: `School ${index + 1}`,
    schoolName: `School ${index + 1}`,
    cardWidth: 100 + index,
  }));
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function relativePath(root, path) { return relative(root, path).split(sep).join("/"); }
function sha256(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function json(value) { return JSON.stringify(value, null, 2); }

function inspectPptx(bytes, school, index) {
  const xml = readXmlPart(readOoxmlPackage(bytes), "ppt/slides/slide1.xml");
  if (!xml.includes(`<a:t>${school}</a:t>`)) throw new Error(`Missing editable text for ${school}.`);
  if (xml.includes("<p:pic>")) throw new Error(`Picture fallback found for ${school}.`);
  const marker = xml.match(/name="marker"[\s\S]*?<a:off x="(\d+)" y="(\d+)"[\s\S]*?<a:ext cx="(\d+)" cy="(\d+)"/u);
  if (!marker) throw new Error(`Marker shape missing for ${school}.`);
  const markerPosition = { x: Number(marker[1]) / 12700, y: Number(marker[2]) / 12700, width: Number(marker[3]) / 12700, height: Number(marker[4]) / 12700 };
  if (!(markerPosition.width > 0 && markerPosition.height > 0)) throw new Error(`Marker shape has no positive extent for ${school}.`);
  return { index, school, markerPosition, editableText: true, pictureFallback: false };
}

export async function generatePptxCorpus({ evidenceRoot: requestedRoot } = {}) {
  const evidenceRoot = requestedRoot ?? await mkdtemp(join(tmpdir(), "canvas-luna-pptx-native-batch-"));
  const outputRoot = join(evidenceRoot, "pptx");
  await mkdir(outputRoot, { recursive: true });
  const document = deepFreeze(templateForDeckSlide());
  const before = structuredClone(document);
  const sets = setsForForty();
  const destinations = resolveExportDestinations(`${outputRoot}/`, sets, "pptx");
  const requests = sets.map((set, index) => ({ role: "slide", frames: ["slide"], destination: destinations[index], bindings: bindingsForExportSet(set) }));
  await exportDocumentBatch(document, requests, { assets: new Map(), title: "Forty-school native PowerPoint acceptance" });
  if (JSON.stringify(document) !== JSON.stringify(before)) throw new Error("PPTX source fixture was mutated.");
  const expectedNames = sets.map((set) => `${set.output}.pptx`);
  const actualNames = (await readdir(outputRoot)).sort();
  if (JSON.stringify(actualNames) !== JSON.stringify([...expectedNames].sort())) throw new Error("PPTX output names do not match the forty binding sets.");
  const semantic = [];
  const hashes = [];
  for (let index = 0; index < sets.length; index += 1) {
    const bytes = await readFile(destinations[index]);
    hashes.push({ index, school: sets[index].schoolName, path: relativePath(evidenceRoot, destinations[index]), sha256: sha256(bytes) });
    semantic.push(inspectPptx(bytes, sets[index].schoolName, index));
  }
  if (new Set(semantic.map((entry) => entry.markerPosition.x)).size !== fortyCount) throw new Error("Marker positions are not distinct across the forty PPTX files.");
  await writeFile(join(evidenceRoot, "source-fixture.json"), json({ document, sets, format: "pptx", role: "slide" }));
  await writeFile(join(evidenceRoot, "source-hashes.json"), json(hashes));
  await writeFile(join(evidenceRoot, "semantic.xml.json"), json(semantic));
  await writeFile(join(evidenceRoot, "generation-result.json"), json({ format: "pptx", artifactCount: fortyCount, artifacts: hashes.map((entry) => entry.path), hashes: hashes.map((entry) => entry.sha256), semantic: "semantic.xml.json" }));
  return { evidenceRoot, outputRoot, sets, destinations, hashes, semantic };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const researchRoot = fileURLToPath(new URL("../research/luna-pptx-native-batch-20260907/", import.meta.url));
  await mkdir(researchRoot, { recursive: true });
  const evidenceRoot = await mkdtemp(join(researchRoot, "run-"));
  try {
    const result = await generatePptxCorpus({ evidenceRoot });
    console.log(json({ evidenceRoot: relativePath(researchRoot, result.evidenceRoot), artifactCount: result.hashes.length, distinctMarkerPositions: new Set(result.semantic.map((entry) => entry.markerPosition.x)).size, failureCount: 0 }));
  } catch (error) {
    await writeFile(join(evidenceRoot, "generation-failure.json"), json({ message: error?.message ?? String(error) }));
    console.error(`PPTX corpus generation failed: ${error?.stack ?? error}`);
    process.exitCode = 1;
  }
}
