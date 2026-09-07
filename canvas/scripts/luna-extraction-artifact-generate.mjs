import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { extractDocumentNode, extractDocumentNodes } from "../src/export-service.mjs";
import {
  MARKER, ROLELESS_SPECS, TRIANGLE, colorBounds, compareMarkerBounds, compareTriangleMeasurement, decodePng, inspectPdf, inspectPdfPages, parseSvg, rolelessDocument, sha256, triangleMeasurement,
} from "./luna-extraction-artifact-fixtures.mjs";

const formats = ["png", "svg", "pdf"];
const multiSpecs = [ROLELESS_SPECS[0], ROLELESS_SPECS[3], ROLELESS_SPECS[6]];
const assets = { assets: new Map() };

function arg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function pngExpected(spec) { return { width: spec.width * 2, height: spec.height * 2, marker: { x: 20, y: 24, width: 40, height: 32 } }; }
function triangleExpected(scale = 1) { return { x: TRIANGLE.x * scale, y: TRIANGLE.y * scale, width: TRIANGLE.width * scale, height: TRIANGLE.height * scale }; }

async function inspectArtifact(path, format, spec, scale = 1) {
  if (format === "png") {
    const image = decodePng(await readFile(path));
    const expected = scale === 2 ? pngExpected(spec) : { width: spec.width, height: spec.height, marker: MARKER };
    const comparison = compareMarkerBounds(colorBounds(image), { ...expected.marker, samples: 1 });
    const triangle = triangleMeasurement(image, triangleExpected(scale));
    const triangleComparison = compareTriangleMeasurement(triangle, triangleExpected(scale));
    if (image.width !== expected.width || image.height !== expected.height || !comparison.ok || !triangleComparison.ok) throw new Error(`PNG measurement mismatch for ${spec.id}: ${JSON.stringify({ image: { width: image.width, height: image.height }, comparison, triangle, triangleComparison })}`);
    return { dimensions: { width: image.width, height: image.height }, marker: colorBounds(image), triangle, hash: sha256(await readFile(path)) };
  }
  if (format === "svg") {
    const svg = parseSvg(await readFile(path, "utf8"));
    if (JSON.stringify(svg.viewBox) !== JSON.stringify([0, 0, spec.width, spec.height]) || !svg.marker || !svg.triangle || svg.hasImage) throw new Error(`SVG semantic mismatch for ${spec.id}.`);
    return { viewBox: svg.viewBox, marker: svg.marker, triangle: svg.triangle, hash: sha256(await readFile(path)) };
  }
  const pdf = await inspectPdf(path, { ...MARKER, samples: 1 }, 2, triangleExpected());
  if (pdf.pages !== 1 || JSON.stringify(pdf.pageSize) !== JSON.stringify({ width: spec.width, height: spec.height }) || !pdf.markerComparison?.ok || !pdf.triangleComparison?.ok || pdf.imageXObjectLines.length) throw new Error(`PDF measurement mismatch for ${spec.id}: ${JSON.stringify(pdf)}`);
  return { pages: pdf.pages, pageSize: pdf.pageSize, rendered: pdf.rendered, marker: pdf.marker, triangle: pdf.triangle, imageXObjectLines: pdf.imageXObjectLines, hash: sha256(await readFile(path)) };
}

async function main() {
  const output = arg("--output");
  if (!output || output.startsWith("-")) throw new Error("Usage: node scripts/luna-extraction-artifact-generate.mjs --output <new-research-corpus-directory>");
  await mkdir(dirname(output), { recursive: true });
  await mkdir(output, { recursive: false });
  await mkdir(join(output, "artifacts"));
  const temporary = await mkdtemp(join(tmpdir(), "canvas-roleless-extraction-generator-"));
  const document = rolelessDocument();
  const selected = new Set(ROLELESS_SPECS.map((spec, index) => `${spec.id}/${formats[index % formats.length]}`));
  const retained = [];
  const measurements = [];
  let passed = 0;
  try {
    for (const [index, spec] of ROLELESS_SPECS.entries()) for (const format of formats) {
      const path = join(temporary, "single", `${spec.id}.${format}`);
      await mkdir(dirname(path), { recursive: true });
      await extractDocumentNode(document, { nodeId: spec.id, format, ...(format === "png" ? { scale: 2 } : {}), destination: path }, assets);
      const measurement = await inspectArtifact(path, format, spec, format === "png" ? 2 : 1);
      const key = `${spec.id}/${format}`;
      const record = { case: "single", id: spec.id, format, sourceIndex: index, hash: measurement.hash, measurement, retained: selected.has(key) };
      measurements.push(record); passed += 1;
      if (selected.has(key)) {
        const retainedPath = join(output, "artifacts", `${spec.id}.${format}`);
        await copyFile(path, retainedPath);
        retained.push({ ...record, path: `artifacts/${spec.id}.${format}` });
      }
    }
    const directoryRecords = [];
    for (const format of formats) {
      const dir = join(temporary, `directory-${format}`);
      const result = await extractDocumentNodes(document, { node: multiSpecs.map((spec) => spec.id), format, destination: `${dir}/`, ...(format === "png" ? { scale: 2 } : {}) }, assets);
      const artifacts = [];
      for (const spec of multiSpecs) {
        const path = join(dir, `${spec.id}.${format}`);
        artifacts.push({ id: spec.id, path: `directory-${format}/${spec.id}.${format}`, hash: sha256(await readFile(path)) });
      }
      directoryRecords.push({ format, artifacts, resultArtifacts: result.artifacts.map((path) => path.split("/").at(-1)) });
    }
    const multiPath = join(temporary, "multi.pdf");
    const multiResult = await extractDocumentNodes(document, { node: multiSpecs.map((spec) => spec.id), format: "pdf", destination: multiPath }, assets);
    const multiInspection = await inspectPdfPages(multiPath, multiSpecs.map(() => ({ marker: { ...MARKER, samples: 1 }, triangle: triangleExpected() })));
    const physicalPath = join(temporary, "physical.pdf");
    const physicalDocument = structuredClone(document);
    Object.assign(physicalDocument.children[0], { physical: { w: 210, h: 297, unit: "mm" }, bleed: 9 });
    await extractDocumentNode(physicalDocument, { nodeId: ROLELESS_SPECS[0].id, format: "pdf", destination: physicalPath }, assets);
    const unverifiedPath = join(temporary, "unverified.pdf");
    let x4Code = null;
    try { await extractDocumentNode(document, { nodeId: ROLELESS_SPECS[0].id, format: "pdf", profile: "PDF/X-4", destination: unverifiedPath }, assets); }
    catch (error) { x4Code = error.code ?? "UNCLASSIFIED"; }
    const manifest = {
      kind: "roleless-extraction-artifact-matrix",
      retainedCount: retained.length,
      retained,
      artifactRoot: "artifacts",
      noAbsolutePaths: true,
    };
    const summary = {
      singleArtifacts: { requested: 36, passed },
      directoryArtifacts: { requested: 9, passed: directoryRecords.reduce((count, row) => count + row.artifacts.length, 0), records: directoryRecords },
      multiPdf: { requested: 1, pages: multiResult.units, pageMeasurements: multiInspection.renderedPages, hash: sha256(await readFile(multiPath)) },
      physicalPdf: { hash: sha256(await readFile(physicalPath)), measurement: await inspectPdf(physicalPath, { x: 19, y: 21, width: 20, height: 16, samples: 1 }) },
      rejected: { multiPngSvg: "CANVAS_EXTRACT_FORMAT_SINGLE_UNIT", pdfX4: x4Code },
    };
    await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    await writeFile(join(output, "measurements.json"), `${JSON.stringify({ retained, single: measurements, summary }, null, 2)}\n`);
    const report = [
      "# Roleless extraction artifact matrix evidence",
      "",
      "This retained corpus records generated extraction bytes and semantic measurements; it is not an overall conformance claim.",
      "",
      `- Single-node artifacts: ${passed}/36 passed (PNG/SVG/PDF across 12 roleless roots).`,
      `- Directory artifacts: ${summary.directoryArtifacts.passed}/9 passed.`,
      `- Multi-unit PDF: ${summary.multiPdf.pages} pages in requested order.`,
      `- Multi-unit PNG/SVG rejection: ${summary.rejected.multiPngSvg}.`,
      `- PDF/X-4 rejection: ${summary.rejected.pdfX4}.`,
      `- Retained representative artifacts: ${retained.length}, under artifacts/.`,
      "- Temporary complete matrix outputs were removed after measurement; only representative artifacts and JSON manifests are retained.",
    ].join("\n");
    await writeFile(join(output, "verification.md"), `${report}\n`);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1]?.endsWith("luna-extraction-artifact-generate.mjs")) await main();
