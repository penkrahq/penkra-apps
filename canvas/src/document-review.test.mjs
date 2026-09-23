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

test("review flags fixed component widths that cannot fit a horizontal row", () => {
  const document = { children: [
    { id: "row-body", type: "frame", width: 305, height: 76, children: [] },
    {
      id: "row", type: "frame", layout: "horizontal", width: 393,
      padding: [0, 0, 0, 14], gap: 8,
      children: [
        { id: "check", type: "ellipse", width: 22, height: 22 },
        { id: "avatar", type: "frame", width: 52, height: 52, children: [] },
        { id: "body", type: "ref", ref: "row-body" },
      ],
    },
  ] };

  assert.deepEqual(
    designValidationIssues(document).filter((issue) => issue.kind === "layout-capacity"),
    [{ nodeId: "row", kind: "layout-capacity", message: "Fixed-width children require 409px in a 393px horizontal frame." }],
  );
});

test("review skips uncertain or intentionally clipped horizontal rows", () => {
  const document = { children: [
    { id: "component", type: "frame", width: 305, children: [] },
    { id: "clipped", type: "frame", layout: "horizontal", width: 100, clip: true, children: [{ id: "wide", type: "ref", ref: "component" }] },
    { id: "flexible", type: "frame", layout: "horizontal", width: 100, children: [{ id: "fill", type: "frame", width: "fill_container", children: [] }] },
  ] };

  assert.equal(designValidationIssues(document).some((issue) => issue.kind === "layout-capacity"), false);
});

test("review flags inherited fixed component widths in narrower vertical content areas", () => {
  const document = { children: [
    { id: "design-system", type: "frame", width: 800, children: [
      { id: "title", type: "frame", width: 393, children: [] },
    ] },
    {
      id: "screen", type: "frame", width: 393, layout: "vertical", children: [{
        id: "content", type: "frame", width: "fill_container", layout: "vertical", padding: [12, 16], clip: true,
        children: [
          { id: "bad-title", type: "ref", ref: "title" },
          { id: "sized-title", type: "ref", ref: "title", width: 361 },
        ],
      }],
    },
  ] };

  assert.deepEqual(
    designValidationIssues(document).filter((issue) => issue.kind === "layout-capacity"),
    [{ nodeId: "bad-title", kind: "layout-capacity", message: "Component instance inherits 393px width in a 361px vertical content area; set an explicit instance width." }],
  );
});
