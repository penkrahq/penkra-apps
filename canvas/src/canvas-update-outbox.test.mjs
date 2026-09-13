import assert from "node:assert/strict";
import test from "node:test";

import { Y } from "./document-model.mjs";
import { canvasUpdateOutboxName, createCanvasUpdateOutbox } from "./canvas-update-outbox.mjs";

test("Canvas persists only identified unsent updates in its local outbox", () => {
  const doc = new Y.Doc();
  const outbox = createCanvasUpdateOutbox(doc);

  assert.equal(outbox.append({ clientUpdateId: "one", update: "AQ==" }), true);
  assert.equal(outbox.append({ clientUpdateId: "one", update: "AQ==" }), false);
  assert.deepEqual(outbox.list(), [{ clientUpdateId: "one", update: "AQ==" }]);

  doc.destroy();
});

test("Canvas removes acknowledged outbox updates without retaining document state", () => {
  const doc = new Y.Doc();
  const outbox = createCanvasUpdateOutbox(doc);
  outbox.append({ clientUpdateId: "one", update: "AQ==" });
  outbox.append({ clientUpdateId: "two", update: "Ag==" });

  assert.equal(outbox.remove("one"), true);
  assert.equal(outbox.remove("missing"), false);
  assert.deepEqual(outbox.list(), [{ clientUpdateId: "two", update: "Ag==" }]);

  doc.destroy();
});

test("Canvas outbox storage cannot collide with the retired full-document cache", () => {
  assert.equal(canvasUpdateOutboxName("document-id"), "penkra-canvas-update-outbox-v3:document-id");
});
