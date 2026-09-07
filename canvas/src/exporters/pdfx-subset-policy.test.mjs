import assert from "node:assert/strict";
import test from "node:test";
import { PDFDocument, PDFName, PDFNumber, PDFRef, PDFString } from "pdf-lib";
import { inspectPdfxSubsetPolicy } from "./pdfx-subset-policy.mjs";

const codes = (pdf) => inspectPdfxSubsetPolicy(pdf).issues.map((issue) => issue.code);
const issue = (code, clause, object) => ({ code, clause, object });

async function fixture(change = () => {}, { pages = 1, useObjectStreams = false } = {}) {
  const pdf = await PDFDocument.create();
  const pageList = Array.from({ length: pages }, () => pdf.addPage([200, 300]));
  await change(pdf, pageList);
  return PDFDocument.load(await pdf.save({ useObjectStreams }), { updateMetadata: false, throwOnInvalidObject: true });
}

test("Canvas subset exclusions identify catalog permissions while absent and empty dictionaries remain distinct", async () => {
  const absent = await fixture();
  assert.deepEqual(inspectPdfxSubsetPolicy(absent).issues, []);
  const emptyOther = await fixture((pdf) => pdf.catalog.set(PDFName.of("Other"), pdf.context.obj({})));
  assert.deepEqual(inspectPdfxSubsetPolicy(emptyOther).issues, []);
  const emptyPerms = await fixture((pdf) => pdf.catalog.set(PDFName.of("Perms"), pdf.context.obj({})));
  assert.deepEqual(inspectPdfxSubsetPolicy(emptyPerms).issues, [issue("CANVAS_SUBSET_UNSUPPORTED", "6.24", "Catalog/Perms")]);
});

test("catalog Metadata is the only exact metadata stream permitted, including shared references", async () => {
  for (const useObjectStreams of [false, true]) {
    const allowed = await fixture((pdf) => {
      const metadata = pdf.context.register(pdf.context.stream(new TextEncoder().encode("<x:xmpmeta/>"), { Type: PDFName.of("Metadata"), Subtype: PDFName.of("XML") }));
      pdf.catalog.set(PDFName.of("Metadata"), metadata);
      pdf.context.register(pdf.context.obj({ SharedMetadata: metadata }));
    }, { useObjectStreams });
    assert.deepEqual(inspectPdfxSubsetPolicy(allowed).issues, []);
    const extra = await fixture((pdf) => {
      const metadata = pdf.context.register(pdf.context.stream(new Uint8Array(), { Type: PDFName.of("Metadata"), Subtype: PDFName.of("XML") }));
      pdf.catalog.set(PDFName.of("Metadata"), metadata);
      pdf.context.register(pdf.context.stream(new Uint8Array(), { Type: PDFName.of("Metadata") }));
    }, { useObjectStreams });
    assert.deepEqual(inspectPdfxSubsetPolicy(extra).issues, [issue("CANVAS_SUBSET_UNSUPPORTED", "6.10.6", "6 0 R")]);
  }
});

test("metadata Type or XML Subtype on any additional stream is a Canvas subset exclusion", async () => {
  for (const descriptor of [{ Type: PDFName.of("Metadata") }, { Subtype: PDFName.of("XML") }]) {
    const pdf = await fixture((document) => { document.context.register(document.context.stream(new Uint8Array(), descriptor)); });
    assert.equal(codes(pdf).filter((code) => code === "CANVAS_SUBSET_UNSUPPORTED").length, 1);
    assert.equal(inspectPdfxSubsetPolicy(pdf).issues[0].clause, "6.10.6");
  }
});

test("optional-content types, OC keys, and HalftoneType keys are rejected in reachable and unreachable dictionaries", async () => {
  const pdf = await fixture((document) => {
    document.catalog.set(PDFName.of("ReachableOCG"), document.context.obj({ Type: PDFName.of("OCG") }));
    document.catalog.set(PDFName.of("ReachableOCMD"), document.context.obj({ Type: PDFName.of("OCMD") }));
    document.catalog.set(PDFName.of("EmptyOC"), document.context.obj({ OC: document.context.obj({}) }));
    document.catalog.set(PDFName.of("Halftone"), document.context.obj({ HalftoneType: PDFNumber.of(5) }));
    document.context.register(document.context.obj({ Type: PDFName.of("OCG") }));
  });
  const report = inspectPdfxSubsetPolicy(pdf);
  assert.equal(report.issues.filter((entry) => entry.code === "CANVAS_SUBSET_UNSUPPORTED").length, 5);
  assert.equal(report.issues.filter((entry) => entry.clause === "6.24").length, 4);
  assert.equal(report.issues.filter((entry) => entry.clause === "6.13").length, 1);
});

test("a shared optional-content dictionary is deduplicated and cycles are safe", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([200, 300]);
  const shared = pdf.context.register(pdf.context.obj({ Type: PDFName.of("OCG") }));
  pdf.catalog.set(PDFName.of("First"), shared); pdf.catalog.set(PDFName.of("Second"), shared);
  const cycle = pdf.context.obj({}); const cycleRef = pdf.context.register(cycle); cycle.set(PDFName.of("Next"), cycleRef);
  const report = inspectPdfxSubsetPolicy(pdf);
  assert.deepEqual(report.issues, [issue("CANVAS_SUBSET_UNSUPPORTED", "6.24", "Catalog/First")]);
});

test("malformed indirect references produce deterministic graph issues instead of throwing", async () => {
  const pdf = await PDFDocument.create(); pdf.addPage([200, 300]);
  pdf.catalog.set(PDFName.of("Broken"), PDFRef.of(9999, 0));
  assert.deepEqual(inspectPdfxSubsetPolicy(pdf).issues, [issue("OBJECT_GRAPH_INVALID", "6.1", "Catalog/Broken")]);
});

test("all four viewer preference boxes accept MediaBox after raw and object-stream round trips", async () => {
  for (const useObjectStreams of [false, true]) {
    const pdf = await fixture((document) => document.catalog.set(PDFName.of("ViewerPreferences"), document.context.obj(Object.fromEntries(["ViewArea", "ViewClip", "PrintArea", "PrintClip"].map((key) => [key, PDFName.of("MediaBox")])))), { useObjectStreams });
    assert.deepEqual(inspectPdfxSubsetPolicy(pdf).issues, []);
  }
});

test("BleedBox viewer preferences require BleedBox on every page", async () => {
  const all = await fixture((_, pages) => pages.forEach((page) => page.setBleedBox(0, 0, 200, 300)), { pages: 2 });
  all.catalog.set(PDFName.of("ViewerPreferences"), all.context.obj({ ViewArea: PDFName.of("BleedBox"), ViewClip: PDFName.of("BleedBox"), PrintArea: PDFName.of("BleedBox"), PrintClip: PDFName.of("BleedBox") }));
  assert.deepEqual(inspectPdfxSubsetPolicy(all).issues, []);
  const oneMissing = await fixture((_, pages) => pages[0].setBleedBox(0, 0, 200, 300), { pages: 2 });
  oneMissing.catalog.set(PDFName.of("ViewerPreferences"), oneMissing.context.obj({ ViewArea: PDFName.of("BleedBox") }));
  assert.deepEqual(inspectPdfxSubsetPolicy(oneMissing).issues, [issue("VIEWER_PREFERENCE_BOX_INVALID", "6.21", "Catalog/ViewerPreferences/ViewArea")]);
});

test("viewer preference boxes reject wrong types and unsupported names", async () => {
  for (const value of [PDFString.of("MediaBox"), PDFName.of("TrimBox"), PDFNumber.of(1)]) {
    const pdf = await fixture((document) => document.catalog.set(PDFName.of("ViewerPreferences"), document.context.obj({ PrintClip: value })));
    assert.deepEqual(inspectPdfxSubsetPolicy(pdf).issues, [issue("VIEWER_PREFERENCE_BOX_INVALID", "6.21", "Catalog/ViewerPreferences/PrintClip")]);
  }
  const notDict = await fixture((document) => document.catalog.set(PDFName.of("ViewerPreferences"), PDFName.of("MediaBox")));
  assert.deepEqual(inspectPdfxSubsetPolicy(notDict).issues, [issue("VIEWER_PREFERENCE_BOX_INVALID", "6.21", "Catalog/ViewerPreferences")]);
});
