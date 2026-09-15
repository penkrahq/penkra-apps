import assert from "node:assert/strict";
import test from "node:test";

import { createVisibleDocumentRestore } from "./visible-document-restore.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

test("retained documents do not hydrate until their tab becomes visible", async () => {
  const calls = [];
  const opened = deferred();
  const restore = createVisibleDocumentRestore({
    openDocument: async (documentId) => {
      calls.push(`open:${documentId}`);
      opened.resolve();
    },
    onQueued: (documentId) => calls.push(`queue:${documentId}`),
    onError: (error) => assert.fail(error),
  });

  restore.restore("document-1");
  assert.deepEqual(calls, ["queue:document-1"]);

  restore.setActive(true);
  await opened.promise;
  assert.deepEqual(calls, ["queue:document-1", "open:document-1"]);
});

test("only the latest hidden document request is restored", async () => {
  const calls = [];
  const opened = deferred();
  const restore = createVisibleDocumentRestore({
    openDocument: async (documentId) => {
      calls.push(documentId);
      opened.resolve();
    },
    onQueued: () => undefined,
    onError: (error) => assert.fail(error),
  });

  restore.restore("document-1");
  restore.restore("document-2");
  restore.setActive(true);
  await opened.promise;

  assert.deepEqual(calls, ["document-2"]);
});

test("visible restores stay serialized", async () => {
  const calls = [];
  const first = deferred();
  const second = deferred();
  const restore = createVisibleDocumentRestore({
    openDocument: async (documentId) => {
      calls.push(documentId);
      if (documentId === "document-1") await first.promise;
      else second.resolve();
    },
    onQueued: () => undefined,
    onError: (error) => assert.fail(error),
  });

  restore.setActive(true);
  restore.restore("document-1");
  restore.restore("document-2");
  assert.deepEqual(calls, ["document-1"]);

  first.resolve();
  await second.promise;
  assert.deepEqual(calls, ["document-1", "document-2"]);
});

test("a newer visible restore makes the in-flight open stale before it can commit", async () => {
  const calls = [];
  const first = deferred();
  const second = deferred();
  let firstIsCurrent;
  const restore = createVisibleDocumentRestore({
    openDocument: async (documentId, isCurrent) => {
      calls.push(documentId);
      if (documentId === "document-1") {
        firstIsCurrent = isCurrent;
        await first.promise;
      } else {
        assert.equal(isCurrent(), true);
        second.resolve();
      }
    },
    onQueued: () => undefined,
    onError: (error) => assert.fail(error),
  });

  restore.setActive(true);
  restore.restore("document-1");
  assert.equal(firstIsCurrent(), true);

  restore.restore("document-2");
  assert.equal(firstIsCurrent(), false);

  first.resolve();
  await second.promise;
  assert.deepEqual(calls, ["document-1", "document-2"]);
});
