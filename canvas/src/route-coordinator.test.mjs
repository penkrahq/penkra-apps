import assert from "node:assert/strict";
import test from "node:test";

import { createRouteCoordinator } from "./route-coordinator.mjs";

function deferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function fixture({ blockLibrary = false } = {}) {
  const calls = [];
  const library = deferred();
  let openDocumentId = null;
  const router = createRouteCoordinator({
    isDocumentOpen: (documentId) => openDocumentId === documentId,
    openDocument: async (documentId) => {
      calls.push(`document:${documentId}`);
      openDocumentId = documentId;
    },
    setRoute: async (route) => calls.push({ route }),
    showDocumentUnavailable: async (input) => {
      calls.push({ unavailable: input });
      openDocumentId = null;
    },
    showLibrary: async () => {
      calls.push("library");
      openDocumentId = null;
      if (blockLibrary) await library.promise;
    },
  });
  return { calls, library, router };
}

test("restored document wins when host navigation arrives before bootstrap", async () => {
  const current = fixture();

  await current.router.handleHostNavigation({
    route: "/document",
    state: { documentId: "doc-1" },
  });
  await current.router.showDefaultLibrary();

  assert.deepEqual(current.calls, ["document:doc-1"]);
});

test("restored document waits for an in-flight bootstrap and still wins", async () => {
  const current = fixture({ blockLibrary: true });
  const bootstrap = current.router.showDefaultLibrary();
  const restoration = current.router.handleHostNavigation({
    route: "/document",
    state: { documentId: "doc-1" },
  });

  await Promise.resolve();
  assert.deepEqual(current.calls, ["library"]);
  current.library.resolve();
  await Promise.all([bootstrap, restoration]);

  assert.deepEqual(current.calls, ["library", "document:doc-1"]);
});

test("document restoration survives several consecutive renderer updates", async () => {
  for (let update = 1; update <= 6; update += 1) {
    const current = fixture({ blockLibrary: update % 2 === 0 });
    const navigation = {
      route: "/document",
      state: { documentId: "doc-1" },
    };

    if (update % 2 === 0) {
      const bootstrap = current.router.showDefaultLibrary();
      const restoration = current.router.handleHostNavigation(navigation);
      await Promise.resolve();
      current.library.resolve();
      await Promise.all([bootstrap, restoration]);
    } else {
      await current.router.handleHostNavigation(navigation);
      await current.router.showDefaultLibrary();
    }

    assert.equal(current.calls.at(-1), "document:doc-1", `update ${update}`);
  }
});

test("App-originated navigation records only a successfully opened document", async () => {
  const current = fixture();

  await current.router.navigateToDocument("doc-1");
  await current.router.navigateToLibrary();

  assert.deepEqual(current.calls, [
    "document:doc-1",
    { route: { route: "/document", state: { documentId: "doc-1" } } },
    "library",
    { route: { route: "/" } },
  ]);
});

test("deleted-document replacement state is explicit and restorable", async () => {
  const current = fixture();
  const unavailable = { documentId: "doc-1", reason: "deleted", title: "Draft" };

  await current.router.navigateToDocumentUnavailable(unavailable);
  await current.router.handleHostNavigation({ route: "/document-unavailable", state: unavailable });

  assert.deepEqual(current.calls, [
    { unavailable },
    { route: { route: "/document-unavailable", state: unavailable } },
    { unavailable },
  ]);
});
