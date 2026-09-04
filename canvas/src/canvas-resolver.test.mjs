import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCondition, resolveCanvasDocument } from "./canvas-resolver.mjs";

test("resolver selects axes, binds typed props, expands refs and interpolates variables", () => {
  const source = { canvasSchemaVersion: 3, version: "2.15", module: "deck", axes: { appearance: { modes: [{ name: "light" }, { name: "dark" }] } }, variables: { school: "Universal International School", ink: [{ value: "#111" }, { value: "#fff", when: { appearance: "dark" } }] }, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "component", type: "frame", properties: { label: { type: "string", default: "Default" } }, fill: "${ink}", children: [{ id: "label", type: "text", bind: { content: "$props.label" }, paragraphs: [], marks: [] }] },
    { id: "slide", type: "frame", role: "slide", children: [{ id: "instance", type: "ref", ref: "component", props: { label: "${school}" } }] },
  ] };
  const result = resolveCanvasDocument(source, { modes: { appearance: "dark" } });
  const instance = result.document.children[1].children[0];
  assert.equal(instance.fill, "#fff");
  assert.equal(instance.children[0].content, "Universal International School");
  assert.equal(instance.provenance.lowered, true);
});

test("condition AST has a closed evaluated operator set", () => {
  assert.equal(evaluateCondition({ op: "and", args: [{ op: "eq", arg: { prop: "tone" }, value: "primary" }, { op: "notNull", arg: { prop: "icon" } }] }, { props: { tone: "primary", icon: "check" } }), true);
  assert.throws(() => evaluateCondition({ op: "eval" }, { props: {} }), /Unknown condition/);
});
