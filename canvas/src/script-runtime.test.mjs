import assert from "node:assert/strict";
import test from "node:test";

import { createDocumentModel } from "./document-model.mjs";
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
});

test("execute scripts cannot reach host services", async () => {
  const result = await executeCanvasScript(
    { version: "2.15", children: [] },
    "return { fetch: typeof fetch, penkra: typeof penkra, process: typeof process };",
  );
  assert.deepEqual(result.result, {
    fetch: "undefined",
    penkra: "undefined",
    process: "undefined",
  });
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
});

test("a minimal invalid Insert is rejected by the pre-commit document validator", async () => {
  const execution = await executeCanvasScript(
    { version: "2.15", children: [] },
    "Insert(null, { id: 'broken' });",
  );
  assert.throws(
    () => createDocumentModel(execution.document),
    /Node broken must have a non-empty string type/,
  );
});
