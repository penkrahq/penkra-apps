import { PDFArray, PDFDict, PDFName, PDFNumber, PDFRef } from "pdf-lib";

// Inspect the raw page-tree links, never pdf-lib's repaired/cached page list.
// Other page resources, geometry, content and PDF/X requirements are separate.
export function inspectPdfPageTree(pdf) {
  const issues = [];
  const issue = (object, detail) => issues.push({ code: "PDF_PAGE_TREE_INVALID", clause: "6.1", object, detail });
  const get = (dict, key) => dict.get(PDFName.of(key));
  const resolve = (value) => value instanceof PDFRef ? pdf.context.lookup(value) : value;
  const name = (value) => resolve(value) instanceof PDFName ? resolve(value).decodeText() : undefined;
  const sameRef = (left, right) => left instanceof PDFRef && right instanceof PDFRef
    && left.objectNumber === right.objectNumber && left.generationNumber === right.generationNumber;
  let pageCount = 0;
  try {
    const catalog = resolve(pdf.context.trailerInfo.Root);
    if (!(catalog instanceof PDFDict) || name(get(catalog, "Type")) !== "Catalog") {
      issue("Catalog", "catalog-required"); return { issues, pageCount };
    }
    const root = get(catalog, "Pages");
    if (!(root instanceof PDFRef)) { issue("Catalog/Pages", "indirect-pages-root-required"); return { issues, pageCount }; }
    const seen = new Set();
    const frames = [{ ref: root, parent: null, path: "Catalog/Pages", exit: false }];
    const totals = new Map();
    while (frames.length) {
      const frame = frames.pop();
      const { ref, parent, path } = frame;
      const key = ref instanceof PDFRef ? ref.toString() : null;
      if (frame.exit) {
        const total = frame.children.reduce((sum, child) => sum + (totals.get(child.toString()) ?? 0), 0);
        totals.set(key, total);
        if (frame.count !== total) issue(`${path}/Count`, "descendant-count-mismatch");
        continue;
      }
      if (!(ref instanceof PDFRef)) { issue(path, "indirect-child-required"); continue; }
      if (seen.has(key)) { issue(path, "cycle-or-repeated-child"); continue; }
      seen.add(key);
      const dict = resolve(ref);
      if (!(dict instanceof PDFDict)) { issue(path, "page-dictionary-required"); continue; }
      const type = name(get(dict, "Type"));
      if (type !== "Pages" && type !== "Page") { issue(`${path}/Type`, "page-type-invalid"); continue; }
      if (parent === null) {
        if (type !== "Pages") issue(`${path}/Type`, "pages-root-required");
        if (dict.has(PDFName.of("Parent"))) issue(`${path}/Parent`, "root-parent-outside-subset");
      } else if (!sameRef(get(dict, "Parent"), parent)) issue(`${path}/Parent`, "parent-reference-mismatch");
      if (type === "Page") { totals.set(key, 1); pageCount += 1; continue; }
      const count = resolve(get(dict, "Count"));
      if (!(count instanceof PDFNumber) || !Number.isSafeInteger(count.asNumber()) || count.asNumber() < 0) {
        issue(`${path}/Count`, "nonnegative-count-required");
      }
      const kids = resolve(get(dict, "Kids"));
      if (!(kids instanceof PDFArray)) { issue(`${path}/Kids`, "kids-array-required"); continue; }
      const children = kids.asArray();
      frames.push({ ...frame, exit: true, children, count: count instanceof PDFNumber ? count.asNumber() : null });
      for (let index = children.length - 1; index >= 0; index -= 1) {
        frames.push({ ref: children[index], parent: ref, path: `${path}/Kids[${index}]`, exit: false });
      }
    }
  } catch { issue("Pages", "page-tree-inspection-failed"); }
  return { issues, pageCount };
}
