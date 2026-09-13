import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PDFDocument, PDFName } from "pdf-lib";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { buildCapabilityVerificationIR } from "../src/exporter-ir.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";

export const vectorFixture = {
  version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{
    id: "page", type: "frame", layout: "none", width: 300, height: 220, physical: { w: 300 / 96, h: 220 / 96, unit: "in" }, bleed: 0, fill: "#E8EEF4", children: [
      { id: "group", type: "frame", layout: "none", x: 10, y: 10, width: 170, height: 170, children: [
        { id: "back", type: "rectangle", x: 0, y: 0, width: 170, height: 170, fill: "#FFFFFF" },
        { id: "ring", type: "path", x: 10, y: 10, width: 140, height: 140, geometry: "M0 50 C0 0 100 0 100 50 C100 100 0 100 0 50 Z M25 50 C25 25 75 25 75 50 C75 75 25 75 25 50 Z", viewBox: [0, 0, 100, 100], fillRule: "evenodd", fill: "#F04C2480", stroke: { fill: "#123456", thickness: 2 } },
      ] },
      { id: "front", type: "path", x: 120, y: 120, width: 80, height: 70, geometry: "M0 0 H100 V100 H0 Z", viewBox: [0, 0, 100, 100], fill: "#168557" },
      { id: "open", type: "path", x: 210, y: 30, width: 60, height: 100, geometry: "M0 0 L100 50 L0 100", viewBox: [0, 0, 100, 100], stroke: { fill: "#12345680", thickness: 4 } },
    ],
  }],
};

test("Poppler renders native PDF vectors with Canvas paint order, alpha and open contours", async (context) => {
  if (spawnSync("pdftoppm", ["-v"]).status !== 0) { context.skip("Poppler is required for actual PDF rendering"); return; }
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdf-vectors-"));
  try {
    const ir = buildCapabilityVerificationIR(vectorFixture, { format: "pdf", nodeId: "page" },
      ["nodes.path", "nodes.polygon", "properties.geometry", "properties.viewBox", "properties.fillRule"]);
    assert.equal(ir.rasters.length, 0);
    const pdfBytes = await exportPdf(ir);
    const parsed = await PDFDocument.load(pdfBytes);
    assert.equal(parsed.context.enumerateIndirectObjects().some(([, object]) => object.dict?.get(PDFName.of("Subtype"))?.toString() === "/Image"), false);
    await writeFile(join(directory, "vectors.pdf"), pdfBytes);
    const render = spawnSync("pdftoppm", ["-r", "96", "-singlefile", "-png", join(directory, "vectors.pdf"), join(directory, "render")], { encoding: "utf8" });
    assert.equal(render.status, 0, render.stderr);
    const [canvas] = await takeDocumentScreenshots(vectorFixture, [{ nodeIds: ["page"] }], new Map(), { scale: 1 });
    const ck = await getCanvasKit();
    const read = (bytes) => {
      const image = ck.MakeImageFromEncoded(bytes);
      assert.ok(image);
      try {
        assert.equal(image.width(), 300); assert.equal(image.height(), 220);
        return image.readPixels(0, 0, { width: 300, height: 220, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
      } finally { image.delete(); }
    };
    const reference = read(Buffer.from(canvas.data, "base64"));
    const renderedPng = await readFile(join(directory, "render.png"));
    const actual = read(renderedPng);
    // Interior probes avoid treating different renderer edge antialiasing as a
    // geometry failure. Explicit probes cover each visually meaningful region.
    for (const [x, y] of [[5, 5], [15, 15], [90, 40], [90, 90], [140, 140], [190, 160], [220, 80], [211, 80], [240, 55]]) {
      const offset = (y * 300 + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) assert.ok(Math.abs(actual[offset + channel] - reference[offset + channel]) <= 2, `Pixel ${x},${y}, channel ${channel}: PDF=${actual[offset + channel]}, Canvas=${reference[offset + channel]}`);
    }
    let interiorPixels = 0;
    let maxObservedChannelDifference = 0;
    for (let y = 2; y < 218; y += 1) for (let x = 2; x < 298; x += 1) {
      const offset = (y * 300 + x) * 4;
      let uniform = true;
      for (let dy = -2; dy <= 2 && uniform; dy += 1) for (let dx = -2; dx <= 2 && uniform; dx += 1) for (let channel = 0; channel < 4; channel += 1) {
        if (Math.abs(reference[offset + channel] - reference[((y + dy) * 300 + x + dx) * 4 + channel]) > 1) { uniform = false; break; }
      }
      if (!uniform) continue;
      interiorPixels += 1;
      for (let channel = 0; channel < 4; channel += 1) {
        const difference = Math.abs(actual[offset + channel] - reference[offset + channel]);
        maxObservedChannelDifference = Math.max(maxObservedChannelDifference, difference);
        assert.ok(difference <= 2, `Interior mismatch at ${x},${y}`);
      }
    }
    assert.ok(interiorPixels > 50000);
    if (process.env.CANVAS_PDF_VECTOR_EVIDENCE_DIR) {
      const evidence = process.env.CANVAS_PDF_VECTOR_EVIDENCE_DIR;
      await mkdir(evidence, { recursive: true });
      await writeFile(join(evidence, "native-vectors.pdf"), pdfBytes);
      await writeFile(join(evidence, "poppler.png"), renderedPng);
      await writeFile(join(evidence, "canvas.png"), Buffer.from(canvas.data, "base64"));
      await writeFile(join(evidence, "measurement.json"), JSON.stringify({ width: 300, height: 220, interiorPixels, maxObservedChannelDifference, allowedChannelDifference: 2, explicitProbes: 9, rasterSubstitutions: ir.rasters.length }, null, 2) + "\n");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
