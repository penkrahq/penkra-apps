import assert from "node:assert/strict";
import test from "node:test";
import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFString } from "pdf-lib";
import {
  PDF_ARCHITECTURAL_LIMITS,
  inspectIndirectObjectCount,
  inspectPdfNumber,
} from "./pdfx-limits.mjs";
import { preflightPdfx4 } from "./pdfx-preflight.mjs";

const SERIALIZATIONS = Object.freeze([
  { name: "classic-xref", useObjectStreams: false },
  { name: "object-streams", useObjectStreams: true },
]);
const architecturalIssues = (report) => report.issues.filter(({ code }) => code === "PDF_ARCHITECTURAL_LIMIT");
const issueFor = (report, detail) => architecturalIssues(report).find((issue) => issue.detail?.detail === detail);
const set = (dict, key, value) => dict.set(PDFName.of(key), value);

async function fixture(change = () => {}, serialization) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 300]);
  page.setTrimBox(9, 9, 182, 282);
  page.setBleedBox(0, 0, 200, 300);
  await change(pdf, page);
  const bytes = await pdf.save({ useObjectStreams: serialization.useObjectStreams });
  await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  return bytes;
}

async function contentFixture(content, serialization, split = null) {
  return fixture((pdf, page) => {
    const values = split ?? [content];
    page.node.set(PDFName.of("Contents"), pdf.context.obj(values.map((value) => pdf.context.register(pdf.context.flateStream(new TextEncoder().encode(value))))));
  }, serialization);
}

function rawXrefRealFixture() {
  const header = "%PDF-1.6\n";
  const objects = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R /Probe 2147483648.0 >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /TrimBox [9 9 182 282] /BleedBox [0 0 200 300] /Resources << >> /Contents 4 0 R >>\nendobj\n",
    "4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n",
  ];
  let body = header;
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += object;
  }
  const xrefOffset = Buffer.byteLength(body, "latin1");
  const xref = [
    "xref\n0 5\n",
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    "trailer\n<< /Size 5 /Root 1 0 R /ID [<0123456789ABCDEF><0123456789ABCDEF>] >>\n",
    "startxref\n",
    `${xrefOffset}\n`,
    "%%EOF\n",
  ].join("");
  const bytes = Buffer.from(body + xref, "latin1");
  return { bytes, offsets, xrefOffset };
}

test("Table C.1 pure indirect-object boundary helper is exact without allocating millions", () => {
  const at = [];
  const over = [];
  inspectIndirectObjectCount(PDF_ARCHITECTURAL_LIMITS.indirectObjects, "file", (...args) => at.push(args));
  inspectIndirectObjectCount(PDF_ARCHITECTURAL_LIMITS.indirectObjects + 1, "file", (...args) => over.push(args));
  assert.equal(at.length, 0);
  assert.deepEqual(over[0], ["PDF_ARCHITECTURAL_LIMIT", "6.25", "file", {
    detail: "indirect-object-count", actual: 8388608, limit: 8388607,
  }]);
});

test("Table C.1 object numbers use conservative real magnitude after parser normalization", () => {
  const cases = [
    [PDF_ARCHITECTURAL_LIMITS.realMaximum, false],
    [PDF_ARCHITECTURAL_LIMITS.realMaximum * 1.001, true],
    [1e-50, false],
    [2147483648, false],
  ];
  for (const [value, rejected] of cases) {
    const issues = [];
    inspectPdfNumber(PDFNumber.of(value), "test/Number", (...args) => issues.push(args));
    assert.equal(issues.length > 0, rejected, String(value));
    if (rejected) assert.equal(issues[0][3].detail, "object-real-range");
  }
});

test("raw-xref catalog real 2147483648.0 is not falsely classified as an integer", async () => {
  const { bytes, offsets, xrefOffset } = rawXrefRealFixture();
  const source = Buffer.from(bytes).toString("latin1");
  assert.equal(source.indexOf("xref\n"), xrefOffset);
  for (let index = 1; index < offsets.length; index += 1) {
    assert.equal(Buffer.from(bytes).subarray(offsets[index]).toString("latin1").startsWith(`${index} 0 obj\n`), true);
  }
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true });
  const probe = pdf.context.lookup(pdf.catalog.get(PDFName.of("Probe")));
  assert.ok(probe instanceof PDFNumber);
  const report = await preflightPdfx4(bytes);
  assert.equal(architecturalIssues(report).some((issue) => issue.detail?.detail === "integer-range"), false);
  assert.equal(architecturalIssues(report).some((issue) => issue.detail?.detail === "object-real-range"), false);
});

for (const serialization of SERIALIZATIONS) {
  test(`decoded names at 127 bytes and one-over ${serialization.name}`, async () => {
    const exact = String.fromCharCode(...new Uint8Array(127).fill(65));
    const over = `${exact}A`;
    const bytes = await fixture((pdf) => {
      const dictionary = pdf.context.obj({});
      dictionary.set(PDFName.of(exact), PDFName.of(exact));
      dictionary.set(PDFName.of("Over"), PDFName.of(over));
      pdf.context.register(dictionary);
    }, serialization);
    const report = await preflightPdfx4(bytes);
    const issue = issueFor(report, "name-bytes");
    assert.ok(issue, serialization.name);
    assert.equal(issue.detail.actual, 128);
    assert.equal(issue.detail.limit, 127);
    assert.match(issue.object, /Over/);
  });

  test(`UTF-8 multibyte decoded name counts bytes and unreachable objects are visited ${serialization.name}`, async () => {
    const utf8Pair = String.fromCharCode(0xc3, 0xa9);
    const exact = `${"A".repeat(125)}${utf8Pair}`;
    const over = `${exact}${utf8Pair}`;
    const bytes = await fixture((pdf) => {
      const dictionary = pdf.context.obj({});
      dictionary.set(PDFName.of("UTF8"), PDFName.of(exact));
      dictionary.set(PDFName.of("TooLong"), PDFName.of(over));
      pdf.context.register(dictionary);
    }, serialization);
    const issue = issueFor(await preflightPdfx4(bytes), "name-bytes");
    assert.ok(issue, serialization.name);
    assert.equal(issue.detail.actual, 129);
    assert.match(issue.object, /TooLong/);
  });

  test(`content string exact 32767 and one-over nested TJ ${serialization.name}`, async () => {
    const exact = "a".repeat(32767);
    const valid = await preflightPdfx4(await contentFixture(`BT [(${exact})] TJ ET`, serialization));
    assert.equal(issueFor(valid, "content-string-bytes"), undefined);
    const over = await preflightPdfx4(await contentFixture(`BT [(${exact}a)] TJ ET`, serialization));
    const issue = issueFor(over, "content-string-bytes");
    assert.ok(issue, serialization.name);
    assert.equal(issue.detail.actual, 32768);
    assert.match(issue.object, /Contents\[0\]/);
  });

  test(`long metadata string remains outside the content-string limit ${serialization.name}`, async () => {
    const bytes = await fixture((pdf) => {
      const info = pdf.context.obj({});
      set(info, "Title", PDFString.of("metadata ".repeat(5000)));
      pdf.context.trailerInfo.Info = pdf.context.register(info);
    }, serialization);
    assert.equal(issueFor(await preflightPdfx4(bytes), "content-string-bytes"), undefined);
  });

  test(`integer content tokens exact signed limits and one-over ${serialization.name}`, async () => {
    const values = [
      ["-2147483648", false], ["2147483647", false],
      ["-2147483649", true], ["2147483648", true],
    ];
    for (const [token, rejected] of values) {
      const report = await preflightPdfx4(await contentFixture(`BT ${token} TL ET`, serialization));
      assert.equal(Boolean(issueFor(report, "integer-range")), rejected, `${serialization.name} ${token}`);
    }
  });

  test(`real spelling 2147483648.0 is not classified as an integer ${serialization.name}`, async () => {
    const report = await preflightPdfx4(await contentFixture("1 0 0 1 2147483648.0 0 cm", serialization));
    assert.equal(issueFor(report, "integer-range"), undefined);
  });

  test(`content name operands and dictionary keys/values count decoded bytes ${serialization.name}`, async () => {
    const exact = `${"A".repeat(125)}#C3#A9`;
    const over = `${exact}#C3#A9`;
    const valid = await preflightPdfx4(await contentFixture(`/Artifact << /Key /${exact} /Value /${exact} >> BDC EMC`, serialization));
    assert.equal(issueFor(valid, "content-name-bytes"), undefined);
    const invalid = await preflightPdfx4(await contentFixture(`/${over} Do /Artifact << /${over} /${over} >> BDC EMC`, serialization));
    const issues = architecturalIssues(invalid).filter((issue) => issue.detail?.detail === "content-name-bytes");
    assert.ok(issues.length >= 3, serialization.name);
    assert.ok(issues.every((issue) => issue.detail.actual === 129), serialization.name);
    assert.ok(issues.some((issue) => issue.object.includes("/Do[0]")), serialization.name);
  });

  test(`out-of-range real content token is rejected ${serialization.name}`, async () => {
    const exact = await preflightPdfx4(await contentFixture("340300000000000000000000000000000000000.0 0 0 1 0 0 cm", serialization));
    assert.equal(issueFor(exact, "real-range"), undefined);
    const report = await preflightPdfx4(await contentFixture("340400000000000000000000000000000000000.0 0 0 1 0 0 cm", serialization));
    const issue = issueFor(report, "real-range");
    assert.ok(issue, serialization.name);
    assert.match(issue.object, /Contents\[0\]/);
  });

  test(`q/Q depth 28 passes and depth 29 fails across split content streams ${serialization.name}`, async () => {
    const balanced = await preflightPdfx4(await contentFixture("", serialization, ["q ".repeat(28), "Q ".repeat(28)]));
    assert.equal(issueFor(balanced, "q/Q-nesting"), undefined);
    const over = await preflightPdfx4(await contentFixture("", serialization, ["q ".repeat(29), "Q ".repeat(29)]));
    const issue = issueFor(over, "q/Q-nesting");
    assert.ok(issue, serialization.name);
    assert.equal(issue.detail.actual, 29);
    assert.equal(issue.detail.limit, 28);
  });

  test(`PDF object number integer spelling remains uncovered while real magnitude is checked ${serialization.name}`, async () => {
    const bytes = await fixture((pdf) => {
      const dictionary = pdf.context.obj({});
      set(dictionary, "Limit", PDFNumber.of(2147483648));
      set(dictionary, "RealLimit", PDFNumber.of(PDF_ARCHITECTURAL_LIMITS.realMaximum * 1.001));
      pdf.context.register(dictionary);
    }, serialization);
    const issues = architecturalIssues(await preflightPdfx4(bytes));
    assert.equal(issues.some((issue) => issue.detail?.detail === "integer-range"), false);
    assert.ok(issues.some((issue) => issue.detail?.detail === "object-real-range"), serialization.name);
  });

  test(`object graph names include PDFName dictionary keys and values ${serialization.name}`, async () => {
    const longName = "N".repeat(128);
    const bytes = await fixture((pdf) => {
      const dictionary = pdf.context.obj({});
      dictionary.set(PDFName.of(longName), PDFName.of("Value"));
      set(dictionary, "ValueName", PDFName.of(longName));
      pdf.context.register(dictionary);
    }, serialization);
    const issues = architecturalIssues(await preflightPdfx4(bytes)).filter((issue) => issue.detail?.detail === "name-bytes");
    assert.equal(issues.length, 2, serialization.name);
  });
}
