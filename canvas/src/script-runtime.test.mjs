import assert from "node:assert/strict";
import test from "node:test";

import { executeCanvasScript, scriptNeedsInspection } from "./script-runtime.mjs";

test("generic module assignment preserves artwork and is one-way", async () => {
  const source = { version: "2.17", module: "generic", children: [{ id: "art", type: "rectangle", width: 40, height: 20, fill: "#123456" }] };
  for (const module of ["deck", "web", "mobile"]) {
    const result = await executeCanvasScript(source, `return SetModule(${JSON.stringify(module)});`);
    assert.equal(result.document.module, module);
    assert.deepEqual(result.document.children, source.children);
    assert.equal(source.module, "generic");
    await assert.rejects(() => executeCanvasScript(result.document, 'SetModule("deck");'), /Only a generic/u);
  }
  await assert.rejects(() => executeCanvasScript(source, 'SetModule("print");'), /requires deck, web, or mobile/u);
  await assert.rejects(() => executeCanvasScript(source, 'SetModule("asset");'), /requires deck, web, or mobile/u);
  const roles = { ...source, children: [{ id: "slide", type: "frame", role: "slide", width: 100, height: 100 }] };
  await assert.rejects(() => executeCanvasScript(roles, 'SetModule("deck");'), /no role-bearing frames/u);
});

test("inspection context is requested only when scripts mention inspection fields", () => {
  assert.equal(scriptNeedsInspection("Print(1);"), false);
  assert.equal(scriptNeedsInspection('return Get("#a")[0].bounds;'), true);
  assert.equal(scriptNeedsInspection('return Get("#a")[0]["problems"];'), true);
  assert.equal(scriptNeedsInspection('return Get("#a")[0].overflow;'), true);
});

test("Get exposes immutable scroll inspection metrics", async () => {
  const result = await executeCanvasScript(
    { version: "2.15", children: [{ id: "scroll", type: "frame", overflow: "scroll-y", children: [] }] },
    `const context = Get("#scroll")[0];
     try { context.overflow.overflowY = 0; } catch {}
     return context.overflow;`,
    { scroll: { overflow: { mode: "scroll-y", contentWidth: 120, contentHeight: 420, overflowX: 0, overflowY: 320 } } },
  );
  assert.deepEqual(result.result, { mode: "scroll-y", contentWidth: 120, contentHeight: 420, overflowX: 0, overflowY: 320 });
});

test("execute scripts edit only their private JSON document", async () => {
  const source = {
    version: "2.15",
    children: [
      { id: "heading", type: "text", content: "Before", fill: "#111111" },
    ],
  };
  const result = await executeCanvasScript(
    source,
    `Update("#heading", { content: "After" });
     Print(Get("#heading")[0].path);
     return { changedId: "heading" };`,
  );

  assert.equal(source.children[0].content, "Before");
  assert.equal(result.document.children[0].content, "After");
  assert.deepEqual(result.prints, ["heading"]);
  assert.deepEqual(result.result, { changedId: "heading" });
  assert.deepEqual(result.touchedNodeIds, ["heading"]);
});

test("Get exposes host-computed source bounds and problems without allowing mutation", async () => {
  const result = await executeCanvasScript(
    { version: "2.15", children: [{ id: "heading", type: "text", content: "Hello" }] },
    `const context = Get("#heading")[0];
     try { context.node.content = "Changed"; } catch {}
     Print({ bounds: context.bounds, problems: context.problems });
     return { path: context.path, content: Get(context)[0].node.content };`,
    {
      heading: {
        bounds: { x: 10, y: 20, width: 100, height: 24 },
        problems: [{ kind: "text-fill", nodeId: "heading" }],
      },
    },
  );
  assert.deepEqual(result.prints, [
    {
      bounds: { x: 10, y: 20, width: 100, height: 24 },
      problems: [{ kind: "text-fill", nodeId: "heading" }],
    },
  ]);
  assert.deepEqual(result.result, { path: "heading", content: "Hello" });
  assert.deepEqual(result.touchedNodeIds, []);
});

test("materialized Get is shallow by default and expands children only with explicit depth", async () => {
  const document = {
    version: "2.17",
    children: [{ id: "route", type: "frame", children: [{ id: "section", type: "frame", children: [{ id: "label", type: "text", content: "Hi" }] }] }],
  };
  const result = await executeCanvasScript(document, `return {
    shallow: Get("#route")[0],
    one: Get("#route", undefined, { depth: 1 })[0].node,
    all: Get("#route", undefined, { depth: "all" })[0].node
  };`);
  assert.equal(result.result.shallow.childCount, 1);
  assert.equal(result.result.shallow.node.children, undefined);
  assert.equal(result.result.one.children[0].id, "section");
  assert.equal(result.result.one.children[0].children, undefined);
  assert.equal(result.result.all.children[0].children[0].id, "label");
  const withNullPlaceholder = await executeCanvasScript(document, 'return Get("#route", null, { depth: 1 })[0].node;');
  assert.equal(withNullPlaceholder.result.children[0].id, "section");
  await assert.rejects(executeCanvasScript(document, 'return Get("#route", undefined, { depth: 101 });'), /Get depth/u);
});

test("execute scripts cannot reach host services", async () => {
  const result = await executeCanvasScript(
    { version: "2.15", children: [] },
    "return { fetch: typeof fetch, penkra: typeof penkra, process: typeof process, timer: typeof setTimeout };",
  );
  assert.deepEqual(result.result, {
    fetch: "undefined",
    penkra: "undefined",
    process: "undefined",
    timer: "undefined",
  });
});

test("G records Pencil-compatible generated fills without exposing host services", async () => {
  const result = await executeCanvasScript(
    { version: "2.15", children: [{ id: "hero", type: "frame", width: 400, height: 240 }] },
    `G("hero", "ai", "paper cutout mountains at sunrise"); return "hero";`,
  );
  assert.deepEqual(result.document.children[0].fill, {
    type: "image",
    url: "penkra-generation://0",
    mode: "fill",
  });
  assert.deepEqual(result.generations, [
    {
      nodeId: "hero",
      kind: "ai",
      prompt: "paper cutout mountains at sunrise",
      url: "penkra-generation://0",
    },
  ]);
  assert.deepEqual(result.touchedNodeIds, ["hero"]);
});

test("TakeScreenshot records exact node groups without changing the document", async () => {
  const result = await executeCanvasScript(
    {
      version: "2.15",
      children: [{ id: "screen", type: "frame", width: 393, height: 852, children: [] }],
    },
    'TakeScreenshot(["#screen"]); return "screen";',
  );
  assert.deepEqual(result.screenshots, [{ nodeIds: ["screen"] }]);
  assert.deepEqual(result.touchedNodeIds, []);
  assert.equal(result.document.children[0].id, "screen");
});

test("TakeScreenshot rejects ambiguous, empty, and duplicate targets", async () => {
  const document = {
    version: "2.15",
    children: [{ id: "screen", type: "frame", width: 10, height: 10, children: [] }],
  };
  await assert.rejects(executeCanvasScript(document, "TakeScreenshot([]);"), /non-empty array/u);
  await assert.rejects(
    executeCanvasScript(document, 'TakeScreenshot(["screen", "#screen"]);'),
    /must be unique/u,
  );
  await assert.rejects(
    executeCanvasScript(document, 'TakeScreenshot(["screen"]); TakeScreenshot(["screen"]);'),
    /once per execution/u,
  );
});

test("visitor-form Get streams beyond the materialized result cap", async () => {
  const children = Array.from({ length: 1_250 }, (_, index) => ({
    id: `node-${index}`,
    type: "rectangle",
  }));
  const result = await executeCanvasScript(
    { version: "2.15", children },
    'let count = 0; Get("type:rectangle", () => { count += 1; }); return count;',
  );
  assert.equal(result.result, 1_250);
  await assert.rejects(
    executeCanvasScript({ version: "2.15", children }, 'return Get("type:rectangle");'),
    /use visitor form for traversal/u,
  );
});

test("unknown selector prefixes fail explicitly while bare IDs remain valid", async () => {
  const document = {
    version: "2.15",
    children: [
      { id: "frame", type: "frame" },
      { id: "other", type: "rectangle" },
    ],
  };
  await assert.rejects(
    executeCanvasScript(document, 'return Get("typo:frame");'),
    /Unknown Canvas selector "typo:frame"/u,
  );
  const result = await executeCanvasScript(document, 'return Get("frame")[0].node.id;');
  assert.equal(result.result, "frame");
  const wildcard = await executeCanvasScript(document, 'return Get("*").map((entry) => entry.node.id);');
  assert.deepEqual(wildcard.result, ["frame", "other"]);
});

test("scripts report semantic mutations without comparing the whole document", async () => {
  const document = { version: "2.15", children: [{ id: "frame", type: "frame", name: "Same" }] };
  const read = await executeCanvasScript(document, 'return Get("frame")[0].node.name;');
  assert.equal(read.changed, false);
  const noop = await executeCanvasScript(document, 'Update("frame", { name: "Same" });');
  assert.equal(noop.changed, false);
  const write = await executeCanvasScript(document, 'Update("frame", { name: "Different" });');
  assert.equal(write.changed, true);
});

test("G rejects removed stock-photo generation", async () => {
  await assert.rejects(
    executeCanvasScript(
      { version: "2.15", children: [{ id: "hero", type: "frame" }] },
      `G("hero", "stock", "paper studio");`,
    ),
    /G accepts a prompt only for the 'ai' source/,
  );
});

test("execute scripts reject invalid and oversized code", async () => {
  await assert.rejects(
    executeCanvasScript(
      { version: "2.15", children: [] },
      "throw new Error('stop')",
    ),
    /Canvas script failed: stop/,
  );
  await assert.rejects(
    executeCanvasScript({ version: "2.15", children: [] }, "x".repeat(100_001)),
    /100001 bytes; the limit is 100000 bytes\. Split the edit into smaller documents\.execute calls/,
  );
  await assert.rejects(
    executeCanvasScript(
      { version: "2.15", children: [] },
      "for (let index = 0; index <= 1000; index += 1) Print(index);",
    ),
    /Print is limited to 1,000 entries/,
  );
});

test("runaway scripts keep their stable timeout code", async () => {
  await assert.rejects(
    executeCanvasScript({ version: "2.17", children: [] }, "while (true) {}"),
    (error) => {
      assert.equal(error.code, "CANVAS_SCRIPT_TIMEOUT");
      return true;
    },
  );
});

test("bulk exact-id inserts do not rescan the existing document for every mutation", async () => {
  const children = Array.from({ length: 3_200 }, (_, index) => ({
    id: `existing-${index}`,
    type: "frame",
    children: [],
  }));
  const document = { version: "2.17", children };
  const code = Array.from({ length: 220 }, (_, index) =>
    `Insert("#existing-3199", ${JSON.stringify({
      id: `added-${index}`,
      type: "frame",
      children: [{ id: `label-${index}`, type: "text", content: "x".repeat(80) }],
    })});`,
  ).join("\n");

  const result = await executeCanvasScript(document, code);

  assert.equal(result.document.children.at(-1).children.length, 220);
  assert.equal(result.touchedNodeIds.length, 441);
});

test("the mutation identity index stays authoritative across structural operations", async () => {
  const document = {
    version: "2.17",
    children: [
      { id: "left", type: "frame", children: [{ id: "old", type: "text", content: "Old" }] },
      { id: "right", type: "frame", children: [] },
    ],
  };
  const result = await executeCanvasScript(document, `
    Insert("#left", { id: "inserted", type: "frame", children: [{ id: "inserted-label", type: "text", content: "Inserted" }] });
    Update("#inserted", { children: [{ id: "updated-label", type: "text", content: "Updated" }] });
    Replace("#old", { id: "replacement", type: "text", content: "Replacement" });
    const copied = Copy("#inserted", "#right");
    Move("#replacement", "#right", 0);
    Delete("#updated-label");
    return {
      copied,
      replacement: Get("#replacement")[0].parent.id,
      removed: Get("#updated-label").length,
      rightChildren: Get("#right", undefined, { depth: 1 })[0].node.children.map(({ id }) => id),
    };
  `);

  assert.equal(result.result.replacement, "right");
  assert.equal(result.result.removed, 0);
  assert.deepEqual(result.result.rightChildren, ["replacement", result.result.copied]);
  await assert.rejects(
    executeCanvasScript(result.document, 'Insert("#left", { id: "replacement", type: "text" });'),
    /Node replacement already exists/u,
  );
  await assert.rejects(
    executeCanvasScript(result.document, 'Move("#right", "#" + Get("#right", undefined, { depth: 1 })[0].node.children[1].id);'),
    /inside its own subtree/u,
  );
});

test("slot content is addressable structural data across script mutations", async () => {
  const document = {
    version: "2.17",
    children: [
      {
        id: "card",
        type: "frame",
        reusable: true,
        properties: {
          content: { type: "slot", target: "body" },
        },
        children: [{ id: "body", type: "frame", children: [] }],
      },
      {
        id: "use",
        type: "ref",
        ref: "card",
        slots: {
          content: [{ id: "first", type: "text", content: "First" }],
        },
      },
      { id: "outside", type: "frame", children: [] },
    ],
  };

  const result = await executeCanvasScript(document, `
    Insert(Slot("#use", "content"), { id: "second", type: "text", content: "Second" });
    Move("#first", "#outside");
    const copied = Copy("#outside", Slot("#use", "content"));
    Delete("#second");
    SetSlot("#use", "content", [{ id: "final", type: "text", content: "Final" }]);
    const reset = ResetSlot("#use", "content");
    return {
      copied,
      reset,
      finalRemoved: Get("#final").length,
      removed: Get("#second").length,
      outside: Get("#outside", undefined, { depth: 1 })[0].node.children.map(({ id }) => id),
    };
  `);

  assert.deepEqual(result.result.reset, ["final"]);
  assert.equal(result.result.finalRemoved, 0);
  assert.equal(result.result.removed, 0);
  assert.deepEqual(result.result.outside, ["first"]);
  assert.equal(result.document.children[1].slots, undefined);
  assert.match(result.result.copied, /^outside-copy-/u);
});

test("Canvas script rejects invalid hierarchy and identity at the mutation boundary", async () => {
  const document = {
    version: "2.17",
    children: [{ id: "screen", type: "frame", children: [] }],
  };
  await assert.rejects(
    executeCanvasScript(document, "Insert(null, { id: 'broken' });"),
    /requires a non-empty type/u,
  );
  await assert.rejects(
    executeCanvasScript(
      document,
      'Insert("#screen", { id: "input", type: "rectangle", children: [{ id: "label", type: "text", content: "Name" }] });',
    ),
    /cannot contain children; use a frame or group/u,
  );
  await assert.rejects(
    executeCanvasScript(
      document,
      'Insert("#screen", { id: "card", type: "frame", children: [{ id: "screen", type: "text", content: "Duplicate" }] });',
    ),
    /Node screen already exists/u,
  );
  await assert.rejects(
    executeCanvasScript(
      document,
      'Update("#screen", { children: [{ id: "duplicate", type: "text" }, { id: "duplicate", type: "text" }] });',
    ),
    /Node duplicate already exists/u,
  );
  await assert.rejects(
    executeCanvasScript(
      document,
      'Insert(null, { id: "shape", type: "rectangle" }); Move("#screen", "#shape");',
    ),
    /cannot contain children; use a frame or group/u,
  );
});

test("Update validates a replacement child tree before applying it", async () => {
  const document = {
    version: "2.17",
    children: [
      {
        id: "container",
        type: "frame",
        children: [{ id: "old-label", type: "text", content: "Old" }],
      },
      { id: "outside-label", type: "text", content: "Outside" },
    ],
  };
  const result = await executeCanvasScript(
    document,
    `Update("#container", {
      children: [
        { id: "new-label", type: "text", content: "New" },
        { id: "new-shape", type: "rectangle", width: 20, height: 20 }
      ]
    });
    return Get("#container", undefined, { depth: 1 })[0].node.children.map((child) => child.id);`,
  );

  assert.deepEqual(result.result, ["new-label", "new-shape"]);
  assert.deepEqual(result.document.children[0].children.map((child) => child.id), [
    "new-label",
    "new-shape",
  ]);
  await assert.rejects(
    executeCanvasScript(
      document,
      'Update("#container", { children: [{ id: "outside-label", type: "text" }] });',
    ),
    /Node outside-label already exists/u,
  );
});
