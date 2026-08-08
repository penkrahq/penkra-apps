export function documentDeleteConfirmation(document) {
  return {
    kind: "confirm-delete-document",
    documentId: document.id,
    title: document.title,
    returnDialog: "menu",
    returnFocusSelector: '[data-action="delete-document"]',
  };
}

export function collaboratorRemovalConfirmation(grant) {
  return {
    kind: "confirm-remove-collaborator",
    grantId: grant.id,
    email: grant.email,
    returnDialog: "share",
    returnFocusSelector: `[data-revoke-grant="${grant.id}"]`,
  };
}

export function isDestructiveConfirmation(dialog) {
  return dialog?.kind === "confirm-delete-document" || dialog?.kind === "confirm-remove-collaborator";
}

export async function executeDestructiveConfirmation(dialog, actions) {
  if (dialog?.kind === "confirm-delete-document") {
    await actions.deleteDocument(dialog.documentId);
    return "deleted-document";
  }
  if (dialog?.kind === "confirm-remove-collaborator") {
    await actions.removeCollaborator(dialog.grantId);
    return "removed-collaborator";
  }
  throw new Error("A destructive confirmation is required before this action can run.");
}
