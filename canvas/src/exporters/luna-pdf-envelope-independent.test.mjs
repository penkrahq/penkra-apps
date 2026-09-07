import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { PDFDocument } from "pdf-lib";

const implementationPath = process.env.PDF_ENVELOPE_SOURCE;
if (!implementationPath) throw new Error("Set PDF_ENVELOPE_SOURCE to the root pdf-serialization-envelope.mjs checkout.");
const { inspectCanvasPdfEnvelope } = await import(implementationPath);

const latin1 = (value) => Buffer.from(value, "latin1");
const asText = (bytes) => Buffer.from(bytes).toString("latin1");

function makePdf({ bodies = ["<< /Type /Catalog >>"], lineEnding = "\n", trailerExtra = "", trailerSize = bodies.length + 1, xrefMode = "live" } = {}) {
  const chunks = [latin1(`%PDF-1.6${lineEnding}%\x81\x81\x81\x81${lineEnding}`)];
  const offsets = [0];
  for (const [index, body] of bodies.entries()) {
    offsets.push(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
    const bodyBytes = Buffer.isBuffer(body) ? body : latin1(body);
    chunks.push(Buffer.concat([latin1(`${index + 1} 0 obj${lineEnding}`), bodyBytes, latin1(`${lineEnding}endobj${lineEnding}`)]));
  }
  const xrefOffset = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const xrefLine = (offset, id, mode = "n") => {
    if (lineEnding === "\r\n") return `${String(offset).padStart(10, "0")} ${String(id).padStart(5, "0")} ${mode}\r\n`;
    return `${String(offset).padStart(10, "0")} ${String(id).padStart(5, "0")} ${mode} ${lineEnding}`;
  };
  const records = offsets.slice(1).map((offset, index) => xrefMode === "free" && index === 0 ? xrefLine(offset, 0, "f") : xrefLine(offset, 0));
  chunks.push(latin1([
    `xref${lineEnding}0 ${offsets.length}${lineEnding}`,
    xrefLine(0, 65535, "f"),
    ...records,
    `trailer${lineEnding}<< /Size ${trailerSize} /Root 1 0 R ${trailerExtra}>>${lineEnding}`,
    `startxref${lineEnding}${xrefOffset}${lineEnding}%%EOF${lineEnding}`,
  ].join("")));
  return Buffer.concat(chunks);
}

function catalog(value = "") {
  return `<< /Type /Catalog ${value}>>`;
}

function report(value = "", options = {}) {
  return inspectCanvasPdfEnvelope(makePdf({ bodies: [catalog(`/Probe ${value} `)], ...options }));
}

function streamBody(payload, length = payload.length) {
  const bytes = Buffer.isBuffer(payload) ? payload : latin1(payload);
  return Buffer.concat([latin1(`<< /Length ${length} >>\nstream\n`), bytes, latin1("\nendstream")]);
}

function reject(bytes, detail) {
  const result = inspectCanvasPdfEnvelope(bytes);
  assert.equal(result.verified, false);
  assert.equal(result.issues.length, 1);
  if (detail) assert.equal(result.issues[0].detail, detail);
  return result;
}

test("actual pdf-lib classic output and retained candidate resaved classic are accepted", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 300]).drawRectangle({ x: 12, y: 18, width: 40, height: 20 });
  const generated = await pdf.save({ useObjectStreams: false });
  generated.set(latin1("%PDF-1.6"), 0);
  assert.equal(inspectCanvasPdfEnvelope(generated).verified, true);

  const candidatePath = process.env.PDF_ENVELOPE_CANDIDATE;
  if (!candidatePath) return;
  const candidate = await PDFDocument.load(await readFile(candidatePath), { updateMetadata: false, throwOnInvalidObject: true });
  const resaved = await candidate.save({ useObjectStreams: false });
  resaved.set(latin1("%PDF-1.6"), 0);
  assert.equal(inspectCanvasPdfEnvelope(resaved).verified, true);
});

test("valid classic xref line endings remain exact 20-byte records", () => {
  for (const lineEnding of ["\n", "\r", "\r\n"]) {
    const bytes = makePdf({ lineEnding });
    const result = inspectCanvasPdfEnvelope(bytes);
    assert.equal(result.verified, true, JSON.stringify(lineEnding));
    const text = asText(bytes);
    const xref = text.indexOf(`xref${lineEnding}`);
    const firstRecord = xref + 4 + lineEnding.length + `0 2${lineEnding}`.length;
    assert.equal(text.slice(firstRecord, firstRecord + 20).length, 20);
  }
});

test("strings and binary streams shield fake delimiters while direct lengths control payload", () => {
  assert.equal(report("(endobj startxref trailer %%EOF (nested))").verified, true);
  const payload = Buffer.from("endstream\nendobj\ntrailer\n\x00\xff", "latin1");
  const bytes = makePdf({ bodies: [catalog("/Contents 2 0 R"), streamBody(payload, payload.length)] });
  assert.equal(inspectCanvasPdfEnvelope(bytes).verified, true);
  reject(makePdf({ bodies: [catalog("/Contents 2 0 R"), streamBody(payload, payload.length - 1)] }), "expected-endstream");
  const oneByteOver = inspectCanvasPdfEnvelope(makePdf({ bodies: [catalog("/Contents 2 0 R"), streamBody(payload, payload.length + 1)] }));
  assert.equal(oneByteOver.verified, true, "current helper accepts a length that consumes the separator EOL");
  reject(makePdf({ bodies: [catalog("/Contents 2 0 R"), streamBody(payload, payload.length + 2)] }), "expected-endstream");
});

test("raw object integer and real spellings are measured without normalization", () => {
  for (const value of ["2147483647", "-2147483648", "2147483648.0", "-2147483649.0", ".5", "-.5"]) {
    assert.equal(report(value).verified, true, value);
  }
  for (const value of ["2147483648", "-2147483649"]) assert.equal(report(value).issues[0].detail, "integer-range", value);
  assert.equal(report("340300000000000000000000000000000000000.0").verified, true);
  assert.equal(report("340400000000000000000000000000000000000.0").issues[0].detail, "real-range");
});

test("decoded name bytes, duplicate keys, and malformed composite values are bounded", () => {
  assert.equal(report(`/${"A".repeat(127)}`).verified, true);
  assert.equal(report(`/${"#41".repeat(128)}`).issues[0].detail, "name-byte-limit");
  assert.equal(report("/#C3#A9").verified, true);
  assert.equal(report("/#00").issues[0].detail, "null-name-byte");
  assert.equal(report("<< /A 1 /#41 2 >>").issues[0].detail, "dictionary-key-invalid-or-duplicate");
  assert.equal(report("<< /A >>").verified, false);
  assert.equal(report("[1 2").verified, false);
});

test("xref offsets and object identities are checked without parser repair", () => {
  const valid = makePdf();
  const text = asText(valid);
  reject(Buffer.from(text.replace(/startxref\n\d+/u, "startxref\n1"), "latin1"));
  const objectOffset = text.indexOf("1 0 obj");
  reject(Buffer.from(text.replace(`${String(objectOffset).padStart(10, "0")} 00000 n`, `${String(objectOffset + 1).padStart(10, "0")} 00000 n`), "latin1"));
  reject(Buffer.from(text.replace("1 0 obj", "2 0 obj"), "latin1"), "xref-object-identity-mismatch");
  reject(makePdf({ xrefMode: "free" }), "xref-generation-or-free-object-outside-subset");
});

test("missing references, holes, duplicate sections, and unsupported references fail closed", () => {
  assert.equal(report("99 0 R").issues[0].detail, "reference-missing");
  reject(makePdf({ trailerSize: 3 }), "xref-size-mismatch");
  const valid = asText(makePdf());
  reject(Buffer.from(valid.replace("trailer\n", "0 1\n0000000000 65535 f \ntrailer\n"), "latin1"));
  assert.equal(report("2 1 R").issues[0].code, "PDF_SERIALIZATION_OUTSIDE_SUBSET");
  reject(Buffer.from(`${valid}garbage`, "latin1"));
});

test("stream lengths must be direct nonnegative integers", () => {
  const payload = Buffer.from("abc", "latin1");
  const indirectLength = makePdf({ bodies: [catalog("/Contents 2 0 R"), streamBody(payload, "2 0 R")] });
  assert.equal(reject(indirectLength).issues[0].code, "PDF_SERIALIZATION_OUTSIDE_SUBSET");
  const negative = makePdf({ bodies: [catalog("/Contents 2 0 R"), streamBody(payload, -1)] });
  assert.equal(reject(negative).issues[0].code, "PDF_SERIALIZATION_OUTSIDE_SUBSET");
});

test("object streams and incremental formats are explicitly outside the envelope", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([100, 100]);
  const objectStreams = await pdf.save({ useObjectStreams: true });
  objectStreams.set(latin1("%PDF-1.6"), 0);
  assert.equal(reject(objectStreams).issues[0].detail, "xref-stream-or-offset-outside-subset");
  reject(Buffer.concat([makePdf(), latin1("incremental update")]), "trailer-ending-invalid");
});

test("malformed byte mutations terminate deterministically without throwing", () => {
  const baseline = makePdf();
  const xrefOffset = baseline.indexOf("xref");
  const started = performance.now();
  let invalid = 0;
  for (let seed = 0; seed < 256; seed += 1) {
    const mutated = Buffer.from(baseline);
    mutated[xrefOffset + 4] = 65 + (seed % 26);
    const result = inspectCanvasPdfEnvelope(mutated);
    assert.equal(typeof result.verified, "boolean");
    assert.ok(Array.isArray(result.issues));
    if (!result.verified) invalid += 1;
  }
  assert.equal(invalid, 256);
  assert.ok(performance.now() - started < 2000, "malformed mutation loop exceeded bound");
});
