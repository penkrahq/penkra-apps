import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument, PDFName, PDFNumber, PDFRef } from "pdf-lib";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const CANDIDATE = new URL("../../research/luna-pdfx-document-negative-matrix-20260907/valid-candidate-control-classic-xref.pdf", import.meta.url);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const treeIssues = (report) => report.issues.filter(({ code }) => code === "PDF_PAGE_TREE_INVALID");
const issueSummary = (report) => report.issues.map(({ code, object, detail }) => ({ code, object, detail }));

async function boundedPreflight(bytes) {
  let timer;
  try {
    return await Promise.race([
      preflightPdfx4(bytes),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("page-tree preflight timeout")), 2500); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function mutatedCandidate(mutate) {
  const source = new Uint8Array(await readFile(CANDIDATE));
  const pdf = await PDFDocument.load(source, { updateMetadata: false, throwOnInvalidObject: true });
  mutate(pdf);
  const bytes = await pdf.save({ useObjectStreams: false });
  await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  return bytes;
}

async function rawMutatedCandidate(kind) {
  const source = Buffer.from(await readFile(CANDIDATE));
  const pdf = await PDFDocument.load(source, { updateMetadata: false, throwOnInvalidObject: true });
  const rootRef = pdf.catalog.get(PDFName.of("Pages"));
  const leafRef = pdf.catalog.Pages().Kids().get(0);
  const old = `/Kids [ ${leafRef.objectNumber} 0 R ]`;
  let replacement;
  if (kind === "cycle") replacement = `/Kids [ ${rootRef.objectNumber} 0 R ]`;
  else {
    replacement = `/Kids 7${" ".repeat(old.length - "/Kids 7".length)}`;
  }
  const text = source.toString("latin1");
  assert.equal(text.split(old).length, 2, `${kind} raw page-tree pattern was not unique`);
  const bytes = Buffer.from(text.replace(old, replacement), "latin1");
  await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  return bytes;
}

test("retained valid candidate has a clean page-tree report", { timeout: 4000 }, async () => {
  const bytes = new Uint8Array(await readFile(CANDIDATE));
  const before = sha256(bytes);
  const first = await boundedPreflight(bytes);
  const second = await boundedPreflight(bytes);
  assert.deepEqual(treeIssues(first), []);
  assert.deepEqual(issueSummary(first), issueSummary(second));
  assert.equal(first.conformant, false);
  assert.equal(sha256(bytes), before, "preflight mutated the retained candidate bytes");
});

const CASES = [
  { name: "Count999", mutate: (pdf) => pdf.catalog.Pages().set(PDFName.of("Count"), PDFNumber.of(999)) },
  { name: "missingParent", mutate: (pdf) => {
    const pages = pdf.catalog.Pages();
    const leaf = pdf.context.lookup(pages.Kids().get(0));
    leaf.delete(PDFName.of("Parent"));
  } },
  { name: "wrongParent", mutate: (pdf) => {
    const pages = pdf.catalog.Pages();
    const leaf = pdf.context.lookup(pages.Kids().get(0));
    leaf.set(PDFName.of("Parent"), PDFRef.of(999999));
  } },
  { name: "duplicatechild", mutate: (pdf) => {
    const pages = pdf.catalog.Pages();
    pages.Kids().push(pages.Kids().get(0));
  } },
  { name: "cycle", raw: "cycle" },
  { name: "malformedKids", raw: "malformedKids" },
];

for (const { name, mutate, raw } of CASES) {
  test(`preflight rejects serialized page-tree ${name}`, { timeout: 4000 }, async () => {
    const bytes = raw ? await rawMutatedCandidate(raw) : await mutatedCandidate(mutate);
    const before = sha256(bytes);
    const first = await boundedPreflight(bytes);
    const second = await boundedPreflight(bytes);
    const issues = treeIssues(first);
    assert.ok(issues.length > 0, `${name} produced no page-tree issue`);
    assert.deepEqual(new Set(issues.map(({ code }) => code)), new Set(["PDF_PAGE_TREE_INVALID"]));
    assert.deepEqual(issueSummary(first), issueSummary(second), `${name} report order changed`);
    assert.equal(first.conformant, false);
    assert.equal(sha256(bytes), before, `${name} preflight mutated input bytes`);
  });
}
