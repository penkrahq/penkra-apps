import assert from "node:assert/strict";
import test from "node:test";
import { createTabPresentation } from "./tab-presentation.mjs";

test("sets a document title once and resets after leaving the editor", async () => {
  const calls = [];
  const presentation = createTabPresentation({
    setPresentation: async (input) => calls.push(input),
    resetPresentation: async () => calls.push("reset"),
  });

  await presentation.update("Release QA");
  await presentation.update("Release QA");
  await presentation.update("Renamed document");
  await presentation.update(null);
  assert.deepEqual(calls, [{ title: "Release QA" }, { title: "Renamed document" }, "reset"]);
});

test("resets a retained document title when the app restores to its library", async () => {
  const calls = [];
  const presentation = createTabPresentation({
    setPresentation: async (input) => calls.push(input),
    resetPresentation: async () => calls.push("reset"),
  });
  await presentation.update(null);
  assert.deepEqual(calls, ["reset"]);
});

test("applies the latest title after an in-flight host update", async () => {
  const calls = [];
  let release;
  const presentation = createTabPresentation({
    setPresentation: async (input) => {
      calls.push(input);
      if (input.title === "First") await new Promise((resolve) => { release = resolve; });
    },
    resetPresentation: async () => calls.push("reset"),
  });

  const first = presentation.update("First");
  await Promise.resolve();
  const second = presentation.update("Second");
  release();
  await Promise.all([first, second]);
  assert.deepEqual(calls, [{ title: "First" }, { title: "Second" }]);
});
