import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import { serializePdf16 } from "./pdf16-writer.mjs";

test("explicit PDF 1.6 serialization preserves objects and valid cross-reference offsets", async () => {
  const document = await PDFDocument.create();
  document.setTitle("Canvas serialization test");
  document.addPage([123, 456]);
  const bytes = await serializePdf16(document);
  const source = Buffer.from(bytes).toString("latin1");
  assert.ok(source.startsWith("%PDF-1.6\n"));
  const xrefOffset = Number(/startxref\s+(\d+)\s+%%EOF/u.exec(source)?.[1]);
  assert.equal(source.slice(xrefOffset, xrefOffset + 4), "xref");
  const loaded = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
  assert.equal(loaded.getTitle(), "Canvas serialization test");
  assert.deepEqual(loaded.getPages()[0].getSize(), { width: 123, height: 456 });
  // The adapter is instance-local and does not change ordinary pdf-lib saves.
  assert.ok(Buffer.from(await document.save()).toString("latin1").startsWith("%PDF-1.7\n"));
});
