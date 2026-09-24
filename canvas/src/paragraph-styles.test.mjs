import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanvasDocument } from "./canvas-resolver.mjs";
import { richTextRuns } from "./exporter-ir.mjs";

test("named paragraph styles resolve variables and feed text runs", () => {
  const document = {
    axes: {}, variables: { body: { tokenType: "fontFamily", cascade: [{ value: "Inter" }] } },
    paragraphStyles: { body: { fontFamily: "${body}", fontSize: 18, fill: "#123456" } },
    flows: [], children: [],
  };
  const resolved = resolveCanvasDocument(document).document;
  assert.equal(resolved.paragraphStyles.body.fontFamily, "Inter");
  const runs = richTextRuns({ content: "Hello", paragraphs: [{ from: 0, to: 5, style: "body" }], marks: [] }, resolved.paragraphStyles);
  assert.deepEqual(runs, [{ from: 0, to: 5, fontFamily: "Inter", fontSize: 18, fill: "#123456" }]);
});

test("whole-text style supplies defaults, paragraph style overrides it, and marks override both", () => {
  const styles = { title: { fontSize: 24, fill: "#111111" }, accent: { fontSize: 18, fill: "#222222" } };
  const runs = richTextRuns({
    content: "Hello World", style: "title",
    paragraphs: [{ from: 0, to: 5 }, { from: 5, to: 11, style: "accent" }],
    marks: [{ from: 6, to: 11, type: "fill", value: "#333333" }],
  }, styles);
  assert.equal(runs[0].fontSize, 24);
  assert.equal(runs[0].fill, "#111111");
  assert.equal(runs.at(-1).fontSize, 18);
  assert.equal(runs.at(-1).fill, "#333333");
});
