import assert from "node:assert/strict";
import test from "node:test";

import { bindingsForExportSet, exportRoleForFormat, listExportFrames, resolveExportDestinations } from "./export-delivery.mjs";

const formats = [
  { format: "pptx", role: "slide", exact: "/tmp/luna-contract-pptx/single-output", directory: "/tmp/luna-contract-pptx/", one: "/tmp/luna-contract-pptx/École One.pptx", three: ["/tmp/luna-contract-pptx/École One.pptx", "/tmp/luna-contract-pptx/Café Deux.pptx", "/tmp/luna-contract-pptx/学校 Three.pptx"] },
  { format: "html", role: "route", exact: "/tmp/luna-contract-html/single-output", directory: "/tmp/luna-contract-html/", one: "/tmp/luna-contract-html/École One", three: ["/tmp/luna-contract-html/École One", "/tmp/luna-contract-html/Café Deux", "/tmp/luna-contract-html/学校 Three"] },
  { format: "swift", role: "ios", exact: "/tmp/luna-contract-swift/single-output", directory: "/tmp/luna-contract-swift/", one: "/tmp/luna-contract-swift/École One", three: ["/tmp/luna-contract-swift/École One", "/tmp/luna-contract-swift/Café Deux", "/tmp/luna-contract-swift/学校 Three"] },
  { format: "kotlin", role: "android", exact: "/tmp/luna-contract-kotlin/single-output", directory: "/tmp/luna-contract-kotlin/", one: "/tmp/luna-contract-kotlin/École One", three: ["/tmp/luna-contract-kotlin/École One", "/tmp/luna-contract-kotlin/Café Deux", "/tmp/luna-contract-kotlin/学校 Three"] },
];

function expectCode(action, code) {
  assert.throws(action, { code });
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

test("format-role mappings and nested frame traversal are explicit and source ordered", () => {
  assert.deepEqual(formats.map(({ format }) => exportRoleForFormat(format)), ["slide", "route", "ios", "android"]);
  for (const invalid of ["pdf", "png", "unknown", ""]) expectCode(() => exportRoleForFormat(invalid), "CANVAS_EXPORT_FORMAT");

  const document = { children: [
    { id: "outer-slide", type: "frame", role: "slide", children: [] },
    { id: "group-one", type: "group", children: [
      { id: "nested-route", type: "frame", role: "route", children: [] },
      { id: "nested-slide", type: "frame", role: "slide", children: [] },
      { id: "fake-slide", type: "rectangle", role: "slide", children: [] },
      { id: "mismatched", type: "frame", role: "ios", children: [] },
    ] },
    { id: "group-two", type: "group", children: [{ id: "deep-slide", type: "frame", role: "slide", children: [] }] },
  ] };
  assert.deepEqual(listExportFrames(document, "slide"), ["outer-slide", "nested-slide", "deep-slide"]);
  assert.deepEqual(listExportFrames(document, "route"), ["nested-route"]);
  assert.deepEqual(listExportFrames(document, "ios"), ["mismatched"]);
  assert.deepEqual(listExportFrames(document, "android"), []);
});

test("one unbound request retains its exact path; bound file and directory cases are explicit for every format", () => {
  for (const item of formats) {
    assert.deepEqual(resolveExportDestinations(item.exact, [null], item.format), [item.exact]);
    assert.deepEqual(resolveExportDestinations(item.exact, [{ output: "ignored" }], item.format), [item.exact]);
    assert.deepEqual(resolveExportDestinations(item.directory, [{ output: "École One" }], item.format), [item.one]);
    assert.deepEqual(resolveExportDestinations(item.directory, [
      { output: "École One" }, { output: "Café Deux" }, { output: "学校 Three" },
    ], item.format), item.three);
    expectCode(() => resolveExportDestinations(item.exact, [
      { output: "École One" }, { output: "Café Deux" }, { output: "学校 Three" },
    ], item.format), "CANVAS_EXPORT_COLLISION");
    // Missing output is rejected as required; the existing implementation has
    // no stable code on this branch, so do not create a new production code.
    assert.throws(() => resolveExportDestinations(item.directory, [{}], item.format));
  }
});

test("binding and derived output names reject all controls and unsafe segment forms", () => {
  const unsafe = [
    ["empty", ""], ["NUL", "\0"], ...Array.from({ length: 31 }, (_, index) => [`U+${index + 1}`, String.fromCharCode(index + 1)]),
    ["DEL", "\x7f"], ["slash", "/"], ["backslash", "\\"], ["dot", "."], ["dotdot", ".."],
    ["non-NFC", "e\u0301"], ...["CON", "con.txt", "PrN.md", "aux.svg", "NUL.bin", "COM1.csv", "lpt9.tar.gz"].map((value) => [`reserved ${value}`, value]),
  ];
  for (const [label, output] of unsafe) {
    expectCode(() => resolveExportDestinations("/tmp/luna-contract-names/", [{ output }], "html"), "CANVAS_EXPORT_OUTPUT_NAME");
    assert.ok(label);
  }
  // 251 ASCII bytes are valid as a binding segment but become 256 bytes after
  // the .pptx suffix, exercising the derived-segment validator.
  expectCode(() => resolveExportDestinations("/tmp/luna-contract-names/", [{ output: "a".repeat(251) }], "pptx"), "CANVAS_EXPORT_OUTPUT_NAME");
});

test("binding and final-derived UTF-8 byte boundaries are exact", () => {
  assert.deepEqual(resolveExportDestinations("/tmp/luna-contract-bytes/", [{ output: "a".repeat(255) }], "html"), ["/tmp/luna-contract-bytes/" + "a".repeat(255)]);
  expectCode(() => resolveExportDestinations("/tmp/luna-contract-bytes/", [{ output: "a".repeat(256) }], "html"), "CANVAS_EXPORT_OUTPUT_NAME");
  assert.deepEqual(resolveExportDestinations("/tmp/luna-contract-bytes/", [{ output: "é".repeat(127) + "a" }], "html"), ["/tmp/luna-contract-bytes/" + "é".repeat(127) + "a"]);
  expectCode(() => resolveExportDestinations("/tmp/luna-contract-bytes/", [{ output: "é".repeat(128) }], "html"), "CANVAS_EXPORT_OUTPUT_NAME");
  assert.deepEqual(resolveExportDestinations("/tmp/luna-contract-bytes/", [{ output: "a".repeat(250) }], "pptx"), ["/tmp/luna-contract-bytes/" + "a".repeat(250) + ".pptx"]);
  expectCode(() => resolveExportDestinations("/tmp/luna-contract-bytes/", [{ output: "a".repeat(251) }], "pptx"), "CANVAS_EXPORT_OUTPUT_NAME");
  assert.deepEqual(resolveExportDestinations("/tmp/luna-contract-bytes/", [{ output: "é".repeat(125) }], "pptx"), ["/tmp/luna-contract-bytes/" + "é".repeat(125) + ".pptx"]);
  expectCode(() => resolveExportDestinations("/tmp/luna-contract-bytes/", [{ output: "é".repeat(126) }], "pptx"), "CANVAS_EXPORT_OUTPUT_NAME");
});

test("literal template tokens never interpolate, even when bindings exist", () => {
  const bindings = [{ output: "School One", school: "one" }];
  expectCode(() => resolveExportDestinations("/tmp/${school}.pptx", bindings, "pptx"), "CANVAS_EXPORT_OUTPUT_NAME");
  expectCode(() => resolveExportDestinations("/tmp/apps/${school}/", bindings, "swift"), "CANVAS_EXPORT_OUTPUT_NAME");
});

test("exact and case-fold binding outputs reject collisions with stable codes", () => {
  expectCode(() => resolveExportDestinations("/tmp/luna-contract-collision/", [{ output: "Same" }, { output: "Same" }], "html"), "CANVAS_EXPORT_COLLISION");
  expectCode(() => resolveExportDestinations("/tmp/luna-contract-collision/", [{ output: "Same" }, { output: "same" }], "html"), "CANVAS_EXPORT_COLLISION");
});

test("bindingsForExportSet strips only output, preserves values, and never mutates frozen input", () => {
  const nested = { list: [1, false, { empty: "" }], object: { zero: 0, nil: null } };
  const input = deepFreeze({ output: "School One", nested, falseValue: false, zero: 0, empty: "", nil: null });
  const before = structuredClone(input);
  const result = bindingsForExportSet(input);
  assert.deepEqual(result, { nested, falseValue: false, zero: 0, empty: "", nil: null });
  assert.deepEqual(input, before);
  assert.notEqual(result, input);
  assert.deepEqual(bindingsForExportSet(null), {});
  assert.deepEqual(bindingsForExportSet(undefined), {});
});
