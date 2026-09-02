import assert from "node:assert/strict";
import test from "node:test";
import {
  collaboratorRemovalConfirmation,
  documentPermanentDeleteConfirmation,
  documentTrashConfirmation,
  executeDestructiveConfirmation,
  isDestructiveConfirmation,
} from "./destructive-confirmation.mjs";

test("opening a document Trash confirmation does not move anything", () => {
  let calls = 0;
  const confirmation = documentTrashConfirmation({ id: "document-1", title: "Launch" });
  assert.equal(calls, 0);
  assert.equal(isDestructiveConfirmation(confirmation), true);
  assert.deepEqual(confirmation, {
    kind: "confirm-trash-document",
    documentId: "document-1",
    title: "Launch",
    returnDialog: "menu",
    returnFocusSelector: '[data-action="trash-document"]',
  });
});

test("moving a document to Trash runs only after confirmation execution", async () => {
  const calls = [];
  const confirmation = documentTrashConfirmation({ id: "document-1", title: "Launch" });
  const result = await executeDestructiveConfirmation(confirmation, {
    trashDocument: async (id) => calls.push(["trash", id]),
    removeCollaborator: async () => calls.push(["remove"]),
  });
  assert.equal(result, "trashed-document");
  assert.deepEqual(calls, [["trash", "document-1"]]);
});

test("permanent deletion is a separate explicit confirmation", async () => {
  const calls = [];
  const confirmation = documentPermanentDeleteConfirmation({ id: "document-1", title: "Launch" });
  const result = await executeDestructiveConfirmation(confirmation, {
    permanentlyDeleteDocument: async (id) => calls.push(["permanent", id]),
  });
  assert.equal(result, "permanently-deleted-document");
  assert.deepEqual(calls, [["permanent", "document-1"]]);
});

test("opening a collaborator removal confirmation does not revoke access", () => {
  let calls = 0;
  const confirmation = collaboratorRemovalConfirmation({ id: "grant-1", email: "person@example.com" });
  assert.equal(calls, 0);
  assert.equal(isDestructiveConfirmation(confirmation), true);
  assert.deepEqual(confirmation, {
    kind: "confirm-remove-collaborator",
    grantId: "grant-1",
    email: "person@example.com",
    returnDialog: "share",
    returnFocusSelector: '[data-revoke-grant="grant-1"]',
  });
});

test("collaborator removal runs only after confirmation execution", async () => {
  const calls = [];
  const confirmation = collaboratorRemovalConfirmation({ id: "grant-1", email: "person@example.com" });
  const result = await executeDestructiveConfirmation(confirmation, {
    trashDocument: async () => calls.push(["trash"]),
    removeCollaborator: async (id) => calls.push(["remove", id]),
  });
  assert.equal(result, "removed-collaborator");
  assert.deepEqual(calls, [["remove", "grant-1"]]);
});

test("execution rejects anything that is not an explicit destructive confirmation", async () => {
  await assert.rejects(executeDestructiveConfirmation({ kind: "menu" }, {}));
});
