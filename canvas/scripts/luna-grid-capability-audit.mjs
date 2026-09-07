import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const requiredRoots = {
  combinedCanvasRoot: process.env.CANVAS_GRID_COMBINED_CANVAS_ROOT,
  iosEvidenceRoot: process.env.CANVAS_GRID_IOS_EVIDENCE_ROOT,
  androidCanvasRoot: process.env.CANVAS_GRID_ANDROID_CANVAS_ROOT,
  androidEvidenceRoot: process.env.CANVAS_GRID_ANDROID_EVIDENCE_ROOT,
};
for (const [name, value] of Object.entries(requiredRoots)) {
  if (!value) throw new Error(`CANVAS_GRID_${name.replace(/[A-Z]/gu, (letter) => `_${letter}`).toUpperCase()} is required for the retained-evidence audit.`);
}
const roots = Object.fromEntries(Object.entries(requiredRoots).map(([name, value]) => [name, resolve(value)]));

function sourceHash(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
async function readJson(path) { return JSON.parse(await readFile(path, "utf8")); }
async function importFrom(root, relativePath) { return import(pathToFileURL(join(root, relativePath)).href); }

async function auditIos() {
  const ios = await importFrom(roots.combinedCanvasRoot, "scripts/luna-ios-grid-production.mjs");
  const { buildGridDocument, buildGridSources, GRID_CASE_IDS, GRID_COLS, GRID_ROWS, GRID_PLACEMENTS, sourceFileNameForOutput, sourceHashReceipt } = ios;
  const document = buildGridDocument();
  assert.equal(document.children.length, 13);
  assert.deepEqual(GRID_COLS, [[100, 180], [180, 100]]);
  assert.deepEqual(GRID_ROWS, [[60, 100], [100, 60]]);
  assert.deepEqual(GRID_PLACEMENTS.map(({ id }) => id), ["normal", "reversed", "only-2-2"]);
  const gridNodes = document.children.map((frame) => frame.children[0]);
  assert.ok(gridNodes.every((grid) => grid.layout === "grid" && grid.columnGap === 10 && grid.rowGap === 15));
  assert.deepEqual(gridNodes.at(-1).padding, [11, 12, 13, 14]);
  assert.equal(gridNodes.at(-1).children.at(-1).layoutPosition, "absolute");
  assert.ok(gridNodes.slice(0, 12).some((grid) => grid.children.map(({ id }) => id).join(",") === "cell-d,cell-c,cell-b,cell-a"));
  assert.ok(gridNodes.slice(0, 12).some((grid) => grid.children.length === 1 && grid.children[0].gridColumn === 2 && grid.children[0].gridRow === 2));
  assert.ok(gridNodes.slice(0, 12).every((grid) => grid.children.every((child) => !Object.hasOwn(child, "gridColumnSpan") && !Object.hasOwn(child, "gridRowSpan"))));

  const { buildCapabilityVerificationIR } = await importFrom(roots.combinedCanvasRoot, "src/exporter-ir.mjs");
  const { capabilityPathInventory } = await importFrom(roots.combinedCanvasRoot, "src/canvas-schema.mjs");
  for (const tracks of [[100, 180], [180, 100], [0, 240], [-1, 240], [10.5, 20.25], [], [240]]) {
    const numeric = {
      version: "2.17", module: "mobile", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
      children: [{ id: "screen", type: "frame", role: "ios", width: 320, height: 240, layout: "none", children: [{
        id: "grid", type: "frame", width: 320, height: 240, layout: "grid", gridTemplateColumns: tracks,
        gridTemplateRows: [60, 100], columnGap: 10, rowGap: 15, padding: [11, 12, 13, 14], children: [
          { id: "first", type: "rectangle", width: 40, height: 30, gridColumn: 1, gridRow: 1, fill: "#123456" },
          { id: "second", type: "rectangle", width: 40, height: 30, gridColumn: 2, gridRow: 2, fill: "#654321" },
        ],
      }] }],
    };
    const ir = buildCapabilityVerificationIR(numeric, { role: "ios", frames: ["screen"] }, capabilityPathInventory());
    for (const id of ["first", "second"]) {
      const node = ir.outputs[0].nodes.find((candidate) => candidate.id === id);
      assert.ok(node && Number.isFinite(node.geometry.localX) && Number.isFinite(node.geometry.localY), `${JSON.stringify(tracks)}/${id}`);
      assert.ok(node.geometry.w > 0 && node.geometry.h > 0, `${JSON.stringify(tracks)}/${id}`);
    }
  }
  for (const track of ["fill_container", "fit_content"]) {
    const unsupported = structuredClone(document);
    for (const frame of unsupported.children) frame.children[0].gridTemplateColumns = [track, 100];
    assert.throws(() => buildCapabilityVerificationIR(unsupported, { role: "ios", frames: [unsupported.children[0].id] }, capabilityPathInventory()), new RegExp(`Invalid grid track ${track.replaceAll("_", "\\_")}`));
  }

  const { ir, sources } = buildGridSources();
  assert.deepEqual(ir.outputs.map(({ id }) => id), GRID_CASE_IDS);
  for (const output of ir.outputs) {
    const children = output.nodes.filter(({ id }) => /^cell-[a-d]$/u.test(id));
    assert.equal(children.length, output.id.includes("only-2-2") ? 1 : 4, output.id);
    const swift = sources.get(sourceFileNameForOutput(output));
    assert.ok(swift, `missing generated Swift for ${output.id}`);
    assert.doesNotMatch(swift, /LazyVGrid|\.padding\(/u, output.id);
    for (const child of children) {
      assert.ok(Number.isFinite(child.geometry.localX) && Number.isFinite(child.geometry.localY));
      assert.ok(child.geometry.w > 0 && child.geometry.h > 0);
      assert.match(swift, new RegExp(`\\.position\\(x: ${child.geometry.localX + child.geometry.w / 2}, y: ${child.geometry.localY + child.geometry.h / 2}\\)`, "u"), `${output.id}/${child.id}`);
    }
  }
  const receipt = await readJson(join(roots.iosEvidenceRoot, "source-hashes.json"));
  assert.deepEqual(sourceHashReceipt(sources), receipt);
  for (const file of receipt.files) {
    const bytes = await readFile(join(roots.iosEvidenceRoot, "swift", file.path));
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(sourceHash(bytes), file.sha256, file.path);
  }
  for (const run of ["native-run-02", "native-run-02-missing-five", "native-run-02-missing-one-fixed"]) {
    const runReceipt = await readJson(join(roots.iosEvidenceRoot, run, "source-hashes.json"));
    assert.deepEqual(runReceipt, receipt, run);
  }

  const run02 = await readJson(join(roots.iosEvidenceRoot, "native-run-02/measurements.json"));
  const missingFive = await readJson(join(roots.iosEvidenceRoot, "native-run-02-missing-five/measurements.json"));
  const missingOne = await readJson(join(roots.iosEvidenceRoot, "native-run-02-missing-one-fixed/measurements.json"));
  const identity = (entry) => [entry.caseID, entry.deviceId, entry.contentSize].join("|");
  assert.equal(run02.entries.length, 39);
  assert.equal(new Set(run02.entries.map(identity)).size, 39);
  assert.deepEqual(run02.counts, { entries: 39, primaryEntries: 36, controlEntries: 3, measured: 34, pass: 34, fail: 0, unmeasured: 5 });
  assert.equal(missingFive.entries.length, 5);
  assert.equal(missingFive.entries.filter(({ status }) => status === "pass").length, 4);
  assert.equal(missingFive.entries.filter(({ status }) => status === "unmeasured").length, 1);
  assert.equal(missingOne.entries.length, 1);
  const union = new Map(run02.entries.map((entry) => [identity(entry), entry]));
  for (const entry of [...missingFive.entries, ...missingOne.entries]) {
    assert.ok(union.has(identity(entry)), `correction introduced unknown identity ${identity(entry)}`);
    union.set(identity(entry), entry);
  }
  assert.equal(union.size, 39);
  assert.ok([...union.values()].every(({ status }) => status === "pass"));
  assert.equal(run02.failures.length, 5, "original launch failures remain retained");
  assert.ok(run02.failures.every(({ status, reason }) => status === "unmeasured" && reason === "simctl launch failed"));
  return { sourceFiles: receipt.files.length, primary: 36, correctionEntries: 6, unionEntries: union.size, finalPass: [...union.values()].filter(({ status }) => status === "pass").length };
}

async function auditAndroid() {
  const android = await importFrom(roots.androidCanvasRoot, "scripts/luna-android-grid-production-generate.mjs");
  const { exportCompose } = await importFrom(roots.androidCanvasRoot, "src/exporters/mobile.mjs");
  const manifest = await readJson(join(roots.androidEvidenceRoot, "artifact-manifest.json"));
  assert.equal(manifest.caseCount, 12);
  assert.equal(manifest.measurementCount, 48);
  assert.equal(manifest.captureCount, 48);
  assert.equal(manifest.controlCaptureCount, 2);
  for (const record of manifest.files) {
    const bytes = await readFile(join(roots.androidEvidenceRoot, record.path));
    assert.equal(bytes.length, record.bytes, record.path);
    assert.equal(sourceHash(bytes), record.sha256, record.path);
  }
  const measurements = await readJson(join(roots.androidEvidenceRoot, "measurements.json"));
  assert.equal(measurements.length, 48);
  assert.equal(new Set(measurements.map((entry) => `${entry.caseId}|${entry.host}|${entry.density}|${entry.fontScale}`)).size, 48);
  assert.ok(measurements.every((entry) => entry.status === "pass" && entry.comparedPixels > 0 && entry.mismatchedPixels === 0));
  for (const caseId of android.CASE_IDS) {
    const built = android.buildGridDiagnosticCase(caseId);
    const generated = exportCompose(built.ir);
    for (const [file, contents] of generated) {
      const relativePath = join(caseId, "generated/exact", file.replace(/^_canvas[\\/]/u, ""));
      const record = manifest.files.find(({ path }) => path === relativePath.replaceAll("\\", "/"));
      assert.ok(record, `missing retained generated source ${relativePath}`);
      assert.equal(Buffer.byteLength(contents), record.bytes, relativePath);
      assert.equal(sourceHash(Buffer.from(contents)), record.sha256, relativePath);
    }
  }
  const original = await readJson(join(roots.androidEvidenceRoot, "control-padding-absolute/measurement-control-320-font-2.json"));
  const translated = await readJson(join(roots.androidEvidenceRoot, "translated-control-y110/measurement-translated-320-font-2.json"));
  assert.equal(original.status, "fail");
  assert.equal(original.mismatchedPixels, 131);
  assert.equal(translated.status, "pass");
  assert.equal(translated.mismatchedPixels, 0);
  assert.notDeepEqual(original, translated, "translated control is diagnostic evidence, not a replacement");
  return { manifestFiles: manifest.files.length, measurements: measurements.length, generatedCases: android.CASE_IDS.length, originalControl: { status: original.status, mismatchedPixels: original.mismatchedPixels }, translatedControl: { status: translated.status, mismatchedPixels: translated.mismatchedPixels } };
}

const [ios, android] = await Promise.all([auditIos(), auditAndroid()]);
console.log(JSON.stringify({ roots, ios, android }, null, 2));
