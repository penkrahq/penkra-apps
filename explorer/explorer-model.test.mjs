import assert from "node:assert/strict";
import test from "node:test";
import { escapeHtml, joinRelative, matchesQuery, parentRelative, previewKind, renderMarkdown, sortEntries } from "./explorer-model.mjs";

test("normalizes scoped relative paths without inventing an absolute path", () => {
  assert.equal(joinRelative("docs/", "/guides", "intro.md"), "docs/guides/intro.md");
  assert.equal(parentRelative("docs/guides/intro.md"), "docs/guides");
});

test("sorts folders before files and uses natural names", () => {
  const entries = sortEntries([{ kind: "file", name: "10.txt" }, { kind: "directory", name: "src" }, { kind: "file", name: "2.txt" }]);
  assert.deepEqual(entries.map((entry) => entry.name), ["src", "2.txt", "10.txt"]);
});

test("classifies supported preview surfaces", () => {
  assert.equal(previewKind({ kind: "file", name: "README.md" }), "markdown");
  assert.equal(previewKind({ kind: "file", name: "diagram.webp" }), "image");
  assert.equal(previewKind({ kind: "file", name: "brief.pdf" }), "pdf");
  assert.equal(previewKind({ kind: "file", name: "archive.pkg" }), "unsupported");
});

test("fuzzy search considers both file name and relative path", () => {
  const entry = { name: "AppRuntime.ts", relativePath: "src/runtime/AppRuntime.ts" };
  assert.equal(matchesQuery(entry, "apprt"), true);
  assert.equal(matchesQuery(entry, "design"), false);
});

test("markdown rendering escapes executable HTML", () => {
  const output = renderMarkdown("# Hello\n<script>alert(1)</script>");
  assert.match(output, /<h1>Hello<\/h1>/);
  assert.doesNotMatch(output, /<script>/);
  assert.equal(escapeHtml('a&<"'), "a&amp;&lt;&quot;");
});
