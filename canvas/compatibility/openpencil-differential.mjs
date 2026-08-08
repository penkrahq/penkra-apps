import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { corpusFiles } from "./corpus-files.mjs";

const expected = JSON.parse(
  await readFile(new URL("./openpencil-oracle.json", import.meta.url), "utf8"),
);
const openPencilRoot = readOption("--openpencil-root");

if (!openPencilRoot) {
  throw new Error(
    "Usage: bun canvas/compatibility/openpencil-differential.mjs " +
      "--openpencil-root /path/to/open-pencil",
  );
}

const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: openPencilRoot,
  encoding: "utf8",
}).trim();
assert.equal(
  commit,
  expected.openPencil.commit,
  `OpenPencil must be checked out at ${expected.openPencil.commit}; received ${commit}.`,
);

const adapterUrl = pathToFileURL(
  path.join(openPencilRoot, "packages/pen/src/index.ts"),
).href;
const { parsePenFile } = await import(adapterUrl);
const actual = [];

for (const file of corpusFiles) {
  const source = await readFile(fileURLToPath(file.url), "utf8");
  const document = JSON.parse(source);
  const sourceIds = collectNodeIds(document.children);
  const graph = parsePenFile(source);
  const graphIds = new Set(graph.nodes.keys());
  actual.push({
    label: file.label,
    sha256: createHash("sha256").update(source).digest("hex"),
    version: document.version,
    sourceNodes: sourceIds.length,
    graphNodes: graph.nodes.size,
    missingSourceIds: sourceIds.filter((id) => !graphIds.has(id)),
    pages: graph.getPages(true).map((page) => ({
      name: page.name,
      children: page.childIds.length,
    })),
  });
}

assert.deepEqual(actual, expected.documents);
console.log(
  JSON.stringify({
    status: "pass",
    openPencilCommit: commit,
    documents: actual.length,
    sourceNodes: actual.reduce((total, document) => total + document.sourceNodes, 0),
  }),
);

function collectNodeIds(nodes, ids = []) {
  for (const node of nodes ?? []) {
    if (typeof node?.id === "string" && node.id) ids.push(node.id);
    collectNodeIds(node?.children, ids);
  }
  return ids;
}

function readOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}
