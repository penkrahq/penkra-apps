import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const implementation = process.env.CANVAS_PDF_PAGE_TREE_IMPLEMENTATION
  ? pathToFileURL(resolve(process.env.CANVAS_PDF_PAGE_TREE_IMPLEMENTATION)).href
  : new URL("./pdf-page-tree.mjs", import.meta.url).href;
const { inspectPdfPageTree } = await import(implementation);
// The override and this test must share pdf-lib's constructors. This matters
// when paired against an implementation in another worktree with its own
// node_modules tree; the default sibling path naturally shares that install.
const { PDFDocument, PDFName, PDFNumber, PDFRef } = createRequire(implementation)("pdf-lib");
const key = PDFName.of;

async function fixture(pageCount = 2) {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) pdf.addPage([200 + index, 300 + index]);
  return pdf;
}

function rootRef(pdf) { return pdf.catalog.get(key("Pages")); }
function root(pdf) { return pdf.catalog.Pages(); }
function leafRefs(pdf) { return root(pdf).Kids().asArray(); }
function rawState(pdf) {
  return pdf.context.enumerateIndirectObjects().map(([ref, object]) => `${ref}:${object}`).join("\n");
}
function assertIssues(pdf, detail) {
  const result = inspectPdfPageTree(pdf);
  assert.ok(result.issues.length > 0, `expected page-tree issues${detail ? ` for ${detail}` : ""}`);
  if (detail) assert.ok(result.issues.some((issue) => issue.detail === detail), `${detail} issue was not reported`);
  return result;
}

function makeNested(pdf) {
  const pages = root(pdf);
  const leaves = leafRefs(pdf);
  const secondLevel = pdf.context.obj({ Type: "Pages", Kids: leaves, Count: leaves.length });
  const secondRef = pdf.context.register(secondLevel);
  for (const leafRef of leaves) pdf.context.lookup(leafRef).set(key("Parent"), secondRef);
  const firstLevel = pdf.context.obj({ Type: "Pages", Parent: rootRef(pdf), Kids: [secondRef], Count: leaves.length });
  const firstRef = pdf.context.register(firstLevel);
  secondLevel.set(key("Parent"), firstRef);
  pages.set(key("Kids"), pdf.context.obj([firstRef]));
  return { pages, leaves, firstLevel, secondLevel, firstRef, secondRef };
}

test("independent checker reports exact leaf counts for flat and multi-level trees", async () => {
  const flat = await fixture(2);
  assert.deepEqual(inspectPdfPageTree(flat), { issues: [], pageCount: 2 });
  const nested = await fixture(3);
  makeNested(nested);
  assert.deepEqual(inspectPdfPageTree(nested), { issues: [], pageCount: 3 });
});

test("independent checker catches count and immediate-parent mismatches", async () => {
  const wrongCount = await fixture(2);
  root(wrongCount).set(key("Count"), PDFNumber.of(999));
  assertIssues(wrongCount, "descendant-count-mismatch");

  const missingParent = await fixture(2);
  pdfDeleteParent(missingParent, leafRefs(missingParent)[0]);
  assertIssues(missingParent, "parent-reference-mismatch");

  const wrongParent = await fixture(2);
  const leaves = leafRefs(wrongParent);
  pdfLookup(wrongParent, leaves[0]).set(key("Parent"), leaves[1]);
  assertIssues(wrongParent, "parent-reference-mismatch");

  const directParent = await fixture(2);
  pdfLookup(directParent, leafRefs(directParent)[0]).set(key("Parent"), pdfLookup(directParent, rootRef(directParent)));
  assertIssues(directParent, "parent-reference-mismatch");
});

test("repeated, cyclic, direct and dangling children fail without page-list APIs", async () => {
  const repeated = await fixture(2);
  root(repeated).Kids().push(leafRefs(repeated)[0]);
  assertIssues(repeated, "cycle-or-repeated-child");

  const cyclic = await fixture(2);
  root(cyclic).Kids().push(rootRef(cyclic));
  assertIssues(cyclic, "cycle-or-repeated-child");

  const direct = await fixture(2);
  root(direct).Kids().push(direct.context.obj({ Type: "Page" }));
  assertIssues(direct, "indirect-child-required");

  const dangling = await fixture(2);
  root(dangling).Kids().push(PDFRef.of(999999));
  assertIssues(dangling, "page-dictionary-required");
});

test("missing and malformed raw page-tree fields fail closed", async () => {
  const cases = [
    ["missing trailer Root", async () => { const pdf = await fixture(); delete pdf.context.trailerInfo.Root; return pdf; }, "catalog-required"],
    ["dangling trailer Root", async () => { const pdf = await fixture(); pdf.context.trailerInfo.Root = PDFRef.of(999999); return pdf; }, "catalog-required"],
    ["missing catalog Pages", async () => { const pdf = await fixture(); pdf.catalog.delete(key("Pages")); return pdf; }, "indirect-pages-root-required"],
    ["root Parent outside subset", async () => { const pdf = await fixture(); root(pdf).set(key("Parent"), rootRef(pdf)); return pdf; }, "root-parent-outside-subset"],
    ["missing Count", async () => { const pdf = await fixture(); root(pdf).delete(key("Count")); return pdf; }, "nonnegative-count-required"],
    ["fractional Count", async () => { const pdf = await fixture(); root(pdf).set(key("Count"), PDFNumber.of(1.5)); return pdf; }, "nonnegative-count-required"],
    ["unsafe Count", async () => { const pdf = await fixture(); root(pdf).set(key("Count"), PDFNumber.of(Number.MAX_SAFE_INTEGER + 1)); return pdf; }, "nonnegative-count-required"],
    ["negative Count", async () => { const pdf = await fixture(); root(pdf).set(key("Count"), PDFNumber.of(-1)); return pdf; }, "nonnegative-count-required"],
    ["string Count", async () => { const pdf = await fixture(); root(pdf).set(key("Count"), pdf.context.obj("2")); return pdf; }, "nonnegative-count-required"],
    ["missing Kids", async () => { const pdf = await fixture(); root(pdf).delete(key("Kids")); return pdf; }, "kids-array-required"],
    ["non-array Kids", async () => { const pdf = await fixture(); root(pdf).set(key("Kids"), pdf.context.obj(7)); return pdf; }, "kids-array-required"],
    ["wrong root Type", async () => { const pdf = await fixture(); root(pdf).set(key("Type"), key("Catalog")); return pdf; }, "page-type-invalid"],
    ["wrong leaf Type", async () => { const pdf = await fixture(); pdfLookup(pdf, leafRefs(pdf)[0]).set(key("Type"), key("Other")); return pdf; }, "page-type-invalid"],
  ];
  for (const [name, build, detail] of cases) assertIssues(await build(), detail, name);
});

test("inspection does not mutate valid or malformed input objects", async () => {
  for (const build of [
    async () => fixture(2),
    async () => { const pdf = await fixture(2); root(pdf).set(key("Count"), PDFNumber.of(999)); return pdf; },
    async () => { const pdf = await fixture(2); root(pdf).Kids().push(rootRef(pdf)); return pdf; },
  ]) {
    const pdf = await build();
    const before = rawState(pdf);
    inspectPdfPageTree(pdf);
    assert.equal(rawState(pdf), before);
  }
});

test("iterative checker handles a bounded deep page-tree chain", async () => {
  const pdf = await fixture(1);
  const depth = 2048;
  const rootNode = root(pdf);
  const rootPagesRef = rootRef(pdf);
  let childRef = leafRefs(pdf)[0];
  for (let index = 0; index < depth; index += 1) {
    const parent = pdf.context.obj({ Type: "Pages", Kids: [childRef], Count: 1 });
    const parentRef = pdf.context.register(parent);
    pdfLookup(pdf, childRef).set(key("Parent"), parentRef);
    childRef = parentRef;
  }
  pdfLookup(pdf, childRef).set(key("Parent"), rootPagesRef);
  rootNode.set(key("Kids"), pdf.context.obj([childRef]));
  rootNode.set(key("Count"), PDFNumber.of(1));
  assert.deepEqual(inspectPdfPageTree(pdf), { issues: [], pageCount: 1 });
});

test("raw-vs-parsed count boundary is explicit, without claiming full PDF lexical grammar", async () => {
  const valid = await fixture(2);
  root(valid).set(key("Count"), PDFNumber.of(2.0));
  assert.deepEqual(inspectPdfPageTree(valid), { issues: [], pageCount: 2 });
  const fractional = await fixture(2);
  root(fractional).set(key("Count"), PDFNumber.of(2.5));
  assertIssues(fractional, "nonnegative-count-required");
  const unsafe = await fixture(2);
  root(unsafe).set(key("Count"), PDFNumber.of(Number.MAX_SAFE_INTEGER + 1));
  assertIssues(unsafe, "nonnegative-count-required");
});

function pdfLookup(pdf, ref) { return pdf.context.lookup(ref); }
function pdfDeleteParent(pdf, ref) { pdfLookup(pdf, ref).delete(key("Parent")); }
