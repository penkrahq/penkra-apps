import assert from "node:assert/strict";
import test from "node:test";

import { createFolderForDocument } from "./folder-actions.mjs";

test("creating a folder from a design uses one atomic backend operation", async () => {
  const calls = [];
  const api = {
    async moveDocumentToNewFolder(documentId, name) {
      calls.push(["moveDocumentToNewFolder", documentId, name]);
      return {
        folder: { id: "child-folder", name, parentId: "parent-folder" },
        movedDocument: { id: documentId, folderId: "child-folder" },
      };
    },
  };

  const result = await createFolderForDocument(api, {
    name: "Research",
    document: { id: "design-1", folderId: "parent-folder" },
  });

  assert.deepEqual(calls, [["moveDocumentToNewFolder", "design-1", "Research"]]);
  assert.deepEqual(result, {
    folder: { id: "child-folder", name: "Research", parentId: "parent-folder" },
    movedDocument: { id: "design-1", folderId: "child-folder" },
  });
});
