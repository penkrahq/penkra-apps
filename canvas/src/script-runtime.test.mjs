import assert from "node:assert/strict";
import test from "node:test";

import { executeCanvasScript } from "./script-runtime.mjs";

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
