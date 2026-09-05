import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCondition, resolveCanvasDocument } from "./canvas-resolver.mjs";

test("resolver selects axes, binds typed props, expands refs and interpolates variables", () => {
  const source = { version: "2.15", module: "deck", axes: { appearance: { modes: [{ name: "light" }, { name: "dark" }] } }, variables: { school: { tokenType: "string", cascade: [{ value: "Universal International School" }] }, ink: { tokenType: "color", cascade: [{ value: "#111" }, { value: "#fff", when: { appearance: "dark" } }] } }, paragraphStyles: {}, imports: {}, flows: [], children: [
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

test("marks are not cascades and nested component properties are lexically scoped", () => {
  const source = { version: "2.17", module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "outer", type: "frame", properties: { label: { type: "string", default: "outer" } }, children: [
      { id: "inner", type: "frame", properties: { label: { type: "string", default: "inner" } }, children: [
        { id: "inner-label", type: "text", bind: { content: "$props.label" }, marks: [], paragraphs: [] },
      ] },
      { id: "outer-label", type: "text", bind: { content: "$props.label" }, marks: [], paragraphs: [] },
    ] },
    { id: "route", type: "frame", role: "route", children: [{ id: "instance", type: "ref", ref: "outer", props: { label: "supplied outer" } }] },
  ] };
  const result = resolveCanvasDocument(source);
  const instance = result.document.children[1].children[0];
  assert.equal(instance.children[0].children[0].content, "inner");
  assert.equal(instance.children[1].content, "supplied outer");
});

test("node modes override the selected mode for their subtree", () => {
  const source = { version: "2.17", module: "web", axes: { theme: { modes: [{ name: "light" }, { name: "dark" }] } }, variables: { ink: { tokenType: "color", cascade: [{ value: "#fff" }, { value: "#000", when: { theme: "dark" } }] } }, paragraphStyles: {}, imports: {}, flows: [], children: [
    { id: "route", type: "frame", role: "route", modes: { theme: "dark" }, fill: "${ink}", children: [] },
  ] };
  assert.equal(resolveCanvasDocument(source).document.children[0].fill, "#000");
});

test("typed flow source paths remap to expanded instance ids", () => {
  const source = { version: "2.17", module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [
    { id: "go", from: "route-a", to: "route-b", trigger: { kind: "tap", source: { path: ["button"], node: "label" } } },
  ], children: [
    { id: "button-component", type: "frame", children: [{ id: "label", type: "text", content: "Go", marks: [], paragraphs: [{ from: 0, to: 2 }] }] },
    { id: "route-a", type: "frame", role: "route", children: [{ id: "button", type: "ref", ref: "button-component", props: {} }] },
    { id: "route-b", type: "frame", role: "route", children: [] },
  ] };
  assert.deepEqual(resolveCanvasDocument(source).document.flows[0].trigger.source, { path: [], node: "button/label" });
});

test("qualified refs use the library namespace and namespace its owned image assets", () => {
  const library = { axes: {}, variables: { ink: { tokenType: "color", cascade: [{ value: "#abcdef" }] } }, children: [
    { id: "card", type: "frame", fill: "${ink}", children: [
      { id: "photo", type: "rectangle", fill: { type: "image", url: "assets/photo.png" } },
    ] },
  ] };
  const source = { version: "2.17", module: "web", axes: {}, variables: { ink: { tokenType: "color", cascade: [{ value: "#000000" }] } }, paragraphStyles: {}, imports: { ui: { documentId: "library", pin: "live" } }, flows: [], children: [
    { id: "route", type: "frame", role: "route", children: [{ id: "instance", type: "ref", ref: "ui:card" }] },
  ] };
  const resolved = resolveCanvasDocument(source, { imports: { ui: { document: library, imports: {} } } });
  const instance = resolved.document.children[0].children[0];
  assert.equal(instance.fill, "#abcdef");
  assert.equal(instance.children[0].fill.url, "imports/ui/assets/photo.png");
});
