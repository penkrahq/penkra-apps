import assert from "node:assert/strict";
import test from "node:test";

import { designValidationIssues } from "./document-review.mjs";

test("review accepts bound component text and ignores disabled source content", () => {
  const document = { children: [{
    id: "component",
    type: "frame",
    width: 240,
    height: 64,
    properties: { label: { type: "string", default: "Label" } },
    children: [
      { id: "label", type: "text", content: "", bind: { content: "$props.label" }, fill: "#111111" },
      { id: "disabled-label", type: "text", content: "", enabled: false },
    ],
  }] };

  assert.deepEqual(designValidationIssues(document), []);
});

test("review reports only genuine empty text and invalid top-level fill sizing", () => {
  const document = { children: [
    { id: "component", type: "frame", width: "fill_container", children: [] },
    { id: "empty", type: "text", content: "", fill: "#111111" },
  ] };

  assert.deepEqual(
    designValidationIssues(document).map(({ nodeId, kind }) => ({ nodeId, kind })),
    [
      { nodeId: "component", kind: "layout-sizing" },
      { nodeId: "empty", kind: "text-content" },
    ],
  );
});
