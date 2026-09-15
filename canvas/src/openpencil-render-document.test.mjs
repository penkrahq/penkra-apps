import assert from "node:assert/strict";
import test from "node:test";

import { lowerCanvasModelForOpenPencil, prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";

test("Canvas stroke width and dash lower into renderer fields without mutating the source", () => {
  const source = { children: [{ id: "path", type: "path", width: 100, height: 100, geometry: "M0 0 H100", viewBox: [0, 0, 100, 100], stroke: { fill: "#123456", width: 8, dash: [12, 6], cap: "round" } }] };
  const result = prepareOpenPencilRenderDocument(source);
  assert.deepEqual(result.issues, []);
  assert.equal(result.document.children[0].stroke.thickness, 8);
  assert.deepEqual(result.document.children[0].stroke.dashPattern, [12, 6]);
  assert.equal(result.document.children[0].stroke.fill, "#123456");
  assert.equal(result.document.children[0].stroke.cap, "round");
  assert.equal(source.children[0].stroke.thickness, undefined);
  assert.equal(source.children[0].stroke.dashPattern, undefined);
});

test("interpolates multiple delimited variables while leaving currency literal", () => {
  const source = {
    variables: {
      school: { type: "string", value: "Universal International School" },
      city: { type: "string", value: "Accra" },
    },
    children: [
      { id: "title", type: "text", content: "YOU RUN ${school} IN ${city}." },
      { id: "price", type: "text", content: "$18.40" },
    ],
  };
  const result = prepareOpenPencilRenderDocument(source);
  assert.equal(result.document.children[0].content, "YOU RUN Universal International School IN Accra.");
  assert.equal(result.document.children[1].content, "$18.40");
  assert.deepEqual(result.issues, []);
});

test("canonical axes, variables and component bindings lower to the legacy engine seam", () => {
  const source = {
    axes: { appearance: { modes: [{ name: "light" }, { name: "dark" }] } },
    variables: { ink: { tokenType: "color", cascade: [{ value: "#fff" }, { value: "#000", when: { appearance: "dark" } }] } },
    children: [
      {
        id: "component", type: "frame", properties: { label: { type: "string", default: "Default" } },
        children: [{ id: "label", type: "text", content: "Default", bind: { content: "$props.label" } }],
      },
      { id: "instance", type: "ref", ref: "component", props: { label: "Changed" }, modes: { appearance: "dark" } },
    ],
  };
  const lowered = lowerCanvasModelForOpenPencil(source);
  assert.deepEqual(lowered.themes, { appearance: ["light", "dark"] });
  assert.deepEqual(lowered.variables.ink, { type: "color", value: [
    { value: "#fff" }, { value: "#000", theme: { appearance: "dark" } },
  ] });
  assert.deepEqual(lowered.children[1].theme, { appearance: "dark" });
  assert.deepEqual(lowered.children[1].descendants, { label: { content: "Changed" } });
  assert.equal(Object.hasOwn(source.children[1], "descendants"), false);
});

test("component conditions compile to compact instance overrides before rendering", () => {
  const conditionalPadding = () => [
    2,
    [
      { value: 18, when: { props: { state: "default" } } },
      { value: 2, when: { props: { state: "selected" } } },
    ],
    2,
    [
      { value: 2, when: { props: { state: "default" } } },
      { value: 18, when: { props: { state: "selected" } } },
    ],
  ];
  const source = {
    axes: {}, variables: {}, children: [{
      id: "switch",
      type: "frame",
      properties: {
        state: { type: "enum", values: ["default", "selected"], default: "default" },
      },
      padding: conditionalPadding(),
      children: [{
        id: "track",
        type: "frame",
        fill: [
          { value: "#888888", when: { props: { state: "default" } } },
          { value: "#3366ff", when: { props: { state: "selected" } } },
        ],
        children: [],
      }],
    }, {
      id: "selected-switch",
      type: "ref",
      ref: "switch",
      props: { state: "selected" },
    }],
  };

  const lowered = lowerCanvasModelForOpenPencil(source);

  assert.deepEqual(lowered.children[0].padding, [2, 18, 2, 2]);
  assert.equal(lowered.children[0].children[0].fill, "#888888");
  assert.deepEqual(lowered.children[1].padding, [2, 2, 2, 18]);
  assert.deepEqual(lowered.children[1].descendants, { track: { fill: "#3366ff" } });
  assert.equal(lowered.children.length, source.children.length);
  assert.equal(lowered.children[0].children.length, source.children[0].children.length);
  assert.deepEqual(source.children[0].padding, conditionalPadding());
});

test("nested component bindings and authored overrides stay compact and win predictably", () => {
  const source = {
    axes: { appearance: { modes: [{ name: "light" }, { name: "dark" }] } },
    variables: {},
    children: [{
      id: "toggle",
      type: "frame",
      properties: {
        state: { type: "enum", values: ["off", "on"], default: "off" },
      },
      fill: [
        { value: "#ffffff", when: { appearance: "light" } },
        { value: "#111111", when: { appearance: "dark" } },
      ],
      children: [{
        id: "knob",
        type: "ellipse",
        x: [
          { value: 2, when: { props: { state: "off" } } },
          { value: 18, when: { props: { state: "on" } } },
        ],
      }],
    }, {
      id: "row",
      type: "frame",
      properties: {
        state: { type: "enum", values: ["off", "on"], default: "off" },
      },
      children: [{ id: "nested-toggle", type: "ref", ref: "toggle", bind: { state: "$props.state" } }],
    }, {
      id: "dark-row",
      type: "ref",
      ref: "row",
      modes: { appearance: "dark" },
      props: { state: "on" },
      descendants: { "nested-toggle/knob": { x: 24 } },
    }],
  };

  const lowered = lowerCanvasModelForOpenPencil(source);
  const instance = lowered.children[2];

  assert.equal(instance.descendants["nested-toggle"].fill, "#111111");
  assert.equal(instance.descendants["nested-toggle/knob"].x, 24);
  assert.equal(lowered.children.length, 3);
  assert.equal(lowered.children[1].children[0].type, "ref");
  assert.equal(Object.hasOwn(source.children[2], "descendants"), true);
  assert.deepEqual(source.children[2].descendants, { "nested-toggle/knob": { x: 24 } });
});

test("a component definition may itself be a property-bound reference", () => {
  const source = {
    axes: {}, variables: {}, children: [{
      id: "inner",
      type: "frame",
      properties: {
        state: { type: "enum", values: ["default", "selected"], default: "default" },
      },
      padding: [
        { value: 8, when: { props: { state: "default" } } },
        { value: 16, when: { props: { state: "selected" } } },
      ],
      children: [],
    }, {
      id: "outer",
      type: "ref",
      ref: "inner",
      properties: {
        state: { type: "enum", values: ["default", "selected"], default: "default" },
      },
      bind: { state: "$props.state" },
    }, {
      id: "selected-outer",
      type: "ref",
      ref: "outer",
      props: { state: "selected" },
    }],
  };

  const lowered = lowerCanvasModelForOpenPencil(source);

  assert.equal(lowered.children[1].padding, 8);
  assert.equal(lowered.children[2].padding, 16);
  assert.equal(lowered.children.length, source.children.length);
  assert.equal(Object.hasOwn(source.children[1], "padding"), false);
});

test("resolves Pencil variables with inherited multi-axis themes without changing source", () => {
  const source = {
    version: "2.17",
    themes: { mode: ["light", "dark"], state: ["default", "open"] },
    variables: {
      gap: {
        type: "number",
        value: [
          { value: 4, theme: { state: "default" } },
          { value: 8, theme: { state: "open" } },
          { value: 12, theme: { state: "open", mode: "dark" } },
        ],
      },
      surface: {
        type: "color",
        value: [
          { value: "#ffffff", theme: { mode: "light" } },
          { value: "#111111", theme: { mode: "dark" } },
        ],
      },
      alias: { type: "number", value: "$gap" },
    },
    children: [{
      id: "root",
      type: "frame",
      theme: { mode: "dark" },
      fill: "$surface",
      children: [{
        id: "folder",
        type: "frame",
        layout: "vertical",
        theme: { state: "open" },
        gap: "$alias",
        children: [],
      }],
    }],
  };
  const before = structuredClone(source);

  const result = prepareOpenPencilRenderDocument(source);

  assert.equal(result.document.children[0].fill, "#111111");
  assert.equal(result.document.children[0].children[0].gap, 12);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(source, before);
});

test("resolves Pencil 2.17 variables in nested paint, geometry, text, and icon fields", () => {
  const source = {
    version: "2.17",
    variables: {
      color: { type: "color", value: "#123456" },
      number: { type: "number", value: 6 },
      boolean: { type: "boolean", value: true },
      string: { type: "string", value: "arrow-back" },
      family: { type: "string", value: "Inter" },
      weightName: { type: "string", value: "500" },
    },
    children: [{
      id: "shape",
      type: "ellipse",
      flipX: "$boolean",
      innerRadius: "$number",
      stroke: { type: "color", color: "$color" },
      strokeWidth: { top: "$number", right: "$number", bottom: "$number", left: "$number" },
      fill: {
        type: "gradient",
        colors: [{ color: "$color", position: "$number" }],
      },
    }, {
      id: "text",
      type: "text",
      content: "$string",
      fontFamily: "$family",
      fontWeight: "$weightName",
      underline: "$boolean",
    }, {
      id: "icon",
      type: "icon",
      library: "Material Symbols Rounded",
      icon: "$string",
      weight: "$number",
    }],
  };
  const before = structuredClone(source);
  const result = prepareOpenPencilRenderDocument(source);

  assert.equal(result.document.children[0].flipX, true);
  assert.equal(result.document.children[0].innerRadius, 6);
  assert.equal(result.document.children[0].stroke.fills[0].color, "#123456");
  assert.equal(result.document.children[0].stroke.thickness.top, 6);
  assert.equal(result.document.children[0].fill.colors[0].color, "#123456");
  assert.equal(result.document.children[0].fill.colors[0].position, 6);
  assert.equal(result.document.children[1].content, "arrow-back");
  assert.equal(result.document.children[1].fontFamily, "Inter");
  assert.equal(result.document.children[1].fontWeight, "500");
  assert.equal(result.document.children[1].underline, true);
  assert.equal(result.document.children[2].icon, "arrow-back");
  assert.equal(result.document.children[2].weight, 6);
  assert.deepEqual(result.issues.map(({ kind }) => kind), ["icon"]);
  assert.deepEqual(source, before);
});

test("uses safe render fallbacks and reports cyclic or invalid numeric variables", () => {
  const source = {
    themes: { state: ["default"] },
    variables: {
      cycleA: { type: "number", value: "$cycleB" },
      cycleB: { type: "number", value: "$cycleA" },
      invalidGap: { type: "string", value: "wide" },
    },
    children: [
      { id: "cycle", type: "frame", layout: "vertical", gap: "$cycleA", children: [] },
      { id: "invalid", type: "frame", layout: "vertical", gap: "$invalidGap", children: [] },
    ],
  };

  const result = prepareOpenPencilRenderDocument(source);

  assert.equal(result.document.children[0].gap, 0);
  assert.equal(result.document.children[1].gap, 0);
  assert.deepEqual(result.issues.map((issue) => issue.kind), ["variable", "variable"]);
  assert.equal(source.children[0].gap, "$cycleA");
  assert.equal(source.children[1].gap, "$invalidGap");
});

test("uses safe fallbacks and reports missing render variables", () => {
  const source = {
    variables: {},
    children: [{
      id: "frame",
      type: "frame",
      gap: "$missing",
      enabled: "$also-missing",
      children: [],
    }],
  };

  const result = prepareOpenPencilRenderDocument(source);

  assert.equal(result.document.children[0].gap, 0);
  assert.equal(result.document.children[0].enabled, true);
  assert.equal(result.issues.length, 2);
  assert.equal(result.issues[0].kind, "variable");
});

test("compiles themed Lucide icons without changing their semantic node type", () => {
  const source = {
    themes: { state: ["default", "open"] },
    variables: {
      glyph: {
        type: "string",
        value: [
          { value: "chevron-right", theme: { state: "default" } },
          { value: "chevron-down", theme: { state: "open" } },
        ],
      },
      color: { type: "color", value: "#123456" },
    },
    children: [{
      id: "icon",
      type: "icon",
      library: "lucide",
      icon: "$glyph",
      fill: "$color",
      width: 16,
      height: 16,
      theme: { state: "open" },
    }],
  };

  const result = prepareOpenPencilRenderDocument(source);
  const rendered = result.document.children[0];

  assert.equal(rendered.type, "icon");
  assert.equal(rendered.icon, "chevron-down");
  assert.equal(rendered.library, "lucide");
  assert.equal(rendered.fill, "#123456");
  assert.match(rendered.__canvasIcon.geometry, /m6 9 6 6 6-6/);
  assert.deepEqual(rendered.__canvasIcon.viewBox, [0, 0, 24, 24]);
  assert.deepEqual(result.issues, []);
  assert.equal(source.children[0].type, "icon");
  assert.equal(source.children[0].icon, "$glyph");
});

test("reports unsupported icon libraries without changing their render node", () => {
  const source = {
    children: [{ id: "pin", type: "icon", library: "unknown", icon: "custom" }],
  };

  const result = prepareOpenPencilRenderDocument(source);

  assert.equal(result.document.children[0].type, "icon");
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].kind, "icon");
});

test("resolves canonical underscore Material Symbols names without compatibility issues", () => {
  const source = {
    children: [
      { id: "sparkle", type: "icon", library: "Material Symbols Outlined", icon: "auto_awesome" },
      { id: "chat", type: "icon", library: "Material Symbols Rounded", icon: "chat_bubble" },
    ],
  };

  const result = prepareOpenPencilRenderDocument(source);

  assert.equal(result.document.children[0].__canvasIcon.content, "auto_awesome");
  assert.equal(result.document.children[1].__canvasIcon.content, "chat_bubble");
  assert.deepEqual(result.issues, []);
  assert.deepEqual(source.children.map(({ icon }) => icon), ["auto_awesome", "chat_bubble"]);
});

test("compiles any catalogued Phosphor icon without a hardcoded path", () => {
  const source = {
    children: [{
      id: "pin",
      type: "icon",
      library: "phosphor",
      icon: "push-pin-fill",
      fill: "#abcdef",
      width: 16,
      height: 16,
    }],
  };

  const result = prepareOpenPencilRenderDocument(source);

  assert.equal(result.document.children[0].type, "icon");
  assert.equal(result.document.children[0].fill, "#abcdef");
  assert.match(result.document.children[0].__canvasIcon.geometry, /235\.33 104/);
  assert.equal(result.document.children[0].__canvasIcon.paint, "fill");
  assert.deepEqual(result.issues, []);
});

test("normalizes Pencil 2.17 frame defaults, sizing, alignment, and strokes", () => {
  const source = {
    version: "2.17",
    children: [{
      id: "row",
      type: "frame",
      justifyContent: "space_between",
      stroke: "#123456",
      strokeWidth: { bottom: 2 },
      strokeAlignment: "inner",
      strokeLinejoin: "round",
      children: [{ id: "label", type: "text", content: "Label" }],
    }],
  };
  const before = structuredClone(source);

  const result = prepareOpenPencilRenderDocument(source);
  const row = result.document.children[0];

  assert.equal(row.layout, "horizontal");
  assert.equal(row.width, "hug_content");
  assert.equal(row.height, "hug_content");
  assert.equal(row.justifyContent, "space-between");
  assert.deepEqual(row.stroke, {
    fills: ["#123456"],
    thickness: { bottom: 2 },
    align: "inside",
    join: "round",
    cap: undefined,
  });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(source, before);
});

test("preserves component instances while resolving descendant themes and icons", () => {
  const source = {
    version: "2.17",
    themes: { mode: ["light", "dark"] },
    variables: {
      text: {
        type: "color",
        value: [
          { value: "#111111", theme: { mode: "light" } },
          { value: "#eeeeee", theme: { mode: "dark" } },
        ],
      },
    },
    children: [
      {
        id: "button",
        type: "frame",
        reusable: true,
        children: [
          { id: "label", type: "text", content: "Continue", fill: "$text" },
          { id: "glyph", type: "icon", library: "lucide", icon: "chevron-right", fill: "$text" },
        ],
      },
      {
        id: "instance",
        type: "ref",
        ref: "button",
        descendants: {
          label: { content: "Open", fontWeight: 700, theme: { mode: "dark" } },
          glyph: { icon: "chevron-down", theme: { mode: "dark" } },
        },
      },
    ],
  };
  const before = structuredClone(source);

  const result = prepareOpenPencilRenderDocument(source);
  const instance = result.document.children[1];

  assert.equal(instance.type, "ref");
  assert.equal(instance.id, "instance");
  assert.equal(instance.ref, "button");
  assert.equal(instance.descendants.label.content, "Open");
  assert.equal(instance.descendants.label.fontWeight, 700);
  assert.equal(instance.descendants.glyph.icon, "chevron-down");
  assert.deepEqual(result.issues, []);
  assert.deepEqual(source, before);
});

test("falls back to the variable's default value for an unmodeled theme state", () => {
  const source = {
    themes: { state: ["default", "focus"] },
    variables: {
      visible: {
        type: "boolean",
        value: [{ value: true, theme: { state: "default" } }],
      },
    },
    children: [{
      id: "focused",
      type: "frame",
      theme: { state: "focus" },
      enabled: "$visible",
    }],
  };

  const result = prepareOpenPencilRenderDocument(source);

  assert.equal(result.document.children[0].enabled, true);
  assert.deepEqual(result.issues, []);
});
