import { Y } from "./document-model.mjs";

const OUTBOX_ARRAY = "pending-updates";

export function createCanvasUpdateOutbox(doc = new Y.Doc()) {
  const entries = doc.getArray(OUTBOX_ARRAY);

  return {
    doc,
    list() {
      return entries.toArray().map(cloneEntry);
    },
    append(entry) {
      const value = cloneEntry(entry);
      assertEntry(value);
      if (entries.toArray().some((item) => item.clientUpdateId === value.clientUpdateId)) {
        return false;
      }
      entries.push([value]);
      return true;
    },
    remove(clientUpdateId) {
      const index = entries.toArray().findIndex((item) => item.clientUpdateId === clientUpdateId);
      if (index < 0) return false;
      entries.delete(index, 1);
      return true;
    },
  };
}

export function canvasUpdateOutboxName(documentId) {
  return `penkra-canvas-update-outbox-v3:${documentId}`;
}

function cloneEntry(entry) {
  return { clientUpdateId: entry?.clientUpdateId, update: entry?.update };
}

function assertEntry(entry) {
  if (typeof entry.clientUpdateId !== "string" || entry.clientUpdateId.length === 0) {
    throw new TypeError("Canvas update outbox entries require a clientUpdateId.");
  }
  if (typeof entry.update !== "string" || entry.update.length === 0) {
    throw new TypeError("Canvas update outbox entries require an encoded update.");
  }
}
