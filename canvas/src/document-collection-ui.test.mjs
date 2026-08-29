import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(new URL("./app.mjs", import.meta.url), "utf8");

test("Library and Trash use one account-scoped lifecycle coordinator", () => {
  assert.match(app, /subscribe: \(listener\) => api\.subscribeToDocuments\(listener\)/u);
  assert.match(app, /load: \(\) => loadEveryDocumentPage\(api\.listDocuments\)/u);
  assert.match(app, /load: \(\) => loadEveryDocumentPage\(api\.listTrash\)/u);
  assert.match(app, /function closeDocument\(\) \{\s+documentCollectionLifecycle\.stop\(\);/u);
});

test("an open document accepts authoritative remote title changes", () => {
  assert.match(app, /event\.event === "project:renamed"[\s\S]*?state\.document\.title = event\.payload\.title;/u);
});
