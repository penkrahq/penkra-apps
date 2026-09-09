import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PDFDocument } from "pdf-lib";

import { buildExtractionIR } from "../src/exporter-ir.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";
import { preflightPdfx4 } from "../src/exporters/pdfx-preflight.mjs";

const IMAGE = "penkra-verapdf:1.30.2";
const execute = promisify(execFile);
async function inspectValidator(signal) {
  const native = process.env.CANVAS_VERAPDF ?? fileURLToPath(new URL("../tmp/tools/verapdf-1.30.2/verapdf", import.meta.url));
  if (process.env.CANVAS_VERAPDF || await access(native).then(() => true, () => false)) {
    const version = await execute(native, ["--version"], { signal, timeout: 15_000 });
    assert.match(version.stdout, /\b1\.30\.2\b/u);
    return native;
  }
  await execute("docker", ["image", "inspect", IMAGE], { signal, timeout: 15_000 });
  return null;
}

async function validate(directory, flavour, signal, native) {
  if (native) return execute(native, ["--format", "text", "--verbose", "--flavour", flavour, join(directory, "fixture.pdf")], { signal, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
  const name = basename(directory);
  try {
    return await execute("docker", ["run", "--rm", "--name", name, "--platform", "linux/amd64", "-v", `${directory}:/data`, IMAGE, "--format", "text", "--verbose", "--flavour", flavour, "/data/fixture.pdf"], { signal, timeout: 90_000, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    // The exact task-created container name is known; killing the Docker CLI
    // alone does not establish that its container has stopped.
    await execute("docker", ["rm", "-f", name], { timeout: 10_000 }).catch(cleanup => {
      console.error(`Validator container cleanup failed for ${name}: ${cleanup.message}`);
    });
    throw error;
  }
}

test("PDF/A-3 output passes pinned veraPDF 1.30.2", { timeout: 120_000 }, async (context) => {
  const native = await inspectValidator(context.signal);
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdfa3-"));
  try {
    const document = fixture();
    const outputIntent = await readFile(new URL("../assets/color/sRGB2014.icc", import.meta.url));
    const inter = await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
    const bytes = await exportPdf(buildExtractionIR(document, { format: "pdf", nodeId: "page" }), {
      profile: "PDF/A-3", title: "Canvas PDF/A-3 fixture", outputIntent, fonts: { "Inter:400": inter },
    });
    const path = join(directory, "fixture.pdf");
    await writeFile(path, bytes);
    const validation = await validate(directory, "3b", context.signal, native);
    assert.match(validation.stdout, /^PASS .* 3b$/mu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF/UA-1 output passes pinned veraPDF 1.30.2", { timeout: 120_000 }, async (context) => {
  const native = await inspectValidator(context.signal);
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdfua1-"));
  try {
    const inter = await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
    const bytes = await exportPdf(buildExtractionIR(fixture(), { format: "pdf", nodeId: "page" }), { profile: "PDF/UA-1", title: "Canvas PDF/UA-1 fixture", fonts: { "Inter:400": inter } });
    await writeFile(join(directory, "fixture.pdf"), bytes);
    const validation = await validate(directory, "ua1", context.signal, native);
    assert.match(validation.stdout, /^PASS .* ua1$/mu);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("configured PDF/X-4 profile returns a conformant closed-writer artifact", async () => {
  const ir = buildExtractionIR(fixture(), { format: "pdf", nodeId: "page" });
  const [outputIntent, sourceColorProfile, inter] = await Promise.all([
    readFile(new URL("../assets/color/GRACoL2013_CRPC6.icc", import.meta.url)),
    readFile(new URL("../assets/color/sRGB2014.icc", import.meta.url)),
    readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url)),
  ]);
  const bytes = await exportPdf(ir, { profile: "PDF/X-4", outputIntent, sourceColorProfile, fonts: { "Inter:400": inter } });
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes).subarray(0, 8).toString("latin1"), "%PDF-1.6");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  assert.equal(pdf.getPages().length, 1);
  const report = await preflightPdfx4(bytes);
  assert.deepEqual(report.issues, []);
  assert.equal(report.canvasWriterSubset?.verified, true);
  assert.equal(report.conformant, true);
  await assert.rejects(exportPdf(ir, { profile: "PDF/X-4" }), { code: "CANVAS_PDF_PROFILE_INVALID" });
});

function fixture() {
  return { version: "2.15", module: "generic", lang: "en", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "page", type: "frame", size: "a4", physical: { w: 210, h: 297, unit: "mm" }, width: 794, height: 1123, children: [{ id: "text", type: "text", x: 72, y: 72, width: 400, height: 60, content: "Canvas profile fixture", fontFamily: "Inter", fontSize: 24, paragraphs: [{ from: 0, to: 22 }], marks: [] }] }] };
}
