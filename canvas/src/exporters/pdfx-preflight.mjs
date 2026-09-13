import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from "pdf-lib";
import { inspectPdfxMetadata } from "./pdfx-metadata.mjs";
import { inspectPdfxFonts } from "./pdfx-fonts.mjs";

// Checks serialized objects, not the caller's requested export settings. This is
// intentionally NOT a general-purpose PDF/X certifier. Remaining checks are
// returned as data so a clean partial report cannot unlock the profile gate.
export const PDFX_UNCOVERED = Object.freeze([
  "6.1/PDF-1.6: complete syntax, operator/resource and architectural-limit validation",
  "6.4: ICC transform validity and content colour-space compatibility",
  "6.5: non-Identity-H/TrueType fonts and text in Form XObjects are outside the checked writer subset",
  "6.6: font and separation name UTF-8 encoding",
  "6.10: non-document XMP packets and provenance across incremental updates",
  "6.13/6.16/6.20/6.23: graphics state, image, transparency and rendering-intent semantics",
]);

export function inspectPdfxOutputProfile(input) {
  const bytes = new Uint8Array(input);
  const issues = [];
  const issue = (code) => issues.push({ code, clause: "6.4.2.1" });
  if (bytes.length < 132) return { issues: [{ code: "ICC_TRUNCATED", clause: "6.4.2.1" }] };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (from, to) => String.fromCharCode(...bytes.subarray(from, to));
  const deviceClass = ascii(12, 16);
  const colorSpace = ascii(16, 20);
  const channels = ({ "GRAY": 1, "RGB ": 3, "CMYK": 4 })[colorSpace];
  if (view.getUint32(0) !== bytes.length || ascii(36, 40) !== "acsp") issue("ICC_HEADER_INVALID");
  if (deviceClass !== "prtr") issue("ICC_NOT_OUTPUT_DEVICE");
  if (!channels) issue("ICC_PROCESS_CHANNELS_INVALID");
  if (![2, 4].includes(bytes[8])) issue("ICC_VERSION_UNSUPPORTED");
  if (!["XYZ ", "Lab "].includes(ascii(20, 24))) issue("ICC_PCS_INVALID");
  const count = view.getUint32(128);
  if (count > Math.floor((bytes.length - 132) / 12)) issue("ICC_TAG_TABLE_TRUNCATED");
  else for (let index = 0; index < count; index += 1) {
    const offset = view.getUint32(136 + index * 12);
    const length = view.getUint32(140 + index * 12);
    if (offset < 132 + count * 12 || length < 8 || offset % 4 !== 0 || offset + length > bytes.length) issue("ICC_TAG_RANGE_INVALID");
  }
  return { deviceClass, colorSpace, channels, issues };
}

export async function preflightPdfx4(bytes) {
  try { return await inspectPdfx4(bytes); }
  catch {
    return { profile: "PDF/X-4", standard: "ISO 15930-7:2010", status: "invalid", conformant: false, issues: [{ code: "OBJECT_GRAPH_INVALID", clause: "6.1", object: "file" }], uncovered: [...PDFX_UNCOVERED] };
  }
}

async function inspectPdfx4(bytes) {
  const issues = [];
  const add = (code, clause, object) => issues.push({ code, clause, object });
  const result = () => ({ profile: "PDF/X-4", standard: "ISO 15930-7:2010", status: issues.length ? "invalid" : "incomplete", conformant: false, issues, uncovered: [...PDFX_UNCOVERED] });
  let pdf;
  try { pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }); }
  catch { add("PDF_PARSE_FAILED", "6.1", "file"); return result(); }
  const resolve = (value) => value instanceof PDFRef ? pdf.context.lookup(value) : value;
  const get = (dict, key) => dict instanceof PDFDict ? resolve(dict.get(PDFName.of(key))) : undefined;
  const name = (value) => value instanceof PDFName ? value.decodeText() : undefined;
  const string = (value) => typeof value?.decodeText === "function" ? value.decodeText() : undefined;
  if (pdf.isEncrypted || pdf.context.trailerInfo.Encrypt) add("ENCRYPTION_FORBIDDEN", "6.15", "trailer");
  const intents = get(pdf.catalog, "OutputIntents");
  const xIntents = intents instanceof PDFArray ? intents.asArray().map(resolve).filter((item) => name(get(item, "S")) === "GTS_PDFX") : [];
  if (xIntents.length !== 1) add("OUTPUT_INTENT_COUNT", "6.4.2.1", "Catalog/OutputIntents");
  for (const intent of xIntents) {
    if (!string(get(intent, "OutputConditionIdentifier"))?.trim()) add("OUTPUT_CONDITION_MISSING", "6.4.2.1", "OutputIntent");
    if (get(intent, "DestOutputProfileRef")) add("EXTERNAL_OUTPUT_PROFILE", "6.4.2.1", "OutputIntent");
    const profile = get(intent, "DestOutputProfile");
    if (!(profile instanceof PDFRawStream)) add("OUTPUT_PROFILE_MISSING", "6.4.2.1", "OutputIntent");
    else {
      try {
        const inspection = inspectPdfxOutputProfile(decodePDFRawStream(profile).decode());
        for (const issue of inspection.issues) add(issue.code, issue.clause, "OutputIntent/DestOutputProfile");
        if (get(profile.dict, "N")?.asNumber?.() !== inspection.channels) add("ICC_CHANNEL_COUNT_MISMATCH", "6.4.2.1", "OutputIntent/DestOutputProfile");
      } catch { add("OUTPUT_PROFILE_UNREADABLE", "6.4.2.1", "OutputIntent/DestOutputProfile"); }
    }
  }
  const metadata = get(pdf.catalog, "Metadata");
  if (!(metadata instanceof PDFRawStream)) add("XMP_MISSING", "6.10.1", "Catalog/Metadata");
  else {
    if (get(metadata.dict, "Filter")) add("XMP_FILTER_FORBIDDEN", "6.10.1", "Catalog/Metadata");
    if (name(get(metadata.dict, "Type")) !== "Metadata" || name(get(metadata.dict, "Subtype")) !== "XML") add("XMP_STREAM_TYPE_INVALID", "6.10.1", "Catalog/Metadata");
    const infoDict = resolve(pdf.context.trailerInfo.Info);
    for (const key of ["Title", "Author", "Subject", "Keywords", "Creator", "Producer", "CreationDate", "ModDate", "GTS_PDFXVersion"]) {
      const value = get(infoDict, key);
      if (value !== undefined && !(value instanceof PDFString) && !(value instanceof PDFHexString)) add("INFO_VALUE_TYPE_INVALID", "6.10.2", `Info/${key}`);
    }
    if (get(infoDict, "Trapped") !== undefined && !(get(infoDict, "Trapped") instanceof PDFName)) add("INFO_VALUE_TYPE_INVALID", "6.10.2", "Info/Trapped");
    const info = infoDict instanceof PDFDict ? Object.fromEntries(infoDict.entries().map(([key, value]) => [key.decodeText(), string(resolve(value))])) : {};
    const report = inspectPdfxMetadata(decodePDFRawStream(metadata).decode(), info);
    issues.push(...report.issues);
    const version = get(infoDict, "GTS_PDFXVersion");
    if (version?.asBytes?.()[0] === 0xfe && version?.asBytes?.()[1] === 0xff) add("PDFX_VERSION_ENCODING_INVALID", "6.10.2", "Info/GTS_PDFXVersion");
  }
  const id = resolve(pdf.context.trailerInfo.ID);
  if (!(id instanceof PDFArray) || id.size() !== 2 || id.asArray().some((value) => !resolve(value)?.asBytes?.()?.length)) add("TRAILER_ID_INVALID", "6.10.4", "trailer/ID");
  if (pdf.getPageCount() === 0) add("PAGES_MISSING", "6.1", "Pages");
  for (const [index, page] of pdf.getPages().entries()) {
    const path = `Page[${index}]`;
    const boxes = {};
    for (const key of ["MediaBox", "CropBox", "BleedBox", "TrimBox", "ArtBox"]) {
      const box = get(page.node, key) ?? (["MediaBox", "CropBox"].includes(key) ? resolve(page.node.getInheritableAttribute(PDFName.of(key))) : undefined);
      if (!box) continue;
      const numbers = box instanceof PDFArray ? box.asArray().map(resolve).map((n) => n instanceof PDFNumber ? n.asNumber() : NaN) : [];
      if (numbers.length !== 4 || numbers.some((n) => !Number.isFinite(n)) || numbers[0] >= numbers[2] || numbers[1] >= numbers[3]) add("PAGE_BOX_INVALID", "6.12", `${path}/${key}`);
      else boxes[key] = numbers;
    }
    if (Boolean(boxes.TrimBox) === Boolean(boxes.ArtBox)) add("TRIM_OR_ART_REQUIRED", "6.12", path);
    if (!boxes.MediaBox) add("MEDIA_BOX_MISSING", "6.12", path);
    const encloses = (outer, inner) => outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3];
    for (const key of ["CropBox", "BleedBox", "TrimBox", "ArtBox"]) if (boxes.MediaBox && boxes[key] && !encloses(boxes.MediaBox, boxes[key])) add("BOX_OUTSIDE_MEDIA", "6.12", `${path}/${key}`);
    for (const key of ["TrimBox", "ArtBox"]) if (boxes.BleedBox && boxes[key] && !encloses(boxes.BleedBox, boxes[key])) add("TRIM_OUTSIDE_BLEED", "6.12", `${path}/${key}`);
    for (const key of ["TrimBox", "ArtBox", "BleedBox"]) if (boxes.CropBox && boxes[key] && !encloses(boxes.CropBox, boxes[key])) add("BOX_OUTSIDE_CROP", "6.12", `${path}/${key}`);
  }
  // Traverse inline and indirect dictionaries, including unreachable objects.
  // Rejecting optional features here is a Canvas subset restriction, not a claim
  // that ISO prohibits every possible use of annotations/forms/embedded files.
  const seen = new Set();
  const visit = (raw, path) => {
    const object = resolve(raw);
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFArray) { object.asArray().forEach((item, i) => visit(item, `${path}[${i}]`)); return; }
    const dict = object instanceof PDFRawStream ? object.dict : object;
    if (!(dict instanceof PDFDict)) return;
    for (const key of ["OpenAction", "AA", "JavaScript", "JS"]) if (get(dict, key)) add("ACTION_FORBIDDEN", "6.18", `${path}/${key}`);
    for (const key of ["OCProperties", "Annots", "AcroForm", "XFA", "AlternatePresentations", "EmbeddedFiles"]) {
      const value = get(dict, key);
      if (value && !(value instanceof PDFArray && value.size() === 0)) add("CANVAS_SUBSET_UNSUPPORTED", "6.1", `${path}/${key}`);
    }
    if (name(get(dict, "Type")) === "Action") add("ACTION_FORBIDDEN", "6.18", path);
    if (name(get(dict, "Subtype")) === "PS" || name(get(dict, "Subtype2")) === "PS") add("POSTSCRIPT_FORBIDDEN", "6.14", path);
    if (get(dict, "PresSteps")) add("PRESENTATION_FORBIDDEN", "6.22", path);
    if (name(get(dict, "Type")) === "ExtGState") {
      for (const key of ["TR", "HTP"]) if (get(dict, key)) add("GRAPHICS_STATE_KEY_FORBIDDEN", "6.13", `${path}/${key}`);
      if (get(dict, "TR2") && name(get(dict, "TR2")) !== "Default") add("TRANSFER_FUNCTION_FORBIDDEN", "6.13", path);
      if (get(dict, "RI") && !["RelativeColorimetric", "AbsoluteColorimetric", "Perceptual", "Saturation"].includes(name(get(dict, "RI")))) add("RENDERING_INTENT_INVALID", "6.23", path);
    }
    if (get(dict, "OPI") || (name(get(dict, "Subtype")) === "Form" && get(dict, "Ref"))) add("EXTERNAL_RESOURCE_FORBIDDEN", "6.7", path);
    if (name(get(dict, "Type")) === "Font" && name(get(dict, "Subtype")) !== "Type0") {
      const descriptor = get(dict, "FontDescriptor");
      if (!["FontFile", "FontFile2", "FontFile3"].some((key) => get(descriptor, key) instanceof PDFRawStream)) add("FONT_NOT_EMBEDDED", "6.5.1", path);
    }
    if (object instanceof PDFRawStream) {
      if (get(dict, "F")) add("EXTERNAL_STREAM_FORBIDDEN", "6.7", path);
      const filter = get(dict, "Filter");
      const filters = filter instanceof PDFArray ? filter.asArray().map(resolve) : filter ? [filter] : [];
      if (filters.some((value) => !["FlateDecode", "ASCIIHexDecode", "ASCII85Decode", "RunLengthDecode", "CCITTFaxDecode", "JBIG2Decode", "DCTDecode", "JPXDecode"].includes(name(value)))) add("STREAM_FILTER_FORBIDDEN", "6.8", path);
    }
    for (const [key, value] of dict.entries()) visit(value, `${path}/${key.decodeText()}`);
  };
  try { for (const [ref, object] of pdf.context.enumerateIndirectObjects()) visit(object, ref.toString()); }
  catch { add("OBJECT_GRAPH_INVALID", "6.1", "file"); }
  const fontReport = inspectPdfxFonts(pdf);
  issues.push(...fontReport.issues);
  return result();
}
