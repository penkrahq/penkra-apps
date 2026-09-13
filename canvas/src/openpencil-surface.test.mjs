import assert from "node:assert/strict";
import test from "node:test";

import { routeOpenPencilMutations } from "./openpencil-surface.mjs";

test("scene graph replacement cannot escape as authored Canvas mutations", () => {
  const forwarded = [];
  const result = routeOpenPencilMutations([{ kind: "delete-node", nodeId: "screen" }], {
    refreshingDocument: true,
    onMutations: (mutations) => forwarded.push(...mutations),
  });

  assert.equal(result, false);
  assert.deepEqual(forwarded, []);
});

test("background scene events cannot escape as authored Canvas mutations", () => {
  const forwarded = [];
  const result = routeOpenPencilMutations([{ kind: "delete-node", nodeId: "screen" }], {
    onMutations: (mutations) => forwarded.push(...mutations),
  });

  assert.equal(result, false);
  assert.deepEqual(forwarded, []);
});

test("user authoring events and explicit history replay still route mutations", () => {
  const mutation = { kind: "set-property", nodeId: "screen", property: "x", value: 24 };
  const forwarded = [];
  const historyMutations = [];

  assert.equal(
    routeOpenPencilMutations([mutation], {
      authoringEvent: true,
      onMutations: (mutations) => forwarded.push(...mutations),
    }),
    true,
  );
  assert.equal(routeOpenPencilMutations([mutation], { historyMutations }), true);
  assert.deepEqual(forwarded, [mutation]);
  assert.deepEqual(historyMutations, [mutation]);
});
