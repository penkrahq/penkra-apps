import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_TABLES,
  PAGE_PROFILE_DELTAS,
  assertAllCapabilityTables,
  capabilityTableFor,
  unverifiedCapabilityEntries,
} from "./capability-tables.mjs";

test("all static exporters ignore prototype flows by dated product decision", () => {
  const paths = ["root.flows", "relationships.flow", "properties.flow.advance", "properties.flow.hover", "properties.flow.keypress", "properties.flow.tap"];
  for (const [target, table] of Object.entries(CAPABILITY_TABLES)) {
    for (const path of paths) {
      assert.equal(table.properties[path].verdict, "ignore", `${target}:${path}`);
      assert.match(table.properties[path].reason, /Product decision 2026-09-04/u);
    }
  }
});

test("print profiles merge over one total page table", () => {
  for (const profile of ["none", "PDF/A-3", "PDF/UA-1", "PDF/X-4"]) {
    const table = capabilityTableFor("page", profile);
    assert.equal(table.profile, profile);
    assert.equal(Object.keys(table.properties).length, 143);
  }
  assert.equal(PAGE_PROFILE_DELTAS["PDF/A-3"].status, "verified");
  assert.equal(PAGE_PROFILE_DELTAS["PDF/UA-1"].status, "verified");
  assert.equal(PAGE_PROFILE_DELTAS["PDF/X-4"].status, "unverified");
  assert.throws(() => capabilityTableFor("page", "PDF/X-9"), { code: "CANVAS_PDF_PROFILE_UNKNOWN" });
});

test("aggregate capability gate includes the unverified PDF/X-4 profile", () => {
  const entries = unverifiedCapabilityEntries();
  assert.equal(entries.length, 104);
  assert.deepEqual(entries.find((entry) => entry.target === "page:PDF/X-4"), {
    target: "page:PDF/X-4", path: "profile", verdict: null,
  });
  assert.equal(entries.some((entry) => entry.path === "root.flows"), false);
  assert.equal(entries.some((entry) => entry.path === "relationships.flow"), false);
  assert.throws(() => assertAllCapabilityTables(), (error) => (
    error.code === "CANVAS_CAPABILITY_INCOMPLETE" && /page:PDF\/X-4: profile evidence is unverified/u.test(error.message)
  ));
});
