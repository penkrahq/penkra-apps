import assert from "node:assert/strict";
import test from "node:test";

import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";
import { migrateM1DelimitedVariables, migrateM14ThemesToAxes, migrateM15NodeModes, migrateM16VariableTokens, migrateM17CascadeConditions } from "./migrations.mjs";

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

test("M1 migrates only whole legacy references on variable-able fields", () => {
  const source = {
    children: [{
      id: "price",
      type: "text",
      name: "$name-is-not-variable-able",
      content: "$18.40",
      fill: "$brand-accent",
      fontFamily: "$font-body",
    }],
  };
  const { document, changes } = migrateM1DelimitedVariables(source);
  assert.equal(changes, 2);
  assert.equal(document.children[0].name, "$name-is-not-variable-able");
  assert.equal(document.children[0].content, "$18.40");
  assert.equal(document.children[0].fill, "${brand-accent}");
  assert.equal(document.children[0].fontFamily, "${font-body}");
  assert.deepEqual(source.children[0].fill, "$brand-accent");
});

test("M1 preserves whole-token rich-text and paragraph ranges", () => {
  const source = { children: [{
    id: "label", type: "text", content: "$name",
    marks: [{ type: "weight", from: 0, to: 5, value: 700 }],
    paragraphs: [{ from: 0, to: 5, style: "body" }],
  }] };
  const { document } = migrateM1DelimitedVariables(source);
  assert.equal(document.children[0].content, "${name}");
  assert.deepEqual(document.children[0].marks, [{ type: "weight", from: 0, to: 7, value: 700 }]);
  assert.deepEqual(document.children[0].paragraphs, [{ from: 0, to: 7, style: "body" }]);
});

test("M14-M17 preserve token type and move node axis selections", () => {
  const source = {
    themes: { theme: ["light", "dark"] },
    variables: { brand: { type: "color", value: [{ value: "#fff" }, { value: "#000", theme: { theme: "dark" } }] } },
    children: [{ id: "hero", type: "frame", theme: { theme: "dark" }, children: [] }],
  };
  let result = migrateM14ThemesToAxes(source);
  result = migrateM15NodeModes(result.document);
  result = migrateM16VariableTokens(result.document);
  result = migrateM17CascadeConditions(result.document);
  assert.deepEqual(result.document.axes, { theme: { modes: [{ name: "light" }, { name: "dark" }] } });
  assert.deepEqual(result.document.children[0].modes, { theme: "dark" });
  assert.deepEqual(result.document.variables.brand, { tokenType: "color", cascade: [
    { value: "#fff" }, { value: "#000", when: { theme: "dark" } },
  ] });
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
