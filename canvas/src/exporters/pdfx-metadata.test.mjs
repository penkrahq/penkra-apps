import assert from "node:assert/strict";
import test from "node:test";
import { inspectPdfxMetadata } from "./pdfx-metadata.mjs";

const XML = `<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<rdf:Description rdf:about="" xmlns:pdfxid="http://www.npes.org/pdfx/ns/id/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:xmpMM="http://ns.adobe.com/xap/1.0/mm/" xmlns:dc="http://purl.org/dc/elements/1.1/"
pdfxid:GTS_PDFXVersion="PDF/X-4" pdf:Trapped="False"
xmpMM:DocumentID="uuid:781f2bd6-785c-44c3-8f90-2b97d762e736" xmpMM:VersionID="1" xmpMM:RenditionClass="default"
xmp:CreateDate="2026-09-05T12:00:00Z" xmp:ModifyDate="2026-09-05T12:00:00Z" xmp:MetadataDate="2026-09-05T12:00:00Z">
<dc:title><rdf:Alt><rdf:li xml:lang="x-default">R&amp;D &lt;Print&gt; 😀</rdf:li></rdf:Alt></dc:title>
</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
const inspect = (xml = XML, info = {}) => inspectPdfxMetadata(new TextEncoder().encode(xml), info);
const codes = (report) => report.issues.map((issue) => issue.code);

test("XMP checks parse namespaces and decoded Unicode text, not label substrings", () => {
  const report = inspect(XML, { Title: "R&D <Print> 😀", Trapped: "False", GTS_PDFXVersion: "PDF/X-4" });
  assert.deepEqual(report.issues, []);
  assert.equal(report.values["dc:title"], "R&D <Print> 😀");
  assert.ok(codes(inspect(XML.replace("http://www.npes.org/pdfx/ns/id/", "https://example.invalid/spoof"))).includes("XMP_PDFX_IDENTIFICATION_INVALID"));
  assert.ok(codes(inspect(XML.replaceAll("pdfxid:", "wrong:").replace("xmlns:pdfxid", "xmlns:wrong"))).includes("XMP_REQUIRED_PREFIX"));
});

test("XMP rejects invalid XML, DTDs, duplicate attributes and undefined entities", () => {
  for (const xml of ["<broken>", "<!DOCTYPE x [<!ENTITY leak SYSTEM 'file:///unread'>]>" + XML, XML.replace('pdf:Trapped="False"', 'pdf:Trapped="False" pdf:Trapped="True"'), XML.replace("R&amp;D", "R&unknown;D"), XML.replace("R&amp;D", "R\u0001D")]) assert.ok(codes(inspect(xml)).includes("XMP_XML_INVALID"));
  assert.ok(codes(inspectPdfxMetadata(new Uint8Array([0xff]))).includes("XMP_XML_INVALID"));
});

test("XMP detects missing identification, duplicate properties and invalid trapping", () => {
  assert.ok(codes(inspect(XML.replace('pdfxid:GTS_PDFXVersion="PDF/X-4"', ""))).includes("XMP_PDFX_IDENTIFICATION_INVALID"));
  assert.ok(codes(inspect(XML.replace('pdf:Trapped="False"', 'pdf:Trapped="Unknown"'))).includes("XMP_TRAPPING_INVALID"));
  assert.ok(codes(inspect(XML.replace("</rdf:Description>", "<pdf:Trapped>True</pdf:Trapped></rdf:Description>"))).includes("XMP_DUPLICATE_PROPERTY"));
  assert.ok(codes(inspect(XML.replace('xmpMM:VersionID="1"', ""))).includes("XMP_REQUIRED_PROPERTY_MISSING"));
  assert.ok(codes(inspect(XML.replace('pdf:Trapped="False"', 'pdf:Trapped="False" pdfxid:Other="x"'))).includes("XMP_IDENTIFICATION_PROPERTY_FORBIDDEN"));
});

test("Info/XMP comparisons use decoded text and timezone-normalized dates", () => {
  assert.deepEqual(inspect(XML, { CreationDate: "D:20260905060000-06'00'", ModDate: "D:20260905120000Z" }).issues, []);
  assert.ok(codes(inspect(XML, { Title: "Different" })).includes("INFO_XMP_MISMATCH"));
  assert.ok(codes(inspect(XML, { CreationDate: "D:20260905130000Z" })).includes("INFO_XMP_MISMATCH"));
  assert.ok(codes(inspect(XML, { GTS_PDFXConformance: "PDF/X-4" })).includes("LEGACY_PDFX_CONFORMANCE_FORBIDDEN"));
  assert.ok(codes(inspect(XML.replaceAll("2026-09-05", "2026-02-30"))).includes("XMP_DATE_INVALID_OR_UNSUPPORTED"));
});

test("RDF resource indirection, conflicting language defaults and packet encodings fail closed", () => {
  assert.ok(codes(inspect(XML.replace("<dc:title>", '<dc:title rdf:resource="urn:external">'))).length > 0);
  assert.ok(codes(inspect(XML.replace('xml:lang="x-default"', 'xml:lang="en"'))).includes("XMP_LANGUAGE_ARRAY_INVALID"));
  assert.ok(codes(inspect(XML.replace('<?xpacket begin=', '<?xpacket encoding="UTF-8" begin='))).includes("XMP_PACKET_ATTRIBUTE_FORBIDDEN"));
  assert.ok(codes(inspect(XML.replace('<rdf:Description rdf:about=""', '<rdf:Description rdf:about="urn:other"'))).includes("XMP_RDF_DESCRIPTION_UNSUPPORTED"));
});
