import assert from "node:assert/strict";
import test from "node:test";

import { bindingsForExportSet, exportRoleForFormat, listExportFrames, resolveExportDestinations } from "./export-delivery.mjs";

test("formats select eligibility roles independently of capability lookup", () => {
  assert.deepEqual(["pptx", "html", "swift", "kotlin"].map(exportRoleForFormat), ["slide", "route", "ios", "android"]);
  assert.throws(() => exportRoleForFormat("pdf"), { code: "CANVAS_EXPORT_FORMAT" });
  assert.deepEqual(listExportFrames({ children: [
    { id: "route", type: "frame", role: "route", children: [] },
    { id: "group", type: "group", children: [{ id: "nested", type: "frame", role: "route", children: [] }] },
  ] }, "route"), ["route", "nested"]);
});

test("binding outputs provide deterministic file and bundle names without sanitizing", () => {
  const sets = [{ output: "School One", school: "one" }, { output: "School-Two", school: "two" }];
  assert.deepEqual(resolveExportDestinations("/tmp/decks/", sets, "pptx"), [
    "/tmp/decks/School One.pptx", "/tmp/decks/School-Two.pptx",
  ]);
  assert.deepEqual(resolveExportDestinations("/tmp/apps/", sets, "swift"), [
    "/tmp/apps/School One", "/tmp/apps/School-Two",
  ]);
  assert.throws(() => resolveExportDestinations("/tmp/${school}.pptx", sets, "pptx"), { code: "CANVAS_EXPORT_OUTPUT_NAME" });
  assert.deepEqual(bindingsForExportSet(sets[0]), { school: "one" });
});

test("binding destination collisions and unsafe segments fail before delivery", () => {
  assert.throws(() => resolveExportDestinations("/tmp/decks/", [{ output: "A" }, { output: "a" }], "pptx"), { code: "CANVAS_EXPORT_COLLISION" });
  assert.throws(() => resolveExportDestinations("/tmp/decks/", [{ output: "../escape" }], "pptx"), { code: "CANVAS_EXPORT_OUTPUT_NAME" });
  assert.throws(() => resolveExportDestinations("/tmp/result.pptx", [{ output: "one" }, { output: "two" }], "pptx"), { code: "CANVAS_EXPORT_COLLISION" });
  assert.throws(() => resolveExportDestinations("/tmp/${missing}.pptx", [{ output: "one" }], "pptx"), { code: "CANVAS_EXPORT_OUTPUT_NAME" });
});
