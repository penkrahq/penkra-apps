import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("documents.export declares every report field returned by its handler", async () => {
  const manifest = JSON.parse(await readFile(new URL("../penkra-app.json", import.meta.url), "utf8"));
  const operation = manifest.operations.find(({ key }) => key === "documents.export");
  const reportFields = ["artifacts", "consequences", "lowered", "embeddedFonts", "bundledFonts", "rasterized"];

  assert.ok(operation);
  assert.deepEqual(operation.output.required, reportFields);
  assert.deepEqual(Object.keys(operation.output.properties), reportFields);
});
