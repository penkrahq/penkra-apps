import { DOMParser } from "@xmldom/xmldom";

const NS = Object.freeze({
  x: "adobe:ns:meta/", rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  dc: "http://purl.org/dc/elements/1.1/", pdf: "http://ns.adobe.com/pdf/1.3/",
  xmp: "http://ns.adobe.com/xap/1.0/", xmpMM: "http://ns.adobe.com/xap/1.0/mm/",
  pdfxid: "http://www.npes.org/pdfx/ns/id/",
});
const XMLNS = "http://www.w3.org/2000/xmlns/";
const XML = "http://www.w3.org/XML/1998/namespace";
const CROSSWALK = { Title: "dc:title", Author: "dc:creator", Subject: "dc:description", Keywords: "pdf:Keywords", Creator: "xmp:CreatorTool", Producer: "pdf:Producer", CreationDate: "xmp:CreateDate", ModDate: "xmp:ModifyDate", Trapped: "pdf:Trapped", GTS_PDFXVersion: "pdfxid:GTS_PDFXVersion" };
const elements = (node) => Array.from(node.childNodes ?? []).filter((child) => child.nodeType === 1);
const hasStrayText = (node) => Array.from(node.childNodes ?? []).some((child) => [3, 4].includes(child.nodeType) && child.data.trim());

// The supported RDF serialization is deliberately bounded: document-level
// Description properties, scalar text, and dc language/ordered arrays. Other
// RDF shapes are rejected as outside this checker, not silently ignored.
export function inspectPdfxMetadata(bytes, info = {}) {
  const issues = [];
  const add = (code, property = "Metadata", clause = "6.10") => issues.push({ code, clause, object: property });
  const values = new Map();
  let doc;
  try {
    const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (xml.length > 1024 * 1024 || /<!DOCTYPE|<!ENTITY/u.test(xml)) throw new Error("Unsupported document declaration");
    // XML 1.0 character repertoire, including supplementary characters.
    if (/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/u.test(xml)) throw new Error("Invalid XML character");
    doc = new DOMParser({ onError() { throw new Error("Malformed XML"); }, normalizeLineEndings: (text) => text.replace(/\r\n?/gu, "\n") }).parseFromString(xml, "application/xml");
  } catch { add("XMP_XML_INVALID"); return { issues, values: {} }; }
  const root = doc.documentElement;
  if (root?.namespaceURI !== NS.x || root.localName !== "xmpmeta") { add("XMP_ROOT_UNSUPPORTED"); return { issues, values: {} }; }
  for (const node of Array.from(doc.childNodes)) if (node.nodeType === 7 && node.target === "xpacket" && /(?:^|\s)(?:bytes|encoding)\s*=/u.test(node.data)) add("XMP_PACKET_ATTRIBUTE_FORBIDDEN", "xpacket", "6.10.3");
  const rdf = elements(root);
  if (rdf.length !== 1 || rdf[0].namespaceURI !== NS.rdf || rdf[0].localName !== "RDF") { add("XMP_RDF_INVALID"); return { issues, values: {} }; }
  if (hasStrayText(root) || hasStrayText(rdf[0]) || Array.from(rdf[0].attributes).some((attr) => attr.namespaceURI !== XMLNS)) add("XMP_RDF_INVALID");
  const addValue = (node, value) => {
    const prefix = Object.keys(NS).find((key) => NS[key] === node.namespaceURI);
    if (!prefix || ["x", "rdf"].includes(prefix)) { add("XMP_PROPERTY_UNSUPPORTED", node.nodeName); return; }
    const key = `${prefix}:${node.localName}`;
    if (node.prefix !== prefix) add("XMP_REQUIRED_PREFIX", key, "6.10.1");
    if (prefix === "pdfxid" && node.localName !== "GTS_PDFXVersion") add("XMP_IDENTIFICATION_PROPERTY_FORBIDDEN", key, "6.11");
    if (values.has(key)) add("XMP_DUPLICATE_PROPERTY", key);
    else values.set(key, value);
  };
  for (const description of elements(rdf[0])) {
    if (description.namespaceURI !== NS.rdf || description.localName !== "Description" || !description.hasAttributeNS(NS.rdf, "about") || description.getAttributeNS(NS.rdf, "about") !== "") { add("XMP_RDF_DESCRIPTION_UNSUPPORTED"); continue; }
    if (hasStrayText(description)) add("XMP_RDF_INVALID");
    for (const attr of Array.from(description.attributes)) {
      if (attr.namespaceURI === XMLNS || (attr.namespaceURI === NS.rdf && attr.localName === "about")) continue;
      if (attr.namespaceURI === NS.dc && ["title", "description", "creator"].includes(attr.localName)) add("XMP_PROPERTY_SHAPE_UNSUPPORTED", attr.nodeName);
      addValue(attr, attr.value);
    }
    for (const property of elements(description)) {
      const children = elements(property);
      if (Array.from(property.attributes).some((attr) => attr.namespaceURI !== XMLNS)) add("XMP_PROPERTY_SHAPE_UNSUPPORTED", property.nodeName);
      if (!children.length) {
        if (property.namespaceURI === NS.dc && ["title", "description", "creator"].includes(property.localName)) add("XMP_PROPERTY_SHAPE_UNSUPPORTED", property.nodeName);
        addValue(property, property.textContent);
        continue;
      }
      const arrayName = property.namespaceURI === NS.dc && ["title", "description"].includes(property.localName) ? "Alt" : property.namespaceURI === NS.dc && property.localName === "creator" ? "Seq" : null;
      if (!arrayName || children.length !== 1 || children[0].namespaceURI !== NS.rdf || children[0].localName !== arrayName) { add("XMP_PROPERTY_SHAPE_UNSUPPORTED", property.nodeName); continue; }
      if (hasStrayText(property) || hasStrayText(children[0])) add("XMP_ARRAY_INVALID", property.nodeName);
      const items = elements(children[0]);
      if (!items.length || items.some((item) => item.namespaceURI !== NS.rdf || item.localName !== "li" || elements(item).length)) { add("XMP_ARRAY_INVALID", property.nodeName); continue; }
      if (Array.from(children[0].attributes).some((attr) => attr.namespaceURI !== XMLNS) || items.some((item) => Array.from(item.attributes).some((attr) => attr.namespaceURI !== XMLNS && !(arrayName === "Alt" && attr.namespaceURI === XML && attr.localName === "lang")))) add("XMP_ARRAY_INVALID", property.nodeName);
      if (arrayName === "Alt") {
        const defaults = items.filter((item) => item.getAttributeNS(XML, "lang") === "x-default");
        const languages = items.map((item) => item.getAttributeNS(XML, "lang"));
        if (defaults.length !== 1 || languages.some((lang) => !lang) || new Set(languages).size !== languages.length) add("XMP_LANGUAGE_ARRAY_INVALID", property.nodeName);
        addValue(property, defaults[0]?.textContent ?? "");
      } else {
        if (info.Author !== undefined && items.length !== 1) add("XMP_AUTHOR_ARRAY_INVALID", property.nodeName, "6.10.2");
        addValue(property, items[0].textContent);
      }
    }
  }
  for (const key of ["xmpMM:DocumentID", "xmpMM:VersionID", "xmpMM:RenditionClass", "xmp:CreateDate", "xmp:ModifyDate", "xmp:MetadataDate", "dc:title"]) if (!values.get(key)?.trim()) add("XMP_REQUIRED_PROPERTY_MISSING", key, "6.10.4");
  if (values.get("pdfxid:GTS_PDFXVersion") !== "PDF/X-4") add("XMP_PDFX_IDENTIFICATION_INVALID", "pdfxid:GTS_PDFXVersion", "6.11");
  if (!["True", "False"].includes(values.get("pdf:Trapped"))) add("XMP_TRAPPING_INVALID", "pdf:Trapped", "6.9");
  for (const key of ["xmp:CreateDate", "xmp:ModifyDate", "xmp:MetadataDate"]) if (values.has(key) && xmpDate(values.get(key)) === null) add("XMP_DATE_INVALID_OR_UNSUPPORTED", key, "6.10.4");
  for (const [key, property] of Object.entries(CROSSWALK)) {
    if (info[key] === undefined) continue;
    const equal = ["CreationDate", "ModDate"].includes(key) ? pdfDate(info[key]) !== null && pdfDate(info[key]) === xmpDate(values.get(property)) : info[key] === values.get(property);
    if (!equal) add("INFO_XMP_MISMATCH", key, "6.10.2");
  }
  if (info.GTS_PDFXConformance !== undefined) add("LEGACY_PDFX_CONFORMANCE_FORBIDDEN", "GTS_PDFXConformance", "6.11");
  return { issues, values: Object.fromEntries(values) };
}

// Full date/time is the Canvas writer subset; reduced precision is not falsely
// treated as equal to a full timestamp with missing components filled in.
function xmpDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value)) return null;
  const timestamp = Date.parse(value);
  const day = Number(value.slice(8, 10));
  const month = Number(value.slice(5, 7));
  const year = Number(value.slice(0, 4));
  const monthDays = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > monthDays[month - 1] || Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) return null;
  return Number.isFinite(timestamp) ? timestamp : null;
}
function pdfDate(value) {
  const match = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}'\d{2}')$/u.exec(value ?? "");
  if (!match) return null;
  const [, year, month, day, hour, minute, second, zone] = match;
  return xmpDate(`${year}-${month}-${day}T${hour}:${minute}:${second}${zone === "Z" ? "Z" : zone.slice(0, 3) + ":" + zone.slice(4, 6)}`);
}
