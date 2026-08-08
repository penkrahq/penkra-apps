import {
  Y,
  createModel,
  materializePen,
  openModel,
  setNodeProperty,
  setNodePropertyPath,
  insertNode,
  moveNode,
  deleteNode,
  restoreNode,
} from "@penkra/canvas-collaboration-research";
import { base64ToBytes, bytesToBase64 } from "./codec.mjs";

export const LOCAL_ORIGIN = Symbol("canvas-local");
export const REMOTE_ORIGIN = Symbol("canvas-remote");

export function createDocumentModel(source) {
  return createModel(source, { origin: LOCAL_ORIGIN });
}

export function createUndoManager(model) {
  return new Y.UndoManager(model.nodes, {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 500,
  });
}

export function restoreDocumentModel(payload) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, base64ToBytes(payload.snapshot.state), REMOTE_ORIGIN);
  for (const update of payload.updates ?? []) {
    Y.applyUpdate(doc, base64ToBytes(update.update), REMOTE_ORIGIN);
  }
  return openModel(doc);
}

export function encodeState(model) {
  return bytesToBase64(Y.encodeStateAsUpdate(model.doc));
}

export function encodeUpdate(update) {
  return bytesToBase64(update);
}

export function applyRemoteUpdate(model, update) {
  Y.applyUpdate(model.doc, base64ToBytes(update), REMOTE_ORIGIN);
}

export function reconcileDocumentPayload(model, payload, lastSequence = 0) {
  let nextSequence = Number.isFinite(Number(lastSequence)) ? Number(lastSequence) : 0;
  const snapshotSequence = Number(payload.snapshot?.throughSequence ?? 0);
  // The sequence watermark records what the server has accepted, not every
  // update this client has applied. An offline client can append its own update
  // at sequence N before it catches up with a remote update at N - 1. Yjs
  // updates are idempotent, so replay the payload instead of using the watermark
  // as an application filter.
  if (payload.snapshot?.state) {
    applyRemoteUpdate(model, payload.snapshot.state);
  }
  nextSequence = Math.max(nextSequence, snapshotSequence);
  const updates = [...(payload.updates ?? [])].sort(
    (left, right) => Number(left.sequence ?? 0) - Number(right.sequence ?? 0),
  );
  for (const update of updates) {
    const sequence = Number(update.sequence ?? 0);
    if (!update.update) continue;
    applyRemoteUpdate(model, update.update);
    nextSequence = Math.max(nextSequence, sequence);
  }
  return nextSequence;
}

export function materialize(model) {
  return materializePen(model);
}

export function listNodes(model) {
  const document = materialize(model);
  const output = [];
  const visit = (nodes = [], depth = 0, parentId = null) => {
    nodes.forEach((node, index) => {
      output.push({ node, depth, parentId, index });
      visit(node.children, depth + 1, node.id);
    });
  };
  visit(document.children);
  return output;
}

export function mutate(model, mutation, origin = LOCAL_ORIGIN) {
  switch (mutation.kind) {
    case "set-property":
      return setNodeProperty(model, mutation.nodeId, mutation.property, mutation.value, origin);
    case "set-property-path":
      return setNodePropertyPath(
        model,
        mutation.nodeId,
        mutation.property,
        mutation.path,
        mutation.value,
        origin,
      );
    case "insert-node":
      return insertNode(model, mutation.node, mutation.parentId ?? null, mutation.position, origin);
    case "move-node":
      return moveNode(model, mutation.nodeId, mutation.parentId ?? null, mutation.position, origin);
    case "delete-node":
      return deleteNode(model, mutation.nodeId, origin);
    case "restore-node":
      return restoreNode(model, mutation.nodeId, origin);
    default:
      throw new Error(`Unsupported Canvas mutation: ${String(mutation?.kind)}`);
  }
}

export { Y };
