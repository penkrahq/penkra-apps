import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { takeDocumentScreenshots } from "../src/document-screenshot.mjs";
import { corpusFiles } from "./corpus-files.mjs";

test("the owned source engine preserves the pinned corpus render bytes", async () => {
  const oracle = JSON.parse(await readFile(new URL("./render-oracle.json", import.meta.url), "utf8"));
  const actual = [];
  for (const { label, url } of corpusFiles) {
    const document = JSON.parse(await readFile(url, "utf8"));
    const nodeIds = (document.children ?? []).filter((node) => typeof node?.id === "string").map((node) => node.id);
    const [image] = await takeDocumentScreenshots(document, [{ nodeIds }]);
    actual.push({
      label,
      width: image.width,
      height: image.height,
      sha256: createHash("sha256").update(Buffer.from(image.data, "base64")).digest("hex"),
    });
  }
  assert.deepEqual(actual, oracle);
});
