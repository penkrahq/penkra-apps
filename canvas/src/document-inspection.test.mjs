import assert from "node:assert/strict";
import test from "node:test";

import { getTextMeasurer, setTextMeasurer } from "../vendor/open-pencil/engine.source.mjs";
import { inspectDocument } from "./document-inspection.mjs";

test("inspection does not flag a rendered conditional text fill", () => {
  const label = { id: "label", type: "text", content: "AO", width: 40, height: 20, fill: [
    { value: "$ink-2" },
    { value: "$ink", when: { props: { filled: true } } },
  ] };
  const component = { id: "component", type: "frame", width: 60, height: 30,
    properties: { filled: { type: "boolean", default: false } }, children: [label] };
  const document = { version: "2.17", variables: {
    "ink-2": { tokenType: "color", cascade: [{ value: "#666666" }] },
    ink: { tokenType: "color", cascade: [{ value: "#111111" }] },
  }, children: [component, { id: "filled", type: "ref", ref: "component", props: { filled: true } }] };
  const nodes = [
    { node: component, depth: 0, parentId: null, index: 0 },
    { node: label, depth: 1, parentId: "component", index: 0 },
    { node: document.children[1], depth: 0, parentId: null, index: 1 },
  ];
  const inspection = inspectDocument(document, nodes);
  assert.deepEqual(inspection.items.find((item) => item.id === "label").problems.filter((issue) => issue.kind === "text-fill"), []);
  assert.equal(inspection.issues.some((issue) => issue.kind === "text-fill"), false);
});

function documentWithOverflow({ clip = false } = {}) {
  const child = {
    id: "wide-child",
    type: "rectangle",
    layoutPosition: "absolute",
    x: 80,
    y: 10,
    width: 40,
    height: 20,
  };
  const parent = {
    id: "fixed-parent",
    type: "frame",
    width: 100,
    height: 50,
    clip,
    children: [child],
  };
  return {
    document: { version: "2.17", children: [parent] },
    nodes: [
      { node: parent, depth: 0, parentId: null, index: 0 },
      { node: child, depth: 1, parentId: parent.id, index: 0 },
    ],
  };
}

test("document inspection reports a child extending beyond a non-clipping parent", () => {
  const { document, nodes } = documentWithOverflow();
  const inspection = inspectDocument(document, nodes);
  const child = inspection.items.find((item) => item.id === "wide-child");

  assert.deepEqual(
    child.problems.filter((problem) => problem.kind === "parent-overflow"),
    [{
      nodeId: "wide-child",
      kind: "parent-overflow",
      ancestorId: "fixed-parent",
      severity: "major",
      message: 'Node "rectangle" extends 20px outside parent "frame"',
      suggestion: 'Reposition inside "frame" or enable clip content on the parent.',
    }],
  );
});

test("outer shadow bleed is not reported as structural parent overflow", () => {
  const { document, nodes } = documentWithOverflow();
  const child = document.children[0].children[0];
  child.x = 20;
  child.effect = { type: "shadow", shadowType: "outer", blur: 24, offset: { x: 8, y: 8 }, color: "#00000080" };
  const inspection = inspectDocument(document, nodes);
  assert.equal(inspection.issues.some((issue) => issue.kind === "parent-overflow"), false);
});

test("document inspection does not report visible overflow through a clipping parent", () => {
  const { document, nodes } = documentWithOverflow({ clip: true });
  const inspection = inspectDocument(document, nodes);

  assert.equal(
    inspection.issues.some((issue) => issue.kind === "parent-overflow"),
    false,
  );
});

test("small text protrusion ranks below a much larger frame protrusion", () => {
  const { document, nodes } = documentWithOverflow();
  const child = document.children[0].children[0];
  child.type = "text";
  child.content = "12";
  child.fill = "#000000";
  child.x = 86;
  child.width = 20;
  child.height = 20;
  const issue = inspectDocument(document, nodes).issues.find((item) => item.kind === "parent-overflow");
  assert.equal(issue?.severity, "minor");
  assert.match(issue?.message ?? "", /extends 4px outside/u);
});

test("parent overflow severity increases with protrusion distance", () => {
  const { document, nodes } = documentWithOverflow();
  const child = document.children[0].children[0];
  for (const [x, severity] of [[65, "minor"], [71, "major"], [90, "critical"]]) {
    child.x = x;
    const issue = inspectDocument(document, nodes).issues.find((item) => item.kind === "parent-overflow");
    assert.equal(issue?.severity, severity);
  }
});

test("inspection geometry does not drift when the editor installs a text measurer", () => {
  const caption = {
    id: "caption", type: "text", content: "Input with a fixed part · currency, unit, or phone code (prefixMenu opens a picker)",
    fontFamily: "Inter", fontSize: 12, fontWeight: "500", lineHeight: 1.43, textGrowth: "auto",
  };
  const slot = { id: "slot", type: "frame", layout: "vertical", width: "fit_content", height: "fit_content", children: [caption] };
  const parent = { id: "parent", type: "frame", layout: "vertical", width: 400, height: "fit_content", padding: 24, children: [slot] };
  const document = { version: "2.17", children: [parent] };
  const nodes = [
    { node: parent, depth: 0, parentId: null, index: 0 },
    { node: slot, depth: 1, parentId: "parent", index: 0 },
    { node: caption, depth: 2, parentId: "slot", index: 0 },
  ];
  const previous = getTextMeasurer();
  try {
    setTextMeasurer(null);
    const baseline = inspectDocument(document, nodes);
    assert.equal(baseline.issues.find((item) => item.kind === "parent-overflow")?.severity, "critical");
    setTextMeasurer(() => ({ width: 471, height: 19 }));
    const afterEditorInitialization = inspectDocument(document, nodes);
    assert.deepEqual(afterEditorInitialization.items.find((item) => item.id === "slot").bounds,
      baseline.items.find((item) => item.id === "slot").bounds);
    assert.deepEqual(afterEditorInitialization.issues, baseline.issues);
    assert.equal(typeof getTextMeasurer(), "function");
  } finally {
    setTextMeasurer(previous);
  }
});
