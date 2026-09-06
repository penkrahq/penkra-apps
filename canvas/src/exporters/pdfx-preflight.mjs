import { createHash } from "node:crypto";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNull, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from "pdf-lib";
import { inspectPdfxMetadata } from "./pdfx-metadata.mjs";
import { inspectPdfxFonts } from "./pdfx-fonts.mjs";
import { readPdfContent } from "./pdf-content.mjs";
import { CANVAS_SRGB_SOURCE_PROFILE, PDFX4_OUTPUT_CONDITION } from "./pdfx-profile.mjs";

// Checks serialized objects, not the caller's requested export settings. This is
// intentionally NOT a general-purpose PDF/X certifier. Remaining checks are
// returned as data so a clean partial report cannot unlock the profile gate.
export const PDFX_UNCOVERED = Object.freeze([
  "Documents outside the Canvas writer subset: complete PDF 1.6 syntax, operator/resource and architectural-limit validation",
  "Output profiles other than the hash-pinned ICC Registry GRACoL2013 CRPC6 profile",
  "Colour spaces other than Canvas DefaultRGB/sRGB2014, DeviceGray and the CMYK output intent",
  "Non-Identity-H/TrueType fonts and text or graphics in Form XObjects",
  "6.6: original-byte escaping of font and separation names before parser normalization",
  "Non-document XMP packets and provenance across incremental updates",
  "Optional content, annotations, forms, embedded files, halftones, transfer functions, PostScript and external streams",
]);

const ALLOWED_CONTENT_OPERATORS = new Set(["q", "Q", "cm", "w", "m", "l", "c", "h", "n", "f", "f*", "S", "B", "B*", "rg", "RG", "g", "G", "k", "K", "gs", "Do", "BT", "ET", "Tf", "Tm", "Tj", "TJ", "BDC", "BMC", "EMC"]);

// PDF Reference 1.6, chapters 4, 5 and 10: an allowed operator name is
// insufficient evidence without the corresponding operand types and arity.
function validContentOperands({ operator, operands }) {
  const numeric = (value) => value?.kind === "number" && Number.isFinite(value.value);
  const numbers = (count) => operands.length === count && operands.every(numeric);
  if (["q", "Q", "h", "n", "f", "f*", "S", "B", "B*", "BT", "ET", "EMC"].includes(operator)) return operands.length === 0;
  if (["cm", "c", "Tm"].includes(operator)) return numbers(6);
  if (["m", "l"].includes(operator)) return numbers(2);
  if (operator === "w") return numbers(1) && operands[0].value >= 0;
  if (["rg", "RG"].includes(operator)) return numbers(3);
  if (["g", "G"].includes(operator)) return numbers(1);
  if (["k", "K"].includes(operator)) return numbers(4);
  if (["gs", "Do", "BMC"].includes(operator)) return operands.length === 1 && operands[0].kind === "name";
  if (operator === "Tf") return operands.length === 2 && operands[0].kind === "name" && numeric(operands[1]);
  if (operator === "Tj") return operands.length === 1 && operands[0].kind === "string";
  if (operator === "TJ") return operands.length === 1 && operands[0].kind === "array" && operands[0].value.every((item) => item.kind === "string" || numeric(item));
  if (operator === "BDC") return operands.length === 2 && operands[0].kind === "name" && ["name", "dict"].includes(operands[1].kind);
  return false;
}

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
  return { deviceClass, colorSpace, channels, sha256: createHash("sha256").update(bytes).digest("hex"), issues };
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
  const result = () => ({
    profile: "PDF/X-4", standard: "ISO 15930-7:2010",
    status: issues.length ? "invalid" : "verified-canvas-writer-subset",
    // This deterministic checker is not a universal third-party PDF/X certifier.
    conformant: false,
    canvasWriterSubset: { verified: issues.length === 0, outputCondition: PDFX4_OUTPUT_CONDITION.identifier },
    issues, uncovered: [...PDFX_UNCOVERED],
  });
  let pdf;
  try { pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }); }
  catch { add("PDF_PARSE_FAILED", "6.1", "file"); return result(); }
  const resolve = (value) => value instanceof PDFRef ? pdf.context.lookup(value) : value;
  const get = (dict, key) => dict instanceof PDFDict ? resolve(dict.get(PDFName.of(key))) : undefined;
  const name = (value) => value instanceof PDFName ? value.decodeText() : undefined;
  const string = (value) => typeof value?.decodeText === "function" ? value.decodeText() : undefined;
  if (pdf.isEncrypted || pdf.context.trailerInfo.Encrypt) add("ENCRYPTION_FORBIDDEN", "6.15", "trailer");
  if (!/^%PDF-1\.6(?:\r\n|\r|\n)/u.test(Buffer.from(bytes).subarray(0, 10).toString("latin1"))) add("PDF_VERSION_UNSUPPORTED", "6.1", "header");
  const catalogVersion = name(get(pdf.catalog, "Version"));
  if (catalogVersion && catalogVersion !== "1.6") add("PDF_VERSION_UNSUPPORTED", "6.1", "Catalog/Version");
  const intents = get(pdf.catalog, "OutputIntents");
  const xIntents = intents instanceof PDFArray ? intents.asArray().map(resolve).filter((item) => name(get(item, "S")) === "GTS_PDFX") : [];
  if (!(intents instanceof PDFArray) || intents.size() !== 1 || xIntents.length !== 1) add("OUTPUT_INTENT_COUNT", "6.4.2.1", "Catalog/OutputIntents");
  for (const intent of xIntents) {
    if (string(get(intent, "OutputConditionIdentifier")) !== PDFX4_OUTPUT_CONDITION.identifier
      || string(get(intent, "RegistryName")) !== PDFX4_OUTPUT_CONDITION.registryName
      || string(get(intent, "Info")) !== PDFX4_OUTPUT_CONDITION.info) add("OUTPUT_CONDITION_UNSUPPORTED", "6.4.2.1", "OutputIntent");
    if (get(intent, "DestOutputProfileRef")) add("EXTERNAL_OUTPUT_PROFILE", "6.4.2.1", "OutputIntent");
    const profile = get(intent, "DestOutputProfile");
    if (!(profile instanceof PDFRawStream)) add("OUTPUT_PROFILE_MISSING", "6.4.2.1", "OutputIntent");
    else {
      try {
        const inspection = inspectPdfxOutputProfile(decodePDFRawStream(profile).decode());
        for (const issue of inspection.issues) add(issue.code, issue.clause, "OutputIntent/DestOutputProfile");
        if (get(profile.dict, "N")?.asNumber?.() !== inspection.channels) add("ICC_CHANNEL_COUNT_MISMATCH", "6.4.2.1", "OutputIntent/DestOutputProfile");
        if (inspection.sha256 !== PDFX4_OUTPUT_CONDITION.profileSha256) add("OUTPUT_PROFILE_UNSUPPORTED", "6.4.2.1", "OutputIntent/DestOutputProfile");
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
    inspectPageColorManagement(page, path, { resolve, get, name, add });
    inspectPageContent(page, path, { resolve, get, name, add });
  }
  // Traverse inline and indirect dictionaries, including unreachable objects.
  // Rejecting optional features here is a Canvas subset restriction, not a claim
  // that ISO prohibits every possible use of annotations/forms/embedded files.
  const seen = new Set();
  const checkNameEncoding = (value, path) => {
    const object = resolve(value);
    if (!(object instanceof PDFName)) { add("FONT_OR_SEPARATION_NAME_TYPE_INVALID", "6.6", path); return; }
    try { new TextDecoder("utf-8", { fatal: true }).decode(object.asBytes()); }
    catch { add("FONT_OR_SEPARATION_NAME_UTF8_INVALID", "6.6", path); }
  };
  const visit = (raw, path) => {
    const object = resolve(raw);
    if (!object || seen.has(object)) return;
    seen.add(object);
    if (object instanceof PDFArray) {
      const family = name(resolve(object.asArray()[0]));
      if (family === "Separation") checkNameEncoding(object.asArray()[1], `${path}[1]`);
      if (family === "DeviceN") {
        const colorants = resolve(object.asArray()[1]);
        if (!(colorants instanceof PDFArray)) add("FONT_OR_SEPARATION_NAME_TYPE_INVALID", "6.6", `${path}[1]`);
        else colorants.asArray().forEach((item, i) => checkNameEncoding(item, `${path}[1][${i}]`));
      }
      object.asArray().forEach((item, i) => visit(item, `${path}[${i}]`)); return;
    }
    const dict = object instanceof PDFRawStream ? object.dict : object;
    if (!(dict instanceof PDFDict)) return;
    if (name(get(dict, "Type")) === "Font" && get(dict, "BaseFont") !== undefined) checkNameEncoding(get(dict, "BaseFont"), `${path}/BaseFont`);
    if (name(get(dict, "Type")) === "FontDescriptor" && get(dict, "FontName") !== undefined) checkNameEncoding(get(dict, "FontName"), `${path}/FontName`);
    for (const key of ["OpenAction", "AA", "JavaScript", "JS"]) if (get(dict, key)) add("ACTION_FORBIDDEN", "6.18", `${path}/${key}`);
    for (const key of ["OCProperties", "Annots", "AcroForm", "XFA", "AlternatePresentations", "EmbeddedFiles"]) {
      const value = get(dict, key);
      if (value && !(value instanceof PDFArray && value.size() === 0)) add("CANVAS_SUBSET_UNSUPPORTED", "6.1", `${path}/${key}`);
    }
    if (name(get(dict, "Type")) === "Action") add("ACTION_FORBIDDEN", "6.18", path);
    if (name(get(dict, "Subtype")) === "PS" || name(get(dict, "Subtype2")) === "PS") add("POSTSCRIPT_FORBIDDEN", "6.14", path);
    if (get(dict, "PresSteps")) add("PRESENTATION_FORBIDDEN", "6.22", path);
    if (name(get(dict, "Type")) === "ExtGState") {
      for (const key of ["TR", "HT", "HTP", "BG", "BG2", "UCR", "UCR2"]) if (get(dict, key)) add("GRAPHICS_STATE_KEY_FORBIDDEN", "6.13", `${path}/${key}`);
      if (get(dict, "TR2") && name(get(dict, "TR2")) !== "Default") add("TRANSFER_FUNCTION_FORBIDDEN", "6.13", path);
      if (get(dict, "RI") && !["RelativeColorimetric", "AbsoluteColorimetric", "Perceptual", "Saturation"].includes(name(get(dict, "RI")))) add("RENDERING_INTENT_INVALID", "6.23", path);
      for (const key of ["ca", "CA"]) {
        const value = get(dict, key);
        if (value !== undefined && (!(value instanceof PDFNumber) || value.asNumber() < 0 || value.asNumber() > 1)) add("TRANSPARENCY_ALPHA_INVALID", "6.20", `${path}/${key}`);
      }
      const blend = get(dict, "BM");
      if (blend && !["Normal", "Compatible"].includes(name(blend))) add("BLEND_MODE_OUTSIDE_SUBSET", "6.20", `${path}/BM`);
      const mask = get(dict, "SMask");
      if (mask && name(mask) !== "None") add("SOFT_MASK_OUTSIDE_SUBSET", "6.20", `${path}/SMask`);
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

function inspectPageColorManagement(page, path, context) {
  const { resolve, get, name, add } = context;
  const resources = resolve(page.node.Resources());
  const defaultRgb = get(get(resources, "ColorSpace"), "DefaultRGB");
  const profile = iccProfileFromColorSpace(defaultRgb, resolve, name);
  if (!(profile instanceof PDFRawStream)) add("DEFAULT_RGB_MISSING", "6.4", `${path}/Resources/ColorSpace/DefaultRGB`);
  else {
    try {
      const bytes = decodePDFRawStream(profile).decode();
      const hash = createHash("sha256").update(bytes).digest("hex");
      const header = inspectIccHeader(bytes);
      if (hash !== CANVAS_SRGB_SOURCE_PROFILE.profileSha256 || header.deviceClass !== "mntr" || header.colorSpace !== CANVAS_SRGB_SOURCE_PROFILE.colorSpace || get(profile.dict, "N")?.asNumber?.() !== 3) add("DEFAULT_RGB_PROFILE_UNSUPPORTED", "6.4", `${path}/Resources/ColorSpace/DefaultRGB`);
    } catch { add("DEFAULT_RGB_PROFILE_UNREADABLE", "6.4", `${path}/Resources/ColorSpace/DefaultRGB`); }
  }
  const group = get(page.node, "Group");
  const groupProfile = iccProfileFromColorSpace(get(group, "CS"), resolve, name);
  if (!(group instanceof PDFDict) || name(get(group, "S")) !== "Transparency" || !(groupProfile instanceof PDFRawStream)) add("TRANSPARENCY_GROUP_INVALID", "6.20", `${path}/Group`);
  else {
    try {
      const hash = createHash("sha256").update(decodePDFRawStream(groupProfile).decode()).digest("hex");
      if (hash !== CANVAS_SRGB_SOURCE_PROFILE.profileSha256 || get(groupProfile.dict, "N")?.asNumber?.() !== CANVAS_SRGB_SOURCE_PROFILE.channels) add("TRANSPARENCY_GROUP_PROFILE_UNSUPPORTED", "6.20", `${path}/Group/CS`);
    } catch { add("TRANSPARENCY_GROUP_PROFILE_UNREADABLE", "6.20", `${path}/Group/CS`); }
  }
}

function inspectPageContent(page, path, context) {
  const { resolve, get, name, add } = context;
  const resources = resolve(page.node.Resources());
  let graphicsDepth = 0;
  let markedDepth = 0;
  let inText = false;
  const contents = get(page.node, "Contents");
  const streams = contents instanceof PDFArray ? contents.asArray().map(resolve) : contents ? [contents] : [];
  for (const [index, stream] of streams.entries()) {
    if (!(stream instanceof PDFRawStream)) { add("CONTENT_STREAM_INVALID", "6.1", `${path}/Contents[${index}]`); continue; }
    try {
      const operations = readPdfContent(decodePDFRawStream(stream).decode());
      for (const operation of operations) {
        // pdf-lib emits [] 0 d when drawing Canvas's solid rectangle outlines.
        // Only this reset is established by our writer; other dash patterns
        // remain outside the generated subset until separately validated.
        const solidDashReset = operation.operator === "d" && operation.operands.length === 2
          && operation.operands[0].kind === "array" && operation.operands[0].value.length === 0
          && operation.operands[1].kind === "number" && operation.operands[1].value === 0;
        const textLeading = operation.operator === "TL" && operation.operands.length === 1
          && operation.operands[0].kind === "number" && Number.isFinite(operation.operands[0].value);
        const nextTextLine = operation.operator === "T*" && operation.operands.length === 0;
        if (!solidDashReset && !textLeading && !nextTextLine && !ALLOWED_CONTENT_OPERATORS.has(operation.operator)) add("CONTENT_OPERATOR_OUTSIDE_SUBSET", "6.1", `${path}/Contents[${index}]/${operation.operator}`);
        const operandsValid = ALLOWED_CONTENT_OPERATORS.has(operation.operator) && validContentOperands(operation);
        if (ALLOWED_CONTENT_OPERATORS.has(operation.operator) && !operandsValid) add("CONTENT_OPERANDS_INVALID", "6.1", `${path}/Contents[${index}]/${operation.operator}`);
        const location = `${path}/Contents[${index}]/${operation.operator}`;
        const op = operation.operator;
        if (op === "q" && operandsValid) graphicsDepth += 1;
        if (op === "Q" && operandsValid) {
          if (graphicsDepth === 0) add("GRAPHICS_STATE_UNDERFLOW", "6.1", location);
          else graphicsDepth -= 1;
        }
        if (op === "BT" && operandsValid) {
          if (inText) add("TEXT_OBJECT_NESTED", "6.1", location);
          inText = true;
        }
        if (op === "ET" && operandsValid) {
          if (!inText) add("TEXT_OBJECT_UNDERFLOW", "6.1", location);
          inText = false;
        }
        if (["Tm", "Tj", "TJ"].includes(op) && operandsValid && !inText) add("TEXT_OPERATOR_OUTSIDE_TEXT", "6.1", location);
        if (op === "T*" && nextTextLine && !inText) add("TEXT_OPERATOR_OUTSIDE_TEXT", "6.1", location);
        if (["BDC", "BMC"].includes(op) && operandsValid) markedDepth += 1;
        if (op === "EMC" && operandsValid) {
          if (markedDepth === 0) add("MARKED_CONTENT_UNDERFLOW", "6.1", location);
          else markedDepth -= 1;
        }
        if (operandsValid && ["gs", "Do", "Tf"].includes(op)) inspectNamedContentResource(op, operation.operands[0].value, resources, location, { resolve, get, name, add });
        if (op === "BDC" && operandsValid && operation.operands[1]?.kind === "name") inspectNamedContentResource("BDC", operation.operands[1].value, resources, location, { resolve, get, name, add });
      }
    } catch { add("CONTENT_SYNTAX_INVALID_OR_UNSUPPORTED", "6.1", `${path}/Contents[${index}]`); }
  }
  if (graphicsDepth !== 0) add("GRAPHICS_STATE_UNBALANCED", "6.1", path);
  if (inText) add("TEXT_OBJECT_UNCLOSED", "6.1", path);
  if (markedDepth !== 0) add("MARKED_CONTENT_UNCLOSED", "6.1", path);
  const xobjects = get(resolve(page.node.Resources()), "XObject");
  if (!(xobjects instanceof PDFDict)) return;
  for (const [key, value] of xobjects.entries()) {
    const object = resolve(value);
    const objectPath = `${path}/Resources/XObject/${key.decodeText()}`;
    if (!(object instanceof PDFRawStream)) { add("XOBJECT_UNRESOLVED", "6.3", objectPath); continue; }
    if (name(get(object.dict, "Subtype")) === "Form") { add("FORM_XOBJECT_OUTSIDE_SUBSET", "6.1", objectPath); continue; }
    if (name(get(object.dict, "Subtype")) !== "Image") { add("XOBJECT_SUBTYPE_UNSUPPORTED", "6.1", objectPath); continue; }
    for (const dimension of ["Width", "Height"]) if (!(get(object.dict, dimension) instanceof PDFNumber) || !Number.isInteger(get(object.dict, dimension).asNumber()) || get(object.dict, dimension).asNumber() <= 0) add("IMAGE_DIMENSION_INVALID", "6.16", `${objectPath}/${dimension}`);
    const bits = get(object.dict, "BitsPerComponent");
    if (bits && (!(bits instanceof PDFNumber) || ![1, 2, 4, 8, 16].includes(bits.asNumber()))) add("IMAGE_BITS_INVALID", "6.16", `${objectPath}/BitsPerComponent`);
    const colorSpace = name(get(object.dict, "ColorSpace"));
    if (colorSpace && !["DeviceRGB", "DeviceGray"].includes(colorSpace)) add("IMAGE_COLOR_SPACE_OUTSIDE_SUBSET", "6.4", `${objectPath}/ColorSpace`);
  }
}

function inspectNamedContentResource(operator, resourceName, resources, location, context) {
  const { resolve, get, name, add } = context;
  const categories = { gs: "ExtGState", Do: "XObject", Tf: "Font", BDC: "Properties" };
  const category = get(resources, categories[operator]);
  const raw = category instanceof PDFDict ? category.get(PDFName.of(resourceName)) : undefined;
  if (raw === undefined) { add("CONTENT_RESOURCE_UNRESOLVED", "6.3", location); return; }
  let value;
  try { value = resolve(raw); }
  catch { add("CONTENT_RESOURCE_UNRESOLVED", "6.3", location); return; }
  if (value === undefined || value === null || value === PDFNull) { add("CONTENT_RESOURCE_UNRESOLVED", "6.3", location); return; }
  if (operator === "gs") {
    if (!(value instanceof PDFDict)) add("CONTENT_RESOURCE_TYPE_INVALID", "6.3", location);
    else if (get(value, "Type") !== undefined && name(get(value, "Type")) !== "ExtGState") add("CONTENT_RESOURCE_TYPE_INVALID", "6.3", location);
    return;
  }
  if (operator === "Do") {
    if (!(value instanceof PDFRawStream)) add("CONTENT_RESOURCE_TYPE_INVALID", "6.3", location);
    else if (name(get(value.dict, "Subtype")) === "Form") add("FORM_XOBJECT_OUTSIDE_SUBSET", "6.1", location);
    else if (name(get(value.dict, "Subtype")) !== "Image") add("CONTENT_RESOURCE_SUBTYPE_INVALID", "6.1", location);
    return;
  }
  if (operator === "Tf") {
    if (!(value instanceof PDFDict) || name(get(value, "Type")) !== "Font") add("CONTENT_RESOURCE_TYPE_INVALID", "6.3", location);
    return;
  }
  if (!(value instanceof PDFDict)) add("CONTENT_RESOURCE_TYPE_INVALID", "6.3", location);
}

function iccProfileFromColorSpace(value, resolve, name) {
  const space = resolve(value);
  if (!(space instanceof PDFArray) || space.size() !== 2 || name(resolve(space.get(0))) !== "ICCBased") return null;
  return resolve(space.get(1));
}

function inspectIccHeader(input) {
  const bytes = new Uint8Array(input);
  if (bytes.length < 128) return {};
  const ascii = (from, to) => String.fromCharCode(...bytes.subarray(from, to));
  return { deviceClass: ascii(12, 16), colorSpace: ascii(16, 20) };
}
