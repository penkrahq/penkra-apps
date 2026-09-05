import assert from "node:assert/strict";
import test from "node:test";

import {
  PAGE_PROFILE_DELTAS,
  assertAllCapabilityTables,
  capabilityTableFor,
  unverifiedCapabilityEntries,
} from "./capability-tables.mjs";

test("print profiles merge over one total page table", () => {
  for (const profile of ["none", "PDF/A-3", "PDF/UA-1", "PDF/X-4"]) {
    const table = capabilityTableFor("page", profile);
    assert.equal(table.profile, profile);
    assert.equal(Object.keys(table.properties).length, 142);
  }
  assert.equal(PAGE_PROFILE_DELTAS["PDF/A-3"].status, "verified");
  assert.equal(PAGE_PROFILE_DELTAS["PDF/UA-1"].status, "verified");
  assert.equal(PAGE_PROFILE_DELTAS["PDF/X-4"].status, "unverified");
  assert.throws(() => capabilityTableFor("page", "PDF/X-9"), { code: "CANVAS_PDF_PROFILE_UNKNOWN" });
});

test("aggregate capability gate includes the unverified PDF/X-4 profile", () => {
  const entries = unverifiedCapabilityEntries();
  assert.equal(entries.length, 121);
  assert.deepEqual(entries.find((entry) => entry.target === "page:PDF/X-4"), {
    target: "page:PDF/X-4", path: "profile", verdict: null,
  });
  assert.throws(() => assertAllCapabilityTables(), (error) => (
    error.code === "CANVAS_CAPABILITY_INCOMPLETE" && /page:PDF\/X-4: profile evidence is unverified/u.test(error.message)
  ));
});
