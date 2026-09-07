import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { inspectCanvasPdfEnvelope } from "./pdf-serialization-envelope.mjs";

function fixture(bodies = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [] /Count 0 >>"], options = {}) {
  const chunks = ["%PDF-1.6\n%\x81\x81\x81\x81\n"];
  const offsets = [0];
  for (const [index, body] of bodies.entries()) {
    offsets.push(Buffer.byteLength(chunks.join(""), "latin1"));
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(chunks.join(""), "latin1");
  chunks.push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
  for (const offset of offsets.slice(1)) chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  chunks.push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R ${options.trailer ?? ""} >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(chunks.join(""), "latin1");
}

function report(body, extra = []) { return inspectCanvasPdfEnvelope(fixture([`<< /Type /Catalog /Probe ${body} >>`, ...extra])); }
function rejects(bytes, detail) {
  const result = inspectCanvasPdfEnvelope(bytes);
  assert.equal(result.verified, false);
  assert.equal(result.issues.length, 1);
  if (detail) assert.equal(result.issues[0].detail, detail);
  return result;
}

test("stream extent permits at most one extra EOL, never arbitrary skipped bytes", () => {
  const stream = (separator, length = 3) => fixture(["<< /Type /Catalog /Probe 2 0 R >>", `<< /Length ${length} >>\nstream\nabc${separator}endstream`]);
  for (const separator of ["", "\n", "\r", "\r\n"]) assert.equal(inspectCanvasPdfEnvelope(stream(separator)).verified, true);
  // The final LF may instead belong to the declared unfiltered payload.
  assert.equal(inspectCanvasPdfEnvelope(stream("\n", 4)).verified, true);
  for (const separator of [" ", "\t", "\n\n", "\r\n\r\n", "\n% hidden\n", "\n \n"]) {
    rejects(stream(separator), "expected-endstream");
  }
});

test("valid classic fixture, immutable input, repeatable results", () => {
  const bytes = fixture();
  const before = Buffer.from(bytes);
  assert.deepEqual(inspectCanvasPdfEnvelope(bytes), { verified: true, serialization: "classic-xref", objectCount: 2, issues: [] });
  assert.deepEqual(inspectCanvasPdfEnvelope(bytes), inspectCanvasPdfEnvelope(bytes));
  assert.deepEqual(bytes, before);
});

test("pdf-lib classic serialization including compressed binary stream passes", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]).drawRectangle({ x: 20, y: 20, width: 30, height: 40 });
  const bytes = await pdf.save({ useObjectStreams: false });
  bytes.set(Buffer.from("%PDF-1.6"), 0);
  assert.equal(inspectCanvasPdfEnvelope(bytes).verified, true);
  const compressed = await pdf.save({ useObjectStreams: true });
  compressed.set(Buffer.from("%PDF-1.6"), 0);
  rejects(compressed, "xref-stream-or-offset-outside-subset");
});

test("xref is checked rather than repaired", async () => {
  const bytes = fixture();
  const raw = bytes.toString("latin1");
  const wrong = Buffer.from(raw.replace(/startxref\n\d+/u, "startxref\n1"), "latin1");
  rejects(wrong);
  const offset = raw.indexOf("1 0 obj");
  const wrongEntry = raw.replace(`${String(offset).padStart(10, "0")} 00000 n`, `${String(offset + 1).padStart(10, "0")} 00000 n`);
  rejects(Buffer.from(wrongEntry, "latin1"));
});

test("duplicate decoded keys, dangling refs and malformed object tokens reject", () => {
  assert.equal(report("<< /A 1 /#41 2 >>").issues[0].detail, "dictionary-key-invalid-or-duplicate");
  assert.equal(report("99 0 R").issues[0].detail, "reference-missing");
  assert.equal(report("1e10").verified, false);
  assert.equal(report("NaN").verified, false);
  assert.equal(report("<< /A >>").verified, false);
});

test("raw object integer and real spellings remain distinct", () => {
  for (const value of ["2147483647", "-2147483648", "2147483648.0", "-2147483649.0", ".5", "-.5"]) {
    assert.equal(report(value).verified, true, value);
  }
  for (const value of ["2147483648", "-2147483649"]) assert.equal(report(value).issues[0].detail, "integer-range");
  assert.equal(report("3403000000000000000000000000000000000000.0").issues[0].detail, "real-range");
});

test("literal and hex strings shield apparent syntax; non-content long strings allowed", () => {
  for (const value of ["(literal \\( endobj \\) startxref)", "(balanced (inner) text)", "<123 ABC>", `(${'x'.repeat(40000)})`]) {
    assert.equal(report(value).verified, true, value.slice(0, 30));
  }
  assert.equal(report("(unclosed").verified, false);
  assert.equal(report("<zz>").verified, false);
});

test("names use decoded byte identity and limits", () => {
  assert.equal(report(`/${'A'.repeat(127)}`).verified, true);
  assert.equal(report(`/${'#41'.repeat(128)}`).issues[0].detail, "name-byte-limit");
  assert.equal(report("/#C3#A9").verified, true);
  assert.equal(report("/#00").issues[0].detail, "null-name-byte");
  assert.equal(report("/#GG").issues[0].detail, "name-escape-invalid");
  assert.equal(report("/\xff").issues[0].code, "PDF_SERIALIZATION_OUTSIDE_SUBSET");
});

test("stream payload is skipped by exact direct length, not searched for keywords", () => {
  const payload = "endstream\nendobj\ntrailer\n\x00\xff";
  const stream = `<< /Length ${payload.length} >>\nstream\n${payload}\nendstream`;
  assert.equal(report("2 0 R", [stream]).verified, true);
  assert.equal(report("2 0 R", [stream.replace(`/Length ${payload.length}`, "/Length 1")]).verified, false);
  assert.equal(report("2 0 R", [stream.replace(`/Length ${payload.length}`, "/Length 99999")]).verified, false);
  assert.equal(report("2 0 R", [stream.replace(`/Length ${payload.length}`, "/Length 3 0 R"), String(payload.length)]).issues[0].code, "PDF_SERIALIZATION_OUTSIDE_SUBSET");
});

test("no trailing garbage, incremental updates, encryption or hybrid xref", () => {
  rejects(Buffer.concat([fixture(), Buffer.from("garbage")]));
  for (const trailer of ["/Prev 12", "/XRefStm 12", "/Encrypt 1 0 R"]) {
    rejects(fixture(undefined, { trailer }), "trailer-feature-outside-subset");
  }
});

test("bad xref lengths, repeated sections and size mismatch reject", () => {
  const text = fixture().toString("latin1");
  rejects(Buffer.from(text.replace("65535 f \n", "65535 f\n"), "latin1"));
  rejects(Buffer.from(text.replace("trailer\n", "0 1\n0000000000 65535 f \ntrailer\n"), "latin1"));
  rejects(Buffer.from(text.replace("/Size 3", "/Size 4"), "latin1"), "xref-size-mismatch");
});
