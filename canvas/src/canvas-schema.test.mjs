import assert from "node:assert/strict";
import test from "node:test";
import { assertCapabilityTotality, capabilityPathInventory, validateCanvasDocument } from "./canvas-schema.mjs";

function document() { return { canvasSchemaVersion: 3, version: "2.15", module: "deck", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [{ id: "slide", type: "frame", role: "slide", children: [{ id: "copy", type: "text", content: "Hi", paragraphs: [{ from: 0, to: 2 }], marks: [] }] }] }; }

test("canonical schema validates roots, rich text, roles, refs and flows", () => {
  assert.equal(validateCanvasDocument(document()).valid, true);
  const bad = document(); bad.children[0].children[0].marks = [{ type: "fill", from: 0, to: 4, value: "red" }];
  assert.throws(() => validateCanvasDocument(bad), /inside/);
});

test("canonical schema enforces role, notes, reading-order and flow relationships", () => {
  const value = document();
  value.children[0].readingOrder = ["copy"];
  value.children.push({ id: "notes", type: "text", notesFor: "slide", content: "Speak", marks: [], paragraphs: [{ from: 0, to: 5 }] });
  value.children.push({ id: "next", type: "frame", role: "slide", children: [] });
  value.flows.push({ id: "go", from: "slide", to: "next", trigger: { kind: "tap", source: { path: [], node: "copy" } } });
  assert.equal(validateCanvasDocument(value).valid, true);
  value.children[0].readingOrder = [];
  assert.throws(() => validateCanvasDocument(value), /readingOrder must cover/);
  value.children[0].readingOrder = ["copy"];
  value.flows[0].trigger.source.node = "notes";
  assert.throws(() => validateCanvasDocument(value), /must live inside slide/);
});

test("capability totality is generated from the canonical inventory", () => {
  const properties = Object.fromEntries(capabilityPathInventory().map((path) => [path, { verdict: "native" }]));
  assert.equal(assertCapabilityTotality({ properties }), true);
  properties["properties.fill"] = { verdict: null, status: "unverified" };
  assert.throws(() => assertCapabilityTotality({ properties }), /unverified=properties\.fill/);
  assert.ok(capabilityPathInventory().includes("properties.fill.image"));
  assert.ok(capabilityPathInventory().includes("root.canvasSchemaVersion"));
  assert.ok(capabilityPathInventory().includes("roles.slide"));
  assert.ok(capabilityPathInventory().includes("nodes.frame"));
  assert.ok(capabilityPathInventory().includes("relationships.ref"));
  assert.equal(capabilityPathInventory().includes("image"), false);
});

test("validation rejects mutual component recursion before resolver expansion", () => {
  const value = document();
  value.children.unshift(
    { id: "a", type: "frame", children: [{ id: "a-to-b", type: "ref", ref: "b" }] },
    { id: "b", type: "frame", children: [{ id: "b-to-a", type: "ref", ref: "a" }] },
  );
  value.children[2].children.push({ id: "use-a", type: "ref", ref: "a" });
  assert.throws(() => validateCanvasDocument(value), /Component ref cycle/);
});

test("same-type overlapping marks block until precedence is specified", () => {
  const value = document();
  value.children[0].children[0].marks = [
    { type: "fill", from: 0, to: 2, value: "red" },
    { type: "fill", from: 1, to: 2, value: "blue" },
  ];
  assert.throws(() => validateCanvasDocument(value), /precedence is not specified/);
});

test("flow instance paths validate every ref and final component descendant", () => {
  const value = document();
  value.children.unshift({ id: "button-component", type: "frame", children: [{ id: "button-label", type: "text", content: "Go", marks: [], paragraphs: [{ from: 0, to: 2 }] }] });
  value.children[1].children.push({ id: "button", type: "ref", ref: "button-component" });
  value.children.push({ id: "next", type: "frame", role: "slide", children: [] });
  value.flows = [{ id: "go", from: "slide", to: "next", trigger: { kind: "tap", source: { path: ["button"], node: "button-label" } } }];
  assert.equal(validateCanvasDocument(value).valid, true);
  value.flows[0].trigger.source.node = "missing";
  assert.throws(() => validateCanvasDocument(value), /outside the final component/);
});
