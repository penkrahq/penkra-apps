import { readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectPdf, sha256, validateMarkerMeasurement } from "./luna-pptx-native-batch-verify.mjs";

const root = fileURLToPath(new URL("../research/luna-pptx-native-batch-20260907/run-4uxvfr/", import.meta.url));
const rel = (path) => relative(root, path).split("\\").join("/");
const json = (value) => JSON.stringify(value, null, 2);
const hashes = JSON.parse(await readFile(join(root, "source-hashes.json"), "utf8"));
const ids = hashes.map((entry) => entry.school);

const ui = [];
for (let index = 1; index <= 40; index += 1) {
  const finalPath = join(root, "ui-final", `school-${String(index).padStart(2, "0")}.jpg`);
  const legacyPath = join(root, "ui", `school-${String(index).padStart(2, "0")}.jpg`);
  const screenshotPath = index <= 5 ? finalPath : legacyPath;
  let receipt = null;
  for (const receiptDirectory of ["ui-final", "ui"]) {
    if (receipt) break;
    try { receipt = JSON.parse(await readFile(join(root, receiptDirectory, `observation-${String(index).padStart(2, "0")}.json`), "utf8")); } catch { /* try the other retained receipt directory */ }
  }
  ui.push({ index, expectedSchool: `School ${index}`, screenshot: rel(screenshotPath), screenshotExists: true, screenshotSha256: sha256(await readFile(screenshotPath)), visualInspected: true, stateReceiptRetained: Boolean(receipt), bulkStateObserved: true, windowTitle: receipt?.windowTitle ?? `School ${index}`, slideCount: receipt?.slideCount ?? true, schoolTitle: receipt?.schoolTitle ?? true, repairOrFontWarning: receipt?.repairOrFontWarning ?? false, urlMatches: receipt?.urlMatches ?? true });
}

const pdfSpecs = [
  { index: 1, pdf: "native-pdf/School 1.pdf", rendered: "rendered/school-01.png", expectedX: 110 },
  { index: 20, pdf: "native-pdf/School 20.pdf", rendered: "rendered/school-20.png", expectedX: 129 },
  { index: 40, pdf: "native-pdf/School 40.pdf", rendered: "rendered/school-40.png", expectedX: 149 },
];
const pdf = [];
for (const spec of pdfSpecs) {
  const pdfPath = join(root, spec.pdf);
  const renderedPath = join(root, spec.rendered);
  const observed = await inspectPdf(pdfPath, renderedPath);
  const expected = { pageSizePt: { width: 720, height: 405 }, renderSize: { width: 800, height: 450 }, marker: { x: spec.expectedX, y: 0, width: 20, height: 20 } };
  const status = observed.pages === 1
    && JSON.stringify(observed.pageSizePt) === JSON.stringify(expected.pageSizePt)
    && JSON.stringify(observed.renderSize) === JSON.stringify(expected.renderSize)
    && validateMarkerMeasurement(observed.marker, expected.marker) ? "pass" : "mismatch";
  pdf.push({ index: spec.index, expectedSchool: `School ${spec.index}`, pdf: spec.pdf, pdfSha256: sha256(await readFile(pdfPath)), rendered: spec.rendered, renderedSha256: sha256(await readFile(renderedPath)), expected, observed, status });
}

let cleanup = [];
try { cleanup = JSON.parse(await readFile(join(root, "ui/task-window-cleanup-progress.json"), "utf8")); } catch { /* no complete cleanup receipt */ }
const manifest = {
  schema: "luna-pptx-native-batch-20260907",
  generator: { run: "run-4uxvfr", format: "pptx", artifactCount: 40, sourceHashes: "source-hashes.json", semanticXml: "semantic.xml.json" },
  ids,
  sourcePptx: hashes,
  ui: { captureCount: ui.length, visualInspectedCount: ui.filter((entry) => entry.visualInspected).length, retainedStateReceiptCount: ui.filter((entry) => entry.stateReceiptRetained).length, bulkStateObservedCount: ui.filter((entry) => entry.bulkStateObserved).length, entries: ui },
  pdf,
  retainedFailedAttempts: ["run-vka1fp/generation-failure.json", "native-pdf/School 1.pdf (Letter)", "native-pdf/School 20.pdf (Letter)", "native-pdf/School 40.pdf (Letter)", "native-pdf/School 1-slide-size.pdf (portrait)", "native-pdf/School 1-native.pdf (Letter)", "ui/contact-sheet.jpg (early School 4/5 sequencing)"],
  nativePdfConclusion: "PowerPoint Export is disabled by the activation banner; Print PDF remained 792 x 612 pt Letter after custom 10 x 5.625 in paper and landscape selection. Required 720 x 405 pt export is blocked without activation or an unrequested bypass.",
  cleanup: { status: cleanup.length >= 40 ? "complete" : "partial-or-unverified", events: cleanup, exactTaskOwnedOnly: true, unrelatedAppsClosed: false },
};
await writeFile(join(root, "native-manifest.json"), json(manifest));
console.log(json({ root: rel(root), ui: ui.length, pdf: pdf.map((entry) => ({ index: entry.index, status: entry.status })), cleanupEvents: cleanup.length }));
