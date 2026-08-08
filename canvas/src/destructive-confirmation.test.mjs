import assert from "node:assert/strict";
import test from "node:test";
import {
  collaboratorRemovalConfirmation,
  documentDeleteConfirmation,
  executeDestructiveConfirmation,
  isDestructiveConfirmation,
} from "./destructive-confirmation.mjs";

test("opening a document deletion confirmation does not delete anything", () => {
  let calls = 0;
  const confirmation = documentDeleteConfirmation({ id: "document-1", title: "Launch" });
  assert.equal(calls, 0);
  assert.equal(isDestructiveConfirmation(confirmation), true);
  assert.deepEqual(confirmation, {
    kind: "confirm-delete-document",
    documentId: "document-1",
    title: "Launch",
    returnDialog: "menu",
    returnFocusSelector: '[data-action="delete-document"]',
  });
});

test("document deletion runs only after confirmation execution", async () => {
  const calls = [];
  const confirmation = documentDeleteConfirmation({ id: "document-1", title: "Launch" });
  const result = await executeDestructiveConfirmation(confirmation, {
    deleteDocument: async (id) => calls.push(["delete", id]),
    removeCollaborator: async () => calls.push(["remove"]),
  });
  assert.equal(result, "deleted-document");
  assert.deepEqual(calls, [["delete", "document-1"]]);
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
    deleteDocument: async () => calls.push(["delete"]),
    removeCollaborator: async (id) => calls.push(["remove", id]),
  });
  assert.equal(result, "removed-collaborator");
  assert.deepEqual(calls, [["remove", "grant-1"]]);
});

test("execution rejects anything that is not an explicit destructive confirmation", async () => {
  await assert.rejects(
    executeDestructiveConfirmation({ kind: "menu" }, {}),
    /destructive confirmation is required/i,
  );
});
