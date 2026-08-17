import assert from "node:assert/strict";
import test from "node:test";

import { prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";

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
  assert.match(result.issues[0].message, /was not found/);
});

test("converts themed Lucide icons to render-only stroked paths", () => {
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

  assert.equal(rendered.type, "path");
  assert.match(rendered.geometry, /m6 9 6 6 6-6/);
  assert.deepEqual(rendered.stroke, {
    align: "center",
    thickness: 2,
    join: "round",
    cap: "round",
    fill: "#123456",
  });
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
  assert.match(result.issues[0].message, /unknown icon custom is not supported/i);
});

test("converts the supported filled Phosphor pin to a render-only filled path", () => {
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

  assert.equal(result.document.children[0].type, "path");
  assert.equal(result.document.children[0].fill, "#abcdef");
  assert.equal(result.document.children[0].stroke, undefined);
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
    fill: "#123456",
    thickness: { bottom: 2 },
    align: "inside",
    join: "round",
    cap: undefined,
  });
  assert.deepEqual(result.issues, []);
  assert.deepEqual(source, before);
});

test("materializes component instances before resolving descendant themes and icons", () => {
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
  const [label, glyph] = instance.children;

  assert.equal(instance.type, "frame");
  assert.equal(instance.id, "instance");
  assert.equal(instance.reusable, false);
  assert.equal(label.id, "instance::label");
  assert.equal(label.content, "Open");
  assert.equal(label.fontWeight, 700);
  assert.equal(label.fill, "#eeeeee");
  assert.equal(glyph.id, "instance::glyph");
  assert.equal(glyph.type, "path");
  assert.match(glyph.geometry, /m6 9 6 6 6-6/);
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
