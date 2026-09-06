import assert from "node:assert/strict";
import test from "node:test";
import { createDocumentModuleLabels } from "./document-module-labels.mjs";
import { createDocumentModel, encodeState } from "./document-model.mjs";

function payload(module) {
  const model = createDocumentModel({ version: "2.17", module, children: [] });
  try { return { snapshot: { state: encodeState(model) }, updates: [] }; }
  finally { model.doc.destroy(); }
}

test("document modules are cached by revision and failed reads remain retryable", async () => {
  const calls = [];
  const labels = createDocumentModuleLabels(async (id) => {
    calls.push(id);
    if (id === "missing") throw new Error("unavailable");
    return payload("deck");
  });
  const documents = [{ id: "a", updatedAt: "1" }, { id: "missing", updatedAt: "1" }];
  const values = new Map();
  await labels.load(documents, (id, module) => values.set(id, module));
  assert.equal(values.get("a"), "deck");
  assert.equal(values.get("missing"), undefined);
  await labels.load(documents, () => {});
  assert.deepEqual(calls, ["a", "missing", "missing"]);
  await labels.load([{ id: "a", updatedAt: "2" }], () => {});
  assert.equal(calls.at(-1), "a");
});

test("document module lookup limits concurrency and cancels stale callbacks", async () => {
  const pending = [];
  const labels = createDocumentModuleLabels(() => new Promise((resolve) => pending.push(resolve)));
  const received = [];
  const loading = labels.load([1, 2, 3].map((id) => ({ id: String(id), updatedAt: "1" })), (...value) => received.push(value));
  assert.equal(pending.length, 2);
  labels.cancel();
  pending.forEach((resolve) => resolve(payload("generic")));
  await loading;
  assert.deepEqual(received, []);
  assert.equal(pending.length, 2);
});
