import assert from "node:assert/strict";
import test from "node:test";
import {
  escapeHtml,
  fileIconName,
  finderRelativePath,
  joinRelative,
  looksLikeText,
  matchesQuery,
  parentRelative,
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

test("opens directories directly and files through their containing folder", () => {
  assert.equal(
    finderRelativePath({ kind: "directory", relativePath: "apps/web" }),
    "apps/web",
  );
  assert.equal(
    finderRelativePath({ kind: "file", relativePath: "apps/web/package.json" }),
    "apps/web",
  );
  assert.equal(finderRelativePath({ kind: "file", relativePath: "README.md" }), "");
});

test("sorts folders before files and uses natural names", () => {
  const entries = sortEntries([{ kind: "file", name: "10.txt" }, { kind: "directory", name: "src" }, { kind: "file", name: "2.txt" }]);
  assert.deepEqual(entries.map((entry) => entry.name), ["src", "2.txt", "10.txt"]);
});

test("classifies supported preview surfaces", () => {
  assert.equal(previewKind({ kind: "file", name: "README.md" }), "markdown");
  assert.equal(previewKind({ kind: "file", name: "icon.svg" }), "svg");
  assert.equal(previewKind({ kind: "file", name: "diagram.webp" }), "image");
  assert.equal(previewKind({ kind: "file", name: "brief.pdf" }), "pdf");
  assert.equal(previewKind({ kind: "file", name: ".env" }), "unsupported");
  assert.equal(previewKind({ kind: "file", name: "Dockerfile" }), "unsupported");
  assert.equal(previewKind({ kind: "file", name: "archive.pkg" }), "unsupported");
});

test("maps familiar filenames and extensions to editor-style icons", () => {
  assert.equal(fileIconName({ kind: "directory", name: "src" }, true), "folder-open");
  assert.equal(fileIconName({ kind: "file", name: "component.tsx" }), "react_ts");
  assert.equal(fileIconName({ kind: "file", name: "tsconfig.json" }), "settings");
  assert.equal(fileIconName({ kind: "file", name: ".gitignore" }), "git");
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
