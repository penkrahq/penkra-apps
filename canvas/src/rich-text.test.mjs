import assert from "node:assert/strict";
import test from "node:test";
import { flattenMarks, interpolateRichText, mapRangesForDelete, mapRangesForInsert, validateRichText, writeMark } from "./rich-text.mjs";

test("overlapping marks flatten into sorted non-overlapping runs", () => {
  assert.deepEqual(flattenMarks("abcdef", [
    { type: "weight", from: 0, to: 4, value: 700 },
    { type: "fill", from: 2, to: 6, value: "#f00" },
  ]), [
    { from: 0, to: 2, weight: 700 },
    { from: 2, to: 4, weight: 700, fill: "#f00" },
    { from: 4, to: 6, fill: "#f00" },
  ]);
});

test("range insertion observes formatting and link boundary inclusivity", () => {
  assert.deepEqual(mapRangesForInsert([{ type: "weight", from: 0, to: 2, value: 700 }], 2, 1), [{ type: "weight", from: 0, to: 3, value: 700 }]);
  assert.deepEqual(mapRangesForInsert([{ type: "link", from: 0, to: 2, value: "https://example.test" }], 2, 1), [{ type: "link", from: 0, to: 2, value: "https://example.test" }]);
  assert.deepEqual(mapRangesForDelete([
    { type: "fill", from: 0, to: 2, value: "red" },
    { type: "fill", from: 4, to: 6, value: "red" },
  ], 2, 4), [{ type: "fill", from: 0, to: 4, value: "red" }]);
});

test("every mark kind obeys both declared boundaries", () => {
  const formatting = ["fill", "weight", "italic", "underline", "strikethrough", "fontFamily", "fontSize", "letterSpacing", "wordSpacing"];
  for (const type of formatting) {
    const mark = { type, from: 5, to: 10, value: type === "weight" ? 700 : "value" };
    assert.deepEqual(mapRangesForInsert([mark], 5, 3), [{ ...mark, to: 13 }], `${type} start`);
    assert.deepEqual(mapRangesForInsert([mark], 10, 3), [{ ...mark, to: 13 }], `${type} end`);
  }
  for (const type of ["link", "lang"]) {
    const mark = { type, from: 5, to: 10, value: "value" };
    assert.deepEqual(mapRangesForInsert([mark], 5, 3), [{ ...mark, from: 8, to: 13 }], `${type} start`);
    assert.deepEqual(mapRangesForInsert([mark], 10, 3), [mark], `${type} end`);
  }
});

test("writing a same-type mark clips the prior mark on both sides", () => {
  const node = writeMark({ id: "copy", content: "abcdef", paragraphs: [{ from: 0, to: 6 }], marks: [
    { type: "fill", from: 0, to: 6, value: "red" },
  ] }, { type: "fill", from: 2, to: 4, value: "blue" });
  assert.deepEqual(node.marks, [
    { type: "fill", from: 0, to: 2, value: "red" },
    { type: "fill", from: 2, to: 4, value: "blue" },
    { type: "fill", from: 4, to: 6, value: "red" },
  ]);
});

test("interpolation shifts marks and paragraphs in UTF-16 units", () => {
  const result = interpolateRichText({
    id: "t", type: "text", content: "Hi ${name}!", paragraphs: [{ from: 0, to: 11 }],
    marks: [{ type: "weight", from: 3, to: 10, value: 700 }],
  }, { name: "🌍" });
  assert.equal(result.content, "Hi 🌍!");
  assert.deepEqual(result.paragraphs, [{ from: 0, to: 6 }]);
  assert.deepEqual(result.marks, [{ type: "weight", from: 3, to: 5, value: 700 }]);
  assert.deepEqual(validateRichText(result), []);
});

test("empty text and paragraph partition invariants reject invalid ranges", () => {
  assert.deepEqual(validateRichText({ id: "empty", content: "", marks: [], paragraphs: [] }), []);
  assert.match(validateRichText({ id: "bad", content: "abc", marks: [], paragraphs: [{ from: 0, to: 2 }] }).join(" "), /boundary|cover/);
});
