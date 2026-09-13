import assert from "node:assert/strict";
import test from "node:test";
import { parseDelimited } from "./vendor/csv-runtime.mjs";

test("parses quoted CSV fields, escaped quotes, and embedded newlines", () => {
  const result = parseDelimited('name,note\r\nAda,"Hello, ""world"""\r\nLin,"two\nlines"');
  assert.deepEqual(result.rows, [
    ["name", "note"],
    ["Ada", 'Hello, "world"'],
    ["Lin", "two\nlines"],
  ]);
  assert.equal(result.issue, null);
});

test("supports BOM-prefixed TSV and preserves empty trailing fields", () => {
  const result = parseDelimited("\uFEFFname\tstatus\t\nAda\tactive\t", { delimiter: "\t" });
  assert.deepEqual(result.rows, [["name", "status", ""], ["Ada", "active", ""]]);
  assert.equal(result.columnCount, 3);
});

test("does not invent a blank row after a trailing line ending", () => {
  assert.deepEqual(parseDelimited("a,b\n").rows, [["a", "b"]]);
  assert.deepEqual(parseDelimited("").rows, []);
});

test("reports malformed quoted input while keeping previewable data", () => {
  const result = parseDelimited('name,note\nAda,"unfinished');
  assert.deepEqual(result.rows, [["name", "note"], ["Ada", "unfinished"]]);
  assert.equal(Boolean(result.issue), true);
});

test("caps stored rows and columns while reporting truncation", () => {
  const result = parseDelimited("a,b,c\n1,2,3\n4,5,6", { maxRows: 2, maxColumns: 2 });
  assert.deepEqual(result.rows, [["a", "b"], ["1", "2"]]);
  assert.equal(result.totalRows, 3);
  assert.equal(result.columnCount, 3);
  assert.equal(result.truncatedRows, true);
  assert.equal(result.truncatedColumns, true);
});
