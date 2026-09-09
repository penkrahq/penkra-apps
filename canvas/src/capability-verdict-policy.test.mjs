import test from "node:test";
import assert from "node:assert/strict";
import { CAPABILITY_TABLES, extractionEmissionSupport } from "./capability-tables.mjs";

const IMPLEMENTATION_DEBT = /\b(?:current (?:[^.]* )?writer|no measured|unverified|does not have a complete passing|has not (?:yet )?passed)\b/iu;

test("capability verdicts distinguish target limits from implementation and evidence debt", () => {
  const tables = {
    ...CAPABILITY_TABLES,
    pdf: extractionEmissionSupport("pdf"),
    svg: extractionEmissionSupport("svg"),
  };

  for (const [format, table] of Object.entries(tables)) {
    for (const [path, entry] of Object.entries(table.properties)) {
      assert.notEqual(entry.status, "unverified", `${format}:${path} remains unverified`);
      assert.ok(["native", "raster", "ignore"].includes(entry.verdict), `${format}:${path} has no closed verdict`);
      if (entry.verdict === "native") {
        assert.equal(typeof entry.evidence, "string", `${format}:${path} native evidence is missing`);
        assert.ok(entry.evidence.trim().length > 0, `${format}:${path} native evidence is empty`);
      } else {
        assert.equal(typeof entry.reason, "string", `${format}:${path} ${entry.verdict} reason is missing`);
        assert.ok(entry.reason.trim().length > 0, `${format}:${path} ${entry.verdict} reason is empty`);
        assert.doesNotMatch(entry.reason, IMPLEMENTATION_DEBT, `${format}:${path} misclassifies implementation or evidence debt as ${entry.verdict}`);
      }
    }
  }
});
