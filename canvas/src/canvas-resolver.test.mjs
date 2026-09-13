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

test("editor projections may defer reference expansion by authored root without changing source", () => {
  const source = {
    module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [
      { id: "component", type: "frame", layout: "none", width: 100, height: 40, fill: "#123456", children: [
        { id: "label", type: "text", content: "Default", marks: [], paragraphs: [{ from: 0, to: 7 }] },
      ] },
      { id: "overview-root", type: "frame", layout: "none", children: [
        { id: "deferred", type: "ref", ref: "component", x: 10, y: 20, props: {} },
      ] },
      { id: "detail-root", type: "frame", layout: "none", children: [
        { id: "expanded", type: "ref", ref: "component", x: 30, y: 40, props: {} },
      ] },
    ],
  };
  const result = resolveCanvasDocument(source, {
    shouldExpandRef: (_instance, { rootId }) => rootId === "detail-root",
  }).document;
  assert.equal(result.children[1].children[0].type, "ref");
  assert.equal(result.children[1].children[0].id, "deferred");
  assert.equal(result.children[2].children[0].type, "frame");
  assert.equal(result.children[2].children[0].id, "expanded");
  assert.equal(source.children[1].children[0].type, "ref");
});

test("deferred references compile slots into canonical descendant overrides", () => {
  const source = {
    module: "web", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [
      {
        id: "component", type: "frame", properties: {
          body: { type: "slot", target: "holder" },
        },
        children: [{ id: "holder", type: "frame", children: [
          { id: "default", type: "text", content: "Default" },
        ] }],
      },
      { id: "instance", type: "ref", ref: "component", slots: {
        body: [{ id: "custom", type: "text", content: "Custom" }],
      } },
    ],
  };
  const result = resolveCanvasDocument(source, { shouldExpandRef: () => false }).document;
  const instance = result.children[1];

  assert.equal(instance.slots, undefined);
  assert.equal(instance.descendants.holder.children[0].id, "instance/holder/custom");
  assert.deepEqual(instance.descendants.holder.children[0].provenance.slot, {
    instanceId: "instance",
    name: "body",
  });
  assert.deepEqual(instance.descendants.holder.provenance.slotTarget, {
    instanceId: "instance",
    name: "body",
  });
  assert.equal(source.children[1].slots.body[0].id, "custom");
});

test("component expansion applies local and imported descendant overrides before export", () => {
  const component = {
    id: "component", type: "frame", fill: "#eeeeee", children: [
      { id: "tab", type: "frame", fill: "#dddddd", children: [
        { id: "label", type: "text", content: "Default", fill: "#111111", paragraphs: [{ from: 0, to: 7 }] },
        { id: "rule", type: "rectangle", width: 80, height: 3, fill: "#222222" },
      ] },
    ],
  };
  const local = {
    axes: {}, variables: {}, paragraphStyles: {}, children: [component, {
      id: "local", type: "ref", ref: "component", descendants: {
        label: { content: "Active", fill: "#ffffff" },
        tab: { fill: "#16181a" },
        rule: { fill: "#4f46e5" },
      },
    }],
  };
  const imported = {
    axes: {}, variables: { accent: { tokenType: "color", cascade: [{ value: "#ff0000" }] } },
    paragraphStyles: {}, children: [component],
  };
  const consumer = {
    axes: {}, variables: { accent: { tokenType: "color", cascade: [{ value: "#22c55e" }] } },
    paragraphStyles: {}, children: [{
      id: "imported", type: "ref", ref: "ui:component", descendants: {
        "tab/label": { content: "Library" },
        "tab/rule": { fill: "${accent}" },
      },
    }],
  };

  const localResult = resolveCanvasDocument(local).document.children[1];
  assert.equal(localResult.children[0].fill, "#16181a");
  assert.equal(localResult.children[0].children[0].content, "Active");
  assert.equal(localResult.children[0].children[0].fill, "#ffffff");
  assert.equal(localResult.children[0].children[1].fill, "#4f46e5");

  const importedResult = resolveCanvasDocument(consumer, {
    imports: { ui: { document: imported, imports: {} } },
  }).document.children[0];
  assert.equal(importedResult.children[0].children[0].content, "Library");
  assert.equal(importedResult.children[0].children[1].fill, "#22c55e");

  local.children[1].descendants = { missing: { fill: "#000000" } };
  assert.throws(() => resolveCanvasDocument(local), {
    code: "CANVAS_DESCENDANT_OVERRIDE_INVALID",
  });
});

test("nested instance props resolve before deeper descendant overrides without materializing components", () => {
  const source = {
    axes: {}, variables: {}, paragraphStyles: {}, children: [
      {
        id: "badge", type: "frame", properties: {
          tone: { type: "enum", values: ["neutral", "danger"], default: "neutral" },
        },
        fill: [
          { value: "#eeeeee" },
          { value: "#ff0000", when: { props: { tone: "danger" } } },
        ],
        children: [{ id: "badge-label", type: "text", content: "Ready", paragraphs: [{ from: 0, to: 5 }] }],
      },
      {
        id: "card", type: "frame", children: [
          { id: "header", type: "ref", ref: "badge" },
        ],
      },
      {
        id: "instance", type: "ref", ref: "card", descendants: {
          header: { props: { tone: "danger" } },
          "header/badge-label": { content: "Blocked" },
        },
      },
    ],
  };

  const resolved = resolveCanvasDocument(source).document.children[2];
  assert.equal(resolved.children[0].fill, "#ff0000");
  assert.equal(resolved.children[0].children[0].content, "Blocked");
  assert.equal(source.children[1].children[0].type, "ref");
});

test("typed props forward across multiple nested component boundaries", () => {
  const source = {
    axes: {}, variables: {}, paragraphStyles: {}, children: [
      {
        id: "identity", type: "frame", properties: {
          harness: { type: "enum", values: ["claude", "codex"], default: "claude" },
        }, children: [
          { id: "claude", type: "text", content: "Claude", visible: { op: "eq", arg: { prop: "harness" }, value: "claude" } },
          { id: "codex", type: "text", content: "Codex", visible: { op: "eq", arg: { prop: "harness" }, value: "codex" } },
        ],
      },
      { id: "row", type: "frame", properties: {
        harness: { type: "enum", values: ["claude", "codex"], default: "claude" },
      }, children: [{ id: "identity-use", type: "ref", ref: "identity", bind: { harness: "$props.harness" } }] },
      { id: "section", type: "frame", properties: {
        harness: { type: "enum", values: ["claude", "codex"], default: "claude" },
      }, children: [{ id: "row-use", type: "ref", ref: "row", bind: { harness: "$props.harness" } }] },
      { id: "sidebar", type: "frame", properties: {
        harness: { type: "enum", values: ["claude", "codex"], default: "claude" },
      }, children: [{ id: "section-use", type: "ref", ref: "section", bind: { harness: "$props.harness" } }] },
      { id: "instance", type: "ref", ref: "sidebar", props: { harness: "codex" } },
    ],
  };

  const identity = resolveCanvasDocument(source).document.children[4].children[0].children[0].children[0];
  assert.equal(identity.children.find((child) => child.id.endsWith("/claude")).enabled, false);
  assert.equal(identity.children.find((child) => child.id.endsWith("/codex")).enabled, true);
});

test("a reference can expose a typed component interface that forwards to its target", () => {
  const source = {
    axes: {}, variables: {}, paragraphStyles: {}, children: [
      { id: "base", type: "frame", properties: {
        state: { type: "enum", values: ["off", "on"], default: "off" },
      }, fill: [
        { value: "#777777" },
        { value: "#00ff00", when: { props: { state: "on" } } },
      ], children: [] },
      { id: "alias", type: "ref", ref: "base", properties: {
        state: { type: "enum", values: ["off", "on"], default: "off" },
      }, bind: { state: "$props.state" } },
      { id: "use", type: "ref", ref: "alias", props: { state: "on" } },
    ],
  };

  const resolved = resolveCanvasDocument(source).document;
  assert.equal(resolved.children[1].fill, "#777777");
  assert.equal(resolved.children[2].fill, "#00ff00");
});

test("an explicit descendant prop override wins over an inherited component binding", () => {
  const source = {
    axes: {}, variables: {}, paragraphStyles: {}, children: [
      { id: "menu", type: "frame", properties: {
        state: { type: "enum", values: ["closed", "open"], default: "closed" },
      }, enabled: [
        { value: false },
        { value: true, when: { props: { state: "open" } } },
      ], children: [] },
      { id: "composer", type: "frame", properties: {
        state: { type: "enum", values: ["closed", "open"], default: "closed" },
      }, children: [{ id: "menu-use", type: "ref", ref: "menu", bind: { state: "$props.state" } }] },
      { id: "use", type: "ref", ref: "composer", props: { state: "closed" }, descendants: {
        "menu-use": { props: { state: "open" } },
      } },
    ],
  };

  const menu = resolveCanvasDocument(source).document.children[2].children[0];
  assert.equal(menu.enabled, true);
});

test("typed instance swaps preserve the target path identity and resolve replacement components", () => {
  const source = {
    axes: {}, variables: {}, paragraphStyles: {}, children: [
      { id: "assistant", type: "frame", fill: "#eeeeee", children: [] },
      { id: "user", type: "frame", fill: "#222222", children: [] },
      { id: "transcript", type: "frame", children: [
        { id: "row", type: "ref", ref: "assistant" },
      ] },
      { id: "instance", type: "ref", ref: "transcript", descendants: {
        row: { replace: { id: "ignored-replacement-id", type: "ref", ref: "user" } },
      } },
    ],
  };

  const resolved = resolveCanvasDocument(source).document.children[3];
  assert.equal(resolved.children[0].id, "instance/row");
  assert.equal(resolved.children[0].fill, "#222222");
  assert.equal(source.children[2].children[0].ref, "assistant");
});

test("component slots inherit defaults, replace them with consumer nodes, and clear explicitly", () => {
  const component = {
    id: "card",
    type: "frame",
    properties: {
      content: { type: "slot", target: "body", minItems: 0, maxItems: 2 },
    },
    children: [{
      id: "body",
      type: "frame",
      layout: "vertical",
      children: [{ id: "default-copy", type: "text", content: "Default" }],
    }],
  };
  const source = {
    axes: {}, variables: {}, paragraphStyles: {},
    children: [
      component,
      { id: "default-use", type: "ref", ref: "card" },
      { id: "custom-use", type: "ref", ref: "card", slots: { content: [
        { id: "custom-copy", type: "text", content: "Consumer", fill: "#123456" },
      ] } },
      { id: "empty-use", type: "ref", ref: "card", slots: { content: [] } },
    ],
  };
  const resolved = resolveCanvasDocument(source).document;
  assert.equal(resolved.children[1].children[0].children[0].content, "Default");
  assert.equal(resolved.children[2].children[0].children[0].id, "custom-use/body/custom-copy");
  assert.equal(resolved.children[2].children[0].children[0].content, "Consumer");
  assert.deepEqual(resolved.children[3].children[0].children, []);
  assert.equal(component.children[0].children[0].id, "default-copy");
});

test("a component root can be the native slot insertion surface", () => {
  const source = {
    axes: {}, variables: {}, paragraphStyles: {},
    children: [
      {
        id: "overlay",
        type: "frame",
        properties: { content: { type: "slot", target: "." } },
        children: [{ id: "default", type: "rectangle", width: 10, height: 10 }],
      },
      {
        id: "use",
        type: "ref",
        ref: "overlay",
        slots: { content: [{ id: "custom", type: "rectangle", width: 20, height: 20 }] },
      },
    ],
  };

  const resolved = resolveCanvasDocument(source).document.children[1];
  assert.equal(resolved.children.length, 1);
  assert.equal(resolved.children[0].id, "use/custom");
  assert.deepEqual(resolved.provenance.slotTarget, {
    instanceId: "use",
    name: "content",
  });
});

test("imported component slots resolve consumer-owned refs and variables in consumer scope", () => {
  const library = {
    axes: {}, variables: {}, paragraphStyles: {}, children: [{
      id: "library-card", type: "frame",
      properties: { content: { type: "slot", target: "body" } },
      children: [{ id: "body", type: "frame", children: [] }],
    }],
  };
  const source = {
    axes: {}, variables: { ink: { tokenType: "color", cascade: [{ value: "#abcdef" }] } }, paragraphStyles: {}, children: [
      { id: "local-chip", type: "frame", fill: "${ink}", children: [] },
      { id: "use", type: "ref", ref: "ui:library-card", slots: { content: [
        { id: "chip-use", type: "ref", ref: "local-chip" },
      ] } },
    ],
  };
  const resolved = resolveCanvasDocument(source, { imports: { ui: { document: library } } }).document.children[1];
  assert.equal(resolved.children[0].children[0].id, "use/body/chip-use");
  assert.equal(resolved.children[0].children[0].fill, "#abcdef");
});

test("slots resolve identically across generic, deck, web, and mobile modules", () => {
  const roles = { deck: "slide", web: "route", mobile: "ios" };
  for (const module of ["generic", "deck", "web", "mobile"]) {
    const source = {
      module, axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
      children: [
        {
          id: "component", type: "frame",
          properties: { content: { type: "slot", target: "body" } },
          children: [{ id: "body", type: "frame", children: [] }],
        },
        {
          id: "output", type: "frame", ...(roles[module] ? { role: roles[module] } : {}),
          children: [{ id: "use", type: "ref", ref: "component", slots: { content: [{ id: "copy", type: "text", content: module, marks: [], paragraphs: [{ from: 0, to: module.length }] }] } }],
        },
      ],
    };
    assert.equal(validateCanvasDocument(source).valid, true);
    const resolved = resolveCanvasDocument(source).document;
    assert.equal(resolved.module, module);
    assert.equal(resolved.children[1].children[0].children[0].children[0].content, module);
    assert.equal(resolved.children[1].children[0].slots, undefined);
  }
});

test("component expansion canonicalizes legacy alignment aliases before applying overrides", () => {
  const source = {
    axes: {}, variables: {}, paragraphStyles: {}, children: [{
      id: "component", type: "frame", children: [{
        id: "label", type: "text", content: "Old", textAlign: "left",
        textAlignVertical: "middle", paragraphs: [{ from: 0, to: 3, align: "right" }],
      }],
    }, {
      id: "instance", type: "ref", ref: "component",
      descendants: { label: { content: "New" } },
    }],
  };

  const instance = resolveCanvasDocument(source).document.children[1];
  assert.equal(instance.children[0].content, "New");
  assert.equal(instance.children[0].textAlign, "start");
  assert.equal(instance.children[0].textAlignVertical, "center");
  assert.equal(instance.children[0].paragraphs[0].align, "end");
  assert.equal(source.children[0].children[0].textAlign, "left");
});
import { evaluateCondition, resolveCanvasDocument } from "./canvas-resolver.mjs";
import { validateCanvasDocument } from "./canvas-schema.mjs";

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

test("component prop cascades resolve inside compound layout values", () => {
  const source = {
    module: "generic", axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
    children: [
      { id: "switch", type: "frame", properties: {
        state: { type: "enum", values: ["off", "on"], default: "off" },
      }, padding: [
        2,
        [{ value: 18, when: { props: { state: "off" } } }, { value: 2, when: { props: { state: "on" } } }],
        2,
        [{ value: 2, when: { props: { state: "off" } } }, { value: 18, when: { props: { state: "on" } } }],
      ], children: [] },
      { id: "enabled", type: "ref", ref: "switch", props: { state: "on" } },
    ],
  };
  const resolved = resolveCanvasDocument(source).document;
  assert.deepEqual(resolved.children[0].padding, [2, 18, 2, 2]);
  assert.deepEqual(resolved.children[1].padding, [2, 2, 2, 18]);
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
