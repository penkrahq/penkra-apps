import assert from "node:assert/strict";
import test from "node:test";

import { createDocumentCollectionLifecycle } from "./document-collection-lifecycle.mjs";

test("document collection subscribes before its authoritative initial load", async () => {
  const order = [];
  const lifecycle = createDocumentCollectionLifecycle({
    subscribe: async () => {
      order.push("subscribe");
      return () => order.push("unsubscribe");
    },
  });

  await lifecycle.start({
    load: async () => {
      order.push("load");
      return ["document"];
    },
    apply: (documents) => order.push(`apply:${documents.length}`),
  });

  assert.deepEqual(order, ["subscribe", "load", "apply:1"]);
  lifecycle.stop();
  assert.equal(order.at(-1), "unsubscribe");
});

test("lifecycle events during a load coalesce into one fresh result", async () => {
  let listener;
  let releaseFirst;
  let loads = 0;
  const applied = [];
  const lifecycle = createDocumentCollectionLifecycle({
    subscribe: async (next) => {
      listener = next;
      return () => undefined;
    },
  });
  const started = lifecycle.start({
    load: async () => {
      loads += 1;
      if (loads === 1) await new Promise((resolve) => { releaseFirst = resolve; });
      return [`load-${loads}`];
    },
    apply: (documents) => applied.push(documents),
  });
  await Promise.resolve();
  listener({ event: "projects:changed" });
  listener({ event: "projects:changed" });
  listener({ event: "presence" });
  releaseFirst();
  await started;

  assert.equal(loads, 2);
  assert.deepEqual(applied, [["load-2"]]);
});

test("stopping before subscription completion disposes it without loading", async () => {
  let resolveSubscription;
  let unsubscribed = false;
  let loaded = false;
  const lifecycle = createDocumentCollectionLifecycle({
    subscribe: () => new Promise((resolve) => { resolveSubscription = resolve; }),
  });
  const started = lifecycle.start({
    load: async () => {
      loaded = true;
      return [];
    },
    apply: () => undefined,
  });
  lifecycle.stop();
  resolveSubscription(() => { unsubscribed = true; });
  await started;

  assert.equal(unsubscribed, true);
  assert.equal(loaded, false);
});
