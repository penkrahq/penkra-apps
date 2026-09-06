import assert from "node:assert/strict";
import test from "node:test";

import { cleanupPublishedExport, preflightExportDestinations, publishAtomicFile, validateOutputSegment, writeAtomicFile, writeExclusiveBundle } from "./export-bundle.mjs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("exclusive directory publication preserves an existing empty directory", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-directory-existing-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source"), destination = join(root, "destination");
  await mkdir(source); await mkdir(destination);
  await assert.rejects(writeExclusiveBundle(destination, [["artifact", "bytes"]]), { code: "CANVAS_EXPORT_EXISTS" });
  assert.deepEqual((await readdir(root)).sort(), ["destination", "source"]);
});

test("concurrent directory exports publish exactly one complete bundle", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-directory-race-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, "bundle");
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => writeExclusiveBundle(destination, [["winner", String(index)], ["nested/complete", String(index)]])));
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  for (const result of results.filter((result) => result.status === "rejected")) assert.equal(result.reason.code, "CANVAS_EXPORT_EXISTS");
  const winner = String(results.findIndex((result) => result.status === "fulfilled"));
  assert.equal(await readFile(join(destination, "winner"), "utf8"), winner);
  assert.equal(await readFile(join(destination, "nested/complete"), "utf8"), winner);
  assert.deepEqual(await readdir(root), ["bundle"]);
});

test("concurrent single-file exports never overwrite the winning artifact", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-exclusive-export-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const destination = join(root, "artifact.txt");
  const results = await Promise.allSettled([writeAtomicFile(destination, "first"), writeAtomicFile(destination, "second")]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const winner = results.findIndex((result) => result.status === "fulfilled");
  assert.equal(await readFile(destination, "utf8"), winner === 0 ? "first" : "second");
  assert.deepEqual(await readdir(root), ["artifact.txt"]);
});

test("dangling symlinks are existing destinations and bundle collisions fail before writes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-export-preflight-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await symlink(join(root, "missing"), join(root, "occupied"));
  await assert.rejects(writeAtomicFile(join(root, "occupied"), "bytes"), { code: "CANVAS_EXPORT_EXISTS" });
  for (const files of [new Map([["A", "1"], ["a", "2"]]), new Map([["assets", "1"], ["assets/icon.png", "2"]])]) {
    await assert.rejects(writeExclusiveBundle(join(root, "new-parent", "bundle"), files));
  }
  assert.deepEqual(await readdir(root), ["occupied"]);
});

test("output segments reject rather than sanitize unsafe derived names", () => {
  assert.equal(validateOutputSegment("school-logo.png"), "school-logo.png");
  for (const value of ["a/b", "a\\b", "..", "CON", "e\u0301", "x".repeat(256)]) {
    assert.throws(() => validateOutputSegment(value), /Unsafe output segment/);
  }
});

test("destination preflight resolves symlink aliases and cleanup removes only unchanged owned files", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-export-alias-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "real"));
  await symlink(join(root, "real"), join(root, "alias"));
  await assert.rejects(preflightExportDestinations([
    join(root, "real", "Deck.pptx"), join(root, "alias", "deck.pptx"),
  ]), { code: "CANVAS_EXPORT_COLLISION" });

  const receipt = await publishAtomicFile(join(root, "owned.txt"), "owned");
  assert.deepEqual(await cleanupPublishedExport(receipt), []);
  await assert.rejects(readFile(join(root, "owned.txt")), { code: "ENOENT" });
});

test("destination preflight rejects ancestor collisions in either order before creating paths", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-export-ancestor-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const parent = join(root, "bundle");
  const child = join(parent, "nested");
  for (const paths of [[parent, child], [child, parent]]) {
    await assert.rejects(preflightExportDestinations(paths), { code: "CANVAS_EXPORT_COLLISION" });
  }
  await preflightExportDestinations([parent, join(root, "bundle-other")]);
  assert.deepEqual(await readdir(root), []);
});
