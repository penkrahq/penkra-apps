import assert from "node:assert/strict";
import test from "node:test";

import { lowerCanvasModelForOpenPencil, prepareOpenPencilRenderDocument } from "./openpencil-render-document.mjs";
import {
  migrateM1DelimitedVariables,
  migrateM2AssignModule,
  migrateM3DropReusable,
  migrateM4Descendants,
  migrateM5DeleteEditorSlots,
  migrateM6UniformText,
  migrateM7AssignRoles,
  migrateM8AddFlows,
  migrateM10Scripts,
  migrateM11Notes,
  migrateM12Contexts,
  migrateM13Prompts,
  migrateM14ThemesToAxes,
  migrateM15NodeModes,
  migrateM16VariableTokens,
  migrateM17CascadeConditions,
  migrateM18LogicalDirections,
} from "./migrations.mjs";

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

test("M1 remaps partial rich-text ranges around the inserted delimiters", () => {
  const source = { type: "text", content: "$name", marks: [
    { type: "weight", from: 0, to: 1, value: 700 },
    { type: "fill", from: 1, to: 5, value: "#f00" },
  ], paragraphs: [{ from: 0, to: 5 }] };
  const { document } = migrateM1DelimitedVariables(source);
  assert.equal(document.content, "${name}");
  assert.deepEqual(document.marks.map(({ from, to }) => ({ from, to })), [
    { from: 0, to: 1 }, { from: 2, to: 6 },
  ]);
  assert.deepEqual(document.paragraphs, [{ from: 0, to: 7 }]);
});

test("M5 deletes Pencil editor slot metadata without changing other node data", () => {
  const source = { children: [{
    id: "component",
    type: "frame",
    reusable: true,
    slot: ["content"],
    children: [{ id: "child", type: "frame", slot: [] }],
  }] };
  const { document, changes } = migrateM5DeleteEditorSlots(source);
  assert.equal(changes, 2);
  assert.equal(Object.hasOwn(document.children[0], "slot"), false);
  assert.equal(Object.hasOwn(document.children[0].children[0], "slot"), false);
  assert.equal(document.children[0].reusable, true);
  assert.deepEqual(source.children[0].slot, ["content"]);
});

test("M2, M3, M7 and M8 establish root module, export roles and closed vocabulary", () => {
  let result = migrateM2AssignModule({
    version: "2.17",
    children: [{ id: "slide", type: "frame", width: 1280, height: 720, reusable: true }],
  });
  assert.equal(result.document.module, "deck");
  result = migrateM3DropReusable(result.document);
  result = migrateM7AssignRoles(result.document);
  result = migrateM8AddFlows(result.document);
  assert.equal(result.document.children[0].role, "slide");
  assert.equal(Object.hasOwn(result.document.children[0], "reusable"), false);
  assert.deepEqual(result.document.flows, []);
});

test("M6 partitions newline-terminated paragraphs and records the uniform named style", () => {
  const source = { children: [{
    id: "copy", type: "text", content: "First\nSecond", fontFamily: "Inter", fontSize: 20,
  }] };
  const { document } = migrateM6UniformText(source);
  assert.deepEqual(document.paragraphStyles["m6-copy"], { fontFamily: "Inter", fontSize: 20 });
  assert.deepEqual(document.children[0].paragraphs, [
    { from: 0, to: 6, style: "m6-copy" },
    { from: 6, to: 12, style: "m6-copy" },
  ]);
  assert.deepEqual(document.children[0].marks, []);
});

test("M4 refuses an incomplete manifest and deterministically applies property or clone entries", () => {
  const source = { children: [
    { id: "component", type: "frame", children: [{ id: "label", type: "text", content: "Default" }] },
    { id: "property-instance", type: "ref", ref: "component", descendants: { label: { content: "Bound" } } },
    { id: "clone-instance", type: "ref", ref: "component", x: 20, descendants: { label: { content: "Cloned" } } },
  ] };
  assert.throws(() => migrateM4Descendants(source, { entries: {} }), /Manifest mismatch/);
  const { document } = migrateM4Descendants(source, { entries: {
    "property-instance": {
      action: "properties", evidence: "content-only override",
      definitions: { label: { type: "string", default: "Default" } },
      bindings: { label: { path: "label", property: "content" } },
    },
    "clone-instance": { action: "clone", evidence: "reviewed structural clone" },
  } });
  assert.deepEqual(document.children[0].properties, { label: { type: "string", default: "Default" } });
  assert.deepEqual(document.children[0].children[0].bind, { content: "$props.label" });
  assert.deepEqual(document.children[1].props, { label: "Bound" });
  assert.equal(Object.hasOwn(document.children[1], "descendants"), false);
  assert.equal(document.children[2].type, "frame");
  assert.equal(document.children[2].id, "clone-instance");
  assert.equal(document.children[2].x, 20);
  assert.equal(document.children[2].children[0].id, "clone-instance/label");
  assert.equal(document.children[2].children[0].content, "Cloned");
});

test("M4 remaps every materialized descendant id and its internal relationships", () => {
  const source = { children: [
    { id: "component", type: "frame", children: [
      { id: "body", type: "frame", children: [
        { id: "nested", type: "ref", ref: "body" },
        { id: "note", type: "text", content: "Note", notesFor: "body" },
      ] },
    ] },
    { id: "one", type: "ref", ref: "component", descendants: {} },
    { id: "two", type: "ref", ref: "component", descendants: {} },
  ] };
  const { document } = migrateM4Descendants(source, { entries: {
    one: { action: "clone", evidence: "reviewed structural clone" },
    two: { action: "clone", evidence: "reviewed structural clone" },
  } });
  assert.deepEqual(document.children.slice(1).map((node) => node.children[0].id), ["one/body", "two/body"]);
  assert.equal(document.children[1].children[0].children[0].ref, "one/body");
  assert.equal(document.children[1].children[0].children[1].notesFor, "one/body");
});

test("M10 requires evidence and materializes recorded deterministic output with provenance", () => {
  const source = { children: [{ id: "chart", type: "script", scriptUri: "scripts/chart.js", inputs: { count: 2 } }] };
  assert.throws(() => migrateM10Scripts(source), /reviewed manifest/);
  const { document } = migrateM10Scripts(source, { entries: { chart: {
    status: "materialize", evidence: "two consecutive outputs matched",
    output: [{ id: "bar", type: "rectangle", width: 10, height: 20 }],
  } } });
  assert.equal(document.children[0].id, "bar");
  assert.deepEqual(document.children[0].provenance, {
    migration: "M10", scriptUri: "scripts/chart.js", inputs: { count: 2 }, outputIndex: 0,
  });
});

test("M11-M13 preserve sticky content as canonical text and M11 records an explicit slide association", () => {
  const source = { children: [
    { id: "note", type: "note", content: "Speak" },
    { id: "context", type: "context", content: "Reference" },
    { id: "prompt", type: "prompt", content: "Generate", model: "default" },
  ] };
  let result = migrateM11Notes(source, { entries: { note: { evidence: "adjacent authored note", notesFor: "slide" } } });
  result = migrateM12Contexts(result.document);
  result = migrateM13Prompts(result.document);
  assert.deepEqual(result.document.children.map((node) => node.type), ["text", "text", "text"]);
  assert.equal(result.document.children[0].notesFor, "slide");
  assert.deepEqual(result.document.children[0].paragraphs, [{ from: 0, to: 5 }]);
});

test("M18 changes logical edges and alignment but preserves absolute coordinates", () => {
  const source = { children: [{
    id: "row", type: "frame", x: 12, padding: { left: 10, right: 20 }, justifyContent: "left",
    children: [{ id: "copy", type: "text", content: "Hi", textAlign: "right" }],
  }] };
  const { document, changes } = migrateM18LogicalDirections(source);
  assert.equal(changes, 4);
  assert.equal(document.children[0].x, 12);
  assert.deepEqual(document.children[0].padding, { start: 10, end: 20 });
  assert.equal(document.children[0].justifyContent, "start");
  assert.equal(document.children[0].children[0].textAlign, "end");
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

test("canonical axes, variables and component bindings lower to the legacy engine seam", () => {
  const source = {
    canvasSchemaVersion: 3,
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
