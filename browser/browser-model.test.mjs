import assert from "node:assert/strict";
import test from "node:test";
import { displayAddress, normalizeAddress } from "./browser-model.mjs";

test("normalizes URLs and searches", () => {
  assert.equal(normalizeAddress("penkra.com"), "https://penkra.com");
  assert.equal(normalizeAddress("https://example.com/a"), "https://example.com/a");
  assert.equal(normalizeAddress("find this"), "https://www.google.com/search?q=find%20this");
});

test("represents blank pages without leaking about:blank into the address", () => {
  assert.equal(displayAddress("about:blank"), "");
});
