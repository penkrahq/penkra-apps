import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFNumber, PDFRef } from "pdf-lib";
import { inspectPdfPageTree } from "./pdf-page-tree.mjs";

async function fixture() {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 300]); pdf.addPage([200, 300]);
  return pdf;
}
const key = PDFName.of;

test("writer page tree and both serializations retain two exact leaves", async () => {
  const pdf = await fixture();
  for (const useObjectStreams of [false, true]) {
    const loaded = await PDFDocument.load(await pdf.save({ useObjectStreams }), { updateMetadata: false });
    assert.deepEqual(inspectPdfPageTree(loaded), { issues: [], pageCount: 2 });
  }
});

test("wrong count and missing or wrong Parent are rejected", async () => {
  for (const mutation of [
    (pdf) => pdf.catalog.Pages().set(key("Count"), PDFNumber.of(999)),
    (pdf) => pdf.getPages()[0].node.delete(key("Parent")),
    (pdf) => pdf.getPages()[0].node.set(key("Parent"), pdf.getPages()[1].ref),
  ]) {
    const pdf = await fixture(); mutation(pdf);
    assert.ok(inspectPdfPageTree(pdf).issues.length > 0);
  }
});

test("cycles, repeated leaves, dangling and direct child objects reject without recursion", async () => {
  for (const child of ["cycle", "duplicate", "dangling", "direct"]) {
    const pdf = await fixture();
    const pages = pdf.catalog.Pages();
    const children = pages.Kids();
    children.push(child === "cycle" ? pdf.catalog.get(key("Pages"))
      : child === "duplicate" ? children.get(0)
      : child === "dangling" ? PDFRef.of(9999) : pdf.context.obj({ Type: "Page" }));
    const result = inspectPdfPageTree(pdf);
    assert.ok(result.issues.length > 0, child);
    assert.deepEqual(result, inspectPdfPageTree(pdf));
  }
});

test("nested page tree counts leaves and requires each immediate parent", async () => {
  const pdf = await fixture();
  const root = pdf.catalog.get(key("Pages"));
  const pages = pdf.catalog.Pages();
  const original = pages.Kids().asArray();
  const nested = pdf.context.obj({ Type: "Pages", Parent: root, Kids: original, Count: 2 });
  const nestedRef = pdf.context.register(nested);
  for (const ref of original) pdf.context.lookup(ref).set(key("Parent"), nestedRef);
  pages.set(key("Kids"), pdf.context.obj([nestedRef]));
  assert.deepEqual(inspectPdfPageTree(pdf), { issues: [], pageCount: 2 });
  nested.set(key("Count"), PDFNumber.of(1));
  assert.ok(inspectPdfPageTree(pdf).issues.some((issue) => issue.detail === "descendant-count-mismatch"));
});

test("malformed required fields fail while inspection leaves objects unchanged", async () => {
  for (const [field, value] of [["Count", -1], ["Count", 1.5], ["Count", "bad"], ["Kids", 7], ["Type", "Other"]]) {
    const pdf = await fixture(); pdf.catalog.Pages().set(key(field), pdf.context.obj(value));
    const before = pdf.context.enumerateIndirectObjects().map(([ref, obj]) => `${ref}:${obj}`).join("\n");
    assert.ok(inspectPdfPageTree(pdf).issues.length > 0, field);
    assert.equal(pdf.context.enumerateIndirectObjects().map(([ref, obj]) => `${ref}:${obj}`).join("\n"), before);
  }
});
