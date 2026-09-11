import assert from "node:assert/strict";
import test from "node:test";

import {
  SNAPSHOT_UPDATE_INTERVAL,
  shouldCompactSnapshot,
} from "./snapshot-policy.mjs";

test("Canvas editor and operation writes share one ten-update snapshot policy", () => {
  assert.equal(SNAPSHOT_UPDATE_INTERVAL, 10);
  assert.equal(shouldCompactSnapshot(7, 16), false);
  assert.equal(shouldCompactSnapshot(7, 17), true);
  assert.equal(shouldCompactSnapshot(7, 18), true);
});

test("snapshot policy rejects non-finite sequence inputs", () => {
  assert.equal(shouldCompactSnapshot(undefined, 10), true);
  assert.equal(shouldCompactSnapshot("bad", 10), false);
  assert.equal(shouldCompactSnapshot(0, Number.POSITIVE_INFINITY), false);
});
