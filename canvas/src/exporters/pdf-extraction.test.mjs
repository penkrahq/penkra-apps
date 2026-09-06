import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFArray, decodePDFRawStream } from "pdf-lib";
import { exportPdf } from "./pdf.mjs";

function content(document, page) {
  const streams = page.node.Contents();
  return streams instanceof PDFArray
    ? Array.from({ length: streams.size() }, (_, index) => Buffer.from(decodePDFRawStream(document.context.lookup(streams.get(index))).decode()).toString()).join("\n")
    : streams ? Buffer.from(decodePDFRawStream(streams).decode()).toString() : "";
}

test("roleless PDF units use 72 DPI and fold/safe-margin guides emit nothing", async () => {
  const unit = { id: "poster", width: 240, height: 360, nodes: [] };
  const plain = await PDFDocument.load(await exportPdf({ outputs: [unit] }));
  const guided = await PDFDocument.load(await exportPdf({ outputs: [{ ...unit, folds: [80, 160], safeMargin: 20 }] }));
  assert.deepEqual(guided.getPages()[0].getSize(), { width: 240, height: 360 });
  assert.equal(content(guided, guided.getPages()[0]), content(plain, plain.getPages()[0]));
  const bleed = await PDFDocument.load(await exportPdf({ outputs: [{ ...unit, bleed: 9, physical: { w: 4, h: 6, unit: "in" } }, unit] }));
  assert.equal(bleed.getPageCount(), 2);
  assert.deepEqual(bleed.getPages()[0].getTrimBox(), { x: 9, y: 9, width: 288, height: 432 });
  assert.deepEqual(bleed.getPages()[0].getMediaBox(), { x: 0, y: 0, width: 306, height: 450 });
  assert.deepEqual(bleed.getPages()[1].getSize(), { width: 240, height: 360 });
});
