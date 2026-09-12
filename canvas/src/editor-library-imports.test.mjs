import { describe, expect, test } from "bun:test";

import {
  libraryImportCompatibilityIssue,
  loadEditorLibraryImports,
  resolveEditorCanvasDocument,
} from "./editor-library-imports.mjs";

const importedDocument = {
  version: "2.17",
  module: "generic",
  axes: {},
  variables: {},
  paragraphStyles: {},
  imports: {
    school: {
      documentId: "school-library",
      updatePolicy: "pinned",
      releaseId: "release-1",
      contentHash: "a".repeat(64),
    },
  },
  children: [{ id: "card-instance", type: "ref", ref: "school:card" }],
  flows: [],
};

describe("editor library imports", () => {
  test("a retained-library read failure leaves the document available", async () => {
    const result = await loadEditorLibraryImports({}, importedDocument, { documentId: "consumer" });

    expect(Object.keys(result.imports)).toEqual([]);
    expect(result.assets.size).toBe(0);
    expect(result.error?.code).toBe("CANVAS_LIBRARY_STORAGE_REQUIRED");
  });

  test("an unresolved imported component falls back to the preserved source", () => {
    const result = resolveEditorCanvasDocument(importedDocument, Object.create(null));
    const issue = libraryImportCompatibilityIssue(importedDocument, result.error, "consumer");

    expect(result.document.children[0]).toEqual(importedDocument.children[0]);
    expect(result.document).not.toBe(importedDocument);
    expect(issue).toMatchObject({ nodeId: "card-instance", kind: "library-import" });
  });

  test("documents without imports still reject invalid local references", () => {
    const local = structuredClone(importedDocument);
    local.imports = {};
    local.children[0].ref = "missing-component";

    expect(() => resolveEditorCanvasDocument(local, Object.create(null))).toThrow();
  });
});
