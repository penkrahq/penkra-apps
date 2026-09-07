import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFString, decodePDFRawStream } from "pdf-lib";
import { serializePdf16 } from "./pdf16-writer.mjs";
import { readPdfContent } from "./pdf-content.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";
import { lookupPdfResourceName } from "./pdf-resource-name.mjs";

const n = (value) => PDFNumber.of(value);
const name = (value) => PDFName.of(value);
const set = (dict, key, value) => dict.set(name(key), value);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const RESOURCE_CODES = new Set([
  "CONTENT_RESOURCE_UNRESOLVED",
  "CONTENT_RESOURCE_TYPE_INVALID",
  "CONTENT_RESOURCE_SUBTYPE_INVALID",
  "FORM_XOBJECT_OUTSIDE_SUBSET",
]);

const NAME_CASES = Object.freeze([
  { name: "literal-hash", token: "A#2342", decoded: "A#42" },
  { name: "repeated-hash", token: "A#2342#2342", decoded: "A#42#42" },
  { name: "utf8-byte-identity", token: "Caf#C3#A9", decoded: "Caf\xc3\xa9" },
  { name: "escaped-slash", token: "A#2Fslash", decoded: "A/slash" },
  { name: "paired-decoy", token: "A#2342", decoded: "A#42", decoy: "A#42" },
]);

const OPERATORS = Object.freeze([
  { name: "gs", content: ({ token }) => `q /${token} gs Q`, category: "ExtGState" },
  { name: "Do", content: ({ token }) => `/${token} Do`, category: "XObject" },
  { name: "Tf", content: ({ token }) => `/${token} 12 Tf`, category: "Font" },
  { name: "BDC", content: ({ token }) => `/Tag /${token} BDC EMC`, category: "Properties" },
]);

function byteIdentity(value) {
  return Uint8Array.from(Array.from(value, (character) => character.charCodeAt(0)));
}

function keyBytes(key) {
  return Uint8Array.from(key.asBytes());
}

function equalBytes(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function resourceValue(pdf, operatorName) {
  if (operatorName === "gs") return pdf.context.obj({ Type: name("ExtGState"), ca: n(0.5) });
  if (operatorName === "Do") return pdf.context.register(pdf.context.stream(Uint8Array.of(255, 0, 0), {
    Type: name("XObject"), Subtype: name("Image"), Width: n(1), Height: n(1), ColorSpace: name("DeviceRGB"), BitsPerComponent: n(8),
  }));
  if (operatorName === "Tf") return pdf.context.obj({ Type: name("Font"), Subtype: name("Type0"), Encoding: name("Identity-H") });
  return pdf.context.obj({ MCID: n(0) });
}

function decoyValue(pdf, operatorName) {
  if (operatorName === "Do") return pdf.context.obj({ Type: name("XObject"), Subtype: name("Form") });
  if (operatorName === "Tf") return pdf.context.obj({ Type: name("NotFont") });
  if (operatorName === "BDC") return PDFString.of("not-a-properties-dictionary");
  return pdf.context.obj({ Type: name("NotExtGState") });
}

async function makePdf(nameCase, operator, compressed) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  page.setTrimBox(0, 0, 200, 300);
  page.setBleedBox(0, 0, 200, 300);
  const category = pdf.context.obj({});
  category.set(name(nameCase.token), resourceValue(pdf, operator.name));
  if (nameCase.decoy) category.set(name(nameCase.decoy), decoyValue(pdf, operator.name));
  const resources = pdf.context.obj({ [operator.category]: category });
  page.node.set(name("Resources"), resources);
  const content = new TextEncoder().encode(operator.content(nameCase));
  const stream = compressed
    ? pdf.context.flateStream(content)
    : pdf.context.stream(content);
  page.node.set(name("Contents"), pdf.context.register(stream));
  return serializePdf16(pdf);
}

function resourceIssueCodes(report, operatorName) {
  const path = `/Contents[0]/${operatorName}`;
  return report.issues
    .filter(({ code, object }) => RESOURCE_CODES.has(code) && object?.endsWith(path))
    .map(({ code }) => code);
}

test("decoded-byte resource helper matches literal hashes, repeated hashes, UTF8 bytes, slash escapes, and decoys", async () => {
  const pdf = await PDFDocument.create();
  const values = NAME_CASES.map((nameCase, index) => {
    const dict = pdf.context.obj({});
    const value = PDFString.of(`value-${index}`);
    dict.set(name(nameCase.token), value);
    return { dict, nameCase, value };
  });
  for (const { dict, nameCase, value } of values) {
    assert.deepEqual(Array.from(keyBytes(name(nameCase.token))), Array.from(byteIdentity(nameCase.decoded)));
    assert.equal(lookupPdfResourceName(dict, nameCase.decoded), value);
  }
  assert.equal(lookupPdfResourceName(pdf.context.obj({}), "not-present"), undefined);
  assert.equal(lookupPdfResourceName(pdf.context.obj({}), "\u0100"), undefined);
});

for (const nameCase of NAME_CASES) {
  for (const operator of OPERATORS) {
    for (const compressed of [false, true]) {
      test(`serialized ${operator.name} ${nameCase.name} ${compressed ? "Flate" : "raw"} lookup preserves byte identity`, async () => {
        const bytes = await makePdf(nameCase, operator, compressed);
        const before = sha256(bytes);
        const parsed = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
        assert.equal(parsed.getPages().length, 1);
        const contentStream = parsed.context.lookup(parsed.getPages()[0].node.Contents());
        assert.ok(contentStream instanceof PDFRawStream);
        const operations = readPdfContent(decodePDFRawStream(contentStream).decode());
        const selected = operations.find(({ operator: parsedOperator }) => parsedOperator === operator.name);
        const parsedName = operator.name === "BDC" ? operations[0]?.operands[1]?.value : selected?.operands[0]?.value;
        assert.equal(parsedName, nameCase.decoded);
        const first = await preflightPdfx4(bytes);
        const afterFirst = sha256(bytes);
        const second = await preflightPdfx4(bytes);
        assert.equal(afterFirst, before);
        assert.equal(sha256(bytes), before);
        assert.deepEqual(first.issues, second.issues);
        assert.deepEqual(resourceIssueCodes(first, operator.name), []);
        if (operator.name === "Do" && nameCase.decoy) {
          assert.ok(first.issues.some(({ code, object }) => code === "XOBJECT_UNRESOLVED" && object?.includes("/Resources/XObject")));
        }
      });
    }
  }
}

function rawClassicPdf(keyToken, contentToken) {
  const content = `q /${contentToken} gs Q`;
  const bodies = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /CropBox [0 0 200 300] /TrimBox [0 0 200 300] /BleedBox [0 0 200 300] /Resources 4 0 R /Contents 5 0 R >>",
    `<< /ExtGState << /${keyToken} 6 0 R >> >>`,
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /ExtGState /ca 0.5 >>",
  ];
  const chunks = [Buffer.from("%PDF-1.6\n%\x81\x81\x81\x81\n", "latin1")];
  const offsets = [0];
  for (const [index, body] of bodies.entries()) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    chunks.push(Buffer.from(`${index + 1} 0 obj\n${body}\nendobj\n`, "latin1"));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(Buffer.from([
    `xref\n0 ${offsets.length}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\n`,
    `startxref\n${xrefOffset}\n%%EOF\n`,
  ].join(""), "latin1"));
  return Uint8Array.from(Buffer.concat(chunks));
}

test("lowercase #hh remains a parser-boundary observation, not a new rejection policy", async () => {
  const bytes = rawClassicPdf("A#2fslash", "A#2fslash");
  const before = sha256(bytes);
  const parsed = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const resource = parsed.context.lookup(parsed.getPages()[0].node.Resources());
  const extGState = parsed.context.lookup(resource.get(name("ExtGState")));
  const [key] = extGState.keys();
  const stream = parsed.context.lookup(parsed.getPages()[0].node.Contents());
  const operation = readPdfContent(decodePDFRawStream(stream).decode())[1];
  assert.equal(operation.operands[0].value, "A/slash");
  assert.deepEqual(Array.from(key.asBytes()), Array.from(byteIdentity("A#2fslash")));
  const first = await preflightPdfx4(bytes);
  const second = await preflightPdfx4(bytes);
  assert.equal(sha256(bytes), before);
  assert.deepEqual(first.issues, second.issues);
  assert.ok(first.issues.some(({ code, object }) => code === "CONTENT_RESOURCE_UNRESOLVED" && object?.endsWith("/Contents[0]/gs")));
});
