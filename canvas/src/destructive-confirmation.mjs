export function documentTrashConfirmation(document, options = {}) {
  return {
    kind: "confirm-trash-document",
    documentId: document.id,
    title: document.title,
    returnDialog: options.returnDialog ?? "menu",
    returnFocusSelector: options.returnFocusSelector ?? '[data-action="trash-document"]',
  };
}

export function documentPermanentDeleteConfirmation(document) {
  return {
    kind: "confirm-permanently-delete-document",
    documentId: document.id,
    title: document.title,
    returnDialog: null,
    returnFocusSelector: `[data-permanently-delete-document="${document.id}"]`,
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
  return dialog?.kind === "confirm-trash-document"
    || dialog?.kind === "confirm-permanently-delete-document"
    || dialog?.kind === "confirm-remove-collaborator";
}

export async function executeDestructiveConfirmation(dialog, actions) {
  if (dialog?.kind === "confirm-trash-document") {
    await actions.trashDocument(dialog.documentId);
    return "trashed-document";
  }
  if (dialog?.kind === "confirm-permanently-delete-document") {
    await actions.permanentlyDeleteDocument(dialog.documentId);
    return "permanently-deleted-document";
  }
  if (dialog?.kind === "confirm-remove-collaborator") {
    await actions.removeCollaborator(dialog.grantId);
    return "removed-collaborator";
  }
  throw new Error("A destructive confirmation is required before this action can run.");
}
