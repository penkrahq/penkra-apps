import assert from "node:assert/strict";
import test from "node:test";
import { searchableDocumentText, sortCollection } from "./library-presentation.mjs";

test("library collections sort by recent update or name without mutating input", () => {
  const source = [
    { title: "Zulu", createdAt: "2026-09-10T00:00:00Z", updatedAt: "2026-09-10T00:00:00Z" },
    { title: "alpha", updatedAt: "2026-09-12T00:00:00Z" },
  ];
  assert.deepEqual(sortCollection(source, "updated").map(({ title }) => title), ["alpha", "Zulu"]);
  assert.deepEqual(sortCollection(source, "name").map(({ title }) => title), ["alpha", "Zulu"]);
  assert.deepEqual(sortCollection(source, "created").map(({ title }) => title), ["alpha", "Zulu"]);
  assert.equal(source[0].title, "Zulu");
});

test("search text includes authored strings but excludes embedded data payloads", () => {
  const text = searchableDocumentText({
    children: [{ name: "Pricing Hero", content: "Annual billing" }],
    image: "data:image/png;base64,SECRET",
  });
  assert.match(text, /pricing hero/);
  assert.match(text, /annual billing/);
  assert.doesNotMatch(text, /secret/);
});
