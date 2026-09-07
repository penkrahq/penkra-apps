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

test("Table C.1 pure integer and real boundaries are exact", () => {
  const cases = [
    [PDF_ARCHITECTURAL_LIMITS.integerMinimum, false],
    [PDF_ARCHITECTURAL_LIMITS.integerMaximum, false],
    [PDF_ARCHITECTURAL_LIMITS.integerMinimum - 1, true],
    [PDF_ARCHITECTURAL_LIMITS.integerMaximum + 1, true],
    [1e-50, false],
  ];
  for (const [value, rejected] of cases) {
    const issues = [];
    inspectPdfNumber(PDFNumber.of(value), "test/Number", (...args) => issues.push(args));
    assert.equal(issues.length > 0, rejected, String(value));
  }
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

  test(`PDF integer object exact signed limits and one-over ${serialization.name}`, async () => {
    const values = [
      [PDF_ARCHITECTURAL_LIMITS.integerMinimum, false], [PDF_ARCHITECTURAL_LIMITS.integerMaximum, false],
      [PDF_ARCHITECTURAL_LIMITS.integerMinimum - 1, true], [PDF_ARCHITECTURAL_LIMITS.integerMaximum + 1, true],
    ];
    for (const [value, rejected] of values) {
      const bytes = await fixture((pdf) => {
        const dictionary = pdf.context.obj({});
        set(dictionary, "Limit", PDFNumber.of(value));
        pdf.context.register(dictionary);
      }, serialization);
      assert.equal(Boolean(issueFor(await preflightPdfx4(bytes), "integer-range")), rejected, `${serialization.name} ${value}`);
    }
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
