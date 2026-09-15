import assert from "node:assert/strict";
import test from "node:test";

import { createFolderForDocument } from "./folder-actions.mjs";

test("creating a folder from a design keeps it inside the current folder and moves the design", async () => {
  const calls = [];
  const api = {
    async createFolder(name, parentId) {
      calls.push(["createFolder", name, parentId]);
      return { id: "child-folder", name, parentId };
    },
    async moveDocument(documentId, folderId) {
      calls.push(["moveDocument", documentId, folderId]);
      return { id: documentId, folderId };
    },
  };

  const result = await createFolderForDocument(api, {
    name: "Research",
    parentId: "parent-folder",
    document: { id: "design-1", folderId: "parent-folder" },
  });

  assert.deepEqual(calls, [
    ["createFolder", "Research", "parent-folder"],
    ["moveDocument", "design-1", "child-folder"],
  ]);
  assert.deepEqual(result, {
    folder: { id: "child-folder", name: "Research", parentId: "parent-folder" },
    movedDocument: { id: "design-1", folderId: "child-folder" },
  });
});

test("creating a folder from an unfiled design creates it at Home", async () => {
  const calls = [];
  const api = {
    async createFolder(name, parentId) {
      calls.push(["createFolder", name, parentId]);
      return { id: "root-folder", name, parentId };
    },
    async moveDocument(documentId, folderId) {
      calls.push(["moveDocument", documentId, folderId]);
      return { id: documentId, folderId };
    },
  };

  await createFolderForDocument(api, {
    name: "Ideas",
    document: { id: "design-2", folderId: null },
  });

  assert.deepEqual(calls, [
    ["createFolder", "Ideas", null],
    ["moveDocument", "design-2", "root-folder"],
  ]);
});
