import assert from "node:assert/strict";
import test from "node:test";
import {
  clampPdfPage,
  createTreeTypeahead,
  escapeHtml,
  fileIconName,
  joinRelative,
  looksLikeText,
  matchesQuery,
  parentRelative,
  pdfRenderScale,
  previewKind,
  sortEntries,
  treeRowIndent,
} from "./explorer-model.mjs";

test("normalizes scoped relative paths without inventing an absolute path", () => {
  assert.equal(joinRelative("docs/", "/guides", "intro.md"), "docs/guides/intro.md");
  assert.equal(parentRelative("docs/guides/intro.md"), "docs/guides");
});

test("uses explicit pixel indentation for nested tree rows", () => {
  assert.equal(treeRowIndent(0), "0px");
  assert.equal(treeRowIndent(1), "16px");
  assert.equal(treeRowIndent(2), "32px");
});

test("sorts folders before files and uses natural names", () => {
  const entries = sortEntries([
    { kind: "file", name: "10.txt" },
    { kind: "directory", name: "src" },
    { kind: "file", name: "2.txt" },
  ]);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["src", "2.txt", "10.txt"],
  );
});

test("classifies supported preview surfaces", () => {
  assert.equal(previewKind({ kind: "file", name: "README.md" }), "markdown");
  assert.equal(previewKind({ kind: "file", name: "icon.svg" }), "svg");
  assert.equal(previewKind({ kind: "file", name: "diagram.webp" }), "image");
  assert.equal(previewKind({ kind: "file", name: "brief.pdf" }), "pdf");
  assert.equal(previewKind({ kind: "file", name: "jobs.csv" }), "table");
  assert.equal(previewKind({ kind: "file", name: "jobs.tsv" }), "table");
  for (const name of ["clip.MP4", "clip.m4v", "clip.webm", "clip.mov", "clip.ogv"]) {
    assert.equal(previewKind({ kind: "file", name }), "video");
  }
  assert.equal(previewKind({ kind: "file", name: ".env" }), "unsupported");
  assert.equal(previewKind({ kind: "file", name: "Dockerfile" }), "unsupported");
  assert.equal(previewKind({ kind: "file", name: "archive.pkg" }), "unsupported");
});

test("clamps PDF navigation and fits pages without enlarging them", () => {
  assert.equal(clampPdfPage(0, 3), 1);
  assert.equal(clampPdfPage(2, 3), 2);
  assert.equal(clampPdfPage(9, 3), 3);
  assert.equal(pdfRenderScale(600, 480), 0.8);
  assert.equal(pdfRenderScale(600, 900), 1);
});

test("maps familiar filenames and extensions to editor-style icons", () => {
  assert.equal(fileIconName({ kind: "directory", name: "src" }, true), "folder-open");
  assert.equal(fileIconName({ kind: "file", name: "component.tsx" }), "react_ts");
  assert.equal(fileIconName({ kind: "file", name: "tsconfig.json" }), "settings");
  assert.equal(fileIconName({ kind: "file", name: ".gitignore" }), "git");
  assert.equal(fileIconName({ kind: "file", name: "jobs.csv" }), "database");
  assert.equal(fileIconName({ kind: "file", name: "unknown.bin" }), null);
});

test("detects extensionless UTF-8 text without treating binary data as source", () => {
  assert.equal(looksLikeText(new TextEncoder().encode("hello\nworld\n")), true);
  assert.equal(looksLikeText(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0xff])), false);
  assert.equal(looksLikeText(new Uint8Array([0xc3, 0x28])), false);
  assert.equal(looksLikeText(new Uint8Array([0x61, 0xe2]), true), true);
});

test("fuzzy search considers both file name and relative path", () => {
  const entry = { name: "AppRuntime.ts", relativePath: "src/runtime/AppRuntime.ts" };
  assert.equal(matchesQuery(entry, "apprt"), true);
  assert.equal(matchesQuery(entry, "design"), false);
});

test("HTML escaping protects generated tree markup", () => {
  assert.equal(escapeHtml('a&<"'), "a&amp;&lt;&quot;");
});

test("sorts unavailable entries alongside files after directories", () => {
  const entries = sortEntries([
    { kind: "unavailable", name: "1.txt" },
    { kind: "file", name: "2.txt" },
    { kind: "directory", name: "src" },
  ]);
  assert.deepEqual(
    entries.map((entry) => entry.name),
    ["src", "1.txt", "2.txt"],
  );
});

const typeaheadRows = [
  { name: "alpha", path: "alpha" },
  { name: "about", path: "about" },
  { name: "beta", path: "beta" },
];
const typeKey = (typeahead, key, index) =>
  typeahead.keydown({ key, metaKey: false, ctrlKey: false, altKey: false }, typeaheadRows, index);

test("tree typing accumulates ab and selects an ab entry without a clock", () => {
  const typeahead = createTreeTypeahead();
  assert.equal(typeKey(typeahead, "a", 2).path, "alpha");
  assert.equal(typeKey(typeahead, "b", 0).path, "about");
});

test("a click clears the tree prefix before the next printable key", () => {
  const typeahead = createTreeTypeahead();
  typeKey(typeahead, "a", 2);
  typeahead.click();
  assert.equal(typeKey(typeahead, "b", 0).path, "beta");
});

test("leaving the tree clears its prefix, while focus between rows preserves it", () => {
  const typeahead = createTreeTypeahead();
  typeKey(typeahead, "a", 2);
  typeahead.blur(false);
  assert.equal(typeKey(typeahead, "b", 0).path, "about");
  typeahead.blur(true);
  assert.equal(typeKey(typeahead, "b", 1).path, "beta");
});

for (const key of [
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Escape",
  "Tab",
  "Home",
  "End",
]) {
  test(`${key} clears the tree prefix before the next printable key`, () => {
    const typeahead = createTreeTypeahead();
    typeKey(typeahead, "a", 2);
    assert.equal(typeKey(typeahead, key, 0), null);
    assert.equal(typeKey(typeahead, "b", 0).path, "beta");
  });
}
