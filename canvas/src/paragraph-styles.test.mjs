import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanvasDocument } from "./canvas-resolver.mjs";
import { richTextRuns } from "./exporter-ir.mjs";

test("named paragraph styles resolve variables and feed text runs", () => {
  const document = {
    axes: {}, variables: { body: [{ value: "Inter" }] },
    paragraphStyles: { body: { fontFamily: "${body}", fontSize: 18, fill: "#123456" } },
    flows: [], children: [],
  };
  const resolved = resolveCanvasDocument(document).document;
  assert.equal(resolved.paragraphStyles.body.fontFamily, "Inter");
  const runs = richTextRuns({ content: "Hello", paragraphs: [{ from: 0, to: 5, style: "body" }], marks: [] }, resolved.paragraphStyles);
  assert.deepEqual(runs, [{ from: 0, to: 5, fontFamily: "Inter", fontSize: 18, fill: "#123456" }]);
});
