import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildExporterIR } from "../src/exporter-ir.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";

const IMAGE = "penkra-verapdf:1.30.2";

test("PDF/A-3 output passes pinned veraPDF 1.30.2", async (context) => {
  if (spawnSync("docker", ["image", "inspect", IMAGE]).status !== 0) {
    context.skip(`Build the pinned ${IMAGE} image from veraPDF-apps tag v1.30.2 to run conformance.`);
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdfa3-"));
  try {
    const document = fixture();
    const outputIntent = await readFile(new URL("../assets/color/sRGB2014.icc", import.meta.url));
    const inter = await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
    const bytes = await exportPdf(buildExporterIR(document, { role: "page", frames: ["page"] }), {
      profile: "PDF/A-3", title: "Canvas PDF/A-3 fixture", outputIntent, fonts: { "Inter:400": inter },
    });
    const path = join(directory, "fixture.pdf");
    await writeFile(path, bytes);
    const validation = spawnSync("docker", ["run", "--rm", "--platform", "linux/amd64", "-v", `${directory}:/data`, IMAGE, "--format", "text", "--verbose", "--flavour", "3b", "/data/fixture.pdf"], { encoding: "utf8" });
    assert.equal(validation.status, 0, validation.stderr);
    assert.match(validation.stdout, /^PASS .* 3b$/mu);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("PDF/UA-1 output passes pinned veraPDF 1.30.2", async (context) => {
  if (spawnSync("docker", ["image", "inspect", IMAGE]).status !== 0) {
    context.skip(`Build the pinned ${IMAGE} image from veraPDF-apps tag v1.30.2 to run conformance.`);
    return;
  }
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdfua1-"));
  try {
    const inter = await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url));
    const bytes = await exportPdf(buildExporterIR(fixture(), { role: "page", frames: ["page"] }), { profile: "PDF/UA-1", title: "Canvas PDF/UA-1 fixture", fonts: { "Inter:400": inter } });
    await writeFile(join(directory, "fixture.pdf"), bytes);
    const validation = spawnSync("docker", ["run", "--rm", "--platform", "linux/amd64", "-v", `${directory}:/data`, IMAGE, "--format", "text", "--verbose", "--flavour", "ua1", "/data/fixture.pdf"], { encoding: "utf8" });
    assert.equal(validation.status, 0, validation.stderr);
    assert.match(validation.stdout, /^PASS .* ua1$/mu);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("unverified PDF/X-4 profile cannot be mislabeled", async () => {
  const ir = buildExporterIR(fixture(), { role: "page", frames: ["page"] });
  await assert.rejects(exportPdf(ir, { profile: "PDF/X-4" }), { code: "CANVAS_PDF_PROFILE_UNVERIFIED" });
});

function fixture() {
  return { canvasSchemaVersion: 3, version: "2.15", module: "print", lang: "en", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "page", type: "frame", role: "page", size: "a4", width: 794, height: 1123, children: [{ id: "text", type: "text", x: 72, y: 72, width: 400, height: 60, content: "Canvas profile fixture", fontFamily: "Inter", fontSize: 24, paragraphs: [{ from: 0, to: 22 }], marks: [] }] }] };
}
