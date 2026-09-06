import assert from "node:assert/strict";
import test from "node:test";

test("consumer text can use public library paragraph styles with source tokens and consumer modes", () => {
  const axes = { appearance: { modes: [{ name: "light" }, { name: "dark" }] } };
  const library = { axes, children: [], variables: { ink: { tokenType: "color", cascade: [{ value: "#111111" }, { value: "#eeeeee", when: { appearance: "dark" } }] } }, paragraphStyles: { body: { fill: "${ink}", fontSize: 18 }, private: { fontSize: 42 } } };
  const imports = { ui: { document: library, release: { publicItems: [{ kind: "paragraphStyle", id: "body" }] } } };
  const source = { axes, variables: {}, paragraphStyles: { body: { fill: "#ff0000", fontSize: 30 } }, children: [
    { id: "label", type: "text", content: "Text", style: "ui:body", paragraphs: [{ from: 0, to: 4, style: "ui:body" }] },
    { id: "light", type: "frame", modes: { appearance: "light" }, children: [{ id: "nested", type: "text", content: "Text", style: "ui:body" }] },
  ] };
  const result = resolveCanvasDocument(source, { imports, modes: { appearance: "dark" } }).document;
  assert.deepEqual(result.paragraphStyles[result.children[0].style], { fill: "#eeeeee", fontSize: 18 });
  assert.equal(result.children[0].paragraphs[0].style, result.children[0].style);
  assert.deepEqual(result.paragraphStyles[result.children[1].children[0].style], { fill: "#111111", fontSize: 18 });
  assert.deepEqual(result.paragraphStyles.body, { fill: "#ff0000", fontSize: 30 });
  assert.equal(source.children[0].style, "ui:body");
  source.children[0].style = "ui:private";
  assert.throws(() => resolveCanvasDocument(source, { imports }), /not published/);
  source.children[0].style = "missing:body";
  assert.throws(() => resolveCanvasDocument(source, { imports }), /missing or unreadable/);
});

test("qualified public tokens use source bindings with consumer-selected compatible modes", () => {
  const axes = { appearance: { modes: [{ name: "light" }, { name: "dark" }] } };
  const library = {
    axes, children: [], variables: {
      privateInk: { tokenType: "color", cascade: [{ value: "#123456" }, { value: "#abcdef", when: { appearance: "dark" } }] },
      brand: { tokenType: "color", cascade: [{ value: "${privateInk}" }] },
    },
  };
  const source = { axes, variables: { privateInk: { tokenType: "color", cascade: [{ value: "#ff0000" }] }, semantic: { tokenType: "color", cascade: [{ value: "${ui:brand}" }] } }, children: [{ id: "box", type: "rectangle", fill: "${semantic}" }] };
  const imports = { ui: { document: library, release: { publicItems: [{ kind: "variable", id: "brand" }] } } };
  assert.equal(resolveCanvasDocument(source, { imports, modes: { appearance: "dark" } }).document.children[0].fill, "#abcdef");
  assert.equal(resolveCanvasDocument(source, { imports }).document.children[0].fill, "#123456");
  source.children[0].fill = "${ui:privateInk}";
  assert.throws(() => resolveCanvasDocument(source, { imports }), /ui:privateInk was not found/);
});

test("raw imported variable cycles fail explicitly without recursive overflow", () => {
  const owner = { axes: {}, variables: {}, children: [] };
  const imported = { document: owner, imports: {} };
  imported.imports.self = imported;
  assert.throws(() => resolveCanvasDocument({ axes: {}, variables: {}, children: [] }, { imports: { ui: imported } }), /Variable import cycle/);
});

test("component expansion preserves instance placement, sizing, opacity and image override", () => {
  const component = { id: "component", type: "frame", x: 1000, y: 2000, width: 300, height: 70, opacity: 1, fill: "#123456", children: [{ id: "ink", type: "rectangle", x: 50, y: 15, width: 200, height: 40 }] };
  const source = { axes: {}, variables: {}, children: [component,
    { id: "one", type: "ref", ref: "component", x: 20, y: 280, width: 320, height: 80, opacity: 0.5, export: "image" },
    { id: "two", type: "ref", ref: "component" },
  ] };
  const resolved = resolveCanvasDocument(source).document;
  const one = resolved.children[1], two = resolved.children[2];
  assert.deepEqual([one.x, one.y, one.width, one.height, one.opacity, one.export], [20, 280, 320, 80, 0.5, "image"]);
  assert.deepEqual([one.children[0].x, one.children[0].y], [50, 15]);
  assert.deepEqual([two.x, two.y, two.width, two.height, two.opacity], [0, 0, 300, 70, 1]);
  assert.deepEqual([component.x, component.y, component.opacity], [1000, 2000, 1]);
});
import { evaluateCondition, resolveCanvasDocument } from "./canvas-resolver.mjs";

test("dotted aliases retain numeric types and rich-text ranges follow interpolation", () => {
  const token = (value) => ({ tokenType: "number", cascade: [{ value }] });
  const content = "Size ${space.600}";
  const source = { axes: {}, variables: {
    "space.600": token(24), "space-large": token("${space.600}"),
  }, children: [{ id: "frame", type: "frame", gap: "${space-large}", children: [
    { id: "text", type: "text", content, marks: [{ type: "weight", value: 700, from: 5, to: content.length }], paragraphs: [{ from: 0, to: content.length }] },
  ] }] };
  const frame = resolveCanvasDocument(source).document.children[0];
  assert.equal(frame.gap, 24);
  assert.equal(frame.children[0].content, "Size 24");
  assert.deepEqual(frame.children[0].marks, [{ type: "weight", value: 700, from: 5, to: 7 }]);
  assert.deepEqual(frame.children[0].paragraphs, [{ from: 0, to: 7 }]);
  source.variables["space.600"] = token("${space-large}");
  assert.throws(() => resolveCanvasDocument(source), /Variable cycle/);
});

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

test("imported paragraph styles keep source identity while following consumer modes", () => {
  const axes = { appearance: { modes: [{ name: "light" }, { name: "dark" }] } };
  const library = { axes, variables: { ink: { tokenType: "color", cascade: [{ value: "#111" }, { value: "#fff", when: { appearance: "dark" } }] } },
    paragraphStyles: { body: { fill: "${ink}", fontSize: 18 } }, children: [
      { id: "card", type: "frame", children: [{ id: "label", type: "text", content: "Library", paragraphs: [{ from: 0, to: 7, style: "body" }] }] },
    ] };
  const document = { axes, variables: {}, paragraphStyles: { body: { fill: "#f00", fontSize: 30 } }, children: [
    { id: "consumer", type: "text", content: "Local", paragraphs: [{ from: 0, to: 5, style: "body" }] },
    { id: "dark", type: "ref", ref: "ui:card" },
    { id: "light", type: "frame", modes: { appearance: "light" }, children: [{ id: "light-card", type: "ref", ref: "ui:card" }] },
  ] };
  const result = resolveCanvasDocument(document, { modes: { appearance: "dark" }, imports: { ui: { document: library } } }).document;
  const darkStyle = result.children[1].children[0].paragraphs[0].style;
  const lightStyle = result.children[2].children[0].children[0].paragraphs[0].style;
  assert.deepEqual(result.paragraphStyles[darkStyle], { fill: "#fff", fontSize: 18 });
  assert.deepEqual(result.paragraphStyles[lightStyle], { fill: "#111", fontSize: 18 });
  assert.deepEqual(result.paragraphStyles.body, { fill: "#f00", fontSize: 30 });
  assert.equal(document.children[0].paragraphs[0].style, "body");
  assert.equal(library.children[0].children[0].paragraphs[0].style, "body");
});

test("library defaults resolve absent modes and local overrides tolerate unrelated consumer axes", () => {
  const library = { axes: { appearance: { modes: [{ name: "dark" }, { name: "light" }] } }, variables: { ink: { tokenType: "color", cascade: [{ value: "#000" }, { value: "#fff", when: { appearance: "dark" } }] } }, children: [
    { id: "default", type: "rectangle", fill: "${ink}" },
    { id: "locked", type: "rectangle", modes: { appearance: "light" }, fill: "${ink}" },
  ] };
  const source = { axes: { viewport: { modes: [{ name: "wide" }] } }, variables: {}, children: [
    { id: "one", type: "ref", ref: "ui:default" }, { id: "two", type: "ref", ref: "ui:locked" },
  ] };
  const result = resolveCanvasDocument(source, { imports: { ui: { document: library } } }).document;
  assert.equal(result.children[0].fill, "#fff");
  assert.equal(result.children[1].fill, "#000");
});
