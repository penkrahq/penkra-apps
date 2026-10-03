import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import {
  buildExplorerPackage,
  EXPLORER_PACKAGE_DIRECTORIES,
  EXPLORER_PACKAGE_FILES,
} from "./build.mjs";

test("builds Explorer from an explicit distributable file set", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "penkra-explorer-build-"));
  const output = pathToFileURL(`${temporary}/dist/`);
  try {
    await buildExplorerPackage({ output });
    const entries = await readdir(output);
    assert.deepEqual(
      entries.sort(),
      [...EXPLORER_PACKAGE_DIRECTORIES, ...EXPLORER_PACKAGE_FILES, "package.json"].sort(),
    );
    assert.equal(entries.includes("node_modules"), false);
    assert.equal(entries.includes("vendor-src"), false);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
