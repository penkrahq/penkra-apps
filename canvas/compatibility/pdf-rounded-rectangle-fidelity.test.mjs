import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { buildExtractionIR } from "../src/exporter-ir.mjs";
import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";
import { pixels, compareCoverage } from "./pixel-fidelity.mjs";

const execute = promisify(execFile);
const document = { version: "2.17", module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{
  id: "rounding", type: "frame", layout: "none", width: 500, height: 240, physical: { w: 500 / 96, h: 240 / 96, unit: "in" }, fill: "#FFFFFF", children: [
    { id: "scalar", type: "rectangle", x: 20, y: 20, width: 200, height: 80, cornerRadius: 28, fill: "#0B4A6F" },
    { id: "independent", type: "rectangle", x: 260, y: 20, width: 200, height: 80, cornerRadius: [0, 16, 32, 40], fill: "#0B4A6F" },
    { id: "normalized", type: "rectangle", x: 20, y: 130, width: 200, height: 80, cornerRadius: [80, 50, 30, 70], fill: "#0B4A6F" },
    { id: "stroke", type: "rectangle", x: 260, y: 130, width: 200, height: 80, cornerRadius: [12, 24, 36, 6], fill: "#D9EEF7", stroke: { fill: "#0B4A6F", width: 4 } },
  ],
}] };

test("PDF rounded rectangles match Canvas coverage at 1x and 2x", { timeout: 60_000 }, async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "canvas-pdf-rounded-"));
  try {
    const ir = buildExtractionIR(document, { format: "pdf", nodeId: "rounding" });
    assert.equal(ir.rasters.length, 0);
    const pdf = join(directory, "rounding.pdf");
    await writeFile(pdf, await exportPdf(ir));
    const ck = await getCanvasKit();
    for (const scale of [1, 2]) {
      const [reference] = await takeDocumentScreenshots(document, [{ nodeIds: ["rounding"] }], new Map(), { scale });
      const output = join(directory, `pdf-${scale}.png`);
      await execute("pdftoppm", ["-r", String(96 * scale), "-singlefile", "-png", pdf, output.slice(0, -4)], { timeout: 30_000, signal: context.signal });
      const expected = pixels(ck, Buffer.from(reference.data, "base64"), 500 * scale, 240 * scale);
      const actual = pixels(ck, await readFile(output), 500 * scale, 240 * scale);
      const measured = compareCoverage(actual, expected, 500 * scale, 240 * scale);
      assert.ok(measured.checkedInteriorPixels > 10_000 * scale * scale, `expected measured interiors at ${scale}x: ${JSON.stringify(measured)}`);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
