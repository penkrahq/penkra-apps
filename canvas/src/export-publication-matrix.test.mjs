import assert from "node:assert/strict";
import { renameSync, writeFileSync } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, readlink, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  cleanupPublishedExport,
  preflightExportDestinations,
  publishAtomicFile,
  publishExclusiveBundle,
  validateOutputSegment,
} from "./export-bundle.mjs";
import {
  exportDocumentBatch,
  extractDocumentNodes,
  prepareDocumentExport,
  publishPreparedDocumentExports,
} from "./export-service.mjs";

const artwork = {
  version: "2.17",
  module: "generic",
  axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
  children: [{
    id: "art", type: "frame", name: "Artwork", width: 320, height: 180, fill: "#ffffff",
    children: [{ id: "box", type: "rectangle", x: 20, y: 20, width: 80, height: 60, fill: "#123456" }],
  }],
};

const deck = {
  version: "2.17",
  module: "deck",
  axes: {}, variables: {}, paragraphStyles: {}, imports: {}, flows: [],
  children: [{
    id: "slide", type: "frame", role: "slide", width: 320, height: 180,
    physical: { w: 16, h: 9, unit: "in" }, children: [],
  }],
};

async function expectCode(action, code) {
  let error;
  try { await action(); } catch (caught) { error = caught; }
  assert.ok(error, `expected ${code} rejection`);
  assert.equal(error.code, code);
  return error;
}

async function absent(path) { await assert.rejects(readFile(path), { code: "ENOENT" }); }

test("A: output segments reject every unsafe table entry and preserve valid NFC values", () => {
  const controls = Array.from({ length: 31 }, (_, index) => String.fromCharCode(index + 1));
  const invalid = [
    ["empty", ""], ["dot", "."], ["dotdot", ".."], ["slash", "/"], ["backslash", "\\"], ["NUL", "\0"],
    ...controls.map((value, index) => [`ASCII control U+${String(index + 1).padStart(4, "0")}`, value]),
    ["DEL", "\x7f"], ["non-NFC combining", "e\u0301"],
    ...["con", "CON.txt", "PrN.md", "aux.svg", "NUL.bin", "Com1.csv", "lPt9.tar.gz"].map((value) => [`reserved ${value}`, value]),
    ["UTF-8 length 256 ASCII", "a".repeat(256)], ["UTF-8 length 256 multibyte", "é".repeat(128)],
  ];
  for (const [label, value] of invalid) {
    let error;
    try { validateOutputSegment(value); } catch (caught) { error = caught; }
    assert.ok(error, label);
    assert.equal(error.code, "CANVAS_EXPORT_NAME_INVALID", label);
    assert.match(error.message, /Unsafe output segment/u, label);
  }
  for (const value of ["a".repeat(255), "é".repeat(127) + "a", "café", "hello world.txt"]) assert.equal(validateOutputSegment(value), value);
});

test("B: every occupied final destination rejects without changing its filesystem entry", async (context) => {
  const cases = [
    { name: "regular file", setup: async (root, path) => writeFile(path, "original"), check: async (root, path) => assert.equal(await readFile(path, "utf8"), "original") },
    { name: "directory", setup: async (root, path) => { await mkdir(path); await writeFile(join(path, "child"), "original"); }, check: async (root, path) => assert.deepEqual(await readdir(path), ["child"]) },
    { name: "symlink to file", setup: async (root, path) => { const target = join(root, "file-target"); await writeFile(target, "target"); await symlink(target, path); }, check: async (root, path) => assert.equal(await readlink(path), join(root, "file-target")) },
    { name: "symlink to directory", setup: async (root, path) => { const target = join(root, "dir-target"); await mkdir(target); await writeFile(join(target, "child"), "target"); await symlink(target, path); }, check: async (root, path) => assert.equal(await readlink(path), join(root, "dir-target")) },
    { name: "dangling symlink", setup: async (root, path) => symlink(join(root, "missing-target"), path), check: async (root, path) => assert.equal(await readlink(path), join(root, "missing-target")) },
  ];
  for (const item of cases) {
    const root = await mkdtemp(join(tmpdir(), "canvas-publication-destination-"));
    context.after(() => rm(root, { recursive: true, force: true }));
    const destination = join(root, "destination");
    await item.setup(root, destination);
    await expectCode(() => publishAtomicFile(destination, "replacement"), "CANVAS_EXPORT_EXISTS");
    await item.check(root, destination);
    const entry = await lstat(destination);
    assert.ok(entry.isDirectory() || entry.isFile() || entry.isSymbolicLink(), item.name);
  }
});

test("C: destination collision permutations reject before render or filesystem writes", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-publication-collisions-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const real = join(root, "real");
  await mkdir(real);
  await symlink(real, join(root, "alias"));
  const cases = [
    ["same destination", [join(root, "same"), join(root, "same")]],
    ["parent then child", [join(root, "parent"), join(root, "parent", "child")]],
    ["child then parent", [join(root, "other", "child"), join(root, "other")]],
    ["canonical ancestor alias", [join(root, "real", "deck.pptx"), join(root, "alias", "deck.pptx")]],
    ["case-fold", [join(root, "Case.pptx"), join(root, "case.pptx")]],
    ["canonical NFC", [join(root, "café.pptx"), join(root, "cafe\u0301.pptx")]],
  ];
  for (const [label, destinations] of cases) {
    await expectCode(() => preflightExportDestinations(destinations), "CANVAS_EXPORT_COLLISION");
    assert.deepEqual(await readdir(root), ["alias", "real"], label);
  }

  // An invalid frame makes any render path fail with CANVAS_EXPORT_FRAME. A
  // collision proves preflight ran first and the renderer was never invoked.
  const error = await expectCode(() => exportDocumentBatch(deck, [
    { role: "slide", frames: ["missing"], destination: join(root, "spy.pptx") },
    { role: "slide", frames: ["missing"], destination: join(root, "SPY.pptx") },
  ], { assets: new Map() }), "CANVAS_EXPORT_COLLISION");
  assert.equal(error.code, "CANVAS_EXPORT_COLLISION");
  assert.deepEqual(await readdir(root), ["alias", "real"]);
});

test("D: bundle entries reject duplicate/collision/unsafe names and publish empty plus nested files", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-publication-entries-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const invalidCases = [
    ["duplicate exact", [["same", "a"], ["same", "b"]]],
    ["duplicate case-fold", [["Same", "a"], ["same", "b"]]],
    ["file then parent directory", [["assets", "a"], ["assets/icon", "b"]]],
    ["parent directory then file", [["assets/icon", "a"], ["assets", "b"]]],
    ["unsafe nested dotdot", [["assets/../escape", "a"]]],
    ["unsafe nested empty", [["assets//escape", "a"]]],
    ["unsafe nested backslash", [["assets\\escape", "a"]]],
  ];
  for (const [label, files] of invalidCases) {
    const destination = join(root, label.replaceAll(" ", "-"));
    const error = await expectCode(() => publishExclusiveBundle(destination, files), label.startsWith("unsafe") ? "CANVAS_EXPORT_NAME_INVALID" : "CANVAS_EXPORT_COLLISION");
    assert.ok(error.code, label);
    await absent(destination);
  }
  const destination = join(root, "valid");
  const receipt = await publishExclusiveBundle(destination, [["zero.bin", Buffer.alloc(0)], ["nested/valid.txt", Buffer.from("valid")]]);
  assert.equal(receipt.destination, destination);
  assert.deepEqual(receipt.files.map(({ path }) => path), [join(destination, "zero.bin"), join(destination, "nested/valid.txt")]);
  assert.deepEqual(receipt.files.map(({ identity }) => Object.keys(identity).sort()), [["dev", "ino"], ["dev", "ino"]]);
  assert.equal((await lstat(join(destination, "zero.bin"))).size, 0);
  assert.equal(await readFile(join(destination, "nested/valid.txt"), "utf8"), "valid");
  assert.deepEqual(receipt.directories.map(({ path }) => path), [destination, join(destination, "nested")]);
});

test("E: receipt cleanup is identity-safe, preserves replacements, and reports exact failures", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-publication-cleanup-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const owned = await publishAtomicFile(join(root, "owned"), "owned");
  assert.deepEqual(Object.keys(owned), ["destination", "files", "directories"]);
  assert.deepEqual(Object.keys(owned.files[0]), ["path", "identity"]);
  assert.deepEqual(Object.keys(owned.files[0].identity).sort(), ["dev", "ino"]);
  assert.deepEqual(await cleanupPublishedExport(owned), []);
  await absent(join(root, "owned"));
  assert.deepEqual(await cleanupPublishedExport(owned), []);

  const replaced = await publishAtomicFile(join(root, "replaced"), "original");
  renameSync(replaced.destination, join(root, "replaced.retained-original"));
  writeFileSync(replaced.destination, "replacement", { flag: "wx" });
  const replacedFailure = await cleanupPublishedExport(replaced);
  assert.deepEqual(replacedFailure, [{ path: replaced.destination, reason: "identity-changed" }]);
  assert.equal(await readFile(replaced.destination, "utf8"), "replacement");

  const replacedSymlink = await publishAtomicFile(join(root, "replaced-link"), "original");
  renameSync(replacedSymlink.destination, join(root, "replaced-link.retained-original"));
  await symlink(join(root, "symlink-target"), replacedSymlink.destination);
  assert.deepEqual(await cleanupPublishedExport(replacedSymlink), [{ path: replacedSymlink.destination, reason: "identity-changed" }]);
  assert.equal(await readlink(replacedSymlink.destination), join(root, "symlink-target"));

  const bundle = await publishExclusiveBundle(join(root, "owned-directory"), [["owned/file", "owned"]]);
  await writeFile(join(bundle.destination, "foreign"), "foreign", { flag: "wx" });
  assert.deepEqual(await cleanupPublishedExport(bundle), [{ path: bundle.destination, reason: "ENOTEMPTY" }]);
  assert.deepEqual(await readdir(bundle.destination), ["foreign"]);

  const replacedDirectory = await publishExclusiveBundle(join(root, "replaced-directory"), []);
  renameSync(replacedDirectory.destination, join(root, "replaced-directory.retained-original"));
  await mkdir(replacedDirectory.destination);
  assert.deepEqual(await cleanupPublishedExport(replacedDirectory), [{ path: replacedDirectory.destination, reason: "identity-changed" }]);

  const mixedSafe = await publishAtomicFile(join(root, "mixed-safe"), "safe");
  const mixedMissing = { path: join(root, "mixed-missing"), identity: { dev: 0, ino: 0 } };
  const mixedReplaced = await publishAtomicFile(join(root, "mixed-replaced"), "original");
  renameSync(mixedReplaced.destination, join(root, "mixed-replaced.retained-original"));
  writeFileSync(mixedReplaced.destination, "replacement", { flag: "wx" });
  assert.deepEqual(await cleanupPublishedExport({
    destination: root,
    files: [...mixedSafe.files, mixedMissing, ...mixedReplaced.files],
    directories: [],
  }), [{ path: mixedReplaced.destination, reason: "identity-changed" }]);
  await absent(mixedSafe.destination);
  assert.equal(await readFile(mixedReplaced.destination, "utf8"), "replacement");
});

test("F: a three-output batch cleans earlier ownership after deterministic late failure", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-publication-late-failure-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const destinations = ["first.pptx", "later.pptx", "last.pptx"].map((name) => join(root, name));
  await preflightExportDestinations(destinations);
  const prepared = [];
  for (const destination of destinations) prepared.push(await prepareDocumentExport(deck, { role: "slide", frames: ["slide"], destination }, { assets: new Map(), title: "Late failure" }));
  assert.equal(prepared.length, 3);
  await writeFile(destinations[1], "competitor", { flag: "wx" });
  const error = await expectCode(() => publishPreparedDocumentExports(prepared), "CANVAS_EXPORT_EXISTS");
  assert.equal(error.cleanupFailures, undefined);
  await absent(destinations[0]);
  assert.equal(await readFile(destinations[1], "utf8"), "competitor");
  await absent(destinations[2]);
});

test("F: an earlier replacement survives batch cleanup with an identity failure", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-publication-replacement-race-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const destinations = ["first.pptx", "later.pptx", "last.pptx"].map((name) => join(root, name));
  await preflightExportDestinations(destinations);
  const prepared = [];
  for (const destination of destinations) prepared.push(await prepareDocumentExport(deck, { role: "slide", frames: ["slide"], destination }, { assets: new Map(), title: "Replacement" }));
  const sequence = (function* deterministicLateFailure() {
    yield prepared[0];
    renameSync(destinations[0], join(root, "first.pptx.retained-original"));
    writeFileSync(destinations[0], "original replacement", { flag: "wx" });
    writeFileSync(destinations[1], "competitor", { flag: "wx" });
    yield prepared[1];
    yield prepared[2];
  }());
  const error = await expectCode(() => publishPreparedDocumentExports(sequence), "CANVAS_EXPORT_EXISTS");
  assert.deepEqual(error.cleanupFailures, [{ path: destinations[0], reason: "identity-changed" }]);
  assert.equal(await readFile(destinations[0], "utf8"), "original replacement");
  assert.equal(await readFile(destinations[1], "utf8"), "competitor");
  await absent(destinations[2]);
});

test("G: extraction publication keeps PDF ordering, rejects single-unit PNG/SVG batches, and names directory artifacts by node ID", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "canvas-publication-extraction-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const pdfPath = join(root, "ordered.pdf");
  const pdf = await extractDocumentNodes(artwork, { node: ["box", "art"], format: "pdf", destination: pdfPath });
  assert.deepEqual(pdf.artifacts, [pdfPath]);
  for (const format of ["png", "svg"]) {
    const destination = join(root, `many.${format}`);
    await expectCode(() => extractDocumentNodes(artwork, { node: ["box", "art"], format, destination }), "CANVAS_EXTRACT_FORMAT_SINGLE_UNIT");
    await absent(destination);
  }
  const directory = `${join(root, "by-node")}/`;
  const result = await extractDocumentNodes(artwork, { node: ["box", "art"], format: "svg", destination: directory });
  assert.deepEqual(result.artifacts, [join(root, "by-node", "box.svg"), join(root, "by-node", "art.svg")]);
  assert.deepEqual((await readdir(join(root, "by-node"))).sort(), ["art.svg", "box.svg"]);
  await expectCode(() => extractDocumentNodes(artwork, { node: ["box"], format: "svg", destination: directory }), "CANVAS_EXPORT_EXISTS");
});

test("G: batch render still resolves an invalid frame only after non-colliding preflight", async () => {
  await expectCode(() => exportDocumentBatch(deck, [{ role: "slide", frames: ["missing"], destination: "/tmp/canvas-matrix-invalid-frame-one.pptx" }], { assets: new Map() }), "CANVAS_EXPORT_FRAME");
});
