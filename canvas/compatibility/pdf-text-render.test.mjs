import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, mkdir, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PDFDocument, PDFName } from "pdf-lib";
import { extractDocumentNodes } from "../src/export-service.mjs";
import { measureDocumentText, takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { buildExtractionIR } from "../src/exporter-ir.mjs";
import { exportPdf } from "../src/exporters/pdf.mjs";
import { getCanvasKit } from "../vendor/open-pencil/engine.source.mjs";
import { inspectPdfxFonts } from "../src/exporters/pdfx-fonts.mjs";

test("shaped PDF text rejects mismatched font programs and missing glyphs", async () => {
  const doc = { version: "2.17", module: "generic", children: [{ id: "text", type: "text", width: 100, height: 40, content: "A", fontFamily: "Inter", fontSize: 24, textGrowth: "fixed-width-height" }] };
  const preparedText = await measureDocumentText(doc, ["text"]);
  const ir = buildExtractionIR(doc, { nodeId: "text", format: "pdf", preparedText });
  const fonts = { "Inter:400": await readFile(new URL("../vendor/open-pencil/fonts/Inter-Regular.ttf", import.meta.url)) };
  const layout = ir.outputs[0].nodes[0].textLayout;
  const hash = layout.fontHashes["Inter|Regular"];
  layout.fontHashes["Inter|Regular"] = "different-font-program";
  await assert.rejects(exportPdf(ir, { fonts }), { code: "CANVAS_PDF_FONT_MISMATCH" });
  layout.fontHashes["Inter|Regular"] = hash;
  layout.lines[0].runs[0].glyphs[0] = 0;
  await assert.rejects(exportPdf(ir, { fonts }), { code: "CANVAS_PDF_GLYPH_MISSING" });
});

test("PDF extraction preserves shaped centered, wrapped and mixed-weight text without images", async () => {
  const content = "Café office affine\nBlue and Orange wrap across this narrow frame";
  const doc = { version: "2.17", module: "generic", children: [{
    id: "page", type: "frame", width: 300, height: 300, layout: "none", fill: "#FFFFFF", children: [
      { id: "label", type: "text", x: 0, y: 0, width: 300, height: 60, content: "Blue", fontFamily: "Inter", fontSize: 24, fontWeight: 700, textAlign: "center", textAlignVertical: "center", textGrowth: "fixed-width-height", fill: "#000000" },
      { id: "wrapped", type: "text", x: 30, y: 75, width: 240, height: 210, content, fontFamily: "Inter", fontSize: 20, textAlign: "right", textAlignVertical: "center", textGrowth: "fixed-width-height", lineHeight: 30, letterSpacing: 0.4, fill: "#000000", marks: [{ from: 5, to: 11, type: "weight", value: 700 }] },
    ],
  }] };
  const directory = await mkdtemp(join(tmpdir(), "canvas-shaped-pdf-"));
  try {
    const path = join(directory, "text.pdf");
    const report = await extractDocumentNodes(doc, { node: ["page"], format: "pdf", destination: path });
    assert.deepEqual(report.consequences.filter((item) => item.kind === "raster"), []);
    const pdf = await PDFDocument.load(await readFile(path));
    assert.equal(pdf.context.enumerateIndirectObjects().some(([, object]) => object.dict?.get(PDFName.of("Subtype"))?.toString() === "/Image"), false);
    assert.deepEqual(inspectPdfxFonts(pdf).issues, []);
    const text = spawnSync("pdftotext", [path, "-"], { encoding: "utf8" });
    assert.equal(text.status, 0, text.stderr);
    assert.ok(text.stdout.includes("Blue"));
    assert.ok(text.stdout.includes("Café office affine"), JSON.stringify(text.stdout));
    assert.ok(text.stdout.includes("Blue and Orange"));
    const rendered = spawnSync("pdftoppm", ["-r", "72", "-singlefile", "-png", path, join(directory, "pdf")], { encoding: "utf8" });
    assert.equal(rendered.status, 0, rendered.stderr);
    const [reference] = await takeDocumentScreenshots(doc, [{ nodeIds: ["page"] }]);
    await writeFile(join(directory, "canvas.png"), Buffer.from(reference.data, "base64"));
    const ck = await getCanvasKit();
    const ink = async (name) => {
      const image = ck.MakeImageFromEncoded(await readFile(join(directory, name)));
      try {
        assert.equal(image.width(), 300); assert.equal(image.height(), 300);
        const pixels = image.readPixels(0, 0, { width: 300, height: 300, colorType: ck.ColorType.RGBA_8888, alphaType: ck.AlphaType.Unpremul, colorSpace: ck.ColorSpace.SRGB });
        const rows = [];
        for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) if (pixels[(y * 300 + x) * 4] < 128) {
          rows[y] ??= { minX: x, maxX: x, count: 0 };
          rows[y].maxX = x; rows[y].count++;
        }
        return rows;
      } finally { image.delete(); }
    };
    const expected = await ink("canvas.png"), actual = await ink("pdf.png");
    // Compare each ink band's geometry; tolerate only renderer antialiasing.
    const bands = (rows) => {
      const result = [];
      rows.forEach((row, y) => {
        if (!row) return;
        let band = result.at(-1);
        if (!band || y > band.bottom + 1) result.push(band = { top: y, bottom: y, left: row.minX, right: row.maxX });
        band.bottom = y; band.left = Math.min(band.left, row.minX); band.right = Math.max(band.right, row.maxX);
      });
      return result;
    };
    const a = bands(actual), e = bands(expected);
    assert.equal(a.length, e.length);
    a.forEach((band, index) => {
      for (const key of ["top", "bottom", "left", "right"]) assert.ok(Math.abs(band[key] - e[index][key]) <= 1, `${index}.${key}: PDF=${band[key]}, Canvas=${e[index][key]}`);
    });
    if (process.env.CANVAS_PDF_TEXT_EVIDENCE_DIR) {
      const output = process.env.CANVAS_PDF_TEXT_EVIDENCE_DIR;
      await mkdir(output, { recursive: true });
      for (const file of ["text.pdf", "canvas.png", "pdf.png"]) await cp(join(directory, file), join(output, file));
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
