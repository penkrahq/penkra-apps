import { PDFArray, PDFDict, PDFName, PDFRawStream, PDFRef } from "pdf-lib";

const VIEWER_BOX_KEYS = Object.freeze(["ViewArea", "ViewClip", "PrintArea", "PrintClip"]);
const SUBSET_CLAUSE = "6.24";
const METADATA_CLAUSE = "6.10.6";
const VIEWER_CLAUSE = "6.21";
const GRAPH_CLAUSE = "6.1";

// This is a Canvas-writer subset policy, not a statement that ISO 15930-7
// universally prohibits every optional PDF feature listed here. The policy
// records features the Canvas writer does not emit.
export function inspectPdfxSubsetPolicy(pdf) {
  const issues = [];
  const invalidRefs = new Set();
  const issue = (code, clause, object) => issues.push({ code, clause, object });
  const invalidGraph = (object) => {
    const label = String(object);
    if (!invalidRefs.has(label)) {
      invalidRefs.add(label);
      issue("OBJECT_GRAPH_INVALID", GRAPH_CLAUSE, label);
    }
  };
  const resolve = (value, path) => {
    if (!(value instanceof PDFRef)) return value;
    try {
      const resolved = pdf.context.lookup(value);
      if (resolved === undefined || resolved === null) { invalidGraph(path || value.toString()); return undefined; }
      return resolved;
    } catch {
      invalidGraph(path || value.toString());
      return undefined;
    }
  };
  const name = (value, path) => {
    const resolved = resolve(value, path);
    return resolved instanceof PDFName ? resolved.decodeText() : undefined;
  };
  const has = (dict, key) => dict instanceof PDFDict && dict.has(PDFName.of(key));
  const get = (dict, key, path) => dict instanceof PDFDict ? resolve(dict.get(PDFName.of(key)), `${path}/${key}`) : undefined;

  let catalog;
  try { catalog = pdf.catalog; }
  catch { invalidGraph("Catalog"); return { issues }; }
  const catalogMetadata = has(catalog, "Metadata") ? resolve(catalog.get(PDFName.of("Metadata")), "Catalog/Metadata") : undefined;

  // Canvas subset exclusions: Perms, optional-content dictionaries/keys,
  // halftones, and metadata streams other than the exact catalog packet.
  if (has(catalog, "Perms")) issue("CANVAS_SUBSET_UNSUPPORTED", SUBSET_CLAUSE, "Catalog/Perms");
  const viewerPreferences = get(catalog, "ViewerPreferences", "Catalog");
  if (viewerPreferences instanceof PDFDict) {
    let pages;
    try { pages = pdf.getPages(); }
    catch { invalidGraph("Pages"); pages = []; }
    for (const key of VIEWER_BOX_KEYS) {
      if (!has(viewerPreferences, key)) continue;
      const value = get(viewerPreferences, key, `Catalog/ViewerPreferences`);
      const selected = name(value, `Catalog/ViewerPreferences/${key}`);
      if (selected === "MediaBox") continue;
      if (selected === "BleedBox" && pages.length > 0 && pages.every((page) => has(page.node, "BleedBox"))) continue;
      issue("VIEWER_PREFERENCE_BOX_INVALID", VIEWER_CLAUSE, `Catalog/ViewerPreferences/${key}`);
    }
  } else if (has(catalog, "ViewerPreferences")) {
    issue("VIEWER_PREFERENCE_BOX_INVALID", VIEWER_CLAUSE, "Catalog/ViewerPreferences");
  }

  const seen = new Set();
  const visit = (raw, path) => {
    const object = resolve(raw, path);
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFArray) {
      object.asArray().forEach((value, index) => visit(value, `${path}[${index}]`));
      return;
    }
    const dict = object instanceof PDFRawStream ? object.dict : object;
    if (!(dict instanceof PDFDict)) return;
    const type = name(dict.get(PDFName.of("Type")), `${path}/Type`);
    const subtype = name(dict.get(PDFName.of("Subtype")), `${path}/Subtype`);
    if (type === "OCG" || type === "OCMD" || has(dict, "OC") || has(dict, "HalftoneType")) {
      issue("CANVAS_SUBSET_UNSUPPORTED", SUBSET_CLAUSE, path);
    }
    if (object instanceof PDFRawStream && (type === "Metadata" || subtype === "XML") && object !== catalogMetadata) {
      issue("CANVAS_SUBSET_UNSUPPORTED", METADATA_CLAUSE, path);
    }
    for (const [key, value] of dict.entries()) visit(value, `${path}/${key.decodeText()}`);
  };

  try {
    visit(catalog, "Catalog");
    for (const [ref, object] of pdf.context.enumerateIndirectObjects()) visit(object, ref.toString());
  } catch {
    invalidGraph("file");
  }
  return { issues };
}
